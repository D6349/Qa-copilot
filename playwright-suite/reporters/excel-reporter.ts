import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGENT_FLOW_CASES,
  CONNECTOR_FLOW_CASES,
  GUARDRAIL_FLOW_CASES,
  UI_COMPONENT_FLOW_CASES,
  TOOL_FLOW_CASES,
  type FlowCaseDefinition,
} from '../test-cases/agent-flow-cases';
import { ACCOUNT_FLOW_CASES } from '../test-cases/account-flow-cases';
import { KNOWLEDGE_FLOW_CASES } from '../test-cases/knowledge-flow-cases';
import { PRODUCT_TOUR_FLOW_CASES } from '../test-cases/product-tour-flow-cases';
import {
  loadAccountExcelRuntime,
  type AccountExcelCase,
} from '../utils/accountExcelData';
import {
  loadAgentsExcelRuntime,
  type AgentsExcelCase,
} from '../utils/agentsExcelData';
import {
  loadToolsExcelRuntime,
  type ToolsExcelCase,
} from '../utils/toolsExcelData';
import {
  loadConnectorsExcelRuntime,
  type ConnectorsExcelCase,
} from '../utils/connectorsExcelData';
import {
  loadKnowledgeExcelRuntime,
  type KnowledgeExcelCase,
} from '../utils/knowledgeExcelData';
import {
  loadGuardrailsExcelRuntime,
  type GuardrailsExcelCase,
} from '../utils/guardrailsExcelData';
import {
  loadUiComponentsExcelRuntime,
  type UiComponentsExcelCase,
} from '../utils/uiComponentsExcelData';
import {
  loadProductTourExcelRuntime,
  type ProductTourExcelCase,
} from '../utils/productTourExcelData';
import {
  resolveEnvironmentArtifactPath,
  resolveEnvironmentConfig,
} from '../config/environment';
import {
  implicitExcelReportScope,
  redactReportText,
  repositoryRelativePath,
} from '../utils/report-privacy';

interface ExecutionRow {
  sequence: number;
  runDate: string;
  runTime: string;
  runAt: string;
  caseId: string;
  title: string;
  status: 'Pass' | 'Fail' | 'Skipped';
  durationMs: number;
  browser: string;
  environment: string;
  retry: number;
  expectedResult: string;
  actualResult: string;
  testData: string;
  error: string;
  evidence: ScreenshotEvidence;
}

type EvidenceStatus = 'Captured' | 'Skipped' | 'Unavailable';

interface ScreenshotEvidence {
  status: EvidenceStatus;
  note: string;
  attachmentName?: string;
  contentType?: 'image/png' | 'image/jpeg';
  extension?: 'png' | 'jpeg';
  fileExtension?: 'png' | 'jpg';
  bytes?: Buffer;
  width?: number;
  height?: number;
  absolutePath?: string;
  relativePath?: string;
}

type ReportScope =
  | 'all'
  | 'e2e'
  | 'account'
  | 'agents'
  | 'tools'
  | 'connectors'
  | 'knowledge'
  | 'guardrails'
  | 'ui-components'
  | 'product-tour';

interface ReportConfig {
  cases: FlowCaseDefinition[];
  filePrefix: string;
  suiteName: string;
  subject: string;
}

