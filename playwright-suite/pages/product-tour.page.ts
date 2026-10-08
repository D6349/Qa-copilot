import { expect, type Locator, type Page } from '@playwright/test';

export const PRODUCT_TOUR_ENTRIES = [
  'Platform Overview',
  'Agents',
  'Tools',
  'Connectors',
  'Knowledge',
  'Guardrails',
  'UI components',
  'Inbox',
] as const;

export type ProductTourEntry = typeof PRODUCT_TOUR_ENTRIES[number];

export interface ProductTourFlow {
  tourEntry: ProductTourEntry;
  expectedStartPath: string;
  expectedFinalPath: string;
  steps: string[];
}

/** Stable actions for the cross-module Explore June AI guided tours. */
export class ProductTourPage {
  readonly page: Page;
  readonly taskPath = '/task';
  readonly taskPrompt: Locator;
  readonly accountButton: Locator;
  readonly popover: Locator;
  readonly description: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly skipButton: Locator;
  readonly doneButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.taskPrompt = page.getByRole('textbox', { name: 'Ask anything' });
    this.accountButton = page.getByRole('contentinfo')
      .getByRole('button')
      .last();
    this.popover = page.locator('#driver-popover-content');
    this.description = page.locator('#driver-popover-description');
    this.nextButton = this.popover.getByRole('button', {
      name: 'Next',
      exact: true,
    });
    this.backButton = this.popover.getByRole('button', {
      name: 'Back',
      exact: true,
    });
    this.skipButton = this.popover.getByRole('button', {
      name: 'Skip',
      exact: true,
    });
    this.doneButton = this.popover.getByRole('button', {
      name: 'Done',
      exact: true,
    });
  }

  async gotoTask(): Promise<void> {
    await this.page.goto(this.taskPath, { waitUntil: 'domcontentloaded' });
    await expect(this.page).not.toHaveURL(/\/login(?:[/?#]|$)/i, {
      timeout: 30_000,
    });
    await expect(this.taskPrompt).toBeVisible({ timeout: 60_000 });
    await expect(this.accountButton).toBeVisible({ timeout: 30_000 });
  }

  async openLauncher(): Promise<Locator> {
    await this.gotoTask();
    const activeAccount = (await this.accountButton.innerText()).trim();
    if (!activeAccount) {
      throw new Error('The active account label is required to open the Tour launcher.');
    }

    const accountMenuTrigger = this.page.getByRole('complementary')
      .locator('[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]')
      .filter({ hasText: activeAccount })
      .last();
    await expect(accountMenuTrigger).toBeVisible();
    await accountMenuTrigger.click();

    const explore = this.page.getByText('Explore June AI', { exact: true });
    await expect(explore).toBeVisible();
    await explore.click();

    const menu = this.page.getByRole('menu', { name: 'Explore June AI' });
    await expect(menu).toBeVisible();
    return menu;
  }

  async visibleLauncherEntries(): Promise<string[]> {
    const menu = await this.openLauncher();
    const result: string[] = [];
    for (const entry of PRODUCT_TOUR_ENTRIES) {
      const option = menu.getByText(entry, { exact: true });
      await expect(option).toHaveCount(1);
      await option.scrollIntoViewIfNeeded();
      await expect(option).toBeVisible();
      result.push(entry);
    }
    return result;
  }

  async launch(
    entry: ProductTourEntry,
    expectedPath: string,
  ): Promise<void> {
    requireAbsolutePath(expectedPath, 'Expected Tour start path');
    const menu = await this.openLauncher();
    const option = menu.getByText(entry, { exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await expect(this.page).toHaveURL(pathPattern(expectedPath), {
      timeout: 30_000,
    });
    await expect(this.popover).toBeVisible({ timeout: 30_000 });
  }

  async run(flow: ProductTourFlow): Promise<void> {
    validateFlow(flow);
    await this.launch(flow.tourEntry, flow.expectedStartPath);

    for (let index = 0; index < flow.steps.length; index += 1) {
      const expectedStep = flow.steps[index];
      await expect(this.description).toContainText(expectedStep, {
        timeout: 30_000,
      });
      await expect(this.description).toContainText(
        `Step ${index + 1} of ${flow.steps.length}`,
      );
      await expect(this.backButton).toBeVisible();

      if (index === flow.steps.length - 1) {
        await expect(this.doneButton).toBeVisible();
        await expect(this.nextButton).toBeHidden();
        await this.doneButton.click();
      } else {
        await expect(this.skipButton).toBeVisible();
        await expect(this.nextButton).toBeVisible();
        await this.nextButton.click();
      }
    }

    await expect(this.popover).toBeHidden({ timeout: 30_000 });
    await expect(this.page).toHaveURL(pathPattern(flow.expectedFinalPath));
  }

  async skipFromCurrentStep(): Promise<void> {
    await expect(this.skipButton).toBeVisible();
    await this.skipButton.click();
    await expect(this.popover).toBeHidden({ timeout: 30_000 });
  }

  async closeResidualDraft(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const cancel = this.page.locator('button:visible').filter({
        hasText: /^Cancel$/,
      }).first();
      if (!await cancel.isVisible().catch(() => false)) break;
      await cancel.click({ timeout: 5_000 }).catch(() => undefined);
      await this.page.waitForTimeout(500);
    }
  }

  async expectOrigin(expectedOrigin: string): Promise<void> {
    const normalized = new URL(expectedOrigin).origin;
    await expect.poll(() => new URL(this.page.url()).origin).toBe(normalized);
  }
}

function validateFlow(flow: ProductTourFlow): void {
  if (!PRODUCT_TOUR_ENTRIES.includes(flow.tourEntry)) {
    throw new Error(`Unsupported Product Tour entry: ${flow.tourEntry}`);
  }
  requireAbsolutePath(flow.expectedStartPath, 'Expected Tour start path');
  requireAbsolutePath(flow.expectedFinalPath, 'Expected Tour final path');
  if (!Array.isArray(flow.steps) || flow.steps.length < 2) {
    throw new Error('A Product Tour flow must contain at least two steps.');
  }
  for (const step of flow.steps) {
    if (typeof step !== 'string' || !step.trim()) {
      throw new Error('Every Product Tour step must be non-empty text.');
    }
  }
}

function requireAbsolutePath(value: string, label: string): void {
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9/_-]*$/.test(value)) {
    throw new Error(`${label} must be an application-relative path.`);
  }
}

function pathPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?:[/?#]|$)`);
}
