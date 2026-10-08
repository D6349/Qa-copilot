import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import {
  resolveEnvironmentArtifactPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const environment = resolveEnvironmentProfile();
const allowPartialReport = process.env.ALLOW_PARTIAL_REPORT === '1';
const requestedScope = (process.env.REPORT_SCOPE || 'e2e').toLowerCase();

const accountIds = [
  'AC-001', 'AC-004', 'AC-005',
  'AC-006', 'AC-002', 'AC-007',
  'AC-008', 'AC-009', 'AC-010',
  'AC-011', 'AC-012', 'AC-003',
];
const agentIds = sequentialIds('AF', 30);
const toolIds = sequentialIds('TL', 49);
const connectorIds = sequentialIds('CN', 24);
const knowledgeIds = sequentialIds('KB', 30);
const guardrailIds = sequentialIds('GR', 30);
const uiComponentIds = sequentialIds('UC', 30);
const productTourIds = sequentialIds('PT', 12);

const configs = {
  all: {
    prefix: 'all-modules',
    ids: [
      ...accountIds,
      ...agentIds,
      ...toolIds,
      ...connectorIds,
      ...knowledgeIds,
      ...guardrailIds,
      ...uiComponentIds,
      ...productTourIds,
    ],
  },
  e2e: {
    prefix: 'e2e-flow',
    ids: [...agentIds, ...toolIds],
  },
  account: {
    prefix: 'account-flow',
    ids: accountIds,
  },
  agents: {
    prefix: 'agent-flow',
    ids: agentIds,
  },
  tools: {
    prefix: 'tools-flow',
    ids: toolIds,
  },
  connectors: {
    prefix: 'connectors-flow',
    ids: connectorIds,
  },
  knowledge: {
    prefix: 'knowledge-flow',
    ids: knowledgeIds,
  },
  guardrails: {
    prefix: 'guardrails-flow',
    ids: guardrailIds,
  },
  'ui-components': {
    prefix: 'ui-components-flow',
    ids: uiComponentIds,
  },
  'product-tour': {
    prefix: 'product-tour-flow',
    ids: productTourIds,
  },
};

const scope = Object.hasOwn(configs, requestedScope) ? requestedScope : 'e2e';
const config = configs[scope];
const exactScopeCounts = {
  all: 217,
  e2e: 79,
  account: 12,
  agents: 30,
  tools: 49,
  connectors: 24,
  knowledge: 30,
  guardrails: 30,
  'ui-components': 30,
  'product-tour': 12,
};
assert.equal(
  config.ids.length,
  exactScopeCounts[scope],
  `${scope} verifier catalog must contain exactly ${exactScopeCounts[scope]} cases`,
);
const expectedFailed = optionalCount('EXPECTED_FAILED');
const expectedSkipped = optionalCount('EXPECTED_SKIPPED');
const excelDirectory = path.resolve(
  process.env.EXCEL_REPORT_DIR
    || resolveEnvironmentArtifactPath(process.cwd(), 'excel'),
);
const evidenceRoot = path.join(excelDirectory, 'evidence');
const completeLatest = path.join(
  excelDirectory,
  `${config.prefix}-${environment.name}-latest.xlsx`,
);
const partialLatest = path.join(
  excelDirectory,
  `${config.prefix}-${environment.name}-partial-latest.xlsx`,
);
const defaultReport = allowPartialReport && fs.existsSync(partialLatest)
  ? partialLatest
  : completeLatest;
const reportPath = path.resolve(process.argv[2] || defaultReport);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(reportPath);

assert.deepEqual(
  workbook.worksheets.map((sheet) => sheet.name),
  ['Summary', 'Test Cases', 'Execution Results'],
);

const summarySheet = workbook.getWorksheet('Summary');
const casesSheet = workbook.getWorksheet('Test Cases');
const executionSheet = workbook.getWorksheet('Execution Results');
assert(summarySheet && casesSheet && executionSheet);

const summary = {};
summarySheet.eachRow((row) => {
  const key = cellText(row.getCell(1));
  if (key) summary[key] = row.getCell(2).value;
});

const evidenceFolderReference = String(summary['Evidence folder'] || '').trim();
assert(evidenceFolderReference, 'Summary is missing Evidence folder');
const evidenceRunDirectory = resolveEvidenceTarget(evidenceFolderReference);
assertPathInside(evidenceRoot, evidenceRunDirectory, 'Summary Evidence folder');
assert(
  fs.existsSync(evidenceRunDirectory) && fs.statSync(evidenceRunDirectory).isDirectory(),
  `Evidence folder does not exist: ${evidenceRunDirectory}`,
);

const caseColumns = {
  id: columnNumber(casesSheet, 'Test Case ID'),
  sequence: columnNumber(casesSheet, 'Sequence'),
  scenarioType: columnNumber(casesSheet, 'Scenario Type'),
  securityArea: columnNumber(casesSheet, 'Security Area'),
  owasReference: columnNumber(casesSheet, 'OWASP Reference'),
  status: columnNumber(casesSheet, 'Latest Status'),
  screenshotEvidence: columnNumber(casesSheet, 'Screenshot Evidence'),
  screenshotFile: columnNumber(casesSheet, 'Screenshot File'),
};
const caseIds = [];
const caseSequences = [];
const scenarioTypes = [];
const securityAreas = [];
const owaspReferences = [];
const caseEvidenceById = new Map();
for (let rowNumber = 2; rowNumber <= casesSheet.rowCount; rowNumber += 1) {
  const row = casesSheet.getRow(rowNumber);
  const id = cellText(row.getCell(caseColumns.id));
  caseIds.push(id);
  caseSequences.push(Number(row.getCell(caseColumns.sequence).value));
  scenarioTypes.push(cellText(row.getCell(caseColumns.scenarioType)));
  securityAreas.push(cellText(row.getCell(caseColumns.securityArea)));
  owaspReferences.push(cellText(row.getCell(caseColumns.owasReference)));
  caseEvidenceById.set(id, {
    rowNumber,
    status: cellText(row.getCell(caseColumns.status)),
    evidence: cellText(row.getCell(caseColumns.screenshotEvidence)),
    fileCell: row.getCell(caseColumns.screenshotFile),
  });
}

assert.equal(Number(summary['Defined test cases']), config.ids.length);
assert.equal(String(summary.Environment), environment.name);
assert.equal(String(summary['Base URL']), environment.baseURL);
assert.deepEqual(caseIds, config.ids);
assert.deepEqual(caseSequences, config.ids.map((_id, index) => index + 1));
assert(scenarioTypes.every(Boolean));
assert(scenarioTypes.some((value) => value.includes('Positive')));
assert(scenarioTypes.some((value) => value.includes('Negative')));
if (scope !== 'account') {
  assert(scenarioTypes.some((value) => value.includes('Security')));
}
scenarioTypes.forEach((value, index) => {
  if (!value.includes('Security')) return;
  assert(securityAreas[index]);
  assert(owaspReferences[index]);
});

const executionColumns = {
  id: columnNumber(executionSheet, 'Test Case ID'),
  sequence: columnNumber(executionSheet, 'Sequence'),
  runDate: columnNumber(executionSheet, 'Run Date'),
  runTime: columnNumber(executionSheet, 'Run Time'),
  status: columnNumber(executionSheet, 'Status'),
  screenshotEvidence: columnNumber(executionSheet, 'Screenshot Evidence'),
  screenshotFile: columnNumber(executionSheet, 'Screenshot File'),
};
const executionRows = [];
for (let rowNumber = 2; rowNumber <= executionSheet.rowCount; rowNumber += 1) {
  const row = executionSheet.getRow(rowNumber);
  executionRows.push({
    rowNumber,
    id: cellText(row.getCell(executionColumns.id)),
    sequence: Number(row.getCell(executionColumns.sequence).value),
    runDate: cellText(row.getCell(executionColumns.runDate)),
    runTime: cellText(row.getCell(executionColumns.runTime)),
    status: cellText(row.getCell(executionColumns.status)),
    evidence: cellText(row.getCell(executionColumns.screenshotEvidence)),
    fileCell: row.getCell(executionColumns.screenshotFile),
  });
}

const executionIds = executionRows.map((row) => row.id);
assert(executionIds.length > 0, 'Execution Results must contain at least one case');
assert.equal(
  new Set(executionIds).size,
  executionIds.length,
  'Execution Results contains duplicate Test Case IDs',
);
const configuredPosition = new Map(
  config.ids.map((id, index) => [id, index]),
);
let previousPosition = -1;
for (const execution of executionRows) {
  const position = configuredPosition.get(execution.id);
  assert.notEqual(
    position,
    undefined,
    `Execution Results contains ${execution.id}, which is outside ${scope}`,
  );
  assert(
    position > previousPosition,
    `Execution Results is not an ordered subset at ${execution.id}`,
  );
  assert.equal(
    execution.sequence,
    position + 1,
    `${execution.id}: sequence does not match the ${scope} catalog`,
  );
  previousPosition = position;
}
if (!allowPartialReport) {
  assert.deepEqual(executionIds, config.ids);
}

assert.equal(Number(summary['Execution rows']), executionRows.length);
assert(executionRows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.runDate)));
assert(executionRows.every((row) => /^\d{2}:\d{2}:\d{2}\.\d{3} IST$/.test(row.runTime)));

