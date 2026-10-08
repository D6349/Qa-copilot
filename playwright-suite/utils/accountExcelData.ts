import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface AccountExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface AccountExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: AccountExcelCase[];
}

export type AccountExcelTokenValues = Record<
  string,
  string | number | boolean
>;

let cachedRuntime: AccountExcelRuntime | undefined;

export function loadAccountExcelRuntime(): AccountExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.ACCOUNT_DATA_RUNTIME_FILE
    ? path.resolve(process.env.ACCOUNT_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'account-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Account Excel runtime is missing. '
      + 'Run npm.cmd run prepare:account:data.',
    );
  }

  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as AccountExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid Account Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'Account Excel workbook no longer exists: '
      + parsed.sourceWorkbook,
    );
  }

  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Account Excel changed. '
      + 'Run npm.cmd run prepare:account:data.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireAccountExcelCase(
  runtime: AccountExcelRuntime,
  caseId: string,
): AccountExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Account Excel case: ' + caseId);
  return row;
}

export function requireAccountExcelSetting(
  runtime: AccountExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing Account Excel setting: ' + key);
  }
  return value;
}

export function resolveAccountExcelTokens<T>(
  value: T,
  tokens: AccountExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (_match, token: string) => {
        if (!(token in tokens)) {
          throw new Error(
            'Unknown Account Excel token: {{' + token + '}}',
          );
        }
        return String(tokens[token]);
      },
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => resolveAccountExcelTokens(item, tokens),
    ) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [
          key,
          resolveAccountExcelTokens(item, tokens),
        ]),
    );
    return resolved as T;
  }

  return value;
}