const SUITE_ROOT = path.resolve(process.cwd());
const ENVIRONMENT = resolveEnvironmentConfig();
const REPORT_SCOPE = getReportScope();
const REPORT_CONFIGS: Record<ReportScope, ReportConfig> = {
  all: {
    cases: [
      ...ACCOUNT_FLOW_CASES,
      ...AGENT_FLOW_CASES,
      ...TOOL_FLOW_CASES,
      ...CONNECTOR_FLOW_CASES,
      ...KNOWLEDGE_FLOW_CASES,
      ...GUARDRAIL_FLOW_CASES,
      ...UI_COMPONENT_FLOW_CASES,
      ...PRODUCT_TOUR_FLOW_CASES,
    ],
    filePrefix: 'all-modules',
    suiteName: 'Excel-driven All Modules Flow',
    subject: 'Excel-driven June all-module test cases, execution results, and screenshot evidence',
  },
  e2e: {
    cases: [...AGENT_FLOW_CASES, ...TOOL_FLOW_CASES],
    filePrefix: 'e2e-flow',
    suiteName: 'Excel-driven Agents and Tools End-to-End Flow',
    subject: 'Excel-driven June end-to-end test cases and execution results',
  },
  account: {
    cases: ACCOUNT_FLOW_CASES,
    filePrefix: 'account-flow',
    suiteName: 'Excel-driven Account Preflight',
    subject: 'Excel-driven June account and business-selection preflight results',
  },
  agents: {
    cases: AGENT_FLOW_CASES,
    filePrefix: 'agent-flow',
    suiteName: 'Excel-driven Agents Flow',
    subject: 'Excel-driven June Agents test cases and execution results',
  },
  tools: {
    cases: TOOL_FLOW_CASES,
    filePrefix: 'tools-flow',
    suiteName: 'Recorded Tools Flow',
    subject: 'Recorded June Tools test cases and execution results',
  },
  connectors: {
    cases: CONNECTOR_FLOW_CASES,
    filePrefix: 'connectors-flow',
    suiteName: 'Recorded Connectors Flow',
    subject: 'Recorded June Connectors test cases and execution results',
  },
  knowledge: {
    cases: KNOWLEDGE_FLOW_CASES,
    filePrefix: 'knowledge-flow',
    suiteName: 'Recorded Knowledge Flow',
    subject: 'Recorded June Knowledge test cases and execution results',
  },
  guardrails: {
    cases: GUARDRAIL_FLOW_CASES,
    filePrefix: 'guardrails-flow',
    suiteName: 'Recorded Guardrails Flow',
    subject: 'Recorded June Guardrails test cases and execution results',
  },
  'ui-components': {
    cases: UI_COMPONENT_FLOW_CASES,
    filePrefix: 'ui-components-flow',
    suiteName: 'Recorded UI Components Flow',
    subject: 'Recorded June UI Components test cases and execution results',
  },
  'product-tour': {
    cases: PRODUCT_TOUR_FLOW_CASES,
    filePrefix: 'product-tour-flow',
    suiteName: 'Excel-driven Explore June AI Product Tour',
    subject: 'Excel-driven June Product Tour test cases and execution results',
  },
};
const REPORT_CONFIG = REPORT_CONFIGS[REPORT_SCOPE];
const ACCOUNT_EXCEL_INPUT = ['all', 'account'].includes(REPORT_SCOPE)
  ? loadAccountExcelRuntime()
  : undefined;
