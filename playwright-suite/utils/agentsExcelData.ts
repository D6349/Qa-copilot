import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface AgentsExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface AgentsExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: AgentsExcelCase[];
}

export type AgentExcelTokenValues = Record<
  string,
  string | number | boolean
>;

let cachedRuntime: AgentsExcelRuntime | undefined;

export function loadAgentsExcelRuntime(): AgentsExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.AGENTS_DATA_RUNTIME_FILE
    ? path.resolve(process.env.AGENTS_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'agents-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Agents Excel runtime is missing. '
      + 'Run npm.cmd run prepare:agents:data.',
    );
  }

  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as AgentsExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid Agents Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'Agents Excel workbook no longer exists: '
      + parsed.sourceWorkbook,
    );
  }

  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Agents Excel changed. '
      + 'Run npm.cmd run prepare:agents:data.',
    );
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireAgentsExcelCase(
  runtime: AgentsExcelRuntime,
  caseId: string,
): AgentsExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Agents Excel case: ' + caseId);
  return row;
}

export function requireAgentsExcelSetting(
  runtime: AgentsExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing Agents Excel setting: ' + key);
  }
  return value;
}

export function resolveAgentsExcelTokens<T>(
  value: T,
  tokens: AgentExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (_match, token: string) => {
        if (!(token in tokens)) {
          throw new Error(
            'Unknown Agents Excel token: {{' + token + '}}',
          );
        }
        return String(tokens[token]);
      },
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => resolveAgentsExcelTokens(item, tokens),
    ) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [
          key,
          resolveAgentsExcelTokens(item, tokens),
        ]),
    );
    return resolved as T;
  }

  return value;
}
