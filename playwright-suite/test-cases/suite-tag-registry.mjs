const TAG_ORDER = [
  'functional',
  'non-functional',
  'smoke',
  'prod-smoke',
  'sanity',
  'regression',
  'e2e',
  'integration',
  'security',
  'a11y',
  'api',
  'responsive',
  'compatibility',
  'visual-regression',
  'performance',
  'localization',
  'exploratory',
  'uat',
  'retest',
];

const DISPLAY_NAMES = {
  functional: 'Functional',
  'non-functional': 'Non-Functional',
  smoke: 'Smoke',
  'prod-smoke': 'Production Smoke',
  sanity: 'Sanity',
  regression: 'Regression',
  e2e: 'End-to-End',
  integration: 'Integration',
  security: 'Security',
  a11y: 'Accessibility',
  api: 'API',
  responsive: 'Responsive',
  compatibility: 'Compatibility',
  'visual-regression': 'Visual Regression',
  performance: 'Performance',
  localization: 'Localization',
  exploratory: 'Exploratory',
  uat: 'UAT',
  retest: 'Retest',
};

const SPECIAL_TAGS = new Map();

addTags(
  ['AC-001', 'AF-001', 'TL-001', 'CN-001', 'KB-001', 'GR-001', 'UC-001', 'PT-001'],
  ['smoke', 'prod-smoke'],
);

addTags(
  [
    'AC-001', 'AC-002', 'AC-003',
    'AF-001', 'AF-002', 'AF-006', 'AF-016',
    'TL-001', 'TL-002', 'TL-003', 'TL-010',
    'CN-001', 'CN-002', 'CN-004', 'CN-010',
    'KB-001', 'KB-002', 'KB-004', 'KB-015',
    'GR-001', 'GR-002', 'GR-004', 'GR-016',
    'UC-001', 'UC-002', 'UC-004', 'UC-014', 'UC-016',
    'PT-001', 'PT-009',
  ],
  ['sanity', 'uat'],
);

addTags(
  [
    ...range('AC', 1, 12),
    'AF-019', 'AF-020', 'AF-021', 'AF-022', 'AF-023', 'AF-024', 'AF-030',
    'TL-011', 'TL-012', 'TL-013', 'TL-014', 'TL-015',
    'CN-011', 'CN-012', 'CN-013', 'CN-014', 'CN-015', 'CN-016', 'CN-017', 'CN-024',
    'KB-016', 'KB-017', 'KB-020', 'KB-021', 'KB-024', 'KB-027', 'KB-028', 'KB-030',
    'GR-017', 'GR-018', 'GR-019', 'GR-020', 'GR-021', 'GR-022', 'GR-023', 'GR-030',
    'UC-017', 'UC-018', 'UC-019', 'UC-020', 'UC-021', 'UC-022', 'UC-023', 'UC-030',
    ...range('PT', 2, 8),
  ],
  ['e2e'],
);

addTags(
  [
    'AC-005', 'AC-006', 'AC-008', 'AC-009', 'AC-011', 'AC-012',
    'AF-015', 'AF-019', 'AF-020', 'AF-022', 'AF-023',
    'TL-009', 'TL-011', 'TL-012', 'TL-014', 'TL-015',
    'CN-004', 'CN-006', 'CN-011', 'CN-012', 'CN-015', 'CN-016',
    'KB-005', 'KB-008', 'KB-009', 'KB-015', 'KB-016', 'KB-020', 'KB-021', 'KB-028',
    'GR-014', 'GR-017', 'GR-018', 'GR-021', 'GR-022',
    'UC-013', 'UC-017', 'UC-018', 'UC-021', 'UC-022',
  ],
  ['integration'],
);

addTags(
  ['TL-005', 'TL-006', 'TL-007', 'TL-008', 'TL-009', 'TL-016', 'TL-017'],
  ['api'],
);

export const SUITE_TAGS = Object.freeze([...TAG_ORDER]);

export function automatedSuiteTags(caseId, sourceTags = []) {
  const tags = new Set(['functional', 'regression']);
  for (const sourceTag of sourceTags) {
    const normalized = normalizeTag(sourceTag);
    if (TAG_ORDER.includes(normalized)) tags.add(normalized);
    if (normalized === 'accessibility') tags.add('a11y');
  }
  for (const tag of SPECIAL_TAGS.get(caseId) || []) tags.add(tag);
  if ([
    'security',
    'a11y',
    'responsive',
    'compatibility',
    'visual-regression',
    'performance',
    'localization',
  ].some((tag) => tags.has(tag))) {
    tags.add('non-functional');
  }
  return sortTags(tags);
}

export function manualSuiteTags(item) {
  const text = [
    item.feature,
    item.title,
    item.category,
    item.reviewMethod,
  ].join(' ').toLowerCase();
  const subject = [item.feature, item.title, item.category].join(' ').toLowerCase();
  const tags = new Set(['non-functional', 'regression']);
  if (/accessib|screen reader|keyboard|focus|contrast|forced.?color/.test(text)) tags.add('a11y');
  if (/responsive|viewport|mobile|tablet|reflow|zoom|text expansion/.test(text)) tags.add('responsive');
  if (/compatib|cross.?browser|browser matrix|supported browsers/.test(text)) tags.add('compatibility');
  if (/visual regression|screenshot baseline|pixel.?diff/.test(text)) tags.add('visual-regression');
  if (/performance|web vital|largest contentful|interaction to next paint|\blcp\b|\binp\b/.test(text)) tags.add('performance');
  if (/locali[sz]ation|internationali[sz]ation|text expansion|right-to-left|rtl/.test(text)) tags.add('localization');
  if (/exploratory|charter/.test(text)) tags.add('exploratory');
  if (/\buat\b|acceptance/.test(text)) tags.add('uat');
  if (/security|permission|authorization/.test(subject)) tags.add('security');
  if (/\bapi\b|endpoint|json editor|schema editor/.test(subject)) tags.add('api');
  return sortTags(tags);
}

export function suiteNames(tags) {
  return sortTags(tags).map((tag) => DISPLAY_NAMES[tag] || titleCase(tag)).join(', ');
}

export function formatExecutionTags(tags) {
  return sortTags(tags).map((tag) => `@${tag}`).join(' ');
}

export function normalizeTag(value) {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function addTags(ids, tags) {
  for (const id of ids) {
    const current = new Set(SPECIAL_TAGS.get(id) || []);
    tags.forEach((tag) => current.add(tag));
    SPECIAL_TAGS.set(id, [...current]);
  }
}

function range(prefix, start, end) {
  return Array.from(
    { length: end - start + 1 },
    (_unused, index) => `${prefix}-${String(start + index).padStart(3, '0')}`,
  );
}

function sortTags(tags) {
  return [...new Set([...tags].map(normalizeTag).filter(Boolean))]
    .sort((left, right) => {
      const leftIndex = TAG_ORDER.indexOf(left);
      const rightIndex = TAG_ORDER.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
}

function titleCase(value) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
