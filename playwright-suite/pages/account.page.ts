import { type Locator, type Page, expect } from '@playwright/test';

export interface BusinessSelection {
  businessName: string;
  activeAccountLabel: string;
  taxId?: string;
}

/** Reusable, side-effect-limited actions for account and business context. */
export class AccountPage {
  readonly page: Page;
  readonly taskPath = '/task';
  readonly prompt: Locator;
  readonly accountButton: Locator;
  readonly selectBusinessTitle: Locator;
  readonly businessSearch: Locator;
  readonly proPlanLabel: Locator;
  readonly proPlanHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.prompt = page.getByRole('textbox', { name: 'Ask anything' });
    this.accountButton = page.getByRole('contentinfo')
      .getByRole('button').last();
    this.selectBusinessTitle = page.getByText('Select Business', {
      exact: true,
    });
    this.businessSearch = page.getByRole('textbox', { name: 'Search...' });
    this.proPlanLabel = page.getByText('Pro Plan', { exact: true });
    this.proPlanHeading = page.getByRole('heading', {
      name: 'Full access for your business',
      exact: true,
    });
  }

  async gotoTask(): Promise<void> {
    await this.page.goto(this.taskPath, { waitUntil: 'domcontentloaded' });
    await this.expectAuthenticated();
  }

  async expectAuthenticated(): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/login(?:[/?#]|$)/i, {
      timeout: 30_000,
    });
    await expect(this.prompt).toBeVisible({ timeout: 30_000 });
    await expect(this.accountButton).toBeVisible({ timeout: 30_000 });
  }

  async activeAccountName(): Promise<string> {
    return (await this.accountButton.innerText()).trim();
  }

  async expectActiveAccount(label: string): Promise<void> {
    await expect.poll(
      () => this.activeAccountName(),
      {
        message: `Expected active account to contain "${label}".`,
        timeout: 30_000,
      },
    ).toContain(label);
  }

  async openAccountMenu(): Promise<void> {
    const active = await this.activeAccountName();
    const trigger = this.page.getByRole('complementary')
      .locator('[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]')
      .filter({ hasText: active }).last();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const myAccount = this.page.getByRole('menuitem', {
      name: 'My Account',
      exact: true,
    });
    const switchAccount = this.page.getByRole('menuitem', {
      name: 'Switch Account',
      exact: true,
    });
    await expect(myAccount.or(switchAccount).first()).toBeVisible();
  }

  async switchToMyAccount(
    label: string,
    fallbackBusiness?: BusinessSelection,
  ): Promise<void> {
    let active = await this.activeAccountName();
    if (active.toLowerCase().includes(label.toLowerCase())) {
      // The task shell can briefly render a cached account label while its
      // persisted business context hydrates. Re-read after navigation before
      // deciding that no explicit My Account switch is required.
      await this.gotoTask();
      active = await this.activeAccountName();
      if (active.toLowerCase().includes(label.toLowerCase())) return;
    }

    const trigger = this.page.getByRole('complementary')
      .locator('[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]')
      .filter({ hasText: active }).last();
    const disabled = !await trigger.isVisible().catch(() => false)
      || !await trigger.click({ trial: true, timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
    if (disabled) {
      if (!fallbackBusiness) {
        throw new Error(
          `Cannot leave restricted account "${active}" without a fallback business.`,
        );
      }
      await this.switchBusiness(fallbackBusiness);
    }

    await this.openAccountMenu();
    await this.page.getByRole('menuitem', {
      name: label,
      exact: true,
    }).click();
    await this.expectActiveAccount(label);
    await this.gotoTask();
    await this.expectActiveAccount(label);
  }

  async openBusinessSwitcher(): Promise<void> {
    await expect(this.accountButton).toBeVisible();
    await this.accountButton.click();
    await expect(this.selectBusinessTitle).toBeVisible({ timeout: 30_000 });
    await expect(this.businessSearch).toBeVisible({ timeout: 30_000 });
  }

  async switchBusiness(selection: BusinessSelection): Promise<void> {
    await this.openBusinessSwitcher();
    await this.businessSearch.fill(selection.businessName);

    const businessName = this.page.getByText(selection.businessName, {
      exact: true,
    }).last();
    await expect(businessName).toBeVisible({ timeout: 30_000 });
    if (selection.taxId) {
      await expect(this.page.getByText(selection.taxId, { exact: false }).last())
        .toBeVisible();
    }
    await businessName.click();
    await expect(this.selectBusinessTitle).toBeHidden({ timeout: 30_000 });
    await this.expectActiveAccount(selection.activeAccountLabel);
  }

  async expectSubscribedModule(
    moduleName: string,
    blockedHeading: string,
  ): Promise<void> {
    await this.gotoTask();
    const taskUrl = this.page.url();
    await this.page.getByRole('button', {
      name: moduleName,
      exact: true,
    }).click();
    await expect.poll(
      () => this.page.url(),
      {
        message: `${moduleName} did not leave the task route.`,
        timeout: 30_000,
      },
    ).not.toBe(taskUrl);
    await expect(this.page).not.toHaveURL(/\/upgrade-plan(?:[/?#]|$)/i);
    await expect(this.page.getByText(blockedHeading, { exact: true }))
      .toHaveCount(0);
  }

  async expectNoSubscriptionGate(
    moduleName: string,
    proPlanLabel: string,
    ctaName: string,
  ): Promise<void> {
    await this.gotoTask();
    await this.page.getByRole('button', {
      name: moduleName,
      exact: true,
    }).click();
    await expect(this.page).toHaveURL(/\/upgrade-plan(?:[/?#]|$)/i, {
      timeout: 30_000,
    });
    await expect(this.page.getByText(proPlanLabel, { exact: true }))
      .toBeVisible();
    await expect(this.proPlanHeading).toBeVisible();
    await expect(this.page.getByRole('button', {
      name: ctaName,
      exact: true,
    })).toBeVisible();
  }
}
