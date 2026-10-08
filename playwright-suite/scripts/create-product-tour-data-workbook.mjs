import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.PRODUCT_TOUR_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'product-tour-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The Product Tour Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:product-tour:reset" only when a reset is intended.',
  );
}

const entries = [
  'Platform Overview',
  'Agents',
  'Tools',
  'Connectors',
  'Knowledge',
  'Guardrails',
  'UI components',
  'Inbox',
];

const platformSteps = [
  'Welcome to June AI.',
  'Start a conversation',
  'Ask anything',
  'Choose your model',
  'Build your stack',
  'Organize work',
  "You're ready",
];

const caseData = {
  'PT-001': {
    tourEntry: 'Platform Overview',
    expectedStartPath: '/task',
    expectedFinalPath: '/task',
    steps: platformSteps,
  },
  'PT-002': {
    tourEntry: 'Agents',
    expectedStartPath: '/agents',
    expectedFinalPath: '/agents',
    steps: [
      'Welcome to Agents.',
      'Find agents quickly',
      'Browse by type',
      'Create an agent',
      'New Agent',
      'Setup steps',
      'Information',
      'Instructions',
      'Tools',
      'Connectors',
      'Swarm',
      'Knowledge',
      'Guardrail',
      'UI Component',
      'Access',
      'Save your agent',
    ],
  },
  'PT-003': {
    tourEntry: 'Tools',
    expectedStartPath: '/tools',
    expectedFinalPath: '/tools',
    steps: [
      'Welcome to Tools.',
      'Find tools quickly',
      'Browse by type',
      'Create a tool',
      'New Tool',
      'Setup steps',
      'Information',
      'API Details',
      'Access',
      'Save your tool',
    ],
  },
  'PT-004': {
    tourEntry: 'Connectors',
    expectedStartPath: '/connectors',
    expectedFinalPath: '/connectors',
    steps: [
      'Find connectors quickly',
      'Create a connector',
      'New Connector',
      'Setup steps',
      'Information',
      'Access',
      'Save your connector',
    ],
  },
  'PT-005': {
    tourEntry: 'Knowledge',
    expectedStartPath: '/knowledge-base',
    expectedFinalPath: '/knowledge-base',
    steps: [
      'Welcome to Knowledge Bases.',
      'Choose a provider',
      'Find knowledge quickly',
      'Create a knowledge base',
      'New Knowledge Base',
      'Setup steps',
      'Information',
      'Documents',
      'Access',
      'Save your knowledge base',
    ],
  },
  'PT-006': {
    tourEntry: 'Guardrails',
    expectedStartPath: '/guardrails',
    expectedFinalPath: '/guardrails',
    steps: [
      'Find guardrails quickly',
      'Create a guardrail',
      'New Guardrail',
      'Setup steps',
      'Information',
      'API Details',
      'Access',
      'Save your guardrail',
    ],
  },
  'PT-007': {
    tourEntry: 'UI components',
    expectedStartPath: '/ui-components',
    expectedFinalPath: '/ui-components',
    steps: [
      'Welcome to UI Components.',
      'Find UI components quickly',
      'Create a UI component',
      'New UI Component',
      'Setup steps',
      'Information',
      'Designs',
      'Visibility',
      'Save your UI component',
    ],
  },
  'PT-008': {
    tourEntry: 'Inbox',
    expectedStartPath: '/inbox',
    expectedFinalPath: '/inbox',
    steps: [
      'Welcome to Inbox.',
      'Refresh the list',
      'Filter by agent',
      'Sort workspaces',
      'Filter by date',
      'Move between pages',
      'Open a workspace',
    ],
  },
  'PT-009': { entries },
  'PT-010': {
    tourEntry: 'Platform Overview',
    expectedPath: '/task',
    firstStep: platformSteps[0],
    secondStep: platformSteps[1],
  },
  'PT-011': {
    tourEntry: 'Platform Overview',
    expectedPath: '/task',
    firstStep: platformSteps[0],
    secondStep: platformSteps[1],
    totalSteps: platformSteps.length,
  },
  'PT-012': {
    protectedPath: '/task',
    loginPathPattern: '/login',
  },
};

