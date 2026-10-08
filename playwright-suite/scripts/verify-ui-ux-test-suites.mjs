import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_UX_MANUAL_CASES } from '../test-cases/ui-ux-manual/index.mjs';
import {
  automatedSuiteTags,
  formatExecutionTags,
  manualSuiteTags,
  normalizeTag,
  suiteNames,
} from '../test-cases/suite-tag-registry.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputDirectory = path.resolve(
  process.env.UI_UX_TEST_SUITE_DIR
    || path.join(suiteRoot, 'test-data'),
);

const SHEET_NAMES = [
  'Instructions',
  'Automated Cases',
  'Manual UI UX Cases',
  'Coverage Summary',
  'Field Reference',
];

const AUTOMATED_HEADERS = [
  'Sequence',
  'Test Case ID',
  'Module',
  'Feature / Area',
  'Test Case Title',
  'Objective',
  'Preconditions',
  'Test Steps',
  'Test Data / Inputs',
  'Expected Result',
  'Category',
  'Scenario Type',
  'Priority',
  'Severity',
  'Automation Status',
  'Write Operation',
  'Environment',
  'Test Suites',
  'Execution Tags',
  'Tags',
  'Source',
  'Notes',
];

const MANUAL_HEADERS = [
  'Sequence',
  'Test Case ID',
  'Module',
  'Feature / Area',
  'Test Case Title',
  'Objective',
  'Preconditions',
  'Test Steps',
  'Test Data / Viewport',
  'Expected Result',
  'UX Category',
  'Review Method',
  'Priority',
  'Severity',
  'Recommended Environment',
  'Test Suites',
  'Execution Tags',
  'Status',
  'Actual Result',
  'Executed By',
  'Executed On',
  'Defect ID',
  'Remarks',
];
const MANUAL_STATUS_VALUES = new Set([
  'Not Run',
  'Pass',
  'Fail',
  'Blocked',
  'Not Applicable',
]);

const FORBIDDEN_API_HEADERS = new Set([
  'method',
  'endpoint',
  'queryparams',
  'headers',
  'requestbody',
  'expectedstatus',
  'expectedresponsecontains',
  'expectedjsonpath',
  'expectedjsonvalue',
  'maxresponsetimems',
  'saveas',
  'runflag',
]);

const configs = [
  {
    name: 'Account',
    slug: 'account',
    prefix: 'AC',
    outputName: 'account-ui-ux-test-cases.xlsx',
    automatedCount: 12,
  },
  {
    name: 'Agents',
    slug: 'agents',
    prefix: 'AF',
    outputName: 'agents-ui-ux-test-cases.xlsx',
    automatedCount: 30,
  },
  {
    name: 'Tools',
    slug: 'tools',
    prefix: 'TL',
    outputName: 'tools-ui-ux-test-cases.xlsx',
    automatedCount: 49,
  },
  {
    name: 'Connectors',
    slug: 'connectors',
    prefix: 'CN',
    outputName: 'connectors-ui-ux-test-cases.xlsx',
    automatedCount: 24,
  },
  {
    name: 'Knowledge',
    slug: 'knowledge',
    prefix: 'KB',
    outputName: 'knowledge-ui-ux-test-cases.xlsx',
    automatedCount: 30,
  },
  {
    name: 'Guardrails',
    slug: 'guardrails',
    prefix: 'GR',
    outputName: 'guardrails-ui-ux-test-cases.xlsx',
    automatedCount: 30,
  },
  {
    name: 'UI Components',
    slug: 'ui-components',
    prefix: 'UC',
    outputName: 'ui-components-ui-ux-test-cases.xlsx',
    automatedCount: 30,
  },
  {
    name: 'Product Tour',
    slug: 'product-tour',
    prefix: 'PT',
    outputName: 'product-tour-ui-ux-test-cases.xlsx',
    automatedCount: 12,
  },
];
const requestedModule = (process.env.UI_UX_MODULE || '').trim().toLowerCase();
const selectedConfigs = requestedModule
  ? configs.filter((config) => config.slug === requestedModule)
  : configs;
