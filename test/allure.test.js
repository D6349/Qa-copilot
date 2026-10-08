import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  mapAuditSeverity, mapAuditStatus, writeAllureResults,
} from '../src/allure.js';

test('audit statuses preserve the difference between evidence, failure, and human review', () => {
  assert.equal(mapAuditStatus('pass'), 'passed');
  assert.equal(mapAuditStatus('fail'), 'failed');
  assert.equal(mapAuditStatus('blocked'), 'broken');
  assert.equal(mapAuditStatus('review'), 'skipped');
  assert.equal(mapAuditStatus('manual'), 'skipped');
  assert.equal(mapAuditStatus('not-applicable'), 'skipped');
  assert.equal(mapAuditStatus('not-tested'), 'skipped');
  assert.equal(mapAuditStatus('unexpected'), 'unknown');
});

test('Allure severity is derived from the highest related UI/UX finding', () => {
  assert.equal(mapAuditSeverity({ status: 'fail' }, [{ severity: 'major' }]), 'critical');
  assert.equal(mapAuditSeverity({ status: 'fail' }, [{ severity: 'critical' }]), 'blocker');
  assert.equal(mapAuditSeverity({ status: 'review' }, [{ severity: 'minor' }]), 'normal');
  assert.equal(mapAuditSeverity({ status: 'not-applicable' }, []), 'trivial');
});

test('UI/UX checks become Allure results with evidence and screenshot attachments', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-copilot-allure-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const auditDirectory = path.join(temporary, 'audit');
  const screenshots = path.join(auditDirectory, 'screenshots');
  const resultsDirectory = path.join(temporary, 'allure-results');
  fs.mkdirSync(screenshots, { recursive: true });
  fs.writeFileSync(path.join(screenshots, 'desktop-light.png'), Buffer.from('screenshot'));

  const capture = {
    captureId: 'capture-1',
    checkpoint: 'page',
    theme: 'light',
    viewport: { name: 'desktop', width: 1440, height: 900, isMobile: false },
    url: 'https://example.test/page',
    status: 'valid',
    screenshot: 'screenshots/desktop-light.png',
  };
  const issue = {
    id: 'issue-1',
    ruleId: 'contrast.text',
    category: 'Accessibility',
    status: 'fail',
    severity: 'major',
    title: 'Text contrast is too low',
    actual: '3.1:1',
    expected: 'At least 4.5:1',
    recommendation: 'Increase the foreground/background contrast.',
    location: {
      captureId: capture.captureId,
      url: capture.url,
      theme: capture.theme,
      viewport: capture.viewport,
      selector: '#example',
    },
  };
  const checks = [
    {
      id: 'VIS-001', pillar: 'Color and contrast', title: 'Verify readable text contrast',
      method: 'automated', status: 'fail', appliesTo: 'text',
      passCriteria: 'Text reaches 4.5:1.', verificationSteps: ['Measure contrast.'],
      relatedIssueIds: [issue.id], standards: [{ label: 'WCAG', url: 'https://www.w3.org/TR/WCAG22/' }],
    },
    {
      id: 'LAY-001', pillar: 'Layout and reflow', title: 'Prevent clipping',
      method: 'automated', status: 'pass', appliesTo: 'always',
      passCriteria: 'No clipping exists.', verificationSteps: ['Inspect each viewport.'],
      relatedIssueIds: [], standards: [],
    },
    {
      id: 'VIS-004', pillar: 'Visual hierarchy', title: 'Confirm hierarchy',
      method: 'manual', status: 'manual', appliesTo: 'always',
      passCriteria: 'The primary action is clear.', verificationSteps: ['Review the page.'],
      relatedIssueIds: [], standards: [],
    },
  ];
  const summary = writeAllureResults({
    project: { id: 'project-1', name: 'Example' },
    pages: [{
      page: { id: 'page-1', name: 'Example page' },
      url: capture.url,
      auditDirectory,
      audit: {
        runId: 'run-1', verdict: 'fail', startedAt: '2026-10-01T10:00:00.000Z',
        completedAt: '2026-10-01T10:01:00.000Z', captures: [capture], issues: [issue],
        framework: { checks },
      },
    }],
    resultsDirectory,
    generatedAt: '2026-10-01T10:02:00.000Z',
  });

  assert.deepEqual(
    { total: summary.total, passed: summary.passed, failed: summary.failed, skipped: summary.skipped },
    { total: 3, passed: 1, failed: 1, skipped: 1 },
  );
  assert.equal(summary.screenshotFiles, 1);
  assert.ok(fs.existsSync(path.join(resultsDirectory, 'environment.properties')));
  assert.ok(fs.existsSync(path.join(resultsDirectory, 'categories.json')));

  const resultFiles = fs.readdirSync(resultsDirectory).filter((file) => file.endsWith('-result.json'));
  assert.equal(resultFiles.length, 3);
  const results = resultFiles.map((file) => JSON.parse(fs.readFileSync(path.join(resultsDirectory, file), 'utf8')));
  const failed = results.find((result) => result.name.startsWith('VIS-001'));
  const manual = results.find((result) => result.name.startsWith('VIS-004'));
  assert.equal(failed.status, 'failed');
  assert.ok(failed.attachments.some((attachment) => attachment.type === 'image/png'));
  assert.ok(failed.attachments.some((attachment) => attachment.type === 'application/json'));
  assert.ok(failed.labels.some((label) => label.name === 'severity' && label.value === 'critical'));
  assert.equal(manual.status, 'skipped');
  assert.match(manual.statusDetails.message, /Manual verification required/);
  assert.doesNotMatch(manual.statusDetails.message, /passed/i);
});
