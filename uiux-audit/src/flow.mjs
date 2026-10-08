import fs from 'node:fs';
import path from 'node:path';
import { sanitizeUrl } from './core.mjs';

const ALLOWED_ACTIONS = new Set([
  'click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'waitFor', 'wait', 'goto',
]);
const LOCATOR_KEYS = new Set(['role', 'label', 'placeholder', 'testId', 'text', 'css']);

function loadValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.env) {
    const resolved = process.env[value.env];
    if (resolved === undefined) throw new Error(`Flow needs environment variable ${value.env}.`);
    return resolved;
  }
  return value;
}

export function loadFlow(file) {
  if (!file) return null;
  const absolute = path.resolve(file);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Flow file does not exist: ${absolute}`);
    throw new Error(`Could not read flow ${absolute}: ${error.message}`);
  }
  validateFlow(value);
  return { ...value, sourceFile: absolute };
}

export function validateFlow(flow) {
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) throw new Error('A flow must be a JSON object.');
  if (!flow.name || typeof flow.name !== 'string') throw new Error('A flow needs a name.');
  if (!Array.isArray(flow.steps) || !flow.steps.length) throw new Error('A flow needs at least one step.');
  let checkpoints = 0;
  flow.steps.forEach((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error(`Flow step ${index + 1} must be an object.`);
    if (step.checkpoint) {
      checkpoints += 1;
      if (typeof step.checkpoint !== 'string') throw new Error(`Flow step ${index + 1} checkpoint must be text.`);
      return;
    }
    if (!ALLOWED_ACTIONS.has(step.action)) {
      throw new Error(`Flow step ${index + 1} has unsupported action "${step.action || ''}".`);
    }
    if (!['wait', 'goto'].includes(step.action)) validateLocator(step.locator, index);
    if (step.action === 'goto' && !step.url) throw new Error(`Flow step ${index + 1} goto needs a URL.`);
  });
  if (!checkpoints) throw new Error('A flow needs at least one checkpoint.');
  return flow;
}

function validateLocator(locator, index) {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    throw new Error(`Flow step ${index + 1} needs a locator object.`);
  }
  const keys = Object.keys(locator).filter((key) => LOCATOR_KEYS.has(key));
  if (keys.length !== 1) {
    throw new Error(`Flow step ${index + 1} locator must use exactly one of: ${[...LOCATOR_KEYS].join(', ')}.`);
  }
  if (keys[0] === 'role' && typeof locator.role === 'object' && !locator.role.name) {
    throw new Error(`Flow step ${index + 1} role locator needs a name.`);
  }
}

export function resolveLocator(page, locator) {
  if (locator.role) {
    if (typeof locator.role === 'string') return page.getByRole(locator.role);
    return page.getByRole(locator.role.type || locator.role.role, { name: locator.role.name, exact: locator.role.exact });
  }
  if (locator.label) return page.getByLabel(locator.label, { exact: !!locator.exact });
  if (locator.placeholder) return page.getByPlaceholder(locator.placeholder, { exact: !!locator.exact });
  if (locator.testId) return page.getByTestId(locator.testId);
  if (locator.text) return page.getByText(locator.text, { exact: !!locator.exact });
  return page.locator(locator.css);
}

export async function executeFlowStep(page, step, timeoutMs) {
  if (step.checkpoint) return { checkpoint: step.checkpoint };
  if (step.action === 'goto') {
    await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: step.timeoutMs || timeoutMs });
    return null;
  }
  if (step.action === 'wait') {
    await page.waitForTimeout(Number(step.ms || 500));
    return null;
  }

  const locator = resolveLocator(page, step.locator).first();
  const options = { timeout: step.timeoutMs || timeoutMs };
  switch (step.action) {
    case 'click': await locator.click(options); break;
    case 'fill': await locator.fill(String(loadValue(step.value) ?? ''), options); break;
    case 'select': await locator.selectOption(loadValue(step.value), options); break;
    case 'check': await locator.check(options); break;
    case 'uncheck': await locator.uncheck(options); break;
    case 'press': await locator.press(String(step.key), options); break;
    case 'hover': await locator.hover(options); break;
    case 'waitFor': await locator.waitFor({ state: step.state || 'visible', ...options }); break;
    default: throw new Error(`Unsupported flow action: ${step.action}`);
  }
  return null;
}

export function publicFlow(flow) {
  if (!flow) return null;
  return {
    name: flow.name,
    startUrl: flow.startUrl ? sanitizeUrl(flow.startUrl) : null,
    sourceFile: flow.sourceFile ? path.basename(flow.sourceFile) : null,
    steps: flow.steps.map((step) => {
      const safe = { ...step };
      if (safe.url) safe.url = sanitizeUrl(safe.url);
      if (!('value' in step)) return safe;
      return { ...safe, value: step.value?.env ? { env: step.value.env, value: '[REDACTED]' } : '[REDACTED]' };
    }),
  };
}
