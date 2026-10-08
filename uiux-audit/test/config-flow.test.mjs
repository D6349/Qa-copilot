import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_CONFIG_PATH,
  loadConfig,
  parseThemeSelection,
  parseViewportSelection,
  validateConfig,
} from '../src/config.mjs';
import { sanitizeUrl, stableHash } from '../src/core.mjs';
import { loadFlow, publicFlow, validateFlow } from '../src/flow.mjs';

test('default configuration is valid and includes the 320px reflow viewport', () => {
  const config = loadConfig({ configPath: DEFAULT_CONFIG_PATH });
  assert.ok(config.viewports.some((viewport) => viewport.width === 320));
  assert.deepEqual(config.themes, ['light', 'dark']);
  assert.ok(config.viewports.some((viewport) => viewport.width >= 1280));
  assert.equal(config.accessibility.axe.enabled, true);
  assert.equal(config.content.spelling.enabled, true);
  assert.ok(Array.isArray(config.approved.terms));
  assert.equal(validateConfig(config), config);
});

test('viewport selection accepts configured names and explicit dimensions', () => {
  const available = [{ name: 'mobile', width: 390, height: 844, isMobile: true }];
  assert.deepEqual(parseViewportSelection('mobile', available), available);
  assert.deepEqual(parseViewportSelection('412x915', available), [
    { name: 'custom-412x915', width: 412, height: 915, isMobile: true },
  ]);
  assert.throws(() => parseViewportSelection('unknown', available), /Unknown viewport/);
});

test('theme selection and validation reject unsupported themes', () => {
  assert.deepEqual(parseThemeSelection('light,dark', ['light']), ['light', 'dark']);
  const config = loadConfig();
  config.themes = ['sepia'];
  assert.throws(() => validateConfig(config), /Unsupported theme/);
});

test('flow validation allows safe declarative steps and rejects JavaScript actions', () => {
  const flow = {
    name: 'safe-flow',
    steps: [
      { checkpoint: 'start' },
      { action: 'fill', locator: { label: 'Email' }, value: { env: 'TEST_EMAIL' } },
      { action: 'click', locator: { role: { type: 'button', name: 'Continue' } } },
      { checkpoint: 'complete' },
    ],
  };
  assert.equal(validateFlow(flow), flow);
  assert.throws(() => validateFlow({ name: 'unsafe', steps: [{ action: 'evaluate', code: 'alert(1)' }] }), /unsupported action/);
});

test('loaded flow metadata redacts values backed by environment variables', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-flow-'));
  const file = path.join(directory, 'flow.json');
  fs.writeFileSync(file, JSON.stringify({
    name: 'login',
    steps: [
      { action: 'fill', locator: { label: 'Password' }, value: { env: 'TEST_PASSWORD' } },
      { checkpoint: 'signed-in' },
    ],
  }));
  const flow = loadFlow(file);
  const visible = JSON.stringify(publicFlow(flow));
  assert.match(visible, /REDACTED/);
  assert.doesNotMatch(visible, /actual-secret/);
});

test('URL sanitizer removes credentials and sensitive query values', () => {
  const sanitized = sanitizeUrl('https://alice:secret@example.com/page?token=abc&view=grid&api_key=123');
  assert.doesNotMatch(sanitized, /alice|secret|abc|123/);
  assert.match(sanitized, /view=grid/);
});

test('stable hash is deterministic', () => {
  assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ b: 2, a: 1 }));
  assert.notEqual(stableHash('a'), stableHash('b'));
});

