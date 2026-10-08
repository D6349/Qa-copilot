import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface ConnectorsExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface ConnectorsExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: ConnectorsExcelCase[];
}

export type ConnectorExcelTokenValues = Record<string, string | number | boolean>;

let cachedRuntime: ConnectorsExcelRuntime | undefined;

export function loadConnectorsExcelRuntime(): ConnectorsExcelRuntime {
  if (cachedRuntime) return cachedRuntime;

  const runtimePath = process.env.CONNECTORS_DATA_RUNTIME_FILE
    ? path.resolve(process.env.CONNECTORS_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'connectors-data.json');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Connectors Excel runtime is missing. Run npm.cmd run prepare:connectors:data.',
    );
  }

  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as ConnectorsExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid Connectors Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error('Connectors Excel workbook no longer exists: ' + parsed.sourceWorkbook);
  }

  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error('Connectors Excel changed. Run npm.cmd run prepare:connectors:data.');
  }

  cachedRuntime = parsed;
  return parsed;
}

export function requireConnectorsExcelCase(
  runtime: ConnectorsExcelRuntime,
  caseId: string,
): ConnectorsExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Connectors Excel case: ' + caseId);
  return row;
}

export function requireConnectorsExcelSetting(
  runtime: ConnectorsExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing Connectors Excel setting: ' + key);
  }
  return value;
}

export function resolveConnectorExcelTokens<T>(
  value: T,
  tokens: ConnectorExcelTokenValues,
): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, token: string) => {
      if (!(token in tokens)) {
        throw new Error('Unknown Connectors Excel token: {{' + token + '}}');
      }
      return String(tokens[token]);
    }) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveConnectorExcelTokens(item, tokens)) as T;
  }

  if (value && typeof value === 'object') {
    const resolved = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, resolveConnectorExcelTokens(item, tokens)]),
    );
    return resolved as T;
  }

  return value;
}
