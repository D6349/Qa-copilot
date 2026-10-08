import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_UX_MANUAL_CASES } from '../test-cases/ui-ux-manual/index.mjs';
import {
  SUITE_TAGS,
  automatedSuiteTags,
  formatExecutionTags,
  manualSuiteTags,
  normalizeTag,
  suiteNames,
} from '../test-cases/suite-tag-registry.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const catalogFile = path.resolve(
  process.env.UI_AUTOMATION_CATALOG_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'ui-automation-test-catalog.xlsx'),
);
const outputDirectory = path.resolve(
  process.env.UI_UX_TEST_SUITE_DIR
    || path.join(suiteRoot, 'test-data'),
);

const COLORS = {
  navy: 'FF17365D',
  blue: 'FF1F4E78',
  teal: 'FF0F6B78',
  green: 'FF548235',
  orange: 'FFC65911',
  purple: 'FF7030A0',
  white: 'FFFFFFFF',
  border: 'FFD9E2F3',
  paleBlue: 'FFDDEBF7',
  paleGreen: 'FFE2F0D9',
  paleYellow: 'FFFFF2CC',
  paleOrange: 'FFFCE4D6',
  paleRed: 'FFF4CCCC',
  palePurple: 'FFE4DFEC',
  paleGray: 'FFF2F2F2',
};

const moduleConfigs = [
  {
    name: 'Account',
    slug: 'account',
    casePrefix: 'AC',
    color: COLORS.purple,
    commandTarget: 'account',
    runtimeWorkbook: 'test-data/account-data-driven.xlsx',
    outputName: 'account-ui-ux-test-cases.xlsx',
    scope: 'My Account, subscribed-business switching, no-subscription access, chat, connector selection and PDF upload.',
  },
  {
    name: 'Agents',
    slug: 'agents',
    casePrefix: 'AF',
    color: COLORS.blue,
    commandTarget: 'agents',
    runtimeWorkbook: 'test-data/agents-data-driven.xlsx',
    outputName: 'agents-ui-ux-test-cases.xlsx',
    scope: 'Agent discovery, creation wizard, resource and access selection, persistence, update, security and cleanup.',
  },
  {
    name: 'Tools',
    slug: 'tools',
    casePrefix: 'TL',
    color: COLORS.green,
    commandTarget: 'tools',
    runtimeWorkbook: 'test-data/tools-data-driven.xlsx',
    outputName: 'tools-ui-ux-test-cases.xlsx',
    scope: 'Tool discovery, creation wizard, API configuration UI, access selection, persistence, update and security.',
  },
  {
    name: 'Connectors',
    slug: 'connectors',
    casePrefix: 'CN',
    color: COLORS.teal,
    commandTarget: 'connectors',
    runtimeWorkbook: 'test-data/connectors-data-driven.xlsx',
    outputName: 'connectors-ui-ux-test-cases.xlsx',
    scope: 'Connector discovery, Information and Access wizard, endpoint configuration, permissions, create/update feedback and safe delete cancellation.',
  },
  {
    name: 'Knowledge',
    slug: 'knowledge',
    casePrefix: 'KB',
    color: COLORS.teal,
    commandTarget: 'knowledge',
    runtimeWorkbook: 'test-data/knowledge-data-driven.xlsx',
    outputName: 'knowledge-ui-ux-test-cases.xlsx',
    scope: 'Knowledge discovery, creation, source configuration, access, persistence, update, security and safe cleanup.',
  },
  {
    name: 'Guardrails',
    slug: 'guardrails',
    casePrefix: 'GR',
    color: COLORS.orange,
    commandTarget: 'guardrails',
    runtimeWorkbook: 'test-data/guardrails-data-driven.xlsx',
    outputName: 'guardrails-ui-ux-test-cases.xlsx',
    scope: 'Guardrail discovery, PII and moderation configuration, URL filtering, access, nested dialogs, persistence and security.',
  },
  {
    name: 'UI Components',
    slug: 'ui-components',
    casePrefix: 'UC',
    color: COLORS.purple,
    commandTarget: 'ui-components',
    runtimeWorkbook: 'test-data/ui-components-data-driven.xlsx',
    outputName: 'ui-components-ui-ux-test-cases.xlsx',
    scope: 'UI Component discovery, Information, Designs and Visibility, generation and preview feedback, persistence, update and security.',
  },
  {
    name: 'Product Tour',
    slug: 'product-tour',
    casePrefix: 'PT',
    color: COLORS.purple,
    commandTarget: 'product-tour',
    runtimeWorkbook: 'test-data/product-tour-data-driven.xlsx',
    outputName: 'product-tour-ui-ux-test-cases.xlsx',
    scope: 'Explore June AI launcher, ordered cross-module guidance, navigation, dismissal, authorization, accessibility and responsive behavior.',
  },
];
const requestedModule = (process.env.UI_UX_MODULE || '').trim().toLowerCase();
const selectedModuleConfigs = requestedModule
  ? moduleConfigs.filter((config) => config.slug === requestedModule)
  : moduleConfigs;
if (requestedModule && selectedModuleConfigs.length !== 1) {
  throw new Error(`Unknown UI_UX_MODULE: ${requestedModule}`);
}