const ACCOUNT_EXCEL_CASE_BY_ID = new Map(
  (ACCOUNT_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const AGENTS_EXCEL_INPUT = ['all', 'e2e', 'agents'].includes(REPORT_SCOPE)
  ? loadAgentsExcelRuntime()
  : undefined;
const AGENTS_EXCEL_CASE_BY_ID = new Map(
  (AGENTS_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const TOOLS_EXCEL_INPUT = ['all', 'e2e', 'tools'].includes(REPORT_SCOPE)
  ? loadToolsExcelRuntime()
  : undefined;
const TOOLS_EXCEL_CASE_BY_ID = new Map(
  (TOOLS_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const CONNECTORS_EXCEL_INPUT = ['all', 'connectors'].includes(REPORT_SCOPE)
  ? loadConnectorsExcelRuntime()
  : undefined;
const CONNECTORS_EXCEL_CASE_BY_ID = new Map(
  (CONNECTORS_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const KNOWLEDGE_EXCEL_INPUT = ['all', 'knowledge'].includes(REPORT_SCOPE)
  ? loadKnowledgeExcelRuntime()
  : undefined;
const KNOWLEDGE_EXCEL_CASE_BY_ID = new Map(
  (KNOWLEDGE_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const GUARDRAILS_EXCEL_INPUT = ['all', 'guardrails'].includes(REPORT_SCOPE)
  ? loadGuardrailsExcelRuntime()
  : undefined;
const GUARDRAILS_EXCEL_CASE_BY_ID = new Map(
  (GUARDRAILS_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const UI_COMPONENTS_EXCEL_INPUT = ['all', 'ui-components'].includes(REPORT_SCOPE)
  ? loadUiComponentsExcelRuntime()
  : undefined;
const UI_COMPONENTS_EXCEL_CASE_BY_ID = new Map(
  (UI_COMPONENTS_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const PRODUCT_TOUR_EXCEL_INPUT = ['all', 'product-tour'].includes(REPORT_SCOPE)
  ? loadProductTourExcelRuntime()
  : undefined;
const PRODUCT_TOUR_EXCEL_CASE_BY_ID = new Map(
  (PRODUCT_TOUR_EXCEL_INPUT?.cases || []).map((item) => [item.id, item]),
);
const AGENTS_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.AGENTS_DATA_WORKBOOK
    || path.join('test-data', 'agents-data-driven.xlsx'),
  SUITE_ROOT,
);
const TOOLS_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.TOOLS_DATA_WORKBOOK
    || path.join('test-data', 'tools-data-driven.xlsx'),
  SUITE_ROOT,
);
const CONNECTORS_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.CONNECTORS_DATA_WORKBOOK
    || path.join('test-data', 'connectors-data-driven.xlsx'),
  SUITE_ROOT,
);
const KNOWLEDGE_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.KNOWLEDGE_DATA_WORKBOOK
    || path.join('test-data', 'knowledge-data-driven.xlsx'),
  SUITE_ROOT,
);
const GUARDRAILS_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.GUARDRAILS_DATA_WORKBOOK
    || path.join('test-data', 'guardrails-data-driven.xlsx'),
  SUITE_ROOT,
);
const UI_COMPONENTS_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.UI_COMPONENTS_DATA_WORKBOOK
    || path.join('test-data', 'ui-components-data-driven.xlsx'),
  SUITE_ROOT,
);
const PRODUCT_TOUR_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.PRODUCT_TOUR_DATA_WORKBOOK
    || path.join('test-data', 'product-tour-data-driven.xlsx'),
  SUITE_ROOT,
);
const ACCOUNT_INPUT_WORKBOOK = repositoryRelativePath(
  process.env.ACCOUNT_DATA_WORKBOOK
    || path.join('test-data', 'account-data-driven.xlsx'),
  SUITE_ROOT,
);
const CASE_BY_ID = new Map(REPORT_CONFIG.cases.map((item) => [item.id, item]));
const CASE_SEQUENCE = new Map(
  REPORT_CONFIG.cases.map((item, index) => [item.id, index + 1]),
);
const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE || 'Asia/Kolkata';
const SENSITIVE_VALUE_ENV_KEYS = [
  'TEST_PASSWORD',
  'DEV_TEST_PASSWORD',
  'UAT_TEST_PASSWORD',
  'LIVE_TEST_PASSWORD',
  'DEV_USER_ACCESS_TEST_USERNAME',
  'DEV_USER_ACCESS_TEST_PASSWORD',
  'UAT_USER_ACCESS_TEST_USERNAME',
  'UAT_USER_ACCESS_TEST_PASSWORD',
  'LIVE_USER_ACCESS_TEST_USERNAME',
  'LIVE_USER_ACCESS_TEST_PASSWORD',
  'DEV_COMPANY_ACCESS_TEST_USERNAME',
  'DEV_COMPANY_ACCESS_TEST_PASSWORD',
  'UAT_COMPANY_ACCESS_TEST_USERNAME',
  'UAT_COMPANY_ACCESS_TEST_PASSWORD',
  'LIVE_COMPANY_ACCESS_TEST_USERNAME',
  'LIVE_COMPANY_ACCESS_TEST_PASSWORD',
  'DB_PASSWORD',
  'KNOWLEDGE_QDRANT_API_KEY',
  'KNOWLEDGE_QDRANT_ENDPOINT',
  'KNOWLEDGE_CHROMA_API_KEY',
  'KNOWLEDGE_CHROMA_TENANT',
  'KNOWLEDGE_CHROMA_DATABASE',
  'KNOWLEDGE_CHROMA_ALTERNATE_DATABASE',
  'KNOWLEDGE_CHROMA_COLLECTION',
] as const;
const SENSITIVE_VALUES = [...new Set(
  SENSITIVE_VALUE_ENV_KEYS
    .map((key) => process.env[key]?.trim())
    .filter((value): value is string => (
      typeof value === 'string' && value.length > 0
    )),
)].sort((left, right) => right.length - left.length);

export default class ExcelReporter implements Reporter {
  private readonly executions = new Map<string, ExecutionRow>();
  private readonly startedAt = new Date();

  onTestEnd(test: TestCase, result: TestResult): void {
    const caseId = extractCaseId(test);
    const definition = caseId ? CASE_BY_ID.get(caseId) : undefined;
    if (!caseId || !definition) return;
    const excelCase = excelCaseFor(caseId);

    const status = mapStatus(result.status);
    const skipReason = test.annotations.find((annotation) => annotation.type === 'skip')?.description;
    const error = redactSensitiveText(result.error?.message || '');
    const actualResult = status === 'Pass'
      ? 'All automated assertions passed.'
      : status === 'Skipped'
        ? skipReason || 'Test was skipped by its execution guard.'
        : firstLine(error) || 'The automated flow failed.';

    const browser = test.parent.project()?.name || '';
    const startedAt = result.startTime || new Date();
    const localRun = formatRunDateTime(startedAt);
    this.executions.set(`${caseId}:${browser}`, {
      sequence: CASE_SEQUENCE.get(caseId) || 0,
      runDate: localRun.date,
      runTime: localRun.time,
      runAt: startedAt.toISOString(),
      caseId,
      title: redactSensitiveText(excelCase?.title || definition.title),
      status,
      durationMs: result.duration,
      browser,
      environment: ENVIRONMENT.name,
      retry: result.retry,
      expectedResult: redactSensitiveText(
        excelCase?.expectedResult || definition.expectedResult,
      ),
      actualResult: redactSensitiveText(actualResult),
      testData: redactSensitiveText(extractTestData(result)).slice(0, 4000),
      error: error.slice(0, 4000),
      evidence: extractScreenshotEvidence(result, status),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.executions.size === 0) {
      console.log('[excel-reporter] no executed test cases; report not written.');
      return;
    }
    try {
      const outputDir = path.resolve(
        process.env.EXCEL_REPORT_DIR
          || resolveEnvironmentArtifactPath('excel'),
      );
      fs.mkdirSync(outputDir, { recursive: true });

      const executions = [...this.executions.values()];
      const runId = process.env.RUN_ID || createRunId(new Date());
      const evidenceFolder = persistScreenshotEvidence(executions, outputDir, runId);
      const workbook = buildWorkbook(
        executions,
        this.startedAt,
        result.status,
        evidenceFolder,
      );
      const timestamped = path.join(
        outputDir,
        REPORT_CONFIG.filePrefix + '-' + ENVIRONMENT.name + '-' + runId + '.xlsx',
      );
      const completeness = reportCompleteness(executions);
      const latest = path.join(
        outputDir,
        REPORT_CONFIG.filePrefix + '-' + ENVIRONMENT.name
          + (completeness === 'complete' ? '-latest.xlsx' : '-partial-latest.xlsx'),
      );
      await workbook.xlsx.writeFile(timestamped);

      try {
        fs.copyFileSync(timestamped, latest);
      } catch (error) {
        console.warn(
          '[excel-reporter] timestamped workbook saved, but latest copy failed: '
          + redactSensitiveText((error as Error).message),
        );
      }

      console.log(
        '[excel-reporter] wrote '
        + redactSensitiveText(repositoryRelativePath(timestamped, SUITE_ROOT)),
      );
      console.log(
        `[excel-reporter] latest ${completeness} `
        + redactSensitiveText(repositoryRelativePath(latest, SUITE_ROOT)),
      );
    } catch (error) {
      console.error(
        `[excel-reporter] failed: ${redactSensitiveText((error as Error).message)}`,
      );
      throw error;
    }
  }
}

function reportCompleteness(
  executions: ExecutionRow[],
): 'complete' | 'partial' {
  const expectedIds = REPORT_CONFIG.cases.map((item) => item.id);
  const executedIds = executions.map((item) => item.caseId);
  const executedIdSet = new Set(executedIds);
  return executedIds.length === expectedIds.length
    && executedIdSet.size === expectedIds.length
    && expectedIds.every((id) => executedIdSet.has(id))
    ? 'complete'
    : 'partial';
}

function buildWorkbook(
  executions: ExecutionRow[],
  startedAt: Date,
  overallStatus: FullResult['status'],
  evidenceFolder: string,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QA Copilot Playwright';
  workbook.created = new Date();
  workbook.subject = REPORT_CONFIG.subject;

  addSummarySheet(workbook, executions, startedAt, overallStatus, evidenceFolder);
  addTestCasesSheet(workbook, executions);
  addExecutionSheet(workbook, executions);
  return workbook;
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  executions: ExecutionRow[],
  startedAt: Date,
  overallStatus: FullResult['status'],
  evidenceFolder: string,
): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 30 }, { width: 65 }];
  const counts = countStatuses(executions);
  const localStart = formatRunDateTime(startedAt);
  const generatedAt = new Date();
  const localGenerated = formatRunDateTime(generatedAt);
  const rows: Array<[string, string | number]> = [
    ['Project', 'June'],
    ['Suite', REPORT_CONFIG.suiteName],
    ['Environment', ENVIRONMENT.name],
    ['Base URL', ENVIRONMENT.baseURL],
    ['Run ID', process.env.RUN_ID || 'Not provided'],
    ['Account data source', ['all', 'account'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Account input workbook', ['all', 'account'].includes(REPORT_SCOPE) ? ACCOUNT_INPUT_WORKBOOK : 'Not applicable'],
    ['Agents data source', ['all', 'e2e', 'agents'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Agents input workbook', ['all', 'e2e', 'agents'].includes(REPORT_SCOPE) ? AGENTS_INPUT_WORKBOOK : 'Not applicable'],
    ['Tools data source', ['all', 'e2e', 'tools'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Tools input workbook', ['all', 'e2e', 'tools'].includes(REPORT_SCOPE) ? TOOLS_INPUT_WORKBOOK : 'Not applicable'],
    ['Connectors data source', ['all', 'connectors'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Connectors input workbook', ['all', 'connectors'].includes(REPORT_SCOPE) ? CONNECTORS_INPUT_WORKBOOK : 'Not applicable'],
    ['Knowledge data source', ['all', 'knowledge'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Knowledge input workbook', ['all', 'knowledge'].includes(REPORT_SCOPE) ? KNOWLEDGE_INPUT_WORKBOOK : 'Not applicable'],
    ['Guardrails data source', ['all', 'guardrails'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Guardrails input workbook', ['all', 'guardrails'].includes(REPORT_SCOPE) ? GUARDRAILS_INPUT_WORKBOOK : 'Not applicable'],
    ['UI Components data source', ['all', 'ui-components'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['UI Components input workbook', ['all', 'ui-components'].includes(REPORT_SCOPE) ? UI_COMPONENTS_INPUT_WORKBOOK : 'Not applicable'],
    ['Product Tour data source', ['all', 'product-tour'].includes(REPORT_SCOPE) ? 'Excel' : 'Not applicable'],
    ['Product Tour input workbook', ['all', 'product-tour'].includes(REPORT_SCOPE) ? PRODUCT_TOUR_INPUT_WORKBOOK : 'Not applicable'],
    ['Report time zone', REPORT_TIME_ZONE],
    ['Run date', localStart.date],
    ['Run time', localStart.time],
    ['Run started (ISO)', startedAt.toISOString()],
    ['Workbook generated date', localGenerated.date],
    ['Workbook generated time', localGenerated.time],
    ['Workbook generated (ISO)', generatedAt.toISOString()],
    ['Overall Playwright status', overallStatus],
    ['Defined test cases', REPORT_CONFIG.cases.length],
    ['Execution rows', executions.length],
    ['Passed', counts.Pass],
    ['Failed', counts.Fail],
    ['Skipped', counts.Skipped],
    ['Screenshots captured', countScreenshots(executions)],
    ['Evidence folder', evidenceFolder],
  ];
  rows.forEach(([label, value]) => sheet.addRow([
    label,
    typeof value === 'string' ? redactSensitiveText(value) : value,
  ]));
  sheet.getColumn(1).font = { bold: true };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(1).height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addTestCasesSheet(workbook: ExcelJS.Workbook, executions: ExecutionRow[]): void {
  const sheet = workbook.addWorksheet('Test Cases');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Test Case ID', key: 'id', width: 15 },
    { header: 'Data Source', key: 'dataSource', width: 14 },
    { header: 'Execute', key: 'execute', width: 12 },
    { header: 'Module', key: 'module', width: 22 },
    { header: 'Title', key: 'title', width: 46 },
    { header: 'Description', key: 'description', width: 52 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Scenario Type', key: 'scenarioType', width: 22 },
    { header: 'Security Area', key: 'securityArea', width: 30 },
    { header: 'OWASP Reference', key: 'owaspReference', width: 42 },
    { header: 'Type', key: 'type', width: 13 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Preconditions', key: 'preconditions', width: 50 },
    { header: 'Test Steps', key: 'steps', width: 72 },
    { header: 'Expected Result', key: 'expectedResult', width: 65 },
    { header: 'Automatable', key: 'automatable', width: 13 },
    { header: 'Write Operation', key: 'writeOperation', width: 16 },
    { header: 'Tags', key: 'tags', width: 32 },
    { header: 'Latest Run Date', key: 'runDate', width: 17 },
    { header: 'Latest Run Time', key: 'runTime', width: 22 },
    { header: 'Latest Status', key: 'status', width: 14 },
    { header: 'Duration (ms)', key: 'durationMs', width: 15 },
    { header: 'Test Data', key: 'testData', width: 55 },
    { header: 'Actual Result', key: 'actualResult', width: 55 },
    { header: 'Screenshot Evidence', key: 'screenshotEvidence', width: 46 },
    { header: 'Screenshot File', key: 'screenshotFile', width: 24 },
  ];

  for (const [index, definition] of REPORT_CONFIG.cases.entries()) {
    const execution = latestExecutionForCase(executions, definition.id);
    const excelCase = excelCaseFor(definition.id);
    const row = sheet.addRow({
      ...definition,
      sequence: index + 1,
      dataSource: excelCase ? 'Excel' : 'Code',
      execute: excelCase ? (excelCase.execute ? 'YES' : 'NO') : 'N/A',
      module: redactSensitiveText(definition.module),
      title: redactSensitiveText(excelCase?.title || definition.title),
      description: redactSensitiveText(definition.description),
      category: redactSensitiveText(definition.category),
      scenarioType: redactSensitiveText(definition.scenarioType),
      securityArea: redactSensitiveText(definition.securityArea),
      owaspReference: redactSensitiveText(definition.owaspReference),
      type: redactSensitiveText(definition.type),
      priority: redactSensitiveText(definition.priority),
      severity: redactSensitiveText(definition.severity),
      expectedResult: redactSensitiveText(
        excelCase?.expectedResult || definition.expectedResult,
      ),
      preconditions: redactSensitiveText(numbered(definition.preconditions)),
      steps: redactSensitiveText(numbered(definition.steps)),
      automatable: definition.automatable ? 'Yes' : 'No',
      writeOperation: definition.writeOperation ? 'Yes' : 'No',
      tags: redactSensitiveText(definition.tags.join(', ')),
      runDate: execution?.runDate || '',
      runTime: execution?.runTime || '',
      status: execution?.status || 'Not Run',
      durationMs: execution?.durationMs ?? '',
      testData: execution?.testData || '',
      actualResult: execution?.actualResult || '',
      screenshotEvidence: execution?.evidence.status || 'Not Run',
      screenshotFile: execution?.evidence.status || 'Not Run',
    });
    applyEvidenceCells(row, execution?.evidence, definition.id, execution?.browser);
    if (execution?.evidence.status === 'Captured') {
      addScreenshotThumbnail(
        workbook,
        sheet,
        row,
        sheet.getColumn('screenshotEvidence').number,
        execution.evidence,
        definition.id,
        execution.browser,
      );
    }
  }
  styleTableSheet(sheet, 'status');
}

function addExecutionSheet(workbook: ExcelJS.Workbook, executions: ExecutionRow[]): void {
  const sheet = workbook.addWorksheet('Execution Results');
  sheet.columns = [
    { header: 'Sequence', key: 'sequence', width: 11 },
    { header: 'Run Date', key: 'runDate', width: 17 },
    { header: 'Run Time', key: 'runTime', width: 22 },
    { header: 'Executed At (ISO)', key: 'runAt', width: 26 },
    { header: 'Test Case ID', key: 'caseId', width: 15 },
    { header: 'Title', key: 'title', width: 48 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Duration (ms)', key: 'durationMs', width: 15 },
    { header: 'Browser', key: 'browser', width: 16 },
    { header: 'Environment', key: 'environment', width: 15 },
    { header: 'Retry', key: 'retry', width: 9 },
    { header: 'Expected Result', key: 'expectedResult', width: 65 },
    { header: 'Test Data', key: 'testData', width: 55 },
    { header: 'Actual Result', key: 'actualResult', width: 55 },
    { header: 'Screenshot Evidence', key: 'screenshotEvidence', width: 20 },
    { header: 'Screenshot File', key: 'screenshotFile', width: 24 },
    { header: 'Error', key: 'error', width: 80 },
  ];
  [...executions]
    .sort((left, right) => left.sequence - right.sequence || left.runAt.localeCompare(right.runAt))
    .forEach((execution) => {
      const row = sheet.addRow({
        ...execution,
        screenshotEvidence: execution.evidence.status,
        screenshotFile: execution.evidence.status,
      });
      applyEvidenceCells(row, execution.evidence, execution.caseId, execution.browser);
    });
  styleTableSheet(sheet, 'status');
}

function styleTableSheet(sheet: ExcelJS.Worksheet, statusKey: string): void {
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (sheet.columnCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  const statusColumn = sheet.getColumn(statusKey);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };
    const statusCell = row.getCell(statusColumn.number);
    const status = String(statusCell.value || '');
    const color = status === 'Pass' ? 'FFC6EFCE'
      : status === 'Fail' ? 'FFFFC7CE'
        : status === 'Skipped' ? 'FFFFEB9C' : 'FFE7E6E6';
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    };
  }
}

function extractCaseId(test: TestCase): string | null {
  const annotated = test.annotations.find((annotation) => annotation.type === 'caseId')?.description;
  if (annotated) return annotated;
  return test.title.match(/\b[A-Z]{2,4}-\d{3}\b/)?.[0] || null;
}

function excelCaseFor(
  caseId: string,
): AccountExcelCase
  | AgentsExcelCase
  | ToolsExcelCase
  | ConnectorsExcelCase
  | KnowledgeExcelCase
  | GuardrailsExcelCase
  | UiComponentsExcelCase
  | ProductTourExcelCase
  | undefined {
  if (caseId.startsWith('AC-')) return ACCOUNT_EXCEL_CASE_BY_ID.get(caseId);
  if (caseId.startsWith('AF-')) return AGENTS_EXCEL_CASE_BY_ID.get(caseId);
  if (caseId.startsWith('TL-')) return TOOLS_EXCEL_CASE_BY_ID.get(caseId);
  if (caseId.startsWith('CN-')) {
    return CONNECTORS_EXCEL_CASE_BY_ID.get(caseId);
  }
  if (caseId.startsWith('KB-')) {
    return KNOWLEDGE_EXCEL_CASE_BY_ID.get(caseId);
  }
  if (caseId.startsWith('GR-')) {
    return GUARDRAILS_EXCEL_CASE_BY_ID.get(caseId);
  }
  if (caseId.startsWith('UC-')) {
    return UI_COMPONENTS_EXCEL_CASE_BY_ID.get(caseId);
  }
  if (caseId.startsWith('PT-')) {
    return PRODUCT_TOUR_EXCEL_CASE_BY_ID.get(caseId);
  }
  return undefined;
}

function mapStatus(status: TestResult['status']): ExecutionRow['status'] {
  if (status === 'passed') return 'Pass';
  if (status === 'skipped') return 'Skipped';
  return 'Fail';
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find(Boolean)?.trim() || '';
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function countStatuses(rows: ExecutionRow[]): Record<ExecutionRow['status'], number> {
  const counts: Record<ExecutionRow['status'], number> = { Pass: 0, Fail: 0, Skipped: 0 };
  rows.forEach((row) => { counts[row.status] += 1; });
  return counts;
}

function countScreenshots(rows: ExecutionRow[]): number {
  return rows.filter((row) => (
    row.evidence.status === 'Captured'
    && Boolean(row.evidence.relativePath)
  )).length;
}

function extractScreenshotEvidence(
  result: TestResult,
  status: ExecutionRow['status'],
): ScreenshotEvidence {
  const supported = result.attachments.filter((attachment) => (
    Boolean(imageFormat(attachment.contentType))
  ));
  const preferred = supported
    .filter((attachment) => /^case-screenshot-/i.test(attachment.name))
    .reverse();
  const fallback = supported
    .filter((attachment) => /^screenshot$/i.test(attachment.name))
    .reverse();
  const readErrors: string[] = [];

  for (const attachment of [...preferred, ...fallback]) {
    const format = imageFormat(attachment.contentType);
    if (!format) continue;
    try {
      const bytes = readAttachmentBytes(attachment);
      if (!bytes?.length) {
        readErrors.push(`${attachment.name}: attachment had no readable bytes`);
        continue;
      }
      const dimensions = readImageDimensions(bytes, format.extension);
      if (!dimensions) {
        readErrors.push(`${attachment.name}: image dimensions could not be read`);
        continue;
      }
      return {
        status: 'Captured',
        note: `Captured from ${attachment.name} (${dimensions.width} x ${dimensions.height}).`,
        attachmentName: attachment.name,
        contentType: format.contentType,
        extension: format.extension,
        fileExtension: format.fileExtension,
        bytes,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      readErrors.push(
        `${attachment.name}: ${redactSensitiveText((error as Error).message)}`,
      );
    }
  }

  if (status === 'Skipped') {
    return {
      status: 'Skipped',
      note: 'The test was skipped, so no screenshot evidence was captured.',
    };
  }
  return {
    status: 'Unavailable',
    note: readErrors.length > 0
      ? `Screenshot evidence was unavailable. ${readErrors.join('; ')}`
      : 'No case-screenshot-* or Playwright screenshot attachment was produced.',
  };
}

function imageFormat(contentType: string): {
  contentType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpeg';
  fileExtension: 'png' | 'jpg';
} | undefined {
  const normalized = contentType.toLowerCase().split(';', 1)[0].trim();
  if (normalized === 'image/png') {
    return {
      contentType: 'image/png',
      extension: 'png',
      fileExtension: 'png',
    };
  }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return {
      contentType: 'image/jpeg',
      extension: 'jpeg',
      fileExtension: 'jpg',
    };
  }
  return undefined;
}

function readAttachmentBytes(
  attachment: TestResult['attachments'][number],
): Buffer | undefined {
  if (attachment.body?.length) return Buffer.from(attachment.body);
  if (attachment.path && fs.existsSync(attachment.path)) {
    return fs.readFileSync(attachment.path);
  }
  return undefined;
}

function readImageDimensions(
  bytes: Buffer,
  extension: 'png' | 'jpeg',
): { width: number; height: number } | undefined {
  if (extension === 'png') return readPngDimensions(bytes);
  return readJpegDimensions(bytes);
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    offset += segmentLength;
  }
  return undefined;
}

function persistScreenshotEvidence(
  executions: ExecutionRow[],
  outputDir: string,
  runId: string,
): string {
  const relativeFolder = portablePath(path.join('evidence', runId));
  const absoluteFolder = path.join(outputDir, 'evidence', runId);
  fs.mkdirSync(absoluteFolder, { recursive: true });

  for (const execution of executions) {
    const evidence = execution.evidence;
    if (
      evidence.status !== 'Captured'
      || !evidence.bytes
      || !evidence.fileExtension
    ) {
      continue;
    }
    const fileName = [
      sanitizeFilePart(execution.caseId, 'case'),
      sanitizeFilePart(execution.browser, 'unknown-project'),
      `retry-${Math.max(0, execution.retry)}`,
    ].join('--') + `.${evidence.fileExtension}`;
    const absolutePath = path.join(absoluteFolder, fileName);
    const relativePath = portablePath(path.join(relativeFolder, fileName));
    try {
      fs.writeFileSync(absolutePath, evidence.bytes);
      evidence.absolutePath = absolutePath;
      evidence.relativePath = relativePath;
      evidence.note = `${evidence.note} Saved as ${relativePath}.`;
    } catch (error) {
      evidence.status = 'Unavailable';
      evidence.note = 'Screenshot was captured but could not be saved: '
        + redactSensitiveText((error as Error).message);
      evidence.absolutePath = undefined;
      evidence.relativePath = undefined;
    }
  }
  return relativeFolder;
}

function latestExecutionForCase(
  executions: ExecutionRow[],
  caseId: string,
): ExecutionRow | undefined {
  return executions
    .filter((execution) => execution.caseId === caseId)
    .sort((left, right) => (
      right.runAt.localeCompare(left.runAt)
      || right.retry - left.retry
      || right.browser.localeCompare(left.browser)
    ))[0];
}

function applyEvidenceCells(
  row: ExcelJS.Row,
  evidence: ScreenshotEvidence | undefined,
  caseId: string,
  project = '',
): void {
  const status = evidence?.status || 'Not Run';
  const displayStatus = evidenceDisplayLabel(status);
  const note = redactSensitiveText(
    evidence?.note || 'The test case was not executed in this run.',
  );
  const evidenceCell = row.getCell('screenshotEvidence');
  const fileCell = row.getCell('screenshotFile');
  evidenceCell.value = displayStatus;
  evidenceCell.note = note;
  evidenceCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  evidenceCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: evidenceStatusColor(status) },
  };

  if (evidence?.status === 'Captured' && evidence.relativePath) {
    const tooltip = `Open screenshot for ${caseId}${project ? ` (${project})` : ''}`;
    fileCell.value = {
      text: 'Open screenshot',
      hyperlink: evidence.relativePath,
      tooltip,
    };
    fileCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    fileCell.note = note;
  } else {
    fileCell.value = displayStatus;
    fileCell.note = note;
  }
}

function addScreenshotThumbnail(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  columnNumber: number,
  evidence: ScreenshotEvidence,
  caseId: string,
  project: string,
): void {
  if (
    !evidence.absolutePath
    || !evidence.extension
    || !evidence.width
    || !evidence.height
    || !evidence.relativePath
  ) {
    return;
  }
  const imageId = workbook.addImage({
    filename: evidence.absolutePath,
    extension: evidence.extension,
  });
  const size = fitImage(evidence.width, evidence.height, 320, 200);
  sheet.addImage(imageId, {
    tl: { col: columnNumber - 1 + 0.05, row: row.number - 1 + 0.05 },
    ext: size,
    editAs: 'oneCell',
    hyperlinks: {
      hyperlink: evidence.relativePath,
      tooltip: `Open screenshot for ${caseId}${project ? ` (${project})` : ''}`,
    },
  });
  row.height = Math.max(row.height || 15, pixelsToPoints(size.height + 10));
}

function fitImage(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function pixelsToPoints(value: number): number {
  return value * 0.75;
}

function evidenceStatusColor(status: EvidenceStatus | 'Not Run'): string {
  if (status === 'Captured') return 'FFC6EFCE';
  if (status === 'Skipped') return 'FFFFEB9C';
  if (status === 'Unavailable') return 'FFFFC7CE';
  return 'FFE7E6E6';
}

function evidenceDisplayLabel(status: EvidenceStatus | 'Not Run'): string {
  if (status === 'Captured') return 'Captured';
  if (status === 'Skipped') return 'Not captured — Skipped';
  if (status === 'Unavailable') return 'Not captured — Unavailable';
  return 'Not captured — Not Run';
}

function sanitizeFilePart(value: string, fallback: string): string {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return sanitized || fallback;
}

function portablePath(value: string): string {
  return value.split(path.sep).join('/');
}

function createRunId(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-');
}

function extractTestData(result: TestResult): string {
  return result.attachments
    .filter((attachment) => attachment.name === 'test-data')
    .map((attachment) => {
      let value = attachment.body?.toString('utf8') || '';
      if (!value && attachment.path && fs.existsSync(attachment.path)) {
        value = fs.readFileSync(attachment.path, 'utf8');
      }
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return Object.entries(parsed)
          .map(([key, item]) => `${key}: ${formatAttachmentValue(item)}`)
          .join('; ');
      } catch {
        return value;
      }
    })
    .filter(Boolean)
    .join('\n');
}

function redactSensitiveText(value: unknown): string {
  return redactReportText(value, SENSITIVE_VALUES, SUITE_ROOT);
}

function formatAttachmentValue(value: unknown): string {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatRunDateTime(value: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond} IST`,
  };
}

function getReportScope(): ReportScope {
  const value = process.env.REPORT_SCOPE?.trim().toLowerCase();
  if (
    value === 'all'
    || value === 'e2e'
    || value === 'account'
    || value === 'agents'
    || value === 'tools'
    || value === 'connectors'
    || value === 'knowledge'
    || value === 'guardrails'
    || value === 'ui-components'
    || value === 'product-tour'
  ) {
    return value;
  }
  return implicitExcelReportScope();
}
