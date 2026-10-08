import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.TOOLS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'tools-data-driven.xlsx'),
);
const force = process.argv.includes('--force');
const sync = process.argv.includes('--sync');

if (force && sync) {
  throw new Error('Use either --force or --sync, not both.');
}

if (fs.existsSync(outputFile) && !force && !sync) {
  throw new Error(
    'The Excel input already exists and was not overwritten: ' + outputFile
    + '. Use --sync to add catalog cases while preserving workbook inputs, '
    + 'or use "npm.cmd run data:tools:reset" only when a reset is intended.',
  );
}

const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in generated test names and evidence.'],
  ['Tool Name Pattern', 'QA Tool {{RUN_COMPACT}}', 'Unique created tool name.'],
  ['Draft Name Pattern', 'QA Draft {{RUN_COMPACT}}', 'Unsaved draft name used by validation cases.'],
  ['Created Purpose Pattern', 'Created by Playwright on {{RUN_DISPLAY}}.', 'Purpose used during creation.'],
  ['Created Keywords', 'qa, playwright, create', 'Keywords used during creation.'],
  ['Endpoint', 'https://june.com/qa-tools', 'Valid default endpoint.'],
  ['Valid Header JSON', JSON.stringify({ 'Content-Type': 'application/json' }, null, 2), 'Valid default header JSON.'],
  ['Created Payload JSON', JSON.stringify({ flow: 'tools', operation: 'create', createdAt: '{{RUN_ISO}}' }, null, 2), 'Payload used during creation.'],
  ['Update Purpose Pattern', 'Updated by Playwright on {{UPDATE_DISPLAY}}.', 'Purpose used during update.'],
  ['Update Keywords', 'qa, playwright, update', 'Keywords used during update.'],
  ['Update Payload JSON', JSON.stringify({ flow: 'tools', operation: 'update', updatedAt: '{{UPDATE_ISO}}' }, null, 2), 'Payload used during update.'],
  ['Default Method', 'GET', 'Default method used by valid API setup.'],
  ['Default Payload Format', 'JSON', 'Default payload format used by valid API setup.'],
  ['XSS Marker', '<img src=x onerror="window.__qaToolsXss=1">', 'Synthetic XSS marker; never use a real secret.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped search value.'],
];

const matrixMethods = ['GET', 'POST', 'PUT', 'DELETE'];
const matrixPayloadTypes = ['JSON', 'XML', 'Form Data', 'Parameters'];
const matrixContexts = ['myAccount', 'subscribedBusiness'];
const matrixCaseData = createMatrixCaseData();
const accessLifecycleLabels = {
  createButton: 'Create Tool',
  updateButton: 'Update Tool',
  deleteMenuItem: 'Delete',
  deleteDialogTitle: 'Delete Tool',
  deleteButton: 'Delete',
};

