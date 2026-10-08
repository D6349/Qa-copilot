/**
 * builder.js - the single place a test case object is constructed.
 *
 * IDs and dedupe keys are derived from content, not from a counter, so scanning
 * the same page twice produces byte-identical cases. That is what makes the
 * re-scan diff meaningful.
 */
import crypto from 'node:crypto';

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

/** Human-friendly locator suggestion, in Playwright's recommended order. */
export function suggestLocator(field) {
  if (!field) return {};
  if (field.testId) return { [field.key]: `getByTestId('${field.testId}')` };
  if (field.label) return { [field.key]: `getByLabel('${escapeQuotes(field.label)}')` };
  if (field.placeholder) return { [field.key]: `getByPlaceholder('${escapeQuotes(field.placeholder)}')` };
  if (field.name) return { [field.key]: `locator('[name="${field.name}"]')` };
  if (field.id) return { [field.key]: `locator('#${field.id}')` };
  return { [field.key]: `locator('${field.tag}')` };
}

export const escapeQuotes = (s) => String(s).replace(/'/g, "\\'");

/** Truncate long payloads so the Excel sheet stays readable. */
export const short = (v, n = 60) => {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s;
};

export function makeCase({
  ruleId,
  page,
  project,
  module: mod,
  subModule = '',
  title,
  description = '',
  category,
  type = 'Manual',
  priority = 'P3',
  severity = 'Medium',
  preconditions = [],
  testData = {},
  steps = [],
  expectedResult,
  automatable = true,
  isSmoke = false,
  isRegression = true,
  selectors = {},
  tags = [],
  requirementRef = '',
}) {
  const dedupeKey = hash(`${page.id}|${ruleId}|${title}`);
  const modSlug = (mod || 'GEN').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'GEN';
  return {
    id: `TC_${modSlug}_${dedupeKey.slice(0, 6).toUpperCase()}`,
    dedupeKey,
    projectId: project.id,
    pageId: page.id,
    pageUrl: page.url,
    module: mod,
    subModule,
    title,
    description,
    type,
    category,
    priority,
    severity,
    source: 'rules',
    ruleId,
    preconditions: [`Application is reachable at ${page.url}`, ...preconditions],
    testData,
    steps: steps.map((s, i) => ({
      step: i + 1,
      action: typeof s === 'string' ? s : s.action,
      data: typeof s === 'string' ? '' : (s.data || ''),
    })),
    expectedResult,
    actualResult: '',
    status: 'Not Run',
    isRegression,
    isSmoke,
    automatable,
    selectors,
    requirementRef,
    pageOwner: project.defaults?.pageOwner || '',
    createdBy: project.defaults?.createdBy || '',
    tags,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Readable name for a field in a test case title. */
export function fieldLabel(field) {
  return field.label || field.placeholder || field.name || field.id || field.type;
}

/** How many cases per rule family, by aggressiveness setting. */
export const budget = {
  lean: { payloads: 1, stress: 2, invalidFormats: 2, viewports: 2 },
  standard: { payloads: 2, stress: 4, invalidFormats: 4, viewports: 4 },
  exhaustive: { payloads: 5, stress: 8, invalidFormats: 99, viewports: 4 },
};
