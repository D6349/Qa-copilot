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
  process.env.TOOLS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'tools-data-driven.xlsx'),
);
const runtimeFile = path.resolve(
  process.env.TOOLS_DATA_RUNTIME_FILE
    || resolveEnvironmentArtifactPath(suiteRoot, 'runtime', 'tools-data.json'),
);
const checkOnly = process.argv.includes('--check');
const matrixMethods = ['GET', 'POST', 'PUT', 'DELETE'];
const matrixPayloadTypes = ['JSON', 'XML', 'Form Data', 'Parameters'];
const matrixContexts = ['myAccount', 'subscribedBusiness'];
const expectedMatrix = matrixMethods.flatMap((method) => (
  matrixPayloadTypes.map((payloadType) => ({ method, payloadType }))
));

if (!fs.existsSync(sourceWorkbook)) {
  throw new Error(
    'Tools Excel input workbook is missing: ' + sourceWorkbook
    + '. Run "npm.cmd run data:tools:init" first.',
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourceWorkbook);

const settingsSheet = workbook.getWorksheet('Settings');
const dataSheet = workbook.getWorksheet('Tools Test Data');
if (!settingsSheet || !dataSheet) {
  throw new Error(
    'The input workbook must contain "Settings" and "Tools Test Data" sheets.',
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
    'Tool Name Pattern',
    'Draft Name Pattern',
    'Created Purpose Pattern',
    'Created Keywords',
    'Endpoint',
    'Valid Header JSON',
    'Created Payload JSON',
    'Update Purpose Pattern',
    'Update Keywords',
    'Update Payload JSON',
    'Default Method',
    'Default Payload Format',
    'XSS Marker',
    'SQL Injection Marker',
  ];
  for (const key of required) {
    if (!settings[key]) throw new Error('Required Settings value is missing: ' + key);
  }

  for (const key of ['Valid Header JSON', 'Created Payload JSON', 'Update Payload JSON']) {
    try {
      JSON.parse(settings[key]);
    } catch (error) {
      throw new Error(key + ' is not valid JSON: ' + error.message);
    }
  }
}

function validateCases(cases) {
  const expectedIds = Array.from(
    { length: 49 },
    (_value, index) => 'TL-' + String(index + 1).padStart(3, '0'),
  );
  if (cases.length !== expectedIds.length) {
    throw new Error(
      'Tools Test Data must contain exactly 49 rows; found ' + cases.length + '.',
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

  for (const requiredWriteId of ['TL-011', 'TL-012', 'TL-013', 'TL-014', 'TL-015']) {
    if (!cases.find((item) => item.id === requiredWriteId)?.execute) {
      throw new Error(
        requiredWriteId
        + ' cannot be disabled because the create/edit/update chain must always run.',
      );
    }
  }

  const expectedContexts = ['myAccount', 'subscribedBusiness'];
  for (const lifecycleId of ['TL-011', 'TL-012', 'TL-013', 'TL-014', 'TL-015']) {
    const lifecycleCase = cases.find((item) => item.id === lifecycleId);
    const contexts = lifecycleCase?.data?.contexts;
    if (
      !Array.isArray(contexts)
      || contexts.length !== expectedContexts.length
      || contexts.some((value, index) => value !== expectedContexts[index])
    ) {
      throw new Error(
        lifecycleId + ' Test Data JSON contexts must be exactly '
        + JSON.stringify(expectedContexts) + '.',
      );
    }
  }

  const createCase = cases.find((item) => item.id === 'TL-011');
  if (createCase?.data?.createButton !== 'Create Tool') {
    throw new Error('TL-011 createButton must be "Create Tool".');
  }
  const updateCase = cases.find((item) => item.id === 'TL-014');
  if (updateCase?.data?.updateButton !== 'Update Tool') {
    throw new Error('TL-014 updateButton must be "Update Tool".');
  }

  validateMethodPayloadMatrix(cases);
  validateAccessControlCases(cases);
}

function validateMethodPayloadMatrix(cases) {
  const matrixCases = cases.filter((item) => {
    const numericId = Number(item.id.slice(3));
    return numericId >= 31 && numericId <= 46;
  });
  if (matrixCases.length !== expectedMatrix.length) {
    throw new Error(
      'Tools method-by-payload matrix must contain exactly 16 cases '
      + '(TL-031 through TL-046); found ' + matrixCases.length + '.',
    );
  }

  const seenCombinations = new Set();
  matrixCases.forEach((item, index) => {
    const expected = expectedMatrix[index];
    const data = item.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(item.id + ' Test Data JSON must be an object.');
    }

    validateExactContexts(item.id, data.contexts);
    if (data.method !== expected.method) {
      throw new Error(
        item.id + ' method must be "' + expected.method
        + '"; found "' + String(data.method) + '".',
      );
    }
    if (data.payloadType !== expected.payloadType) {
      throw new Error(
        item.id + ' payloadType must be "' + expected.payloadType
        + '"; found "' + String(data.payloadType) + '".',
      );
    }

    const combination = data.method + '|' + data.payloadType;
    if (seenCombinations.has(combination)) {
      throw new Error('Duplicate Tools matrix combination: ' + combination + '.');
    }
    seenCombinations.add(combination);

    validateExactLabel(item.id, data, 'createButton', 'Create Tool');
    validateExactLabel(item.id, data, 'updateButton', 'Update Tool');
    validateExactLabel(item.id, data, 'deleteMenuItem', 'Delete');
    validateExactLabel(item.id, data, 'deleteDialogTitle', 'Delete Tool');
    validateExactLabel(item.id, data, 'deleteButton', 'Delete');
    validateMatrixPayload(
      item.id,
      data.createPayload,
      data.method,
      data.payloadType,
      'create',
      '{{RUN_ISO}}',
    );
    validateMatrixPayload(
      item.id,
      data.updatePayload,
      data.method,
      data.payloadType,
      'update',
      '{{UPDATE_ISO}}',
    );
  });

  const expectedCombinations = new Set(
    expectedMatrix.map(({ method, payloadType }) => method + '|' + payloadType),
  );
  if (
    seenCombinations.size !== expectedCombinations.size
    || [...expectedCombinations].some((value) => !seenCombinations.has(value))
  ) {
    throw new Error(
      'Tools matrix must contain each GET/POST/PUT/DELETE by '
      + 'JSON/XML/Form Data/Parameters combination exactly once.',
    );
  }
}

function validateExactContexts(id, contexts) {
  if (
    !Array.isArray(contexts)
    || contexts.length !== matrixContexts.length
    || contexts.some((value, index) => value !== matrixContexts[index])
  ) {
    throw new Error(
      id + ' Test Data JSON contexts must be exactly '
      + JSON.stringify(matrixContexts) + '.',
    );
  }
}

function validateExactLabel(id, data, key, expected) {
  if (data[key] !== expected) {
    throw new Error(
      id + ' ' + key + ' must be "' + expected
      + '"; found "' + String(data[key]) + '".',
    );
  }
}

function validateMatrixPayload(
  id,
  rawPayload,
  method,
  payloadType,
  operation,
  timestamp,
) {
  if (typeof rawPayload !== 'string' || rawPayload.trim() === '') {
    throw new Error(id + ' ' + operation + 'Payload must be a non-empty string.');
  }

  const timestampKey = operation === 'create' ? 'createdAt' : 'updatedAt';
  const expectedFields = {
    matrixCaseId: id,
    flow: 'tools',
    operation,
    method,
    payloadType,
    [timestampKey]: timestamp,
  };

  if (payloadType === 'JSON') {
    let parsed;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (error) {
      throw new Error(
        id + ' ' + operation + 'Payload must be valid JSON: ' + error.message,
      );
    }
    validatePayloadFields(id, operation, parsed, expectedFields, 'JSON');
    return;
  }

  if (payloadType === 'XML') {
    if (
      !rawPayload.trim().startsWith('<toolRequest>')
      || !rawPayload.trim().endsWith('</toolRequest>')
    ) {
      throw new Error(
        id + ' ' + operation
        + 'Payload XML must use a single <toolRequest> root element.',
      );
    }
    for (const [key, value] of Object.entries(expectedFields)) {
      const element = '<' + key + '>' + value + '</' + key + '>';
      if (!rawPayload.includes(element)) {
        throw new Error(
          id + ' ' + operation + 'Payload XML is missing ' + element + '.',
        );
      }
    }
    return;
  }

  const parsedBulkEdit = {};
  for (const line of rawPayload.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator < 1) {
      throw new Error(
        id + ' ' + operation
        + 'Payload Bulk Edit line must use key:value syntax: "' + line + '".',
      );
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key in parsedBulkEdit) {
      throw new Error(
        id + ' ' + operation + 'Payload has duplicate Bulk Edit key: ' + key + '.',
      );
    }
    parsedBulkEdit[key] = value;
  }
  validatePayloadFields(
    id,
    operation,
    parsedBulkEdit,
    expectedFields,
    'Bulk Edit',
  );
}

function validatePayloadFields(id, operation, actual, expected, format) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    throw new Error(id + ' ' + operation + 'Payload ' + format + ' must be an object.');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        id + ' ' + operation + 'Payload ' + format + ' field "' + key
        + '" must be "' + value + '"; found "' + String(actual[key]) + '".',
      );
    }
  }
}