const counts = {
  Pass: executionRows.filter((row) => row.status === 'Pass').length,
  Fail: executionRows.filter((row) => row.status === 'Fail').length,
  Skipped: executionRows.filter((row) => row.status === 'Skipped').length,
};
assert.equal(Number(summary.Passed), counts.Pass);
assert.equal(Number(summary.Failed), counts.Fail);
assert.equal(Number(summary.Skipped), counts.Skipped);
assert.equal(counts.Pass + counts.Fail + counts.Skipped, executionRows.length);
if (expectedFailed !== null) assert.equal(counts.Fail, expectedFailed);
if (expectedSkipped !== null) assert.equal(counts.Skipped, expectedSkipped);
if (expectedFailed !== null && expectedSkipped !== null) {
  const expectedPassed = executionRows.length - expectedFailed - expectedSkipped;
  assert(expectedPassed >= 0, 'Expected status counts exceed Execution rows');
  assert.equal(Number(summary.Passed), expectedPassed);
  assert.deepEqual(counts, {
    Pass: expectedPassed,
    Fail: expectedFailed,
    Skipped: expectedSkipped,
  });
}

const capturedCaseRows = [];
const capturedTargets = new Set();
const executedIdSet = new Set(executionIds);
for (const id of config.ids) {
  const item = caseEvidenceById.get(id);
  assert(item, `${id}: missing Test Cases evidence row`);
  const expectedEvidence = evidenceForStatus(item.status);
  assert.equal(
    item.evidence,
    expectedEvidence,
    `${id}: Test Cases Screenshot Evidence must be ${expectedEvidence}`,
  );
  if (expectedEvidence === 'Captured') {
    const target = validateScreenshotCell(
      item.fileCell,
      `${id}: Test Cases Screenshot File`,
    );
    capturedTargets.add(target);
    capturedCaseRows.push(item.rowNumber);
  } else {
    validateEvidenceMarker(
      item.fileCell,
      expectedEvidence,
      `${id}: Test Cases Screenshot File`,
    );
  }
  if (!executedIdSet.has(id)) {
    assert.equal(item.status, 'Not Run', `${id}: unexecuted case must remain Not Run`);
  }
}

