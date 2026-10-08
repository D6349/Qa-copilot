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
  process.env.PRODUCT_TOUR_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'product-tour-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.PRODUCT_TOUR_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(
      suiteRoot,
      'runtime',
      'product-tour-data.json',
    ),
);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Product Tour Excel input workbook is missing: ' + sourceWorkbook
    + '. Run "npm.cmd run data:product-tour:init" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);
const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Product Tour Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain Settings and Product Tour Test Data sheets.',
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
  credentialValuesStored: false,
  writeCaseIds: [],
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
  for (const key of [
    'Base URL',
    'Time Zone',
    'Start Path',
    'Launcher Label',
    'Mutation Policy',
  ]) {
    if (!settings[key]) throw new Error('Required Settings value is missing: ' + key);
  }
  if (settings['Start Path'] !== '/task') {
    throw new Error('Product Tour Start Path must remain /task.');
  }
  if (settings['Launcher Label'] !== 'Explore June AI') {
    throw new Error('Product Tour Launcher Label must remain Explore June AI.');
  }
  if (settings['Mutation Policy'] !== 'DENY') {
    throw new Error('Product Tour Mutation Policy must remain DENY.');
  }
}

function validateCases(cases) {
  const expectedIds = Array.from(
    { length: 12 },
    (_unused, index) => 'PT-' + String(index + 1).padStart(3, '0'),
  );
  const actualIds = cases.map((item) => item.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error('Product Tour Excel cases must be PT-001 through PT-012 in order.');
  }
  cases.forEach((item, index) => {
    if (item.sequence !== index + 1) {
      throw new Error(item.id + ' has an invalid Sequence.');
    }
    if (!item.title || !item.expectedResult) {
      throw new Error(item.id + ' must include Title and Expected Result.');
    }
    if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
      throw new Error(item.id + ' Test Data JSON must be an object.');
    }
  });

  const entries = new Set([
    'Platform Overview', 'Agents', 'Tools', 'Connectors',
    'Knowledge', 'Guardrails', 'UI components', 'Inbox',
  ]);
  for (const item of cases.slice(0, 8)) {
    if (!entries.has(item.data.tourEntry)) {
      throw new Error(item.id + ' has an unsupported tourEntry.');
    }
    for (const key of ['expectedStartPath', 'expectedFinalPath']) {
      if (typeof item.data[key] !== 'string' || !item.data[key].startsWith('/')) {
        throw new Error(item.id + ' must include ' + key + '.');
      }
    }
    if (!Array.isArray(item.data.steps) || item.data.steps.length < 2) {
      throw new Error(item.id + ' must include at least two ordered steps.');
    }
  }
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const value = cellText(sheet.getRow(1), columnNumber);
    if (value) result.set(value, columnNumber);
  });
  return result;
}

function requireHeaders(headers, required, sheetName) {
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    throw new Error(sheetName + ' is missing columns: ' + missing.join(', '));
  }
}

function cellText(row, columnNumber, trim = true) {
  const value = row.getCell(columnNumber).text ?? '';
  return trim ? value.trim() : value;
}

function parseExecute(value, id) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'YES') return true;
  if (normalized === 'NO') return false;
  throw new Error(id + ' Execute must be YES or NO.');
}
