/**
 * delivery.js - reusable, URL-driven QA delivery reporting.
 *
 * This module is deliberately product-agnostic. It compares only observed
 * page models and normalized audit evidence; it never invents requirements.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEVERITY_RANK = { critical: 4, major: 3, minor: 2, info: 1 };

export function safeSlug(value, fallback = 'qa-delivery') {
  const clean = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean || fallback;
}

export function deliveryStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function deliveryLayout(runDirectory) {
  const root = path.resolve(runDirectory);
  const supporting = path.join(root, 'supporting-evidence');
  return {
    root,
    primaryPdf: path.join(root, 'QA-Report.pdf'),
    supporting,
    audits: path.join(supporting, 'audits'),
    cases: path.join(supporting, 'test-cases'),
    caseReference: path.join(supporting, 'test-cases', 'reference'),
    analysis: path.join(supporting, 'analysis'),
    planning: path.join(supporting, 'planning'),
    automation: path.join(supporting, 'automation'),
    allureResults: path.join(supporting, 'allure-results'),
    allureReport: path.join(supporting, 'allure-report'),
    allureIndex: path.join(supporting, 'allure-report', 'index.html'),
    reportHtml: path.join(supporting, 'report.html'),
    reportMarkdown: path.join(supporting, 'report.md'),
    manifest: path.join(supporting, 'manifest.json'),
  };
}

export function normalizeUrls(values = []) {
  const seen = new Set();
  const urls = [];
  const errors = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || value.startsWith('#')) continue;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only HTTP(S) URLs are supported');
      const normalized = url.href;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    } catch (error) {
      errors.push({ value, error: error.message });
    }
  }
  return { urls, errors };
}

export function classifyPageModel(model = {}) {
  const fields = Array.isArray(model.fields) ? model.fields : [];
  const headings = Array.isArray(model.headings) ? model.headings : [];
  const tables = Array.isArray(model.tables) ? model.tables : [];
  const links = Array.isArray(model.links) ? model.links : [];
  const buttons = Array.isArray(model.buttons) ? model.buttons : [];
  const images = Array.isArray(model.images) ? model.images : [];
  const status = Number(model.httpStatus || 0);
  const login = fields.some((field) => field.type === 'password');
  const meaningfulContent = headings.length > 0 || tables.length > 0 || links.length > 2
    || buttons.length > 0 || images.length > 0;

  if (status >= 400) {
    return {
      code: 'http-error',
      verdict: `HTTP ${status} - error response; not counted as coverage`,
      coverageValid: false,
      needsAttention: true,
    };
  }
  if (login) {
    return {
      code: 'login-page',
      verdict: 'LOGIN PAGE - authenticate, then run the delivery again',
      coverageValid: false,
      needsAttention: true,
    };
  }
  if (fields.length === 0 && !meaningfulContent) {
    return {
      code: 'empty',
      verdict: 'EMPTY - nothing meaningful rendered; not counted as coverage',
      coverageValid: false,
      needsAttention: true,
    };
  }
  if (fields.length === 0 && tables.length > 0) {
    return {
      code: 'list-table',
      verdict: 'list/table - DOM rules are naturally thin; add cross-page journey coverage',
      coverageValid: true,
      needsAttention: false,
    };
  }
  if (fields.length === 0) {
    return {
      code: 'read-only',
      verdict: 'read-only - UI/UX evidence is primary; add journey coverage for business flow',
      coverageValid: true,
      needsAttention: false,
    };
  }
  if (fields.length < 3) {
    return {
      code: 'thin',
      verdict: 'thin - few fields; review the generated journey prompt',
      coverageValid: true,
      needsAttention: false,
    };
  }
  return { code: 'ok', verdict: 'ok', coverageValid: true, needsAttention: false };
}

export function surfaceInventory(model = {}) {
  const length = (value) => Array.isArray(value) ? value.length : 0;
  return {
    forms: Number(model.forms || 0),
    fields: length(model.fields),
    buttons: length(model.buttons),
    internalLinks: (model.links || []).filter((link) => !link.external).length,
    externalLinks: (model.links || []).filter((link) => link.external).length,
    tables: length(model.tables),
    apiCalls: length(model.network),
    images: length(model.images),
    modals: Number(model.modals || 0),
    pagination: model.hasPagination ? 1 : 0,
  };
}

export function clickableInventory(model = {}) {
  const entries = [];
  const seen = new Set();
  const add = (type, label) => {
    const clean = String(label || '').trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const key = `${type}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ key, type, label: clean });
  };
  for (const button of model.buttons || []) add('Button', button.text || button.ariaLabel || button.title);
  for (const link of model.links || []) {
    let fallback = '';
    try { fallback = new URL(link.href).pathname; } catch { fallback = link.href || ''; }
    add(link.external ? 'External link' : 'Link', link.text || fallback);
  }
  return entries;
}

function issueRank(issue) {
  return (issue.status === 'fail' ? 10 : 0) + (SEVERITY_RANK[issue.severity] || 0);
}

function groupAuditIssues(pages) {
  const groups = new Map();
  for (const page of pages) {
    const issues = page.audit?.issues || [];
    const seenOnPage = new Set();
    for (const issue of issues) {
      const key = issue.ruleId || issue.title;
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, {
          ruleId: key,
          title: issue.title || key,
          category: issue.category || 'Review',
          severity: issue.severity || 'info',
          status: issue.status || 'review',
          recommendation: issue.recommendation || '',
          pages: [],
          occurrences: 0,
          rank: issueRank(issue),
        });
      }
      const group = groups.get(key);
      group.occurrences += 1;
      if (!seenOnPage.has(key)) {
        group.pages.push(page.page.name);
        seenOnPage.add(key);
      }
      if (issueRank(issue) > group.rank) {
        group.rank = issueRank(issue);
        group.severity = issue.severity || group.severity;
        group.status = issue.status || group.status;
        group.title = issue.title || group.title;
        group.recommendation = issue.recommendation || group.recommendation;
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.rank - a.rank || b.pages.length - a.pages.length
    || b.occurrences - a.occurrences || a.ruleId.localeCompare(b.ruleId));
}

export function compareDeliveryPages(pages = []) {
  const valid = pages.filter((page) => page.classification?.coverageValid);
  const pageNames = valid.map((page) => page.page.name);
  const surfaces = [
    ['forms', 'Forms'],
    ['fields', 'Input fields'],
    ['buttons', 'Named buttons'],
    ['internalLinks', 'Internal links'],
    ['externalLinks', 'External links'],
    ['tables', 'Data tables'],
    ['apiCalls', 'Observed API calls'],
    ['images', 'Images'],
    ['modals', 'Dialogs/modals'],
    ['pagination', 'Pagination'],
  ].map(([key, label]) => {
    const counts = Object.fromEntries(valid.map((page) => [page.page.name, Number(page.inventory?.[key] || 0)]));
    const present = valid.filter((page) => Number(page.inventory?.[key] || 0) > 0)
      .map((page) => page.page.name);
    const missing = pageNames.filter((name) => !present.includes(name));
    const distinctCounts = new Set(Object.values(counts));
    const status = !present.length ? 'absent-all'
      : present.length === valid.length
        ? distinctCounts.size === 1 ? 'common' : 'count-mismatch'
        : present.length === 1 ? 'unique' : 'partial';
    return { key, label, status, counts, present, missing };
  }).filter((entry) => entry.status !== 'absent-all');

  const clickablesByKey = new Map();
  for (const page of valid) {
    for (const clickable of clickableInventory(page.model || {})) {
      if (!clickablesByKey.has(clickable.key)) clickablesByKey.set(clickable.key, { ...clickable, pages: [] });
      clickablesByKey.get(clickable.key).pages.push(page.page.name);
    }
  }
  const clickables = [...clickablesByKey.values()].map((clickable) => ({
    ...clickable,
    missing: pageNames.filter((name) => !clickable.pages.includes(name)),
    scope: clickable.pages.length === valid.length && valid.length > 1
      ? 'common' : clickable.pages.length === 1 ? 'unique' : 'shared',
  })).sort((a, b) => a.scope.localeCompare(b.scope) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));

  const issueFamilies = groupAuditIssues(valid.filter((page) => page.audit));
  const withScope = issueFamilies.map((issue) => ({
    ...issue,
    scope: issue.pages.length === valid.length && valid.length > 1
      ? 'common'
      : issue.pages.length === 1 ? 'unique' : 'shared',
  }));

  return {
    pagesCompared: valid.length,
    excludedPages: pages.filter((page) => !page.classification?.coverageValid)
      .map((page) => ({ name: page.page?.name || page.url, reason: page.classification?.verdict || page.error })),
    surfaces,
    clickables,
    commonIssues: withScope.filter((issue) => issue.scope === 'common'),
    sharedIssues: withScope.filter((issue) => issue.scope === 'shared'),
    uniqueIssues: withScope.filter((issue) => issue.scope === 'unique'),
  };
}

const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const markdownEscape = (value) => String(value ?? '').replace(/[|\r\n]+/g, ' ').trim();

function countBy(cases, key) {
  return cases.reduce((counts, item) => {
    const value = item[key] || 'Unspecified';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function caseExecutionMatrix(pages = [], cases = []) {
  return pages.map((page) => {
    const pageCases = cases.filter((item) => item.pageId === page.page?.id);
    const priorities = countBy(pageCases, 'priority');
    const p1 = priorities.P1 || 0;
    const p2 = priorities.P2 || 0;
    const p3 = priorities.P3 || 0;
    const p4 = priorities.P4 || 0;
    return {
      name: page.page?.name || page.url,
      url: page.url,
      p1,
      p2,
      p3,
      p4,
      executeFirst: p1 + p2,
      total: pageCases.length,
    };
  });
}

function screenshotValue(capture) {
  const value = capture?.screenshot || capture?.screenshotPath || capture?.fullPageScreenshot
    || capture?.artifacts?.screenshot || capture?.artifacts?.fullPage;
  if (typeof value === 'string') return value;
  return value?.path || value?.file || value?.href || value?.relativePath || null;
}

function evidenceScreenshots(page, reportDirectory) {
  if (!page.audit || !page.auditDirectory) return [];
  const captures = (page.audit.captures || []).filter((capture) => screenshotValue(capture));
  const pageCaptures = captures.filter((capture) => !capture.checkpoint || capture.checkpoint === 'page');
  const candidates = pageCaptures.length ? pageCaptures : captures;
  const pick = (matcher) => candidates.find(matcher);
  const selected = [
    pick((capture) => capture.theme === 'light' && capture.viewport?.name === 'desktop'),
    pick((capture) => capture.theme === 'light' && /mobile-?320|mobile/i.test(capture.viewport?.name || '')),
    pick((capture) => capture.theme === 'light'),
    candidates[0],
  ].filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const capture of selected) {
    const raw = screenshotValue(capture);
    if (!raw) continue;
    const absolute = path.resolve(page.auditDirectory, raw);
    if (!fs.existsSync(absolute) || seen.has(absolute)) continue;
    seen.add(absolute);
    unique.push({
      src: path.relative(reportDirectory, absolute).replace(/\\/g, '/'),
      label: [capture.viewport?.name, capture.theme, capture.checkpoint || 'page'].filter(Boolean).join(' / '),
    });
    if (unique.length === 2) break;
  }
  return unique;
}

function topIssues(page, limit = 8) {
  const groups = groupAuditIssues([page]);
  return groups.slice(0, limit);
}

function pageCounts(page) {
  const summary = page.audit?.summary || {};
  const issues = page.audit?.issues || [];
  return {
    findings: issues.length,
    failures: issues.filter((issue) => issue.status === 'fail').length,
    reviews: issues.filter((issue) => issue.status !== 'fail').length,
    captures: page.audit?.coverage?.captures?.valid ?? summary.validCaptures ?? 0,
  };
}

function pageDecision(page) {
  if (!page.classification?.coverageValid) return 'NOT TESTED';
  const raw = page.audit?.actionPlan?.decision || page.audit?.verdict || '';
  if (/not[ -]?ready|block|fail/i.test(raw)) return 'NOT READY';
  if (/ready|pass/i.test(raw)) return 'REVIEW COMPLETE';
  return page.audit ? 'REVIEW REQUIRED' : 'NOT RUN';
}

export function summarizeDelivery(pages = [], cases = [], comparison = {}) {
  const validPages = pages.filter((page) => page.classification?.coverageValid);
  const blockedPages = pages.filter((page) => !page.classification?.coverageValid);
  const auditedPages = validPages.filter((page) => page.audit);
  const issueFamilies = groupAuditIssues(auditedPages);
  const fixFamilies = issueFamilies.filter((issue) => issue.status === 'fail');
  const reviewFamilies = issueFamilies.filter((issue) => issue.status !== 'fail');
  const missingAudits = validPages.filter((page) => !page.audit);
  const hasBlockingDecision = auditedPages.some((page) => pageDecision(page) === 'NOT READY');
  const hasMajorFailure = fixFamilies.some((issue) => ['critical', 'major'].includes(issue.severity));

  let overallStatus = 'NO AUTOMATED BLOCKER FOUND';
  let statusClass = 'good';
  if (blockedPages.length || missingAudits.length) {
    overallStatus = 'INCOMPLETE';
    statusClass = 'warning';
  } else if (hasBlockingDecision || hasMajorFailure) {
    overallStatus = 'NOT READY';
    statusClass = 'bad';
  } else if (fixFamilies.length || reviewFamilies.length) {
    overallStatus = 'REVIEW REQUIRED';
    statusClass = 'warning';
  }

  return {
    overallStatus,
    statusClass,
    validPages: validPages.length,
    blockedPages: blockedPages.length,
    auditedPages: auditedPages.length,
    screenshots: auditedPages.reduce((total, page) => total + pageCounts(page).captures, 0),
    casesPrepared: cases.length,
    fixFamilies,
    reviewFamilies,
    priorityActions: issueFamilies.slice(0, 8),
    commonControls: (comparison.clickables || []).filter((item) => item.scope === 'common'),
    differentControls: (comparison.clickables || []).filter((item) => item.scope !== 'common'),
    surfaceDifferences: (comparison.surfaces || []).filter((item) => item.status !== 'common'),
  };
}

export function renderDeliveryMarkdown({ project, run, pages, cases, comparison, reportDirectory }) {
  const categories = countBy(cases, 'category');
  const lines = [
    `# QA Delivery Report - ${project.name}`,
    '',
    `Generated: ${run.generatedLocal} (${run.timezone}); ${run.generatedAt} UTC timestamp`,
    '',
    `Scope: ${pages.length} URL(s), ${cases.length} deterministic test case(s), ${pages.filter((page) => page.audit).length} visual audit package(s).`,
    '',
    '> A scan is evidence, not test execution. All generated cases remain Not Run until a tester or runner records a result.',
    '',
    '## Page results',
    '',
    '| Page | Scan | Fields | Tables | APIs | Cases | UI/UX decision |',
    '|---|---|---:|---:|---:|---:|---|',
    ...pages.map((page) => `| ${markdownEscape(page.page?.name || page.url)} | ${markdownEscape(page.classification?.code || 'error')} | ${page.inventory?.fields ?? 0} | ${page.inventory?.tables ?? 0} | ${page.inventory?.apiCalls ?? 0} | ${page.caseCount || 0} | ${markdownEscape(page.audit?.actionPlan?.decision || page.audit?.verdict || page.error || 'not run')} |`),
    '',
    '## Coverage',
    '',
    '| Category | Cases |',
    '|---|---:|',
    ...Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([name, count]) => `| ${markdownEscape(name)} | ${count} |`),
    '',
    '## Common, missing, and page-specific surfaces',
    '',
    '| Surface | Status | Counts by page | Not observed |',
    '|---|---|---|---|',
    ...comparison.surfaces.map((entry) => `| ${entry.label} | ${entry.status} | ${markdownEscape(Object.entries(entry.counts || {}).map(([name, count]) => `${name}=${count}`).join(', '))} | ${markdownEscape(entry.missing.join(', ') || '-')} |`),
    '',
    '_“Not observed” means absent from the rendered DOM at scan time; it is not automatically a defect._',
    '',
    '## Named clickable comparison',
    '',
    '| Scope | Type | Visible name | Observed on | Missing on |',
    '|---|---|---|---|---|',
    ...(comparison.clickables || []).slice(0, 100).map((entry) => `| ${entry.scope} | ${entry.type} | ${markdownEscape(entry.label)} | ${markdownEscape(entry.pages.join(', '))} | ${markdownEscape(entry.missing.join(', ') || '-')} |`),
    '',
    '## Cross-page mismatch families',
    '',
    '| Scope | Severity | Finding family | Pages | Occurrences |',
    '|---|---|---|---|---:|',
    ...[...comparison.commonIssues, ...comparison.sharedIssues, ...comparison.uniqueIssues].slice(0, 30)
      .map((issue) => `| ${issue.scope} | ${issue.severity} | ${markdownEscape(issue.title)} | ${markdownEscape(issue.pages.join(', '))} | ${issue.occurrences} |`),
    '',
    '## Screenshot evidence',
    '',
  ];

  for (const page of pages) {
    const evidence = evidenceScreenshots(page, reportDirectory);
    lines.push(`### ${page.page?.name || page.url}`, '');
    if (!evidence.length) lines.push('_No valid screenshot was produced._', '');
    for (const shot of evidence) lines.push(`![${markdownEscape(shot.label)}](${shot.src})`, '');
  }

  lines.push(
    '## Limits and required follow-up',
    '',
    '- Login and empty captures are excluded from coverage; authenticate and rerun them.',
    '- Passive security observations do not replace an authorized penetration test.',
    '- Cross-page business rules, roles, approvals, state transitions, and data integrity require the generated journey prompt plus product requirements.',
    '- “Not observed” is a comparison signal, not proof that a component is required.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function renderDeliveryHtml({ project, run, pages, cases, comparison, reportDirectory, artifactNames = {} }) {
  const byCategory = countBy(cases, 'category');
  const byPriority = countBy(cases, 'priority');
  const validPages = pages.filter((page) => page.classification?.coverageValid).length;
  const blockedPages = pages.length - validPages;
  const auditPages = pages.filter((page) => page.audit).length;
  const securityCases = cases.filter((item) => item.category === 'Security').length;
  const screenshotSections = pages.map((page) => {
    const evidence = evidenceScreenshots(page, reportDirectory);
    return `<section class="page-break"><h2>${htmlEscape(page.page?.name || page.url)}</h2>
      <p class="url">${htmlEscape(page.url)}</p>
      <div class="evidence-grid">${evidence.length ? evidence.map((shot) => `<figure><img src="${htmlEscape(shot.src)}" alt="${htmlEscape(shot.label)} screenshot"><figcaption>${htmlEscape(shot.label)}</figcaption></figure>`).join('') : '<p class="muted">No valid screenshot was produced.</p>'}</div>
      <h3>Highest-priority evidence</h3>
      ${topIssues(page).length ? `<table><thead><tr><th>Status</th><th>Severity</th><th>Finding</th><th>Occurrences</th><th>Recommended action</th></tr></thead><tbody>${topIssues(page).map((issue) => `<tr><td><span class="pill ${htmlEscape(issue.status)}">${htmlEscape(issue.status)}</span></td><td>${htmlEscape(issue.severity)}</td><td>${htmlEscape(issue.title)}</td><td>${issue.occurrences}</td><td>${htmlEscape(issue.recommendation || 'Review linked audit evidence.')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No normalized UI/UX findings available.</p>'}
      ${page.auditDirectory ? `<p><a href="${htmlEscape(path.relative(reportDirectory, path.join(page.auditDirectory, 'report.html')).replace(/\\/g, '/'))}">Open the complete per-page evidence report</a></p>` : ''}
    </section>`;
  }).join('');

  const issueRows = [...comparison.commonIssues, ...comparison.sharedIssues, ...comparison.uniqueIssues]
    .slice(0, 40).map((issue) => `<tr><td><span class="pill ${issue.scope}">${issue.scope}</span></td><td>${htmlEscape(issue.severity)}</td><td>${htmlEscape(issue.title)}</td><td>${htmlEscape(issue.pages.join(', '))}</td><td>${issue.occurrences}</td></tr>`).join('');
  const clickableRows = (comparison.clickables || []).slice(0, 100)
    .map((entry) => `<tr><td><span class="pill ${entry.scope}">${entry.scope}</span></td><td>${htmlEscape(entry.type)}</td><td>${htmlEscape(entry.label)}</td><td>${htmlEscape(entry.pages.join(', '))}</td><td>${htmlEscape(entry.missing.join(', ') || '-')}</td></tr>`).join('');

  const artifactRows = Object.entries(artifactNames).map(([label, file]) => `<li><a href="${htmlEscape(file)}">${htmlEscape(label)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Delivery Report - ${htmlEscape(project.name)}</title>
<style>
@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#152238;background:#f4f7fb;margin:0;line-height:1.45}main{max-width:1180px;margin:auto;background:#fff;padding:38px}.cover{min-height:650px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#0b1f3a,#174ea6 62%,#1a73e8);color:#fff;padding:58px;border-radius:18px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:700}.cover h1{font-size:44px;line-height:1.08;margin:18px 0}.cover .meta{font-size:16px;opacity:.9}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}.metric{background:#f7f9fc;border:1px solid #dce4ef;border-radius:12px;padding:18px}.metric b{display:block;font-size:28px;color:#174ea6}.cover .metric{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25)}.cover .metric b{color:#fff}h2{color:#102a43;border-bottom:2px solid #d9e6f7;padding-bottom:8px;margin-top:34px}h3{color:#243b53;margin-top:26px}table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0 22px}th{background:#eaf2ff;text-align:left;color:#163968}th,td{padding:8px;border:1px solid #dbe3ed;vertical-align:top}.pill{display:inline-block;border-radius:99px;padding:2px 8px;background:#e5e7eb;font-size:10px;text-transform:uppercase;font-weight:700}.pill.fail,.pill.critical{background:#fee2e2;color:#991b1b}.pill.review,.pill.shared,.pill.partial{background:#fef3c7;color:#92400e}.pill.common{background:#dbeafe;color:#1e40af}.pill.unique{background:#ede9fe;color:#5b21b6}.ok{color:#137333}.bad{color:#b3261e}.muted{color:#62748a}.url{font-family:ui-monospace,Consolas,monospace;font-size:11px;overflow-wrap:anywhere}.notice{border-left:5px solid #f59e0b;background:#fff8e6;padding:14px 18px;margin:18px 0}.evidence-grid{display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start}.evidence-grid figure{margin:0;border:1px solid #d8e1ed;border-radius:10px;padding:8px;background:#f8fafc}.evidence-grid img{display:block;width:100%;max-height:680px;object-fit:contain;background:#eef2f7}.evidence-grid figcaption{text-align:center;font-size:11px;color:#607086;margin-top:6px}.page-break{break-before:page}.avoid{break-inside:avoid}a{color:#174ea6}ul{padding-left:20px}@media(max-width:760px){main{padding:18px}.metrics{grid-template-columns:repeat(2,1fr)}.evidence-grid{grid-template-columns:1fr}.cover h1{font-size:34px}}@media print{body{background:#fff}main{max-width:none;padding:0}.cover{border-radius:0}.page-break{break-before:page}a{color:inherit;text-decoration:none}}
</style></head><body><main>
<section class="cover"><div class="eyebrow">QA Copilot / evidence-led delivery</div><h1>${htmlEscape(project.name)}</h1><p>Functional, UI/UX, accessibility, compatibility, performance, API, data-integrity, and passive-security coverage generated from the rendered URLs.</p><div class="metrics"><div class="metric"><b>${pages.length}</b>URLs</div><div class="metric"><b>${cases.length}</b>test cases</div><div class="metric"><b>${auditPages}</b>visual audits</div><div class="metric"><b>${securityCases}</b>security cases</div></div><p class="meta">Generated ${htmlEscape(run.generatedLocal)} (${htmlEscape(run.timezone)})<br>${htmlEscape(run.generatedAt)}</p></section>
<section><h2>Executive summary</h2><div class="metrics"><div class="metric"><b>${validPages}</b>coverage-valid pages</div><div class="metric"><b>${blockedPages}</b>blocked/invalid pages</div><div class="metric"><b>${comparison.commonIssues.length}</b>common issue families</div><div class="metric"><b>${comparison.uniqueIssues.length}</b>page-specific families</div></div><div class="notice"><strong>Evidence status:</strong> scanning and case generation do not execute the cases. Every generated case remains <em>Not Run</em> until a tester or automation runner records a result. Login, HTTP-error, and empty captures are excluded from coverage.</div></section>
<section><h2>Page-by-page result</h2><table><thead><tr><th>Page</th><th>Scan verdict</th><th>Observed surface</th><th>Generated cases</th><th>UI/UX evidence</th></tr></thead><tbody>${pages.map((page) => { const counts = pageCounts(page); return `<tr><td><strong>${htmlEscape(page.page?.name || page.url)}</strong><div class="url">${htmlEscape(page.url)}</div></td><td><span class="pill ${page.classification?.coverageValid ? 'common' : 'fail'}">${htmlEscape(page.classification?.code || 'error')}</span><br>${htmlEscape(page.classification?.verdict || page.error || '')}</td><td>${page.inventory?.fields ?? 0} fields; ${page.inventory?.buttons ?? 0} buttons; ${page.inventory?.tables ?? 0} tables; ${page.inventory?.apiCalls ?? 0} API calls</td><td>${page.caseCount || 0}</td><td>${htmlEscape(page.audit?.actionPlan?.decision || page.audit?.verdict || page.auditError || 'not run')}<br>${counts.failures} failed checks; ${counts.reviews} review items</td></tr>`; }).join('')}</tbody></table></section>
<section><h2>Test-case coverage</h2><div class="metrics">${Object.entries(byPriority).sort().map(([name, count]) => `<div class="metric"><b>${count}</b>${htmlEscape(name)}</div>`).join('')}</div><table><thead><tr><th>Category</th><th>Cases</th><th>Share</th></tr></thead><tbody>${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<tr><td>${htmlEscape(name)}</td><td>${count}</td><td>${cases.length ? Math.round(count / cases.length * 100) : 0}%</td></tr>`).join('')}</tbody></table></section>
<section class="page-break"><h2>Common, missing, and page-specific surface comparison</h2><p class="muted">“Not observed” means absent from the rendered DOM during this run. It is a review signal, not an automatic defect or a claim that the page requires that component.</p><table><thead><tr><th>Surface</th><th>Status</th><th>Counts by page</th><th>Not observed on</th></tr></thead><tbody>${comparison.surfaces.map((entry) => `<tr><td>${htmlEscape(entry.label)}</td><td><span class="pill ${entry.status}">${entry.status}</span></td><td>${htmlEscape(Object.entries(entry.counts || {}).map(([name, count]) => `${name}=${count}`).join(', '))}</td><td>${htmlEscape(entry.missing.join(', ') || '-')}</td></tr>`).join('')}</tbody></table><h3>Named clickable comparison</h3>${clickableRows ? `<table><thead><tr><th>Scope</th><th>Type</th><th>Visible name</th><th>Observed on</th><th>Missing on</th></tr></thead><tbody>${clickableRows}</tbody></table>` : '<p class="muted">No named clickables were extracted.</p>'}<h3>Cross-page mismatch families</h3>${issueRows ? `<table><thead><tr><th>Scope</th><th>Severity</th><th>Finding family</th><th>Pages</th><th>Occurrences</th></tr></thead><tbody>${issueRows}</tbody></table>` : '<p class="muted">No comparable UI/UX issue families were produced.</p>'}</section>
<section class="page-break"><h2>Security model</h2><p>The delivery combines safe passive evidence (TLS, response headers, CSP, cookies with values omitted, mixed content, form destinations, iframe/external-resource boundaries, URL leakage, and browser-visible client risks) with generated active verification cases for authorization, session handling, injection, CSRF, uploads, APIs, data exposure, and business-state risks when the rendered surface makes them applicable.</p><div class="notice"><strong>Boundary:</strong> active authentication abuse, role/tenant separation, IDOR/BOLA, injection against real services, rate limits, race conditions, and destructive operations require explicit authorization, controlled test data, and suitable accounts. They are generated as cases; this URL-only command does not attack the target.</div></section>
${screenshotSections}
<section class="page-break"><h2>Required follow-up</h2><ol><li>Authenticate and rerun every login or empty page; those pages currently have no valid coverage.</li><li>Review the journey prompt for role differences, approvals, state changes, interrupted flows, reverse paths, uniqueness collisions, and create-to-delete data integrity.</li><li>Execute P1/P2 cases and record actual results; do not treat generated cases as passed.</li><li>Use the full per-page HTML reports for selectors, screenshots, exact measurements, standards, remediation, and verification steps.</li><li>Run authorized security testing in a controlled environment; passive findings and test design are not a penetration-test certificate.</li></ol><h3>Artifacts</h3><ul>${artifactRows}</ul></section>
</main></body></html>`;
}

export function renderSimpleDeliveryMarkdown({ project, run, pages, cases, comparison, reportDirectory }) {
  const summary = summarizeDelivery(pages, cases, comparison);
  const caseMatrix = caseExecutionMatrix(pages, cases);
  const lines = [
    `# QA Report - ${project.name}`,
    '',
    `Generated: ${run.generatedLocal} (${run.timezone})`,
    '',
    `## Overall result: ${summary.overallStatus}`,
    '',
    `Reviewed ${summary.validPages} of ${pages.length} page(s), captured ${summary.screenshots} screenshots, found ${summary.fixFamilies.length} issue families to fix, and prepared ${cases.length} test cases.`,
    '',
    '> This is the one reader-facing report. Generated test cases are prepared coverage, not passed tests.',
    '',
    '## Fix first',
    '',
    '| Severity | Finding | Affected pages | Action |',
    '|---|---|---|---|',
    ...summary.priorityActions.map((issue) => `| ${issue.severity} | ${markdownEscape(issue.title)} | ${markdownEscape(issue.pages.join(', '))} | ${markdownEscape(issue.recommendation || 'Review and correct the affected component.')} |`),
    '',
    '## Page results',
    '',
    '| Page | Result | Findings to fix | Review items | Cases prepared |',
    '|---|---|---:|---:|---:|',
    ...pages.map((page) => { const counts = pageCounts(page); return `| ${markdownEscape(page.page?.name || page.url)} | ${pageDecision(page)} | ${counts.failures} | ${counts.reviews} | ${page.caseCount || 0} |`; }),
    '',
    '## Differences between pages',
    '',
    '| Area | Difference | Counts by page | Missing on |',
    '|---|---|---|---|',
    ...summary.surfaceDifferences.map((entry) => `| ${entry.label} | ${entry.status} | ${markdownEscape(Object.entries(entry.counts || {}).map(([name, count]) => `${name}=${count}`).join(', '))} | ${markdownEscape(entry.missing.join(', ') || '-')} |`),
    '',
    '_A difference is a review signal, not automatically a defect._',
    '',
    '### Page-specific or missing controls',
    '',
    '| Control | Seen on | Not seen on |',
    '|---|---|---|',
    ...summary.differentControls.slice(0, 30).map((entry) => `| ${markdownEscape(entry.label)} | ${markdownEscape(entry.pages.join(', '))} | ${markdownEscape(entry.missing.join(', ') || '-')} |`),
    '',
    '## Cases to execute',
    '',
    'P1 = run first; P2 = complete before release; P3/P4 = extended regression.',
    '',
    '| Page | P1 | P2 | P1 + P2 | P3 | P4 | Total |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...caseMatrix.map((entry) => `| ${markdownEscape(entry.name)} | ${entry.p1} | ${entry.p2} | ${entry.executeFirst} | ${entry.p3} | ${entry.p4} | ${entry.total} |`),
    '',
    'Tester workbook: `test-cases/01-Execute-First-P1-P2.xlsx`.',
    '',
    '## Screenshot evidence',
    '',
  ];

  for (const page of pages) {
    const evidence = evidenceScreenshots(page, reportDirectory);
    lines.push(`### ${page.page?.name || page.url}`, '');
    if (!evidence.length) lines.push('_No valid screenshot was produced._', '');
    for (const shot of evidence) lines.push(`![${markdownEscape(shot.label)}](${shot.src})`, '');
  }

  lines.push(
    '## Next steps',
    '',
    '1. Fix the highest-priority common findings before page-specific findings.',
    '2. Confirm whether page-specific controls are intentional or missing.',
    '3. Execute the prepared P1/P2 cases and record Pass or Fail.',
    '4. Authenticate and rerun any login, error, or empty page.',
    '',
    'Passive security checks do not replace an authorized penetration test. Hidden workflows and business rules need authenticated journeys and product requirements.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function renderSimpleDeliveryHtml({ project, run, pages, cases, comparison, reportDirectory }) {
  const byCategory = countBy(cases, 'category');
  const byPriority = countBy(cases, 'priority');
  const summary = summarizeDelivery(pages, cases, comparison);
  const visualCards = pages.map((page) => {
    const shot = evidenceScreenshots(page, reportDirectory)[0];
    return `<figure>${shot ? `<img src="${htmlEscape(shot.src)}" alt="${htmlEscape(page.page?.name || page.url)} desktop screenshot">` : '<div class="no-shot">No screenshot</div>'}<figcaption><strong>${htmlEscape(page.page?.name || page.url)}</strong><br>${htmlEscape(pageDecision(page))}</figcaption></figure>`;
  }).join('');
  const screenshotSections = pages.map((page) => {
    const evidence = evidenceScreenshots(page, reportDirectory);
    return `<section class="page-break"><h2>${htmlEscape(page.page?.name || page.url)}</h2>
      <p class="url">${htmlEscape(page.url)}</p>
      <div class="evidence-grid">${evidence.length ? evidence.map((shot) => `<figure><img src="${htmlEscape(shot.src)}" alt="${htmlEscape(shot.label)} screenshot"><figcaption>${htmlEscape(shot.label)}</figcaption></figure>`).join('') : '<p class="muted">No valid screenshot was produced.</p>'}</div>
      <h3>What needs attention</h3>
      ${topIssues(page, 6).length ? `<table><thead><tr><th>Severity</th><th>Finding</th><th>Seen</th><th>What to do</th></tr></thead><tbody>${topIssues(page, 6).map((issue) => `<tr><td><span class="pill ${htmlEscape(issue.severity)}">${htmlEscape(issue.severity)}</span></td><td>${htmlEscape(issue.title)}</td><td>${issue.occurrences} time(s)</td><td>${htmlEscape(issue.recommendation || 'Review and correct the affected component.')}</td></tr>`).join('')}</tbody></table>` : '<p class="good-text">No normalized UI/UX findings were produced for this page.</p>'}
    </section>`;
  }).join('');

  const priorityRows = summary.priorityActions.map((issue) => `<tr><td><span class="pill ${htmlEscape(issue.severity)}">${htmlEscape(issue.severity)}</span></td><td><strong>${htmlEscape(issue.title)}</strong><br><span class="muted">${htmlEscape(issue.pages.join(', '))}</span></td><td>${issue.occurrences}</td><td>${htmlEscape(issue.recommendation || 'Review and correct the affected component.')}</td></tr>`).join('');
  const surfaceRows = summary.surfaceDifferences.map((entry) => `<tr><td>${htmlEscape(entry.label)}</td><td>${htmlEscape(Object.entries(entry.counts || {}).map(([name, count]) => `${name}: ${count}`).join(' | '))}</td><td>${htmlEscape(entry.missing.join(', ') || '-')}</td></tr>`).join('');
  const differentControlRows = summary.differentControls.slice(0, 30).map((entry) => `<tr><td>${htmlEscape(entry.type)}</td><td><strong>${htmlEscape(entry.label)}</strong></td><td>${htmlEscape(entry.pages.join(', '))}</td><td>${htmlEscape(entry.missing.join(', ') || '-')}</td></tr>`).join('');
  const commonControlNames = summary.commonControls.slice(0, 30).map((entry) => htmlEscape(entry.label)).join(', ');
  const caseMatrix = caseExecutionMatrix(pages, cases);
  const executeFirstCount = cases.filter((item) => ['P1', 'P2'].includes(item.priority)).length;
  const caseMatrixRows = caseMatrix.map((entry) => `<tr><td><strong>${htmlEscape(entry.name)}</strong></td><td>${entry.p1}</td><td>${entry.p2}</td><td><strong>${entry.executeFirst}</strong></td><td>${entry.p3}</td><td>${entry.p4}</td><td>${entry.total}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Report - ${htmlEscape(project.name)}</title>
<style>
@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#152238;background:#f4f7fb;margin:0;line-height:1.45}main{max-width:1180px;margin:auto;background:#fff;padding:38px}.cover{min-height:650px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#0b1f3a,#174ea6 62%,#1a73e8);color:#fff;padding:58px;border-radius:18px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:700}.cover h1{font-size:44px;line-height:1.08;margin:18px 0}.cover .meta{font-size:16px;opacity:.9}.result{font-size:30px;font-weight:800;letter-spacing:.04em;margin:24px 0 8px}.result.bad{color:#ffd6d6}.result.warning{color:#ffe9a8}.result.good{color:#c9f7d5}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}.metric{background:#f7f9fc;border:1px solid #dce4ef;border-radius:12px;padding:18px}.metric b{display:block;font-size:28px;color:#174ea6}.cover .metric{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25)}.cover .metric b{color:#fff}h2{color:#102a43;border-bottom:2px solid #d9e6f7;padding-bottom:8px;margin-top:34px}h3{color:#243b53;margin-top:26px}table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0 22px}th{background:#eaf2ff;text-align:left;color:#163968}th,td{padding:8px;border:1px solid #dbe3ed;vertical-align:top}.pill{display:inline-block;border-radius:99px;padding:2px 8px;background:#e5e7eb;font-size:10px;text-transform:uppercase;font-weight:700}.pill.fail,.pill.critical{background:#fee2e2;color:#991b1b}.pill.major{background:#ffedd5;color:#9a3412}.pill.minor,.pill.review{background:#fef3c7;color:#92400e}.pill.info,.pill.common{background:#dbeafe;color:#1e40af}.muted{color:#62748a}.good-text{color:#137333}.url{font-family:ui-monospace,Consolas,monospace;font-size:11px;overflow-wrap:anywhere}.notice{border-left:5px solid #f59e0b;background:#fff8e6;padding:14px 18px;margin:18px 0}.evidence-grid{display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start}.evidence-grid figure,.comparison-grid figure{margin:0;border:1px solid #d8e1ed;border-radius:10px;padding:8px;background:#f8fafc;break-inside:avoid}.evidence-grid img{display:block;width:100%;max-height:680px;object-fit:contain;background:#eef2f7}.comparison-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:start}.comparison-grid img{display:block;width:100%;height:340px;object-fit:contain;object-position:top;background:#eef2f7}.evidence-grid figcaption,.comparison-grid figcaption{text-align:center;font-size:11px;color:#607086;margin-top:6px}.no-shot{height:180px;display:grid;place-items:center;background:#eef2f7;color:#62748a}.page-break{break-before:page}.avoid{break-inside:avoid}ol{padding-left:22px}li{margin:8px 0}@media(max-width:760px){main{padding:18px}.metrics{grid-template-columns:repeat(2,1fr)}.evidence-grid,.comparison-grid{grid-template-columns:1fr}.cover h1{font-size:34px}}@media print{body{background:#fff}main{max-width:none;padding:0}.cover{border-radius:0}.page-break{break-before:page}}
</style></head><body><main>
<section class="cover"><div class="eyebrow">QA Copilot / single clear report</div><h1>${htmlEscape(project.name)}</h1><div class="result ${summary.statusClass}">${htmlEscape(summary.overallStatus)}</div><p>UI/UX, accessibility, responsive behavior, clickable controls, content, performance, and passive security review.</p><div class="metrics"><div class="metric"><b>${summary.validPages}/${pages.length}</b>pages reviewed</div><div class="metric"><b>${summary.screenshots}</b>screenshots</div><div class="metric"><b>${summary.fixFamilies.length}</b>issue families to fix</div><div class="metric"><b>${cases.length}</b>cases prepared</div></div><p class="meta">Generated ${htmlEscape(run.generatedLocal)} (${htmlEscape(run.timezone)})</p></section>
<section><h2>Start here</h2><p><strong>Overall result: ${htmlEscape(summary.overallStatus)}.</strong> This section shows the decisions and actions that matter first.</p><div class="notice"><strong>Important:</strong> the URL scan and generated cases are evidence and test design. Cases remain <em>Not Run</em> until a tester or automation runner records Pass or Fail.</div><h3>Fix first</h3>${priorityRows ? `<table><thead><tr><th>Severity</th><th>Finding and pages</th><th>Seen</th><th>Action</th></tr></thead><tbody>${priorityRows}</tbody></table>` : '<p class="good-text">No normalized issue families were produced.</p>'}</section>
<section><h2>Page-by-page result</h2><table><thead><tr><th>Page</th><th>Result</th><th>Fix</th><th>Review</th><th>Cases prepared</th></tr></thead><tbody>${pages.map((page) => { const counts = pageCounts(page); return `<tr><td><strong>${htmlEscape(page.page?.name || page.url)}</strong><div class="url">${htmlEscape(page.url)}</div></td><td><strong>${htmlEscape(pageDecision(page))}</strong></td><td>${counts.failures}</td><td>${counts.reviews}</td><td>${page.caseCount || 0}</td></tr>`; }).join('')}</tbody></table></section>
<section class="page-break"><h2>Visual comparison</h2><p class="muted">Desktop evidence is shown together so layout and content differences are easy to spot. Detailed desktop and mobile evidence follows for each page.</p><div class="comparison-grid">${visualCards}</div></section>
<section><h2>What is different or missing?</h2><p class="muted">These are observed differences. Confirm with product/design whether each difference is intentional; absence alone is not automatically a defect.</p><h3>Component-count differences</h3>${surfaceRows ? `<table><thead><tr><th>Area</th><th>Count on each page</th><th>Not seen on</th></tr></thead><tbody>${surfaceRows}</tbody></table>` : '<p class="good-text">No component-count differences were observed.</p>'}<h3>Page-specific or missing controls</h3>${differentControlRows ? `<table><thead><tr><th>Type</th><th>Control</th><th>Seen on</th><th>Not seen on</th></tr></thead><tbody>${differentControlRows}</tbody></table>` : '<p class="good-text">No page-specific controls were observed.</p>'}<h3>Common controls</h3><p>${commonControlNames || 'No named control was common to every reviewed page.'}</p></section>
${screenshotSections}
<section class="page-break"><h2>Cases to execute</h2><p><strong>${executeFirstCount} P1/P2 cases should be executed first.</strong> P1 covers the highest release risk; P2 should be completed before release. P3 and P4 provide extended regression coverage.</p><div class="notice"><strong>Tester file:</strong> supporting-evidence/test-cases/01-Execute-First-P1-P2.xlsx</div><div class="metrics">${Object.entries(byPriority).sort().map(([name, count]) => `<div class="metric"><b>${count}</b>${htmlEscape(name)}</div>`).join('')}</div><h3>Priority by page</h3><table><thead><tr><th>Page</th><th>P1</th><th>P2</th><th>Execute first</th><th>P3</th><th>P4</th><th>Total</th></tr></thead><tbody>${caseMatrixRows}</tbody></table><h3>Coverage by category</h3><table><thead><tr><th>Category</th><th>Cases</th><th>Share</th></tr></thead><tbody>${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<tr><td>${htmlEscape(name)}</td><td>${count}</td><td>${cases.length ? Math.round(count / cases.length * 100) : 0}%</td></tr>`).join('')}</tbody></table><h2>Next steps</h2><ol><li>Fix common high-severity findings first, then page-specific findings.</li><li>Confirm whether every page-specific or missing control is intentional.</li><li>Execute P1 and P2 cases and record the actual result.</li><li>Authenticate and rerun any login, error, or empty page.</li></ol><div class="notice"><strong>Scope limit:</strong> passive security review does not replace an authorized penetration test. Hidden workflows, role behavior, state transitions, and business rules need authenticated journeys and product requirements.</div></section>
</main></body></html>`;
}

export async function renderPdf(htmlFile, pdfFile) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(pathToFileURL(path.resolve(htmlFile)).href, { waitUntil: 'networkidle', timeout: 60000 });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete
        ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = resolve; })));
    });
    await page.pdf({
      path: path.resolve(pdfFile),
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
  } finally {
    await browser.close();
  }
  return path.resolve(pdfFile);
}
