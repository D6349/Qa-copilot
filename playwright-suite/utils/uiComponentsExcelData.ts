import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface UiComponentsExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface UiComponentsExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: UiComponentsExcelCase[];
}

export type UiComponentExcelTokenValues = Record<
  string,
  string | number | boolean
>;

let cachedRuntime: UiComponentsExcelRuntime | undefined;

export function loadUiComponentsExcelRuntime(): UiComponentsExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.UI_COMPONENTS_DATA_RUNTIME_FILE
    ? path.resolve(process.env.UI_COMPONENTS_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'ui-components-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'UI Components Excel runtime is missing. '
      + 'Run npm.cmd run prepare:ui-components:data.',
    );
  }

  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as UiComponentsExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid UI Components Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'UI Components Excel workbook no longer exists: '
      + parsed.sourceWorkbook,
    );
  }

  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'UI Components Excel changed. '
      + 'Run npm.cmd run prepare:ui-components:data.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireUiComponentsExcelCase(
  runtime: UiComponentsExcelRuntime,
  caseId: string,
): UiComponentsExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing UI Components Excel case: ' + caseId);
  return row;
}

export function requireUiComponentsExcelSetting(
  runtime: UiComponentsExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing UI Components Excel setting: ' + key);
  }
  return value;
}

export function resolveUiComponentsExcelTokens<T>(
  value: T,
  tokens: UiComponentExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (_match, token: string) => {
        if (!(token in tokens)) {
          throw new Error(
            'Unknown UI Components Excel token: {{' + token + '}}',
          );
        }
        return String(tokens[token]);
      },
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => resolveUiComponentsExcelTokens(item, tokens),
    ) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [
          key,
          resolveUiComponentsExcelTokens(item, tokens),
        ]),
    );
    return resolved as T;
  }

  return value;
}
