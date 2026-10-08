#!/usr/bin/env node
/**
 * QA Copilot CLI — everything the web UI does, driveable from a terminal.
 *
 * Built for agent use: every command prints JSON to stdout (unless --pretty),
 * human messages go to stderr, and the exit code is 0 or 1. So an agent can
 * pipe, parse and branch without scraping prose.
 *
 *   node cli.js help
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './src/store.js';
import { inspect, inspectHtml, diffModels, playwrightAvailable } from './src/inspector.js';
import { generate, FAMILIES, ALL_FAMILIES } from './src/rules/index.js';
import { buildPrompt, buildJourneyPrompt, validateImport } from './src/handoff.js';
import { buildPlan, buildSummaryReport } from './src/testPlan.js';
import { toExcel, toCsv, toJiraCsv, toMarkdown } from './src/exporters/index.js';
import { generateSuite } from './src/codegen/playwright.js';
import {
  loginAuto, loginManual, loginFromCookies, verifySession, sessionInfo, authPath,
} from './src/auth.js';
import { runCases, isExecutable, executableRules } from './src/runner.js';
import {
  safeSlug, deliveryStamp, deliveryLayout, normalizeUrls, classifyPageModel, surfaceInventory,
  compareDeliveryPages, renderSimpleDeliveryMarkdown, renderSimpleDeliveryHtml, renderPdf,
} from './src/delivery.js';
import { writeAllureResults, generateAllureReport } from './src/allure.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.WORKSPACE_DIR || path.join(ROOT, 'workspace');

/* ------------------------------------------------------------ arg parsing */

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
const positional = [];
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const equalsAt = a.indexOf('=');
    const k = a.slice(2, equalsAt > -1 ? equalsAt : undefined);
    const v = equalsAt > -1 ? a.slice(equalsAt + 1)
      : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    flags[k] = k in flags ? (Array.isArray(flags[k]) ? [...flags[k], v] : [flags[k], v]) : v;
  } else positional.push(a);
}

const say = (...m) => console.error(...m);
const out = (obj) => console.log(JSON.stringify(obj, null, flags.pretty ? 2 : 0));
const die = (msg, hint) => {
  say(`\n  ✗ ${msg}`);
  if (hint) say(`    ${hint}`);
  say('');
  process.exit(1);
};

const flagValues = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const lastFlag = (name, fallback = undefined) => flagValues(flags[name]).at(-1) ?? fallback;

function requestHeaders() {
  return Object.fromEntries(flagValues(flags.header).map((header) => {
    const text = String(header);
    const i = text.indexOf(':');
    if (i < 1) die(`Invalid --header value: ${text}`, 'Use --header Name:value. Repeat the flag for multiple headers.');
    return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }));
}

/* ------------------------------------------------------------- resolution */

/** Accept an id, a name, or a URL fragment — agents should not have to guess ids. */
function findProject(ref) {
  const all = store.listProjects();
  if (!ref) {
    if (all.length === 1) return all[0];
    die('Several projects exist — name one.', `Try: ${all.map((p) => `"${p.name}"`).join(', ')}`);
  }
  const hit = all.find((p) => p.id === ref)
    || all.find((p) => p.name.toLowerCase() === String(ref).toLowerCase())
    || all.find((p) => p.name.toLowerCase().includes(String(ref).toLowerCase()));
  if (!hit) die(`No project matching "${ref}".`, `Known: ${all.map((p) => p.name).join(', ') || '(none — run "new")'}`);
  return hit;
}

function findPage(project, ref) {
  const pages = project.pages || [];
  if (!ref) {
    if (pages.length === 1) return pages[0];
    die('Several pages exist — name one.', `Try: ${pages.map((p) => p.name).join(', ')}`);
  }
  const hit = pages.find((p) => p.id === ref)
    || pages.find((p) => p.url === ref)
    || pages.find((p) => p.name.toLowerCase() === String(ref).toLowerCase())
    || pages.find((p) => p.url.includes(ref) || p.name.toLowerCase().includes(String(ref).toLowerCase()));
  if (!hit) die(`No page matching "${ref}".`, `Known: ${pages.map((p) => `${p.name} (${p.url})`).join(', ') || '(none)'}`);
  return hit;
}

const scanOpts = (projectId) => ({
  engine: flags.static ? 'static' : undefined,
  insecure: !!flags.insecure,
  headers: requestHeaders(),
  storageStatePath: lastFlag('auth')
    || (fs.existsSync(authPath(WORKSPACE, projectId)) ? authPath(WORKSPACE, projectId) : null)
    || (fs.existsSync(path.join(WORKSPACE, 'storageState.json'))
      ? path.join(WORKSPACE, 'storageState.json') : null),
});

/* ----------------------------------------------------------- the commands */

