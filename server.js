/**
 * QA Copilot server.
 *
 * Runs locally with `npm start`, or anywhere that runs Node. No API keys.
 * Everything lives in ./data as plain JSON, so the whole database is a folder.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './src/store.js';
import { inspect, inspectHtml, diffModels, playwrightAvailable } from './src/inspector.js';
import { generate, FAMILIES, ALL_FAMILIES } from './src/rules/index.js';
import { buildPrompt, validateImport } from './src/handoff.js';
import { buildPlan, buildSummaryReport } from './src/testPlan.js';
import { toExcel, toCsv, toJiraCsv, toMarkdown } from './src/exporters/index.js';
import { generateSuite } from './src/codegen/playwright.js';
import { createZip } from './src/zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4100;
const HOST = process.env.HOST || '0.0.0.0';
const WORKSPACE = process.env.WORKSPACE_DIR
  ? path.resolve(process.env.WORKSPACE_DIR)
  : path.join(__dirname, 'workspace');

fs.mkdirSync(path.join(WORKSPACE, 'inbox'), { recursive: true });
fs.mkdirSync(path.join(WORKSPACE, 'outbox'), { recursive: true });

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ok = (res, data) => res.json({ ok: true, ...data });
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  });
};

/* ----------------------------------------------------------------- meta */

app.get('/api/health', wrap(async (_req, res) => ok(res, {
  version: '1.0.0',
  playwright: await playwrightAvailable(),
  dataDir: store.dataDir(),
  workspace: WORKSPACE,
  families: FAMILIES,
})));

/* ------------------------------------------------------------- projects */

app.get('/api/projects', wrap((_req, res) => ok(res, { projects: store.listProjects() })));

app.post('/api/projects', wrap((req, res) => {
  if (!req.body.name) throw new Error('Project name is required');
  return ok(res, { project: store.createProject(req.body) });
}));

app.get('/api/projects/:id', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const cases = store.listCases(project.id);
  const models = {};
  for (const p of project.pages) models[p.id] = store.getModel(p.id);
  return ok(res, { project, cases, models, runs: store.listRuns(project.id) });
}));

app.patch('/api/projects/:id', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  Object.assign(project, req.body, { id: project.id, pages: project.pages });
  return ok(res, { project: store.saveProject(project) });
}));

app.delete('/api/projects/:id', wrap((req, res) => {
  store.deleteProject(req.params.id);
  return ok(res, {});
}));

/* ---------------------------------------------------------------- pages */

app.post('/api/projects/:id/pages', wrap((req, res) => {
  const urls = String(req.body.urls || req.body.url || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (!urls.length) throw new Error('Paste at least one URL');
  const pages = urls.map((url) => {
    try { new URL(url); } catch { throw new Error(`Not a valid URL: ${url}`); }
    return store.addPage(req.params.id, { url, module: req.body.module });
  });
  return ok(res, { pages, project: store.getProject(req.params.id) });
}));

app.patch('/api/projects/:id/pages/:pageId', wrap((req, res) => ok(res, {
  page: store.updatePage(req.params.id, req.params.pageId, req.body),
})));

app.delete('/api/projects/:id/pages/:pageId', wrap((req, res) => {
  store.deletePage(req.params.id, req.params.pageId);
  return ok(res, { project: store.getProject(req.params.id) });
}));

/* --------------------------------------------------------------- scanning */

app.post('/api/projects/:id/pages/:pageId/scan', wrap(async (req, res) => {
  const project = store.getProject(req.params.id);
  const page = project?.pages.find((p) => p.id === req.params.pageId);
  if (!page) throw new Error('Page not found');

  const previous = store.getModel(page.id);
  const model = req.body.html
    ? inspectHtml(req.body.html, page.url)
    : await inspect(page.url, {
      engine: req.body.engine,
      headers: req.body.headers || {},
      storageStatePath: req.body.storageStatePath
        || (fs.existsSync(path.join(WORKSPACE, 'storageState.json'))
          ? path.join(WORKSPACE, 'storageState.json') : null),
    });

  store.saveModel(page.id, model);
  store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });

  return ok(res, { model, diff: diffModels(previous, model) });
}));

/* ------------------------------------------------------------ generation */

