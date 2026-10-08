import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const catalogFile = path.resolve(
  process.env.UI_AUTOMATION_CATALOG_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'ui-automation-test-catalog.xlsx'),
);

if (!fs.existsSync(catalogFile)) {
  throw new Error(
    `UI automation catalog is missing: ${catalogFile}. `
    + 'Run "npm.cmd run data:ui-catalog" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(catalogFile);

let sourceSnapshot;
try {
  sourceSnapshot = JSON.parse(workbook.description || '');
} catch {
  throw new Error('Catalog source snapshot is missing or invalid; regenerate the catalog.');
}
assert(sourceSnapshot.schemaVersion === 1, 'Unsupported catalog snapshot version.');
assert(
  sourceSnapshot.sourceHashes
    && typeof sourceSnapshot.sourceHashes === 'object'
    && sourceSnapshot.catalogHash
    && sourceSnapshot.workbookHash,
  'Catalog source snapshot is incomplete.',
);
for (const [relativePath, expectedHash] of Object.entries(
  sourceSnapshot.sourceHashes,
)) {
  const sourcePath = path.resolve(suiteRoot, relativePath);
  assert(fs.existsSync(sourcePath), `Catalog source is missing: ${relativePath}.`);
  assert(
    hashFile(sourcePath) === expectedHash,
    `Catalog is stale because ${relativePath} changed. Regenerate it.`,
  );
}

const expectedSheets = [
  'Instructions',
  'Coverage Summary',
  'UI Test Cases',
  'Environment Matrix',
  'Field Reference',
];
const actualSheets = workbook.worksheets.map((sheet) => sheet.name);
assert(
  JSON.stringify(actualSheets) === JSON.stringify(expectedSheets),
  `Expected sheets ${expectedSheets.join(', ')}; found ${actualSheets.join(', ')}.`,
);
assert(
  createWorkbookContentHash(workbook) === sourceSnapshot.workbookHash,
  'Catalog workbook content differs from the generated snapshot; regenerate it.',
);

const caseSheet = requireSheet(workbook, 'UI Test Cases');
const expectedHeaders = [
  'Sequence',
  'Run Flag',
  'Test Case ID',
  'Product Module',
  'Feature / Area',
  'Title',
  'Description',
  'Category',
  'Scenario Type',
  'Priority',
  'Severity',
  'Preconditions',
  'Test Steps',
  'Expected Result',
  'Test Data JSON',
  'Write Operation',
  'Security Area',
  'OWASP Reference',
  'Tags',
  'Source Workbook',
  'Notes',
];
const headers = headerMap(caseSheet);
assert(
  JSON.stringify([...headers.keys()]) === JSON.stringify(expectedHeaders),
  'UI Test Cases columns do not match the approved UI catalog schema.',
);

const bannedApiHeaders = [
  'Method',
  'Endpoint',
  'Query Params',
  'Headers',
  'Request Body',
  'Expected Status',
  'Expected JSON Path',
  'Max Response Time MS',
  'Save As',
];
assert(
  bannedApiHeaders.every((header) => !headers.has(header)),
  'MCA/API-only columns must not appear in the UI catalog.',
);

const counts = {
  Account: 0,
  Agents: 0,
  Tools: 0,
  Connectors: 0,
  Knowledge: 0,
  Guardrails: 0,
  'UI Components': 0,
  'Product Tour': 0,
};
const expectedCounts = {
  Account: 12,
  Agents: 30,
  Tools: 49,
  Connectors: 24,
  Knowledge: 30,
  Guardrails: 30,
  'UI Components': 30,
  'Product Tour': 12,
};
const expectedPrefixes = {
  Account: 'AC-',
  Agents: 'AF-',
  Tools: 'TL-',
  Connectors: 'CN-',
  Knowledge: 'KB-',
  Guardrails: 'GR-',
  'UI Components': 'UC-',
  'Product Tour': 'PT-',
};
const expectedSources = sourceSnapshot.moduleSources;
assert(
  expectedSources && typeof expectedSources === 'object',
  'Catalog source snapshot is missing module workbook names.',
);
const seenIds = new Set();
const catalogHashRows = [];
const catalogRows = [];
let enabled = 0;
let writes = 0;

for (let rowNumber = 2; rowNumber <= caseSheet.rowCount; rowNumber += 1) {
  const row = caseSheet.getRow(rowNumber);
  const id = value(row, headers, 'Test Case ID');
  if (!id) continue;
  const sequence = Number(value(row, headers, 'Sequence'));
  const moduleName = value(row, headers, 'Product Module');
  const runFlag = value(row, headers, 'Run Flag');
  const writeOperation = value(row, headers, 'Write Operation');
  const testData = value(row, headers, 'Test Data JSON', false);

  assert(sequence === seenIds.size + 1, `${id} has an invalid Sequence.`);
  assert(!seenIds.has(id), `Duplicate catalog case: ${id}.`);
  seenIds.add(id);
  assert(moduleName in counts, `${id} has unknown Product Module ${moduleName}.`);
  assert(id.startsWith(expectedPrefixes[moduleName]), `${id} has the wrong module prefix.`);
  assert(
    value(row, headers, 'Source Workbook') === expectedSources[moduleName],
    `${id} has the wrong Source Workbook.`,
  );
  assert(['YES', 'NO'].includes(runFlag), `${id} has an invalid Run Flag.`);
  assert(
    ['YES', 'NO'].includes(writeOperation),
    `${id} has an invalid Write Operation.`,
  );
  for (const required of [
    'Feature / Area',
    'Title',
    'Description',
    'Category',
    'Scenario Type',
    'Priority',
    'Severity',
    'Preconditions',
    'Test Steps',
    'Expected Result',
    'Tags',
  ]) {
    assert(value(row, headers, required) !== '', `${id} is missing ${required}.`);
  }
  try {
    JSON.parse(testData || '{}');
  } catch (error) {
    throw new Error(`${id} has invalid Test Data JSON: ${error.message}`);
  }

  counts[moduleName] += 1;
  if (runFlag === 'YES') enabled += 1;
  if (writeOperation === 'YES') writes += 1;
  catalogHashRows.push(expectedHeaders.map((header, index) => (
    index === 0 ? sequence : value(row, headers, header, false)
  )));
  catalogRows.push({
    moduleName,
    runFlag,
    writeOperation,
    scenarioType: value(row, headers, 'Scenario Type'),
    priority: value(row, headers, 'Priority'),
    severity: value(row, headers, 'Severity'),
    category: value(row, headers, 'Category'),
    securityArea: value(row, headers, 'Security Area'),
  });
}

assert(seenIds.size === 217, `Expected exactly 217 catalog cases; found ${seenIds.size}.`);
for (const [moduleName, expectedCount] of Object.entries(expectedCounts)) {
  assert(
    counts[moduleName] === expectedCount,
    `${moduleName} must contain exactly ${expectedCount} catalog cases; found ${counts[moduleName]}.`,
  );
}
assert(
  hashText(JSON.stringify(catalogHashRows)) === sourceSnapshot.catalogHash,
  'Catalog rows differ from the generated source snapshot; regenerate the catalog.',
);
const caseTable = caseSheet.getTable('UiAutomationCases');
assert(
  caseTable !== undefined,
  'UI Test Cases must use the UiAutomationCases Excel Table.',
);
assert(
  caseTable.table.tableRef === `A1:U${seenIds.size + 1}`,
  'UiAutomationCases does not cover the complete A:U case range.',
);
assert(
  JSON.stringify(caseTable.table.columns.map((column) => column.name))
    === JSON.stringify(expectedHeaders),
  'UiAutomationCases table columns do not match the approved schema.',
);
assert(
  caseSheet.views.some((view) => view.state === 'frozen'
    && view.xSplit === 3
    && view.ySplit === 1),
  'UI Test Cases must freeze the header and first three columns.',
);

const environmentSheet = requireSheet(workbook, 'Environment Matrix');
const environmentHeaders = headerMap(environmentSheet);
const registry = JSON.parse(fs.readFileSync(
  path.join(suiteRoot, 'config', 'environments.json'),
  'utf8',
));
const environmentRows = new Map();
for (let rowNumber = 2; rowNumber <= environmentSheet.rowCount; rowNumber += 1) {
  const row = environmentSheet.getRow(rowNumber);
  const name = value(row, environmentHeaders, 'Environment').toLowerCase();
  if (!name) continue;
  environmentRows.set(name, value(row, environmentHeaders, 'Base URL'));
}
assert(environmentRows.size === 3, 'Environment Matrix must contain DEV, UAT and LIVE.');
for (const [name, config] of Object.entries(registry.environments)) {
  assert(
    environmentRows.get(name) === config.baseURL,
    `${name.toUpperCase()} Base URL does not match config/environments.json.`,
  );
}

const coverageSheet = requireSheet(workbook, 'Coverage Summary');
assert(coverageSheet.rowCount > 10, 'Coverage Summary is unexpectedly empty.');
const expectedCoverage = new Map([
  ['Overview|Total cases', coverageExpectation(seenIds.size, 'ROWS(UiAutomationCases[Test Case ID])')],
  ['Overview|Enabled cases', coverageExpectation(enabled, 'COUNTIF(UiAutomationCases[Run Flag],"YES")')],
  ['Overview|Disabled cases', coverageExpectation(seenIds.size - enabled, 'COUNTIF(UiAutomationCases[Run Flag],"NO")')],
  ['Safety|Write operations', coverageExpectation(writes, 'COUNTIF(UiAutomationCases[Write Operation],"YES")')],
  ['Safety|Read-only operations', coverageExpectation(seenIds.size - writes, 'COUNTIF(UiAutomationCases[Write Operation],"NO")')],
  ['Security|Security-mapped cases', coverageExpectation(catalogRows.filter((row) => row.securityArea).length, 'COUNTIF(UiAutomationCases[Security Area],"<>")')],
]);
addCoverageGroups(expectedCoverage, 'Module', 'moduleName', 'Product Module', catalogRows);
addCoverageGroups(expectedCoverage, 'Scenario', 'scenarioType', 'Scenario Type', catalogRows);
addCoverageGroups(expectedCoverage, 'Priority', 'priority', 'Priority', catalogRows);
addCoverageGroups(expectedCoverage, 'Severity', 'severity', 'Severity', catalogRows);
addCoverageGroups(expectedCoverage, 'Category', 'category', 'Category', catalogRows);
let formulaCount = 0;
for (let rowNumber = 5; rowNumber <= coverageSheet.rowCount; rowNumber += 1) {
  const row = coverageSheet.getRow(rowNumber);
  const section = row.getCell(1).text.trim();
  const metric = row.getCell(2).text.trim();
  if (!section && !metric) continue;
  const key = `${section}|${metric}`;
  assert(expectedCoverage.has(key), `Unexpected Coverage Summary metric: ${key}.`);
  const expected = expectedCoverage.get(key);
  const countCell = row.getCell(3);
  assert(
    countCell.formula === expected.formula,
    `${key} formula is incorrect.`,
  );
  assert(
    Number(countCell.result) === expected.count,
    `${key} cached count does not match current catalog rows.`,
  );
  formulaCount += 1;
  expectedCoverage.delete(key);
}
assert(expectedCoverage.size === 0, 'Coverage Summary is missing calculated metrics.');

const instructionText = requireSheet(workbook, 'Instructions')
  .getSheetValues()
  .flatMap((row) => Array.isArray(row) ? row : [])
  .join(' ');
assert(/API-only fields/i.test(instructionText), 'Instructions must document the API-only field exclusion.');
assert(/remain unchanged/i.test(instructionText), 'Instructions must document input-workbook preservation.');

const fieldSheet = requireSheet(workbook, 'Field Reference');
assert(fieldSheet.rowCount >= 20, 'Field Reference is incomplete.');

console.log(JSON.stringify({
  ok: true,
  catalogFile,
  sheets: actualSheets,
  totalCases: seenIds.size,
  moduleCounts: counts,
  enabledCases: enabled,
  writeOperations: writes,
  coverageFormulas: formulaCount,
  environments: Object.fromEntries(environmentRows),
}, null, 2));

function requireSheet(target, name) {
  const sheet = target.getWorksheet(name);
  if (!sheet) throw new Error(`Missing worksheet: ${name}.`);
  return sheet;
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    result.set(cell.text.trim(), columnNumber);
  });
  return result;
}