const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational DEV fallback only. TARGET_ENV controls the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used by reports.'],
  ['Start Path', '/task', 'Authenticated route used to open Explore June AI.'],
  ['Launcher Label', 'Explore June AI', 'Visible account-menu launcher recorded in DEV.'],
  ['Mutation Policy', 'DENY', 'The suite must not create, update, upload or delete business data.'],
];

const catalog = readCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for Explore June AI Product Tours';

addInstructions(workbook);
addSettings(workbook);
addTestData(workbook, catalog);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
await workbook.xlsx.writeFile(outputFile);
console.log(JSON.stringify({
  ok: true,
  outputFile,
  cases: catalog.length,
  execute: 'YES',
  credentialValuesStored: false,
}, null, 2));

function readCatalog() {
  const source = fs.readFileSync(
    path.join(suiteRoot, 'test-cases', 'product-tour-flow-cases.ts'),
    'utf8',
  );
  const pattern = /id:\s*'(PT-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
  const rows = [];
  for (const match of source.matchAll(pattern)) {
    rows.push({ id: match[1], title: match[2], expectedResult: match[3] });
  }
  const expected = Array.from(
    { length: 12 },
    (_unused, index) => `PT-${String(index + 1).padStart(3, '0')}`,
  );
  if (JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(expected)) {
    throw new Error('Product Tour case catalog must contain PT-001 through PT-012 in order.');
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [
    { header: 'Topic', key: 'topic', width: 30 },
    { header: 'Guidance', key: 'guidance', width: 105 },
  ];
  [
    ['Purpose', 'Data-driven input for the Explore June AI Product Tour suite.'],
    ['Run headed DEV', 'npm.cmd run env:run -- dev product-tour --headed'],
    ['Record again', 'npm.cmd run env:run -- dev record-product-tour'],
    ['Execution control', 'Set Execute to YES or NO for independent PT cases.'],
    ['Safety', 'All cases are read-only. Create dialogs are cancelled without entering or saving business data.'],
    ['Evidence', 'Excel results and screenshots are written under test-results/<environment>/excel.'],
  ].forEach(([topic, guidance]) => sheet.addRow({ topic, guidance }));
  styleSheet(sheet);
}

function addSettings(workbook) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 28 },
    { header: 'Value', key: 'value', width: 45 },
    { header: 'Notes', key: 'notes', width: 85 },
  ];
  settings.forEach(([key, value, notes]) => sheet.addRow({ key, value, notes }));
  styleSheet(sheet);
}

function addTestData(workbook, catalog) {
  const sheet = workbook.addWorksheet('Product Tour Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 12 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 16 },
    { header: 'Title', key: 'title', width: 52 },
    { header: 'Expected Result', key: 'expectedResult', width: 75 },
    { header: 'Test Data JSON', key: 'data', width: 100 },
    { header: 'Notes', key: 'notes', width: 55 },
  ];
  catalog.forEach((item, index) => {
    if (!(item.id in caseData)) {
      throw new Error('Missing Product Tour data for ' + item.id);
    }
    sheet.addRow({
      sequence: index + 1,
      execute: 'YES',
      id: item.id,
      title: item.title,
      expectedResult: item.expectedResult,
      data: JSON.stringify(caseData[item.id]),
      notes: index < 8
        ? 'Mapped from the DEV Codegen tour and verified against the live step text.'
        : 'Derived from controls observed in the recorded Tour UI.',
    });
  });
  sheet.dataValidations.add(`B2:B${catalog.length + 1}`, {
    type: 'list',
    allowBlank: false,
    formulae: ['"YES,NO"'],
  });
  styleSheet(sheet);
}

function styleSheet(sheet) {
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
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