app.post('/api/projects/:id/pages/:pageId/generate', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  const page = project?.pages.find((p) => p.id === req.params.pageId);
  if (!page) throw new Error('Page not found');
  const model = store.getModel(page.id);
  if (!model) throw new Error('Scan the page before generating cases');

  const { cases, coverage } = generate({
    project,
    page,
    model,
    families: req.body.families?.length ? req.body.families : ALL_FAMILIES,
    aggressiveness: req.body.aggressiveness || project.defaults?.aggressiveness || 'standard',
  });

  if (req.body.replace) {
    const kept = store.listCases(project.id)
      .filter((c) => !(c.pageId === page.id && c.source === 'rules'));
    store.saveCases(project.id, kept);
  }

  const { added, skipped } = store.mergeCases(project.id, cases);
  return ok(res, {
    coverage,
    added: added.length,
    skipped: skipped.length,
    cases: store.listCases(project.id),
  });
}));

/* ------------------------------------------------------------ Codex flow */

app.post('/api/projects/:id/pages/:pageId/prompt', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  const page = project?.pages.find((p) => p.id === req.params.pageId);
  if (!page) throw new Error('Page not found');
  const model = store.getModel(page.id);
  if (!model) throw new Error('Scan the page first — the prompt is built from the page model');

  const prompt = buildPrompt({
    project,
    page,
    model,
    existingTitles: store.listCases(project.id)
      .filter((c) => c.pageId === page.id).map((c) => c.title),
    focus: req.body.focus || '',
  });

  const file = path.join(WORKSPACE, 'inbox', `${page.id}.prompt.md`);
  fs.writeFileSync(file, prompt);
  return ok(res, { prompt, file, outboxFile: path.join(WORKSPACE, 'outbox', `${page.id}.cases.json`) });
}));

app.post('/api/projects/:id/pages/:pageId/import', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  const page = project?.pages.find((p) => p.id === req.params.pageId);
  if (!page) throw new Error('Page not found');

  let raw = req.body.json;
  if (!raw) {
    const file = path.join(WORKSPACE, 'outbox', `${page.id}.cases.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Nothing pasted, and no file at ${file}`);
    }
    raw = fs.readFileSync(file, 'utf8');
  }

  const { cases, errors } = validateImport(raw, { project, page });
  const { added, skipped } = store.mergeCases(project.id, cases);
  return ok(res, {
    added: added.length,
    skipped: skipped.length,
    errors,
    cases: store.listCases(project.id),
  });
}));

/* ------------------------------------------------------------ case edits */

app.patch('/api/projects/:id/cases/:caseId', wrap((req, res) => ok(res, {
  case: store.updateCase(req.params.id, req.params.caseId, req.body),
})));

app.post('/api/projects/:id/cases/bulk', wrap((req, res) => {
  const { ids = [], patch = {}, action } = req.body;
  if (action === 'delete') {
    store.deleteCases(req.params.id, ids);
  } else {
    for (const id of ids) store.updateCase(req.params.id, id, patch);
  }
  return ok(res, { cases: store.listCases(req.params.id) });
}));

app.post('/api/projects/:id/cases', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const page = project.pages.find((p) => p.id === req.body.pageId) || project.pages[0];
  const { cases, errors } = validateImport([req.body], { project, page: page || { id: 'manual', module: 'GENERAL', url: '' } });
  if (errors.length) throw new Error(errors[0].message);
  cases[0].source = 'manual';
  cases[0].ruleId = 'manual';
  const { added } = store.mergeCases(project.id, cases);
  return ok(res, { added: added.length, cases: store.listCases(project.id) });
}));

/* ----------------------------------------------------------------- plan */

app.post('/api/projects/:id/plan', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const cases = store.listCases(project.id);
  const models = {};
  for (const p of project.pages) models[p.id] = store.getModel(p.id);
  const markdown = req.body.markdown ?? buildPlan({ project, cases, models });
  store.savePlan(project.id, markdown);
  return ok(res, { plan: markdown });
}));

app.get('/api/projects/:id/plan', wrap((req, res) => ok(res, {
  plan: store.getPlan(req.params.id),
})));

app.get('/api/projects/:id/summary', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  return ok(res, { summary: buildSummaryReport({ project, cases: store.listCases(project.id) }) });
}));