for (const execution of executionRows) {
  const expectedEvidence = evidenceForStatus(execution.status);
  assert.notEqual(
    expectedEvidence,
    'Not captured \u2014 Not Run',
    `${execution.id}: Execution Results has invalid status ${execution.status}`,
  );
  assert.equal(
    execution.evidence,
    expectedEvidence,
    `${execution.id}: Execution Results Screenshot Evidence must be ${expectedEvidence}`,
  );
  const testCaseEvidence = caseEvidenceById.get(execution.id);
  assert.equal(testCaseEvidence.status, execution.status);
  if (expectedEvidence === 'Captured') {
    const target = validateScreenshotCell(
      execution.fileCell,
      `${execution.id}: Execution Results Screenshot File`,
    );
    assert.equal(
      target,
      screenshotCellTarget(testCaseEvidence.fileCell),
      `${execution.id}: Test Cases and Execution Results screenshot links differ`,
    );
    capturedTargets.add(target);
  } else {
    validateEvidenceMarker(
      execution.fileCell,
      expectedEvidence,
      `${execution.id}: Execution Results Screenshot File`,
    );
  }
}

const screenshotsCaptured = Number(summary['Screenshots captured']);
assert(
  Number.isInteger(screenshotsCaptured) && screenshotsCaptured >= 0,
  'Summary Screenshots captured must be a non-negative integer',
);
assert.equal(screenshotsCaptured, counts.Pass + counts.Fail);
assert.equal(capturedTargets.size, screenshotsCaptured);

const caseImages = casesSheet.getImages();
assert.equal(
  caseImages.length,
  screenshotsCaptured,
  'Embedded screenshot count does not match Summary Screenshots captured',
);
const actualImageRows = [];
for (const image of caseImages) {
  const imageRow = imageAnchorRow(image.range);
  const imageColumn = imageAnchorColumn(image.range);
  actualImageRows.push(imageRow);
  assert.equal(
    imageColumn,
    caseColumns.screenshotEvidence,
    `Embedded screenshot at row ${imageRow} is outside Screenshot Evidence`,
  );
  const hyperlink = image.range?.hyperlinks?.hyperlink;
  assert(hyperlink, `Embedded screenshot at row ${imageRow} has no hyperlink`);
  validateEvidenceTarget(hyperlink, `Embedded screenshot at row ${imageRow}`);
}
assert.deepEqual(
  [...actualImageRows].sort((left, right) => left - right),
  [...capturedCaseRows].sort((left, right) => left - right),
  'Embedded screenshots are not anchored to their captured Test Case rows',
);
assert.equal(
  executionSheet.getImages().length,
  0,
  'Execution Results should link evidence without duplicating embedded images',
);