const MANUAL_STATUS_VALUES = new Set([
  'Not Run',
  'Pass',
  'Fail',
  'Blocked',
  'Not Applicable',
]);
const MANUAL_EXECUTION_FIELDS = [
  {
    key: 'status',
    outputHeader: 'Status',
    sourceHeaders: ['Status'],
  },
  {
    key: 'actualResult',
    outputHeader: 'Actual Result',
    sourceHeaders: ['Actual Result'],
  },
  {
    key: 'executedBy',
    outputHeader: 'Executed By',
    sourceHeaders: ['Executed By'],
  },
  {
    key: 'executedOn',
    outputHeader: 'Executed On',
    sourceHeaders: ['Executed On'],
  },
  {
    key: 'defectId',
    outputHeader: 'Defect ID',
    sourceHeaders: [
      'Defect ID',
      'Evidence / Defect Reference',
      'Evidence / Defect reference',
      'Evidence / Defect',
      'Defect Reference',
      'Defect reference',
      'Evidence',
    ],
  },
  {
    key: 'remarks',
    outputHeader: 'Remarks',
    sourceHeaders: ['Remarks', 'Notes'],
  },
];

if (!fs.existsSync(catalogFile)) {
  throw new Error(
    `Fresh UI automation catalog is missing: ${catalogFile}. `
    + 'Run "npm.cmd run data:ui-catalog" first.',
  );
}

const sourceWorkbook = new ExcelJS.Workbook();
await sourceWorkbook.xlsx.readFile(catalogFile);
const sourceSheet = sourceWorkbook.getWorksheet('UI Test Cases');
if (!sourceSheet) throw new Error('UI automation catalog is missing UI Test Cases.');
const sourceHeaders = headerMap(sourceSheet);
const requiredSourceHeaders = [
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
  'Tags',
  'Source Workbook',
  'Notes',
];
const missingSourceHeaders = requiredSourceHeaders.filter(
  (header) => !sourceHeaders.has(header),
);
if (missingSourceHeaders.length > 0) {
  throw new Error(
    `UI automation catalog is missing column(s): ${missingSourceHeaders.join(', ')}.`,
  );
}

const sourceCases = readSourceCases(sourceSheet, sourceHeaders);
fs.mkdirSync(outputDirectory, { recursive: true });
const openWorkbookLocks = selectedModuleConfigs
  .map((config) => path.join(outputDirectory, `~$${config.outputName}`))
  .filter((filePath) => fs.existsSync(filePath));
if (openWorkbookLocks.length > 0) {
  throw new Error(
    'Close the open UI/UX workbook(s) before regeneration: '
      + openWorkbookLocks.map((filePath) => path.basename(filePath).slice(2)).join(', '),
  );
}
const results = [];
const preservedManualExecution = new Map();

// Preflight every existing output before writing any workbook. If one cannot
// be opened or does not contain a usable manual-case identity column, stop the
// whole regeneration so no existing execution evidence is silently replaced.
for (const config of selectedModuleConfigs) {
  const outputFile = path.join(outputDirectory, config.outputName);
  preservedManualExecution.set(
    config.name,
    await readExistingManualExecution(outputFile, config),
  );
}

for (const config of selectedModuleConfigs) {
  const automatedCases = sourceCases
    .filter((item) => item.productModule === config.name)
    .map((item, index) => ({ ...item, sequence: index + 1 }));
  const manualCases = (UI_UX_MANUAL_CASES[config.name] || [])
    .map((item, index) => ({ ...item, sequence: index + 1 }));
  validateModuleCases(config, automatedCases, manualCases);
  const priorExecution = preservedManualExecution.get(config.name);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QA Copilot Playwright';
  workbook.lastModifiedBy = 'QA Copilot Playwright';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `${config.name} UI/UX Test Cases`;
  workbook.subject = `Human-readable automated and manual UI/UX coverage for June ${config.name}`;
  workbook.company = 'Ledgers';
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  addInstructions(workbook, config, automatedCases, manualCases);
  addAutomatedCases(workbook, config, automatedCases);
  addManualCases(workbook, config, manualCases, priorExecution.rowsById);
  addCoverageSummary(
    workbook,
    config,
    automatedCases,
    manualCases,
    priorExecution.rowsById,
  );
  addFieldReference(workbook, config);

  const snapshot = createSnapshot(config, automatedCases, manualCases, workbook);
  workbook.description = JSON.stringify(snapshot);
  const outputFile = path.join(outputDirectory, config.outputName);
  await workbook.xlsx.writeFile(outputFile);
  results.push({
    module: config.name,
    outputFile,
    automatedCases: automatedCases.length,
    manualUiUxCases: manualCases.length,
    totalCases: automatedCases.length + manualCases.length,
    existingWorkbookRead: priorExecution.existed,
    preservedManualRows: manualCases.filter(
      (item) => priorExecution.rowsById.has(item.id),
    ).length,
    preservedExecutionHeaders: priorExecution.sourceHeaders,
  });
}

console.log(JSON.stringify({
  ok: true,
  outputDirectory,
  workbooks: results,
}, null, 2));

