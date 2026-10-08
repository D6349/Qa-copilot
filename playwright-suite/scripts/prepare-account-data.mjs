import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEnvironmentArtifactPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const sourceWorkbook = path.resolve(
  process.env.ACCOUNT_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'account-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.ACCOUNT_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(suiteRoot, 'runtime', 'account-data.json'),
);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Account Excel input workbook is missing: ' + sourceWorkbook
    + '. Run the account data init command first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);

const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Account Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain "Settings" and "Account Test Data" sheets.',
  );
}

const settings = readSettings(settingsSheet);
settings['Base URL'] = resolveEnvironmentProfile().baseURL;
const cases = readCases(dataSheet);
validateSettings(settings);
validateCases(cases);

const payload = {
  sourceWorkbook,
  sourceModifiedMs: Math.trunc(fs.statSync(sourceWorkbook).mtimeMs),
  preparedAt: new Date().toISOString(),
  settings,
  cases,
};

if (!checkOnly) {
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(runtimeFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  ok: true,
  mode: checkOnly ? 'check' : 'prepare',
  sourceWorkbook,
  runtimeFile: checkOnly ? null : runtimeFile,
  totalCases: cases.length,
  enabledCases: cases.filter((item) => item.execute).length,
  disabledCases: cases.filter((item) => !item.execute).length,
}, null, 2));

function readSettings(sheet) {
  const headers = headerMap(sheet);
  requireHeaders(headers, ['Key', 'Value'], sheet.name);
  const result = {};
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const key = cellText(row, headers.get('Key'));
    if (!key) continue;
    if (key in result) throw new Error('Duplicate Settings key: ' + key);
    result[key] = cellText(row, headers.get('Value'), false);
  }
  return result;
}

function readCases(sheet) {
  const headers = headerMap(sheet);
  const required = [
    'Sequence',
    'Execute',
    'Test Case ID',
    'Title',
    'Expected Result',
    'Test Data JSON',
    'Notes',
  ];
  requireHeaders(headers, required, sheet.name);
  const result = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const id = cellText(row, headers.get('Test Case ID')).toUpperCase();
    if (!id) continue;
    const rawJson = cellText(row, headers.get('Test Data JSON'), false) || '{}';
    let data;
    try {
      data = JSON.parse(rawJson);
    } catch (error) {
      throw new Error(
        id + ' has invalid Test Data JSON at Excel row ' + rowNumber
        + ': ' + error.message,
      );
    }
    result.push({
      sequence: Number(cellText(row, headers.get('Sequence'))),
      execute: parseExecute(cellText(row, headers.get('Execute')), id),
      id,
      title: cellText(row, headers.get('Title')),
      expectedResult: cellText(row, headers.get('Expected Result'), false),
      data,
      notes: cellText(row, headers.get('Notes'), false),
    });
  }
  return result.sort((left, right) => left.sequence - right.sequence);
}

function validateSettings(settings) {
  const required = [
    'Base URL',
    'My Account Label',
    'Subscribed Business',
    'Subscribed GSTIN',
    'No Subscription Business',
    'Pro Plan Heading',
    'Pro Plan CTA',
    'Restricted Modules',
    'Connected Connector',
    'Subscribed Connected Connector',
    'No Subscription Connected Connector',
  ];
  for (const key of required) {
    if (!settings[key]) {
      throw new Error('Required Settings value is missing: ' + key);
    }
  }

  let baseUrl;
  try {
    baseUrl = new URL(settings['Base URL']);
  } catch {
    throw new Error('Base URL must be a valid absolute URL.');
  }
  if (baseUrl.protocol !== 'https:') {
    throw new Error('Base URL must use HTTPS.');
  }

  if (settings['Subscribed GSTIN'] !== '02AADCH0305F1ZI') {
    throw new Error(
      'Subscribed GSTIN must remain 02AADCH0305F1ZI for the recorded HCL account.',
    );
  }

  const expectedModules = [
    'Agents',
    'Tools',
    'Connectors',
    'Knowledge',
    'Guardrails',
    'UI Components',
  ];
  const configuredModules = settings['Restricted Modules']
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    configuredModules.length !== expectedModules.length
    || expectedModules.some((item) => !configuredModules.includes(item))
  ) {
    throw new Error(
      'Restricted Modules must contain: ' + expectedModules.join(', ') + '.',
    );
  }
}

