import { buildManualCases } from './manual-cases.mjs';

const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i;
const FILE_EXTENSION = /\.(?:png|jpe?g|webp|gif|svg|json|html?|md|txt|csv|zip|pdf)(?:[?#].*)?$/i;

const asArray = (value) => (Array.isArray(value) ? value : []);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function normalizeWord(value, fallback = 'unknown') {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatLabel(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return 'Not recorded';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return `${minutes} min ${seconds} s`;
}

function safeJson(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
      return item;
    }, 2);
  } catch {
    return String(value);
  }
}

function safeRelativeAsset(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const normalized = rawPath.trim().replace(/\\/g, '/');
  if (!normalized) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return null;
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('/') || normalized.startsWith('//')) return null;
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.');
  if (!segments.length || segments.some((segment) => segment === '..')) return null;
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function assetPath(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return value.path || value.file || value.href || value.relativePath || null;
}

function captureId(capture, index) {
  return String(capture?.id || capture?.captureId || capture?.key || `capture-${index + 1}`);
}

function captureLabel(capture, index) {
  const viewport = capture?.viewport?.name || capture?.viewportName || capture?.profile || '';
  const theme = capture?.theme || capture?.colorScheme || '';
  const checkpoint = capture?.checkpoint || capture?.name || capture?.label || '';
  return unique([checkpoint, viewport, theme]).join(' / ') || captureId(capture, index);
}

function captureScreenshotValues(capture) {
  return [
    capture?.screenshot,
    capture?.screenshotPath,
    capture?.fullPageScreenshot,
    capture?.artifacts?.screenshot,
    capture?.artifacts?.fullPage,
    ...asArray(capture?.screenshots),
    ...asArray(capture?.artifacts?.screenshots),
  ];
}