const caseData = {
  'TL-001': {},
  'TL-002': {
    scopes: ['My Tools', 'Shared Tools', 'All'],
    dateFilters: ['Today', 'Yesterday', 'Past 7 days', 'Last Month'],
    viewIndexes: [1, 0],
  },
  'TL-003': {
    invalidInformation: [
      { label: 'all fields empty', name: '', purpose: '', keywords: '' },
      { label: 'name missing', name: '', purpose: '{{CREATED_PURPOSE}}', keywords: '{{CREATED_KEYWORDS}}' },
      { label: 'purpose missing', name: '{{DRAFT_NAME}}', purpose: '', keywords: '{{CREATED_KEYWORDS}}' },
      { label: 'keywords missing', name: '{{DRAFT_NAME}}', purpose: '{{CREATED_PURPOSE}}', keywords: '' },
      { label: 'whitespace only', name: '   ', purpose: '   ', keywords: '   ' },
    ],
  },
  'TL-004': {
    maximumLength: 300,
    boundaryCharacter: 'k',
    overflowCharacter: 'x',
  },
  'TL-005': {
    invalidEndpoints: ['', '   ', 'not-a-valid-url'],
  },
  'TL-006': {
    invalidHeaderJson: '{invalid header',
  },
  'TL-007': {
    invalidPayloadJson: '{invalid payload',
  },
  'TL-008': {
    invalidSchemaJson: '{invalid schema',
  },
  'TL-009': {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    payloadFormats: ['JSON', 'XML', 'Form Data', 'Parameters'],
    finalPayloadFormat: 'JSON',
  },
  'TL-010': {
    employeeSearch: 's',
  },
  'TL-011': {
    contexts: ['myAccount', 'subscribedBusiness'],
    createButton: 'Create Tool',
  },
  'TL-012': {
    contexts: ['myAccount', 'subscribedBusiness'],
  },
  'TL-013': {
    contexts: ['myAccount', 'subscribedBusiness'],
    invalidEdits: [
      { label: 'name missing', name: '', purpose: '{{CREATED_PURPOSE}}', keywords: '{{CREATED_KEYWORDS}}' },
      { label: 'purpose missing', name: '{{TOOL_NAME}}', purpose: '', keywords: '{{CREATED_KEYWORDS}}' },
      { label: 'keywords missing', name: '{{TOOL_NAME}}', purpose: '{{CREATED_PURPOSE}}', keywords: '' },
    ],
  },
  'TL-014': {
    contexts: ['myAccount', 'subscribedBusiness'],
    updateButton: 'Update Tool',
    method: 'POST',
    payloadFormat: 'JSON',
  },
  'TL-015': {
    contexts: ['myAccount', 'subscribedBusiness'],
    expectedMethod: 'POST',
    expectedPayloadFormat: 'JSON',
  },
  'TL-016': {
    endpoints: [
      'https://api.example.com/v1/tools',
      'https://api.example.com:443/v1/tools?run={{RUN_COMPACT}}',
    ],
  },
  'TL-017': {
    nestedPayload: {
      customer: { id: 'QA-{{RUN_COMPACT}}', active: true, score: 98.5 },
      items: [
        { sku: 'TOOLS-1', quantity: 2 },
        { sku: 'TOOLS-2', quantity: 1 },
      ],
      metadata: { runAt: '{{RUN_ISO}}', nullable: null },
    },
  },
  'TL-018': {},
  'TL-019': {
    unsafeEndpoints: [
      'http://example.com/api',
      'javascript:alert(1)',
      'data:text/plain,qa-security',
      'file:///etc/passwd',
      '//example.com/api',
      'https://qa-user:qa-password@example.com/api',
    ],
  },
  'TL-020': {
    internalEndpoints: [
      'http://127.0.0.1/admin',
      'http://localhost/internal',
      'http://10.0.0.1/private',
      'http://169.254.169.254/latest/meta-data/',
    ],
  },
  'TL-021': {
    header: { 'X-QA-Header': 'safe\r\nX-Injected: true' },
  },
  'TL-022': {
    prototypePayload: '{\n  "__proto__": { "polluted": "yes" },\n  "constructor": { "prototype": { "polluted": "yes" } }\n}',
  },
  'TL-023': {
    securityNamePrefix: 'QA Security XSS',
  },
  'TL-024': {
    searchPayloads: ['{{SQL_INJECTION_MARKER}}', '{"$ne":null}', '{{XSS_MARKER}}'],
  },
  'TL-025': {
    secretPrefix: 'qa_secret_',
    purposePrefix: 'Purpose contains ',
    keywords: 'qa, security',
    authorizationPrefix: 'Bearer ',
  },
  'TL-026': {
    accessSearchPayload: '{{SQL_INJECTION_MARKER}}',
  },
  'TL-027': {
    expectedMethods: ['DELETE', 'GET', 'POST', 'PUT'],
    forbiddenMethods: ['TRACE', 'CONNECT'],
    expectedPayloadFormats: ['Form Data', 'JSON', 'Parameters', 'XML'],
  },
  'TL-028': {
    requiredHeaders: ['strict-transport-security', 'referrer-policy', 'permissions-policy'],
    contentTypeOptions: 'nosniff',
  },
  'TL-029': {
    toolsPath: '/tools',
    searchPlaceholder: 'Search tools...',
    createButton: 'Create Tool',
  },
  'TL-030': {
    accessSearchPayload: '{{SQL_INJECTION_MARKER}}',
  },
  ...matrixCaseData,
  'TL-047': {
    contexts: ['myAccount', 'subscribedBusiness'],
    authenticationOption: 'No Authentication',
    ...accessLifecycleLabels,
  },
  'TL-048': {
    context: 'subscribedBusiness',
    companyAccessLabel: 'Company Access',
    companyAccessStates: [true, false],
    companyMemberVisibleWhenEnabled: true,
    companyMemberHiddenWhenDisabled: true,
    ...accessLifecycleLabels,
  },
  'TL-049': {
    context: 'subscribedBusiness',
    employeeDirectoryPath: '/api/admin-settings/get_employee_details/',
    employeeCandidateLimit: 10,
    permissions: ['Can Edit', 'Can View'],
    expectedSelectedCount: 2,
    assignedUserVisible: true,
    unassignedCompanyMemberHidden: true,
    ...accessLifecycleLabels,
  },
};