function readSourceCases(sheet, headers) {
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const id = cellText(row, headers.get('Test Case ID'));
    if (!id) continue;
    rows.push({
      id,
      productModule: cellText(row, headers.get('Product Module')),
      feature: cellText(row, headers.get('Feature / Area')),
      title: cellText(row, headers.get('Title')),
      objective: cellText(row, headers.get('Description'), false),
      category: cellText(row, headers.get('Category')),
      scenarioType: cellText(row, headers.get('Scenario Type')),
      priority: cellText(row, headers.get('Priority')),
      severity: normalizeSeverity(cellText(row, headers.get('Severity'))),
      preconditions: cellText(row, headers.get('Preconditions'), false),
      steps: cellText(row, headers.get('Test Steps'), false),
      expectedResult: cellText(row, headers.get('Expected Result'), false),
      testData: readableTestData(
        cellText(row, headers.get('Test Data JSON'), false),
      ),
      writeOperation: cellText(row, headers.get('Write Operation')),
      tags: cellText(row, headers.get('Tags'), false),
      source: cellText(row, headers.get('Source Workbook')),
      notes: cellText(row, headers.get('Notes'), false),
    });
  }
  return rows;
}

async function readExistingManualExecution(outputFile, config) {
  if (!fs.existsSync(outputFile)) {
    return { existed: false, rowsById: new Map(), sourceHeaders: [] };
  }

  const existingWorkbook = new ExcelJS.Workbook();
  try {
    await existingWorkbook.xlsx.readFile(outputFile);
  } catch (error) {
    throw new Error(
      `Cannot safely regenerate ${config.name}: existing workbook could not `
      + `be read (${outputFile}). ${error.message}`,
    );
  }

  const sheet = existingWorkbook.getWorksheet('Manual UI UX Cases');
  if (!sheet) {
    throw new Error(
      `Cannot safely regenerate ${config.name}: existing workbook `
      + `${outputFile} is missing the "Manual UI UX Cases" sheet.`,
    );
  }
  const headers = headerMap(sheet);
  const idColumn = headers.get('Test Case ID');
  if (!idColumn) {
    throw new Error(
      `Cannot safely regenerate ${config.name}: "Manual UI UX Cases" in `
      + `${outputFile} is missing the "Test Case ID" column.`,
    );
  }

  const sourceColumns = MANUAL_EXECUTION_FIELDS.map((field) => ({
    ...field,
    sourceHeader: field.sourceHeaders.find((header) => headers.has(header)),
  }));
  const rowsById = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const id = row.getCell(idColumn).text.trim();
    if (!id) continue;
    if (rowsById.has(id)) {
      throw new Error(
        `Cannot safely regenerate ${config.name}: duplicate manual Test Case `
        + `ID ${id} in ${outputFile}.`,
      );
    }

    const execution = {};
    for (const field of sourceColumns) {
      if (!field.sourceHeader) continue;
      const cell = row.getCell(headers.get(field.sourceHeader));
      if (!hasCellValue(cell.value)) continue;
      execution[field.key] = field.key === 'status'
        ? cell.text.trim()
        : copyCellValue(cell.value);
    }
    if (
      execution.status !== undefined
      && !MANUAL_STATUS_VALUES.has(execution.status)
    ) {
      throw new Error(
        `Cannot safely regenerate ${config.name}: ${id} has unsupported manual `
        + `Status "${execution.status}" in ${outputFile}.`,
      );
    }
    rowsById.set(id, execution);
  }

  return {
    existed: true,
    rowsById,
    sourceHeaders: sourceColumns
      .filter((field) => field.sourceHeader)
      .map((field) => `${field.sourceHeader} -> ${field.outputHeader}`),
  };
}

function hasCellValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function copyCellValue(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(copyCellValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyCellValue(item)]),
    );
  }
  return value;
}

function validateModuleCases(config, automatedCases, manualCases) {
  if (automatedCases.length === 0) {
    throw new Error(`${config.name} has no automated source cases.`);
  }
  if (manualCases.length === 0) {
    throw new Error(`${config.name} has no manual UI/UX cases.`);
  }
  const ids = new Set();
  for (const item of [...automatedCases, ...manualCases]) {
    if (!item.id.startsWith(`${config.casePrefix}-`)) {
      throw new Error(`${item.id} has the wrong ${config.name} prefix.`);
    }
    if (ids.has(item.id)) throw new Error(`Duplicate ${config.name} case: ${item.id}.`);
    ids.add(item.id);
    for (const field of [
      'feature',
      'title',
      'objective',
      'preconditions',
      'steps',
      'expectedResult',
      'category',
      'priority',
      'severity',
    ]) {
      const value = item[field];
      if ((Array.isArray(value) && value.length === 0)
        || (!Array.isArray(value) && String(value || '').trim() === '')) {
        throw new Error(`${item.id} is missing ${field}.`);
      }
    }
    if (!['P0', 'P1', 'P2', 'P3'].includes(item.priority)) {
      throw new Error(`${item.id} has unsupported priority ${item.priority}.`);
    }
    if (!['Critical', 'Major', 'Minor'].includes(item.severity)) {
      throw new Error(`${item.id} has unsupported severity ${item.severity}.`);
    }
  }
}

