import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_CONFIG_PATH = path.join(PACKAGE_ROOT, 'uiux.config.json');

const clone = (value) => JSON.parse(JSON.stringify(value));

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return clone(extra);
  const result = { ...(base || {}) };
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = merge(result[key] || {}, value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Configuration file does not exist: ${file}`);
    throw new Error(`Could not read configuration ${file}: ${error.message}`);
  }
}

function number(value, label, { min = 0 } = {}) {
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${label} must be a number greater than or equal to ${min}.`);
  }
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
}

export function validateConfig(config) {
  if (!Array.isArray(config.viewports) || config.viewports.length === 0) {
    throw new Error('At least one viewport is required.');
  }
  const viewportNames = new Set();
  for (const viewport of config.viewports) {
    if (!viewport?.name || typeof viewport.name !== 'string') {
      throw new Error('Every viewport needs a name.');
    }
    if (viewportNames.has(viewport.name)) throw new Error(`Duplicate viewport name: ${viewport.name}`);
    viewportNames.add(viewport.name);
    number(viewport.width, `Viewport ${viewport.name} width`, { min: 240 });
    number(viewport.height, `Viewport ${viewport.name} height`, { min: 240 });
  }

  const themes = new Set(['light', 'dark', 'no-preference']);
  if (!Array.isArray(config.themes) || config.themes.length === 0) {
    throw new Error('At least one color theme is required.');
  }
  for (const theme of config.themes) {
    if (!themes.has(theme)) throw new Error(`Unsupported theme "${theme}". Use light, dark, or no-preference.`);
  }

  number(config.navigation.timeoutMs, 'navigation.timeoutMs', { min: 1000 });
  number(config.navigation.settleMs, 'navigation.settleMs');
  number(config.capture.maxElements, 'capture.maxElements', { min: 1 });
  number(config.capture.maxInteractiveStateSamples, 'capture.maxInteractiveStateSamples');
  number(config.capture.autoScrollDelayMs, 'capture.autoScrollDelayMs');
  number(config.capture.autoScrollMaxSteps, 'capture.autoScrollMaxSteps', { min: 1 });

  for (const key of ['fullPage', 'disableMotion', 'warmLazyContent']) {
    if (typeof config.capture[key] !== 'boolean') throw new Error(`capture.${key} must be a boolean.`);
  }

  for (const [key, value] of Object.entries(config.thresholds || {})) {
    number(value, `thresholds.${key}`);
  }

  for (const key of ['ignoreSelectors', 'maskSelectors']) {
    stringArray(config.capture[key], `capture.${key}`);
  }
  for (const key of ['fontFamilies', 'colors', 'terms']) {
    stringArray(config.approved[key], `approved.${key}`);
  }

  const axe = config.accessibility?.axe;
  if (!axe || typeof axe !== 'object') throw new Error('accessibility.axe configuration is required.');
  if (typeof axe.enabled !== 'boolean') throw new Error('accessibility.axe.enabled must be a boolean.');
  stringArray(axe.tags, 'accessibility.axe.tags');
  stringArray(axe.disabledRules, 'accessibility.axe.disabledRules');
  number(axe.maximumNodesPerRule, 'accessibility.axe.maximumNodesPerRule', { min: 1 });

  const spelling = config.content?.spelling;
  if (!spelling || typeof spelling !== 'object') throw new Error('content.spelling configuration is required.');
  if (typeof spelling.enabled !== 'boolean') throw new Error('content.spelling.enabled must be a boolean.');
  if (spelling.locale !== null && typeof spelling.locale !== 'string') {
    throw new Error('content.spelling.locale must be a string or null.');
  }
  if (typeof spelling.ignoreUppercaseAcronyms !== 'boolean') {
    throw new Error('content.spelling.ignoreUppercaseAcronyms must be a boolean.');
  }
  number(spelling.minimumWordLength, 'content.spelling.minimumWordLength', { min: 1 });
  number(spelling.maximumIssuesPerCapture, 'content.spelling.maximumIssuesPerCapture', { min: 1 });
  stringArray(spelling.words, 'content.spelling.words');
  stringArray(spelling.ignoreWords, 'content.spelling.ignoreWords');
  return config;
}

export function parseViewportSelection(selection, available) {
  if (!selection) return clone(available);
  const requested = String(selection).split(',').map((item) => item.trim()).filter(Boolean);
  if (!requested.length) throw new Error('The viewport selection is empty.');

  return requested.map((item) => {
    const named = available.find((viewport) => viewport.name.toLowerCase() === item.toLowerCase());
    if (named) return clone(named);
    const custom = item.match(/^(\d{3,4})x(\d{3,4})$/i);
    if (!custom) {
      throw new Error(`Unknown viewport "${item}". Known names: ${available.map((v) => v.name).join(', ')}, or use WIDTHxHEIGHT.`);
    }
    const width = Number(custom[1]);
    const height = Number(custom[2]);
    return { name: `custom-${width}x${height}`, width, height, isMobile: width < 768 };
  });
}

export function parseThemeSelection(selection, available) {
  if (!selection) return [...available];
  return String(selection).split(',').map((item) => item.trim()).filter(Boolean);
}

export function loadConfig({ configPath = DEFAULT_CONFIG_PATH, overrides = {} } = {}) {
  const defaults = readJson(DEFAULT_CONFIG_PATH);
  const supplied = path.resolve(configPath) === path.resolve(DEFAULT_CONFIG_PATH)
    ? defaults
    : merge(defaults, readJson(path.resolve(configPath)));
  const config = merge(supplied, overrides);
  return validateConfig(config);
}

export function publicConfig(config) {
  return clone(config);
}
