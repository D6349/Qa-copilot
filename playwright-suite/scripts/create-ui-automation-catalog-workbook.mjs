import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const outputFile = path.resolve(
  process.env.UI_AUTOMATION_CATALOG_WORKBOOK
    || path.join(suiteRoot, 'test-data', 'ui-automation-test-catalog.xlsx'),
);

const COLORS = {
  navy: 'FF17365D',
  blue: 'FF1F4E78',
  teal: 'FF0F6B78',
  green: 'FF548235',
  orange: 'FFC65911',
  purple: 'FF7030A0',
  white: 'FFFFFFFF',
  border: 'FFD9E2F3',
  paleBlue: 'FFDDEBF7',
  paleGreen: 'FFE2F0D9',
  paleYellow: 'FFFFF2CC',
  paleOrange: 'FFFCE4D6',
  paleRed: 'FFF4CCCC',
  palePurple: 'FFE4DFEC',
  paleGray: 'FFF2F2F2',
};

const CATALOG_HASH_KEYS = [
  'sequence',
  'runFlag',
  'id',
  'productModule',
  'feature',
  'title',
  'description',
  'category',
  'scenarioType',
  'priority',
  'severity',
  'preconditions',
  'steps',
  'expectedResult',
  'testData',
  'writeOperation',
  'securityArea',
  'owaspReference',
  'tags',
  'sourceWorkbook',
  'notes',
];

const catalogPath = path.join(suiteRoot, 'test-cases', 'agent-flow-cases.ts');
const accountCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'account-flow-cases.ts',
);
const connectorCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'connector-flow-cases.ts',
);
const knowledgeCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'knowledge-flow-cases.ts',
);
const guardrailCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'guardrail-flow-cases.ts',
);
const uiComponentCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'ui-component-flow-cases.ts',
);
const productTourCatalogPath = path.join(
  suiteRoot,
  'test-cases',
  'product-tour-flow-cases.ts',
);

const modules = [
  {
    name: 'Account',
    prefix: 'AC-',
    catalogPath: accountCatalogPath,
    exportName: 'ACCOUNT_FLOW_CASES',
    defaultFactory: 'defineAccountCase',
    workbook: path.resolve(
      process.env.ACCOUNT_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'account-data-driven.xlsx'),
    ),
    dataSheet: 'Account Test Data',
  },
  {
    name: 'Agents',
    prefix: 'AF-',
    catalogPath,
    exportName: 'AGENT_FLOW_CASES',
    workbook: path.resolve(
      process.env.AGENTS_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'agents-data-driven.xlsx'),
    ),
    dataSheet: 'Agents Test Data',
  },
  {
    name: 'Tools',
    prefix: 'TL-',
    catalogPath,
    exportName: 'TOOL_FLOW_CASES',
    defaultFactory: 'defineToolCase',
    workbook: path.resolve(
      process.env.TOOLS_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'tools-data-driven.xlsx'),
    ),
    dataSheet: 'Tools Test Data',
  },
  {
    name: 'Connectors',
    prefix: 'CN-',
    catalogPath: connectorCatalogPath,
    exportName: 'CONNECTOR_FLOW_CASES',
    defaultFactory: 'defineConnectorCase',
    workbook: path.resolve(
      process.env.CONNECTORS_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'connectors-data-driven.xlsx'),
    ),
    dataSheet: 'Connectors Test Data',
  },
  {
    name: 'Knowledge',
    prefix: 'KB-',
    catalogPath: knowledgeCatalogPath,
    exportName: 'KNOWLEDGE_FLOW_CASES',
    defaultFactory: 'defineKnowledgeCase',
    workbook: path.resolve(
      process.env.KNOWLEDGE_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'knowledge-data-driven.xlsx'),
    ),
    dataSheet: 'Knowledge Test Data',
  },
  {
    name: 'Guardrails',
    prefix: 'GR-',
    catalogPath: guardrailCatalogPath,
    exportName: 'GUARDRAIL_FLOW_CASES',
    defaultFactory: 'defineGuardrailCase',
    workbook: path.resolve(
      process.env.GUARDRAILS_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'guardrails-data-driven.xlsx'),
    ),
    dataSheet: 'Guardrails Test Data',
  },
  {
    name: 'UI Components',
    prefix: 'UC-',
    catalogPath: uiComponentCatalogPath,
    exportName: 'UI_COMPONENT_FLOW_CASES',
    defaultFactory: 'defineUiComponentCase',
    workbook: path.resolve(
      process.env.UI_COMPONENTS_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'ui-components-data-driven.xlsx'),
    ),
    dataSheet: 'UI Components Test Data',
  },
  {
    name: 'Product Tour',
    prefix: 'PT-',
    catalogPath: productTourCatalogPath,
    exportName: 'PRODUCT_TOUR_FLOW_CASES',
    defaultFactory: 'defineProductTourCase',
    workbook: path.resolve(
      process.env.PRODUCT_TOUR_DATA_WORKBOOK
        || path.join(suiteRoot, 'test-data', 'product-tour-data-driven.xlsx'),
    ),
    dataSheet: 'Product Tour Test Data',
  },
];