if (requestedModule && selectedConfigs.length !== 1) {
  throw new Error(`Unknown UI_UX_MODULE: ${requestedModule}`);
}

const catalogFile = path.join(suiteRoot, 'test-data', 'ui-automation-test-catalog.xlsx');
assert(fs.existsSync(catalogFile), `Missing source catalog: ${catalogFile}`);
const catalogWorkbook = new ExcelJS.Workbook();
await catalogWorkbook.xlsx.readFile(catalogFile);
const catalogSheet = catalogWorkbook.getWorksheet('UI Test Cases');
assert(catalogSheet, 'Source catalog is missing UI Test Cases');
const catalogCases = readCatalogCases(catalogSheet);

const results = [];
for (const config of selectedConfigs) {
  const filePath = path.join(outputDirectory, config.outputName);
  assert(fs.existsSync(filePath), `Missing workbook: ${filePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assertDeepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    SHEET_NAMES,
    `${config.name}: worksheet order`,
  );
  assert(
    workbook.title === `${config.name} UI/UX Test Cases`,
    `${config.name}: unexpected workbook title`,
  );

  const automatedSheet = workbook.getWorksheet('Automated Cases');
  const manualSheet = workbook.getWorksheet('Manual UI UX Cases');
  const instructionsSheet = workbook.getWorksheet('Instructions');
  const summarySheet = workbook.getWorksheet('Coverage Summary');
  const referenceSheet = workbook.getWorksheet('Field Reference');

  assertDeepEqual(headers(automatedSheet), AUTOMATED_HEADERS, `${config.name}: automated headers`);
  assertDeepEqual(headers(manualSheet), MANUAL_HEADERS, `${config.name}: manual headers`);
  assertNoApiHeaders(config.name, automatedSheet, manualSheet);

  const automatedRows = populatedRows(automatedSheet, 2);
  const manualRows = populatedRows(manualSheet, 2);
  const expectedManualCases = UI_UX_MANUAL_CASES[config.name];
  assert(
    automatedRows.length === config.automatedCount,
    `${config.name}: expected ${config.automatedCount} automated cases; found ${automatedRows.length}`,
  );
  assert(
    manualRows.length === expectedManualCases.length,
    `${config.name}: expected ${expectedManualCases.length} manual cases; found ${manualRows.length}`,
  );

  validateAutomatedRows(config, automatedSheet, automatedRows);
  validateManualRows(config, manualSheet, manualRows, expectedManualCases);
  validateLayout(config, automatedSheet, manualSheet, instructionsSheet, summarySheet, referenceSheet);
  validateSummary(
    config,
    summarySheet,
    manualSheet,
    manualRows,
  );
  validateSnapshot(config, workbook);

  results.push({
    module: config.name,
    file: path.relative(suiteRoot, filePath).replace(/\\/g, '/'),
    automatedCases: automatedRows.length,
    manualUiUxCases: manualRows.length,
    totalCases: automatedRows.length + manualRows.length,
  });
}

if (!requestedModule) {
  assert(configs.length === 8, `Expected eight module workbooks; found ${configs.length}`);
  assert(
    results.reduce((total, item) => total + item.automatedCases, 0) === 217,
    'Expected exactly 217 automated cases across the eight module workbooks',
  );
} else {
  assert(results.length === 1, 'Scoped UI/UX verification must return one workbook');
  assert(
    results[0].automatedCases === selectedConfigs[0].automatedCount,
    `${selectedConfigs[0].name}: scoped automated case total is incorrect`,
  );
}

console.log(JSON.stringify({ ok: true, workbooks: results }, null, 2));

function validateAutomatedRows(config, sheet, rows) {
  const columns = headerMap(sheet);
  const ids = new Set();
  const smokeIds = [];
  for (const [index, row] of rows.entries()) {
    const id = textAt(row, columns, 'Test Case ID');
    assert(id.startsWith(`${config.prefix}-`), `${config.name}: invalid automated ID ${id}`);
    assert(!ids.has(id), `${config.name}: duplicate automated ID ${id}`);
    ids.add(id);
    for (const header of [
      'Module',
      'Feature / Area',
      'Test Case Title',
      'Objective',
      'Preconditions',
      'Test Steps',
      'Test Data / Inputs',
      'Expected Result',
      'Category',
      'Scenario Type',
      'Priority',
      'Severity',
      'Automation Status',
      'Environment',
      'Test Suites',
      'Execution Tags',
      'Tags',
      'Source',
    ]) {
      assert(textAt(row, columns, header), `${config.name} ${id}: ${header} is blank`);
    }
    assert(textAt(row, columns, 'Module') === config.name, `${config.name} ${id}: module mismatch`);
    assert(textAt(row, columns, 'Automation Status') === 'Automated', `${config.name} ${id}: status mismatch`);
    assert(['P0', 'P1', 'P2', 'P3'].includes(textAt(row, columns, 'Priority')), `${config.name} ${id}: priority mismatch`);
    assert(['Critical', 'Major', 'Minor'].includes(textAt(row, columns, 'Severity')), `${config.name} ${id}: severity mismatch`);
    const expected = catalogCases.get(`${config.name}:${id}`);
    assert(expected, `${config.name} ${id}: case is missing from the source catalog`);
    const sourceTags = parseSourceTags(expected.tags)
      .filter((tag) => tag !== 'retest');
    const suiteTags = automatedSuiteTags(expected.id, sourceTags);
    const expectedValues = {
      Sequence: String(index + 1),
      'Test Case ID': expected.id,
      Module: expected.module,
      'Feature / Area': expected.feature,
      'Test Case Title': expected.title,
      Objective: expected.objective,
      Preconditions: expected.preconditions,
      'Test Steps': expected.steps,
      'Test Data / Inputs': expected.testData,
      'Expected Result': expected.expectedResult,
      Category: expected.category,
      'Scenario Type': expected.scenarioType,
      Priority: expected.priority,
      Severity: expected.severity,
      'Automation Status': 'Automated',
      'Write Operation': expected.writeOperation,
      Environment: 'Configured DEV / UAT / LIVE',
      'Test Suites': suiteNames(suiteTags),
      'Execution Tags': formatExecutionTags(suiteTags),
      Tags: expected.tags,
      Source: expected.source,
      Notes: expected.notes,
    };
    for (const [header, expectedValue] of Object.entries(expectedValues)) {
      assert(
        textAt(row, columns, header) === canonicalText(expectedValue),
        `${config.name} ${id}: ${header} does not match the source catalog. `
          + `Expected ${JSON.stringify(canonicalText(expectedValue))}; `
          + `received ${JSON.stringify(textAt(row, columns, header))}`,
      );
    }
    const executionTags = validateExecutionTags(
      config.name,
      id,
      textAt(row, columns, 'Execution Tags'),
    );
    assert(
      executionTags.includes('@regression'),
      `${config.name} ${id}: every automated case must include @regression`,
    );
    if (executionTags.includes('@smoke')) smokeIds.push(id);
  }
  assertDeepEqual(
    smokeIds,
    [`${config.prefix}-001`],
    `${config.name}: exactly the curated ${config.prefix}-001 case must include @smoke`,
  );
}

function validateManualRows(config, sheet, rows, expectedCases) {
  const columns = headerMap(sheet);
  const ids = new Set();
  const actualIds = [];
  for (const [index, row] of rows.entries()) {
    const id = textAt(row, columns, 'Test Case ID');
    actualIds.push(id);
    assert(id.startsWith(`${config.prefix}-UX-`), `${config.name}: invalid manual ID ${id}`);
    assert(!ids.has(id), `${config.name}: duplicate manual ID ${id}`);
    ids.add(id);
    for (const header of [
      'Module',
      'Feature / Area',
      'Test Case Title',
      'Objective',
      'Preconditions',
      'Test Steps',
      'Test Data / Viewport',
      'Expected Result',
      'UX Category',
      'Review Method',
      'Priority',
      'Severity',
      'Recommended Environment',
      'Test Suites',
      'Execution Tags',
      'Status',
    ]) {
      assert(textAt(row, columns, header), `${config.name} ${id}: ${header} is blank`);
    }
    assert(textAt(row, columns, 'Module') === config.name, `${config.name} ${id}: module mismatch`);
    assert(
      MANUAL_STATUS_VALUES.has(textAt(row, columns, 'Status')),
      `${config.name} ${id}: unsupported manual Status`,
    );
    assert(['P0', 'P1', 'P2', 'P3'].includes(textAt(row, columns, 'Priority')), `${config.name} ${id}: priority mismatch`);
    assert(['Critical', 'Major', 'Minor'].includes(textAt(row, columns, 'Severity')), `${config.name} ${id}: severity mismatch`);
    const expected = expectedCases[index];
    const suiteTags = manualSuiteTags(expected);
    const moduleTag = config.slug;
    const categoryTag = normalizeTag(expected.category);
    const expectedValues = {
      Sequence: String(index + 1),
      'Test Case ID': expected.id,
      Module: config.name,
      'Feature / Area': expected.feature,
      'Test Case Title': expected.title,
      Objective: expected.objective,
      Preconditions: numbered(expected.preconditions),
      'Test Steps': numbered(expected.steps),
      'Test Data / Viewport': expected.testData,
      'Expected Result': expected.expectedResult,
      'UX Category': expected.category,
      'Review Method': expected.reviewMethod,
      Priority: expected.priority,
      Severity: expected.severity,
      'Recommended Environment': expected.environment,
      'Test Suites': suiteNames(suiteTags),
      'Execution Tags': formatExecutionTags([
        ...suiteTags,
        'manual',
        moduleTag,
        categoryTag,
      ]),
    };
    for (const [header, expectedValue] of Object.entries(expectedValues)) {
      assert(
        textAt(row, columns, header) === canonicalText(expectedValue),
        `${config.name} ${id}: ${header} does not match its definition`,
      );
    }
    const executionTags = validateExecutionTags(
      config.name,
      id,
      textAt(row, columns, 'Execution Tags'),
    );
    for (const requiredTag of ['@manual', `@${moduleTag}`, `@${categoryTag}`]) {
      assert(
        executionTags.includes(requiredTag),
        `${config.name} ${id}: Execution Tags is missing ${requiredTag}`,
      );
    }
  }
  assertDeepEqual(
    actualIds,
    expectedCases.map((item) => item.id),
    `${config.name}: manual ID sequence`,
  );

  const statusColumn = columns.get('Status');
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const validation = sheet.getCell(rowNumber, statusColumn).dataValidation;
    assert(validation?.type === 'list', `${config.name}: missing Status dropdown at row ${rowNumber}`);
    assert(
      validation.formulae?.[0] === '"Not Run,Pass,Fail,Blocked,Not Applicable"',
      `${config.name}: incorrect Status dropdown at row ${rowNumber}`,
    );
  }
}

function validateLayout(config, automated, manual, instructions, summary, reference) {
  assert(instructions.getCell('A1').text.includes(config.name), `${config.name}: instructions title missing`);
  assert(summary.getCell('A1').text.includes(config.name), `${config.name}: summary title missing`);
  assert(reference.rowCount >= 15, `${config.name}: field reference is incomplete`);
  for (const sheet of [automated, manual]) {
    const view = sheet.views?.[0];
    assert(view?.state === 'frozen' && view.xSplit === 3 && view.ySplit === 1, `${config.name}: ${sheet.name} panes are not frozen correctly`);
    assert(Object.keys(sheet.tables).length === 1, `${config.name}: ${sheet.name} table is missing`);
    assert(sheet.getColumn(5).width >= 40, `${config.name}: ${sheet.name} title column is too narrow`);
  }
  assert(Object.keys(reference.tables).length === 1, `${config.name}: Field Reference table is missing`);
  const statusColumn = headerMap(manual).get('Status');
  assert(
    manual.getCell(2, statusColumn).fill?.fgColor?.argb === 'FFFFF2CC',
    `${config.name}: editable manual-execution cells are not highlighted`,
  );
}

function validateSummary(config, sheet, manualSheet, manualRows) {
  const metrics = new Map();
  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = row.getCell(2).text.trim();
    if (name) metrics.set(name, row.getCell(3).result);
  }
  const manualColumns = headerMap(manualSheet);
  const statusCounts = new Map();
  for (const row of manualRows) {
    const status = textAt(row, manualColumns, 'Status');
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }
  const manualCount = manualRows.length;
  const expected = new Map([
    ['Automated cases', config.automatedCount],
    ['Manual UI/UX cases', manualCount],
    ['Total documented cases', config.automatedCount + manualCount],
    ['Not Run', statusCounts.get('Not Run') || 0],
    ['Pass', statusCounts.get('Pass') || 0],
    ['Fail', statusCounts.get('Fail') || 0],
  ]);
  for (const [metric, count] of expected) {
    assert(metrics.get(metric) === count, `${config.name}: incorrect summary count for ${metric}`);
  }
}

function validateSnapshot(config, workbook) {
  let snapshot;
  try {
    snapshot = JSON.parse(workbook.description || '{}');
  } catch (error) {
    throw new Error(`${config.name}: invalid workbook description snapshot: ${error.message}`);
  }
  assert(snapshot.schemaVersion === 1, `${config.name}: snapshot schema mismatch`);
  assert(snapshot.module === config.name, `${config.name}: snapshot module mismatch`);
  assert(snapshot.automatedCount === config.automatedCount, `${config.name}: snapshot automated count mismatch`);
  assert(snapshot.manualCount === UI_UX_MANUAL_CASES[config.name].length, `${config.name}: snapshot manual count mismatch`);
  const requiredSnapshotSources = [
    'test-cases/suite-tag-registry.mjs',
    'test-cases/ui-ux-manual/knowledge.mjs',
  ];
  for (const relativePath of requiredSnapshotSources) {
    assert(
      Object.prototype.hasOwnProperty.call(snapshot.sourceHashes || {}, relativePath),
      `${config.name}: snapshot is missing ${relativePath}`,
    );
  }
  const actualWorkbookHash = workbookContentHash(workbook);
  assert(
    snapshot.workbookHash === actualWorkbookHash,
    `${config.name}: workbook content hash mismatch (${snapshot.workbookHash} != ${actualWorkbookHash})`,
  );
  for (const [relativePath, expectedHash] of Object.entries(snapshot.sourceHashes || {})) {
    const sourceFile = path.join(suiteRoot, relativePath);
    assert(fs.existsSync(sourceFile), `${config.name}: snapshot source missing ${relativePath}`);
    assert(hashFile(sourceFile) === expectedHash, `${config.name}: stale source ${relativePath}`);
  }
}

function assertNoApiHeaders(moduleName, ...sheets) {
  for (const sheet of sheets) {
    for (const header of headers(sheet)) {
      const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert(!FORBIDDEN_API_HEADERS.has(normalized), `${moduleName}: copied API header "${header}" in ${sheet.name}`);
    }
  }
}

function readCatalogCases(sheet) {
  const columns = headerMap(sheet);
  const cases = new Map();
  for (const row of populatedRows(sheet, columns.get('Test Case ID'))) {
    const item = {
      id: textAt(row, columns, 'Test Case ID'),
      module: textAt(row, columns, 'Product Module'),
      feature: textAt(row, columns, 'Feature / Area'),
      title: textAt(row, columns, 'Title'),
      objective: textAt(row, columns, 'Description'),
      category: textAt(row, columns, 'Category'),
      scenarioType: textAt(row, columns, 'Scenario Type'),
      priority: textAt(row, columns, 'Priority'),
      severity: normalizeSeverity(textAt(row, columns, 'Severity')),
      preconditions: textAt(row, columns, 'Preconditions'),
      steps: textAt(row, columns, 'Test Steps'),
      expectedResult: textAt(row, columns, 'Expected Result'),
      testData: readableTestData(textAt(row, columns, 'Test Data JSON')),
      writeOperation: textAt(row, columns, 'Write Operation'),
      tags: textAt(row, columns, 'Tags'),
      source: textAt(row, columns, 'Source Workbook'),
      notes: textAt(row, columns, 'Notes'),
    };
    cases.set(`${item.module}:${item.id}`, item);
  }
  return cases;
}

function normalizeSeverity(value) {
  if (value === 'High') return 'Major';
  if (value === 'Medium' || value === 'Low') return 'Minor';
  return value;
}

function readableTestData(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch (error) {
    throw new Error(`Invalid source Test Data JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return formatReadableValue(parsed);
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return 'No additional row data. Uses shared module settings and current page state.';
  }
  return entries
    .map(([key, value]) => `${humanizeKey(key)}: ${formatReadableValue(value)}`)
    .join('\n');
}

