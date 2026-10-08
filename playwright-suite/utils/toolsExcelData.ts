import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface ToolsExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface ToolsExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: ToolsExcelCase[];
}

export type ExcelTokenValues = Record<string, string | number | boolean>;

let cachedRuntime: ToolsExcelRuntime | undefined;

export function loadToolsExcelRuntime(): ToolsExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.TOOLS_DATA_RUNTIME_FILE
    ? path.resolve(process.env.TOOLS_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'tools-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Excel runtime data is missing. Run "npm.cmd run prepare:tools:data" '
      + 'or start the suite with an npm test:tools command.',
    );
  }

  const parsed = JSON.parse(fs.readFileSync(runtimePath, 'utf8')) as ToolsExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Excel runtime data has an invalid structure: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error('Excel input workbook no longer exists: ' + parsed.sourceWorkbook);
  }

  const workbookModifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (workbookModifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Excel input workbook changed after preparation. Run '
      + '"npm.cmd run prepare:tools:data" before Playwright.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireToolsExcelCase(
  runtime: ToolsExcelRuntime,
  caseId: string,
): ToolsExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Test case is missing from the Excel input: ' + caseId);
  return row;
}

export function requireToolsExcelSetting(
  runtime: ToolsExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Required Settings value is missing from Excel: ' + key);
  }
  return value;
}

export function resolveExcelTokens<T>(
  value: T,
  tokens: ExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, token: string) => {
      if (!(token in tokens)) {
        throw new Error('Unknown Excel data token: {{' + token + '}}');
      }
      return String(tokens[token]);
    }) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveExcelTokens(item, tokens)) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, resolveExcelTokens(item, tokens)]),
    );
    return resolved as T;
  }

  return value;
}
