import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly continueButton: Locator;
  readonly passwordOption: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator([
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[type="email"]',
    ].join(', ')).first();
    this.passwordInput = page.locator([
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      'input[type="password"]',
    ].join(', ')).first();
    this.continueButton = page.getByRole('button', {
      name: /continue|next|log ?in|sign ?in/i,
    }).last();
    this.passwordOption = page.getByRole('button', { name: /password/i })
      .or(page.getByRole('link', { name: /password/i }))
      .first();
  }

  async goto(loginUrl: string, timeoutMs: number): Promise<void> {
    await this.page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
  }

  async submitCredentials(
    username: string,
    password: string,
    applicationBaseURL: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.usernameInput.waitFor({ state: 'visible', timeout: timeoutMs });
    await this.setSensitiveValue(this.usernameInput, username);

    if (!await this.passwordInput.isVisible()) {
      await this.continueButton.click();
    }
    if (!await this.passwordInput.isVisible() && await this.passwordOption.isVisible()) {
      await this.passwordOption.click();
    }

    try {
      await this.passwordInput.waitFor({ state: 'visible', timeout: 20_000 });
    } catch {
      throw new Error(
        'Credential login did not expose a password field. Complete OTP/MFA with "npm.cmd run auth:refresh".',
      );
    }
    await this.setSensitiveValue(this.passwordInput, password);

    const form = this.passwordInput.locator('xpath=ancestor::form[1]');
    const submitScope = await form.count() ? form : this.page;
    await submitScope.getByRole('button', {
      name: /continue|log ?in|sign ?in|submit/i,
    }).last().click();

    await this.page.waitForURL((url) => {
      const application = new URL(applicationBaseURL);
      return url.origin === application.origin
        && !/\/login(?:\/|$)/i.test(url.pathname);
    }, { timeout: 15_000 }).catch(() => undefined);
  }

  private async setSensitiveValue(locator: Locator, value: string): Promise<void> {
    await locator.evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, nextValue);
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: nextValue,
        inputType: 'insertText',
      }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
}
