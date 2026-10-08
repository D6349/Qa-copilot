import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.AGENTS_DATA_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'agents-data-driven.xlsx'),
);
const force = process.argv.includes('--force');

if (fs.existsSync(outputFile) && !force) {
  throw new Error(
    'The Agents Excel input already exists and was not overwritten: '
    + outputFile
    + '. Use "npm.cmd run data:agents:reset" only when a reset is intended.',
  );
}

const tabs = [
  'Information',
  'Instructions',
  'Tools',
  'Connectors',
  'Swarm',
  'Knowledge',
  'Guardrail',
  'UI Component',
  'Access',
];
const settings = [
  ['Base URL', 'https://junedev.ledgers.cloud', 'Informational dev fallback only. TARGET_ENV and config/environments.json control the runtime origin.'],
  ['Time Zone', 'Asia/Kolkata', 'Time zone used in generated run names, evidence and Excel results.'],
  ['Agent Name Pattern', 'QA Agent {{RUN_COMPACT}}', 'Unique synthetic Agent created by this run.'],
  ['Updated Agent Name Pattern', 'QA Agent Updated {{UPDATE_COMPACT}}', 'Unique Agent name after update.'],
  ['Draft Name Pattern', 'QA Agent Draft {{RUN_COMPACT}}', 'Unsaved Agent name used by validation and security cases.'],
  ['Created Description Pattern', 'Created by Playwright on {{RUN_DISPLAY}}.', 'Description used during creation. Maximum live length is 1000 characters.'],
  ['Updated Description Pattern', 'Updated by Playwright on {{UPDATE_DISPLAY}}.', 'Description used during update. Maximum live length is 1000 characters.'],
  ['Initial Prompt Pattern', 'Handle the synthetic QA request created on {{RUN_DISPLAY}}.', 'Initial prompt used during creation. Maximum live length is 100 characters.'],
  ['Updated Initial Prompt Pattern', 'Handle the updated synthetic QA request at {{UPDATE_DISPLAY}}.', 'Initial prompt used during update. Maximum live length is 100 characters.'],
  ['Instructions Pattern', 'Follow the synthetic QA instructions created on {{RUN_DISPLAY}}. Do not access production data.', 'Agent instructions used during creation.'],
  ['Updated Instructions Pattern', 'Follow the updated synthetic QA instructions from {{UPDATE_DISPLAY}}. Do not access production data.', 'Agent instructions used during update.'],
  ['Model', 'GPT o3-mini', 'Recorded model used for creation and update.'],
  ['Country', 'India', 'Recorded country used for creation and update.'],
  ['XSS Marker', '<img src=x onerror="window.__qaAgentsXss=1">', 'Harmless execution marker used only in unsaved drafts.'],
  ['SQL Injection Marker', "' OR '1'='1' --", 'Synthetic injection-shaped search value.'],
  ['Synthetic Secret Prefix', 'qa-agent-synthetic-secret', 'Never replace this with a real credential.'],
];

