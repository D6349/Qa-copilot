import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface GuardrailsExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface GuardrailsExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: GuardrailsExcelCase[];
}

export type GuardrailExcelTokenValues = Record<
  string,
  string | number | boolean
>;

let cachedRuntime: GuardrailsExcelRuntime | undefined;

export function loadGuardrailsExcelRuntime(): GuardrailsExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.GUARDRAILS_DATA_RUNTIME_FILE
    ? path.resolve(process.env.GUARDRAILS_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'guardrails-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Guardrails Excel runtime is missing. '
      + 'Run npm.cmd run prepare:guardrails:data.',
    );
  }

  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as GuardrailsExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid Guardrails Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'Guardrails Excel workbook no longer exists: ' + parsed.sourceWorkbook,
    );
  }

  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Guardrails Excel changed. Run npm.cmd run prepare:guardrails:data.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireGuardrailsExcelCase(
  runtime: GuardrailsExcelRuntime,
  caseId: string,
): GuardrailsExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Guardrails Excel case: ' + caseId);
  return row;
}

export function requireGuardrailsExcelSetting(
  runtime: GuardrailsExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing Guardrails Excel setting: ' + key);
  }
  return value;
}

export function resolveGuardrailExcelTokens<T>(
  value: T,
  tokens: GuardrailExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (_match, token: string) => {
        if (!(token in tokens)) {
          throw new Error('Unknown Guardrails Excel token: {{' + token + '}}');
        }
        return String(tokens[token]);
      },
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => resolveGuardrailExcelTokens(item, tokens),
    ) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [
          key,
          resolveGuardrailExcelTokens(item, tokens),
        ]),
    );
    return resolved as T;
  }

  return value;
}