console.log(JSON.stringify({
  environment: environment.name,
  baseURL: environment.baseURL,
  scope,
  allowPartialReport,
  reportPath,
  evidenceFolder: evidenceRunDirectory,
  sheets: workbook.worksheets.map((sheet) => sheet.name),
  definedCases: caseIds.length,
  executionRows: executionRows.length,
  screenshotsCaptured,
  counts,
}, null, 2));

function sequentialIds(prefix, count) {
  return Array.from(
    { length: count },
    (_value, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`,
  );
}

function optionalCount(name) {
  if (process.env[name] === undefined) return null;
  const value = Number(process.env[name]);
  assert(
    Number.isInteger(value) && value >= 0,
    `${name} must be a non-negative integer`,
  );
  return value;
}

function columnNumber(sheet, header) {
  const row = sheet.getRow(1);
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    if (cellText(row.getCell(column)) === header) return column;
  }
  throw new Error(`Missing "${header}" column in ${sheet.name}`);
}

function cellText(cell) {
  return String(cell.text || cell.value || '').trim();
}

function evidenceForStatus(status) {
  if (status === 'Pass' || status === 'Fail') return 'Captured';
  if (status === 'Skipped') return 'Not captured \u2014 Skipped';
  if (status === 'Not Run') return 'Not captured \u2014 Not Run';
  throw new Error(`Unsupported evidence status source: ${status}`);
}

function validateEvidenceMarker(cell, expected, label) {
  assert.equal(cellText(cell), expected, `${label} must say ${expected}`);
  assert(!cell.hyperlink, `${label} must not link evidence for ${expected}`);
}

function validateScreenshotCell(cell, label) {
  assert.equal(cellText(cell), 'Open screenshot', `${label} must say Open screenshot`);
  assert(cell.hyperlink, `${label} must contain a hyperlink`);
  return validateEvidenceTarget(cell.hyperlink, label);
}

function screenshotCellTarget(cell) {
  assert(cell.hyperlink, 'Screenshot File cell has no hyperlink');
  return resolveEvidenceTarget(cell.hyperlink);
}

function validateEvidenceTarget(reference, label) {
  const target = resolveEvidenceTarget(reference);
  assertPathInside(evidenceRoot, target, label);
  assertPathInside(evidenceRunDirectory, target, label);
  assert(fs.existsSync(target), `${label} target does not exist: ${target}`);
  assert(fs.statSync(target).isFile(), `${label} target is not a file: ${target}`);
  assert(fs.statSync(target).size > 0, `${label} target is empty: ${target}`);
  assert(
    ['.png', '.jpg', '.jpeg'].includes(path.extname(target).toLowerCase()),
    `${label} target is not a supported screenshot: ${target}`,
  );
  return target;
}

function resolveEvidenceTarget(reference) {
  const value = String(reference || '').trim();
  assert(value, 'Evidence reference is blank');
  if (value.toLowerCase().startsWith('file:')) {
    return path.resolve(fileURLToPath(value));
  }
  assert(
    !/^[a-z][a-z0-9+.-]*:/i.test(value),
    `Evidence reference must be a local file path: ${value}`,
  );
  return path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(path.dirname(reportPath), value.replace(/\//g, path.sep));
}

function assertPathInside(root, target, label) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  assert(
    relative && relative !== '..' && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative),
    `${label} escapes ${root}: ${target}`,
  );
}

function imageAnchorRow(range) {
  const nativeRow = range?.tl?.nativeRow;
  if (Number.isInteger(nativeRow)) return nativeRow + 1;
  const row = range?.tl?.row;
  assert(Number.isFinite(row), 'Embedded screenshot has no row anchor');
  return Math.floor(row) + 1;
}

function imageAnchorColumn(range) {
  const nativeColumn = range?.tl?.nativeCol;
  if (Number.isInteger(nativeColumn)) return nativeColumn + 1;
  const column = range?.tl?.col;
  assert(Number.isFinite(column), 'Embedded screenshot has no column anchor');
  return Math.floor(column) + 1;
}