function validateAccessControlCases(cases) {
  const noAuthentication = requireCaseData(cases, 'TL-047');
  validateExactContexts('TL-047', noAuthentication.contexts);
  if (noAuthentication.authenticationOption !== 'No Authentication') {
    throw new Error(
      'TL-047 authenticationOption must be "No Authentication".',
    );
  }
  validateAccessLifecycleLabels('TL-047', noAuthentication);

  const companyAccess = requireCaseData(cases, 'TL-048');
  if (companyAccess.context !== 'subscribedBusiness') {
    throw new Error('TL-048 context must be "subscribedBusiness".');
  }
  if (companyAccess.companyAccessLabel !== 'Company Access') {
    throw new Error('TL-048 companyAccessLabel must be "Company Access".');
  }
  if (
    !Array.isArray(companyAccess.companyAccessStates)
    || companyAccess.companyAccessStates.length !== 2
    || companyAccess.companyAccessStates[0] !== true
    || companyAccess.companyAccessStates[1] !== false
  ) {
    throw new Error(
      'TL-048 companyAccessStates must be exactly [true, false].',
    );
  }
  if (companyAccess.companyMemberVisibleWhenEnabled !== true) {
    throw new Error('TL-048 companyMemberVisibleWhenEnabled must be true.');
  }
  if (companyAccess.companyMemberHiddenWhenDisabled !== true) {
    throw new Error('TL-048 companyMemberHiddenWhenDisabled must be true.');
  }
  validateAccessLifecycleLabels('TL-048', companyAccess);

  const employeeAccess = requireCaseData(cases, 'TL-049');
  if (employeeAccess.context !== 'subscribedBusiness') {
    throw new Error('TL-049 context must be "subscribedBusiness".');
  }
  if (
    employeeAccess.employeeDirectoryPath
      !== '/api/admin-settings/get_employee_details/'
  ) {
    throw new Error(
      'TL-049 employeeDirectoryPath must use the approved relative directory endpoint.',
    );
  }
  if (
    !Number.isInteger(employeeAccess.employeeCandidateLimit)
    || employeeAccess.employeeCandidateLimit < 2
    || employeeAccess.employeeCandidateLimit > 50
  ) {
    throw new Error('TL-049 employeeCandidateLimit must be an integer from 2 to 50.');
  }
  validateTwoDistinctAllowedValues(
    'TL-049',
    'permissions',
    employeeAccess.permissions,
    ['Can Edit', 'Can View'],
  );
  if (employeeAccess.expectedSelectedCount !== 2) {
    throw new Error('TL-049 expectedSelectedCount must be 2.');
  }
  if (employeeAccess.assignedUserVisible !== true) {
    throw new Error('TL-049 assignedUserVisible must be true.');
  }
  if (employeeAccess.unassignedCompanyMemberHidden !== true) {
    throw new Error('TL-049 unassignedCompanyMemberHidden must be true.');
  }
  validateAccessLifecycleLabels('TL-049', employeeAccess);
}