function validateCases(cases) {
  const expectedIds = [
    'AC-001',
    'AC-004',
    'AC-005',
    'AC-006',
    'AC-002',
    'AC-007',
    'AC-008',
    'AC-009',
    'AC-010',
    'AC-011',
    'AC-012',
    'AC-003',
  ];
  if (cases.length !== expectedIds.length) {
    throw new Error(
      'Account Test Data must contain exactly 12 rows; found '
      + cases.length + '.',
    );
  }

  const seen = new Set();
  cases.forEach((item, index) => {
    if (!Number.isInteger(item.sequence) || item.sequence !== index + 1) {
      throw new Error(
        item.id + ' must have Sequence ' + (index + 1)
        + '; found ' + String(item.sequence) + '.',
      );
    }
    if (item.id !== expectedIds[index]) {
      throw new Error(
        'Expected ' + expectedIds[index] + ' at sequence ' + (index + 1)
        + '; found ' + item.id + '.',
      );
    }
    if (seen.has(item.id)) throw new Error('Duplicate Test Case ID: ' + item.id);
    if (!item.title) throw new Error(item.id + ' has an empty Title.');
    if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
      throw new Error(item.id + ' Test Data JSON must be an object.');
    }
    validateCaseData(item.id, item.data);
    seen.add(item.id);
  });

  if (!cases.find((item) => item.id === 'AC-003')?.execute) {
    throw new Error(
      'AC-003 cannot be disabled because it verifies the no-subscription gate '
      + 'and restores My Account for downstream module tests.',
    );
  }
}

function validateCaseData(id, data) {
  if (['AC-004', 'AC-007', 'AC-010'].includes(id)) {
    requireDataString(data, 'message', id);
  }

  if (['AC-005', 'AC-008', 'AC-011'].includes(id)) {
    requireDataString(data, 'connectorName', id);
    requireDataString(data, 'message', id);
  }

  if (['AC-006', 'AC-009', 'AC-012'].includes(id)) {
    requireDataString(data, 'roomMessage', id);
    const fileName = requireDataString(data, 'fileName', id);
    const mimeType = requireDataString(data, 'mimeType', id);
    requireDataString(data, 'documentText', id);
    requireDataString(data, 'uploadMessage', id);
    if (!/\.pdf$/i.test(fileName) || /[\\/]/.test(fileName)) {
      throw new Error(
        id + ' fileName must end in .pdf and must not contain a path.',
      );
    }
    if (mimeType !== 'application/pdf') {
      throw new Error(id + ' mimeType must be application/pdf.');
    }
    if (
      !Number.isInteger(data.completionTimeoutMs)
      || data.completionTimeoutMs < 30000
      || data.completionTimeoutMs > 300000
    ) {
      throw new Error(
        id + ' completionTimeoutMs must be an integer from 30000 to 300000.',
      );
    }
  }
}

function requireDataString(data, key, id) {
  const value = data[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(id + ' Test Data JSON requires non-empty "' + key + '".');
  }
  return value;
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    result.set(cell.text.trim(), columnNumber);
  });
  return result;
}

function requireHeaders(headers, required, sheetName) {
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    throw new Error(
      sheetName + ' is missing column(s): ' + missing.join(', '),
    );
  }
}

function cellText(row, columnNumber, trim = true) {
  const value = columnNumber ? row.getCell(columnNumber).text : '';
  return trim ? value.trim() : value;
}

function parseExecute(value, id) {
  const normalized = value.trim().toUpperCase();
  if (['YES', 'Y', 'TRUE', '1', 'RUN'].includes(normalized)) return true;
  if (['NO', 'N', 'FALSE', '0', 'SKIP'].includes(normalized)) return false;
  throw new Error(
    id + ' Execute must be YES or NO; found "' + value + '".',
  );
}
