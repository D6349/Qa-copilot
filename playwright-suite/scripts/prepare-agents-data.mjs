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
  process.env.AGENTS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'agents-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.AGENTS_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(suiteRoot, 'runtime', 'agents-data.json'),
);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Agents Excel input workbook is missing: ' + sourceWorkbook
    + '. Run "npm.cmd run data:agents:init" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);

const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Agents Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain "Settings" and "Agents Test Data" sheets.',
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
    'Agent Name Pattern',
    'Updated Agent Name Pattern',
    'Draft Name Pattern',
    'Created Description Pattern',
    'Updated Description Pattern',
    'Initial Prompt Pattern',
    'Updated Initial Prompt Pattern',
    'Instructions Pattern',
    'Updated Instructions Pattern',
    'Model',
    'Country',
    'XSS Marker',
    'SQL Injection Marker',
    'Synthetic Secret Prefix',
  ];
  for (const key of required) {
    if (!settings[key]) {
      throw new Error('Required Settings value is missing: ' + key);
    }
  }

  const allowedModels = [
    'GPT 4o',
    'GPT 4o mini',
    'GPT o1',
    'GPT o3',
    'GPT o3-mini',
    'GPT o4-mini',
  ];
  if (!allowedModels.includes(settings.Model)) {
    throw new Error(
      'Model must be one of the recorded OpenAI models: '
      + allowedModels.join(', ') + '.',
    );
  }
}

function validateCases(cases) {
  const expectedIds = Array.from(
    { length: 30 },
    (_value, index) => 'AF-' + String(index + 1).padStart(3, '0'),
  );
  if (cases.length !== expectedIds.length) {
    throw new Error(
      'Agents Test Data must contain exactly 30 rows; found '
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
    seen.add(item.id);
  });

  const dataFor = (id) => cases.find((item) => item.id === id)?.data || {};
  const formInventory = dataFor('AF-006');
  if (
    formInventory.nameMaxLength !== 100
    || formInventory.descriptionMaxLength !== 1000
    || formInventory.initialPromptMaxLength !== 100
  ) {
    throw new Error(
      'AF-006 must retain the live Agent limits: Name 100, '
      + 'Description 1000 and Initial Prompt 100.',
    );
  }
  for (const [id, expected] of [
    ['AF-011', 100],
    ['AF-012', 1000],
    ['AF-013', 100],
  ]) {
    if (dataFor(id).maxLength !== expected) {
      throw new Error(id + ' maxLength must be ' + expected + '.');
    }
  }

  const requiredChain = [
    'AF-019',
    'AF-020',
    'AF-021',
    'AF-022',
    'AF-023',
    'AF-024',
    'AF-030',
  ];
  for (const requiredId of requiredChain) {
    if (!cases.find((item) => item.id === requiredId)?.execute) {
      throw new Error(
        requiredId
        + ' cannot be disabled because the create, verify, edit, update and '
        + 'delete-cleanup chain must run.',
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