function normalizeSeverity(value) {
  const severity = String(value || '').trim();
  if (severity === 'High') return 'Major';
  if (severity === 'Medium' || severity === 'Low') return 'Minor';
  return severity;
}

function addInstructions(workbook, config, automatedCases, manualCases) {
  const sheet = workbook.addWorksheet('Instructions', {
    properties: { tabColor: { argb: config.color } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  sheet.columns = [{ width: 28 }, { width: 108 }, { width: 25 }];
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = `${config.name} UI/UX Test Suite`;
  styleTitle(sheet.getCell('A1'), config.color, 18);
  sheet.getRow(1).height = 34;
  sheet.mergeCells('A2:C2');
  sheet.getCell('A2').value = 'Human-readable test design for review, execution and stakeholder sharing';
  sheet.getCell('A2').font = { italic: true, color: { argb: COLORS.blue }, size: 11 };
  sheet.getCell('A2').alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 24;
  sheet.getRow(4).values = ['Topic', 'Guidance', 'Applies To'];
  styleHeader(sheet.getRow(4), config.color);

  const instructionRows = [
    ['Purpose', `Independent ${config.name} UI/UX test-case workbook. Scope: ${config.scope}`, 'All sheets'],
    ['Coverage', `${automatedCases.length} current automated cases plus ${manualCases.length} additional manual UI/UX cases.`, 'Summary'],
    ['Existing data preserved', `The runtime workbook ${config.runtimeWorkbook} remains unchanged and continues to drive Playwright.`, 'Automation'],
    ['Automated Cases', 'Plain-language view of the current Playwright coverage. Actions and assertions remain in code; test data remains in the runtime workbook.', 'Automated Cases'],
    ['Manual UI/UX Cases', 'Visual, usability, accessibility, responsive, feedback and compatibility checks that require human observation or assistive tools.', 'Manual UI/UX Cases'],
    ['Execute automation', `From the repository root: npm.cmd run env:run -- <dev|uat|live> ${config.commandTarget}. Append --headed for visible Chrome.`, 'Automation'],
    ['Manual status', 'Update only Status, Actual Result, Executed By, Executed On, Defect ID and Remarks while executing manual cases.', 'Manual UI/UX Cases'],
    ['Manual execution preservation', 'Regeneration matches Manual UI UX Cases by Test Case ID and carries forward the editable execution fields for IDs that remain.', 'Manual UI/UX Cases'],
    ['Most important cases', 'P0 is highest priority and is highlighted red; P1 is highlighted orange. The eight @smoke and @prod-smoke rows are the minimum read-only critical path, while @sanity is the broader fast confidence pack.', 'Priority and suite tags'],
    ['Test Suites', 'Registry-derived reusable packs such as Functional, Non-Functional, Smoke, Sanity, Regression, Accessibility, Performance and UAT.', 'Both case sheets'],
    ['Execution Tags', 'Automated rows contain registry tags synchronized to Playwright titles. Manual rows use reporting/filter tags and also include @manual, the module slug and normalized UX category.', 'Both case sheets'],
    ['Run tagged automation', 'Use npm.cmd run test:smoke, test:sanity, test:regression, test:security, test:a11y, test:api, test:e2e:tagged or test:integration. Each command selects the eight primary module files in Chrome.', 'Automated Cases'],
    ['Environment-specific packs', 'Use npm.cmd run test:uat:tagged for the UAT acceptance pack. npm.cmd run test:prod-smoke runs only the eight curated read-only @prod-smoke cases in LIVE.', 'Automated Cases'],
    ['Manual-only packs', 'Responsive, compatibility, visual-regression, performance, localization and exploratory tags identify designed manual reviews unless a row is explicitly present in Automated Cases.', 'Manual UI/UX Cases'],
    ['Retest', 'Retest is defect-specific and intentionally not assigned statically; select the affected case when validating a particular fix.', 'Execution planning'],
    ['Automation evidence', 'Each executed Pass or Fail case automatically adds a privacy-masked final screenshot to the same Test Case ID row in the per-run Excel report under test-results/<environment>/excel. The row also links to the full image in its evidence folder; this static design workbook remains unchanged.', 'Automated execution'],
    ['Manual evidence', 'Attach screenshots, videos, accessibility output or defect links in the team test-management location; reference the Test Case ID.', 'Manual execution'],
    ['Environment safety', 'Use approved synthetic data. Review Write Operation cases before LIVE execution and confirm environment-specific accounts and permissions.', 'All execution'],
    ['Expected results', 'Results are written as observable outcomes so product, design, QA and engineering readers can interpret them consistently.', 'All cases'],
    ['UI/UX scope', 'API-only fields such as HTTP method, response status, JSONPath and response timing are outside this UI/UX workbook scope.', 'Workbook design'],
    ['Regenerate', 'From the repository root: npm.cmd run data:ui-ux-suites', 'Maintenance'],
  ];
  instructionRows.forEach((values) => sheet.addRow(values));
  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 36;
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
    applyBorder(row, 3);
  }
  sheet.autoFilter = 'A4:C4';
  sheet.pageSetup = landscapePageSetup();
}

function addAutomatedCases(workbook, config, cases) {
  const sheet = workbook.addWorksheet('Automated Cases', {
    properties: { tabColor: { argb: COLORS.blue } },
    views: [{
      state: 'frozen',
      xSplit: 3,
      ySplit: 1,
      topLeftCell: 'D2',
      showGridLines: false,
      zoomScale: 75,
    }],
  });
  const columns = [
    ['Sequence', 'sequence', 10],
    ['Test Case ID', 'id', 15],
    ['Module', 'productModule', 15],
    ['Feature / Area', 'feature', 30],
    ['Test Case Title', 'title', 46],
    ['Objective', 'objective', 54],
    ['Preconditions', 'preconditions', 52],
    ['Test Steps', 'steps', 66],
    ['Test Data / Inputs', 'testData', 58],
    ['Expected Result', 'expectedResult', 62],
    ['Category', 'category', 20],
    ['Scenario Type', 'scenarioType', 22],
    ['Priority', 'priority', 10],
    ['Severity', 'severity', 12],
    ['Automation Status', 'automationStatus', 18],
    ['Write Operation', 'writeOperation', 16],
    ['Environment', 'environment', 30],
    ['Test Suites', 'testSuites', 42],
    ['Execution Tags', 'executionTags', 54],
    ['Tags', 'tags', 40],
    ['Source', 'source', 31],
    ['Notes', 'notes', 35],
  ];
  const rows = cases.map((item) => {
    const sourceTags = parseSourceTags(item.tags)
      .filter((tag) => tag !== 'retest');
    const suiteTags = automatedSuiteTags(item.id, sourceTags);
    return {
      ...item,
      automationStatus: 'Automated',
      environment: 'Configured DEV / UAT / LIVE',
      testSuites: suiteNames(suiteTags),
      executionTags: formatExecutionTags(suiteTags),
    };
  });
  addDataTable(
    sheet,
    `${config.name}AutomatedCases`,
    columns,
    rows,
    'TableStyleMedium2',
    config.color,
  );
  styleCaseRows(sheet, {
    idHeader: 'Test Case ID',
    priorityHeader: 'Priority',
    severityHeader: 'Severity',
    writeHeader: 'Write Operation',
    dataHeader: 'Test Data / Inputs',
  });
  sheet.pageSetup = landscapePageSetup();
  sheet.pageSetup.printTitlesRow = '1:1';
}

function addManualCases(workbook, config, cases, preservedRowsById) {
  const sheet = workbook.addWorksheet('Manual UI UX Cases', {
    properties: { tabColor: { argb: COLORS.orange } },
    views: [{
      state: 'frozen',
      xSplit: 3,
      ySplit: 1,
      topLeftCell: 'D2',
      showGridLines: false,
      zoomScale: 75,
    }],
  });
  const columns = [
    ['Sequence', 'sequence', 10],
    ['Test Case ID', 'id', 17],
    ['Module', 'module', 15],
    ['Feature / Area', 'feature', 30],
    ['Test Case Title', 'title', 46],
    ['Objective', 'objective', 54],
    ['Preconditions', 'preconditionsText', 52],
    ['Test Steps', 'stepsText', 66],
    ['Test Data / Viewport', 'testData', 46],
    ['Expected Result', 'expectedResult', 62],
    ['UX Category', 'category', 20],
    ['Review Method', 'reviewMethod', 28],
    ['Priority', 'priority', 10],
    ['Severity', 'severity', 12],
    ['Recommended Environment', 'environment', 25],
    ['Test Suites', 'testSuites', 42],
    ['Execution Tags', 'executionTags', 54],
    ['Status', 'status', 16],
    ['Actual Result', 'actualResult', 48],
    ['Executed By', 'executedBy', 20],
    ['Executed On', 'executedOn', 18],
    ['Defect ID', 'defectId', 17],
    ['Remarks', 'remarks', 40],
  ];
  const rows = cases.map((item) => {
    const suiteTags = manualSuiteTags(item);
    const preserved = preservedRowsById.get(item.id) || {};
    return {
      ...item,
      module: config.name,
      preconditionsText: numbered(item.preconditions),
      stepsText: numbered(item.steps),
      testSuites: suiteNames(suiteTags),
      executionTags: formatExecutionTags([
        ...suiteTags,
        'manual',
        config.slug,
        normalizeTag(item.category),
      ]),
      status: preserved.status || 'Not Run',
      actualResult: preserved.actualResult ?? '',
      executedBy: preserved.executedBy ?? '',
      executedOn: preserved.executedOn ?? '',
      defectId: preserved.defectId ?? '',
      remarks: preserved.remarks ?? '',
    };
  });
  addDataTable(
    sheet,
    `${config.name}ManualUiUxCases`,
    columns,
    rows,
    'TableStyleMedium9',
    COLORS.orange,
  );
  styleCaseRows(sheet, {
    idHeader: 'Test Case ID',
    priorityHeader: 'Priority',
    severityHeader: 'Severity',
  });
  const headers = headerMap(sheet);
  const lastCaseRow = sheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastCaseRow; rowNumber += 1) {
    sheet.getCell(rowNumber, headers.get('Status')).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Not Run,Pass,Fail,Blocked,Not Applicable"'],
    };
  }
  for (const header of [
    'Status',
    'Actual Result',
    'Executed By',
    'Executed On',
    'Defect ID',
    'Remarks',
  ]) {
    const columnNumber = headers.get(header);
    for (let rowNumber = 2; rowNumber <= lastCaseRow; rowNumber += 1) {
      sheet.getCell(rowNumber, columnNumber).fill = solidFill(COLORS.paleYellow);
    }
  }
  sheet.pageSetup = landscapePageSetup();
  sheet.pageSetup.printTitlesRow = '1:1';
}

