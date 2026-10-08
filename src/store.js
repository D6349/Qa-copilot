/**
 * store.js - flat JSON file storage.
 *
 * Deliberately not SQLite: no native build step, no migrations, and the whole
 * database is a folder you can zip, email or commit. Fine up to ~50k cases.
 *
 * Layout:
 *   data/projects.json          all projects + their pages + environments
 *   data/cases/<projectId>.json all test cases for that project
 *   data/models/<pageId>.json   page model history (array, newest last)
 *   data/plans/<projectId>.md   the test plan
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

for (const d of ['', 'cases', 'models', 'plans', 'runs']) {
  fs.mkdirSync(path.join(DATA, d), { recursive: true });
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file); // atomic-ish, survives a crash mid-write
}

export const dataDir = () => DATA;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- projects */

const projectsFile = () => path.join(DATA, 'projects.json');

export function listProjects() {
  return readJSON(projectsFile(), []);
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id) || null;
}

export function saveProject(project) {
  const all = listProjects();
  const i = all.findIndex((p) => p.id === project.id);
  project.updatedAt = new Date().toISOString();
  if (i === -1) all.push(project);
  else all[i] = project;
  writeJSON(projectsFile(), all);
  return project;
}

export function createProject({ name, product = '', description = '', environments = {} }) {
  return saveProject({
    id: newId('proj'),
    name,
    product,
    description,
    environments: {
      dev: environments.dev || '',
      uat: environments.uat || '',
      prod: environments.prod || '',
    },
    defaults: {
      pageOwner: process.env.DEFAULT_PAGE_OWNER || '',
      createdBy: process.env.DEFAULT_CREATED_BY || '',
      aggressiveness: 'standard', // lean | standard | exhaustive
    },
    pages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function deleteProject(id) {
  writeJSON(projectsFile(), listProjects().filter((p) => p.id !== id));
  for (const f of [
    path.join(DATA, 'cases', `${id}.json`),
    path.join(DATA, 'plans', `${id}.md`),
  ]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
}

export function addPage(projectId, { url, module = '', name = '' }) {
  const project = getProject(projectId);
  if (!project) throw new Error('project not found');
  const page = {
    id: newId('page'),
    url,
    name: name || derivePageName(url),
    module: module || deriveModule(url),
    requirements: '',
    lastScannedAt: null,
    createdAt: new Date().toISOString(),
  };
  project.pages.push(page);
  saveProject(project);
  return page;
}

export function updatePage(projectId, pageId, patch) {
  const project = getProject(projectId);
  const page = project?.pages.find((p) => p.id === pageId);
  if (!page) throw new Error('page not found');
  Object.assign(page, patch);
  saveProject(project);
  return page;
}

export function deletePage(projectId, pageId) {
  const project = getProject(projectId);
  if (!project) return;
  project.pages = project.pages.filter((p) => p.id !== pageId);
  saveProject(project);
  saveCases(projectId, listCases(projectId).filter((c) => c.pageId !== pageId));
  try { fs.unlinkSync(path.join(DATA, 'models', `${pageId}.json`)); } catch { /* noop */ }
}

function derivePageName(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? last.replace(/[-_]/g, ' ') : u.hostname;
  } catch {
    return url;
  }
}

function deriveModule(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? seg.replace(/[-_]/g, ' ').toUpperCase() : 'GENERAL';
  } catch {
    return 'GENERAL';
  }
}

/* ------------------------------------------------------------- page models */

export function saveModel(pageId, model) {
  const file = path.join(DATA, 'models', `${pageId}.json`);
  const history = readJSON(file, []);
  history.push(model);
  writeJSON(file, history.slice(-10)); // keep last 10 scans for diffing
  return model;
}

export function getModel(pageId) {
  const history = readJSON(path.join(DATA, 'models', `${pageId}.json`), []);
  return history.length ? history[history.length - 1] : null;
}

export function getModelHistory(pageId) {
  return readJSON(path.join(DATA, 'models', `${pageId}.json`), []);
}

/* ------------------------------------------------------------- test cases */

export function listCases(projectId) {
  return readJSON(path.join(DATA, 'cases', `${projectId}.json`), []);
}

export function saveCases(projectId, cases) {
  writeJSON(path.join(DATA, 'cases', `${projectId}.json`), cases);
  return cases;
}

/**
 * Merge new cases in, skipping anything with a dedupeKey we already hold.
 * Returns { added, skipped } so the UI can show an honest import summary.
 */
export function mergeCases(projectId, incoming) {
  const existing = listCases(projectId);
  const seen = new Set(existing.map((c) => c.dedupeKey).filter(Boolean));
  const added = [];
  const skipped = [];
  for (const c of incoming) {
    if (c.dedupeKey && seen.has(c.dedupeKey)) { skipped.push(c); continue; }
    if (c.dedupeKey) seen.add(c.dedupeKey);
    added.push(c);
  }
  saveCases(projectId, [...existing, ...added]);
  return { added, skipped };
}

export function updateCase(projectId, caseId, patch) {
  const cases = listCases(projectId);
  const c = cases.find((x) => x.id === caseId);
  if (!c) throw new Error('case not found');
  if (!c.history) c.history = [];
  c.history.push({ at: new Date().toISOString(), snapshot: { ...c, history: undefined } });
  c.history = c.history.slice(-5);
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  saveCases(projectId, cases);
  return c;
}

export function deleteCases(projectId, ids) {
  const keep = listCases(projectId).filter((c) => !ids.includes(c.id));
  saveCases(projectId, keep);
  return keep.length;
}

/* ------------------------------------------------------------------ plans */

export function savePlan(projectId, markdown) {
  fs.writeFileSync(path.join(DATA, 'plans', `${projectId}.md`), markdown);
}

export function getPlan(projectId) {
  try {
    return fs.readFileSync(path.join(DATA, 'plans', `${projectId}.md`), 'utf8');
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- runs */

export function saveRun(projectId, run) {
  const file = path.join(DATA, 'runs', `${projectId}.json`);
  const runs = readJSON(file, []);
  runs.push(run);
  writeJSON(file, runs.slice(-25));
  return run;
}

export function listRuns(projectId) {
  return readJSON(path.join(DATA, 'runs', `${projectId}.json`), []);
}
