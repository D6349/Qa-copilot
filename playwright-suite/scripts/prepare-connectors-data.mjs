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
  process.env.CONNECTORS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'connectors-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.CONNECTORS_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(
      suiteRoot,
      'runtime',
      'connectors-data.json',
    ),
);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Connectors Excel input workbook is missing: ' + sourceWorkbook
    + '. Run "npm.cmd run data:connectors:init" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);

const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Connectors Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain "Settings" and "Connectors Test Data" sheets.',
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
    'Time Zone',
    'Connector Name Pattern',
    'Updated Connector Name Pattern',
    'Draft Name Pattern',
    'Created Description Pattern',
    'Updated Description Pattern',
    'Server URL Pattern',
    'Updated Server URL Pattern',
    'Config JSON',
    'Country',
    'XSS Marker',
    'SQL Injection Marker',
    'Synthetic Secret Prefix',
  ];
  for (const key of required) {
    if (!settings[key]) throw new Error('Required Settings value is missing: ' + key);
  }
  try {
    JSON.parse(settings['Config JSON']);
  } catch (error) {
    throw new Error('Config JSON is not valid JSON: ' + error.message);
  }
  if (!['India', 'USA', 'UAE'].includes(settings.Country)) {
    throw new Error('Country must be India, USA or UAE.');
  }
}

function validateCases(cases) {
  const expectedIds = Array.from(
    { length: 24 },
    (_value, index) => 'CN-' + String(index + 1).padStart(3, '0'),
  );
  if (cases.length !== expectedIds.length) {
    throw new Error(
      'Connectors Test Data must contain exactly 24 rows; found ' + cases.length + '.',
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
    seen.add(item.id);
  });

  const requiredChain = [
    'CN-011', 'CN-012', 'CN-013', 'CN-014',
    'CN-015', 'CN-016', 'CN-017', 'CN-024',
  ];
  for (const requiredId of requiredChain) {
    if (!cases.find((item) => item.id === requiredId)?.execute) {
      throw new Error(
        requiredId
        + ' cannot be disabled because the create/edit/update/safe-delete chain must run.',
      );
    }
  }
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
    throw new Error(sheetName + ' is missing column(s): ' + missing.join(', '));
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
  throw new Error(id + ' Execute must be YES or NO; found "' + value + '".');
}
