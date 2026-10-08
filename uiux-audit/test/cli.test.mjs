import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'cli.mjs');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: path.parse(packageRoot).root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('doctor works outside the repository cwd and prints one JSON document', () => {
  const result = run('doctor');
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.independentFromQaProjects, true);
  assert.equal(parsed.playwright.browserInstalled, true);
  assert.equal(parsed.requirements.node.supported, true);
  assert.equal(parsed.dependencies.allInstalled, true);
  assert.equal(parsed.filesystem.packageRootWritable, true);
  assert.equal(parsed.playwright.browserLaunchable, true);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  assert.equal(parsed.playwright.crossBrowserReady, true);
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    assert.equal(parsed.playwright.browsers[browser].installed, true);
    assert.equal(parsed.playwright.browsers[browser].launchable, true);
  }
});

test('framework command prints the complete shareable verification catalog', () => {
  const result = run('framework');
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version, '2.2');
  assert.ok(parsed.counts.checks >= 30);
  assert.ok(parsed.checks.every((check) => check.passCriteria && check.verificationSteps.length));
  assert.ok(parsed.references.some((reference) => reference.id === 'WCAG-2.2'));
});

test('CLI failures still print structured JSON to stdout and diagnostics to stderr', () => {
  const result = run('not-a-command');
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.executionStatus, 'failed');
  assert.match(parsed.error.message, /Unknown command/);
  assert.match(result.stderr, /UI\/UX audit error/);
});

test('help documents automatic date-wise output and custom page labels', () => {
  const result = run('help');
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.match(parsed.options['--out'], /YYYY-MM-DD\/site\/page\/run/);
  assert.match(parsed.options['--label'], /page-folder label/);
  assert.match(parsed.options['--full'], /at most 25 compact findings/);
});