const rows = [];
for (const moduleConfig of modules) {
  const catalog = readCatalog(moduleConfig);
  const excelRows = await readInputWorkbook(moduleConfig);
  const catalogIds = new Set(catalog.map((item) => item.id));
  const extraIds = [...excelRows.keys()].filter((id) => !catalogIds.has(id));
  if (extraIds.length > 0) {
    throw new Error(
      `${moduleConfig.name} input contains unknown case(s): ${extraIds.join(', ')}.`,
    );
  }

  for (const item of catalog) {
    const excel = excelRows.get(item.id);
    if (!excel) {
      throw new Error(
        `${item.id} is missing from ${path.basename(moduleConfig.workbook)}.`,
      );
    }
    rows.push({
      sequence: rows.length + 1,
      runFlag: excel.execute,
      id: item.id,
      productModule: moduleConfig.name,
      feature: item.module,
      title: item.title,
      description: item.description,
      category: item.category,
      scenarioType: item.scenarioType,
      priority: item.priority,
      severity: item.severity,
      preconditions: numbered(item.preconditions),
      steps: numbered(item.steps),
      expectedResult: item.expectedResult,
      testData: excel.data,
      writeOperation: item.writeOperation ? 'YES' : 'NO',
      securityArea: item.securityArea || '',
      owaspReference: item.owaspReference || '',
      tags: item.tags.join(', '),
      sourceWorkbook: path.basename(moduleConfig.workbook),
      notes: excel.notes,
    });
  }
}

const workbook = new ExcelJS.Workbook();
const sourceSnapshot = createSourceSnapshot(rows);
workbook.creator = 'QA Copilot Playwright';
workbook.lastModifiedBy = 'QA Copilot Playwright';
workbook.created = new Date();
workbook.modified = new Date();
workbook.subject = 'Forwardable UI automation catalog for all implemented June modules';
workbook.title = 'June UI Automation Test Catalog';
workbook.company = 'Ledgers';
workbook.calcProperties.fullCalcOnLoad = true;
workbook.calcProperties.forceFullCalc = true;
workbook.calcProperties.calcMode = 'auto';

addInstructions(workbook, rows);
addCoverageSummary(workbook, rows);
addTestCases(workbook, rows);
addEnvironmentMatrix(workbook);
addFieldReference(workbook);
sourceSnapshot.workbookHash = createWorkbookContentHash(workbook);
workbook.description = JSON.stringify(sourceSnapshot);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
await workbook.xlsx.writeFile(outputFile);

console.log(JSON.stringify({
  ok: true,
  outputFile,
  sheets: workbook.worksheets.map((sheet) => sheet.name),
  totalCases: rows.length,
  modules: Object.fromEntries(
    modules.map((moduleConfig) => [
      moduleConfig.name,
      rows.filter((row) => row.productModule === moduleConfig.name).length,
    ]),
  ),
  enabledCases: rows.filter((row) => row.runFlag === 'YES').length,
  writeOperations: rows.filter((row) => row.writeOperation === 'YES').length,
}, null, 2));

