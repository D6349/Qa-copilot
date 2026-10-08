import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.UI_COMPONENTS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'ui-components-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The UI Components Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:ui-components:reset" only when a reset is intended.',
  );
}

const componentTypes = [
  'Table',
  'Form',
  'Card',
  'List',
  'Chart',
  'Catalog',
  'Checkout',
  'Suggestion List',
];
const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in generated run names, evidence and Excel results.'],
  ['UI Component Name Pattern', 'QA UI Component {{RUN_COMPACT}}', 'Unique UI Component created by this run.'],
  ['Updated UI Component Name Pattern', 'QA UI Component Updated {{RUN_COMPACT}}', 'Unique UI Component name after update.'],
  ['Draft Name Pattern', 'QA UI Component Draft {{RUN_COMPACT}}', 'Unsaved draft used by validation and security tests.'],
  ['Created Description Pattern', 'Created by Playwright on {{RUN_DISPLAY}}.', 'Description used during creation.'],
  ['Updated Description Pattern', 'Updated by Playwright on {{RUN_DISPLAY}}.', 'Description used during update.'],
  ['Design Prompt Pattern', 'Create a reusable UI component with a visible QA marker {{RUN_DISPLAY}} and representative sample data.', 'Prompt used for generated JSON and React code.'],
  ['Updated Design Prompt Pattern', 'Create an updated UI component with a visible updated QA marker {{RUN_DISPLAY}} and changed sample data.', 'Prompt used during update.'],
  ['Component Type', 'Table', 'Component type used for creation.'],
  ['Updated Component Type', 'Card', 'Component type used for update.'],
  ['XSS Marker', '<img src=x onerror="window.__qaUiComponentsXss=1">', 'Harmless execution marker used only in unsaved drafts.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped search value.'],
  ['Synthetic Secret Prefix', 'qa-ui-component-synthetic-secret', 'Never replace this with a real credential.'],
];

