import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.CONNECTORS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'connectors-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The Connectors Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:connectors:reset" only when a reset is intended.',
  );
}

const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in generated run names and evidence.'],
  ['Connector Name Pattern', 'QA Connector {{RUN_COMPACT}}', 'Unique connector created by this run.'],
  ['Updated Connector Name Pattern', 'QA Connector Updated {{RUN_COMPACT}}', 'Unique connector name after update.'],
  ['Draft Name Pattern', 'QA Connector Draft {{RUN_COMPACT}}', 'Unsaved draft used by validation tests.'],
  ['Created Description Pattern', 'Created by Playwright on {{RUN_DISPLAY}}.', 'Description used during creation.'],
  ['Updated Description Pattern', 'Updated by Playwright on {{RUN_DISPLAY}}.', 'Description used during update.'],
  ['Server URL Pattern', 'https://example.com/qa-connectors/{{RUN_COMPACT}}', 'Synthetic HTTPS destination used during creation.'],
  ['Updated Server URL Pattern', 'https://example.com/qa-connectors/{{RUN_COMPACT}}/v2', 'Synthetic HTTPS destination used during update.'],
  ['Config JSON', JSON.stringify({ 'Content-Type': 'application/json', runAt: '{{RUN_ISO}}' }, null, 2), 'Synthetic connector configuration.'],
  ['Country', 'India', 'Default country. Allowed values: India, USA or UAE.'],
  ['XSS Marker', '<img src=x onerror="window.__qaConnectorsXss=1">', 'Harmless execution marker used only in unsaved drafts.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped search value.'],
  ['Synthetic Secret Prefix', 'qa-synthetic-secret', 'Never replace this with a real credential.'],
];

const caseData = {
  'CN-001': {},
  'CN-002': {},
  'CN-003': {
    dateFilters: ['Today', 'Yesterday', 'Past 7 days', 'Last Month'],
    viewIndexes: [0, 1],
    refreshIndex: 2,
  },
  'CN-004': {
    countries: ['India', 'USA', 'UAE'],
    iconAcceptIncludes: 'image/png',
    iconGuidance: ['PNG', '40KB'],
  },
  'CN-005': {
    invalidInformation: [
      { label: 'all required fields are empty', name: '', serverUrl: '', config: '' },
      { label: 'name is missing', name: '', serverUrl: '{{SERVER_URL}}', config: '{{CONFIG_JSON}}' },
      { label: 'server URL is missing', name: '{{DRAFT_NAME}}', serverUrl: '', config: '{{CONFIG_JSON}}' },
      { label: 'config is missing', name: '{{DRAFT_NAME}}', serverUrl: '{{SERVER_URL}}', config: '' },
      { label: 'required values contain whitespace only', name: '   ', serverUrl: '   ', config: '   ' },
    ],
  },
  'CN-006': {
    invalidServerUrls: [
      'not-a-valid-url',
      'javascript:alert(1)',
      'file:///C:/Windows/win.ini',
      'https://user:password@example.com/hook',
      'http://localhost:8080/hook',
      'http://127.0.0.1/hook',
      'http://10.0.0.1/hook',
      'http://169.254.169.254/latest/meta-data',
    ],
  },
  'CN-007': {},
  'CN-008': {
    countries: ['India', 'USA', 'UAE'],
  },
  'CN-009': {},
  'CN-010': {
    employeeSearch: 'qa-employee-does-not-exist@example.invalid',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'CN-011': {
    createButton: 'Create',
  },
  'CN-012': {
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'CN-013': {},
  'CN-014': {
    invalidEdits: [
      { label: 'name is empty', name: '', serverUrl: '{{SERVER_URL}}', config: '{{CONFIG_JSON}}' },
      { label: 'server URL is empty', name: '{{CONNECTOR_NAME}}', serverUrl: '', config: '{{CONFIG_JSON}}' },
      { label: 'config is empty', name: '{{CONNECTOR_NAME}}', serverUrl: '{{SERVER_URL}}', config: '' },
    ],
    updateButton: 'Update',
  },
  'CN-015': {
    updateButton: 'Update',
  },
  'CN-016': {
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'CN-017': {
    expectedMenuItems: ['Edit Connector', 'Delete'],
  },
  'CN-018': {
    xssPayload: '{{XSS_MARKER}}',
  },
  'CN-019': {
    searchPayloads: [
      '{{SQL_INJECTION_MARKER}}',
      '{"$ne":null}',
      '{{XSS_MARKER}}',
    ],
  },
  'CN-020': {
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
  },
  'CN-021': {
    accessSearchPayload: '{{SQL_INJECTION_MARKER}}',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'CN-022': {
    requiredHeaders: ['strict-transport-security', 'content-security-policy'],
    contentTypeOptions: 'nosniff',
  },
  'CN-023': {
    connectorsPath: '/connectors',
    searchPlaceholder: 'Search connectors...',
    createButton: 'Create Connector',
  },
  'CN-024': {
    cancelButton: 'Cancel',
    deleteButton: 'Delete',
  },
};

const catalog = readConnectorCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June Connectors module';

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

function readConnectorCatalog() {
  const catalogPath = path.join(suiteRoot, 'test-cases', 'connector-flow-cases.ts');
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(CN-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    rows.push({ id: match[1], title: match[2], expectedResult: match[3] });
  }
  if (rows.length !== 24) {
    throw new Error('Expected 24 Connectors catalog cases; found ' + rows.length + '.');
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 30 }, { width: 112 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and Connectors Test Data before it runs.'],
    ['Run all cases', 'From D:\\qa-copilot run: npm.cmd run test:connectors:excel'],
    ['Run in visible Chrome', 'From D:\\qa-copilot run: npm.cmd run test:connectors:excel:headed'],
    ['Execution control', 'Set Execute to YES or NO. CN-011 through CN-017 and CN-024 must remain YES because they form the create, verify, update and safe delete-cancel chain.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} are resolved at run time.'],
    ['Common values', 'Edit Settings for names, description, endpoint, config and country.'],
    ['Results', 'Execution results are written separately to test-results\\excel\\connectors-flow-latest.xlsx.'],
    ['Safety', 'Creation and update are real writes. CN-024 opens Delete but always cancels; the framework never confirms permanent deletion.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 36 },
    { header: 'Value', key: 'value', width: 82 },
    { header: 'Description', key: 'description', width: 64 },
  ];
  rows.forEach(([key, value, description]) => sheet.addRow({ key, value, description }));
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById) {
  const sheet = workbook.addWorksheet('Connectors Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 50 },
    { header: 'Expected Result', key: 'expectedResult', width: 70 },
    { header: 'Test Data JSON', key: 'data', width: 92 },
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
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).alignment = { vertical: 'top', wrapText: true };
  }
}