function readCatalog(config) {
  const source = fs.readFileSync(config.catalogPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    config.catalogPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = findVariableDeclaration(sourceFile, config.exportName);
  const initializer = unwrapExpression(declaration?.initializer);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Unable to read ${config.exportName} from ${config.catalogPath}.`);
  }

  const defaults = config.defaultFactory
    ? readFactoryDefaults(sourceFile, config.defaultFactory)
    : {};

  const result = initializer.elements.map((element) => {
    const unwrapped = unwrapExpression(element);
    const object = ts.isCallExpression(unwrapped)
      ? unwrapExpression(unwrapped.arguments[0])
      : unwrapped;
    if (!object || !ts.isObjectLiteralExpression(object)) {
      throw new Error(`Unsupported case entry in ${config.exportName}.`);
    }
    const explicit = readObjectLiteral(object);
    const item = { ...defaults, ...explicit };
    if (
      config.name === 'Tools'
      && explicit.category === undefined
      && String(item.scenarioType || '').includes('Security')
    ) {
      item.category = 'Security';
    }
    return item;
  });

  if (result.length === 0) throw new Error(`${config.exportName} contains no cases.`);

  const seen = new Set();
  for (const item of result) {
    if (typeof item.id !== 'string' || !item.id.startsWith(config.prefix)) {
      throw new Error(`Invalid case ID in ${config.exportName}: ${String(item.id)}.`);
    }
    if (seen.has(item.id)) throw new Error(`Duplicate catalog case: ${item.id}.`);
    seen.add(item.id);
    for (const field of [
      'module',
      'title',
      'description',
      'category',
      'scenarioType',
      'priority',
      'severity',
      'expectedResult',
    ]) {
      if (typeof item[field] !== 'string' || item[field].trim() === '') {
        throw new Error(`${item.id} is missing catalog field ${field}.`);
      }
    }
    for (const field of ['preconditions', 'steps', 'tags']) {
      if (!Array.isArray(item[field])) {
        throw new Error(`${item.id} catalog field ${field} must be an array.`);
      }
    }
  }
  return result;
}

function readFactoryDefaults(sourceFile, functionName) {
  let factory;
  const findFactory = (node) => {
    if (factory) return;
    if (ts.isFunctionDeclaration(node)
      && node.name?.text === functionName) {
      factory = node;
      return;
    }
    ts.forEachChild(node, findFactory);
  };
  findFactory(sourceFile);
  if (!factory?.body) throw new Error(`Unable to find ${functionName}.`);

  let defaultsObject;
  const findDefaults = (node) => {
    if (defaultsObject) return;
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set(
        node.properties
          .filter((property) => ts.isPropertyAssignment(property))
          .map((property) => propertyName(property.name))
          .filter(Boolean),
      );
      if (keys.has('module') && keys.has('category') && keys.has('priority')) {
        defaultsObject = node;
        return;
      }
    }
    ts.forEachChild(node, findDefaults);
  };
  findDefaults(factory.body);
  if (!defaultsObject) {
    throw new Error(`Unable to read default metadata from ${functionName}.`);
  }
  return readObjectLiteral(defaultsObject);
}

function findVariableDeclaration(sourceFile, variableName) {
  let found;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === variableName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function readObjectLiteral(node) {
  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) continue;
    result[key] = evaluateLiteral(property.initializer);
  }
  return result;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function evaluateLiteral(raw) {
  const node = unwrapExpression(raw);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((item) => evaluateLiteral(item));
  }
  if (ts.isObjectLiteralExpression(node)) return readObjectLiteral(node);
  if (ts.isPrefixUnaryExpression(node)
    && ts.isNumericLiteral(unwrapExpression(node.operand))) {
    const number = Number(unwrapExpression(node.operand).text);
    return node.operator === ts.SyntaxKind.MinusToken ? -number : number;
  }
  throw new Error(`Unsupported catalog value: ${node.getText()}`);
}

function unwrapExpression(raw) {
  let node = raw;
  while (node && (
    ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isParenthesizedExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)
  )) {
    node = node.expression;
  }
  return node;
}

async function readInputWorkbook(config) {
  if (!fs.existsSync(config.workbook)) {
    throw new Error(
      `${config.name} input workbook is missing: ${config.workbook}. `
      + `Run the module's data:init command first.`,
    );
  }
  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(config.workbook);
  const sheet = source.getWorksheet(config.dataSheet);
  if (!sheet) {
    throw new Error(
      `${path.basename(config.workbook)} is missing sheet ${config.dataSheet}.`,
    );
  }
  const headers = headerMap(sheet);
  const required = [
    'Execute',
    'Test Case ID',
    'Test Data JSON',
    'Notes',
  ];
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    throw new Error(
      `${config.dataSheet} is missing column(s): ${missing.join(', ')}.`,
    );
  }

  const result = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const id = cellText(row, headers.get('Test Case ID')).toUpperCase();
    if (!id) continue;
    if (result.has(id)) throw new Error(`Duplicate input case: ${id}.`);
    const execute = normalizeExecute(cellText(row, headers.get('Execute')), id);
    const data = cellText(row, headers.get('Test Data JSON'), false) || '{}';
    try {
      JSON.parse(data);
    } catch (error) {
      throw new Error(`${id} has invalid Test Data JSON: ${error.message}`);
    }
    result.set(id, {
      execute,
      data,
      notes: cellText(row, headers.get('Notes'), false),
    });
  }
  return result;
}

