import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.ACCOUNT_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'account-data-driven.xlsx'),
);
const force = process.argv.includes('--force');
const sync = process.argv.includes('--sync');

if (force && sync) {
  throw new Error('Use either --force or --sync, not both.');
}

if (fs.existsSync(outputFile) && !force && !sync) {
  throw new Error(
    'The Account Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use the account data reset command only when a reset is intended.',
  );
}

const restrictedModules = [
  'Agents',
  'Tools',
  'Connectors',
  'Knowledge',
  'Guardrails',
  'UI Components',
];
const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud/task', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['My Account Label', 'My Account', 'Personal account label restored before downstream module tests.'],
  ['Subscribed Business', 'HCL INFOTECH LIMITED', 'Recorded business with subscribed module access.'],
  ['Subscribed GSTIN', '02AADCH0305F1ZI', 'Stable identifier used with the HCL business name.'],
  ['No Subscription Business', 'USHA KANWAR', 'Recorded business used to verify the no-subscription gate.'],
  ['Pro Plan Heading', 'Pro Plan', 'Heading expected on a restricted module for the no-subscription business.'],
  ['Pro Plan CTA', 'Activate (30days free trial)', 'Activation action verified but never clicked by this test flow.'],
  ['Restricted Modules', restrictedModules.join(', '), 'Comma-separated module list checked in subscribed and no-subscription contexts.'],
  ['Connected Connector', 'Exa', 'Connected task connector selected during the My Account connector check.'],
  ['Subscribed Connected Connector', 'Exa', 'Connected task connector selected while HCL is active.'],
  ['No Subscription Connected Connector', 'Exa', 'Connected chat connector selected while USHA is active; this does not grant Connectors module access.'],
];

const caseData = {
  'AC-001': {
    baseUrl: '{{BASE_URL}}',
    myAccountLabel: '{{MY_ACCOUNT_LABEL}}',
  },
  'AC-004': {
    message: 'QA My Account chat validation {{RUN_ISO}}',
  },
  'AC-005': {
    connectorName: '{{CONNECTED_CONNECTOR}}',
    message: 'QA My Account connected connector validation {{RUN_ISO}}',
  },
  'AC-006': {
    roomMessage: 'QA My Account document room setup {{RUN_ISO}}',
    fileName: 'qa-account-upload-{{RUN_STAMP}}.pdf',
    mimeType: 'application/pdf',
    documentText: 'QA Account PDF upload validation {{RUN_ISO}}',
    uploadMessage: 'Validate the attached QA account document {{RUN_ISO}}',
    completionTimeoutMs: 180000,
  },
  'AC-002': {
    subscribedBusiness: '{{SUBSCRIBED_BUSINESS}}',
    subscribedGstin: '{{SUBSCRIBED_GSTIN}}',
    navigationModules: '{{RESTRICTED_MODULES}}',
    blockedHeading: '{{PRO_PLAN_HEADING}}',
  },
  'AC-007': {
    message: 'QA HCL subscribed business chat validation {{RUN_ISO}}',
  },
  'AC-008': {
    connectorName: '{{SUBSCRIBED_CONNECTED_CONNECTOR}}',
    message: 'QA HCL subscribed connector validation {{RUN_ISO}}',
  },
  'AC-009': {
    roomMessage: 'QA HCL document room setup {{RUN_ISO}}',
    fileName: 'qa-hcl-upload-{{RUN_STAMP}}.pdf',
    mimeType: 'application/pdf',
    documentText: 'QA HCL PDF upload validation {{RUN_ISO}}',
    uploadMessage: 'Validate the attached QA HCL document {{RUN_ISO}}',
    completionTimeoutMs: 180000,
  },
  'AC-010': {
    message: 'QA USHA no-subscription chat validation {{RUN_ISO}}',
  },
  'AC-011': {
    connectorName: '{{NO_SUBSCRIPTION_CONNECTED_CONNECTOR}}',
    message: 'QA USHA chat connector validation {{RUN_ISO}}',
  },
  'AC-012': {
    roomMessage: 'QA USHA document room setup {{RUN_ISO}}',
    fileName: 'qa-usha-upload-{{RUN_STAMP}}.pdf',
    mimeType: 'application/pdf',
    documentText: 'QA USHA PDF upload validation {{RUN_ISO}}',
    uploadMessage: 'Validate the attached QA USHA document {{RUN_ISO}}',
    completionTimeoutMs: 180000,
  },
  'AC-003': {
    noSubscriptionBusiness: '{{NO_SUBSCRIPTION_BUSINESS}}',
    restrictedModules: '{{RESTRICTED_MODULES}}',
    proPlanHeading: '{{PRO_PLAN_HEADING}}',
    proPlanCta: '{{PRO_PLAN_CTA}}',
    restoreAccountLabel: '{{MY_ACCOUNT_LABEL}}',
    activateSubscription: false,
  },
};

const catalog = readAccountCatalog();
const existing = sync && fs.existsSync(outputFile)
  ? await readExistingInput(outputFile)
  : { settings: new Map(), cases: new Map() };
const knownIds = new Set(catalog.map((item) => item.id));
const unknownCaseIds = [...existing.cases.keys()]
  .filter((id) => !knownIds.has(id));
if (unknownCaseIds.length > 0) {
  throw new Error(
    'Account workbook contains unknown case(s); sync stopped without writing: '
    + unknownCaseIds.join(', '),
  );
}
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June account preflight';

