import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentArtifactPath } from '../config/environment';

export interface ProductTourExcelCase {
  sequence: number;
  execute: boolean;
  id: string;
  title: string;
  expectedResult: string;
  data: unknown;
  notes: string;
}

export interface ProductTourExcelRuntime {
  sourceWorkbook: string;
  sourceModifiedMs: number;
  preparedAt: string;
  settings: Record<string, string>;
  cases: ProductTourExcelCase[];
}

let cachedRuntime: ProductTourExcelRuntime | undefined;

export function loadProductTourExcelRuntime(): ProductTourExcelRuntime {
  if (cachedRuntime) return cachedRuntime;
  const runtimePath = process.env.PRODUCT_TOUR_DATA_RUNTIME_FILE
    ? path.resolve(process.env.PRODUCT_TOUR_DATA_RUNTIME_FILE)
    : resolveEnvironmentArtifactPath('runtime', 'product-tour-data.json');
  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      'Product Tour Excel runtime is missing. '
      + 'Run npm.cmd run prepare:product-tour:data.',
    );
  }
  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, 'utf8'),
  ) as ProductTourExcelRuntime;
  if (!parsed.sourceWorkbook || !Array.isArray(parsed.cases) || !parsed.settings) {
    throw new Error('Invalid Product Tour Excel runtime: ' + runtimePath);
  }
  if (!fs.existsSync(parsed.sourceWorkbook)) {
    throw new Error(
      'Product Tour Excel workbook no longer exists: ' + parsed.sourceWorkbook,
    );
  }
  const modifiedMs = Math.trunc(fs.statSync(parsed.sourceWorkbook).mtimeMs);
  if (modifiedMs !== Math.trunc(parsed.sourceModifiedMs)) {
    throw new Error(
      'Product Tour Excel changed. '
      + 'Run npm.cmd run prepare:product-tour:data.',
    );
  }
  cachedRuntime = parsed;
  return parsed;
}

export function requireProductTourExcelCase(
  runtime: ProductTourExcelRuntime,
  caseId: string,
): ProductTourExcelCase {
  const row = runtime.cases.find((item) => item.id === caseId);
  if (!row) throw new Error('Missing Product Tour Excel case: ' + caseId);
  return row;
}

export function requireProductTourExcelSetting(
  runtime: ProductTourExcelRuntime,
  key: string,
): string {
  const value = runtime.settings[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing Product Tour Excel setting: ' + key);
  }
  return value;
}