function addInstructions(target, caseRows) {
  const sheet = target.addWorksheet('Instructions', {
    properties: { tabColor: { argb: COLORS.navy } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  sheet.columns = [
    { width: 27 },
    { width: 104 },
    { width: 25 },
  ];
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = 'June UI Automation Test Catalog';
  styleTitle(sheet.getCell('A1'), COLORS.navy, 18);
  sheet.getRow(1).height = 34;
  sheet.mergeCells('A2:C2');
  sheet.getCell('A2').value = 'All implemented modules | Playwright + Excel data-driven testing';
  sheet.getCell('A2').font = { italic: true, color: { argb: COLORS.blue }, size: 11 };
  sheet.getCell('A2').alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 24;

  const moduleSummary = modules
    .map((moduleConfig) => {
      const moduleCount = caseRows.filter(
        (row) => row.productModule === moduleConfig.name,
      ).length;
      return `${moduleCount} ${moduleConfig.name}`;
    })
    .join(', ');
  const instructionRows = [
    ['Scope', `${caseRows.length} existing UI automation cases: ${moduleSummary}.`, 'All modules'],
    ['Purpose', 'A clean, uniform and forwardable view of the current UI automation coverage. It is generated documentation, not a replacement for the eight runtime input workbooks.', 'Review / sharing'],
    ['Runtime inputs', 'Playwright continues to read the existing data-driven workbook for each implemented module. Those eight workbooks remain unchanged.', 'Execution'],
    ['Source of truth', 'Actions and assertions remain in Playwright code. Run Flag, Test Data JSON and Notes are read from each module input workbook; catalog metadata is read from the case definitions.', 'Maintenance'],
    ['Regenerate catalog', 'From the repository root: npm.cmd run data:ui-catalog', 'Maintenance'],
    ['Validate input data', 'Run the matching data:<module>:check command for Account, Agents, Tools, Connectors, Knowledge, Guardrails, UI Components or Product Tour.', 'Validation'],
    ['Run by environment', 'Use npm.cmd run env:run -- <dev|uat|live> <module>. For visible Chrome, append --headed.', 'Execution'],
    ['Authentication', 'Use npm.cmd run auth:login:<environment> once when a saved session is missing or expired. Credentials and storage state are never written into this catalog.', 'Security'],
    ['Environment data', 'Account names such as HCL and USHA describe the recorded fixture. Confirm each source workbook Settings value exists in the selected DEV, UAT or LIVE account before running.', 'Portability'],
    ['Classification', 'Category is the maintained functional grouping. For consistent cross-module security coverage, use Scenario Type, Security Area and OWASP Reference.', 'Review'],
    ['Results', 'Execution evidence is written separately under playwright-suite/test-results/<environment>/excel/. This catalog intentionally has no Actual Result or Status columns.', 'Reporting'],
    ['Write safety', 'Write Operation = YES identifies cases that create, update, upload or delete synthetic data. Review these rows before any live run.', 'Safety'],
    ['UI/UX scope', 'API-only fields such as HTTP method, response status, JSONPath and response timing are outside this browser UI catalog scope.', 'Scope'],
    ['Editing guidance', 'Edit the original module workbook, then regenerate this catalog. Editing this generated catalog does not change Playwright execution.', 'Maintenance'],
  ];

  sheet.getRow(4).values = ['Topic', 'Guidance', 'Applies To'];
  styleHeader(sheet.getRow(4), COLORS.blue);
  instructionRows.forEach((values) => sheet.addRow(values));
  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 34;
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
    applyThinBorder(row, 3);
  }
  sheet.autoFilter = 'A4:C4';
  sheet.pageSetup = landscapePageSetup();
}

function addCoverageSummary(target, caseRows) {
  const sheet = target.addWorksheet('Coverage Summary', {
    properties: { tabColor: { argb: COLORS.green } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  sheet.columns = [
    { width: 23 },
    { width: 37 },
    { width: 14 },
    { width: 72 },
  ];
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'Coverage Summary';
  styleTitle(sheet.getCell('A1'), COLORS.green, 17);
  sheet.getRow(1).height = 32;
  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = 'Counts recalculate in Excel when Run Flag values change.';
  sheet.getCell('A2').font = { italic: true, color: { argb: COLORS.blue } };
  sheet.getRow(4).values = ['Section', 'Metric', 'Count', 'Meaning'];
  styleHeader(sheet.getRow(4), COLORS.green);

  const summaryRows = [
    metric('Overview', 'Total cases', `ROWS(UiAutomationCases[Test Case ID])`, caseRows.length, 'All documented cases across the eight implemented modules.'),
    metric('Overview', 'Enabled cases', 'COUNTIF(UiAutomationCases[Run Flag],"YES")', count(caseRows, 'runFlag', 'YES'), 'Cases enabled in the source module workbooks.'),
    metric('Overview', 'Disabled cases', 'COUNTIF(UiAutomationCases[Run Flag],"NO")', count(caseRows, 'runFlag', 'NO'), 'Cases intentionally skipped by source Excel.'),
    metric('Safety', 'Write operations', 'COUNTIF(UiAutomationCases[Write Operation],"YES")', count(caseRows, 'writeOperation', 'YES'), 'Creates, updates, uploads or deletes synthetic data.'),
    metric('Safety', 'Read-only operations', 'COUNTIF(UiAutomationCases[Write Operation],"NO")', count(caseRows, 'writeOperation', 'NO'), 'Does not intentionally persist application data.'),
    metric('Security', 'Security-mapped cases', 'COUNTIF(UiAutomationCases[Security Area],"<>")', caseRows.filter((row) => row.securityArea).length, 'Cases with an explicit security area and usually an OWASP mapping.'),
    ...groupMetrics('Module', 'Product Module', 'productModule', caseRows),
    ...groupMetrics('Scenario', 'Scenario Type', 'scenarioType', caseRows),
    ...groupMetrics('Priority', 'Priority', 'priority', caseRows),
    ...groupMetrics('Severity', 'Severity', 'severity', caseRows),
    ...groupMetrics('Category', 'Category', 'category', caseRows),
  ];
  summaryRows.forEach((item) => {
    const row = sheet.addRow([
      item.section,
      item.label,
      { formula: item.formula, result: item.result },
      item.meaning,
    ]);
    row.height = 26;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
    row.getCell(3).font = { bold: true, color: { argb: COLORS.green } };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    applyThinBorder(row, 4);
  });
  sheet.autoFilter = `A4:D${sheet.rowCount}`;
  sheet.pageSetup = landscapePageSetup();
}

function addTestCases(target, caseRows) {
  const sheet = target.addWorksheet('UI Test Cases', {
    properties: { tabColor: { argb: COLORS.blue } },
    views: [{
      state: 'frozen',
      xSplit: 3,
      ySplit: 1,
      topLeftCell: 'D2',
      activeCell: 'D2',
      showGridLines: false,
      zoomScale: 75,
    }],
  });
  const columns = [
    ['Sequence', 'sequence', 11],
    ['Run Flag', 'runFlag', 11],
    ['Test Case ID', 'id', 15],
    ['Product Module', 'productModule', 18],
    ['Feature / Area', 'feature', 31],
    ['Title', 'title', 46],
    ['Description', 'description', 54],
    ['Category', 'category', 20],
    ['Scenario Type', 'scenarioType', 23],
    ['Priority', 'priority', 11],
    ['Severity', 'severity', 12],
    ['Preconditions', 'preconditions', 52],
    ['Test Steps', 'steps', 66],
    ['Expected Result', 'expectedResult', 60],
    ['Test Data JSON', 'testData', 62],
    ['Write Operation', 'writeOperation', 16],
    ['Security Area', 'securityArea', 32],
    ['OWASP Reference', 'owaspReference', 43],
    ['Tags', 'tags', 40],
    ['Source Workbook', 'sourceWorkbook', 30],
    ['Notes', 'notes', 35],
  ];

  sheet.addTable({
    name: 'UiAutomationCases',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: columns.map(([name]) => ({ name })),
    rows: caseRows.map((item) => columns.map(([, key]) => item[key] ?? '')),
  });

  columns.forEach(([, , width], index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1), COLORS.blue);
  const headerIndex = headerMap(sheet);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 72;
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { size: 10 };
    row.getCell(headerIndex.get('Test Case ID')).font = {
      bold: true,
      color: { argb: COLORS.navy },
    };
    row.getCell(headerIndex.get('Test Data JSON')).font = {
      name: 'Consolas',
      size: 9,
    };
    row.getCell(headerIndex.get('Run Flag')).alignment = {
      horizontal: 'center',
      vertical: 'top',
    };
    row.getCell(headerIndex.get('Write Operation')).alignment = {
      horizontal: 'center',
      vertical: 'top',
    };
    colorCaseRow(row, headerIndex);
  }
  sheet.pageSetup = landscapePageSetup();
  sheet.pageSetup.printTitlesRow = '1:1';
}

function addEnvironmentMatrix(target) {
  const registryPath = path.join(suiteRoot, 'config', 'environments.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const sheet = target.addWorksheet('Environment Matrix', {
    properties: { tabColor: { argb: COLORS.orange } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const columns = [
    ['Environment', 14],
    ['Base URL', 38],
    ['Account', 34],
    ['Agents', 34],
    ['Tools', 34],
    ['Connectors', 34],
    ['Guardrails', 34],
    ['UI Components', 34],
    ['Product Tour', 20],
    ['Interactive Login', 35],
    ['Storage State', 30],
    ['Safety Guidance', 64],
  ];
  const environmentRows = Object.entries(registry.environments).map(([name, item]) => [
    name.toUpperCase(),
    item.baseURL,
    `npm.cmd run env:run -- ${name} account`,
    `npm.cmd run env:run -- ${name} agents`,
    `npm.cmd run env:run -- ${name} tools`,
    `npm.cmd run env:run -- ${name} connectors`,
    `npm.cmd run env:run -- ${name} guardrails`,
    `npm.cmd run env:run -- ${name} ui-components`,
    `npm.cmd run env:run -- ${name} product-tour`,
    `npm.cmd run auth:login:${name}`,
    `playwright-suite/storage/${name}/auth.json`,
    name === 'live'
      ? 'Confirm environment-specific Account Settings. Review every Write Operation and security case before execution; use only approved synthetic data.'
      : 'Confirm environment-specific Account Settings and use approved synthetic data. Append --headed to env:run for visible Chrome.',
  ]);
  sheet.addTable({
    name: 'UiEnvironmentMatrix',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium9', showRowStripes: true },
    columns: columns.map(([name]) => ({ name })),
    rows: environmentRows,
  });
  columns.forEach(([, width], index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1), COLORS.orange);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 48;
    row.alignment = { vertical: 'top', wrapText: true };
    if (row.getCell(1).text === 'LIVE') {
      row.getCell(11).fill = solidFill(COLORS.paleRed);
      row.getCell(11).font = { bold: true, color: { argb: 'FF9C0006' } };
    }
  }
  sheet.pageSetup = landscapePageSetup();
}

function addFieldReference(target) {
  const sheet = target.addWorksheet('Field Reference', {
    properties: { tabColor: { argb: COLORS.teal } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const columns = [
    ['Field', 25],
    ['Applies To', 20],
    ['Maintained In', 31],
    ['Required', 11],
    ['Description', 75],
    ['Example', 48],
  ];
  const references = [
    ['Sequence', 'UI Test Cases', 'Generated catalog', 'Yes', 'Stable display order across all implemented modules.', '1'],
    ['Run Flag', 'UI Test Cases', 'Module input workbook', 'Yes', 'Mirrors Execute. YES runs the Playwright case; NO skips it.', 'YES'],
    ['Test Case ID', 'UI Test Cases', 'Case definition', 'Yes', 'Unique automation identifier used by the spec, input workbook and reporter.', 'AF-019'],
    ['Product Module', 'UI Test Cases', 'Generated catalog', 'Yes', 'Top-level current-project scope.', 'Account / Agents / Tools / Connectors / Knowledge / Guardrails / UI Components / Product Tour'],
    ['Feature / Area', 'UI Test Cases', 'Case definition', 'Yes', 'Specific page area or behavior under test.', 'Agent creation form'],
    ['Title', 'UI Test Cases', 'Case definition', 'Yes', 'Concise statement of the behavior being verified.', 'Create a date-time-stamped synthetic Agent'],
    ['Description', 'UI Test Cases', 'Case definition', 'Yes', 'Scope and intent of the automated check.', 'Create one traceable Agent using safe resources.'],
    ['Category', 'UI Test Cases', 'Case definition', 'Yes', 'Functional, security or end-to-end coverage grouping.', 'Functional'],
    ['Scenario Type', 'UI Test Cases', 'Case definition', 'Yes', 'Positive, negative, combined or security scenario.', 'Negative + Security'],
    ['Priority', 'UI Test Cases', 'Case definition', 'Yes', 'Execution/business priority from P1 through P4.', 'P1'],
    ['Severity', 'UI Test Cases', 'Case definition', 'Yes', 'Impact if the tested behavior fails.', 'Critical'],
    ['Preconditions', 'UI Test Cases', 'Case definition', 'Yes', 'State that must exist before the case runs.', 'A valid authenticated session is available.'],
    ['Test Steps', 'UI Test Cases', 'Case definition', 'Yes', 'Human-readable sequence corresponding to the automated behavior.', '1. Open Agents.\n2. Select Create Agent.'],
    ['Expected Result', 'UI Test Cases', 'Case definition', 'Yes', 'Observable success condition. Assertions remain in Playwright code.', 'The synthetic Agent is created and visible.'],
    ['Test Data JSON', 'UI Test Cases', 'Module input workbook', 'Yes', 'Exact row data passed to the module. Must remain valid JSON.', '{\n  "maxLength": 100\n}'],
    ['Write Operation', 'UI Test Cases', 'Case definition', 'Yes', 'YES marks creation, update, upload or deletion of synthetic application data.', 'YES'],
    ['Security Area', 'UI Test Cases', 'Case definition', 'No', 'Security control covered by applicable cases.', 'Injection and parser validation'],
    ['OWASP Reference', 'UI Test Cases', 'Case definition', 'No', 'Relevant OWASP mapping where one is maintained.', 'OWASP A03:2021 Injection'],
    ['Tags', 'UI Test Cases', 'Case definition', 'Yes', 'Searchable coverage labels. These plain labels are not direct Playwright grep expressions; CLI grep uses the @tags present in test titles.', 'flow, smoke, agents'],
    ['Source Workbook', 'UI Test Cases', 'Generated catalog', 'Yes', 'Runtime Excel input from which Run Flag, data and notes were read.', 'agents-data-driven.xlsx'],
    ['Notes', 'UI Test Cases', 'Module input workbook', 'No', 'Optional maintainer notes. Edit the source workbook, not this generated catalog.', 'Uses synthetic data only.'],
    ['Base URL', 'Environment Matrix', 'config/environments.json', 'Yes', 'Locked UI origin for DEV, UAT or LIVE.', 'https://junedev.ledgers.cloud'],
    ['Credentials', 'Not stored', 'playwright-suite/.env', 'Conditional', 'Use an environment-scoped username/password pair or a manually saved authenticated session. Never store secrets in Excel.', 'DEV_TEST_USERNAME / DEV_TEST_PASSWORD'],
    ['Runtime tokens', 'Test Data JSON', 'Module input workbook', 'No', 'Placeholders resolved at run time for unique names and traceable timestamps.', '{{RUN_ISO}}, {{RUN_COMPACT}}, {{RUN_STAMP}}'],
  ];
  sheet.addTable({
    name: 'UiCatalogFieldReference',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium4', showRowStripes: true },
    columns: columns.map(([name]) => ({ name })),
    rows: references,
  });
  columns.forEach(([, width], index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1), COLORS.teal);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 42;
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
  }
  sheet.pageSetup = landscapePageSetup();
}

function colorCaseRow(row, headers) {
  const moduleCell = row.getCell(headers.get('Product Module'));
  const moduleColors = {
    Account: COLORS.palePurple,
    Agents: COLORS.paleBlue,
    Tools: COLORS.paleGreen,
    Connectors: COLORS.paleOrange,
    Knowledge: COLORS.paleBlue,
    Guardrails: COLORS.paleRed,
    'UI Components': COLORS.paleYellow,
    'Product Tour': COLORS.palePurple,
  };
  const moduleColor = moduleColors[moduleCell.text] || COLORS.paleGray;
  moduleCell.fill = solidFill(moduleColor);
  moduleCell.font = { bold: true, color: { argb: COLORS.navy } };

  const runCell = row.getCell(headers.get('Run Flag'));
  runCell.fill = solidFill(runCell.text === 'YES' ? COLORS.paleGreen : COLORS.paleGray);
  runCell.font = {
    bold: true,
    color: { argb: runCell.text === 'YES' ? 'FF006100' : 'FF666666' },
  };

  const writeCell = row.getCell(headers.get('Write Operation'));
  if (writeCell.text === 'YES') {
    writeCell.fill = solidFill(COLORS.paleOrange);
    writeCell.font = { bold: true, color: { argb: 'FF9C5700' } };
  }

  const priorityCell = row.getCell(headers.get('Priority'));
  priorityCell.fill = solidFill(
    priorityCell.text === 'P1' ? COLORS.paleRed
      : priorityCell.text === 'P2' ? COLORS.paleYellow
        : COLORS.paleGray,
  );
  priorityCell.font = { bold: true };

  const scenarioCell = row.getCell(headers.get('Scenario Type'));
  if (scenarioCell.text.includes('Security')) {
    scenarioCell.fill = solidFill(COLORS.paleRed);
  } else if (scenarioCell.text.includes('Negative')) {
    scenarioCell.fill = solidFill(COLORS.paleYellow);
  }
}

function groupMetrics(section, excelColumn, objectKey, caseRows) {
  const values = [...new Set(caseRows.map((row) => row[objectKey]).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  return values.map((value) => metric(
    section,
    String(value),
    `COUNTIF(UiAutomationCases[${excelColumn}],"${escapeFormulaText(value)}")`,
    count(caseRows, objectKey, value),
    `${section} coverage for ${value}.`,
  ));
}

function metric(section, label, formula, result, meaning) {
  return { section, label, formula, result, meaning };
}

function count(caseRows, key, value) {
  return caseRows.filter((row) => row[key] === value).length;
}

function escapeFormulaText(value) {
  return String(value).replace(/"/g, '""');
}

function createSourceSnapshot(caseRows) {
  const sourceFiles = new Set([
    fileURLToPath(import.meta.url),
    ...modules.map((moduleConfig) => moduleConfig.catalogPath),
    path.join(suiteRoot, 'package.json'),
    path.join(suiteRoot, '..', 'package.json'),
    path.join(suiteRoot, 'config', 'environments.json'),
    path.join(suiteRoot, 'scripts', 'run-environment.mjs'),
    ...modules.map((moduleConfig) => moduleConfig.workbook),
  ]);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    moduleSources: Object.fromEntries(
      modules.map((moduleConfig) => [
        moduleConfig.name,
        path.basename(moduleConfig.workbook),
      ]),
    ),
    sourceHashes: Object.fromEntries(
      [...sourceFiles]
        .sort()
        .map((filePath) => [
          path.relative(suiteRoot, filePath).replace(/\\/g, '/'),
          hashFile(filePath),
        ]),
    ),
    catalogHash: hashText(JSON.stringify(
      caseRows.map((row) => CATALOG_HASH_KEYS.map((key) => row[key] ?? '')),
    )),
  };
}

function createWorkbookContentHash(target) {
  const payload = target.worksheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    rows: Array.from({ length: sheet.rowCount }, (_unused, rowIndex) => (
      Array.from({ length: sheet.columnCount }, (_empty, columnIndex) => {
        const cell = sheet.getCell(rowIndex + 1, columnIndex + 1);
        return [cell.text, cell.formula || '', cell.result ?? ''];
      })
    )),
    tables: Object.values(sheet.tables)
      .map(({ table }) => ({
        name: table.name,
        ref: table.tableRef,
        columns: table.columns.map((column) => column.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  }));
  return hashText(JSON.stringify(payload));
}

function hashFile(filePath) {
  return hashText(fs.readFileSync(filePath));
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function normalizeExecute(raw, id) {
  const value = raw.trim().toUpperCase();
  if (['YES', 'Y', 'TRUE', '1', 'RUN'].includes(value)) return 'YES';
  if (['NO', 'N', 'FALSE', '0', 'SKIP'].includes(value)) return 'NO';
  throw new Error(`${id} Execute must be YES or NO; found "${raw}".`);
}

function headerMap(sheet) {
  const result = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    result.set(cell.text.trim(), columnNumber);
  });
  return result;
}

function cellText(row, columnNumber, trim = true) {
  const value = columnNumber ? row.getCell(columnNumber).text : '';
  return trim ? value.trim() : value;
}

function styleTitle(cell, color, size) {
  cell.fill = solidFill(color);
  cell.font = { bold: true, color: { argb: COLORS.white }, size };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function styleHeader(row, color) {
  row.height = 30;
  row.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
  row.fill = solidFill(color);
  row.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
}

function applyThinBorder(row, columnCount) {
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).border = {
      top: { style: 'thin', color: { argb: COLORS.border } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  }
}

function solidFill(color) {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color },
  };
}

function landscapePageSetup() {
  return {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
}
