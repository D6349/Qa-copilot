import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

import { loadConfig } from '../src/config.mjs';
import { runAudit } from '../src/run.mjs';

test('full audit pipeline writes portable JSON, cases, screenshot, and offline HTML artifacts', {
  skip: !fs.existsSync(chromium.executablePath()) ? 'Chromium is not installed' : false,
  timeout: 60000,
}, async (context) => {
  const html = `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Audit Pipeline Fixture</title>
    <style>
      body { margin: 0; background: #fff; color: #111; font: 16px/1.5 Arial, sans-serif; }
      main { max-width: 48rem; margin: auto; padding: 2rem; }
      button { min-width: 48px; min-height: 48px; color: #fff; background: #174ea6; border: 0; border-radius: 8px; }
      button:focus-visible { outline: 3px solid #000; outline-offset: 3px; }
    </style></head><body><main><h1>Visual audit</h1><p>Readable fixture content.</p><button>Continue</button></main></body></html>`;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-run-'));
  const staleScreenshot = path.join(output, 'screenshots', 'stale-from-previous-run.png');
  fs.mkdirSync(path.dirname(staleScreenshot), { recursive: true });
  fs.writeFileSync(staleScreenshot, 'stale');
  fs.writeFileSync(path.join(output, 'audit.json'), '{}');
  fs.writeFileSync(path.join(output, 'README.md'), 'stale package guide');
  const config = loadConfig();
  config.viewports = [{ name: 'desktop-test', width: 1024, height: 768, isMobile: false }];
  config.themes = ['light'];
  config.navigation.settleMs = 0;
  config.capture.autoScrollDelayMs = 20;
  config.capture.maxInteractiveStateSamples = 1;

  const result = await runAudit({ url, config, output, overwrite: true });

  assert.notEqual(result.audit.verdict, 'invalid-capture');
  assert.equal(result.audit.captures.length, 1);
  assert.equal(result.audit.manualCases.length, 16);
  assert.ok(result.audit.framework.checks.length >= 30);
  assert.ok(result.audit.testCases.length >= 20);
  assert.ok(result.audit.actionPlan.decision);
  for (const key of [
    'readme',
    'audit', 'manifest', 'inventory', 'cases', 'testCases', 'checklist', 'actionPlan',
    'report', 'reportMarkdown', 'findingsCsv', 'checklistCsv', 'testCasesCsv',
  ]) {
    assert.ok(fs.existsSync(result.files[key]), `missing ${key} artifact`);
  }
  assert.ok(fs.existsSync(path.join(output, result.audit.captures[0].screenshot)));
  assert.equal(fs.existsSync(staleScreenshot), false);
  const saved = JSON.parse(fs.readFileSync(result.files.audit, 'utf8'));
  assert.equal(saved.runId, result.audit.runId);
  assert.equal(saved.target.title, 'Audit Pipeline Fixture');
  assert.equal(saved.resultOrganization.automaticDirectory, false);
  assert.equal(saved.resultOrganization.page, 'home');
  const packageGuide = fs.readFileSync(result.files.readme, 'utf8');
  assert.match(packageGuide, /Open \[report\.html\]\(report\.html\) first/);
  assert.match(packageGuide, /Share this entire directory/);
  assert.match(packageGuide, /Audit Pipeline Fixture/);
  assert.doesNotMatch(packageGuide, /stale package guide/);
  const report = fs.readFileSync(result.files.report, 'utf8');
  assert.match(report, /Audit Pipeline Fixture/);
  assert.match(report, /Manual UI\/UX checklist/);
  assert.match(report, /Professional UI\/UX verification framework/);
  assert.match(report, /Generated UI\/UX test suite/);
});
