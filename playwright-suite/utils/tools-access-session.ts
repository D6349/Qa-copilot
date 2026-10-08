import {
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  loadAuthConfig,
  type AuthConfig,
} from '../config/environment';
import {
  AccountPage,
  type BusinessSelection,
} from '../pages/account.page';
import { AppShellPage } from '../pages/app-shell.page';
import { ToolsPage } from '../pages/tools.page';
import { hasUsableStorageState } from './auth-session';

export interface ToolsAccessIdentities {
  assignedUser: AuthConfig;
  companyMember: AuthConfig;
}

export function loadToolsAccessIdentities(
  baseURL?: string,
): ToolsAccessIdentities {
  const owner = loadAuthConfig(baseURL, 'owner');
  const assignedUser = loadAuthConfig(baseURL, 'user-access');
  const companyMember = loadAuthConfig(baseURL, 'company-access');

  if (!assignedUser.username || !assignedUser.password) {
    throw new Error(
      `Set ${assignedUser.usernameKey} and ${assignedUser.passwordKey} in `
      + 'playwright-suite/.env before running cross-user Tools access cases.',
    );
  }
  if (!companyMember.username || !companyMember.password) {
    throw new Error(
      `Set ${companyMember.usernameKey} and ${companyMember.passwordKey} in `
      + 'playwright-suite/.env before running cross-user Tools access cases.',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignedUser.username)) {
    throw new Error(
      'The configured user-access username must be the employee email used by '
      + 'the Tool Access search.',
    );
  }

  const identities = [owner.username, assignedUser.username, companyMember.username]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      'Owner, assigned-user, and company-member logins must be three distinct accounts.',
    );
  }
  return { assignedUser, companyMember };
}

export class ToolsAccessSession {
  private constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    readonly tools: ToolsPage,
  ) {}

  static async open(
    browser: Browser,
    auth: AuthConfig,
    business: BusinessSelection,
  ): Promise<ToolsAccessSession> {
    if (!hasUsableStorageState(auth.storagePath)) {
      throw new Error(
        `The ${auth.identity} session is unavailable. Run the matching `
        + 'identity-specific auth:login command before this case.',
      );
    }

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: auth.storagePath,
    });
    try {
      const page = await context.newPage();
      const shell = new AppShellPage(page);
      await shell.gotoValidation(auth.validationUrl, auth.timeoutMs);
      await shell.expectAuthenticated(auth.baseURL, auth.timeoutMs);

      const account = new AccountPage(page);
      await account.gotoTask();
      const activeAccount = await account.activeAccountName();
      if (!activeAccount.toLowerCase().includes(
        business.activeAccountLabel.toLowerCase(),
      )) {
        await account.switchBusiness(business);
      }
      await account.expectActiveAccount(business.activeAccountLabel);

      const tools = new ToolsPage(page);
      await tools.goto();
      await account.expectActiveAccount(business.activeAccountLabel);
      return new ToolsAccessSession(context, page, tools);
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async expectToolVisible(
    toolName: string,
    testInfo?: TestInfo,
    evidenceRole?: 'assigned-user' | 'company-member',
  ): Promise<void> {
    await this.tools.selectScope('All');
    await this.tools.searchForTool(toolName);
    if (testInfo && evidenceRole) {
      await this.attachMaskedEvidence(testInfo, evidenceRole);
    }
  }

  async expectToolHidden(toolName: string): Promise<void> {
    // Access was changed from the owner context, so this separate browser
    // context must fetch a fresh Tools list before asserting revocation.
    await this.tools.goto();
    await this.tools.selectScope('All');
    await this.tools.expectToolAbsent(toolName);
  }

  async close(): Promise<void> {
    await this.context.close();
  }

  private async attachMaskedEvidence(
    testInfo: TestInfo,
    role: 'assigned-user' | 'company-member',
  ): Promise<void> {
    const body = await this.page.screenshot({
      type: 'jpeg',
      quality: 68,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      mask: [
        this.page.getByRole('complementary'),
        this.page.locator([
          '[data-evidence-mask]',
          'input[type="email"]',
          'input[type="password"]',
          'input[autocomplete="username" i]',
        ].join(', ')),
      ],
      maskColor: '#202124',
    });
    await testInfo.attach(`case-screenshot-cross-user-${role}`, {
      body,
      contentType: 'image/jpeg',
    });
  }
}
