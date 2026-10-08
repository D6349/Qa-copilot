import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

import { analyzeScan } from '../src/analyze.mjs';
import { loadConfig } from '../src/config.mjs';
import { buildFrameworkAssessment, buildTestCases } from '../src/framework.mjs';
import { scanWebsite } from '../src/scanner.mjs';
import { summarizeResponseSecurity } from '../src/security.mjs';

test('response security summaries retain posture but never persist secrets', () => {
  const summary = summarizeResponseSecurity({
    url: 'https://example.test/account',
    status: 200,
    headers: [
      { name: 'Set-Cookie', value: 'session_id=cookie-super-secret; Path=/; SameSite=None' },
      { name: 'Content-Security-Policy', value: "default-src 'self'; script-src 'nonce-nonce-super-secret' 'sha256-hash-super-secret'; object-src 'none'" },
      { name: 'Server', value: 'server-super-secret/9.9' },
      { name: 'X-Powered-By', value: 'framework-super-secret' },
      { name: 'Authorization', value: 'Bearer authorization-super-secret' },
      { name: 'Content-Type', value: 'text/html; charset=utf-8' },
    ],
  });

  assert.equal(summary.cookies.count, 1);
  assert.equal(summary.cookies.items[0].nameClass, 'session-like');
  assert.equal(summary.cookies.items[0].sameSite, 'none');
  assert.equal(summary.cookies.items[0].secure, false);
  assert.equal(summary.headers.contentSecurityPolicy.script.nonceOrHash, true);
  assert.equal(summary.headers.serverDisclosure.present, true);
  assert.equal(summary.headers.poweredByDisclosure.present, true);

  const serialized = JSON.stringify(summary);
  for (const secret of [
    'cookie-super-secret', 'session_id', 'nonce-super-secret', 'hash-super-secret',
    'server-super-secret', 'framework-super-secret', 'authorization-super-secret',
  ]) assert.doesNotMatch(serialized, new RegExp(secret));
});

test('security analyzer separates proven unsafe conditions from hardening reviews and active tests', () => {
  const response = summarizeResponseSecurity({
    url: 'https://example.test/account?token=not-persisted',
    status: 200,
    headers: [
      { name: 'Set-Cookie', value: 'auth_session=not-persisted; Path=/; SameSite=None' },
      { name: 'Content-Security-Policy', value: "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'" },
      { name: 'Content-Type', value: 'text/html' },
      { name: 'Server', value: 'not-persisted' },
    ],
  });
  const capture = {
    captureId: 'security-fixture',
    checkpoint: 'page',
    theme: 'light',
    viewport: { name: 'desktop', width: 1280, height: 800 },
    url: 'https://example.test/account?token=%5BREDACTED%5D',
    status: 'valid',
    title: 'Account',
    language: 'en',
    metrics: { visibleElements: 3, textElements: 1, viewportWidth: 1280, documentWidth: 1280 },
    elements: [],
    fonts: [],
    assets: { failed: [] },
    tokens: {},
    security: {
      status: 'complete',
      mode: 'passive-safe',
      response,
      traffic: { mixedContent: [{ type: 'script', url: { id: 'url-mixed', protocol: 'http:', origin: 'http://cdn.example.test', path: '/app.js' } }] },
      dom: {
        page: {
          protocol: 'https:', secureTransport: true, localDevelopment: false,
          sensitiveQueryParameterCount: 1, sensitiveQueryCategories: ['token'],
        },
        forms: [{
          selector: '#login', method: 'GET', hasPassword: true, passwordCount: 1,
          sensitivePurposeCount: 1, passwordAutocomplete: ['missing'], sameOriginAction: false,
          action: { id: 'url-form', protocol: 'http:', origin: 'http://collector.example.test', path: '/submit' },
        }],
        resources: [{
          selector: '#external-script', tag: 'script', isStylesheet: false, crossOrigin: true,
          hasIntegrity: false, mixedContent: false,
          url: { id: 'url-script', protocol: 'https:', origin: 'https://cdn.example.test', path: '/app.js' },
        }],
        javascriptLinks: [{ selector: '#legacy-action', protocol: 'javascript:' }],
        iframes: [{
          selector: '#partner', crossOrigin: true, sandboxed: false, allowFeatures: [], mixedContent: false,
          url: { id: 'url-frame', protocol: 'https:', origin: 'https://partner.example.test', path: '/' },
        }],
        baseUrl: null,
        metaContentSecurityPolicy: { present: false, policyCount: 0 },
        inlineEventHandlerCount: 0,
        sensitiveInputCount: 2,
      },
    },
  };

  const analysis = analyzeScan({ url: capture.url, captures: [capture] }, {});
  const rules = new Set(analysis.issues.map((finding) => finding.ruleId));
  for (const rule of [
    'security.transport.mixed-content',
    'security.form.password-get',
    'security.form.insecure-action',
    'security.cookie.samesite-none-without-secure',
    'security.csp.unsafe-eval',
    'security.resource.external-without-integrity',
    'security.embed.unsandboxed-cross-origin-frame',
    'security.cache.sensitive-page',
    'security.privacy.sensitive-query',
  ]) assert.ok(rules.has(rule), `missing ${rule}`);

  assert.ok(analysis.issues.some((finding) => finding.category === 'Security' && finding.class === 'objective'));
  assert.ok(analysis.issues.some((finding) => finding.category === 'Security' && finding.class === 'heuristic'));
  assert.ok(analysis.coverage.checks.securityTransport.failed > 0);
  assert.ok(analysis.coverage.checks.securityHeaders.review > 0);

  const audit = {
    target: { url: capture.url, finalUrl: capture.url },
    captures: [capture],
    issues: analysis.issues,
    coverage: analysis.coverage,
    summary: analysis.summary,
  };
  audit.framework = buildFrameworkAssessment(audit);
  const cases = buildTestCases(audit);
  assert.equal(audit.framework.checks.find((check) => check.id === 'SEC-001').status, 'fail');
  assert.equal(audit.framework.checks.find((check) => check.id === 'SEC-007').status, 'manual');
  assert.equal(cases.find((item) => item.id === 'UIUX-SEC-008').category, 'Security');
  assert.equal(cases.find((item) => item.id === 'UIUX-SEC-008').automatable, false);
  assert.doesNotMatch(JSON.stringify({ analysis, cases }), /not-persisted/);
});

