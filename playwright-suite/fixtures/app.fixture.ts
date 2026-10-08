import {
  test as base,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { AccountPage } from '../pages/account.page';
import { AgentsPage } from '../pages/agents.page';
import { AppShellPage } from '../pages/app-shell.page';
import { ConnectorsPage } from '../pages/connectors.page';
import { GuardrailsPage } from '../pages/guardrails.page';
import { KnowledgePage } from '../pages/knowledge.page';
import { LoginPage } from '../pages/login.page';
import { ProductTourPage } from '../pages/product-tour.page';
import { ToolsPage } from '../pages/tools.page';
import { UiComponentsPage } from '../pages/ui-components.page';
import { TaskPage } from '../pages/task.page';

export interface AppFixtures {
  accountPage: AccountPage;
  agentsPage: AgentsPage;
  appShellPage: AppShellPage;
  connectorsPage: ConnectorsPage;
  guardrailsPage: GuardrailsPage;
  knowledgePage: KnowledgePage;
  loginPage: LoginPage;
  productTourPage: ProductTourPage;
  toolsPage: ToolsPage;
  uiComponentsPage: UiComponentsPage;
  taskPage: TaskPage;
}

interface EvidenceFixtures {
  caseScreenshotEvidence: void;
}

const CAPTURE_STATUSES = new Set([
  'passed',
  'failed',
  'timedOut',
  'interrupted',
]);

const SENSITIVE_EVIDENCE_SELECTORS = [
  '[data-evidence-mask]',
  'input[type="password"]',
  'input[type="email"]',
  'input[autocomplete="username" i]',
  'input[autocomplete="current-password" i]',
  'input[autocomplete="new-password" i]',
  'input[autocomplete="one-time-code" i]',
  'input[name*="password" i]',
  'input[id*="password" i]',
  'input[name*="username" i]',
  'input[id*="username" i]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[name*="otp" i]',
  'input[id*="otp" i]',
  'input[name*="mfa" i]',
  'input[id*="mfa" i]',
  ':is(input, textarea, [contenteditable="true"])[name*="secret" i]',
  ':is(input, textarea, [contenteditable="true"])[id*="secret" i]',
  ':is(input, textarea, [contenteditable="true"])[aria-label*="secret" i]',
  ':is(input, textarea, [contenteditable="true"])[name*="token" i]',
  ':is(input, textarea, [contenteditable="true"])[id*="token" i]',
  ':is(input, textarea, [contenteditable="true"])[aria-label*="token" i]',
  ':is(input, textarea, [contenteditable="true"])[name*="api-key" i]',
  ':is(input, textarea, [contenteditable="true"])[name*="api_key" i]',
  ':is(input, textarea, [contenteditable="true"])[name*="apikey" i]',
  ':is(input, textarea, [contenteditable="true"])[id*="api-key" i]',
  ':is(input, textarea, [contenteditable="true"])[id*="api_key" i]',
  ':is(input, textarea, [contenteditable="true"])[id*="apikey" i]',
  ':is(input, textarea, [contenteditable="true"])[aria-label*="api key" i]',
].join(', ');

/** Lazy, test-scoped Page Object fixtures for every maintained June module. */
export const test = base.extend<AppFixtures & EvidenceFixtures>({
  caseScreenshotEvidence: [async ({ page }, use, testInfo) => {
    try {
      await use();
    } finally {
      await captureCaseScreenshot(page, testInfo);
    }
  }, { auto: true }],
  accountPage: async ({ page }, use) => { await use(new AccountPage(page)); },
  agentsPage: async ({ page }, use) => { await use(new AgentsPage(page)); },
  appShellPage: async ({ page }, use) => { await use(new AppShellPage(page)); },
  connectorsPage: async ({ page }, use) => { await use(new ConnectorsPage(page)); },
  guardrailsPage: async ({ page }, use) => { await use(new GuardrailsPage(page)); },
  knowledgePage: async ({ page }, use) => { await use(new KnowledgePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  productTourPage: async ({ page }, use) => {
    await use(new ProductTourPage(page));
  },
  toolsPage: async ({ page }, use) => { await use(new ToolsPage(page)); },
  uiComponentsPage: async ({ page }, use) => {
    await use(new UiComponentsPage(page));
  },
  taskPage: async ({ page }, use) => {
    await use(new TaskPage(page));
  },
});

export { expect };

async function captureCaseScreenshot(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const caseId = resolveCaseId(testInfo);
  const hasMaskedCrossUserEvidence = process.env.SENSITIVE_EMPLOYEE_ACCESS_RUN === '1'
    && testInfo.attachments.some((attachment) => (
      /^case-screenshot-cross-user-/i.test(attachment.name)
    ));
  if (
    !caseId
    || !CAPTURE_STATUSES.has(testInfo.status || '')
    || page.isClosed()
    || hasMaskedCrossUserEvidence
  ) {
    return;
  }

  const currentUrl = page.url();
  if (
    !currentUrl
    || currentUrl === 'about:blank'
    || isAuthenticationUrl(currentUrl)
  ) {
    return;
  }

  try {
    const warnings: string[] = [];
    const mask = await evidenceMasks(page, warnings);
    const viewport = page.viewportSize() || await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const body = await page.screenshot({
      type: 'jpeg',
      quality: 68,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      mask,
      maskColor: '#202124',
    });

    await testInfo.attach(`case-screenshot-${width}x${height}`, {
      body,
      contentType: 'image/jpeg',
    });

    if (warnings.length > 0) {
      await attachScreenshotWarning(testInfo, caseId, warnings.join('\n'));
    }
  } catch (error) {
    await attachScreenshotWarning(testInfo, caseId, errorMessage(error));
  }
}

function resolveCaseId(testInfo: TestInfo): string | null {
  const annotated = testInfo.annotations
    .find((annotation) => annotation.type === 'caseId')
    ?.description?.trim();
  if (annotated && /^[A-Z]{2,4}-\d{3}$/.test(annotated)) {
    return annotated;
  }
  return testInfo.title.match(/\b[A-Z]{2,4}-\d{3}\b/)?.[0] || null;
}

function isAuthenticationUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const searchable = [url.hostname, url.pathname, url.search, url.hash]
      .join(' ');
    return /\b(?:login|sign[-_]?in|auth(?:entication)?|otp|mfa)\b/i
      .test(searchable);
  } catch {
    return true;
  }
}

async function evidenceMasks(
  page: Page,
  warnings: string[],
): Promise<Locator[]> {
  const masks = [page.locator(SENSITIVE_EVIDENCE_SELECTORS)];
  const extraSelectors = (process.env.EVIDENCE_MASK_SELECTORS || '')
    .split(';')
    .map((selector) => selector.trim())
    .filter(Boolean);

  for (const selector of extraSelectors) {
    const locator = page.locator(selector);
    try {
      // Force selector parsing before screenshot so one typo cannot prevent all
      // evidence capture or disable the built-in privacy masks.
      await locator.count();
      masks.push(locator);
    } catch (error) {
      warnings.push(
        `Ignored invalid EVIDENCE_MASK_SELECTORS entry "${selector}": ${errorMessage(error)}`,
      );
    }
  }

  return masks;
}

async function attachScreenshotWarning(
  testInfo: TestInfo,
  caseId: string,
  detail: string,
): Promise<void> {
  const message = `${caseId}: final-state screenshot was not fully captured. ${detail}`
    .slice(0, 4_000);
  console.warn(`[evidence] ${message}`);
  await testInfo.attach('case-screenshot-warning', {
    body: Buffer.from(message, 'utf8'),
    contentType: 'text/plain',
  }).catch(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
