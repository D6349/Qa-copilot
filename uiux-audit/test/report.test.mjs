import test from 'node:test';
import assert from 'node:assert/strict';

import { buildManualCases } from '../src/manual-cases.mjs';
import { buildManifest, renderHtmlReport } from '../src/report.mjs';

function auditFixture() {
  return {
    schemaVersion: '1.0',
    runId: 'run-report-test',
    executionStatus: 'completed',
    verdict: 'fail',
    startedAt: '2026-09-24T00:00:00.000Z',
    completedAt: '2026-09-24T00:00:01.000Z',
    durationMs: 1000,
    target: {
      url: 'https://example.test/',
      finalUrl: 'https://example.test/',
      title: '<img src=x onerror=alert(1)>',
      browser: 'chromium',
      browserVersion: '1',
    },
    captures: [{
      captureId: 'target-mobile',
      checkpoint: 'page',
      theme: 'light',
      viewport: { name: 'mobile', width: 390, height: 844 },
      status: 'valid',
      screenshot: 'screenshots/target-mobile.png',
      metrics: { visibleElements: 10 },
      tokens: { fontFamilies: [{ value: 'Inter', count: 3 }], colors: [{ value: '#fff', count: 2 }] },
    }],
    reference: {
      captures: [{
        captureId: 'reference-mobile',
        checkpoint: 'page',
        theme: 'light',
        viewport: { name: 'mobile', width: 390, height: 844 },
        screenshot: 'screenshots/reference-mobile.png',
      }],
    },
    issues: [{
      id: 'issue-1',
      ruleId: 'color.text-contrast',
      class: 'objective',
      status: 'fail',
      category: 'Color',
      severity: 'major',
      title: 'Unsafe <script>alert(1)</script>',
      message: 'Contrast is low & needs correction.',
      location: { captureId: 'target-mobile', viewport: { name: 'mobile' } },
      actual: { ratio: 2.5 },
      expected: { minimumRatio: 4.5 },
      recommendation: 'Increase contrast.',
    }],
    coverage: { captures: { total: 1, valid: 1, invalid: 0 } },
    summary: { totalIssues: 1, objectiveFailures: 1, heuristicReviews: 0, captures: { total: 1, valid: 1, invalid: 0 } },
    comparison: null,
    artifacts: { audit: 'audit.json', report: 'report.html' },
  };
}

test('manual UI/UX cases are reusable, atomic, and human-owned', () => {
  const cases = buildManualCases(auditFixture());
  assert.equal(cases.length, 16);
  assert.ok(cases.every((item) => item.automatable === false));
  assert.ok(cases.every((item) => item.steps.length > 0));
  assert.ok(cases.every((item) => item.steps.every((step, index) => step.step === index + 1 && step.action)));
  assert.ok(cases.every((item) => item.expectedResult.length > 20));
});

test('HTML report escapes page content and includes target and reference evidence', () => {
  const html = renderHtmlReport(auditFixture());
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /screenshots\/target-mobile\.png/);
  assert.match(html, /screenshots\/reference-mobile\.png/);
  assert.match(html, /Objective failures/);
  assert.match(html, /Manual UI\/UX checklist/);
});

test('manifest summarizes evidence without copying page HTML', () => {
  const manifest = buildManifest(auditFixture());
  assert.equal(manifest.counts.captures, 1);
  assert.equal(manifest.counts.objectiveFailures, 1);
  assert.equal(manifest.counts.manualCases, 16);
  assert.ok(manifest.artifacts.some((artifact) => artifact.path === 'screenshots/reference-mobile.png'));
});