function addCoverageSummary(
  workbook,
  config,
  automatedCases,
  manualCases,
  preservedRowsById,
) {
  const sheet = workbook.addWorksheet('Coverage Summary', {
    properties: { tabColor: { argb: COLORS.green } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  sheet.columns = [
    { width: 24 },
    { width: 38 },
    { width: 14 },
    { width: 72 },
  ];
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = `${config.name} Coverage Summary`;
  styleTitle(sheet.getCell('A1'), COLORS.green, 17);
  sheet.getRow(1).height = 32;
  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = 'Automated functionality and manual UI/UX review are tracked separately.';
  sheet.getCell('A2').font = { italic: true, color: { argb: COLORS.blue } };
  sheet.getRow(4).values = ['Section', 'Metric', 'Count', 'Meaning'];
  styleHeader(sheet.getRow(4), COLORS.green);

  const autoTable = `${config.name}AutomatedCases`;
  const manualTable = `${config.name}ManualUiUxCases`;
  const manualStatusCounts = countManualStatuses(
    manualCases,
    preservedRowsById,
  );
  const summary = [
    summaryMetric('Overview', 'Automated cases', `ROWS(${autoTable}[Test Case ID])`, automatedCases.length, 'Current Playwright-covered behaviors.'),
    summaryMetric('Overview', 'Manual UI/UX cases', `ROWS(${manualTable}[Test Case ID])`, manualCases.length, 'Human-observation and assistive-tool checks.'),
    summaryMetric('Overview', 'Total documented cases', `ROWS(${autoTable}[Test Case ID])+ROWS(${manualTable}[Test Case ID])`, automatedCases.length + manualCases.length, 'Complete module test design in this workbook.'),
    summaryMetric('Safety', 'Automated write operations', `COUNTIF(${autoTable}[Write Operation],"YES")`, automatedCases.filter((item) => item.writeOperation === 'YES').length, 'Automated cases that persist synthetic data.'),
    summaryMetric('Manual status', 'Not Run', `COUNTIF(${manualTable}[Status],"Not Run")`, manualStatusCounts.get('Not Run') || 0, 'Manual cases awaiting execution.'),
    summaryMetric('Manual status', 'Pass', `COUNTIF(${manualTable}[Status],"Pass")`, manualStatusCounts.get('Pass') || 0, 'Manual cases completed successfully.'),
    summaryMetric('Manual status', 'Fail', `COUNTIF(${manualTable}[Status],"Fail")`, manualStatusCounts.get('Fail') || 0, 'Manual cases with observed defects.'),
    ...combinedGroupMetrics('Priority', 'Priority', 'priority', automatedCases, manualCases, autoTable, manualTable),
    ...combinedGroupMetrics('Severity', 'Severity', 'severity', automatedCases, manualCases, autoTable, manualTable),
    ...suiteCoverageMetrics(automatedCases, manualCases, autoTable, manualTable),
    ...manualGroupMetrics('Manual category', 'UX Category', 'category', manualCases, manualTable),
  ];
  summary.forEach((item) => {
    const row = sheet.addRow([
      item.section,
      item.metric,
      { formula: item.formula, result: item.count },
      item.meaning,
    ]);
    row.height = 27;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
    row.getCell(3).font = { bold: true, color: { argb: COLORS.green } };
    row.getCell(3).alignment = { horizontal: 'center' };
    applyBorder(row, 4);
  });
  sheet.autoFilter = `A4:D${sheet.rowCount}`;
  sheet.pageSetup = landscapePageSetup();
}

function countManualStatuses(cases, preservedRowsById) {
  const counts = new Map();
  for (const item of cases) {
    const status = preservedRowsById.get(item.id)?.status || 'Not Run';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return counts;
}

function addFieldReference(workbook, config) {
  const sheet = workbook.addWorksheet('Field Reference', {
    properties: { tabColor: { argb: COLORS.teal } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const columns = [
    ['Field', 27],
    ['Sheet', 23],
    ['Editable During Execution', 25],
    ['Required', 12],
    ['Description', 78],
    ['Example', 48],
  ];
  const rows = [
    ['Test Case ID', 'Both case sheets', 'No', 'Yes', `Unique ${config.name} case reference used in evidence and defects.`, `${config.casePrefix}-001 / ${config.casePrefix}-UX-001`],
    ['Feature / Area', 'Both case sheets', 'No', 'Yes', 'Page section or user journey covered by the case.', `${config.name} navigation`],
    ['Objective', 'Both case sheets', 'No', 'Yes', 'Why the case exists and what risk it addresses.', 'Verify the interface remains understandable at 200% zoom.'],
    ['Preconditions', 'Both case sheets', 'No', 'Yes', 'Required account, data or page state before execution.', 'A valid authenticated session is available.'],
    ['Test Steps', 'Both case sheets', 'No', 'Yes', 'Numbered actions written for a human reader.', '1. Open the module.\n2. Use keyboard navigation.'],
    ['Test Data / Inputs', 'Automated Cases', 'No', 'Yes', 'Readable rendering of the existing Excel-driven test data.', 'Maximum length: 100'],
    ['Test Data / Viewport', 'Manual UI UX Cases', 'No', 'Yes', 'Browser, viewport, zoom, assistive technology or content variant.', 'Chrome, 1280×720, 200% zoom'],
    ['Expected Result', 'Both case sheets', 'No', 'Yes', 'Observable outcome used to decide Pass or Fail.', 'All controls remain visible and operable without overlap.'],
    ['Category / UX Category', 'Both case sheets', 'No', 'Yes', 'Functional grouping for automation or review discipline for manual UI/UX.', 'Accessibility'],
    ['Review Method', 'Manual UI UX Cases', 'No', 'Yes', 'How the UI/UX case should be evaluated.', 'Keyboard-only and screen-reader review'],
    ['Priority', 'Both case sheets', 'No', 'Yes', 'Execution/business priority from P0 (highest) through P3.', 'P1'],
    ['Severity', 'Both case sheets', 'No', 'Yes', 'Expected impact if the behavior fails.', 'Major'],
    ['Automation Status', 'Automated Cases', 'No', 'Yes', 'Confirms the case is implemented in Playwright.', 'Automated'],
    ['Write Operation', 'Automated Cases', 'No', 'Yes', 'YES means the automation creates, updates, uploads or deletes synthetic data.', 'YES'],
    ['Test Suites', 'Both case sheets', 'No', 'Yes', 'Registry-derived reusable suite membership. Retest is defect-specific and is not assigned statically.', 'Functional, Smoke, Regression'],
    ['Execution Tags', 'Both case sheets', 'No', 'Yes', 'Automated tags are synchronized to Playwright titles. Manual tags support test-management filtering and include @manual, module and UX-category tags.', `@non-functional @regression @manual @${config.slug} @accessibility`],
    ['Tags', 'Automated Cases', 'No', 'Yes', 'Searchable catalog labels retained from the code-first case definitions; use Execution Tags for supported Playwright suite filters.', 'flow, validation, tools'],
    ['Status', 'Manual UI UX Cases', 'Yes', 'Yes', 'Execution outcome selected from the dropdown.', 'Not Run / Pass / Fail / Blocked'],
    ['Actual Result', 'Manual UI UX Cases', 'Yes', 'When executed', 'What was actually observed, including concise evidence references.', 'Focus moved behind the modal.'],
    ['Executed By / On', 'Manual UI UX Cases', 'Yes', 'When executed', 'Executor name and execution date.', 'QA User / 2026-09-21'],
    ['Defect ID', 'Manual UI UX Cases', 'Yes', 'On failure', 'Linked defect or issue identifier.', 'BUG-1234'],
    ['Remarks', 'Manual UI UX Cases', 'Yes', 'No', 'Additional context, browser version or evidence location.', 'Reproduced in Chrome and Firefox.'],
  ];
  sheet.addTable({
    name: `${config.name}UiUxFieldReference`,
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium4', showRowStripes: true },
    columns: columns.map(([name]) => ({ name })),
    rows,
  });
  columns.forEach(([, width], index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1), COLORS.teal);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 42;
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
  }
  sheet.pageSetup = landscapePageSetup();
}

function addDataTable(sheet, name, columns, rows, theme, headerColor) {
  sheet.addTable({
    name,
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme,
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: columns.map(([header]) => ({ name: header })),
    rows: rows.map((item) => columns.map(([, key]) => item[key] ?? '')),
  });
  columns.forEach(([, , width], index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1), headerColor);
}

function styleCaseRows(sheet, options) {
  const headers = headerMap(sheet);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 76;
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { size: 10 };
    const idCell = row.getCell(headers.get(options.idHeader));
    idCell.font = { bold: true, color: { argb: COLORS.navy } };
    const priorityCell = row.getCell(headers.get(options.priorityHeader));
    priorityCell.fill = solidFill(
      priorityCell.text === 'P0' ? COLORS.paleRed
        : priorityCell.text === 'P1' ? COLORS.paleOrange
        : priorityCell.text === 'P2' ? COLORS.paleYellow
          : COLORS.paleGray,
    );
    priorityCell.font = { bold: true };
    const severityCell = row.getCell(headers.get(options.severityHeader));
    if (severityCell.text === 'Critical' || severityCell.text === 'High') {
      severityCell.fill = solidFill(COLORS.paleOrange);
    }
    if (options.writeHeader) {
      const writeCell = row.getCell(headers.get(options.writeHeader));
      if (writeCell.text === 'YES') {
        writeCell.fill = solidFill(COLORS.paleOrange);
        writeCell.font = { bold: true, color: { argb: 'FF9C5700' } };
      }
    }
    if (options.dataHeader) {
      row.getCell(headers.get(options.dataHeader)).font = {
        name: 'Aptos',
        size: 9,
      };
    }
  }
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

function parseSourceTags(value) {
  return [...new Set(String(value || '')
    .split(/[,;\s]+/)
    .map(normalizeTag)
    .filter(Boolean))];
}

function combinedGroupMetrics(section, excelColumn, key, automated, manual, autoTable, manualTable) {
  const values = [...new Set([...automated, ...manual].map((item) => item[key]).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  return values.map((value) => summaryMetric(
    section,
    String(value),
    `COUNTIF(${autoTable}[${excelColumn}],"${escapeFormula(value)}")+COUNTIF(${manualTable}[${excelColumn}],"${escapeFormula(value)}")`,
    [...automated, ...manual].filter((item) => item[key] === value).length,
    `${section} coverage for ${value}.`,
  ));
}

function manualGroupMetrics(section, excelColumn, key, manual, manualTable) {
  const values = [...new Set(manual.map((item) => item[key]).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  return values.map((value) => summaryMetric(
    section,
    String(value),
    `COUNTIF(${manualTable}[${excelColumn}],"${escapeFormula(value)}")`,
    manual.filter((item) => item[key] === value).length,
    `Manual ${value} review coverage.`,
  ));
}

function suiteCoverageMetrics(automated, manual, autoTable, manualTable) {
  return SUITE_TAGS.map((tag) => {
    const automatedCount = automated.filter((item) => {
      const sourceTags = parseSourceTags(item.tags).filter((value) => value !== 'retest');
      return automatedSuiteTags(item.id, sourceTags).includes(tag);
    }).length;
    const manualCount = manual.filter((item) => manualSuiteTags(item).includes(tag)).length;
    const count = automatedCount + manualCount;
    return summaryMetric(
      'Test suite',
      suiteNames([tag]),
      `COUNTIF(${autoTable}[Execution Tags],"*@${tag}*")+COUNTIF(${manualTable}[Execution Tags],"*@${tag}*")`,
      count,
      tag === 'retest'
        ? 'Assigned only when a specific failed case is rerun after a defect fix; intentionally zero at design time.'
        : `${automatedCount} automated and ${manualCount} manual case(s) carry @${tag}.`,
    );
  }).filter((item) => item.count > 0 || item.metric === 'Retest');
}

function summaryMetric(section, metric, formula, count, meaning) {
  return { section, metric, formula, count, meaning };
}

function escapeFormula(value) {
  return String(value).replace(/"/g, '""');
}

function createSnapshot(config, automatedCases, manualCases, workbook) {
  const definitionDirectory = path.join(suiteRoot, 'test-cases', 'ui-ux-manual');
  const sourceFiles = [
    fileURLToPath(import.meta.url),
    path.join(suiteRoot, 'test-cases', 'suite-tag-registry.mjs'),
    path.join(definitionDirectory, 'index.mjs'),
    path.join(definitionDirectory, 'account.mjs'),
    path.join(definitionDirectory, 'agents.mjs'),
    path.join(definitionDirectory, 'tools.mjs'),
    path.join(definitionDirectory, 'connectors.mjs'),
    path.join(definitionDirectory, 'knowledge.mjs'),
    path.join(definitionDirectory, 'guardrails.mjs'),
    path.join(definitionDirectory, 'ui-components.mjs'),
    path.join(definitionDirectory, 'product-tour.mjs'),
    catalogFile,
    path.join(suiteRoot, config.runtimeWorkbook),
    path.join(suiteRoot, 'config', 'environments.json'),
  ];
  return {
    schemaVersion: 1,
    module: config.name,
    generatedAt: new Date().toISOString(),
    automatedCount: automatedCases.length,
    manualCount: manualCases.length,
    sourceHashes: Object.fromEntries(sourceFiles.map((filePath) => [
      path.relative(suiteRoot, filePath).replace(/\\/g, '/'),
      hashFile(filePath),
    ])),
    workbookHash: workbookContentHash(workbook),
  };
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

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    result.set(cell.text.trim(), columnNumber);
  });
  return result;
}

function cellText(row, columnNumber, trim = true) {
  const text = columnNumber ? row.getCell(columnNumber).text : '';
  return trim ? text.trim() : text;
}

function hashFile(filePath) {
  return hashText(fs.readFileSync(filePath));
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function styleTitle(cell, color, size) {
  cell.fill = solidFill(color);
  cell.font = { bold: true, color: { argb: COLORS.white }, size };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function styleHeader(row, color) {
  row.height = 30;
  row.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
  row.fill = solidFill(color);
  row.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
}

function applyBorder(row, columns) {
  for (let column = 1; column <= columns; column += 1) {
    row.getCell(column).border = {
      top: { style: 'thin', color: { argb: COLORS.border } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  }
}

function solidFill(color) {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color },
  };
}

function landscapePageSetup() {
  return {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
}
