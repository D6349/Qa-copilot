import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(packageRoot, 'scripts', 'run-browser-matrix.mjs');

const fixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cross-browser fixture</title>
  <style>
    :root { color-scheme: light dark; font-family: Arial, sans-serif; }
    body { margin: 24px; background: #fff; color: #111; font-size: 16px; }
    main { max-width: 640px; margin: 0 auto; }
    label, input, button { display: block; font: inherit; }
    input { box-sizing: border-box; width: 100%; margin: 8px 0 16px; padding: 10px; }
    button { padding: 10px 16px; }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #f5f5f5; }
      input, button { background: #222; color: #fff; border: 1px solid #aaa; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Compatibility check</h1>
    <p>This deterministic local page verifies rendering without contacting a product endpoint.</p>
    <label for="password">Password</label>
    <input id="password" type="password" value="never-export-this" autocomplete="current-password">
    <p data-sensitive>Private account reference</p>
    <img src="__CROSS_ORIGIN_IMAGE__" alt="Compatibility marker" width="24" height="24">
    <button type="button">Continue</button>
  </main>
</body>
</html>`;

function startFixtureServer(crossOriginImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E') {
  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(fixture.replace('__CROSS_ORIGIN_IMAGE__', crossOriginImage));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/matrix` });
    });
  });
}

function startImageServer() {
  const receivedHeaders = [];
  const body = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#1677ff"/></svg>';
  const server = http.createServer((request, response) => {
    receivedHeaders.push(request.headers);
    response.writeHead(200, {
      'content-type': 'image/svg+xml',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    response.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        receivedHeaders,
        url: `http://127.0.0.1:${address.port}/marker.svg`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, ...args], {
      cwd: packageRoot,
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function safeRemoveTemporary(directory) {
  const expectedPrefix = path.join(os.tmpdir(), 'uiux-matrix-');
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(expectedPrefix)) throw new Error(`Refusing to remove unexpected path: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('matrix verifies Chromium, Firefox, and WebKit in light and dark themes', { timeout: 180_000 }, async () => {
  const imageServer = await startImageServer();
  const { server, url } = await startFixtureServer(imageServer.url);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-matrix-'));
  try {
    const result = await run(
      url,
      '--browsers', 'playwright',
      '--viewports', 'smoke=800x600',
      '--themes', 'light,dark',
      '--settle', '0',
      '--screenshots',
      '--header', 'X-Audit-Token: super-secret-value',
      '--out', outputDirectory,
    );
    const reportFile = path.join(outputDirectory, 'matrix.json');
    const reportText = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : '';
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${reportText}`);
    const command = JSON.parse(result.stdout);
    assert.equal(command.ok, true);
    assert.equal(command.summary.totalProfiles, 6);
    assert.equal(command.compatibility.groupsCompared, 2);
    assert.equal(command.compatibility.divergentGroups, 0);

    const csvFile = path.join(outputDirectory, 'matrix.csv');
    assert.equal(fs.existsSync(reportFile), true);
    assert.equal(fs.existsSync(csvFile), true);
    const report = JSON.parse(reportText);
    assert.deepEqual(report.requested.browsers, ['chromium', 'firefox', 'webkit']);
    assert.deepEqual(report.requested.themes, ['light', 'dark']);
    assert.equal(report.options.customHeaderCount, 1);
    assert.equal(report.options.maskedSelectorCount >= 5, true);
    assert.equal(report.results.every((item) => item.status === 'PASS'), true);
    assert.equal(reportText.includes('super-secret-value'), false);
    assert.equal(reportText.includes('never-export-this'), false);
    assert.equal(imageServer.receivedHeaders.length > 0, true);
    assert.equal(imageServer.receivedHeaders.every((headers) => !headers['x-audit-token']), true);

    const screenshots = fs.readdirSync(path.join(outputDirectory, 'screenshots'), { recursive: true })
      .filter((name) => String(name).endsWith('.png'));
    assert.equal(screenshots.length, 6);
  } finally {
    await closeServer(server);
    await closeServer(imageServer.server);
    safeRemoveTemporary(outputDirectory);
  }
});

test('strict preflight blocks execution and still returns one JSON document', { timeout: 30_000 }, async () => {
  const { server, url } = await startFixtureServer();
  await closeServer(server);
  const result = await run(url, '--browsers', 'playwright', '--preflight-only');
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.executionStatus, 'preflight-only');
  assert.equal(parsed.status, 'BLOCKED');
  assert.equal(parsed.preflight.urls[0].status, 'BLOCKED');
});