function requireCaseData(cases, id) {
  const data = cases.find((item) => item.id === id)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(id + ' Test Data JSON must be an object.');
  }
  return data;
}

function validateAccessLifecycleLabels(id, data) {
  validateExactLabel(id, data, 'createButton', 'Create Tool');
  validateExactLabel(id, data, 'updateButton', 'Update Tool');
  validateExactLabel(id, data, 'deleteMenuItem', 'Delete');
  validateExactLabel(id, data, 'deleteDialogTitle', 'Delete Tool');
  validateExactLabel(id, data, 'deleteButton', 'Delete');
}

function validateTwoDistinctAllowedValues(id, key, actual, allowed) {
  if (
    !Array.isArray(actual)
    || actual.length !== 2
    || actual.some((value) => !allowed.includes(value))
    || new Set(actual).size !== 2
  ) {
    throw new Error(
      id + ' ' + key + ' must contain two distinct values from '
      + JSON.stringify(allowed) + '.',
    );
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
  const text = columnNumber ? row.getCell(columnNumber).text : '';
  return trim ? text.trim() : text;
}

function parseExecute(value, id) {
  const normalized = value.trim().toUpperCase();
  if (['YES', 'Y', 'TRUE', '1', 'RUN'].includes(normalized)) return true;
  if (['NO', 'N', 'FALSE', '0', 'SKIP'].includes(normalized)) return false;
  throw new Error(
    id + ' Execute must be YES or NO; found "' + value + '".',
  );
}
