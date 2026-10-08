import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeScan } from '../src/analyze.mjs';
import {
  buildActionPlan,
  buildFrameworkAssessment,
  buildTestCases,
  detectFeatures,
} from '../src/framework.mjs';
import {
  renderChecklistCsv,
  renderFindingsCsv,
  renderMarkdownReport,
  renderTestCasesCsv,
} from '../src/deliverables.mjs';
import { renderProfessionalHtmlReport } from '../src/professional-report.mjs';

function semanticCapture() {
  const base = {
    styles: {
      fontFamily: 'Arial', fontSize: 16, fontWeight: 400, lineHeight: 24,
      color: '#111111', backgroundColor: '#ffffff', backgroundLayers: [],
      backgroundImage: 'none', padding: [0, 0, 0, 0], margin: [0, 0, 0, 0],
      borderRadius: 0, boxShadow: 'none', overflowX: 'visible', overflowY: 'visible',
      whiteSpace: 'normal', objectFit: 'contain', display: 'block',
    },
    clippedHorizontal: false,
    clippedVertical: false,
  };
  return {
    captureId: 'semantic-desktop',
    checkpoint: 'page',
    theme: 'light',
    viewport: { name: 'desktop', width: 1024, height: 768 },
    url: 'https://example.test/settings',
    status: 'valid',
    title: '',
    language: null,
    metrics: {
      viewportWidth: 1024, documentWidth: 1024, documentHeight: 900,
      horizontalOverflow: 0, visibleElements: 3, textElements: 0,
      interactiveElements: 2, images: 1, forms: 1,
    },
    semantics: {
      title: '', language: null, mainLandmarks: 0,
      navigationLandmarks: 0, headings: [{ level: 2, text: 'Settings', selector: 'h2' }],
    },
    elements: [
      {
        ...base,
        selector: '#icon-action', stableKey: 'id=icon-action', tag: 'button', role: 'button',
        accessibleName: '', nameSource: null, text: '', interactive: true, tabIndex: 2,
        box: { x: 20, y: 20, width: 44, height: 44, right: 64, bottom: 64 },
      },
      {
        ...base,
        selector: '#email', stableKey: 'id=email', tag: 'input', role: 'textbox', inputType: 'email',
        accessibleName: 'Email', nameSource: 'placeholder', text: '', interactive: true, tabIndex: 0,
        box: { x: 20, y: 80, width: 240, height: 44, right: 260, bottom: 124 },
      },
      {
        ...base,
        selector: '#hero', stableKey: 'id=hero', tag: 'img', role: '',
        accessibleName: '', altPresent: false, text: '', interactive: false, tabIndex: -1,
        box: { x: 20, y: 140, width: 320, height: 180, right: 340, bottom: 320 },
        image: { src: '/hero.png', complete: true, naturalWidth: 640, naturalHeight: 360 },
      },
    ],
    interactiveStates: [
      { stableKey: 'id=icon-action', focusVisible: true, focusChanged: true },
      { stableKey: 'id=email', focusVisible: true, focusChanged: true },
    ],
    fonts: [],
    assets: { failed: [] },
    tokens: {
      fontFamilies: [], fontSizes: [], fontWeights: [], colors: [], spacing: [],
      radii: [], shadows: [], buttonVariants: [], inputVariants: [],
    },
  };
}

function professionalAudit() {
  const capture = semanticCapture();
  const analysis = analyzeScan({ url: capture.url, captures: [capture] }, {});
  const audit = {
    schemaVersion: '2.0',
    runId: 'framework-test',
    executionStatus: 'completed',
    verdict: analysis.verdict,
    target: { url: capture.url, finalUrl: capture.url, title: '<script>unsafe</script>', browser: 'chromium' },
    captures: [capture],
    issues: analysis.issues,
    coverage: analysis.coverage,
    summary: analysis.summary,
    artifacts: { audit: 'audit.json', report: 'report.html' },
  };
  audit.framework = buildFrameworkAssessment(audit);
  audit.actionPlan = buildActionPlan(audit);
  audit.testCases = buildTestCases(audit);
  return audit;
}