function value(row, headers, name, trim = true) {
  const column = headers.get(name);
  const text = column ? row.getCell(column).text : '';
  return trim ? text.trim() : text;
}

function coverageExpectation(count, formula) {
  return { count, formula };
}

function addCoverageGroups(target, section, key, excelColumn, rows) {
  const countsByValue = new Map();
  for (const row of rows) {
    const item = row[key];
    if (!item) continue;
    countsByValue.set(item, (countsByValue.get(item) || 0) + 1);
  }
  for (const [item, itemCount] of countsByValue) {
    const escaped = String(item).replace(/"/g, '""');
    target.set(
      `${section}|${item}`,
      coverageExpectation(
        itemCount,
        `COUNTIF(UiAutomationCases[${excelColumn}],"${escaped}")`,
      ),
    );
  }
}

function createWorkbookContentHash(target) {
  const payload = target.worksheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    rows: Array.from({ length: sheet.rowCount }, (_unused, rowIndex) => (
      Array.from({ length: sheet.columnCount }, (_empty, columnIndex) => {
        const cell = sheet.getCell(rowIndex + 1, columnIndex + 1);
        return [cell.text, cell.formula || '', cell.result ?? ''];
      })
    )),
    tables: Object.values(sheet.tables)
      .map(({ table }) => ({
        name: table.name,
        ref: table.tableRef,
        columns: table.columns.map((column) => column.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  }));
  return hashText(JSON.stringify(payload));
}

function hashFile(filePath) {
  return hashText(fs.readFileSync(filePath));
}

function hashText(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
