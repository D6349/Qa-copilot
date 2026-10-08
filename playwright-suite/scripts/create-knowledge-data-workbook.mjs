import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.KNOWLEDGE_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'knowledge-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The Knowledge Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:knowledge:reset" only when a reset is intended.',
  );
}

const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in run names, evidence and Excel results.'],
  ['Knowledge Provider', 'Chroma', 'Provider used to initialize the synthetic run Knowledge Base. Allowed values are Chroma and Qdrant.'],
  ['Knowledge Name Pattern', 'QA Knowledge {{RUN_COMPACT}}', 'Unique Knowledge Base created by this run.'],
  ['Updated Knowledge Name Pattern', 'QA Knowledge Updated {{RUN_COMPACT}}', 'Unique name used by the update flow.'],
  ['Draft Name Pattern', 'QA Knowledge Draft {{RUN_COMPACT}}', 'Unsaved name used by validation and cancellation cases.'],
  ['Index Name Pattern', 'qa-knowledge-index-{{RUN_COMPACT}}', 'Unique kebab-case connected provider index name used by the lifecycle flow.'],
  ['Created Description Pattern', 'Approved synthetic Knowledge Base initialized for run {{RUN_COMPACT}}.', 'Synthetic description using only UI-supported characters.'],
  ['Updated Description Pattern', 'Approved synthetic Knowledge Base updated for run {{RUN_COMPACT}}.', 'Synthetic update description using only UI-supported characters.'],
  ['Embedding Model', 'Embedding Small', 'Recorded embedding selection used for initialization.'],
  ['Nonexistent Employee Search', 'qa-knowledge-{{RUN_COMPACT}}@example.invalid', 'Reserved invalid-domain address that must not select a real employee.'],
  ['XSS Marker', '<img src=x onerror="window.__qaKnowledgeXss=1">', 'Harmless marker used only in an unsaved description.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped Access search value.'],
  ['Synthetic Secret Prefix', 'qa-knowledge-synthetic-secret', 'Synthetic placeholder only; never replace it with a credential.'],
  ['Write Opt-In Environment Variable', 'KNOWLEDGE_ALLOW_WRITES', 'Must equal true before a test may initialize, upload or update Knowledge data.'],
  ['Delete Opt-In Environment Variable', 'KNOWLEDGE_ALLOW_DELETE', 'Must equal true in addition to the write opt-in before KB-030 may confirm deletion.'],
  ['Qdrant API Key Environment Variable', 'KNOWLEDGE_QDRANT_API_KEY', 'Environment variable name only; its secret value is never stored in Excel.'],
  ['Qdrant Endpoint Environment Variable', 'KNOWLEDGE_QDRANT_ENDPOINT', 'Environment variable name only; the endpoint value is never stored in Excel.'],
  ['Chroma API Key Environment Variable', 'KNOWLEDGE_CHROMA_API_KEY', 'Environment variable name only; its secret value is never stored in Excel.'],
  ['Chroma Tenant Environment Variable', 'KNOWLEDGE_CHROMA_TENANT', 'Environment variable name only; the tenant value is never stored in Excel.'],
  ['Chroma Database Environment Variable', 'KNOWLEDGE_CHROMA_DATABASE', 'Environment variable name only; the database value is never stored in Excel.'],
  ['Chroma Alternate Database Environment Variable', 'KNOWLEDGE_CHROMA_ALTERNATE_DATABASE', 'Second approved synthetic database used only to verify collection reset behavior.'],
  ['Chroma Collection Environment Variable', 'KNOWLEDGE_CHROMA_COLLECTION', 'Environment variable name only; the collection value is never stored in Excel.'],
];

const qdrantEnvironmentVariables = {
  apiKey: 'KNOWLEDGE_QDRANT_API_KEY',
  endpoint: 'KNOWLEDGE_QDRANT_ENDPOINT',
};
const chromaEnvironmentVariables = {
  apiKey: 'KNOWLEDGE_CHROMA_API_KEY',
  tenant: 'KNOWLEDGE_CHROMA_TENANT',
  database: 'KNOWLEDGE_CHROMA_DATABASE',
  collection: 'KNOWLEDGE_CHROMA_COLLECTION',
};
const chromaDependencyEnvironmentVariables = {
  ...chromaEnvironmentVariables,
  alternateDatabase: 'KNOWLEDGE_CHROMA_ALTERNATE_DATABASE',
};
const writeSafety = {
  requiresWriteOptIn: true,
  writeOptInEnvironmentVariable: 'KNOWLEDGE_ALLOW_WRITES',
};