function formatReadableValue(value) {
  if (Array.isArray(value)) {
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.join(', ');
    }
    return value.map((item, index) => `${index + 1}) ${formatReadableValue(item)}`).join('; ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${humanizeKey(key)}=${formatReadableValue(item)}`)
      .join(', ');
  }
  if (value === null) return 'null';
  return String(value);
}

function humanizeKey(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function parseSourceTags(value) {
  return [...new Set(String(value || '')
    .split(/[,;\s]+/)
    .map(normalizeTag)
    .filter(Boolean))];
}

function validateExecutionTags(moduleName, id, value) {
  const tags = String(value || '').trim().split(/\s+/).filter(Boolean);
  assert(tags.length > 0, `${moduleName} ${id}: Execution Tags is blank`);
  for (const tag of tags) {
    assert(tag.startsWith('@'), `${moduleName} ${id}: execution tag ${tag} must start with @`);
  }
  assert(
    new Set(tags).size === tags.length,
    `${moduleName} ${id}: Execution Tags contains duplicates`,
  );
  return tags;
}

function populatedRows(sheet, idColumn) {
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.getCell(idColumn).text.trim()) rows.push(row);
  }
  return rows;
}

function headers(sheet) {
  return Array.from({ length: sheet.columnCount }, (_unused, index) => (
    sheet.getRow(1).getCell(index + 1).text.trim()
  ));
}

function headerMap(sheet) {
  return new Map(headers(sheet).map((header, index) => [header, index + 1]));
}

function textAt(row, columns, header) {
  return canonicalText(row.getCell(columns.get(header)).text);
}

function workbookContentHash(workbook) {
  const payload = workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    rows: Array.from({ length: sheet.rowCount }, (_unused, rowIndex) => (
      Array.from({ length: sheet.columnCount }, (_empty, columnIndex) => {
        const cell = sheet.getCell(rowIndex + 1, columnIndex + 1);
        return [
          normalizeNewlines(cell.text),
          normalizeNewlines(cell.formula || ''),
          typeof cell.result === 'string' ? normalizeNewlines(cell.result) : cell.result ?? '',
        ];
      })
    )),
    tables: Object.values(sheet.tables).map(({ table }) => ({
      name: table.name,
      ref: table.tableRef,
      columns: table.columns.map((column) => column.name),
    })),
  }));
  return hashText(JSON.stringify(payload));
}

function hashFile(filePath) {
  return hashText(fs.readFileSync(filePath));
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalText(value) {
  return normalizeNewlines(value ?? '').trim();
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} mismatch. Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
  );
}
