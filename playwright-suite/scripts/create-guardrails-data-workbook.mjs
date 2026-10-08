import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.GUARDRAILS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'guardrails-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The Guardrails Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:guardrails:reset" only when a reset is intended.',
  );
}

const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in run names, evidence and Excel results.'],
  ['Guardrail Name Pattern', 'QA Guardrail {{RUN_COMPACT}}', 'Unique Guardrail created by this run.'],
  ['Updated Guardrail Name Pattern', 'QA Guardrail Updated {{RUN_COMPACT}}', 'Unique Guardrail name after update.'],
  ['Draft Name Pattern', 'QA Guardrail Draft {{RUN_COMPACT}}', 'Unsaved draft used by validation cases.'],
  ['Created Description Pattern', 'Created by Playwright on {{RUN_DISPLAY}}.', 'Description used during creation.'],
  ['Updated Description Pattern', 'Updated by Playwright on {{RUN_DISPLAY}}.', 'Description used during update.'],
  ['PII Custom Entity', 'qa_customer_reference', 'Synthetic custom PII entity used in drafts and creation.'],
  ['PII Fallback Message', 'Sensitive identity data blocked at {{RUN_DISPLAY}}.', 'Fallback used by Contains PII.'],
  ['Moderation Fallback Message', 'Unsafe content blocked at {{RUN_DISPLAY}}.', 'Fallback used by Moderation.'],
  ['XSS Marker', '<img src=x onerror="window.__qaGuardrailsXss=1">', 'Harmless execution marker used only in unsaved drafts.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped search value.'],
  ['Synthetic Secret Prefix', 'qa-guardrail-synthetic-secret', 'Never replace this with a real credential.'],
];

const identityLabels = [
  'Aadhaar Number',
  'PAN Card',
  'Voter ID',
  'Driving License',
  'Passport Number',
  'IFSC Code',
  'UPI ID',
  'Ration Card',
];
const moderationCodes = [
  'sexual',
  'sexual/minors',
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'violence',
  'violence/graphic',
  'illicit',
  'illicit/violent',
];

