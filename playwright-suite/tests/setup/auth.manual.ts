import { expect, test } from '@playwright/test';
import { loadAuthConfig } from '../../config/environment';
import { AppShellPage } from '../../pages/app-shell.page';
import { LoginPage } from '../../pages/login.page';
import {
  hasUsableStorageState,
  saveStorageStateSafely,
  validateStoredSession,
} from '../../utils/auth-session';

test('complete login and save a verified reusable session', async ({ browser, baseURL }) => {
  const auth = loadAuthConfig(baseURL);
  test.setTimeout(auth.manualTimeoutMs + auth.timeoutMs);

  if (!auth.forceLogin && await validateStoredSession(browser, auth)) {
    console.log(
      `[auth] Existing ${auth.identity} session is valid: ${auth.storagePath}`,
    );
    return;
  }

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    ...(!auth.forceLogin && hasUsableStorageState(auth.storagePath)
      ? { storageState: auth.storagePath }
      : {}),
  });
  try {
    const page = await context.newPage();
    const login = new LoginPage(page);
    const shell = new AppShellPage(page);
    await login.goto(auth.loginUrl, auth.timeoutMs);

    if (auth.username && auth.password) {
      await login.submitCredentials(
        auth.username,
        auth.password,
        auth.baseURL,
        auth.timeoutMs,
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[auth] Continue the visible login manually: ${message}`);
      });
    }

    console.log(
      `[auth] Complete the ${auth.environment} ${auth.identity} login/OTP/MFA in Chrome. `
      + 'The test will save the session automatically when the June Task page appears.',
    );
    await expect.poll(
      () => shell.isAuthenticated(auth.baseURL, 1_000),
      {
        timeout: auth.manualTimeoutMs,
        intervals: [1_000],
        message: 'Waiting for the authenticated June Task page',
      },
    ).toBe(true);

    await saveStorageStateSafely(context, auth.storagePath);
    console.log(
      `[auth] Saved verified reusable ${auth.identity} session: ${auth.storagePath}`,
    );
  } finally {
    await context.close();
  }
});