const caseData = {
  'UC-001': {},
  'UC-002': {},
  'UC-003': {
    viewIndexes: [0, 1],
    refreshIndex: 2,
  },
  'UC-004': {
    tabs: ['Information', 'Designs', 'Visibility'],
    requiredFields: ['Name *', 'Description *', 'Component Type *'],
    actions: ['Cancel', 'Create', 'Next'],
  },
  'UC-005': { componentTypes },
  'UC-006': {
    name: '',
    description: 'Valid UI Component description',
    componentType: '{{COMPONENT_TYPE}}',
  },
  'UC-007': {
    name: '{{DRAFT_NAME}}',
    description: '',
    componentType: '{{COMPONENT_TYPE}}',
  },
  'UC-008': {
    name: '{{DRAFT_NAME}}',
    description: '{{CREATED_DESCRIPTION}}',
    componentType: '',
  },
  'UC-009': {
    whitespaceName: '   ',
    whitespaceDescription: '   ',
    componentType: '{{COMPONENT_TYPE}}',
  },
  'UC-010': {},
  'UC-011': { prompt: '{{DESIGN_PROMPT}}' },
  'UC-012': {
    prompt: 'A simple table with a visible QA marker and representative values.',
    formatButton: 'Format',
    runButton: 'Run',
    jsonPlaceholder: '{ "component_name", "component_type", "data": { ... } }',
    reactPlaceholder: 'Generate or write React code',
  },
  'UC-013': { prompt: '{{DESIGN_PROMPT}}' },
  'UC-014': {
    employeeSearch: 'qa-employee-does-not-exist@example.invalid',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'UC-015': {
    accessSearch: 'qa-employee-does-not-exist@example.invalid',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'UC-016': {
    layoutControlCount: 3,
    requireAccessibleNames: true,
  },
  'UC-017': {
    componentType: '{{COMPONENT_TYPE}}',
    prompt: '{{DESIGN_PROMPT}}',
  },
  'UC-018': { componentType: '{{COMPONENT_TYPE}}' },
  'UC-019': {},
  'UC-020': {
    invalidEdits: [
      { label: 'name is empty', name: '', description: '{{CREATED_DESCRIPTION}}' },
      { label: 'description is empty', name: '{{UI_COMPONENT_NAME}}', description: '' },
    ],
  },
  'UC-021': {
    updatedComponentType: '{{UPDATED_COMPONENT_TYPE}}',
    updatedPrompt: '{{UPDATED_DESIGN_PROMPT}}',
  },
  'UC-022': { componentType: '{{UPDATED_COMPONENT_TYPE}}' },
  'UC-023': { expectedMenuItems: ['Edit', 'Delete'] },
  'UC-024': { xssPayload: '{{XSS_MARKER}}' },
  'UC-025': {
    searchPayloads: [
      '{{SQL_INJECTION_MARKER}}',
      '{"$ne":null}',
      '{{XSS_MARKER}}',
    ],
  },
  'UC-026': {
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
  },
  'UC-027': {
    accessSearchPayload: '{{SQL_INJECTION_MARKER}}',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'UC-028': {
    requiredHeaders: ['strict-transport-security', 'content-security-policy'],
    frameProtectionHeaders: ['content-security-policy', 'x-frame-options'],
    contentTypeOptions: 'nosniff',
  },
  'UC-029': {
    uiComponentsPath: '/ui-components',
    searchPlaceholder: 'Search ui components...',
    createButton: 'Create UI Component',
  },
  'UC-030': {
    cancelButton: 'Cancel',
    deleteButton: 'Delete',
  },
};

const catalog = readUiComponentCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June UI Components module';

addInstructions(workbook);
addSettings(workbook, settings);
addTestData(workbook, catalog, caseData);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
await workbook.xlsx.writeFile(outputFile);
console.log(JSON.stringify({
  ok: true,
  outputFile,
  cases: catalog.length,
  execute: 'YES',
}, null, 2));

function readUiComponentCatalog() {
  const catalogPath = path.join(
    suiteRoot,
    'test-cases',
    'ui-component-flow-cases.ts',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(UC-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    rows.push({
      id: match[1],
      title: match[2],
      expectedResult: match[3],
    });
  }
  if (rows.length !== 30) {
    throw new Error(
      'Expected 30 UI Components catalog cases; found ' + rows.length + '.',
    );
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 30 }, { width: 112 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and UI Components Test Data before it runs.'],
    ['Run all cases', 'From D:/qa-copilot run: npm.cmd run test:ui-components:excel'],
    ['Run in visible Chrome', 'From D:/qa-copilot run: npm.cmd run test:ui-components:excel:headed'],
    ['Record again', 'From D:/qa-copilot run: npm.cmd run record:ui-components'],
    ['Execution control', 'Set Execute to YES or NO. UC-017 through UC-023 and UC-030 must remain YES because they form the create, verify, edit, update and cleanup chain.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} are resolved at run time.'],
    ['Common values', 'Edit Settings for names, descriptions, design prompts, component types and synthetic security markers.'],
    ['Results', 'Execution results are written to test-results/<environment>/excel/ui-components-flow-<environment>-latest.xlsx.'],
    ['Safety', 'Creation, update and UC-030 deletion target only the timestamped synthetic UI Component created by this run.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 40 },
    { header: 'Value', key: 'value', width: 92 },
    { header: 'Description', key: 'description', width: 68 },
  ];
  rows.forEach(([key, value, description]) => {
    sheet.addRow({ key, value, description });
  });
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById) {
  const sheet = workbook.addWorksheet('UI Components Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 54 },
    { header: 'Expected Result', key: 'expectedResult', width: 74 },
    { header: 'Test Data JSON', key: 'data', width: 98 },
    { header: 'Notes', key: 'notes', width: 42 },
  ];

  catalogRows.forEach((item, index) => {
    sheet.addRow({
      sequence: index + 1,
      execute: 'YES',
      id: item.id,
      title: item.title,
      expectedResult: item.expectedResult,
      data: JSON.stringify(dataById[item.id] || {}, null, 2),
      notes: '',
    });
  });

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getCell(rowNumber, 2).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"YES,NO"'],
    };
  }
  styleTable(sheet);
}

function styleTable(sheet) {
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  header.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).alignment = {
      vertical: 'top',
      wrapText: true,
    };
  }
}
