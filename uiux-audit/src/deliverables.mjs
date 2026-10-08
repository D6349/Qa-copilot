const array = (value) => Array.isArray(value) ? value : [];

function plain(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function csvCell(value) {
  let text = plain(value).replace(/\r?\n/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function markdown(value) {
  return plain(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim();
}

function standardsLabel(standards) {
  return array(standards).map((item) => item?.label || item?.id || item).filter(Boolean).join('; ');
}

function locationLabel(location = {}) {
  const viewport = location.viewport || {};
  return [
    location.checkpoint,
    viewport.name || (viewport.width && viewport.height ? viewport.width + 'x' + viewport.height : null),
    location.theme,
    location.selector || location.stableKey,
  ].filter(Boolean).join(' / ');
}

export function renderFindingsCsv(audit = {}) {
  const rows = [[
    'Finding ID', 'Priority', 'Severity', 'Status', 'Class', 'Category', 'Rule', 'Title',
    'Problem', 'User impact', 'Location', 'Observed', 'Expected', 'Owner', 'Fix plan',
    'Retest steps', 'Pass condition', 'Standards',
  ]];
  for (const issue of array(audit.issues)) {
    rows.push([
      issue.id, issue.priority, issue.severity, issue.status, issue.class, issue.category, issue.ruleId,
      issue.title, issue.message, issue.impact, locationLabel(issue.location), issue.actual, issue.expected,
      issue.owner, array(issue.remediation?.steps).join(' | '), array(issue.verification?.steps).join(' | '),
      issue.verification?.passCondition, standardsLabel(issue.standards),
    ]);
  }
  return csv(rows);
}

export function renderChecklistCsv(audit = {}) {
  const rows = [[
    'Check ID', 'Pillar', 'Check', 'Method', 'Status', 'Applies to', 'Pass criteria',
    'How to verify', 'Related finding IDs', 'Standards',
  ]];
  for (const check of array(audit?.framework?.checks)) {
    rows.push([
      check.id, check.pillar, check.title, check.method, check.status, check.appliesTo,
      check.passCriteria, array(check.verificationSteps).join(' | '),
      array(check.relatedIssueIds).join('; '), standardsLabel(check.standards),
    ]);
  }
  return csv(rows);
}

export function renderTestCasesCsv(audit = {}) {
  const rows = [[
    'Test case ID', 'Priority', 'Severity', 'Category', 'Sub-module', 'Type', 'Title',
    'Description', 'Preconditions', 'Test data', 'Steps', 'Expected result', 'Automatable',
    'Smoke', 'Standards', 'Source finding IDs', 'Tags',
  ]];
  for (const testCase of array(audit.testCases)) {
    rows.push([
      testCase.id, testCase.priority, testCase.severity, testCase.category, testCase.subModule,
      testCase.type, testCase.title, testCase.description, array(testCase.preconditions).join(' | '),
      testCase.testData, array(testCase.steps).map((step) => String(step.step || '') + '. ' + step.action + (step.data ? ' [' + step.data + ']' : '')).join(' | '),
      testCase.expectedResult, testCase.automatable, testCase.isSmoke, standardsLabel(testCase.standards),
      array(testCase.sourceIssueIds).join('; '), array(testCase.tags).join('; '),
    ]);
  }
  return csv(rows);
}

export function renderMarkdownReport(audit = {}) {
  const actionPlan = audit.actionPlan || {};
  const framework = audit.framework || { counts: {}, checks: [] };
  const summary = audit.summary || {};
  const target = audit?.target?.finalUrl || audit?.target?.url || 'Not recorded';
  const lines = [
    '# UI/UX and passive security audit: ' + markdown(audit?.target?.title || target),
    '',
    '> Release decision: **' + markdown(actionPlan.decision || 'Not evaluated') + '** — ' + markdown(actionPlan.explanation || ''),
    '',
    'Run: `' + markdown(audit.runId || 'unidentified') + '`  ',
    'Target: ' + markdown(target) + '  ',
    'Verdict: **' + markdown(audit.verdict || 'unknown') + '**',
    '',
    '## Executive summary',
    '',
    '| Measure | Result |',
    '|---|---:|',
    '| Objective failures | ' + markdown(summary.objectiveFailures || 0) + ' |',
    '| Human review findings | ' + markdown(summary.heuristicReviews || 0) + ' |',
    '| Color compliance grade | ' + markdown(audit?.colorGrade?.grade || summary.colorGrade || 'NOT TESTED') + ' |',
    '| Possible spelling findings | ' + markdown(summary.spellingFindings || 0) + ' |',
    '| Axe accessibility findings | ' + markdown(summary.accessibilityEngineFindings || 0) + ' |',
    '| Passive security findings | ' + markdown(summary.securityFindings || 0) + ' |',
    '| Valid captures | ' + markdown((audit?.coverage?.captures?.valid || 0) + '/' + (audit?.coverage?.captures?.total || 0)) + ' |',
    '| Framework checks passed | ' + markdown(framework?.counts?.pass || 0) + ' |',
    '| Framework checks failed | ' + markdown(framework?.counts?.fail || 0) + ' |',
    '| Human checks pending | ' + markdown((framework?.counts?.manual || 0) + (framework?.counts?.['not-tested'] || 0)) + ' |',
    '| Generated test cases | ' + markdown(array(audit.testCases).length) + ' |',
    '',
    'A pass applies only to checks with collected evidence. Manual, blocked, and not-tested checks are never counted as passes.',
    '',
    'Security mode: **passive-safe**. Sensitive values are not serialized into JSON. Screenshots may contain rendered sensitive content and require configured masks. Authentication, authorization, IDOR, CSRF, injection, API, rate-limit, and business-logic cases require separate authorized active testing.',
    '',
    '## Prioritized action plan',
    '',
  ];

  if (!array(actionPlan.workItems).length) lines.push('No finding-driven work items were generated. Complete the pending human checks before final sign-off.', '');
  for (const item of array(actionPlan.workItems)) {
    lines.push(
      '### ' + markdown(item.priority) + ' — ' + markdown(item.title),
      '',
      '- Owner: ' + markdown(item.owner),
      '- User impact: ' + markdown(item.userImpact),
      '- Affected locations: ' + markdown(array(item.affectedLocations).join('; ') || 'Page-level'),
      '- Fix: ' + markdown(array(item.fixPlan).join(' ')),
      '- Retest: ' + markdown(array(item.retestSteps).join(' ')),
      '- Pass condition: ' + markdown(item.passCondition),
      '- Standards: ' + markdown(standardsLabel(item.standards) || 'Product/design-system criterion'),
      '',
    );
  }

  lines.push('## Framework coverage', '', '| ID | Pillar | Check | Method | Status | Pass criteria |', '|---|---|---|---|---|---|');
  for (const check of array(framework.checks)) {
    lines.push('| ' + [check.id, check.pillar, check.title, check.method, check.status, check.passCriteria].map(markdown).join(' | ') + ' |');
  }

  lines.push('', '## Generated test cases', '');
  for (const testCase of array(audit.testCases)) {
    lines.push(
      '### ' + markdown(testCase.id) + ' — ' + markdown(testCase.title),
      '',
      '**' + markdown(testCase.priority) + ' · ' + markdown(testCase.type) + ' · ' + markdown(testCase.subModule) + '**',
      '',
    );
    for (const step of array(testCase.steps)) {
      lines.push(String(step.step || '') + '. ' + markdown(step.action) + (step.data ? ' — ' + markdown(step.data) : ''));
    }
    lines.push('', 'Expected: ' + markdown(testCase.expectedResult), '');
  }

  lines.push(
    '## Interpretation',
    '',
    '- Objective failures are measurements or deterministic DOM/rendering checks.',
    '- Review findings are evidence-backed concerns that require human judgement.',
    '- Passive security posture does not prove server-side controls; active security cases remain unpassed until authorized execution records evidence.',
    '- Aesthetic quality, comprehension, and task success require representative-user validation.',
    '- Re-run the same profiles after fixes and keep the prior audit as regression evidence.',
    '',
  );
  return lines.join('\n');
}
