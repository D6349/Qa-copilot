import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext } from '@playwright/test';
import type { AuthConfig } from '../config/environment';
import { AppShellPage } from '../pages/app-shell.page';

export function hasUsableStorageState(storagePath: string): boolean {
  if (!fs.existsSync(storagePath)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as {
      cookies?: unknown[];
      origins?: unknown[];
    };
    return Boolean(state.cookies?.length || state.origins?.length);
  } catch {
    return false;
  }
}

export async function validateStoredSession(
  browser: Browser,
  config: AuthConfig,
): Promise<boolean> {
  if (!hasUsableStorageState(config.storagePath)) return false;

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: config.storagePath,
  });
  try {
    const page = await context.newPage();
    const shell = new AppShellPage(page);
    await shell.gotoValidation(config.validationUrl, config.timeoutMs);
    return await shell.isAuthenticated(config.baseURL);
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

export async function saveStorageStateSafely(
  context: BrowserContext,
  storagePath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const temporaryFile = `${storagePath}.${process.pid}.tmp`;
  try {
    await context.storageState({ path: temporaryFile });
    fs.copyFileSync(temporaryFile, storagePath);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.rmSync(temporaryFile, { force: true });
  }
}
