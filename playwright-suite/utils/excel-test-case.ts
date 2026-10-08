import type { TestInfo } from '@playwright/test';
import {
  redactSensitiveReportData,
  repositoryRelativePath,
} from './report-privacy';

export interface ExcelCaseMetadata {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
}

export interface PrepareExcelCaseOptions {
  caseId: string;
  excelCase: ExcelCaseMetadata;
  sourceWorkbook: string;
  resolvedData: unknown;
  additionalData?: Record<string, unknown>;
}

export function extractExcelCaseId(title: string, prefix: string): string {
  const caseId = title.match(new RegExp(`\\b${prefix}-\\d{3}\\b`))?.[0];
  if (!caseId) {
    throw new Error(`Unable to find a ${prefix}-* case ID in: ${title}`);
  }
  return caseId;
}

export async function prepareExcelCase(
  testInfo: TestInfo,
  options: PrepareExcelCaseOptions,
): Promise<void> {
  const { caseId, excelCase, sourceWorkbook, resolvedData, additionalData } = options;
  const inputWorkbook = repositoryRelativePath(sourceWorkbook);
  const reportSafeResolvedData = redactSensitiveReportData(resolvedData);
  testInfo.skip(
    !excelCase.execute,
    `Disabled by Execute=NO in ${inputWorkbook}`,
  );
  testInfo.annotations.push(
    { type: 'caseId', description: caseId },
    { type: 'dataSource', description: 'Excel' },
    { type: 'expected', description: excelCase.expectedResult },
  );
  await attachJsonEvidence(testInfo, {
    ...additionalData,
    dataSource: 'Excel',
    inputWorkbook,
    excelSequence: excelCase.sequence,
    excelCaseTitle: excelCase.title,
    excelTestData: JSON.stringify(reportSafeResolvedData),
  });
}

export async function attachJsonEvidence(
  testInfo: TestInfo,
  data: Record<string, unknown>,
): Promise<void> {
  const reportSafeData = redactSensitiveReportData(data);
  await testInfo.attach('test-data', {
    body: Buffer.from(JSON.stringify(reportSafeData)),
    contentType: 'application/json',
  });
}