/* --------------------------------------------------------------- export */

function filterCases(all, q) {
  let out = all;
  if (q.ids) out = out.filter((c) => String(q.ids).split(',').includes(c.id));
  if (q.pageId) out = out.filter((c) => c.pageId === q.pageId);
  if (q.category) out = out.filter((c) => c.category === q.category);
  if (q.priority) out = out.filter((c) => c.priority === q.priority);
  if (q.type) out = out.filter((c) => c.type === q.type);
  if (q.module) out = out.filter((c) => c.module === q.module);
  if (q.smoke === 'true') out = out.filter((c) => c.isSmoke);
  return out;
}

app.get('/api/projects/:id/export/:format', wrap(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const cases = filterCases(store.listCases(project.id), req.query);
  const safe = project.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  switch (req.params.format) {
    case 'xlsx': {
      const buf = await toExcel({ project, cases });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-testcases-${stamp}.xlsx"`);
      return res.send(Buffer.from(buf));
    }
    case 'csv':
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-testcases-${stamp}.csv"`);
      return res.send(toCsv(cases));
    case 'jira':
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-jira-${stamp}.csv"`);
      return res.send(toJiraCsv(cases, { project: project.name }));
    case 'md':
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-testcases-${stamp}.md"`);
      return res.send(toMarkdown({ project, cases }));
    case 'plan': {
      const models = {};
      for (const p of project.pages) models[p.id] = store.getModel(p.id);
      const plan = store.getPlan(project.id) || buildPlan({ project, cases, models });
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-testplan-${stamp}.md"`);
      return res.send(plan);
    }
    case 'json':
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-backup-${stamp}.json"`);
      return res.send(JSON.stringify({
        project,
        cases: store.listCases(project.id),
        models: Object.fromEntries(project.pages.map((p) => [p.id, store.getModel(p.id)])),
        plan: store.getPlan(project.id),
        exportedAt: new Date().toISOString(),
      }, null, 2));
    default:
      throw new Error(`Unknown export format: ${req.params.format}`);
  }
}));

app.post('/api/import/project', wrap((req, res) => {
  const { project, cases = [], models = {}, plan } = req.body;
  if (!project?.name) throw new Error('Not a QA Copilot backup file');
  const fresh = store.createProject(project);
  const idMap = {};
  for (const p of project.pages || []) {
    const np = store.addPage(fresh.id, p);
    idMap[p.id] = np.id;
    if (models[p.id]) store.saveModel(np.id, models[p.id]);
  }
  store.saveCases(fresh.id, cases.map((c) => ({
    ...c, projectId: fresh.id, pageId: idMap[c.pageId] || c.pageId,
  })));
  if (plan) store.savePlan(fresh.id, plan);
  return ok(res, { project: store.getProject(fresh.id) });
}));

/* -------------------------------------------------------------- codegen */

app.post('/api/projects/:id/codegen', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const all = store.listCases(project.id);
  const cases = req.body.ids?.length ? all.filter((c) => req.body.ids.includes(c.id)) : all;
  const models = {};
  for (const p of project.pages) models[p.id] = store.getModel(p.id);

  const files = generateSuite({ project, pages: project.pages, cases, models });

  const outDir = path.join(WORKSPACE, 'generated', project.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase());
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  return ok(res, { files: Object.keys(files), outDir, caseCount: cases.length });
}));

app.get('/api/projects/:id/codegen.zip', wrap((req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) throw new Error('Project not found');
  const cases = store.listCases(project.id);
  const models = {};
  for (const p of project.pages) models[p.id] = store.getModel(p.id);
  const files = generateSuite({ project, pages: project.pages, cases, models });
  const safe = project.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}-playwright-suite.zip"`);
  return res.send(createZip(files));
}));

/* ---------------------------------------------------------------- start */

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Unknown endpoint' });
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, async () => {
    const pw = await playwrightAvailable();
    console.log('');
    console.log('  QA Copilot');
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  data:      ${store.dataDir()}`);
    console.log(`  workspace: ${WORKSPACE}`);
    console.log(`  scanner:   ${pw ? 'Playwright (full render)' : 'static fetch — run "npm run browsers" for JS-rendered pages'}`);
    console.log('');
  });
}

export default app;
