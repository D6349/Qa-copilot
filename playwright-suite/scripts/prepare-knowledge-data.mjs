import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEnvironmentArtifactPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const SAFE_SYNTHETIC_SECRET_PREFIX = 'qa-knowledge-synthetic-secret';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const sourceWorkbook = path.resolve(
  process.env.KNOWLEDGE_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'knowledge-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.KNOWLEDGE_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(
      suiteRoot,
      'runtime',
      'knowledge-data.json',
    ),
);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Knowledge Excel input workbook is missing: ' + sourceWorkbook
    + '. Run "npm.cmd run data:knowledge:init" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);

const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Knowledge Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain "Settings" and '
    + '"Knowledge Test Data" sheets.',
  );
}

const settings = readSettings(settingsSheet);
settings['Base URL'] = resolveEnvironmentProfile().baseURL;
const cases = readCases(dataSheet);
validateSettings(settings);
validateCases(cases, settings);

const payload = {
  sourceWorkbook,
  sourceModifiedMs: Math.trunc(fs.statSync(sourceWorkbook).mtimeMs),
  preparedAt: new Date().toISOString(),
  settings,
  cases,
};

if (!checkOnly) {
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(
    runtimeFile,
    JSON.stringify(payload, null, 2) + '\n',
    'utf8',
  );
}