const caseData = {
  'KB-001': {
    knowledgePath: '/knowledge-base',
    heading: 'Knowledge Base',
    createButton: 'Knowledge Base',
    searchPlaceholder: 'Search knowledge',
  },
  'KB-002': {},
  'KB-003': {
    provider: 'Qdrant',
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
    masked: true,
  },
  'KB-004': {
    invalidConnections: [
      { label: 'all values empty', apiKey: '', endpoint: '' },
      { label: 'API key missing', apiKey: '', endpoint: 'https://qdrant.example.test:6333' },
      { label: 'endpoint missing', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: '' },
      { label: 'malformed endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'not-a-url' },
      { label: 'insecure endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'http://qdrant.example.test:6333' },
      { label: 'script endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'javascript:alert(1)' },
      { label: 'local file endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'file:///etc/passwd' },
      { label: 'credential-bearing endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'https://embedded-userinfo@qdrant.example.test:6333' },
      { label: 'localhost endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'https://127.0.0.1:6333' },
      { label: 'private endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'https://10.0.0.1:6333' },
      { label: 'link-local endpoint', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', endpoint: 'https://169.254.169.254/latest/meta-data/' },
    ],
  },
  'KB-005': {
    provider: 'Qdrant',
    environmentVariables: qdrantEnvironmentVariables,
    requiresExternalProvider: true,
    redactEvidence: true,
  },
  'KB-006': {
    provider: 'Chroma',
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
    masked: true,
  },
  'KB-007': {
    invalidConnections: [
      { label: 'all values empty', apiKey: '', tenant: '' },
      { label: 'API key missing', apiKey: '', tenant: 'qa-synthetic-tenant' },
      { label: 'tenant missing', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', tenant: '' },
      { label: 'whitespace API key', apiKey: '   ', tenant: 'qa-synthetic-tenant' },
      { label: 'whitespace tenant', apiKey: '{{SYNTHETIC_SECRET_PREFIX}}', tenant: '   ' },
    ],
  },
  'KB-008': {
    environmentVariables: chromaDependencyEnvironmentVariables,
    requiresExternalProvider: true,
  },
  'KB-009': {
    provider: 'Chroma',
    environmentVariables: chromaEnvironmentVariables,
    requiresExternalProvider: true,
    redactEvidence: true,
  },
  'KB-010': {
    invalidNames: ['', '   ', '\t\r\n'],
    validName: '{{DRAFT_NAME}}',
  },
  'KB-011': {
    providerOptions: ['Qdrant', 'Chroma', 'Pinecone'],
    selectedProvider: 'Chroma',
  },
  'KB-012': {
    embeddingModels: ['Embedding Small', 'Embedding Large'],
    finalModel: '{{EMBEDDING_MODEL}}',
  },
  'KB-013': {
    draftProvider: 'Chroma',
    draftEmbeddingModel: 'Embedding Large',
    providerPlaceholder: 'Select provider',
    embeddingPlaceholder: 'Select embedding model',
  },
  'KB-014': {
    xssPayload: '{{XSS_MARKER}}',
  },
  'KB-015': {
    missingPrerequisites: [
      'provider verification',
      'Knowledge Base name',
      'connected provider index configuration',
    ],
    provider: '{{KNOWLEDGE_PROVIDER}}',
  },
  'KB-016': {
    provider: '{{KNOWLEDGE_PROVIDER}}',
    name: '{{KNOWLEDGE_NAME}}',
    indexName: '{{INDEX_NAME}}',
    embeddingModel: '{{EMBEDDING_MODEL}}',
    description: '{{CREATED_DESCRIPTION}}',
    ...writeSafety,
  },
  'KB-017': {
    expectedName: '{{KNOWLEDGE_NAME}}',
    expectedProvider: '{{KNOWLEDGE_PROVIDER}}',
    expectedDescription: '{{CREATED_DESCRIPTION}}',
  },
  'KB-018': {
    tabName: 'Documents',
    fileInputSelector: 'input[type="file"]',
  },
  'KB-019': {
    maximumUploadBytes: 5242880,
    invalidUploads: [
      {
        label: 'executable extension',
        name: 'knowledge-unsafe-{{RUN_COMPACT}}.exe',
        mimeType: 'application/x-msdownload',
        body: 'Synthetic non-executable QA text.',
      },
      {
        label: 'zero-byte document',
        name: 'knowledge-empty-{{RUN_COMPACT}}.txt',
        mimeType: 'text/plain',
        body: '',
      },
      {
        label: 'mismatched extension and content type',
        name: 'knowledge-mismatch-{{RUN_COMPACT}}.docx',
        mimeType: 'text/html',
        body: '<p>Synthetic mismatched QA content</p>',
      },
      {
        label: 'over-limit text document',
        name: 'knowledge-oversize-{{RUN_COMPACT}}.txt',
        mimeType: 'text/plain',
        sizeBytes: 5242881,
      },
    ],
  },
  'KB-020': {
    document: {
      name: 'knowledge-test-{{RUN_COMPACT}}.txt',
      mimeType: 'text/plain',
      body: 'Approved synthetic Knowledge document generated at {{RUN_ISO}}. No customer or production data.',
    },
    ...writeSafety,
  },
  'KB-021': {
    expectedDocumentName: 'knowledge-test-{{RUN_COMPACT}}.txt',
    approvedOriginOnly: true,
  },
  'KB-022': {
    employeeSearch: '{{NONEXISTENT_EMPLOYEE_SEARCH}}',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'KB-023': {
    accessSearchPayloads: [
      '{{SQL_INJECTION_MARKER}}',
      '{"$ne":null}',
      '{{XSS_MARKER}}',
    ],
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'KB-024': {
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
    updateButton: 'Update',
    ...writeSafety,
  },
  'KB-025': {
    expectedMenuItems: ['Edit', 'Delete'],
  },
  'KB-026': {
    invalidEdits: [
      { label: 'name is empty', name: '' },
      { label: 'name is whitespace only', name: '   ' },
    ],
    updateButton: 'Update',
  },
  'KB-027': {
    updatedName: '{{UPDATED_KNOWLEDGE_NAME}}',
    updatedDescription: '{{UPDATED_DESCRIPTION}}',
    ...writeSafety,
  },
  'KB-028': {
    expectedName: '{{UPDATED_KNOWLEDGE_NAME}}',
    expectedDescription: '{{UPDATED_DESCRIPTION}}',
    expectedProvider: '{{KNOWLEDGE_PROVIDER}}',
    expectedIndexName: '{{INDEX_NAME}}',
    expectedEmbeddingModel: '{{EMBEDDING_MODEL}}',
    expectedDocumentName: 'knowledge-test-{{RUN_COMPACT}}.txt',
    selectedUsersText: 'Selected Users (0)',
    ownerText: 'Owner',
  },
  'KB-029': {
    cancelButton: 'Cancel',
    deleteButton: 'Delete',
  },
  'KB-030': {
    deleteButton: 'Delete',
    ...writeSafety,
    requiresDeleteOptIn: true,
    deleteOptInEnvironmentVariable: 'KNOWLEDGE_ALLOW_DELETE',
    destructive: true,
  },
};

const catalog = readKnowledgeCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June Knowledge Base module';

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
  credentialValuesStored: false,
  guardedWriteCases: catalog.filter((item) => (
    caseData[item.id]?.requiresWriteOptIn === true
  )).map((item) => item.id),
  guardedDeleteCases: catalog.filter((item) => (
    caseData[item.id]?.requiresDeleteOptIn === true
  )).map((item) => item.id),
}, null, 2));

function readKnowledgeCatalog() {
  const catalogPath = path.join(
    suiteRoot,
    'test-cases',
    'knowledge-flow-cases.ts',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(KB-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
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
      'Expected 30 Knowledge catalog cases; found ' + rows.length + '.',
    );
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 32 }, { width: 116 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and Knowledge Test Data before it runs.'],
    ['Run all cases', 'From the Playwright suite root run: npm.cmd run test:knowledge:excel'],
    ['Run in visible Chrome', 'From the Playwright suite root run: npm.cmd run test:knowledge:excel:headed'],
    ['Record again', 'From the Playwright suite root run: npm.cmd run record:knowledge'],
    ['Execution control', 'Set Execute to YES or NO. KB-016 through KB-030 form the initialize, document, Access, update and cleanup chain and must remain enabled together.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} resolve at run time.'],
    ['Provider credentials', 'Never enter API keys, endpoints, tenants, databases or collections in this workbook. Provider cases contain environment variable names only.'],
    ['Write opt-in', 'KB-016, KB-020, KB-024 and KB-027 require KNOWLEDGE_ALLOW_WRITES=true before they may persist approved synthetic data.'],
    ['Delete opt-in', 'KB-030 additionally requires KNOWLEDGE_ALLOW_DELETE=true and verifies the exact unique run name before confirming deletion.'],
    ['Results', 'Execution results are written to test-results/<environment>/excel/knowledge-flow-<environment>-latest.xlsx.'],
    ['Safety', 'Use only approved provider test resources and synthetic content. Evidence must redact credential values and local paths.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 42 },
    { header: 'Value', key: 'value', width: 86 },
    { header: 'Description', key: 'description', width: 78 },
  ];
  rows.forEach(([key, value, description]) => {
    sheet.addRow({ key, value, description });
  });
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById) {
  const sheet = workbook.addWorksheet('Knowledge Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 56 },
    { header: 'Expected Result', key: 'expectedResult', width: 76 },
    { header: 'Test Data JSON', key: 'data', width: 104 },
    { header: 'Notes', key: 'notes', width: 44 },
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