const catalog = readToolCatalog();
const existing = sync && fs.existsSync(outputFile)
  ? await readExistingInput(outputFile)
  : { settings: new Map(), cases: new Map(), extraCaseColumns: [] };
const knownIds = new Set(catalog.map((item) => item.id));
const unknownCaseIds = [...existing.cases.keys()]
  .filter((id) => !knownIds.has(id));
if (unknownCaseIds.length > 0) {
  throw new Error(
    'Tools workbook contains unknown case(s); sync stopped without writing: '
    + unknownCaseIds.join(', '),
  );
}
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June Tools module';

addInstructions(workbook);
addSettings(workbook, mergeSettings(settings, existing.settings));
addTestData(
  workbook,
  catalog,
  caseData,
  existing.cases,
  existing.extraCaseColumns,
);

await writeWorkbookAtomically(workbook, outputFile);
console.log(JSON.stringify({
  ok: true,
  outputFile,
  cases: catalog.length,
  execute: 'YES',
  mode: sync ? 'sync' : force ? 'force' : 'create',
}, null, 2));

function readToolCatalog() {
  const catalogPath = path.join(suiteRoot, 'test-cases', 'agent-flow-cases.ts');
  const source = fs.readFileSync(catalogPath, 'utf8');
  const start = source.indexOf('export const TOOL_FLOW_CASES');
  const end = source.indexOf('export const FLOW_CASES', start);
  if (start < 0 || end < 0) throw new Error('Unable to find TOOL_FLOW_CASES.');
  const section = source.slice(start, end);
  const pattern = /id:\s*'(TL-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(section)) !== null) {
    rows.push({ id: match[1], title: match[2], expectedResult: match[3] });
  }
  if (rows.length !== 49) {
    throw new Error('Expected 49 Tools catalog cases; found ' + rows.length + '.');
  }
  const expectedIds = Array.from(
    { length: 49 },
    (_value, index) => 'TL-' + String(index + 1).padStart(3, '0'),
  );
  rows.forEach((item, index) => {
    if (item.id !== expectedIds[index]) {
      throw new Error(
        'Expected Tools catalog case ' + expectedIds[index]
        + ' at sequence ' + (index + 1) + '; found ' + item.id + '.',
      );
    }
  });
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 28 }, { width: 110 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and Tools Test Data before it runs.'],
    ['Run all cases', 'From D:\\qa-copilot run: npm.cmd run test:tools:excel'],
    ['Run in visible Chrome', 'From D:\\qa-copilot run: npm.cmd run test:tools:excel:headed'],
    ['Workbook synchronization', 'Run node scripts/create-tools-data-workbook.mjs --sync after catalog changes. Existing Settings entries plus case Execute, Test Data JSON, Notes and additional manual columns are preserved by Test Case ID.'],
    ['Execution control', 'Set Execute to YES or NO. TL-011 through TL-015 must remain YES because they form the create/edit/update chain. TL-031 through TL-046 are the independent CRUD matrix; TL-047 through TL-049 cover Access persistence and cross-login authorization.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} are resolved at run time.'],
    ['Common values', 'Edit Settings for the URL, names, purpose, keywords, endpoint, headers and create/update payloads.'],
    ['Account contexts', 'Lifecycle, matrix and Access cases use My Account and/or the subscribed business through account-data-driven.xlsx; the Tools workbook stores only context keys and no employee PII.'],
    ['Results', 'Execution results are written separately to test-results\\excel\\tools-flow-latest.xlsx.'],
    ['Safety', 'Use only synthetic secrets and an approved QA business. Matrix creation, update and delete are real writes.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 32 },
    { header: 'Value', key: 'value', width: 80 },
    { header: 'Description', key: 'description', width: 62 },
  ];
  rows.forEach(([key, value, description]) => sheet.addRow({ key, value, description }));
  styleTable(sheet);
}

