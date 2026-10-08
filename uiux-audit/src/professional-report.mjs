import { buildActionPlan, buildFrameworkAssessment, buildTestCases } from './framework.mjs';
import { renderHtmlReport } from './report.mjs';

const array = (value) => Array.isArray(value) ? value : [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeLink(value) {
  try {
    const parsed = new URL(String(value));
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function badge(value) {
  const word = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return '<span class="pro-badge ' + escapeHtml(word) + '">' + escapeHtml(String(value || 'Unknown').replace(/-/g, ' ')) + '</span>';
}

function list(items) {
  return '<ol>' + array(items).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ol>';
}

function standards(items) {
  const rendered = array(items).map((item) => {
    const label = escapeHtml(item?.label || item?.id || item);
    const href = safeLink(item?.url);
    return href ? '<a class="chip" href="' + escapeHtml(href) + '">' + label + '</a>' : '<span class="chip">' + label + '</span>';
  }).join('');
  return rendered || '<span class="muted">Product or design-system acceptance criterion</span>';
}

function actionPlanHtml(actionPlan) {
  const items = array(actionPlan.workItems);
  return '<section class="report-section pro-section" id="action-plan">'
    + '<div class="pro-decision ' + escapeHtml(String(actionPlan.decision || '').toLowerCase().replace(/[^a-z]+/g, '-')) + '">'
    + '<div><p class="eyebrow">Release decision</p><h2>' + escapeHtml(actionPlan.decision || 'Not evaluated') + '</h2><p>' + escapeHtml(actionPlan.explanation || '') + '</p></div>'
    + '<div class="pro-priorities">'
    + ['P0', 'P1', 'P2', 'P3'].map((priority) => '<span><strong>' + escapeHtml(actionPlan.counts?.[priority] || 0) + '</strong>' + priority + '</span>').join('')
    + '</div></div>'
    + '<p class="section-intro">Start with P0/P1 items. Each work item combines duplicate viewport findings and states exactly who should act, why users are affected, what to change, and how QA proves the fix.</p>'
    + (items.length ? items.map((item) => '<article class="pro-work-item">'
      + '<div class="pro-work-head"><div>' + badge(item.priority) + badge(item.status) + badge(item.severity) + '</div><span>' + escapeHtml(item.owner) + '</span></div>'
      + '<h3>' + escapeHtml(item.title) + '</h3>'
      + '<p><strong>Problem:</strong> ' + escapeHtml(item.problem) + '</p>'
      + '<p><strong>User impact:</strong> ' + escapeHtml(item.userImpact) + '</p>'
      + '<div class="pro-columns"><section><h4>Fix plan</h4>' + list(item.fixPlan) + '</section><section><h4>How QA verifies</h4>' + list(item.retestSteps) + '</section></div>'
      + '<p class="pro-pass"><strong>Pass when:</strong> ' + escapeHtml(item.passCondition) + '</p>'
      + '<p><strong>Affected:</strong> ' + escapeHtml(array(item.affectedLocations).join('; ') || 'Page-level') + '</p>'
      + '<div class="chips">' + standards(item.standards) + '</div>'
      + '</article>').join('') : '<p class="empty-note">No finding-driven work items were generated. Complete every pending human check before final sign-off.</p>')
    + '</section>';
}

function frameworkHtml(framework) {
  const checks = array(framework.checks);
  const counts = framework.counts || {};
  return '<section class="report-section pro-section" id="framework">'
    + '<h2>Professional UI/UX verification framework + security</h2>'
    + '<p class="section-intro">This matrix separates measured passes, passive security posture, human review, authorized active tests, blocked evidence, and non-applicable checks. It never turns subjective design quality or untested server behavior into a misleading score.</p>'
    + '<div class="metrics">'
    + [['Applicable', counts.applicable], ['Executed', counts.executed], ['Passed', counts.pass], ['Failed', counts.fail], ['Review', counts.review], ['Manual pending', counts.manual], ['Blocked', counts.blocked], ['Not tested', counts['not-tested']]].map(([label, value]) => '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || 0) + '</strong></div>').join('')
    + '</div>'
    + '<div class="pro-legend"><span>' + badge('pass') + ' evidence passed</span><span>' + badge('fail') + ' fix required</span><span>' + badge('review') + ' judgement required</span><span>' + badge('manual') + ' not executed by automation</span><span>' + badge('blocked') + ' missing evidence</span></div>'
    + '<div class="pro-table-wrap"><table class="pro-table"><thead><tr><th>ID</th><th>Pillar and check</th><th>Method</th><th>Status</th><th>Acceptance and verification</th></tr></thead><tbody>'
    + checks.map((check) => '<tr><td><code>' + escapeHtml(check.id) + '</code></td><td><strong>' + escapeHtml(check.pillar) + '</strong><br>' + escapeHtml(check.title) + '</td><td>' + escapeHtml(check.method) + '</td><td>' + badge(check.status) + '</td><td><strong>Pass:</strong> ' + escapeHtml(check.passCriteria) + '<details><summary>How to verify</summary>' + list(check.verificationSteps) + '<div class="chips">' + standards(check.standards) + '</div></details></td></tr>').join('')
    + '</tbody></table></div></section>';
}

function testSuiteHtml(testCases) {
  return '<section class="report-section pro-section" id="test-suite">'
    + '<h2>Generated UI/UX test suite + security</h2>'
    + '<p class="section-intro">Framework cases cover every applicable design and security pillar. Regression cases use exact findings and evidence; active security cases remain human-owned until explicitly authorized and executed.</p>'
    + '<div class="metrics"><div class="metric"><span>Total cases</span><strong>' + escapeHtml(testCases.length) + '</strong></div><div class="metric"><span>Automatable</span><strong>' + escapeHtml(testCases.filter((item) => item.automatable).length) + '</strong></div><div class="metric"><span>Human-owned</span><strong>' + escapeHtml(testCases.filter((item) => !item.automatable).length) + '</strong></div><div class="metric"><span>Smoke</span><strong>' + escapeHtml(testCases.filter((item) => item.isSmoke).length) + '</strong></div></div>'
    + testCases.map((testCase) => '<details class="manual-case pro-case">'
      + '<summary><span><code>' + escapeHtml(testCase.id) + '</code> ' + escapeHtml(testCase.title) + '</span><span class="category">' + escapeHtml(testCase.priority) + ' · ' + escapeHtml(testCase.type) + '</span></summary>'
      + '<div class="manual-body"><p>' + escapeHtml(testCase.description || '') + '</p>'
      + '<div class="badges">' + badge(testCase.priority) + badge(testCase.severity) + badge(testCase.category) + (testCase.isSmoke ? badge('smoke') : '') + '</div>'
      + '<h5>Preconditions</h5><ul>' + array(testCase.preconditions).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
      + '<h5>Steps</h5><ol>' + array(testCase.steps).map((step) => '<li>' + escapeHtml(step.action) + (step.data ? '<br><small>' + escapeHtml(step.data) + '</small>' : '') + '</li>').join('') + '</ol>'
      + '<h5>Expected result</h5><p class="pro-pass">' + escapeHtml(testCase.expectedResult) + '</p>'
      + '<h5>Standards</h5><div class="chips">' + standards(testCase.standards) + '</div>'
      + '</div></details>').join('')
    + '</section>';
}

const EXTRA_CSS = `
    .pro-decision { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1rem; align-items:center; padding:1.1rem; border:2px solid #f79009; border-radius:12px; background:#fff8e8; }
    .pro-decision.blocked,.pro-decision.not-ready,.pro-decision.fix-before-release { border-color:#f04438; background:#fff1f0; }
    .pro-decision.automated-gates-pass { border-color:#12b76a; background:#ecfdf3; }
    .pro-decision h2 { margin:.1rem 0; }
    .pro-priorities { display:grid; grid-template-columns:repeat(4,55px); gap:.35rem; }
    .pro-priorities span { padding:.45rem; border:1px solid #d0d5dd; border-radius:8px; background:#fff; text-align:center; font-size:.72rem; }
    .pro-priorities strong { display:block; font-size:1.25rem; }
    .pro-work-item { margin:.8rem 0; padding:1rem; border:1px solid var(--line); border-left:5px solid #f79009; border-radius:10px; }
    .pro-work-head { display:flex; justify-content:space-between; gap:1rem; color:var(--muted); }
    .pro-badge { display:inline-block; margin:0 .3rem .2rem 0; padding:.18rem .5rem; border-radius:999px; background:#eaecf0; color:#344054; font-size:.7rem; font-weight:800; text-transform:uppercase; }
    .pro-badge.fail,.pro-badge.p0,.pro-badge.p1,.pro-badge.critical { background:#fee4e2; color:#912018; }
    .pro-badge.review,.pro-badge.manual,.pro-badge.p2,.pro-badge.major { background:#fef0c7; color:#7a2e0e; }
    .pro-badge.pass { background:#dcfae6; color:#085d3a; }
    .pro-badge.blocked,.pro-badge.not-tested { background:#f2f4f7; color:#344054; }
    .pro-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; }
    .pro-columns section { padding:.75rem; border:1px solid var(--line); border-radius:8px; background:var(--soft); }
    .pro-columns h4 { margin:0; }
    .pro-columns ol { padding-left:1.2rem; }
    .pro-pass { padding:.65rem; border-left:4px solid #12b76a; background:#ecfdf3; }
    .pro-legend { display:flex; flex-wrap:wrap; gap:.7rem; margin:1rem 0; }
    .pro-legend>span { color:var(--muted); }
    .pro-table-wrap { overflow:auto; }
    .pro-table { width:100%; border-collapse:collapse; font-size:.86rem; }
    .pro-table th,.pro-table td { padding:.65rem; border:1px solid var(--line); text-align:left; vertical-align:top; }
    .pro-table th { position:sticky; top:0; background:#f2f4f7; }
    .pro-table details { margin-top:.45rem; }
    .pro-table summary { padding:.25rem 0; color:var(--blue); }
    .pro-case small { color:var(--muted); }
    @media (max-width:700px) { .pro-decision,.pro-columns { grid-template-columns:1fr; } .pro-priorities { grid-template-columns:repeat(4,1fr); } }
  `;

export function renderProfessionalHtmlReport(audit = {}) {
  const framework = audit.framework || buildFrameworkAssessment(audit);
  const enriched = { ...audit, framework };
  const actionPlan = audit.actionPlan || buildActionPlan(enriched);
  const testCases = array(audit.testCases).length ? audit.testCases : buildTestCases({ ...enriched, actionPlan });
  let html = renderHtmlReport({ ...enriched, actionPlan, testCases });
  html = html.replace('</style>', EXTRA_CSS + '</style>');
  html = html.replace('<a href="#overview">Overview</a>', '<a href="#overview">Overview</a><a href="#action-plan">Action plan</a><a href="#framework">Framework</a><a href="#test-suite">Test suite</a>');
  html = html.replace('    <section class="report-section" id="findings">', actionPlanHtml(actionPlan) + frameworkHtml(framework) + '\n    <section class="report-section" id="findings">');
  html = html.replace('    <section class="report-section" id="manual">', testSuiteHtml(testCases) + '\n    <section class="report-section" id="manual">');
  return html;
}