test('semantic checks expose actionable standards, remediation, and verification evidence', () => {
  const audit = professionalAudit();
  const rules = new Set(audit.issues.map((issue) => issue.ruleId));
  for (const rule of [
    'accessibility.page-title', 'accessibility.document-language', 'structure.main-landmark',
    'structure.page-heading', 'accessibility.control-name', 'accessibility.form-label',
    'accessibility.image-alt', 'accessibility.positive-tabindex',
  ]) assert.ok(rules.has(rule), 'missing ' + rule);

  const control = audit.issues.find((issue) => issue.ruleId === 'accessibility.control-name');
  assert.equal(control.priority, 'P1');
  assert.match(control.impact, /screen-reader/i);
  assert.ok(control.standards.some((item) => /4\.1\.2/.test(item.label)));
  assert.ok(control.remediation.steps.length >= 2);
  assert.ok(control.verification.steps.length >= 2);
  assert.match(control.verification.passCondition, /accessible name/i);
  assert.equal(audit.coverage.checks.accessibleNames.failed, 1);
  assert.equal(audit.coverage.checks.formLabels.failed, 1);
  assert.equal(audit.coverage.checks.alternativeText.failed, 1);
});

test('framework is feature-aware and never counts pending human work as a pass', () => {
  const audit = professionalAudit();
  const features = detectFeatures(audit);
  assert.equal(features.forms, true);
  assert.equal(features.images, true);
  assert.equal(features.media, false);

  const formCheck = audit.framework.checks.find((check) => check.id === 'A11Y-002');
  const mediaCheck = audit.framework.checks.find((check) => check.id === 'MEDIA-002');
  const usabilityCheck = audit.framework.checks.find((check) => check.id === 'UX-001');
  assert.equal(formCheck.status, 'fail');
  assert.equal(mediaCheck.status, 'not-applicable');
  assert.equal(usabilityCheck.status, 'manual');
  assert.ok(usabilityCheck.verificationSteps.length >= 3);
  assert.equal(audit.framework.counts.total, audit.framework.checks.length);
});

test('action plan produces a release decision and cases cover framework plus exact regressions', () => {
  const audit = professionalAudit();
  assert.equal(audit.actionPlan.decision, 'NOT READY');
  assert.ok(audit.actionPlan.workItems.some((item) => item.priority === 'P1'));
  assert.ok(audit.actionPlan.workItems.every((item) => item.fixPlan.length && item.retestSteps.length && item.passCondition));

  const frameworkCase = audit.testCases.find((item) => item.id === 'UIUX-A11Y-002');
  const regressionCase = audit.testCases.find((item) => item.id.startsWith('UIUX-REG-') && item.sourceIssueIds.length);
  assert.ok(frameworkCase);
  assert.ok(regressionCase);
  assert.ok(audit.testCases.every((item) => item.steps.length > 0));
  assert.ok(audit.testCases.every((item) => item.steps.every((step, index) => step.step === index + 1 && step.action)));
  assert.ok(audit.testCases.every((item) => item.expectedResult.length > 20));
});

test('shareable HTML, Markdown, and spreadsheet-safe CSV outputs are understandable and escaped', () => {
  const audit = professionalAudit();
  audit.issues[0].title = '=HYPERLINK("https://unsafe.test")';
  const html = renderProfessionalHtmlReport(audit);
  const md = renderMarkdownReport(audit);
  const findings = renderFindingsCsv(audit);
  const checklist = renderChecklistCsv(audit);
  const cases = renderTestCasesCsv(audit);

  assert.doesNotMatch(html, /<script>unsafe<\/script>/);
  assert.match(html, /Prioritized action plan|Release decision/);
  assert.match(html, /Professional UI\/UX verification framework/);
  assert.match(html, /Generated UI\/UX test suite/);
  assert.match(md, /## Prioritized action plan/);
  assert.match(md, /## Framework coverage/);
  assert.doesNotMatch(md, /<script>unsafe<\/script>/);
  assert.match(findings, /"'=HYPERLINK/);
  assert.match(checklist, /"Check ID"/);
  assert.match(cases, /"Test case ID"/);
});