function collectArtifacts(audit) {
  const entries = [];
  const seenPaths = new Set();
  const add = (candidate, label, metadata = {}) => {
    const path = assetPath(candidate);
    if (!path || !FILE_EXTENSION.test(path) || seenPaths.has(path)) return;
    seenPaths.add(path);
    entries.push({ label, path, ...metadata });
  };

  asArray(audit?.captures).forEach((capture, index) => {
    captureScreenshotValues(capture).forEach((candidate, screenshotIndex) => add(
      candidate,
      `${captureLabel(capture, index)} screenshot${screenshotIndex ? ` ${screenshotIndex + 1}` : ''}`,
      { captureId: captureId(capture, index), source: 'capture' },
    ));
  });

  asArray(audit?.reference?.captures).forEach((capture, index) => {
    captureScreenshotValues(capture).forEach((candidate, screenshotIndex) => add(
      candidate,
      captureLabel(capture, index) + ' reference screenshot' + (screenshotIndex ? ' ' + (screenshotIndex + 1) : ''),
      { captureId: captureId(capture, index), source: 'reference' },
    ));
  });

  const walk = (value, label, depth = 0, ancestry = new WeakSet()) => {
    if (depth > 5 || value === undefined || value === null) return;
    if (typeof value === 'string') {
      add(value, label, { source: 'artifact' });
      return;
    }
    if (typeof value !== 'object') return;
    if (ancestry.has(value)) return;
    ancestry.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${label} ${index + 1}`, depth + 1, ancestry));
      ancestry.delete(value);
      return;
    }

    const direct = assetPath(value);
    if (direct) add(direct, value.label || value.name || label, { source: 'artifact' });
    for (const [key, child] of Object.entries(value)) {
      if (['path', 'file', 'href', 'relativePath'].includes(key)) continue;
      walk(child, `${label}: ${formatLabel(key)}`, depth + 1, ancestry);
    }
    ancestry.delete(value);
  };

  walk(audit?.artifacts, 'Audit artifact');
  walk(audit?.comparison?.artifacts, 'Comparison artifact');
  walk(audit?.comparison?.screenshots, 'Comparison screenshot');
  return entries;
}

function renderAssetLink(entry, { image = false } = {}) {
  const href = safeRelativeAsset(entry.path);
  const label = escapeHtml(entry.label || entry.path || 'Artifact');
  const displayedPath = escapeHtml(entry.path || '');
  if (!href) {
    return `<div class="asset unavailable"><strong>${label}</strong><code>${displayedPath}</code><span>Not linked because the path is not a safe relative artifact path.</span></div>`;
  }
  if (!image) {
    return `<a class="artifact-link" href="${escapeHtml(href)}"><strong>${label}</strong><code>${displayedPath}</code></a>`;
  }
  return `<figure class="screenshot">
    <a href="${escapeHtml(href)}"><img src="${escapeHtml(href)}" alt="${label}" loading="lazy"></a>
    <figcaption><strong>${label}</strong><code>${displayedPath}</code></figcaption>
  </figure>`;
}

function renderStructured(value, depth = 0, ancestry = new WeakSet()) {
  if (value === null || value === undefined) return '<span class="muted">Not recorded</span>';
  if (typeof value === 'boolean') return `<span>${value ? 'Yes' : 'No'}</span>`;
  if (typeof value === 'number' || typeof value === 'bigint') return `<span>${escapeHtml(value)}</span>`;
  if (typeof value === 'string') return `<span class="break-anywhere">${escapeHtml(value)}</span>`;
  if (typeof value !== 'object') return `<span>${escapeHtml(String(value))}</span>`;
  if (ancestry.has(value)) return '<span class="muted">Circular reference</span>';
  if (depth > 4) return `<pre>${escapeHtml(safeJson(value))}</pre>`;

  ancestry.add(value);
  let html;
  if (Array.isArray(value)) {
    if (!value.length) html = '<span class="muted">None</span>';
    else if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      html = `<div class="chips">${value.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>`;
    } else {
      const visible = value.slice(0, 200);
      html = `<ol class="structured-list">${visible.map((item) => `<li>${renderStructured(item, depth + 1, ancestry)}</li>`).join('')}</ol>${value.length > visible.length ? `<p class="muted">${value.length - visible.length} additional entries omitted from the visual report.</p>` : ''}`;
    }
  } else {
    const entries = Object.entries(value);
    if (!entries.length) html = '<span class="muted">None</span>';
    else {
      html = `<dl class="key-values">${entries.map(([key, item]) => `<div><dt>${escapeHtml(formatLabel(key))}</dt><dd>${renderStructured(item, depth + 1, ancestry)}</dd></div>`).join('')}</dl>`;
    }
  }
  ancestry.delete(value);
  return html;
}

function issueClass(issue) {
  return String(issue?.class || issue?.classification || issue?.kind || '').toLowerCase();
}

function issueStatus(issue) {
  return String(issue?.status || '').toLowerCase();
}

function splitIssues(issues) {
  const objectiveFailures = [];
  const heuristicReviews = [];
  const other = [];
  for (const issue of issues) {
    const classification = issueClass(issue);
    const status = issueStatus(issue);
    if (status === 'fail' && classification !== 'heuristic') objectiveFailures.push(issue);
    else if (classification === 'heuristic' || status === 'review') heuristicReviews.push(issue);
    else other.push(issue);
  }
  return { objectiveFailures, heuristicReviews, other };
}

function badge(value, kind = '') {
  const normalized = normalizeWord(value);
  const allowed = new Set([
    'critical', 'major', 'minor', 'info', 'fail', 'review', 'pass', 'blocked',
    'objective', 'heuristic', 'complete', 'completed', 'success', 'invalid-capture',
  ]);
  const className = allowed.has(normalized) ? normalized : 'neutral';
  return `<span class="badge ${className}${kind ? ` ${kind}` : ''}">${escapeHtml(formatLabel(value || 'Unknown'))}</span>`;
}

function issueLocation(issue) {
  const location = issue?.location || {};
  const viewport = location.viewport;
  return {
    capture: location.captureId || null,
    checkpoint: location.checkpoint || null,
    viewport: viewport
      ? [viewport.name, viewport.width && viewport.height ? `${viewport.width}×${viewport.height}` : null].filter(Boolean).join(' · ')
      : location.viewportName || null,
    theme: location.theme || null,
    selector: location.selector || null,
    stableKey: location.stableKey || null,
    url: location.url || null,
  };
}

function renderIssue(issue, index, captureArtifacts) {
  const location = issueLocation(issue);
  const details = [
    ['Rule', issue?.ruleId],
    ['Category', issue?.category],
    ['Confidence', issue?.confidence],
    ['Capture', location.capture],
    ['Checkpoint', location.checkpoint],
    ['Viewport', location.viewport],
    ['Theme', location.theme],
    ['Selector', location.selector],
    ['Stable key', location.stableKey],
    ['URL', location.url],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  const evidence = location.capture ? captureArtifacts.get(String(location.capture)) || [] : [];

  return `<article class="finding" id="finding-${index + 1}">
    <div class="finding-head">
      <div class="badges">
        ${badge(issue?.class || issue?.classification || 'unclassified')}
        ${badge(issue?.status || 'unknown')}
        ${badge(issue?.severity || 'unknown')}
      </div>
      <h4>${escapeHtml(issue?.title || issue?.message || 'Untitled finding')}</h4>
      <code>${escapeHtml(issue?.id || issue?.ruleId || `finding-${index + 1}`)}</code>
    </div>
    ${issue?.message && issue?.message !== issue?.title ? `<p>${escapeHtml(issue.message)}</p>` : ''}
    ${details.length ? `<dl class="finding-meta">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(typeof value === 'string' ? value : safeJson(value))}</dd></div>`).join('')}</dl>` : ''}
    <div class="finding-evidence">
      ${issue?.actual !== undefined ? `<section><h5>Observed</h5>${renderStructured(issue.actual)}</section>` : ''}
      ${issue?.expected !== undefined ? `<section><h5>Expected</h5>${renderStructured(issue.expected)}</section>` : ''}
      ${issue?.recommendation ? `<section><h5>Recommendation</h5><p>${escapeHtml(issue.recommendation)}</p></section>` : ''}
    </div>
    ${evidence.length ? `<div class="evidence-links"><strong>Capture evidence</strong>${evidence.map((entry) => renderAssetLink(entry)).join('')}</div>` : ''}
  </article>`;
}

function renderFindingGroup(title, description, issues, allIssues, captureArtifacts, emptyText) {
  return `<section class="result-group">
    <div class="section-heading">
      <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
      <span class="count">${issues.length}</span>
    </div>
    ${issues.length
      ? issues.map((issue) => renderIssue(issue, allIssues.indexOf(issue), captureArtifacts)).join('')
      : `<p class="empty-note">${escapeHtml(emptyText)}</p>`}
  </section>`;
}

function inventoryForCapture(capture) {
  const candidates = [
    capture?.tokens,
    capture?.tokenInventory,
    capture?.inventory,
    capture?.designTokens,
    capture?.styleTokens,
    capture?.analysis?.tokens,
    capture?.page?.tokens,
  ].filter((value) => value && typeof value === 'object');

  const direct = {};
  for (const key of [
    'fontFamilies', 'fontSizes', 'fontWeights', 'lineHeights', 'letterSpacings',
    'colors', 'palette', 'foregroundColors', 'backgroundColors', 'borderColors',
    'radii', 'borderRadii', 'shadows', 'spacing', 'buttonVariants', 'inputVariants',
  ]) {
    if (capture?.[key] !== undefined) direct[key] = capture[key];
  }
  if (Object.keys(direct).length) candidates.push(direct);
  if (!candidates.length) return null;
  return candidates.length === 1 ? candidates[0] : Object.assign({}, ...candidates);
}

function renderCapture(capture, index, artifacts) {
  const id = captureId(capture, index);
  const viewport = capture?.viewport || {};
  const screenshotCount = (artifacts.get(id) || []).length;
  const valid = capture?.valid !== false && capture?.status !== 'invalid' && capture?.status !== 'failed';
  const elementCount = Array.isArray(capture?.elements)
    ? capture.elements.length
    : capture?.elements?.total ?? capture?.stats?.elements ?? capture?.elementCount;
  const rows = [
    ['Capture ID', id],
    ['Checkpoint', capture?.checkpoint || capture?.name || capture?.label],
    ['Viewport', viewport?.name || capture?.viewportName || capture?.profile],
    ['Dimensions', viewport?.width && viewport?.height ? `${viewport.width}×${viewport.height}` : null],
    ['Theme', capture?.theme || capture?.colorScheme],
    ['Status', capture?.status || (valid ? 'valid' : 'invalid')],
    ['Elements sampled', elementCount],
    ['Screenshots', screenshotCount],
    ['URL', capture?.finalUrl || capture?.url],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  const errors = capture?.errors || capture?.error || capture?.invalidReason;
  return `<article class="capture-card">
    <div class="capture-title"><h4>${escapeHtml(captureLabel(capture, index))}</h4>${badge(valid ? 'pass' : 'invalid-capture')}</div>
    <dl class="key-values compact">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    ${errors ? `<div class="callout danger"><strong>Capture problem</strong>${renderStructured(errors)}</div>` : ''}
  </article>`;
}

function renderManualCase(testCase, issueAnchors) {
  const evidence = testCase.evidence || {};
  const issueLinks = asArray(evidence.relatedIssues).map((issue) => {
    const anchor = issueAnchors.get(String(issue.id || issue.ruleId || ''));
    const label = escapeHtml(issue.id || issue.ruleId || issue.title || 'Finding');
    return anchor ? `<a class="chip" href="#${anchor}">${label}</a>` : `<span class="chip">${label}</span>`;
  }).join('');
  const screenshotLinks = asArray(evidence.screenshots).map((path, index) => renderAssetLink({
    label: `Screenshot ${index + 1}`,
    path,
  })).join('');

  return `<details class="manual-case">
    <summary><span><code>${escapeHtml(testCase.id)}</code> ${escapeHtml(testCase.title)}</span><span class="category">${escapeHtml(testCase.category)}</span></summary>
    <div class="manual-body">
      <h5>Preconditions</h5>
      <ul>${asArray(testCase.preconditions).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <h5>Steps</h5>
      <ol>${asArray(testCase.steps).map((step) => `<li>${escapeHtml(typeof step === 'string' ? step : step.action)}</li>`).join('')}</ol>
      <h5>Expected result</h5>
      <p>${escapeHtml(testCase.expectedResult)}</p>
      <p><strong>Automation:</strong> Manual judgement required.</p>
      ${issueLinks || screenshotLinks ? `<div class="case-evidence"><h5>Audit evidence</h5>${issueLinks ? `<div class="chips">${issueLinks}</div>` : ''}${screenshotLinks}</div>` : ''}
    </div>
  </details>`;
}

function targetRows(audit) {
  const target = audit?.target || {};
  return [
    ['Requested URL', target.url],
    ['Final URL', target.finalUrl],
    ['Page title', target.title],
    ['Browser', [target.browser, target.browserVersion].filter(Boolean).join(' ')],
    ['Started', audit?.startedAt],
    ['Completed', audit?.completedAt],
    ['Duration', formatDuration(audit?.durationMs)],
    ['Schema version', audit?.schemaVersion],
    ['Run ID', audit?.runId],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function renderMetric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function captureArtifactMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.captureId) continue;
    const key = String(entry.captureId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
}

function issueAnchorMap(issues) {
  const map = new Map();
  issues.forEach((issue, index) => {
    for (const key of [issue?.id, issue?.ruleId]) {
      if (key !== undefined && key !== null && key !== '') map.set(String(key), `finding-${index + 1}`);
    }
  });
  return map;
}

/** Build a small machine-readable companion for the rendered report. */
export function buildManifest(audit = {}) {
  const issues = asArray(audit?.issues);
  const groups = splitIssues(issues);
  const artifacts = collectArtifacts(audit);
  const manualCases = buildManualCases(audit);
  const testCases = asArray(audit?.testCases);
  return {
    kind: 'uiux-audit-report',
    schemaVersion: audit?.schemaVersion || null,
    runId: audit?.runId || null,
    executionStatus: audit?.executionStatus || null,
    verdict: audit?.verdict || null,
    startedAt: audit?.startedAt || null,
    completedAt: audit?.completedAt || null,
    durationMs: Number.isFinite(audit?.durationMs) ? audit.durationMs : null,
    target: {
      url: audit?.target?.url || null,
      finalUrl: audit?.target?.finalUrl || null,
      title: audit?.target?.title || null,
      browser: audit?.target?.browser || null,
      browserVersion: audit?.target?.browserVersion || null,
    },
    resultOrganization: audit?.resultOrganization || null,
    counts: {
      captures: asArray(audit?.captures).length,
      issues: issues.length,
      objectiveFailures: groups.objectiveFailures.length,
      heuristicReviews: groups.heuristicReviews.length,
      otherFindings: groups.other.length,
      securityFindings: issues.filter((issue) => issue?.category === 'Security').length,
      manualCases: manualCases.length,
      testCases: testCases.length,
      frameworkChecks: audit?.framework?.counts?.total || 0,
      frameworkPassed: audit?.framework?.counts?.pass || 0,
      frameworkFailed: audit?.framework?.counts?.fail || 0,
    },
    releaseDecision: audit?.actionPlan?.decision || null,
    frameworkVersion: audit?.framework?.version || null,
    securityScope: audit?.securityScope || null,
    comparisonIncluded: audit?.comparison !== undefined && audit?.comparison !== null,
    artifacts: artifacts.map((entry) => ({
      label: entry.label,
      path: entry.path,
      captureId: entry.captureId || null,
      relative: Boolean(safeRelativeAsset(entry.path)),
    })),
    manualCaseIds: manualCases.map((testCase) => testCase.id),
    testCaseIds: testCases.map((testCase) => testCase.id),
  };
}

/**
 * Render a dependency-free, offline HTML audit report. Dynamic values are
 * escaped before insertion, and only safe relative artifact paths are linked.
 */
export function renderHtmlReport(audit = {}) {
  const captures = asArray(audit?.captures);
  const issues = asArray(audit?.issues);
  const groups = splitIssues(issues);
  const manualCases = buildManualCases(audit);
  const artifacts = collectArtifacts(audit);
  const screenshots = artifacts.filter((entry) => IMAGE_EXTENSION.test(entry.path));
  const otherArtifacts = artifacts.filter((entry) => !IMAGE_EXTENSION.test(entry.path));
  const artifactsByCapture = captureArtifactMap(screenshots);
  const anchors = issueAnchorMap(issues);
  const summary = audit?.summary || {};
  const captureSummary = summary?.captures || audit?.coverage?.captures || {};
  const objectiveCount = summary?.objectiveFailures ?? groups.objectiveFailures.length;
  const reviewCount = summary?.heuristicReviews ?? groups.heuristicReviews.length;
  const totalIssues = summary?.totalIssues ?? issues.length;
  const colorGrade = audit?.colorGrade?.grade || summary?.colorGrade || 'NOT TESTED';
  const colorGradeClass = colorGrade === 'PASS' ? 'good'
    : colorGrade === 'REVIEW' ? 'review'
      : colorGrade === 'FAIL' || colorGrade === 'BLOCKED' ? 'danger' : '';
  const validCaptures = captureSummary?.valid ?? captures.filter((capture) => capture?.valid !== false && capture?.status !== 'invalid' && capture?.status !== 'failed').length;
  const totalCaptures = captureSummary?.total ?? captures.length;
  const reportTitle = audit?.target?.title
    ? `UI/UX audit — ${audit.target.title}`
    : 'UI/UX audit report';
  const inventories = captures
    .map((capture, index) => ({ capture, index, inventory: inventoryForCapture(capture) }))
    .filter((entry) => entry.inventory);
  const verdictClass = ['pass', 'fail', 'review', 'invalid-capture'].includes(normalizeWord(audit?.verdict))
    ? normalizeWord(audit.verdict)
    : 'neutral';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    :root { color-scheme: light; --ink:#18202b; --muted:#5d6978; --line:#dbe2ea; --soft:#f5f7fa; --panel:#fff; --blue:#175cd3; --red:#b42318; --red-bg:#fff1f0; --amber:#8a4b08; --amber-bg:#fff8e8; --green:#067647; --green-bg:#ecfdf3; --purple:#6941c6; --purple-bg:#f4f3ff; --shadow:0 2px 10px rgba(16,24,40,.07); }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:#eef2f6; color:var(--ink); font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
    a { color:var(--blue); }
    a:focus-visible, summary:focus-visible { outline:3px solid #84adff; outline-offset:3px; }
    code, pre { font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace; }
    code { overflow-wrap:anywhere; }
    pre { margin:.5rem 0; padding:.75rem; overflow:auto; border:1px solid var(--line); border-radius:8px; background:var(--soft); white-space:pre-wrap; word-break:break-word; }
    h1,h2,h3,h4,h5 { line-height:1.25; }
    h1 { margin:.25rem 0 .5rem; font-size:clamp(1.8rem,4vw,2.6rem); }
    h2 { margin:0 0 1rem; font-size:1.55rem; }
    h3 { margin:0; font-size:1.15rem; }
    h4 { margin:.25rem 0; font-size:1rem; }
    h5 { margin:1rem 0 .35rem; font-size:.9rem; }
    p { margin:.45rem 0; }
    .skip-link { position:fixed; top:8px; left:8px; z-index:100; padding:.65rem 1rem; background:#fff; border:2px solid var(--blue); transform:translateY(-160%); }
    .skip-link:focus { transform:none; }
    .hero { background:#101828; color:#fff; padding:2.5rem max(1.25rem,calc((100vw - 1180px)/2)); }
    .hero p { color:#d0d5dd; max-width:78ch; }
    .eyebrow { margin:0; color:#a4bcfd!important; font-size:.78rem; font-weight:750; letter-spacing:.1em; text-transform:uppercase; }
    .hero-meta { display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; margin-top:1rem; }
    .verdict { display:inline-flex; align-items:center; border-radius:999px; padding:.4rem .75rem; font-size:.85rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .verdict.pass { background:#12b76a; color:#071d14; }
    .verdict.fail, .verdict.invalid-capture { background:#f97066; color:#2b0805; }
    .verdict.review { background:#fdb022; color:#2d1900; }
    .verdict.neutral { background:#98a2b3; color:#101828; }
    nav { position:sticky; top:0; z-index:10; overflow:auto; background:#fff; border-bottom:1px solid var(--line); box-shadow:0 2px 8px rgba(16,24,40,.06); }
    nav div { display:flex; width:max-content; min-width:100%; max-width:1180px; margin:auto; padding:0 max(1rem,calc((100vw - 1180px)/2)); }
    nav a { padding:.8rem .7rem; color:#344054; font-size:.86rem; font-weight:650; text-decoration:none; white-space:nowrap; }
    nav a:hover { background:var(--soft); color:#101828; }
    main { max-width:1180px; margin:auto; padding:1.5rem 1rem 4rem; }
    .report-section { margin:1.2rem 0; padding:1.3rem; border:1px solid var(--line); border-radius:14px; background:var(--panel); box-shadow:var(--shadow); }
    .section-intro { color:var(--muted); max-width:85ch; }
    .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.75rem; margin:1rem 0; }
    .metric { min-height:86px; padding:.85rem; border:1px solid var(--line); border-radius:10px; background:var(--soft); }
    .metric span { display:block; color:var(--muted); font-size:.78rem; font-weight:700; text-transform:uppercase; }
    .metric strong { display:block; margin-top:.3rem; font-size:1.5rem; }
    .metric.danger { border-color:#fecdca; background:var(--red-bg); }
    .metric.review { border-color:#fedf89; background:var(--amber-bg); }
    .metric.good { border-color:#abefc6; background:var(--green-bg); }
    .key-values { margin:.5rem 0; }
    .key-values>div { display:grid; grid-template-columns:minmax(130px,220px) minmax(0,1fr); gap:.75rem; padding:.55rem 0; border-bottom:1px solid #eaecf0; }
    .key-values>div:last-child { border-bottom:0; }
    .key-values dt { color:var(--muted); font-size:.82rem; font-weight:700; }
    .key-values dd { min-width:0; margin:0; }
    .key-values.compact>div { grid-template-columns:110px minmax(0,1fr); padding:.35rem 0; }
    .chips { display:flex; flex-wrap:wrap; gap:.35rem; }
    .chip, a.chip { display:inline-block; max-width:100%; padding:.2rem .48rem; border:1px solid #d0d5dd; border-radius:999px; background:#fff; color:#344054; font-size:.77rem; overflow-wrap:anywhere; text-decoration:none; }
    a.chip:hover { border-color:#84adff; color:var(--blue); }
    .badge { display:inline-flex; padding:.18rem .46rem; border-radius:999px; background:#eaecf0; color:#344054; font-size:.72rem; font-weight:800; letter-spacing:.02em; }
    .badge.fail,.badge.critical,.badge.invalid-capture { background:#fee4e2; color:#912018; }
    .badge.review,.badge.major { background:#fef0c7; color:#7a2e0e; }
    .badge.pass { background:#dcfae6; color:#085d3a; }
    .badge.heuristic { background:var(--purple-bg); color:var(--purple); }
    .badge.objective { background:#eaf2ff; color:#1849a9; }
    .badges { display:flex; flex-wrap:wrap; gap:.35rem; }
    .section-heading { display:flex; align-items:start; justify-content:space-between; gap:1rem; margin:1.4rem 0 .75rem; }
    .section-heading p { margin:.25rem 0; color:var(--muted); max-width:80ch; }
    .count { min-width:2.1rem; padding:.3rem .55rem; border-radius:999px; background:#eaecf0; text-align:center; font-weight:800; }
    .finding { margin:.7rem 0; padding:1rem; border:1px solid var(--line); border-left:5px solid #98a2b3; border-radius:10px; background:#fff; }
    .result-group:first-of-type .finding { border-left-color:var(--red); }
    .result-group:nth-of-type(2) .finding { border-left-color:#f79009; }
    .finding-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.35rem 1rem; align-items:start; }
    .finding-head .badges { grid-column:1/-1; }
    .finding-head code { color:var(--muted); font-size:.75rem; }
    .finding-meta { display:flex; flex-wrap:wrap; gap:.45rem 1.1rem; margin:.7rem 0; padding:.65rem; border-radius:8px; background:var(--soft); }
    .finding-meta div { min-width:120px; }
    .finding-meta dt { color:var(--muted); font-size:.7rem; font-weight:750; text-transform:uppercase; }
    .finding-meta dd { margin:0; overflow-wrap:anywhere; }
    .finding-evidence { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.75rem; }
    .finding-evidence section { padding:.65rem; border:1px solid var(--line); border-radius:8px; }
    .finding-evidence h5 { margin:0 0 .35rem; }
    .evidence-links { margin-top:.7rem; }
    .evidence-links .artifact-link { margin:.35rem .35rem 0 0; }
    .empty-note { padding:1rem; border:1px dashed #98a2b3; border-radius:9px; color:var(--muted); background:var(--soft); }
    .capture-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:.75rem; }
    .capture-card { padding:.85rem; border:1px solid var(--line); border-radius:10px; }
    .capture-title { display:flex; align-items:start; justify-content:space-between; gap:.5rem; }
    .capture-title h4 { margin:0; }
    .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:1rem; }
    .screenshot { margin:0; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:var(--soft); }
    .screenshot a { display:block; background:repeating-conic-gradient(#eaecf0 0 25%,#f9fafb 0 50%) 50%/20px 20px; }
    .screenshot img { display:block; width:100%; max-height:430px; object-fit:contain; object-position:top; }
    .screenshot figcaption { padding:.65rem; }
    .screenshot figcaption strong,.screenshot figcaption code { display:block; }
    .screenshot figcaption code { margin-top:.2rem; color:var(--muted); font-size:.72rem; }
    .artifact-link,.asset.unavailable { display:inline-flex; flex-direction:column; max-width:100%; margin:.25rem 0; padding:.5rem .65rem; border:1px solid var(--line); border-radius:8px; background:var(--soft); text-decoration:none; }
    .artifact-link code,.asset code { color:var(--muted); font-size:.72rem; overflow-wrap:anywhere; }
    .asset.unavailable span { color:var(--red); font-size:.74rem; }
    details.inventory,details.manual-case { margin:.55rem 0; border:1px solid var(--line); border-radius:9px; background:#fff; }
    details>summary { cursor:pointer; padding:.75rem; font-weight:700; }
    details.inventory>div,.manual-body { padding:0 .9rem .9rem; }
    .manual-case>summary { display:flex; align-items:start; justify-content:space-between; gap:1rem; }
    .manual-case .category { color:var(--muted); font-size:.78rem; white-space:nowrap; }
    .manual-body li { margin:.25rem 0; }
    .case-evidence { padding:.7rem; border-radius:8px; background:var(--soft); }
    .case-evidence h5 { margin-top:0; }
    .callout { margin:.75rem 0; padding:.7rem; border-radius:8px; }
    .callout.danger { border:1px solid #fecdca; background:var(--red-bg); color:#7a271a; }
    .structured-list { margin:.35rem 0; padding-left:1.35rem; }
    .structured-list>li { margin:.4rem 0; }
    .muted { color:var(--muted); }
    .break-anywhere { overflow-wrap:anywhere; }
    footer { max-width:1180px; margin:auto; padding:0 1rem 2.5rem; color:var(--muted); font-size:.8rem; }
    @media (max-width:640px) {
      .key-values>div { grid-template-columns:1fr; gap:.15rem; }
      .finding-head { grid-template-columns:1fr; }
      .finding-head code { grid-column:1; }
      .manual-case>summary { flex-direction:column; }
      .manual-case .category { white-space:normal; }
    }
    @media print {
      body { background:#fff; font-size:11pt; }
      nav,.skip-link { display:none; }
      .hero { padding:1rem; background:#fff; color:#000; border-bottom:2px solid #000; }
      .hero p,.eyebrow { color:#333!important; }
      main { max-width:none; padding:.5rem; }
      .report-section { break-inside:avoid; box-shadow:none; }
      details>summary { list-style:none; }
      details>summary::-webkit-details-marker { display:none; }
      details:not([open])>*:not(summary) { display:block; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to report content</a>
  <header class="hero">
    <p class="eyebrow">Standalone UI/UX + passive security audit</p>
    <h1>${escapeHtml(audit?.target?.title || 'Untitled page')}</h1>
    <p>${escapeHtml(audit?.target?.finalUrl || audit?.target?.url || 'No target URL recorded')}</p>
    <div class="hero-meta">
      <span class="verdict ${verdictClass}">${escapeHtml(formatLabel(audit?.verdict || 'Unknown verdict'))}</span>
      ${badge(audit?.executionStatus || 'unknown')}
      <span>Run <code>${escapeHtml(audit?.runId || 'unidentified')}</code></span>
    </div>
  </header>
  <nav aria-label="Report sections"><div>
    <a href="#overview">Overview</a>
    <a href="#findings">Findings</a>
    <a href="#coverage">Coverage</a>
    <a href="#captures">Captures</a>
    <a href="#tokens">Tokens</a>
    <a href="#comparison">Comparison</a>
    <a href="#manual">Manual checklist</a>
    <a href="#artifacts">Artifacts</a>
  </div></nav>
  <main id="main">
    <section class="report-section" id="overview">
      <h2>Overview</h2>
      <div class="metrics">
        ${renderMetric('Verdict', formatLabel(audit?.verdict || 'Unknown'), verdictClass === 'pass' ? 'good' : verdictClass === 'review' ? 'review' : verdictClass === 'fail' || verdictClass === 'invalid-capture' ? 'danger' : '')}
        ${renderMetric('Total findings', totalIssues)}
        ${renderMetric('Objective failures', objectiveCount, objectiveCount ? 'danger' : 'good')}
        ${renderMetric('Heuristic reviews', reviewCount, reviewCount ? 'review' : '')}
        ${renderMetric('Valid captures', `${validCaptures}/${totalCaptures}`, validCaptures === totalCaptures && totalCaptures ? 'good' : 'danger')}
        ${renderMetric('Color compliance', colorGrade, colorGradeClass)}
        ${renderMetric('Spelling reviews', summary?.spellingFindings ?? 0, summary?.spellingFindings ? 'review' : 'good')}
        ${renderMetric('Axe findings', summary?.accessibilityEngineFindings ?? 0, summary?.accessibilityEngineFindings ? 'review' : 'good')}
        ${renderMetric('Duration', formatDuration(audit?.durationMs))}
        ${renderMetric('Security findings', summary?.securityFindings ?? 0, summary?.securityFindings ? 'review' : 'good')}
      </div>
      <dl class="key-values">${targetRows(audit).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      <h3>Audit configuration</h3>
      ${renderStructured(audit?.config)}
      <h3>Security scope and limits</h3>
      <p class="section-intro">Passive evidence is collected safely and redacted. Server-side controls are never marked passed from browser evidence; generated active-security cases require authorization and controlled execution.</p>
      ${renderStructured(audit?.securityScope || { mode: 'not recorded' })}
      <h3>Audited flow</h3>
      ${audit?.flow ? renderStructured(audit.flow) : '<p class="muted">No multi-step flow was supplied; captures represent direct page states.</p>'}
    </section>

    <section class="report-section" id="findings">
      <h2>Findings</h2>
      <p class="section-intro"><strong>Objective failures</strong> are deterministic measurements or proven unsafe browser-visible conditions. <strong>Heuristic reviews</strong> are evidence-backed design or security-hardening concerns that require context and human judgement. A review item is not presented as a proven vulnerability.</p>
      ${renderFindingGroup(
        'Objective failures',
        'Measured failures suitable for deterministic retesting.',
        groups.objectiveFailures,
        issues,
        artifactsByCapture,
        'No objective failures were recorded by this audit.',
      )}
      ${renderFindingGroup(
        'Heuristic reviews',
        'Potential visual or usability concerns for a human reviewer to accept, reject, or refine.',
        groups.heuristicReviews,
        issues,
        artifactsByCapture,
        'No heuristic review items were recorded by this audit.',
      )}
      ${groups.other.length ? renderFindingGroup(
        'Other findings',
        'Informational, blocked, or otherwise unclassified audit output.',
        groups.other,
        issues,
        artifactsByCapture,
        'No other findings were recorded.',
      ) : ''}
    </section>

    <section class="report-section" id="coverage">
      <h2>Coverage</h2>
      <p class="section-intro">Coverage states what the engine actually inspected. Untested or indeterminate checks are not counted as passes.</p>
      ${renderStructured(audit?.coverage)}
      ${audit?.summary?.byCategory || audit?.summary?.bySeverity ? `<h3>Finding distribution</h3>${renderStructured({ byCategory: audit.summary.byCategory, bySeverity: audit.summary.bySeverity })}` : ''}
    </section>

    <section class="report-section" id="captures">
      <h2>Captures</h2>
      <p class="section-intro">Each capture represents a checkpoint, viewport, and theme combination used as audit evidence.</p>
      ${captures.length ? `<div class="capture-grid">${captures.map((capture, index) => renderCapture(capture, index, artifactsByCapture)).join('')}</div>` : '<p class="empty-note">No captures were supplied. Findings that depend on rendered evidence must be treated as blocked.</p>'}
      <h3>Screenshot evidence</h3>
      ${screenshots.length ? `<div class="gallery">${screenshots.map((entry) => renderAssetLink(entry, { image: true })).join('')}</div>` : '<p class="empty-note">No screenshot artifacts were recorded.</p>'}
    </section>

    <section class="report-section" id="tokens">
      <h2>Token inventories</h2>
      <p class="section-intro">Observed typography, color, radius, shadow, spacing, and component-style values are evidence, not proof that a token is approved.</p>
      ${inventories.length ? inventories.map(({ capture, index, inventory }) => `<details class="inventory"><summary>${escapeHtml(captureLabel(capture, index))}</summary><div>${renderStructured(inventory)}</div></details>`).join('') : '<p class="empty-note">No token inventory was included in the captures.</p>'}
    </section>

    <section class="report-section" id="comparison">
      <h2>Comparison</h2>
      ${audit?.comparison !== undefined && audit?.comparison !== null
        ? `<p class="section-intro">Comparison output is shown as recorded. A visual difference is not automatically a defect; review intended content and rendering changes before accepting a baseline.</p>${renderStructured(audit.comparison)}`
        : '<p class="empty-note">No baseline or reference comparison was requested for this run.</p>'}
    </section>

    <section class="report-section" id="manual">
      <h2>Manual UI/UX checklist</h2>
      <p class="section-intro">These checks cover qualities that cannot be truthfully passed from DOM measurements alone. Each checklist item links the available automated evidence while retaining human ownership of the verdict.</p>
      ${manualCases.map((testCase) => renderManualCase(testCase, anchors)).join('')}
    </section>

    <section class="report-section" id="artifacts">
      <h2>Artifacts</h2>
      <p class="section-intro">Only safe paths relative to this report are clickable. Absolute and parent-directory paths are displayed without a link.</p>
      ${artifacts.length
        ? `<div>${artifacts.map((entry) => renderAssetLink(entry)).join('')}</div>`
        : '<p class="empty-note">No artifacts were recorded.</p>'}
      ${otherArtifacts.length ? `<h3>Non-image artifacts</h3><div>${otherArtifacts.map((entry) => renderAssetLink(entry)).join('')}</div>` : ''}
    </section>
  </main>
  <footer>
    Generated from UI/UX and passive security audit run <code>${escapeHtml(audit?.runId || 'unidentified')}</code>. Automated measurements, security posture, human review, and authorized active tests are deliberately reported separately.
  </footer>
</body>
</html>`;
}