test('Playwright collector captures DOM and response security evidence without field, cookie, or query values', {
  skip: !fs.existsSync(chromium.executablePath()) ? 'Chromium is not installed' : false,
  timeout: 60000,
}, async (context) => {
  const html = `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Security Fixture</title>
    <style>body{font:16px/1.5 Arial,sans-serif}main{padding:2rem}</style>
    </head><body><main><h1>Secure account</h1><p>Fixture content.</p>
    <form id="login" method="get" action="/login"><label>Password <input type="password" name="password" value="field-super-secret"></label><button>Sign in</button></form>
    <a href="javascript:void(0)">Legacy action</a></main></body></html>`;
  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': 'session_id=cookie-super-secret; Path=/; SameSite=None',
      'content-security-policy': "default-src 'self' 'unsafe-inline'; object-src 'none'",
      'x-powered-by': 'framework-super-secret',
    });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-security-'));
  const config = loadConfig();
  config.viewports = [{ name: 'desktop', width: 1024, height: 768, isMobile: false }];
  config.themes = ['light'];
  config.navigation.settleMs = 0;
  config.capture.fullPage = false;
  config.capture.maxInteractiveStateSamples = 1;

  const scan = await scanWebsite({
    url: `http://127.0.0.1:${address.port}/account?token=query-super-secret`,
    config,
    artifactDir: directory,
  });
  const capture = scan.captures[0];
  assert.equal(capture.security.status, 'complete');
  assert.equal(capture.security.response.cookies.count, 1);
  assert.equal(capture.security.dom.forms[0].hasPassword, true);
  assert.equal(capture.security.dom.page.sensitiveQueryParameterCount, 1);
  const rules = new Set(analyzeScan(scan, config).issues.map((finding) => finding.ruleId));
  assert.ok(rules.has('security.form.password-get'));
  assert.ok(rules.has('security.cookie.samesite-none-without-secure'));
  assert.ok(rules.has('security.dom.javascript-url'));

  const serialized = JSON.stringify(scan);
  for (const secret of [
    'field-super-secret', 'cookie-super-secret', 'query-super-secret',
    'framework-super-secret', 'session_id',
  ]) assert.doesNotMatch(serialized, new RegExp(secret));
});