const caseData = {
  'AF-001': {},
  'AF-002': {},
  'AF-003': {
    scopes: ['All', 'My Agents', 'Public Agents', 'Shared Agents'],
  },
  'AF-004': {
    sortOptions: ['Ascending', 'Descending', 'Last Modified'],
  },
  'AF-005': {
    chatDraft: 'Hello',
    chatSearch: 's',
    exchangeSearchPlaceholder: 'Search exchange agents...',
  },
  'AF-006': {
    tabs,
    requiredFields: ['Name', 'Model', 'Description', 'Initial Prompt'],
    nameMaxLength: 100,
    descriptionMaxLength: 1000,
    initialPromptMaxLength: 100,
  },
  'AF-007': {
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
    providers: ['OpenAI', 'Claude', 'Grok', 'Bedrock'],
    openAiModels: [
      'GPT 4o',
      'GPT 4o mini',
      'GPT o1',
      'GPT o3',
      'GPT o3-mini',
      'GPT o4-mini',
    ],
  },
  'AF-008': {
    name: '',
    description: '{{CREATED_DESCRIPTION}}',
    initialPrompt: '{{INITIAL_PROMPT}}',
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
  },
  'AF-009': {
    name: '{{DRAFT_NAME}}',
    description: '',
    initialPrompt: '{{INITIAL_PROMPT}}',
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
  },
  'AF-010': {
    whitespaceName: '   ',
    whitespaceDescription: '   ',
    whitespaceInitialPrompt: '   ',
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
  },
  'AF-011': {
    maxLength: 100,
    boundaryCharacter: 'n',
    overflowCharacter: 'x',
  },
  'AF-012': {
    maxLength: 1000,
    boundaryCharacter: 'd',
    overflowCharacter: 'x',
  },
  'AF-013': {
    maxLength: 100,
    boundaryCharacter: 'p',
    overflowCharacter: 'x',
  },
  'AF-014': {
    initialPrompt: '{{INITIAL_PROMPT}}',
    instructions: '{{INSTRUCTIONS}}',
  },
  'AF-015': {
    resourceTabs: [
      'Tools',
      'Connectors',
      'Swarm',
      'Knowledge',
      'Guardrail',
      'UI Component',
    ],
    resourceSearch: 'qa-resource-does-not-exist',
  },
  'AF-016': {
    accessModes: ['User', 'Public'],
    userTab: 'User',
    publicTab: 'Public',
    accessSearch: 'qa-employee-does-not-exist@example.invalid',
    selectedUsersText: 'Selected Users (0)',
  },
  'AF-017': {},
  'AF-018': {
    xssPayload: '{{XSS_MARKER}}',
    draftFields: ['Name', 'Description', 'Initial Prompt', 'Instructions'],
  },
  'AF-019': {
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
    initialPrompt: '{{INITIAL_PROMPT}}',
    instructions: '{{INSTRUCTIONS}}',
    accessMode: 'User',
    createButton: 'Create',
  },
  'AF-020': {
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
    accessMode: 'User',
  },
  'AF-021': {
    invalidEdits: [
      {
        label: 'name is empty',
        name: '',
        description: '{{CREATED_DESCRIPTION}}',
        initialPrompt: '{{INITIAL_PROMPT}}',
      },
      {
        label: 'description is empty',
        name: '{{AGENT_NAME}}',
        description: '',
        initialPrompt: '{{INITIAL_PROMPT}}',
      },
      {
        label: 'initial prompt is empty',
        name: '{{AGENT_NAME}}',
        description: '{{CREATED_DESCRIPTION}}',
        initialPrompt: '',
      },
      {
        label: 'required text is whitespace only',
        name: '   ',
        description: '   ',
        initialPrompt: '   ',
      },
    ],
    updateButton: 'Update',
  },
  'AF-022': {
    updatedInitialPrompt: '{{UPDATED_INITIAL_PROMPT}}',
    updatedInstructions: '{{UPDATED_INSTRUCTIONS}}',
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
    updateButton: 'Update',
  },
  'AF-023': {
    model: '{{MODEL}}',
    country: '{{COUNTRY}}',
    accessMode: 'User',
  },
  'AF-024': {
    expectedMenuItems: ['Edit Agent', 'Delete'],
  },
  'AF-025': {
    searchPayloads: [
      '{{SQL_INJECTION_MARKER}}',
      '{"$ne":null}',
      '{{XSS_MARKER}}',
    ],
  },
  'AF-026': {
    secretValue: '{{SYNTHETIC_SECRET_PREFIX}}-{{RUN_COMPACT}}',
  },
  'AF-027': {
    accessSearch: '{{SQL_INJECTION_MARKER}}',
    selectedUsersText: 'Selected Users (0)',
  },
  'AF-028': {
    requiredHeaders: ['strict-transport-security', 'content-security-policy'],
    frameHeaders: ['content-security-policy', 'x-frame-options'],
    contentTypeOptions: 'nosniff',
  },
  'AF-029': {
    agentsPath: '/agents',
    searchPlaceholder: 'Search agents...',
    createButton: 'Create Agent',
  },
  'AF-030': {
    cancelButton: 'Cancel',
    deleteButton: 'Delete',
  },
};

const catalog = readAgentCatalog();
const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.subject = 'Excel-driven Playwright input for the June Agents module';

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

function readAgentCatalog() {
  const catalogPath = path.join(
    suiteRoot,
    'test-cases',
    'agent-flow-cases.ts',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');
  const pattern = /id:\s*'(AF-\d{3})',[\s\S]*?title:\s*'([^']+)',[\s\S]*?expectedResult:\s*'([^']+)',/g;
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
      'Expected 30 Agents catalog cases; found ' + rows.length + '.',
    );
  }
  return rows;
}

function addInstructions(workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.columns = [{ width: 30 }, { width: 112 }];
  [
    ['Purpose', 'This is the input workbook. Playwright reads Settings and Agents Test Data before it runs.'],
    ['Run all cases', 'From D:/qa-copilot run: npm.cmd run test:agents:excel'],
    ['Run in visible Chrome', 'From D:/qa-copilot run: npm.cmd run test:agents:excel:headed'],
    ['Record again', 'From D:/qa-copilot run: npm.cmd run record:agents'],
    ['Execution control', 'Set Execute to YES or NO. AF-019 through AF-024 and AF-030 must remain YES because they form the create, verify, edit, update and delete-cleanup chain.'],
    ['Test data', 'Edit Test Data JSON with valid JSON only. Tokens such as {{RUN_COMPACT}} are resolved at run time.'],
    ['Live limits', 'Agent Name accepts 100 characters, Description accepts 1000, and Initial Prompt accepts 100. Boundary cases verify the next character is rejected.'],
    ['Common values', 'Edit Settings for names, descriptions, prompts, instructions, model, country and synthetic security markers.'],
    ['Results', 'Execution results are written to test-results/<environment>/excel/agent-flow-<environment>-latest.xlsx.'],
    ['Safety', 'Creation, update and AF-030 deletion target only the timestamped synthetic Agent created by this run.'],
  ].forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function addSettings(workbook, rows) {
  const sheet = workbook.addWorksheet('Settings');
  sheet.columns = [
    { header: 'Key', key: 'key', width: 40 },
    { header: 'Value', key: 'value', width: 92 },
    { header: 'Description', key: 'description', width: 68 },
  ];
  rows.forEach(([key, value, description]) => {
    sheet.addRow({ key, value, description });
  });
  styleTable(sheet);
}

function addTestData(workbook, catalogRows, dataById) {
  const sheet = workbook.addWorksheet('Agents Test Data');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Title', key: 'title', width: 54 },
    { header: 'Expected Result', key: 'expectedResult', width: 74 },
    { header: 'Test Data JSON', key: 'data', width: 98 },
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
