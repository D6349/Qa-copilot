import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';
import { repositoryRelativePath } from './report-privacy';

export interface KnowledgeExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface KnowledgeExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: KnowledgeExcelCase[];
}

export type KnowledgeExcelTokenValues = Record<
  string,
  string | number | boolean
>;

let cachedRuntime: KnowledgeExcelRuntime | undefined;

export function loadKnowledgeExcelRuntime(): KnowledgeExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.KNOWLEDGE_DATA_RUNTIME_FILE
    ? path.resolve(process.env.KNOWLEDGE_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'knowledge-data.json');
  const runtimeDisplayPath = repositoryRelativePath(runtimePath);

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Knowledge Excel runtime is missing. '
      + `Expected ${runtimeDisplayPath}. `
      + 'Run npm.cmd run prepare:knowledge:data.',
    );
  }

  let parsed: KnowledgeExcelRuntime;
  try {
    parsed = JSON.parse(
      fs.readFileSync(runtimePath, 'utf8'),
    ) as KnowledgeExcelRuntime;
  } catch {
    throw new Error(
      'Knowledge Excel runtime could not be read or parsed: '
      + runtimeDisplayPath + '. Run npm.cmd run prepare:knowledge:data.',
    );
  }
  if (
    typeof parsed.sourceWorkbook !== 'string'
    || !parsed.sourceWorkbook
    || !Array.isArray(parsed.cases)
    || !parsed.settings
  ) {
    throw new Error('Invalid Knowledge Excel runtime: ' + runtimeDisplayPath);
  }
  const sourceWorkbookDisplayPath = repositoryRelativePath(parsed.sourceWorkbook);
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'Knowledge Excel workbook no longer exists: '
      + sourceWorkbookDisplayPath,
    );
  }

  let modifiedMs: number;
  try {
    modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  } catch {
    throw new Error(
      'Knowledge Excel workbook could not be inspected: '
      + sourceWorkbookDisplayPath,
    );
  }
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Knowledge Excel changed. Run npm.cmd run prepare:knowledge:data.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireKnowledgeExcelCase(
  runtime: KnowledgeExcelRuntime,
  caseId: string,
): KnowledgeExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Knowledge Excel case: ' + caseId);
  return row;
}

export function requireKnowledgeExcelSetting(
  runtime: KnowledgeExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing Knowledge Excel setting: ' + key);
  }
  return value;
}

export function resolveKnowledgeExcelTokens<T>(
  value: T,
  tokens: KnowledgeExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (_match, token: string) => {
        if (!(token in tokens)) {
          throw new Error('Unknown Knowledge Excel token: {{' + token + '}}');
        }
        return String(tokens[token]);
      },
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => resolveKnowledgeExcelTokens(item, tokens),
    ) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [
          key,
          resolveKnowledgeExcelTokens(item, tokens),
        ]),
    );
    return resolved as T;
  }

  return value;
}