function addTestData(
  workbook,
  catalogRows,
  dataById,
  existingRows,
  extraCaseColumns,
) {
  const sheet = workbook.addWorksheet('Tools Test Data');
  const standardColumns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 48 },
    { header: 'Expected Result', key: 'expectedResult', width: 68 },
    { header: 'Test Data JSON', key: 'data', width: 90 },
    { header: 'Notes', key: 'notes', width: 42 },
  ];
  const manualColumns = extraCaseColumns.map((column, index) => ({
    header: column.header,
    key: 'manual_' + index,
    width: column.width,
  }));
  sheet.columns = [...standardColumns, ...manualColumns];

  catalogRows.forEach((item, index) => {
    const existing = existingRows.get(item.id);
    const rowData = {
      sequence: index + 1,
      execute: existing ? existing.execute : 'YES',
      id: item.id,
      title: item.title,
      expectedResult: item.expectedResult,
      data: existing
        ? migrateCaseData(item.id, existing.data, dataById[item.id] || {})
        : JSON.stringify(dataById[item.id] || {}, null, 2),
      notes: existing ? existing.notes : '',
    };
    manualColumns.forEach((column) => {
      rowData[column.key] = existing?.manualValues.get(column.header) ?? '';
    });
    sheet.addRow(rowData);
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

function migrateCaseData(id, existingData, defaultData) {
  if (!['TL-048', 'TL-049'].includes(id)) return existingData;
  let parsed;
  try {
    parsed = JSON.parse(existingData);
  } catch {
    return existingData;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return existingData;
  }

  let changed = false;
  let preserved = { ...parsed };
  if (id === 'TL-049' && Object.hasOwn(preserved, 'employeeSearches')) {
    const { employeeSearches: _legacySearches, ...withoutLegacy } = preserved;
    preserved = withoutLegacy;
    preserved.employeeDirectoryPath = defaultData.employeeDirectoryPath;
    preserved.employeeCandidateLimit = defaultData.employeeCandidateLimit;
    changed = true;
  }

  const requiredKeys = id === 'TL-048'
    ? ['companyMemberVisibleWhenEnabled', 'companyMemberHiddenWhenDisabled']
    : ['assignedUserVisible', 'unassignedCompanyMemberHidden'];
  for (const key of requiredKeys) {
    if (!Object.hasOwn(preserved, key)) {
      preserved[key] = defaultData[key];
      changed = true;
    }
  }
  return changed ? JSON.stringify(preserved, null, 2) : existingData;
}

async function readExistingInput(filePath) {
  const existingWorkbook = new ExcelJS.Workbook();
  await existingWorkbook.xlsx.readFile(filePath);
  const settingsSheet = existingWorkbook.getWorksheet('Settings');
  const dataSheet = existingWorkbook.getWorksheet('Tools Test Data');
  if (!settingsSheet || !dataSheet) {
    throw new Error(
      'Cannot sync: existing workbook needs Settings and Tools Test Data sheets.',
    );
  }

  const settingsHeaders = headerMap(settingsSheet);
  requireHeaders(
    settingsHeaders,
    ['Key', 'Value', 'Description'],
    settingsSheet.name,
  );
  const existingSettings = new Map();
  for (let rowNumber = 2; rowNumber <= settingsSheet.rowCount; rowNumber += 1) {
    const row = settingsSheet.getRow(rowNumber);
    const key = cellText(row, settingsHeaders.get('Key'));
    if (!key) continue;
    if (existingSettings.has(key)) {
      throw new Error('Cannot sync duplicate Tools setting: ' + key);
    }
    existingSettings.set(key, {
      value: cellText(row, settingsHeaders.get('Value'), false),
      description: cellText(
        row,
        settingsHeaders.get('Description'),
        false,
      ),
    });
  }

  const dataHeaders = headerMap(dataSheet);
  const standardHeaders = [
    'Sequence',
    'Execute',
    'Test Case ID',
    'Title',
    'Expected Result',
    'Test Data JSON',
    'Notes',
  ];
  requireHeaders(dataHeaders, standardHeaders, dataSheet.name);
  const standardHeaderSet = new Set(standardHeaders);
  const extraCaseColumns = [];
  dataSheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = cell.text.trim();
    if (!header || standardHeaderSet.has(header)) return;
    extraCaseColumns.push({
      header,
      columnNumber,
      width: dataSheet.getColumn(columnNumber).width || 20,
    });
  });

  const existingCases = new Map();
  for (let rowNumber = 2; rowNumber <= dataSheet.rowCount; rowNumber += 1) {
    const row = dataSheet.getRow(rowNumber);
    const id = cellText(row, dataHeaders.get('Test Case ID')).toUpperCase();
    if (!id) continue;
    if (existingCases.has(id)) {
      throw new Error('Cannot sync duplicate Tools case: ' + id);
    }
    existingCases.set(id, {
      execute: cellText(row, dataHeaders.get('Execute'), false) || 'YES',
      data: cellText(row, dataHeaders.get('Test Data JSON'), false),
      notes: cellText(row, dataHeaders.get('Notes'), false),
      manualValues: new Map(extraCaseColumns.map((column) => [
        column.header,
        copyCellValue(row.getCell(column.columnNumber).value),
      ])),
    });
  }

  return {
    settings: existingSettings,
    cases: existingCases,
    extraCaseColumns,
  };
}

