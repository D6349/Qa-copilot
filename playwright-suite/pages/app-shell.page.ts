import type { Locator, Page } from '@playwright/test';

export class AppShellPage {
  readonly page: Page;
  readonly activeAccountButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.activeAccountButton = page.getByRole('contentinfo')
      .getByRole('button')
      .last();
  }

  async gotoValidation(validationUrl: string, timeoutMs: number): Promise<void> {
    await this.page.goto(validationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
  }

  async isAuthenticated(
    applicationBaseURL: string,
    timeoutMs = 10_000,
  ): Promise<boolean> {
    try {
      const current = new URL(this.page.url());
      const expected = new URL(applicationBaseURL);
      if (
        current.origin !== expected.origin
        || /\/login(?:\/|$)/i.test(current.pathname)
      ) {
        return false;
      }
      await this.activeAccountButton.waitFor({
        state: 'visible',
        timeout: timeoutMs,
      });
      return true;
    } catch {
      return false;
    }
  }

  async expectAuthenticated(
    applicationBaseURL: string,
    timeoutMs = 10_000,
  ): Promise<void> {
    if (!await this.isAuthenticated(applicationBaseURL, timeoutMs)) {
      throw new Error(
        `The authenticated June application shell was not visible at ${this.page.url()}.`,
      );
    }
  }
}