const writeCaseIds = guardedCaseIds(cases, 'requiresWriteOptIn');
const deleteCaseIds = guardedCaseIds(cases, 'requiresDeleteOptIn');
console.log(JSON.stringify({
  ok: true,
  mode: checkOnly ? 'check' : 'prepare',
  sourceWorkbook,
  runtimeFile: checkOnly ? null : runtimeFile,
  totalCases: cases.length,
  enabledCases: cases.filter((item) => item.execute).length,
  disabledCases: cases.filter((item) => !item.execute).length,
  credentialValuesStored: false,
  writeCaseIds,
  deleteCaseIds,
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
    const rawJson = cellText(
      row,
      headers.get('Test Data JSON'),
      false,
    ) || '{}';
    let data;
    try {
      data = JSON.parse(rawJson);
    } catch (error) {
      throw new Error(
        id + ' has invalid Test Data JSON at Excel row ' + rowNumber
        + ': ' + error.message,
      );
    }
    if (!isRecord(data)) {
      throw new Error(id + ' Test Data JSON must be an object.');
    }
    result.push({
      sequence: Number(cellText(row, headers.get('Sequence'))),
      execute: parseExecute(cellText(row, headers.get('Execute')), id),
      id,
      title: cellText(row, headers.get('Title')),
      expectedResult: cellText(
        row,
        headers.get('Expected Result'),
        false,
      ),
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
    'Knowledge Provider',
    'Knowledge Name Pattern',
    'Updated Knowledge Name Pattern',
    'Draft Name Pattern',
    'Index Name Pattern',
    'Created Description Pattern',
    'Updated Description Pattern',
    'Embedding Model',
    'Nonexistent Employee Search',
    'XSS Marker',
    'SQL Injection Marker',
    'Synthetic Secret Prefix',
    'Write Opt-In Environment Variable',
    'Delete Opt-In Environment Variable',
    'Qdrant API Key Environment Variable',
    'Qdrant Endpoint Environment Variable',
    'Chroma API Key Environment Variable',
    'Chroma Tenant Environment Variable',
    'Chroma Database Environment Variable',
    'Chroma Alternate Database Environment Variable',
    'Chroma Collection Environment Variable',
  ];
  for (const key of required) {
    if (!settings[key]) {
      throw new Error('Required Settings value is missing: ' + key);
    }
  }

  if (!['Chroma', 'Qdrant'].includes(settings['Knowledge Provider'])) {
    throw new Error('Knowledge Provider must be Chroma or Qdrant.');
  }
  if (!['Embedding Small', 'Embedding Large'].includes(
    settings['Embedding Model'],
  )) {
    throw new Error(
      'Embedding Model must be Embedding Small or Embedding Large.',
    );
  }
  if (
    settings['Synthetic Secret Prefix']
    !== SAFE_SYNTHETIC_SECRET_PREFIX
  ) {
    throw new Error(
      'Synthetic Secret Prefix must remain the approved synthetic placeholder '
      + SAFE_SYNTHETIC_SECRET_PREFIX + '; never store a credential there.',
    );
  }

  const environmentVariableSettings = [
    'Write Opt-In Environment Variable',
    'Delete Opt-In Environment Variable',
    'Qdrant API Key Environment Variable',
    'Qdrant Endpoint Environment Variable',
    'Chroma API Key Environment Variable',
    'Chroma Tenant Environment Variable',
    'Chroma Database Environment Variable',
    'Chroma Alternate Database Environment Variable',
    'Chroma Collection Environment Variable',
  ];
  for (const key of environmentVariableSettings) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(settings[key])) {
      throw new Error(
        key + ' must contain an environment variable name, not its value.',
      );
    }
  }
}

function validateCases(cases, settings) {
  const expectedIds = Array.from(
    { length: 30 },
    (_value, index) => 'KB-' + String(index + 1).padStart(3, '0'),
  );
  if (cases.length !== expectedIds.length) {
    throw new Error(
      'Knowledge Test Data must contain exactly 30 rows; found '
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
    if (seen.has(item.id)) {
      throw new Error('Duplicate Test Case ID: ' + item.id);
    }
    if (!item.title) throw new Error(item.id + ' has an empty Title.');
    seen.add(item.id);
  });

  validateDependentChain(cases);
  validateWriteSafety(cases, settings);
  validateProviderReferences(cases, settings);
  validateUploadBoundary(cases);
  validateNoEmbeddedCredentials(cases);
}

function validateDependentChain(cases) {
  const chainIds = Array.from(
    { length: 15 },
    (_value, index) => 'KB-' + String(index + 16).padStart(3, '0'),
  );
  const enabled = chainIds.filter(
    (id) => cases.find((item) => item.id === id)?.execute,
  );
  if (enabled.length !== 0 && enabled.length !== chainIds.length) {
    throw new Error(
      'KB-016 through KB-030 must be enabled or disabled together because '
      + 'they form the initialize, document, Access, update and cleanup chain.',
    );
  }
}

function validateWriteSafety(cases, settings) {
  const writeCaseIds = ['KB-016', 'KB-020', 'KB-024', 'KB-027', 'KB-030'];
  for (const id of writeCaseIds) {
    const data = requireCaseData(cases, id);
    if (data.requiresWriteOptIn !== true) {
      throw new Error(id + ' must require explicit Knowledge write opt-in.');
    }
    if (
      data.writeOptInEnvironmentVariable
      !== settings['Write Opt-In Environment Variable']
    ) {
      throw new Error(
        id + ' write opt-in environment variable must match Settings.',
      );
    }
  }

  const deleteData = requireCaseData(cases, 'KB-030');
  if (deleteData.requiresDeleteOptIn !== true || deleteData.destructive !== true) {
    throw new Error(
      'KB-030 must retain both the destructive and delete opt-in flags.',
    );
  }
  if (
    deleteData.deleteOptInEnvironmentVariable
    !== settings['Delete Opt-In Environment Variable']
  ) {
    throw new Error(
      'KB-030 delete opt-in environment variable must match Settings.',
    );
  }
}

function validateProviderReferences(cases, settings) {
  const qdrantExpected = {
    apiKey: settings['Qdrant API Key Environment Variable'],
    endpoint: settings['Qdrant Endpoint Environment Variable'],
  };
  const chromaExpected = {
    apiKey: settings['Chroma API Key Environment Variable'],
    tenant: settings['Chroma Tenant Environment Variable'],
    database: settings['Chroma Database Environment Variable'],
    collection: settings['Chroma Collection Environment Variable'],
  };
  const chromaDependencyExpected = {
    ...chromaExpected,
    alternateDatabase:
      settings['Chroma Alternate Database Environment Variable'],
  };
  validateEnvironmentMap(
    requireCaseData(cases, 'KB-005').environmentVariables,
    qdrantExpected,
    'KB-005',
  );
  validateEnvironmentMap(
    requireCaseData(cases, 'KB-008').environmentVariables,
    chromaDependencyExpected,
    'KB-008',
  );
  validateEnvironmentMap(
    requireCaseData(cases, 'KB-009').environmentVariables,
    chromaExpected,
    'KB-009',
  );
  for (const id of ['KB-005', 'KB-008', 'KB-009']) {
    const data = requireCaseData(cases, id);
    if (data.requiresExternalProvider !== true) {
      throw new Error(
        id + ' must retain the external-provider safety flag.',
      );
    }
  }
  for (const id of ['KB-005', 'KB-009']) {
    if (requireCaseData(cases, id).redactEvidence !== true) {
      throw new Error(id + ' must retain the evidence-redaction safety flag.');
    }
  }
}

function validateUploadBoundary(cases) {
  const data = requireCaseData(cases, 'KB-019');
  if (!Number.isInteger(data.maximumUploadBytes) || data.maximumUploadBytes < 1) {
    throw new Error('KB-019 maximumUploadBytes must be a positive integer.');
  }
  const overLimit = Array.isArray(data.invalidUploads)
    && data.invalidUploads.some((item) => (
      isRecord(item)
      && Number.isInteger(item.sizeBytes)
      && item.sizeBytes > data.maximumUploadBytes
    ));
  if (!overLimit) {
    throw new Error('KB-019 must include an in-memory over-limit upload.');
  }
}

function validateNoEmbeddedCredentials(cases) {
  for (const item of cases) {
    visit(item.data, item.id + '.data');
  }

  function visit(value, location) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, location + '[' + index + ']'));
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, item] of Object.entries(value)) {
      const itemLocation = location + '.' + key;
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        typeof item === 'string'
        && ['apikey', 'password', 'credential', 'accesstoken', 'secretvalue']
          .includes(normalizedKey)
      ) {
        const trimmed = item.trim();
        const safeReference = trimmed === ''
          || trimmed.includes('{{SYNTHETIC_SECRET_PREFIX}}')
          || /^[A-Z][A-Z0-9_]+$/.test(trimmed);
        if (!safeReference) {
          throw new Error(
            itemLocation
            + ' must contain an environment-variable name or synthetic token, '
            + 'never a credential value.',
          );
        }
      }
      visit(item, itemLocation);
    }
  }
}

function validateEnvironmentMap(actual, expected, caseId) {
  if (!isRecord(actual)) {
    throw new Error(
      caseId + ' must reference provider values by environment variable name.',
    );
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      caseId + ' provider environment-variable keys are invalid.',
    );
  }
  for (const [key, expectedName] of Object.entries(expected)) {
    if (actual[key] !== expectedName || !/^[A-Z][A-Z0-9_]+$/.test(actual[key])) {
      throw new Error(
        caseId + ' ' + key
        + ' must contain the configured environment variable name, not a value.',
      );
    }
  }
}

function requireCaseData(cases, id) {
  const item = cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error('Missing Knowledge Excel case: ' + id);
  if (!isRecord(item.data)) {
    throw new Error(id + ' Test Data JSON must be an object.');
  }
  return item.data;
}

function guardedCaseIds(cases, flag) {
  return cases
    .filter((item) => isRecord(item.data) && item.data[flag] === true)
    .map((item) => item.id);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