addInstructions(workbook);
addSettings(workbook, mergeSettings(settings, existing.settings));
addTestData(workbook, catalog, caseData, existing.cases);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
await workbook.xlsx.writeFile(outputFile);
console.log(JSON.stringify({
  ok: true,
  outputFile,
  cases: catalog.length,
  execute: 'YES',
  mode: sync ? 'sync' : force ? 'force' : 'create',
}, null, 2));

function readAccountCatalog() {
  const catalogPath = path.join(
    suiteRoot,
    'test-cases',
    'account-flow-cases.ts',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(AC-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    rows.push({
      id: match[1],
      title: match[2],
      expectedResult: match[3],
    });
  }
  if (rows.length !== 12) {
    throw new Error(
      'Expected 12 Account catalog cases; found ' + rows.length + '.',
    );
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 30 }, { width: 112 }];
  [
    ['Purpose', 'This input workbook drives twelve sequential Account checks across My Account, subscribed HCL and no-subscription USHA contexts.'],
    ['Run all cases', 'From D:/qa-copilot run: npm.cmd run test:account:excel'],
    ['Run in visible Chrome', 'From D:/qa-copilot run: npm.cmd run test:account:excel:headed'],
    ['Execution control', 'Set Execute to YES or NO. AC-003 must remain YES because it verifies no-subscription access and restores My Account for downstream tests.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Settings tokens plus {{RUN_ISO}} and filename-safe {{RUN_STAMP}} are resolved at run time.'],
    ['Recorded My Account flow', 'AC-004 enters the dated chat message, AC-005 selects the connected connector, and AC-006 creates a room then uploads and submits a synthetic non-sensitive PDF.'],
    ['Subscribed HCL flow', 'AC-007 through AC-009 repeat chat, connected-connector and synthetic PDF checks while HCL is active.'],
    ['No-subscription USHA flow', 'AC-010 through AC-012 repeat task checks for USHA. AC-003 separately proves paid modules remain Pro Plan gated.'],
    ['Workbook synchronization', 'Run npm.cmd run data:account:sync after framework case changes. Existing Execute, Test Data JSON and Notes values are preserved for known IDs.'],
    ['Business matching', 'The subscribed business is matched by both HCL name and GSTIN to avoid choosing a similarly named account.'],
    ['No-subscription safety', 'The Pro Plan action is asserted but never clicked, so this flow does not activate a trial or enter checkout.'],
    ['Restoration', 'The final mandatory case restores My Account so later module tests start in a known account context.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 38 },
    { header: 'Value', key: 'value', width: 92 },
    { header: 'Description', key: 'description', width: 76 },
  ];
  rows.forEach(([key, value, description]) => {
    sheet.addRow({ key, value, description });
  });
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById, existingRows) {
  const sheet = workbook.addWorksheet('Account Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 58 },
    { header: 'Expected Result', key: 'expectedResult', width: 82 },
    { header: 'Test Data JSON', key: 'data', width: 98 },
    { header: 'Notes', key: 'notes', width: 42 },
  ];

  catalogRows.forEach((item, index) => {
    const existing = existingRows.get(item.id);
    sheet.addRow({
      sequence: index + 1,
      execute: existing?.execute || 'YES',
      id: item.id,
      title: item.title,
      expectedResult: item.expectedResult,
      data: existing?.data
        || JSON.stringify(dataById[item.id] || {}, null, 2),
      notes: existing?.notes || '',
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

async function readExistingInput(filePath) {
  const existingWorkbook = new ExcelJS.Workbook();
  await existingWorkbook.xlsx.readFile(filePath);
  const settingsSheet = existingWorkbook.getWorksheet('Settings');
  const dataSheet = existingWorkbook.getWorksheet('Account Test Data');
  if (!settingsSheet || !dataSheet) {
    throw new Error(
      'Cannot sync: existing workbook needs Settings and Account Test Data sheets.',
    );
  }

  const existingSettings = new Map();
  for (let rowNumber = 2; rowNumber <= settingsSheet.rowCount; rowNumber += 1) {
    const row = settingsSheet.getRow(rowNumber);
    const key = row.getCell(1).text.trim();
    if (!key) continue;
    existingSettings.set(key, {
      value: row.getCell(2).text,
      description: row.getCell(3).text,
    });
  }

  const existingCases = new Map();
  for (let rowNumber = 2; rowNumber <= dataSheet.rowCount; rowNumber += 1) {
    const row = dataSheet.getRow(rowNumber);
    const id = row.getCell(3).text.trim().toUpperCase();
    if (!id) continue;
    if (existingCases.has(id)) {
      throw new Error('Cannot sync duplicate Account case: ' + id);
    }
    existingCases.set(id, {
      execute: row.getCell(2).text.trim() || 'YES',
      data: row.getCell(6).text || '{}',
      notes: row.getCell(7).text,
    });
  }
  return { settings: existingSettings, cases: existingCases };
}

function mergeSettings(defaultRows, existingSettings) {
  const merged = defaultRows.map(([key, value, description]) => {
    const configuredValue = existingSettings.get(key)?.value ?? value;
    return [key, migrateLegacyTaskRoute(key, configuredValue), description];
  });
  const knownKeys = new Set(defaultRows.map(([key]) => key));
  for (const [key, item] of existingSettings) {
    if (!knownKeys.has(key)) {
      merged.push([key, item.value, item.description]);
    }
  }
  return merged;
}

function migrateLegacyTaskRoute(key, value) {
  if (key !== 'Base URL') return value;
  return value.replace(/\/workspace(?=\/|[?#]|$)/i, '/task');
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
