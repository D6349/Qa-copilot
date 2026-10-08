import { test as setup } from '@playwright/test';
import { loadAuthConfig } from '../../config/environment';
import { AppShellPage } from '../../pages/app-shell.page';
import { LoginPage } from '../../pages/login.page';
import {
  saveStorageStateSafely,
  validateStoredSession,
} from '../../utils/auth-session';

setup('authenticate and cache the June session', async ({ browser, baseURL }) => {
  const auth = loadAuthConfig(baseURL);
  setup.setTimeout(auth.timeoutMs * 2);

  if (!auth.forceLogin && await validateStoredSession(browser, auth)) {
    console.log(
      `[auth] Reusing verified ${auth.identity} session: ${auth.storagePath}`,
    );
    return;
  }
  if (!auth.username || !auth.password) {
    const manualCommand = auth.identity === 'owner'
      ? `auth:login:${auth.environment}`
      : `auth:login:${auth.identity}:${auth.environment}`;
    throw new Error(
      `No valid reusable session was found at ${auth.storagePath}. `
      + `Set ${auth.usernameKey} and ${auth.passwordKey} in playwright-suite/.env, `
      + `or run "npm.cmd run ${manualCommand}" for manual OTP/MFA login.`,
    );
  }

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    const login = new LoginPage(page);
    const shell = new AppShellPage(page);
    await login.goto(auth.loginUrl, auth.timeoutMs);
    await login.submitCredentials(
      auth.username,
      auth.password,
      auth.baseURL,
      auth.timeoutMs,
    );
    await shell.gotoValidation(auth.validationUrl, auth.timeoutMs);
    await shell.expectAuthenticated(auth.baseURL);
    await saveStorageStateSafely(context, auth.storagePath);
    console.log(
      `[auth] Saved verified ${auth.identity} session: ${auth.storagePath}`,
    );
  } catch (error) {
    throw new Error(
      'Automatic login did not reach the authenticated Task page. '
      + 'Run the matching identity-specific auth:login command for manual '
      + 'OTP/MFA completion. '
      + 'No session was saved.',
      { cause: error },
    );
  } finally {
    await context.close();
  }
});
