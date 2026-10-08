import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

import { loadConfig } from '../src/config.mjs';
import { scanWebsite } from '../src/scanner.mjs';

test('browser collector records rendered style, geometry, tokens, and screenshot evidence', {
  skip: !fs.existsSync(chromium.executablePath()) ? 'Chromium is not installed' : false,
  timeout: 30000,
}, async (context) => {
  const html = `<!doctype html>
    <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title><style>
      body { margin: 0; font-family: Arial, sans-serif; color: rgb(34, 34, 34); background: white; }
      main { width: 500px; padding: 16px; }
      button { width: 20px; height: 20px; color: rgb(119,119,119); background: white; }
    </style></head><body><main><h1>Rendered fixture</h1><button aria-label="Tiny action">+</button></main></body></html>`;
  const pageHtml = html.replace('</main>', '<input type=password value=super-secret aria-label=Password></main>');
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(pageHtml);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/fixture`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-browser-'));
  const auditedUrl = url + '?token=super-secret&view=grid';

  const config = loadConfig();
  config.viewports = [{ name: 'mobile-320', width: 320, height: 568, isMobile: true }];
  config.themes = ['light'];
  config.navigation.settleMs = 0;
  config.capture.fullPage = false;
  config.capture.maxInteractiveStateSamples = 1;
  const scan = await scanWebsite({ url: auditedUrl, config, artifactDir: directory });

  assert.equal(scan.captures.length, 1);
  const capture = scan.captures[0];
  assert.equal(capture.status, 'valid');
  assert.equal(capture.accessibility.status, 'complete');
  assert.match(capture.accessibility.engineVersion, /^4\./);
  assert.equal(capture.metrics.viewportWidth, 320);
  assert.ok(capture.metrics.horizontalOverflow > 0);
  assert.ok(capture.tokens.fontFamilies.some((token) => String(token.value).includes('Arial')));
  const button = capture.elements.find((element) => element.role === 'button');
  assert.equal(button.box.width, 20);
  assert.equal(button.styles.color, 'rgb(119, 119, 119)');
  assert.doesNotMatch(JSON.stringify(scan), /super-secret/);
  assert.match(capture.url, /view=grid/);
  assert.ok(fs.existsSync(path.join(directory, capture.screenshot)));
});

test('browser collector warms scroll-triggered content before collecting evidence', {
  skip: !fs.existsSync(chromium.executablePath()) ? 'Chromium is not installed' : false,
  timeout: 30000,
}, async (context) => {
  const html = `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lazy fixture</title><style>
      body { margin: 0; min-height: 2200px; font: 16px/1.5 Arial, sans-serif; }
      #lazy { margin-top: 1600px; visibility: hidden; }
    </style></head><body><h1>Start</h1><p id="lazy">Loaded after scrolling</p><script>
      const lazy = document.querySelector('#lazy');
      new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) lazy.style.visibility = 'visible';
      }).observe(lazy);
    </script></body></html>`;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-lazy-'));
  const config = loadConfig();
  config.viewports = [{ name: 'mobile-320', width: 320, height: 568, isMobile: true }];
  config.themes = ['light'];
  config.navigation.settleMs = 0;
  config.capture.autoScrollDelayMs = 20;
  config.capture.maxInteractiveStateSamples = 0;

  const scan = await scanWebsite({
    url: `http://127.0.0.1:${address.port}/lazy`,
    config,
    artifactDir: directory,
  });
  const lazy = scan.captures[0].elements.find((element) => element.text === 'Loaded after scrolling');
  assert.ok(lazy, 'scroll-triggered content should be visible in the collected snapshot');
  assert.equal(scan.captures[0].metrics.horizontalOverflow, 0);
});

test('browser collector measures focus-visible in keyboard modality after a flow click', {
  skip: !fs.existsSync(chromium.executablePath()) ? 'Chromium is not installed' : false,
  timeout: 60000,
}, async (context) => {
  const html = `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Focus fixture</title><style>
      body { font: 16px/1.5 Arial, sans-serif; }
      button:focus, a:focus { outline: none; }
      button:focus-visible, a:focus-visible { outline: 3px solid rgb(255, 0, 0); }
    </style></head><body>
      <button type="button">Open panel</button>
      <a href="#target">Next action</a>
      <div id="target">Target</div>
    </body></html>`;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-focus-'));
  const config = loadConfig();
  config.viewports = [{ name: 'desktop', width: 1024, height: 768, isMobile: false }];
  config.themes = ['light'];
  config.navigation.settleMs = 0;
  config.capture.fullPage = false;
  config.capture.autoScrollDelayMs = 20;
  config.capture.maxInteractiveStateSamples = 2;
  const flow = {
    name: 'pointer-before-focus-audit',
    steps: [
      { action: 'click', locator: { role: { type: 'button', name: 'Open panel', exact: true } } },
      { checkpoint: 'after-pointer-click' },
    ],
  };

  const scan = await scanWebsite({
    url: `http://127.0.0.1:${address.port}/focus`,
    config,
    artifactDir: directory,
    flow,
  });
  const states = scan.captures[0].interactiveStates;

  assert.equal(states.length, 2);
  assert.ok(states.every((state) => state.focusVisible === true));
  assert.ok(states.every((state) => state.focusChanged === true));
  assert.ok(states.every((state) => state.focusMethod === 'keyboard-modality-programmatic'));
});