function mergeSettings(defaultRows, existingSettings) {
  const merged = defaultRows.map(([key, value, description]) => [
    key,
    existingSettings.get(key)?.value ?? value,
    description,
  ]);
  const knownKeys = new Set(defaultRows.map(([key]) => key));
  for (const [key, item] of existingSettings) {
    if (!knownKeys.has(key)) {
      merged.push([key, item.value, item.description]);
    }
  }
  return merged;
}

async function writeWorkbookAtomically(workbook, filePath) {
  const directory = path.dirname(filePath);
  const temporaryFile = path.join(
    directory,
    '.' + path.basename(filePath) + '.'
      + process.pid + '.' + Date.now() + '.tmp.xlsx',
  );
  fs.mkdirSync(directory, { recursive: true });
  try {
    await workbook.xlsx.writeFile(temporaryFile);
    try {
      fs.renameSync(temporaryFile, filePath);
    } catch (error) {
      throw new Error(
        'Could not atomically replace the Tools workbook. '
        + 'The existing workbook was left unchanged; close it in Excel and retry. '
        + error.message,
      );
    }
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = cell.text.trim();
    if (!header) return;
    if (result.has(header)) {
      throw new Error(
        'Cannot sync duplicate column "' + header + '" in ' + sheet.name + '.',
      );
    }
    result.set(header, columnNumber);
  });
  return result;
}

function requireHeaders(headers, required, sheetName) {
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    throw new Error(
      'Cannot sync: ' + sheetName + ' is missing column(s): '
      + missing.join(', '),
    );
  }
}

function cellText(row, columnNumber, trim = true) {
  const text = columnNumber ? row.getCell(columnNumber).text : '';
  return trim ? text.trim() : text;
}

function copyCellValue(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copyCellValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyCellValue(item)]),
    );
  }
  return value;
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
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };
  }
}

function createMatrixCaseData() {
  const result = {};
  let sequence = 31;

  for (const method of matrixMethods) {
    for (const payloadType of matrixPayloadTypes) {
      const id = 'TL-' + String(sequence).padStart(3, '0');
      result[id] = {
        contexts: [...matrixContexts],
        method,
        payloadType,
        createButton: 'Create Tool',
        updateButton: 'Update Tool',
        deleteMenuItem: 'Delete',
        deleteDialogTitle: 'Delete Tool',
        deleteButton: 'Delete',
        createPayload: formatMatrixPayload(
          id,
          method,
          payloadType,
          'create',
          '{{RUN_ISO}}',
        ),
        updatePayload: formatMatrixPayload(
          id,
          method,
          payloadType,
          'update',
          '{{UPDATE_ISO}}',
        ),
      };
      sequence += 1;
    }
  }
  return result;
}

function formatMatrixPayload(
  matrixCaseId,
  method,
  payloadType,
  operation,
  timestamp,
) {
  const timestampKey = operation === 'create' ? 'createdAt' : 'updatedAt';
  const fields = {
    matrixCaseId,
    flow: 'tools',
    operation,
    method,
    payloadType,
    [timestampKey]: timestamp,
  };

  if (payloadType === 'JSON') {
    return JSON.stringify(fields, null, 2);
  }

  if (payloadType === 'XML') {
    return [
      '<toolRequest>',
      ...Object.entries(fields).map(
        ([key, value]) => '  <' + key + '>' + value + '</' + key + '>',
      ),
      '</toolRequest>',
    ].join('\n');
  }

  // Form Data and Parameters are entered through the UI's Bulk Edit mode.
  return Object.entries(fields)
    .map(([key, value]) => key + ':' + value)
    .join('\n');
}
