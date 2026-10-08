/**
 * rules/index.js - run every rule family over a page model.
 *
 * Deterministic: the same model produces the same cases, in the same order,
 * with the same IDs. Returns a coverage report alongside the cases so you can
 * see which rules fired and which fields produced nothing.
 */
import { budget } from './builder.js';
import {
  requiredRules, lengthRules, numericRules, formatRules, typeRules, payloadRules,
} from './fields.js';
import {
  securityRules, a11yRules, apiRules, interactionRules, platformRules,
} from './page.js';
import { detectFormat } from '../testData.js';

export const FAMILIES = [
  { id: 'required', label: 'Required-field validation', scope: 'field' },
  { id: 'length', label: 'Length boundaries', scope: 'field' },
  { id: 'numeric', label: 'Numeric ranges', scope: 'field' },
  { id: 'format', label: 'Indian format validation (PAN/GSTIN/CIN…)', scope: 'field' },
  { id: 'datatype', label: 'Data type, dropdowns, uploads, dates, passwords', scope: 'field' },
  { id: 'payload', label: 'Unicode and stress input', scope: 'field' },
  { id: 'security', label: 'Security / OWASP', scope: 'page' },
  { id: 'a11y', label: 'Accessibility (WCAG 2.1 AA)', scope: 'page' },
  { id: 'api', label: 'API contract and negative tests', scope: 'page' },
  { id: 'interaction', label: 'Buttons, links, tables, navigation', scope: 'page' },
  { id: 'platform', label: 'Responsive, cross-browser, performance', scope: 'page' },
];

export const ALL_FAMILIES = FAMILIES.map((f) => f.id);

const FIELD_RULES = {
  required: requiredRules,
  length: lengthRules,
  numeric: numericRules,
  format: formatRules,
  datatype: typeRules,
  payload: payloadRules,
};

const PAGE_RULES = {
  security: securityRules,
  a11y: a11yRules,
  api: apiRules,
  interaction: interactionRules,
  platform: platformRules,
};

/**
 * @param {object} args
 * @param {object} args.project
 * @param {object} args.page      - the stored page record (id, url, module)
 * @param {object} args.model     - the page model from the inspector
 * @param {string[]} [args.families]
 * @param {'lean'|'standard'|'exhaustive'} [args.aggressiveness]
 */
export function generate({ project, page, model, families = ALL_FAMILIES, aggressiveness = 'standard' }) {
  const limits = budget[aggressiveness] || budget.standard;
  const ctx = { project, page, module: page.module || 'GENERAL', limits };

  const cases = [];
  const byFamily = {};
  const bump = (id, n) => { byFamily[id] = (byFamily[id] || 0) + n; };

  const fields = (model.fields || []).filter((f) => !['submit', 'button', 'hidden'].includes(f.type));

  for (const field of fields) {
    for (const [id, fn] of Object.entries(FIELD_RULES)) {
      if (!families.includes(id)) continue;
      const produced = fn(ctx, field);
      cases.push(...produced);
      bump(id, produced.length);
    }
  }

  for (const [id, fn] of Object.entries(PAGE_RULES)) {
    if (!families.includes(id)) continue;
    const produced = fn(ctx, model);
    cases.push(...produced);
    bump(id, produced.length);
  }

  // Dedupe defensively — two rules can legitimately converge on the same title.
  const seen = new Set();
  const unique = cases.filter((c) => {
    if (seen.has(c.dedupeKey)) return false;
    seen.add(c.dedupeKey);
    return true;
  });

  const fieldCoverage = fields.map((f) => ({
    key: f.key,
    label: f.label || f.placeholder || f.name || f.id,
    type: f.type,
    detectedFormat: detectFormat(f),
    caseCount: unique.filter((c) => c.subModule === (f.label || f.placeholder || f.name || f.id || f.type)).length,
  }));

  return {
    cases: unique,
    coverage: {
      total: unique.length,
      byFamily,
      byCategory: countBy(unique, 'category'),
      byPriority: countBy(unique, 'priority'),
      byType: countBy(unique, 'type'),
      automatable: unique.filter((c) => c.automatable).length,
      smoke: unique.filter((c) => c.isSmoke).length,
      fieldsScanned: fields.length,
      fieldsWithNoCases: fieldCoverage.filter((f) => f.caseCount === 0).map((f) => f.key),
      fieldCoverage,
      duplicatesDropped: cases.length - unique.length,
      aggressiveness,
      familiesRun: families,
    },
  };
}

function countBy(arr, key) {
  return arr.reduce((acc, x) => { acc[x[key]] = (acc[x[key]] || 0) + 1; return acc; }, {});
}
