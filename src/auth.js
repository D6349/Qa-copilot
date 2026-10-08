/**
 * auth.js - get a logged-in browser session and keep it.
 *
 * Three ways in, in order of reliability:
 *
 *   manual    opens a real browser window, you log in by hand, press Enter.
 *             Handles OTP, SSO, captcha, MFA — anything a script cannot.
 *   auto      fills a username/password form headlessly.
 *   cookie    paste cookies copied from your own browser's devtools.
 *
 * All three end the same way: a Playwright storageState JSON on disk, which the
 * scanner and the runner both load. One login, many scans.
 */
import fs from 'node:fs';
import path from 'node:path';

export function authPath(workspace, projectId) {
  return path.join(workspace, 'auth', `${projectId || 'default'}.json`);
}

export function hasSession(workspace, projectId) {
  return fs.existsSync(authPath(workspace, projectId));
}

/** Age and cookie expiry of a saved session, so you know before a scan fails. */
export function sessionInfo(workspace, projectId) {
  const file = authPath(workspace, projectId);
  if (!fs.existsSync(file)) return { exists: false };
  const stat = fs.statSync(file);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* corrupt */ }
  const cookies = state.cookies || [];
  const now = Date.now() / 1000;
  const expiring = cookies
    .filter((c) => c.expires && c.expires > 0)
    .sort((a, b) => a.expires - b.expires)[0];

  return {
    exists: true,
    file,
    savedAt: stat.mtime.toISOString(),
    ageHours: Math.round((Date.now() - stat.mtimeMs) / 3600000 * 10) / 10,
    cookies: cookies.length,
    origins: (state.origins || []).length,
    hosts: [...new Set(cookies.map((c) => c.domain))],
    soonestCookieExpiry: expiring ? new Date(expiring.expires * 1000).toISOString() : null,
    alreadyExpired: expiring ? expiring.expires < now : false,
  };
}

async function launch(headless = true) {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless });
}

/**
 * Open a real browser, let a human log in, then save the session.
 * The only approach that survives OTP and SSO.
 */
export async function loginManual({ url, workspace, projectId, waitFor = null, timeoutMs = 300000 }) {
  const browser = await launch(false);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const file = authPath(workspace, projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (waitFor) {
    // Caller gave us a signal — wait for it rather than for a keypress.
    await page.waitForURL(waitFor, { timeout: timeoutMs }).catch(() => {});
  } else {
    process.stderr.write(
      '\n  A browser window is open.\n'
      + '  Log in there — including any OTP or SSO step.\n'
      + '  When you can see the logged-in application, come back here and press Enter.\n\n',
    );
    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
  }

  const finalUrl = page.url();
  await context.storageState({ path: file });
  const cookieCount = (JSON.parse(fs.readFileSync(file, 'utf8')).cookies || []).length;
  await browser.close();

  if (cookieCount === 0) {
    throw new Error(
      'No cookies were saved. Either the login did not complete, or this app keeps its '
      + 'session in localStorage only — in which case scanning will still work, but check '
      + 'the scan result carefully.',
    );
  }
  return { file, finalUrl, cookies: cookieCount };
}

/**
 * Headless username/password login. Selectors are guessed from the page unless
 * you override them. Fails loudly rather than saving a half-logged-in session.
 */
export async function loginAuto({
  url, username, password, workspace, projectId,
  userSelector, passSelector, submitSelector,
  successUrl, headless = true,
}) {
  const browser = await launch(headless);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const user = userSelector
      ? page.locator(userSelector)
      : page.locator(
        'input[type=email], input[name*=user i], input[name*=email i], '
        + 'input[id*=user i], input[id*=email i], input[autocomplete=username]',
      ).first();

    const pass = passSelector
      ? page.locator(passSelector)
      : page.locator('input[type=password]').first();

    if (!await user.count()) throw new Error('Could not find a username field. Pass --user-selector.');
    if (!await pass.count()) throw new Error('Could not find a password field. Pass --pass-selector.');

    await user.fill(username);
    await pass.fill(password);

    const submit = submitSelector
      ? page.locator(submitSelector)
      : page.getByRole('button', { name: /log ?in|sign ?in|submit|continue|proceed/i }).first();

    const before = page.url();
    if (await submit.count()) await submit.click();
    else await pass.press('Enter');

    if (successUrl) {
      await page.waitForURL(successUrl, { timeout: 30000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const after = page.url();
    const stillOnLogin = /log ?in|sign ?in|auth/i.test(after) && after === before;
    const visibleError = await page.locator(
      '[role=alert], .error, .alert-danger, [class*=error i]',
    ).first().textContent().catch(() => null);

    if (stillOnLogin) {
      throw new Error(
        `Login did not navigate away from ${after}.`
        + (visibleError ? ` The page says: "${visibleError.trim().slice(0, 120)}"` : '')
        + ' If this app uses OTP or SSO, use --manual instead.',
      );
    }

    const file = authPath(workspace, projectId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
    const cookies = (JSON.parse(fs.readFileSync(file, 'utf8')).cookies || []).length;

    if (cookies === 0) {
      throw new Error('Login appeared to succeed but no cookies were set. Use --manual to verify by eye.');
    }
    return { file, finalUrl: after, cookies };
  } finally {
    await browser.close();
  }
}

/** Build a storageState from cookies copied out of devtools. No browser needed. */
export function loginFromCookies({ cookieString, domain, workspace, projectId }) {
  const cookies = cookieString.split(';').map((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return null;
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: domain.startsWith('.') ? domain : `.${domain}`,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    };
  }).filter(Boolean);

  if (!cookies.length) throw new Error('No name=value pairs found in that cookie string.');

  const file = authPath(workspace, projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ cookies, origins: [] }, null, 2));
  return { file, cookies: cookies.length };
}

/**
 * Load a page with the saved session and decide whether we are actually logged
 * in — a scan of a login page that silently returns 200 is the worst outcome,
 * because it looks like a result.
 */
export async function verifySession({ url, workspace, projectId }) {
  const file = authPath(workspace, projectId);
  if (!fs.existsSync(file)) return { valid: false, reason: 'No saved session. Run "login" first.' };

  const browser = await launch(true);
  try {
    const context = await browser.newContext({ storageState: file, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    const finalUrl = page.url();
    const status = res ? res.status() : null;
    const passwordFields = await page.locator('input[type=password]').count();
    const looksLikeLogin = /log ?in|sign ?in|auth|sso/i.test(finalUrl) || passwordFields > 0;

    return {
      valid: !looksLikeLogin && status < 400,
      status,
      finalUrl,
      redirected: finalUrl !== url,
      reason: looksLikeLogin
        ? `Landed on what looks like a login page (${finalUrl}). The session has expired or was never valid — run "login" again.`
        : status >= 400
          ? `Server returned ${status}.`
          : null,
    };
  } finally {
    await browser.close();
  }
}