const caseData = {
  'GR-001': {},
  'GR-002': {},
  'GR-003': {
    viewIndexes: [0, 1],
    refreshIndex: 2,
  },
  'GR-004': {
    tabs: ['Input', 'Output', 'Access'],
    inputTypes: ['Contains PII', 'Moderation', 'Jailbreak'],
    outputTypes: ['URL Filter', 'Contains PII'],
  },
  'GR-005': {
    invalidBasics: [
      { label: 'both fields are empty', name: '', description: '' },
      { label: 'name is present and description is empty', name: '{{DRAFT_NAME}}', description: '' },
      { label: 'name is empty and description is present', name: '', description: '{{CREATED_DESCRIPTION}}' },
    ],
  },
  'GR-006': {
    whitespaceName: '   ',
    whitespaceDescription: '   ',
  },
  'GR-007': {},
  'GR-008': {
    identityLabels,
    identityCount: 8,
    entityPlaceholder: 'Add entity name (e.g. email, phone, name)',
    fallbackPlaceholder: 'Required message when Contains PII is triggered',
  },
  'GR-009': {
    identityCount: 8,
  },
  'GR-010': {
    customEntity: '{{PII_CUSTOM_ENTITY}}',
    fallbackMessage: '{{PII_FALLBACK_MESSAGE}}',
  },
  'GR-011': {
    moderationCodes,
    categoryCount: 13,
    fallbackPlaceholder: 'Required message when Moderation is triggered',
  },
  'GR-012': {
    categoryCount: 13,
    selectedCodes: ['sexual', 'hate', 'violence'],
    fallbackMessage: '{{MODERATION_FALLBACK_MESSAGE}}',
  },
  'GR-013': {},
  'GR-014': {
    allowedUrl: 'https://example.com/guardrails/{{RUN_COMPACT}}',
    urlFallback: 'URL blocked by QA policy at {{RUN_DISPLAY}}.',
    selectedIdentity: 'PAN Card',
    customEntity: '{{PII_CUSTOM_ENTITY}}',
    piiFallback: '{{PII_FALLBACK_MESSAGE}}',
  },
  'GR-015': {
    allowedUrl: 'https://example.com/guardrails/{{RUN_COMPACT}}/wizard',
    urlFallback: 'Wizard URL blocked at {{RUN_DISPLAY}}.',
  },
  'GR-016': {
    employeeSearch: 'qa-employee-does-not-exist@example.invalid',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'GR-017': {
    selectedIdentity: 'PAN Card',
    customEntity: '{{PII_CUSTOM_ENTITY}}',
    fallbackMessage: '{{PII_FALLBACK_MESSAGE}}',
    allowedUrl: 'https://example.com/guardrails/{{RUN_COMPACT}}',
    urlFallback: 'URL blocked by QA policy at {{RUN_DISPLAY}}.',
    outputSelectedIdentity: 'PAN Card',
    outputCustomEntity: '{{PII_CUSTOM_ENTITY}}_output',
    outputFallback: '{{PII_FALLBACK_MESSAGE}}',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'GR-018': {
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'GR-019': {},
  'GR-020': {
    invalidEdits: [
      { label: 'name is empty', name: '', description: '{{CREATED_DESCRIPTION}}' },
      { label: 'description is empty', name: '{{GUARDRAIL_NAME}}', description: '' },
    ],
    updateButton: 'Update',
  },
  'GR-021': {
    selectedModerationCodes: ['sexual', 'hate', 'violence'],
    moderationFallback: '{{MODERATION_FALLBACK_MESSAGE}}',
  },
  'GR-022': {
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'GR-023': {
    expectedMenuItems: ['Edit', 'Delete'],
  },
  'GR-024': {
    xssPayload: '{{XSS_MARKER}}',
  },
  'GR-025': {
    searchPayloads: [
      '{{SQL_INJECTION_MARKER}}',
      '{"$ne":null}',
      '{{XSS_MARKER}}',
    ],
  },
  'GR-026': {
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
  },
  'GR-027': {
    accessSearchPayload: '{{SQL_INJECTION_MARKER}}',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'GR-028': {
    requiredHeaders: ['strict-transport-security', 'content-security-policy'],
    contentTypeOptions: 'nosniff',
  },
  'GR-029': {
    guardrailsPath: '/guardrails',
    searchPlaceholder: 'Search guardrails...',
    createButton: 'Create Guardrail',
  },
  'GR-030': {
    cancelButton: 'Cancel',
    deleteButton: 'Delete',
  },
};

const catalog = readGuardrailCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June Guardrails module';

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

function readGuardrailCatalog() {
  const catalogPath = path.join(
    suiteRoot,
    'test-cases',
    'guardrail-flow-cases.ts',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(GR-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
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
      'Expected 30 Guardrails catalog cases; found ' + rows.length + '.',
    );
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 30 }, { width: 112 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and Guardrails Test Data before it runs.'],
    ['Run all cases', 'From D:/qa-copilot run: npm.cmd run test:guardrails:excel'],
    ['Run in visible Chrome', 'From D:/qa-copilot run: npm.cmd run test:guardrails:excel:headed'],
    ['Record again', 'From D:/qa-copilot run: npm.cmd run record:guardrails'],
    ['Execution control', 'Set Execute to YES or NO. GR-017 through GR-023 and GR-030 must remain YES because they form the create, verify, edit, update and safe delete-cancel chain.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} are resolved at run time.'],
    ['Common values', 'Edit Settings for names, descriptions, fallback messages and synthetic security markers.'],
    ['Results', 'Execution results are written to test-results/<environment>/excel/guardrails-flow-<environment>-latest.xlsx.'],
    ['Safety', 'Creation and update are real writes. GR-030 opens Delete but always cancels; the framework never confirms permanent deletion.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 38 },
    { header: 'Value', key: 'value', width: 86 },
    { header: 'Description', key: 'description', width: 68 },
  ];
  rows.forEach(([key, value, description]) => {
    sheet.addRow({ key, value, description });
  });
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById) {
  const sheet = workbook.addWorksheet('Guardrails Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 52 },
    { header: 'Expected Result', key: 'expectedResult', width: 72 },
    { header: 'Test Data JSON', key: 'data', width: 96 },
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