const commands = {

  async help() {
    say(`
  QA Copilot CLI

  SETUP
    new <name> [--dev URL] [--uat URL] [--prod URL] [--owner GID] [--creator GID]
    projects                                    list projects
    add <project> <url> [url...] [--module M]   add page(s)

  LOGIN (do this first for anything behind a sign-in)
    login <project> --url <loginUrl> --manual       open a browser, log in by hand
    login <project> --url <loginUrl> --user U --pass P
    login <project> --cookies "a=1; b=2" --domain example.com
    session <project> [url]                         is the saved login still valid?

  MANY PAGES AT ONCE
    sweep <project> <url...> [--file urls.txt] [--all] [--module M]
      scans and generates for every URL, then prints a per-page yield table
      so you can see which pages came back thin and need a journey prompt

  SCAN AND GENERATE
    scan <project> <page> [--insecure] [--static] [--auth file] [--header "K: V"]
    scan <project> <page> --html <file>         build the model from saved HTML
    model <project> <page>                      print the page model as JSON
    fields <project> <page>                     compact field table
    diff <project> <page>                       what changed since the previous scan
    generate <project> <page> [--families a,b] [--level lean|standard|exhaustive] [--keep]

  THE CODEX LOOP
    journey <project> <page> <page> [page...] [--focus "..."] [--print]
      end-to-end cases spanning several pages — the thing rules cannot derive
    prompt <project> <page> [--focus "..."] [--out file]
    import <project> <page> <file|->            merge a JSON array of cases

  EXECUTE
    run <project> <page> [--smoke] [--category C] [--headed] [--all]
    executable                                  rule ids that can run automatically

  READ AND SHIP
    cases <project> [--page P] [--category C] [--priority P1] [--smoke] [--full]
    coverage <project>
    plan <project> [--out file]
    summary <project>
    export <project> <xlsx|csv|jira|md|json|plan> [--out file]
    codegen <project> [--out dir]

  URL-ONLY DELIVERY (recommended for repeated work)
    deliver <url...> [--file urls.txt] [--name N] [--module M] [--insecure]
      one reusable pipeline with one reader-facing QA-Report.pdf: clear verdict,
      priority fixes, cross-page differences, screenshots, coverage, and Allure
    Options: --viewports names --themes light,dark --auth file --header K:V
             --config file --mask selector --ignore selector --no-uiux --no-pdf
             --codegen --level lean|standard|exhaustive --out directory

  ONE-SHOT
    quick <url> [--name N] [--module M] [--insecure] [--level L]
      creates a project, adds the page, scans it and generates cases

  GLOBAL FLAGS
    --pretty        indent the JSON output
    --insecure      accept self-signed / unverifiable TLS certificates
    --static        skip the browser even if it is installed

  Output is JSON on stdout, messages on stderr, exit code 0 or 1.
`);
  },

  async projects() {
    out(store.listProjects().map((p) => ({
      id: p.id,
      name: p.name,
      pages: p.pages.length,
      cases: store.listCases(p.id).length,
      environments: p.environments,
    })));
  },

  async new() {
    const name = positional[0] || flags.name;
    if (!name) die('A project name is required.', 'node cli.js new "June Platform" --dev https://junedev.ledgers.cloud');
    const p = store.createProject({
      name,
      product: flags.product || '',
      description: flags.description || '',
      environments: { dev: flags.dev || '', uat: flags.uat || '', prod: flags.prod || '' },
    });
    if (flags.owner || flags.creator) {
      p.defaults.pageOwner = flags.owner || '';
      p.defaults.createdBy = flags.creator || '';
      store.saveProject(p);
    }
    say(`  ✓ Created project "${p.name}"`);
    out({ id: p.id, name: p.name });
  },

  async add() {
    const project = findProject(positional[0]);
    const urls = positional.slice(1);
    if (!urls.length) die('Give at least one URL.');
    const pages = urls.map((url) => {
      try { new URL(url); } catch { die(`Not a valid URL: ${url}`); }
      return store.addPage(project.id, { url, module: flags.module });
    });
    say(`  ✓ Added ${pages.length} page(s) to "${project.name}"`);
    out(pages.map((p) => ({ id: p.id, name: p.name, url: p.url, module: p.module })));
  },

  async scan() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const previous = store.getModel(page.id);

    say(`  Scanning ${page.url} …`);
    let model;
    if (flags.html) {
      if (!fs.existsSync(flags.html)) die(`No such file: ${flags.html}`);
      model = inspectHtml(fs.readFileSync(flags.html, 'utf8'), page.url);
    } else {
      try {
        model = await inspect(page.url, scanOpts(project.id));
      } catch (err) {
        die(err.message, 'If this is an internal dev box with a self-signed certificate, add --insecure.');
      }
    }

    store.saveModel(page.id, model);
    store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });
    const diff = diffModels(previous, model);

    say(`  ✓ ${model.fields.length} fields · ${model.buttons.length} buttons · ${model.network.length} API calls · engine=${model.engine}`);
    if (model.note) say(`    ${model.note}`);
    if (diff && !diff.clean) say('    ⚠ page changed since the last scan — run "diff" for detail');

    out({
      pageId: page.id,
      engine: model.engine,
      httpStatus: model.httpStatus,
      title: model.title,
      fields: model.fields.length,
      buttons: model.buttons.length,
      apiCalls: model.network.length,
      consoleErrors: model.consoleErrors.length,
      note: model.note,
      diff,
    });
  },

  async model() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const m = store.getModel(page.id);
    if (!m) die('That page has not been scanned yet.', 'Run: node cli.js scan <project> <page>');
    out(m);
  },

  async fields() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const m = store.getModel(page.id);
    if (!m) die('That page has not been scanned yet.');
    out(m.fields.map((f) => ({
      key: f.key,
      type: f.type,
      label: f.label || f.placeholder || null,
      required: f.required,
      maxlength: f.maxlength,
      minlength: f.minlength,
      min: f.min,
      max: f.max,
      pattern: f.pattern,
      accept: f.accept,
      options: f.options ? f.options.map((o) => o.text) : null,
    })));
  },

  async diff() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const history = store.getModelHistory(page.id);
    if (history.length < 2) die('Need at least two scans to diff.', `This page has ${history.length}.`);
    out(diffModels(history[history.length - 2], history[history.length - 1]));
  },

  async generate() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const model = store.getModel(page.id);
    if (!model) die('Scan the page before generating.', 'Run: node cli.js scan <project> <page>');

    const families = flags.families ? String(flags.families).split(',').map((s) => s.trim()) : ALL_FAMILIES;
    const bad = families.filter((f) => !ALL_FAMILIES.includes(f));
    if (bad.length) die(`Unknown rule families: ${bad.join(', ')}`, `Valid: ${ALL_FAMILIES.join(', ')}`);

    const { cases, coverage } = generate({
      project, page, model, families, aggressiveness: flags.level || 'standard',
    });

    if (!flags.keep) {
      store.saveCases(project.id, store.listCases(project.id)
        .filter((c) => !(c.pageId === page.id && c.source === 'rules')));
    }
    const { added, skipped } = store.mergeCases(project.id, cases);

    say(`  ✓ ${added} case(s) added${skipped ? `, ${skipped} already present` : ''}`);
    say(`    ${Object.entries(coverage.byFamily).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    out({ added, skipped, coverage });
  },

  async prompt() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const model = store.getModel(page.id);
    if (!model) die('Scan the page first — the prompt is built from the page model.');

    const text = buildPrompt({
      project,
      page,
      model,
      existingTitles: store.listCases(project.id).filter((c) => c.pageId === page.id).map((c) => c.title),
      focus: flags.focus || '',
    });

    const file = flags.out || path.join(WORKSPACE, 'inbox', `${page.id}.prompt.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    say(`  ✓ Prompt written to ${file}`);
    say(`    Answer it with a JSON array, then: node cli.js import "${project.name}" "${page.name}" <file>`);
    if (flags.print) console.log(text); else out({ file, chars: text.length, pageId: page.id });
  },

  async import() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1]);
    const src = positional[2];
    if (!src) die('Give a JSON file, or - to read stdin.');

    const raw = src === '-'
      ? fs.readFileSync(0, 'utf8')
      : (fs.existsSync(src) ? fs.readFileSync(src, 'utf8')
        : die(`No such file: ${src}`));

    const { cases, errors } = validateImport(raw, { project, page });
    const { added, skipped } = store.mergeCases(project.id, cases);

    say(`  ✓ Imported ${added.length}${skipped.length ? `, skipped ${skipped.length} duplicate(s)` : ''}`);
    if (errors.length) {
      say(`  ⚠ ${errors.length} rejected:`);
      errors.forEach((e) => say(`      [${e.index}] ${e.title || ''} — ${e.message}`));
    }
    out({
      added: added.length,
      skipped: skipped.length,
      errors,
      addedIds: added.map((c) => c.id),
    });
    if (errors.length && added.length === 0) process.exit(1);
  },

  async cases() {
    const project = findProject(positional[0]);
    let list = store.listCases(project.id);
    if (flags.page) { const p = findPage(project, flags.page); list = list.filter((c) => c.pageId === p.id); }
    if (flags.category) list = list.filter((c) => c.category === flags.category);
    if (flags.priority) list = list.filter((c) => c.priority === flags.priority);
    if (flags.type) list = list.filter((c) => c.type === flags.type);
    if (flags.source) list = list.filter((c) => c.source === flags.source);
    if (flags.smoke) list = list.filter((c) => c.isSmoke);
    if (flags.search) {
      const q = String(flags.search).toLowerCase();
      list = list.filter((c) => `${c.title} ${c.description} ${c.expectedResult}`.toLowerCase().includes(q));
    }
    out(flags.full ? list : list.map((c) => ({
      id: c.id,
      title: c.title,
      module: c.module,
      category: c.category,
      type: c.type,
      priority: c.priority,
      status: c.status,
      source: c.source,
      smoke: c.isSmoke,
    })));
  },

  async coverage() {
    const project = findProject(positional[0]);
    const cases = store.listCases(project.id);
    const by = (k) => cases.reduce((a, c) => { a[c[k]] = (a[c[k]] || 0) + 1; return a; }, {});
    out({
      project: project.name,
      total: cases.length,
      byCategory: by('category'),
      byPriority: by('priority'),
      byType: by('type'),
      bySource: by('source'),
      byStatus: by('status'),
      smoke: cases.filter((c) => c.isSmoke).length,
      automatable: cases.filter((c) => c.automatable).length,
      pages: project.pages.map((p) => ({
        name: p.name,
        url: p.url,
        scanned: !!p.lastScannedAt,
        cases: cases.filter((c) => c.pageId === p.id).length,
      })),
    });
  },

  async plan() {
    const project = findProject(positional[0]);
    const cases = store.listCases(project.id);
    const models = {};
    for (const p of project.pages) models[p.id] = store.getModel(p.id);
    const md = buildPlan({ project, cases, models });
    store.savePlan(project.id, md);
    if (flags.out) { fs.writeFileSync(flags.out, md); say(`  ✓ ${flags.out}`); out({ file: flags.out, chars: md.length }); }
    else console.log(md);
  },

  async summary() {
    const project = findProject(positional[0]);
    console.log(buildSummaryReport({ project, cases: store.listCases(project.id) }));
  },

  async export() {
    const project = findProject(positional[0]);
    const format = positional[1];
    const cases = store.listCases(project.id);
    const safe = project.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const file = flags.out || path.join(process.cwd(), `${safe}-${format}-${stamp}.${format === 'jira' ? 'csv' : format}`);

    switch (format) {
      case 'xlsx': fs.writeFileSync(file, Buffer.from(await toExcel({ project, cases }))); break;
      case 'csv': fs.writeFileSync(file, toCsv(cases)); break;
      case 'jira': fs.writeFileSync(file, toJiraCsv(cases)); break;
      case 'md': fs.writeFileSync(file, toMarkdown({ project, cases })); break;
      case 'plan': {
        const models = {};
        for (const p of project.pages) models[p.id] = store.getModel(p.id);
        fs.writeFileSync(file, store.getPlan(project.id) || buildPlan({ project, cases, models }));
        break;
      }
      case 'json': fs.writeFileSync(file, JSON.stringify({
        project,
        cases,
        models: Object.fromEntries(project.pages.map((p) => [p.id, store.getModel(p.id)])),
        plan: store.getPlan(project.id),
      }, null, 2)); break;
      default: die(`Unknown format "${format}".`, 'One of: xlsx, csv, jira, md, json, plan');
    }
    say(`  ✓ ${file}`);
    out({ file, cases: cases.length });
  },

  async codegen() {
    const project = findProject(positional[0]);
    const cases = store.listCases(project.id);
    const models = {};
    for (const p of project.pages) models[p.id] = store.getModel(p.id);
    const files = generateSuite({ project, pages: project.pages, cases, models });

    const dir = flags.out || path.join(WORKSPACE, 'generated',
      project.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase());
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    say(`  ✓ ${Object.keys(files).length} files → ${dir}`);
    out({ dir, files: Object.keys(files), cases: cases.length });
  },

  async deliver() {
    let rawUrls = [...positional];
    const urlFile = lastFlag('file');
    if (urlFile) {
      if (!fs.existsSync(urlFile)) die(`No such file: ${urlFile}`);
      rawUrls.push(...fs.readFileSync(urlFile, 'utf8').split(/\r?\n/));
    }
    const normalized = normalizeUrls(rawUrls);
    if (!normalized.urls.length) {
      die('Give at least one valid URL or --file urls.txt.', 'node cli.js deliver https://example.com --name Example');
    }
    normalized.errors.forEach((entry) => say(`  ! Skipping invalid URL ${entry.value}: ${entry.error}`));

    const families = lastFlag('families')
      ? String(lastFlag('families')).split(',').map((item) => item.trim()).filter(Boolean)
      : ALL_FAMILIES;
    const unknownFamilies = families.filter((family) => !ALL_FAMILIES.includes(family));
    if (unknownFamilies.length) die(`Unknown rule families: ${unknownFamilies.join(', ')}`, `Valid: ${ALL_FAMILIES.join(', ')}`);
    const level = String(lastFlag('level', 'standard'));
    if (!['lean', 'standard', 'exhaustive'].includes(level)) die(`Unknown level: ${level}`, 'Use lean, standard, or exhaustive.');

    const hosts = [...new Set(normalized.urls.map((url) => new URL(url).host))];
    const requestedName = String(lastFlag('name') || lastFlag('project') || (hosts.length === 1 ? hosts[0] : 'multi-site-qa'));
    let project = store.listProjects().find((item) => item.name.toLowerCase() === requestedName.toLowerCase());
    if (!project) {
      project = store.createProject({
        name: requestedName,
        product: String(lastFlag('product', '')),
        description: 'Reusable URL-driven QA delivery project.',
        environments: { dev: new URL(normalized.urls[0]).origin, uat: '', prod: '' },
      });
      say(`  Created reusable project ${project.name}`);
    } else {
      say(`  Reusing project ${project.name}`);
    }

    const startedAt = new Date();
    const defaultRunDirectory = path.join(WORKSPACE, 'deliveries', safeSlug(project.name), deliveryStamp(startedAt));
    const runDirectory = path.resolve(String(lastFlag('out', defaultRunDirectory)));
    if (fs.existsSync(runDirectory) && fs.readdirSync(runDirectory).length) {
      die(`Output directory is not empty: ${runDirectory}`, 'Choose a new --out directory. Existing evidence is never overwritten.');
    }
    fs.mkdirSync(runDirectory, { recursive: true });
    const layout = deliveryLayout(runDirectory);
    [layout.supporting, layout.audits, layout.cases, layout.caseReference, layout.analysis, layout.planning]
      .forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

    const options = scanOpts(project.id);
    const useUiux = !flags['no-uiux'];
    let runAudit = null;
    let auditConfig = null;
    if (useUiux) {
      const nodeMajor = Number(process.versions.node.split('.')[0]);
      if (nodeMajor < 20) die('Full UI/UX delivery requires Node 20 or newer.', 'Upgrade Node, or pass --no-uiux for DOM-only generation.');
      const configModule = await import('./uiux-audit/src/config.mjs');
      const runModule = await import('./uiux-audit/src/run.mjs');
      auditConfig = configModule.loadConfig({ configPath: lastFlag('config') || configModule.DEFAULT_CONFIG_PATH });
      auditConfig.viewports = configModule.parseViewportSelection(lastFlag('viewports') || lastFlag('viewport'), auditConfig.viewports);
      auditConfig.themes = configModule.parseThemeSelection(lastFlag('themes') || lastFlag('theme'), auditConfig.themes);
      auditConfig.capture.ignoreSelectors.push(...flagValues(flags.ignore).map(String));
      auditConfig.capture.maskSelectors.push(...flagValues(flags.mask).map(String));
      configModule.validateConfig(auditConfig);
      runAudit = runModule.runAudit;
    }

    const pageResults = [];
    for (let index = 0; index < normalized.urls.length; index += 1) {
      const url = normalized.urls[index];
      project = store.getProject(project.id);
      let page = project.pages.find((item) => item.url === url);
      if (!page) {
        page = store.addPage(project.id, { url, module: lastFlag('module') || '' });
        project = store.getProject(project.id);
      }

      say(`  [${index + 1}/${normalized.urls.length}] Scanning ${url}`);
      let model = null;
      let classification = null;
      let scanError = null;
      let diff = null;
      let generatedCount = 0;
      try {
        model = await inspect(url, options);
        classification = classifyPageModel(model);
        if (classification.coverageValid) {
          const previous = store.getModel(page.id);
          diff = diffModels(previous, model);
          store.saveModel(page.id, model);
          store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });
          project = store.getProject(project.id);
          page = project.pages.find((item) => item.id === page.id);
          const generated = generate({ project, page, model, families, aggressiveness: level });
          store.saveCases(project.id, store.listCases(project.id)
            .filter((item) => !(item.pageId === page.id && item.source === 'rules')));
          store.mergeCases(project.id, generated.cases);
          generatedCount = generated.cases.length;
          say(`    ${model.fields.length} fields, ${model.buttons.length} buttons, ${generatedCount} deterministic cases`);
        } else {
          say(`    ! ${classification.verdict}`);
        }
      } catch (error) {
        scanError = error.message;
        classification = {
          code: 'scan-error', verdict: error.message, coverageValid: false, needsAttention: true,
        };
        say(`    x ${error.message}`);
      }

      const result = {
        url, page, model, classification, inventory: surfaceInventory(model || {}),
        diff, generatedCount, error: scanError, audit: null, auditDirectory: null, auditError: null,
      };

      if (useUiux && !scanError) {
        const auditDirectory = path.join(layout.audits, `${String(index + 1).padStart(2, '0')}-${safeSlug(page.name)}`);
        say('    Capturing responsive UI/UX, accessibility, fonts, interactions, and passive security');
        try {
          const auditResult = await runAudit({
            url,
            config: auditConfig,
            output: auditDirectory,
            resultLabel: page.name,
            storageStatePath: options.storageStatePath,
            headers: options.headers,
            headed: !!flags.headed,
            insecure: !!flags.insecure,
            expectAuthenticated: !!options.storageStatePath,
            onProgress: ({ event, viewport, theme }) => {
              if (event === 'profile-start') say(`      ${viewport} / ${theme}`);
            },
          });
          result.audit = auditResult.audit;
          result.auditDirectory = auditResult.outputDir;
          if (auditResult.audit.verdict === 'invalid-capture') {
            result.auditError = 'UI/UX capture was invalid and is not counted as coverage.';
          }
        } catch (error) {
          result.auditError = error.message;
          say(`    ! UI/UX audit could not complete: ${error.message}`);
        }
      }
      pageResults.push(result);
    }

    project = store.getProject(project.id);
    const validPageIds = new Set(pageResults.filter((result) => result.classification.coverageValid)
      .map((result) => result.page.id));
    const storedCases = store.listCases(project.id).filter((item) => validPageIds.has(item.pageId));
    const uiuxCases = [];
    for (const result of pageResults) {
      if (!result.classification.coverageValid || !result.audit) continue;
      const pageToken = safeSlug(result.page.name).replace(/-/g, '').toUpperCase().slice(0, 12) || 'PAGE';
      for (const item of result.audit.testCases || []) {
        uiuxCases.push({
          ...item,
          id: `${item.id}_${pageToken}`,
          dedupeKey: `uiux:${result.page.id}:${item.sourceCheckId || item.id}`,
          projectId: project.id,
          pageId: result.page.id,
          pageUrl: result.url,
          module: result.page.module || 'GENERAL',
          source: 'uiux-audit',
          ruleId: `uiux.${item.sourceCheckId || item.id}`,
          actualResult: '',
          status: 'Not Run',
          isRegression: true,
          pageOwner: project.defaults?.pageOwner || '',
          createdBy: project.defaults?.createdBy || '',
          createdAt: startedAt.toISOString(),
          updatedAt: startedAt.toISOString(),
        });
      }
    }
    const allCases = [...storedCases, ...uiuxCases];
    const executeFirstCases = allCases.filter((item) => ['P1', 'P2'].includes(item.priority));
    for (const result of pageResults) {
      result.caseCount = allCases.filter((item) => item.pageId === result.page.id).length;
    }

    const scopedProject = {
      ...project,
      pages: pageResults.filter((result) => result.classification.coverageValid).map((result) => result.page),
    };
    const models = Object.fromEntries(pageResults.filter((result) => result.model)
      .map((result) => [result.page.id, result.model]));
    const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

    fs.writeFileSync(path.join(layout.cases, '01-Execute-First-P1-P2.xlsx'), Buffer.from(await toExcel({ project: scopedProject, cases: executeFirstCases })));
    fs.writeFileSync(path.join(layout.cases, '02-All-Test-Cases.xlsx'), Buffer.from(await toExcel({ project: scopedProject, cases: allCases })));
    fs.writeFileSync(path.join(layout.cases, '03-Jira-Import.csv'), toJiraCsv(allCases));
    fs.writeFileSync(path.join(layout.caseReference, 'All-Test-Cases.csv'), toCsv(allCases));
    fs.writeFileSync(path.join(layout.caseReference, 'All-Test-Cases.md'), toMarkdown({ project: scopedProject, cases: allCases }));
    writeJson(path.join(layout.caseReference, 'All-Test-Cases.json'), allCases);
    writeJson(path.join(layout.analysis, 'page-models.json'), models);
    fs.writeFileSync(path.join(layout.planning, 'test-plan.md'), buildPlan({ project: scopedProject, cases: allCases, models }));

    const validSteps = pageResults.filter((result) => result.classification.coverageValid && result.model)
      .map((result) => ({ page: result.page, model: result.model }));
    if (validSteps.length >= 2) {
      const journey = buildJourneyPrompt({
        project: scopedProject,
        steps: validSteps,
        focus: String(lastFlag('focus', 'role separation, state transitions, interrupted flows, reverse paths, uniqueness collisions, and create-edit-delete data integrity')),
        existingTitles: allCases.map((item) => item.title),
      });
      fs.writeFileSync(path.join(layout.planning, 'journey-prompt.md'), journey);
    }

    if (flags.codegen) {
      const suiteDirectory = path.join(layout.automation, 'playwright-suite');
      const files = generateSuite({ project: scopedProject, pages: scopedProject.pages, cases: allCases, models });
      for (const [relative, content] of Object.entries(files)) {
        const target = path.join(suiteDirectory, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
    }

    const comparison = compareDeliveryPages(pageResults);
    writeJson(path.join(layout.analysis, 'comparison.json'), comparison);
    const timezone = String(lastFlag('timezone', 'Asia/Calcutta'));
    let generatedLocal;
    try {
      generatedLocal = new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone, dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23',
      }).format(startedAt);
    } catch {
      die(`Invalid timezone: ${timezone}`, 'Use an IANA name such as Asia/Calcutta or Asia/Kolkata.');
    }
    const run = { generatedAt: startedAt.toISOString(), generatedLocal, timezone };
    const relativeArtifact = (file) => path.relative(runDirectory, file).replace(/\\/g, '/');
    let allureResults = null;
    let allureReport = null;
    let allureError = null;
    if (useUiux) {
      say('  Building the Allure UI/UX report with screenshot evidence');
      try {
        allureResults = writeAllureResults({
          project: scopedProject,
          pages: pageResults,
          resultsDirectory: layout.allureResults,
          generatedAt: run.generatedAt,
        });
        if (!allureResults.total) {
          throw new Error('No completed UI/UX framework checks were available for Allure.');
        }
        allureReport = generateAllureReport({
          resultsDirectory: layout.allureResults,
          reportDirectory: layout.allureReport,
          searchRoot: ROOT,
        });
        if (!allureReport.generated) throw new Error(allureReport.error);
        say(`  Allure: ${allureResults.total} check results -> ${layout.allureIndex}`);
      } catch (error) {
        allureError = error.message;
        say(`  ! Allure report generation failed: ${error.message}`);
      }
    }
    const supportingArtifacts = {
      'Execute first - P1/P2 Excel': relativeArtifact(path.join(layout.cases, '01-Execute-First-P1-P2.xlsx')),
      'All test cases - Excel': relativeArtifact(path.join(layout.cases, '02-All-Test-Cases.xlsx')),
      'Jira import': relativeArtifact(path.join(layout.cases, '03-Jira-Import.csv')),
      'All test cases - CSV': relativeArtifact(path.join(layout.caseReference, 'All-Test-Cases.csv')),
      'All test cases - JSON': relativeArtifact(path.join(layout.caseReference, 'All-Test-Cases.json')),
      'All test cases - Markdown': relativeArtifact(path.join(layout.caseReference, 'All-Test-Cases.md')),
      'Test plan': relativeArtifact(path.join(layout.planning, 'test-plan.md')),
      'Comparison data': relativeArtifact(path.join(layout.analysis, 'comparison.json')),
      'Page models': relativeArtifact(path.join(layout.analysis, 'page-models.json')),
      ...(useUiux ? { 'Per-page audit evidence': relativeArtifact(layout.audits) } : {}),
      ...(allureResults?.total ? { 'UI/UX Allure result data': relativeArtifact(layout.allureResults) } : {}),
      ...(allureReport?.generated ? { 'UI/UX Allure report': relativeArtifact(layout.allureIndex) } : {}),
      ...(validSteps.length >= 2 ? { 'Cross-page journey prompt': relativeArtifact(path.join(layout.planning, 'journey-prompt.md')) } : {}),
      ...(flags.codegen ? { 'Playwright suite': relativeArtifact(path.join(layout.automation, 'playwright-suite')) } : {}),
    };
    const reportArgs = { project: scopedProject, run, pages: pageResults, cases: allCases, comparison, reportDirectory: layout.supporting };
    fs.writeFileSync(layout.reportMarkdown, renderSimpleDeliveryMarkdown(reportArgs));
    fs.writeFileSync(layout.reportHtml, renderSimpleDeliveryHtml(reportArgs));

    let pdfError = null;
    let primaryReportFile = relativeArtifact(layout.reportHtml);
    if (!flags['no-pdf']) {
      try {
        await renderPdf(layout.reportHtml, layout.primaryPdf);
        primaryReportFile = relativeArtifact(layout.primaryPdf);
      } catch (error) {
        pdfError = error.message;
        say(`  ! PDF generation failed: ${error.message}`);
      }
    }

    const invalidPages = pageResults.filter((result) => !result.classification.coverageValid);
    const auditFailures = useUiux
      ? pageResults.filter((result) => result.auditError || !result.audit)
      : [];
    const complete = normalized.errors.length === 0 && invalidPages.length === 0
      && auditFailures.length === 0 && (!useUiux || !allureError)
      && (!pdfError || !!flags['no-pdf']);
    const manifest = {
      schemaVersion: '1.4',
      ok: complete,
      status: complete ? 'complete' : 'incomplete',
      project: { id: project.id, name: project.name },
      run,
      primaryReport: {
        file: primaryReportFile,
        format: primaryReportFile.endsWith('.pdf') ? 'pdf' : 'html',
        path: path.resolve(runDirectory, primaryReportFile),
        purpose: 'Open and share this one report.',
      },
      manifestPath: layout.manifest,
      supportingEvidenceDirectory: layout.supporting,
      requestedUrls: normalized.urls,
      rejectedUrls: normalized.errors,
      securityMode: 'passive-safe evidence plus non-destructive active test design',
      uiuxAllure: useUiux ? {
        generated: !!allureReport?.generated,
        report: allureReport?.generated ? relativeArtifact(layout.allureIndex) : null,
        results: allureResults?.total ? relativeArtifact(layout.allureResults) : null,
        summary: allureResults,
        error: allureError,
      } : null,
      totals: {
        pages: pageResults.length,
        coverageValidPages: pageResults.length - invalidPages.length,
        deterministicAndAuthoredCases: storedCases.length,
        uiuxCases: uiuxCases.length,
        executeFirstP1P2Cases: executeFirstCases.length,
        allCases: allCases.length,
      },
      pages: pageResults.map((result) => ({
        name: result.page.name,
        url: result.url,
        scan: result.classification,
        engine: result.model?.engine || null,
        inventory: result.inventory,
        cases: result.caseCount,
        changedSincePreviousScan: result.diff ? !result.diff.clean : null,
        uiux: result.audit ? {
          verdict: result.audit.verdict,
          releaseDecision: result.audit.actionPlan?.decision || null,
          issues: result.audit.issues?.length || 0,
          outputDirectory: result.auditDirectory,
        } : null,
        error: result.error || result.auditError || null,
      })),
      artifacts: { 'Primary QA report': primaryReportFile },
      supportingArtifacts: {
        ...supportingArtifacts,
        'HTML source': relativeArtifact(layout.reportHtml),
        'Markdown text': relativeArtifact(layout.reportMarkdown),
      },
      pdfError,
      allureError,
      outputDirectory: runDirectory,
    };
    writeJson(layout.manifest, manifest);

    say(`  Delivery ${complete ? 'complete' : 'incomplete'}: ${runDirectory}`);
    say(`  Open one report: ${path.resolve(runDirectory, primaryReportFile)}`);
    say(`  Supporting evidence: ${layout.supporting}`);
    say(`  ${allCases.length} cases, ${pageResults.length} pages, ${uiuxCases.length} UI/UX verification cases`);
    out(manifest);
    if (!complete) process.exitCode = 1;
  },

  async quick() {
    const url = positional[0];
    if (!url) die('Give a URL.', 'node cli.js quick https://junedev.ledgers.cloud/agents --insecure');
    try { new URL(url); } catch { die(`Not a valid URL: ${url}`); }

    const host = new URL(url).host;
    const project = store.createProject({
      name: flags.name || host,
      environments: { dev: new URL(url).origin, uat: '', prod: '' },
    });
    const page = store.addPage(project.id, { url, module: flags.module });

    say(`  Scanning ${url} …`);
    let model;
    try {
      model = await inspect(url, scanOpts(project.id));
    } catch (err) {
      store.deleteProject(project.id);
      die(err.message, 'If this is an internal dev box with a self-signed certificate, add --insecure.');
    }
    store.saveModel(page.id, model);
    store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });

    const fresh = store.getProject(project.id);
    const { cases, coverage } = generate({
      project: fresh, page: fresh.pages[0], model, aggressiveness: flags.level || 'standard',
    });
    store.saveCases(project.id, cases);

    say(`  ✓ ${model.fields.length} fields → ${cases.length} test cases`);
    say(`    project "${project.name}" · open http://localhost:4100 to browse them`);
    out({
      projectId: project.id,
      projectName: project.name,
      pageId: page.id,
      engine: model.engine,
      fields: model.fields.length,
      cases: cases.length,
      coverage: coverage.byFamily,
    });
  },

  async login() {
    const project = findProject(positional[0]);
    const url = flags.url || positional[1] || project.environments.dev || project.environments.uat;
    if (!url) die('Give the login URL.', 'node cli.js login June --url https://junedev.ledgers.cloud/login --manual');

    let r;
    if (flags.cookies) {
      r = loginFromCookies({
        cookieString: flags.cookies,
        domain: flags.domain || new URL(url).hostname,
        workspace: WORKSPACE,
        projectId: project.id,
      });
      say(`  ✓ Saved ${r.cookies} cookie(s) to ${r.file}`);
    } else if (flags.manual || !(flags.user && flags.pass)) {
      if (!flags.manual) say('  No --user/--pass given, so opening a browser for you to log in by hand.');
      r = await loginManual({ url, workspace: WORKSPACE, projectId: project.id });
      say(`  ✓ Session saved (${r.cookies} cookies) — ended at ${r.finalUrl}`);
    } else {
      r = await loginAuto({
        url,
        username: flags.user,
        password: flags.pass,
        workspace: WORKSPACE,
        projectId: project.id,
        userSelector: flags['user-selector'],
        passSelector: flags['pass-selector'],
        submitSelector: flags['submit-selector'],
        successUrl: flags.success,
        headless: !flags.headed,
      });
      say(`  ✓ Logged in as ${flags.user} (${r.cookies} cookies) — landed on ${r.finalUrl}`);
    }
    say('    Scans and runs for this project now use that session automatically.');
    out({ ...r, projectId: project.id });
  },

  async session() {
    const project = findProject(positional[0]);
    const info = sessionInfo(WORKSPACE, project.id);
    if (!info.exists) {
      say('  ✗ No saved session for this project. Run "login" first.');
      out(info);
      process.exit(1);
    }
    const url = flags.url || positional[1]
      || (project.pages[0] && project.pages[0].url)
      || project.environments.dev;
    if (!url) { out(info); return; }

    say(`  Checking the session against ${url} …`);
    const v = await verifySession({ url, workspace: WORKSPACE, projectId: project.id });
    if (v.valid) say(`  ✓ Session is live (${info.ageHours}h old, ${info.cookies} cookies)`);
    else say(`  ✗ ${v.reason}`);
    out({ ...info, ...v });
    if (!v.valid) process.exit(1);
  },

  async run() {
    const project = findProject(positional[0]);
    const page = findPage(project, positional[1] || flags.page);
    const model = store.getModel(page.id);
    if (!model) die('Scan the page before running cases.');

    let list = store.listCases(project.id).filter((c) => c.pageId === page.id);
    if (flags.smoke) list = list.filter((c) => c.isSmoke);
    if (flags.category) list = list.filter((c) => c.category === flags.category);
    if (flags.priority) list = list.filter((c) => c.priority === flags.priority);
    if (flags.id) list = list.filter((c) => String(flags.id).split(',').includes(c.id));
    if (!flags.all) list = list.filter((c) => isExecutable(c.ruleId));

    if (!list.length) {
      die('Nothing to run with those filters.',
        `${store.listCases(project.id).filter((c) => isExecutable(c.ruleId)).length} case(s) in this project have an automatic executor.`);
    }

    const auth = fs.existsSync(authPath(WORKSPACE, project.id)) ? authPath(WORKSPACE, project.id) : null;
    say(`  Running ${list.length} case(s) against ${page.url}`);
    say(`  Session: ${auth ? 'using the saved login' : 'none — anonymous'}\n`);

    let done = 0;
    const { results, summary } = await runCases({
      cases: list,
      model,
      page,
      storageStatePath: auth,
      headless: !flags.headed,
      onProgress: (r) => {
        done += 1;
        const mark = { Pass: '✓', Fail: '✗', Blocked: '?', Skipped: '·' }[r.status];
        say(`  ${mark} [${done}/${list.length}] ${r.id}  ${r.title.slice(0, 70)}`);
        if (r.status === 'Fail') say(`        ${r.actual.slice(0, 160)}`);
      },
    });

    // write results back onto the cases
    for (const r of results) {
      if (r.status === 'Skipped') continue;
      try { store.updateCase(project.id, r.id, { status: r.status, actualResult: r.actual }); } catch { /* deleted mid-run */ }
    }
    store.saveRun(project.id, { ...summary, pageId: page.id, results });

    say(`\n  ${summary.pass} passed · ${summary.fail} failed · ${summary.blocked} could not be verified · ${summary.skipped} manual`);
    if (summary.blocked) say('  "could not be verified" is never counted as a pass — check those by hand.');
    out({ summary, results });
    if (summary.fail > 0) process.exit(1);
  },

  async executable() {
    out(executableRules.sort());
  },

  async sweep() {
    const project = findProject(positional[0]);
    let urls = positional.slice(1);
    if (flags.file) {
      if (!fs.existsSync(flags.file)) die(`No such file: ${flags.file}`);
      urls = fs.readFileSync(flags.file, 'utf8').split('\n').map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    }
    if (!urls.length && flags.all) urls = project.pages.map((p) => p.url);
    if (!urls.length) die('Give URLs, or --file urls.txt, or --all to re-sweep existing pages.');

    const report = [];
    for (const url of urls) {
      let page = project.pages.find((p) => p.url === url);
      if (!page) {
        try { new URL(url); } catch { report.push({ url, error: 'not a valid URL' }); continue; }
        page = store.addPage(project.id, { url, module: flags.module });
      }

      say(`  → ${url}`);
      let model;
      try {
        model = await inspect(url, scanOpts(project.id));
      } catch (err) {
        say(`    ✗ ${err.message.slice(0, 120)}`);
        report.push({ url, page: page.name, error: err.message });
        continue;
      }
      store.saveModel(page.id, model);
      store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });

      const fresh = store.getProject(project.id);
      const pageRec = fresh.pages.find((p) => p.id === page.id);
      const { cases, coverage } = generate({
        project: fresh, page: pageRec, model,
        families: flags.families ? String(flags.families).split(',').map((x) => x.trim()) : ALL_FAMILIES,
        aggressiveness: flags.level || 'standard',
      });

      if (!flags.keep) {
        store.saveCases(project.id, store.listCases(project.id)
          .filter((c) => !(c.pageId === page.id && c.source === 'rules')));
      }
      const { added } = store.mergeCases(project.id, cases);

      // A page with no form fields is not automatically a failure - a list or a
      // dashboard legitimately has none. Distinguish "nothing rendered" from
      // "rendered fine, just not a form".
      const nFields = model.fields.length;
      const hasContent = (model.headings || []).length > 0
        || (model.tables || []).length > 0
        || (model.links || []).length > 2;
      const isLogin = model.fields.some((f) => f.type === 'password');

      let verdict;
      if (isLogin) verdict = 'LOGIN PAGE — log in, then re-sweep';
      else if (nFields === 0 && !hasContent) verdict = 'EMPTY — nothing rendered; needs login or a browser scan';
      else if (nFields === 0 && (model.tables || []).length) verdict = 'list/table page — low yield is expected; add a journey prompt';
      else if (nFields === 0) verdict = 'read-only page — low yield is expected; add a journey prompt';
      else if (nFields < 3) verdict = 'thin — few fields; consider a journey prompt';
      else verdict = 'ok';

      report.push({
        url,
        page: page.name,
        engine: model.engine,
        status: model.httpStatus,
        fields: nFields,
        tables: (model.tables || []).length,
        apis: model.network.length,
        cases: added.length,
        verdict,
        needsAttention: isLogin || verdict.startsWith('EMPTY'),
      });
      say(`    ${nFields} fields → ${added.length} cases`);
    }

    // Yield table on stderr so stdout stays parseable
    const ok = report.filter((r) => !r.error);
    say('\n  ┌─ sweep result ────────────────────────────────────────');
    for (const r of report) {
      say(`  │ ${String(r.cases ?? '—').padStart(4)} cases  ${String(r.fields ?? '—').padStart(3)} fields  ${r.error ? `ERROR ${r.error.slice(0, 50)}` : r.verdict}`);
      say(`  │        ${r.url}`);
    }
    say(`  └─ ${ok.reduce((a, r) => a + r.cases, 0)} cases across ${ok.length}/${report.length} page(s)\n`);

    const broken = report.filter((r) => r.error || r.needsAttention);
    const lowYield = report.filter((r) => !r.error && !r.needsAttention && r.verdict !== 'ok');
    if (broken.length) say(`  ⚠ ${broken.length} page(s) did not scan properly — fix those first.`);
    if (lowYield.length) {
      say(`  ${lowYield.length} page(s) have little for the rules engine by nature.`);
      say('    That is expected for lists and dashboards. Cover them with:');
      say(`    node cli.js journey "${project.name}" <page> <page> --focus "..."`);
    }
    out({ swept: report.length, totalCases: ok.reduce((a, r) => a + r.cases, 0), pages: report });
  },

  async journey() {
    const project = findProject(positional[0]);
    const refs = positional.slice(1);
    if (refs.length < 2) {
      die('A journey needs at least two pages, in order.',
        'node cli.js journey June agents list approve --focus "maker creates, checker approves"');
    }

    const steps = refs.map((ref) => {
      const page = findPage(project, ref);
      return { page, model: store.getModel(page.id) };
    });

    const unscanned = steps.filter((s) => !s.model).map((s) => s.page.name);
    if (unscanned.length) {
      say(`  ⚠ Not scanned, so no field detail for: ${unscanned.join(', ')}`);
      say('    The prompt will say so rather than let the model invent fields.');
      if (!flags.force) die('Scan them first, or pass --force to continue anyway.');
    }

    const text = buildJourneyPrompt({
      project,
      steps,
      focus: flags.focus || '',
      existingTitles: store.listCases(project.id).map((c) => c.title),
    });

    const file = flags.out || path.join(WORKSPACE, 'inbox',
      `journey-${steps.map((s) => s.page.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()).join('-')}.prompt.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);

    say(`  ✓ Journey prompt for ${steps.length} pages → ${file}`);
    say(`    Answer it with a JSON array, then:`);
    say(`    node cli.js import "${project.name}" "${steps[0].page.name}" <file>`);
    if (flags.print) console.log(text);
    else out({ file, chars: text.length, steps: steps.map((s) => ({ name: s.page.name, url: s.page.url, scanned: !!s.model })) });
  },

  async families() {
    out(FAMILIES);
  },

  async doctor() {
    const pw = await playwrightAvailable();
    out({
      node: process.version,
      playwright: pw,
      scanner: pw ? 'full browser' : 'static fetch',
      dataDir: store.dataDir(),
      workspace: WORKSPACE,
      projects: store.listProjects().length,
      hint: pw ? null : 'Run "npm run browsers" to scan JS-rendered and logged-in pages.',
    });
  },
};

/* -------------------------------------------------------------------- run */

const fn = commands[cmd] || (cmd === undefined || cmd === '--help' || cmd === '-h' ? commands.help : null);
if (!fn) die(`Unknown command "${cmd}".`, 'Run: node cli.js help');

fn().catch((err) => {
  say(`\n  ✗ ${err.message}`);
  if (process.env.DEBUG) say(err.stack);
  say('');
  process.exit(1);
});
