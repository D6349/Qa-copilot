import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeScan } from '../src/analyze.mjs';
import { loadConfig } from '../src/config.mjs';
import { enrichScanContent } from '../src/content.mjs';

function element(overrides = {}) {
  return {
    selector: '#copy',
    stableKey: 'id=copy',
    tag: 'p',
    role: null,
    text: 'Readable page content',
    interactive: false,
    inline: false,
    disabled: false,
    box: { x: 16, y: 16, width: 240, height: 24, right: 256, bottom: 40 },
    styles: {
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 24,
      letterSpacing: 0,
      color: '#111111',
      backgroundColor: '#ffffff',
      backgroundLayers: [],
      backgroundImage: 'none',
      borderColor: '#111111',
      borderWidth: 0,
      textDecorationLine: 'none',
      opacity: 1,
      padding: [0, 0, 0, 0],
      margin: [0, 0, 0, 0],
      overflowX: 'visible',
      overflowY: 'visible',
      objectFit: 'fill',
      ...overrides.styles,
    },
    clippedHorizontal: false,
    clippedVertical: false,
    image: null,
    ...overrides,
  };
}

function capture(overrides = {}) {
  return {
    captureId: 'enhanced-mobile-light',
    checkpoint: 'page',
    theme: 'light',
    viewport: { name: 'mobile', width: 390, height: 844 },
    url: 'https://example.test/',
    httpStatus: 200,
    status: 'valid',
    metrics: { documentWidth: 390, documentHeight: 844, horizontalOverflow: 0, visibleElements: 2 },
    elements: [element()],
    fonts: [],
    assets: { failed: [] },
    interactiveStates: [],
    tokens: {
      fontFamilies: [{ value: 'Arial', count: 1 }],
      fontSizes: [{ value: 16, count: 1 }],
      fontWeights: [{ value: 400, count: 1 }],
      colors: [{ value: '#111111', count: 1 }, { value: '#ffffff', count: 1 }],
      spacing: [], radii: [], shadows: [], buttonVariants: [], inputVariants: [],
    },
    ...overrides,
  };
}

test('local spelling inspection finds likely errors and honors approved product terms', async () => {
  const config = loadConfig();
  config.approved.terms.push('Ledgrz');
  const auditedCapture = capture({
    language: 'en-IN',
    elements: [
      element({ text: 'Ledgrz has a sentnce about Aadhaar.' }),
      element({ selector: '#truncated', stableKey: 'id=truncated', text: `${'Clear '.repeat(25)}xxoperatio` }),
    ],
  });
  const scan = {
    captures: [auditedCapture, { ...auditedCapture, captureId: 'enhanced-desktop-light' }],
  };

  await enrichScanContent(scan, config);
  const spelling = scan.captures[0].contentAudit.spelling;
  assert.equal(spelling.status, 'complete');
  assert.equal(spelling.cacheHit, false);
  assert.equal(scan.captures[1].contentAudit.spelling.cacheHit, true);
  assert.ok(spelling.testedWords > 0);
  assert.ok(spelling.issues.some((item) => item.word === 'sentnce'));
  assert.equal(spelling.issues.some((item) => item.word === 'Ledgrz'), false);
  assert.equal(spelling.issues.some((item) => item.word === 'xxoperatio'), false);

  const analysis = analyzeScan({ url: 'https://example.test/', captures: scan.captures }, config);
  const finding = analysis.issues.find((item) => item.ruleId === 'content.spelling');
  assert.ok(finding);
  assert.equal(finding.class, 'heuristic');
  assert.ok(finding.actual.suggestions.includes('sentence'));
});

test('placeholder and control-boundary checks produce a transparent color compliance grade', () => {
  const input = element({
    selector: '#email',
    stableKey: 'id=email',
    tag: 'input',
    role: 'textbox',
    text: '',
    interactive: true,
    inputType: 'email',
    placeholder: 'Email address',
    box: { x: 16, y: 64, width: 240, height: 40, right: 256, bottom: 104 },
    styles: {
      color: '#111111',
      backgroundColor: '#ffffff',
      backgroundLayers: [{ color: '#ffffff', image: 'none' }],
      borderColor: '#dddddd',
      borderWidth: 1,
      placeholderColor: '#aaaaaa',
      placeholderOpacity: 1,
    },
  });
  const audited = capture({ elements: [element(), input] });
  const result = analyzeScan({ url: audited.url, captures: [audited] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'color.placeholder-contrast' && item.class === 'objective'));
  assert.ok(result.issues.some((item) => item.ruleId === 'color.non-text-contrast' && item.class === 'heuristic'));
  assert.equal(result.coverage.checks.placeholderContrast.failed, 1);
  assert.equal(result.colorGrade.grade, 'FAIL');
  assert.match(result.colorGrade.scope, /not an aesthetic score/i);
});

test('axe violations and incomplete checks remain separately classified', () => {
  const audited = capture({
    accessibility: {
      status: 'complete',
      engine: 'axe-core',
      engineVersion: 'test',
      rulesTested: 6,
      passes: 4,
      violations: [{
        id: 'aria-roles',
        impact: 'critical',
        tags: ['wcag2a', 'wcag412'],
        description: 'Ensure all role values are valid.',
        help: 'ARIA roles must be valid',
        helpUrl: 'https://dequeuniversity.com/rules/axe/aria-roles',
        totalNodes: 1,
        nodes: [{ impact: 'critical', target: ['#bad-role'], failureSummary: 'Invalid role value.' }],
      }],
      incomplete: [{
        id: 'aria-prohibited-attr',
        impact: 'serious',
        tags: ['wcag2a'],
        help: 'Review prohibited ARIA attributes',
        helpUrl: 'https://dequeuniversity.com/rules/axe/aria-prohibited-attr',
        totalNodes: 1,
        nodes: [{ impact: 'serious', target: ['#review'], failureSummary: 'Needs manual review.' }],
      }],
    },
  });
  const result = analyzeScan({ url: audited.url, captures: [audited] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'axe.aria-roles' && item.class === 'objective'));
  assert.ok(result.issues.some((item) => item.ruleId === 'axe.review.aria-prohibited-attr' && item.class === 'heuristic'));
  assert.equal(result.coverage.checks.accessibilityEngine.failed, 1);
  assert.equal(result.coverage.checks.accessibilityEngine.review, 1);
});

test('content integrity catches leaked runtime tokens as objective evidence', () => {
  const audited = capture({ elements: [element({ text: 'Welcome {{customerName}}' })] });
  const result = analyzeScan({ url: audited.url, captures: [audited] }, {});
  const finding = result.issues.find((item) => item.ruleId === 'content.template-placeholder');

  assert.ok(finding);
  assert.equal(finding.class, 'objective');
  assert.equal(result.coverage.checks.contentQuality.failed, 1);
});

