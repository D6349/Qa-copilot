import { type Locator, type Page, expect } from '@playwright/test';

export type GuardrailWizardTab = 'Input' | 'Output' | 'Access';
export type InputGuardrailType = 'Contains PII' | 'Moderation' | 'Jailbreak';
export type OutputGuardrailType = 'URL Filter' | 'Contains PII';

/** Stable locators and actions derived from the manual Guardrails recording. */
export class GuardrailsPage {
  readonly page: Page;
  readonly path = '/guardrails';
  readonly heading: Locator;
  readonly searchGuardrails: Locator;
  readonly guardrailCards: Locator;
  readonly createGuardrailButton: Locator;
  readonly guardrailsSidebarButton: Locator;
  readonly viewToggles: Locator;
  readonly wizardDialog: Locator;
  readonly inputTab: Locator;
  readonly outputTab: Locator;
  readonly accessTab: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly employeeSearchInput: Locator;
  readonly piiSettingsDialog: Locator;
  readonly moderationSettingsDialog: Locator;
  readonly urlFilterSettingsDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', {
      name: 'Guardrails',
      exact: true,
    });
    this.searchGuardrails = page.getByPlaceholder('Search guardrails...');
    this.guardrailCards = page.locator('[data-slot=card]').filter({
      has: page.locator('a[title]'),
    });
    this.createGuardrailButton = page.getByRole('button', {
      name: 'Create Guardrail',
      exact: true,
    });
    this.guardrailsSidebarButton = page.getByRole('button', {
      name: 'Guardrails',
      exact: true,
    });
    this.viewToggles = page.locator('main button[role=radio]');
    this.wizardDialog = page.getByRole('dialog').filter({
      has: page.getByRole('tab', { name: 'Input', exact: true }),
    });
    this.inputTab = this.wizardDialog.getByRole('tab', {
      name: 'Input',
      exact: true,
    });
    this.outputTab = this.wizardDialog.getByRole('tab', {
      name: 'Output',
      exact: true,
    });
    this.accessTab = this.wizardDialog.getByRole('tab', {
      name: 'Access',
      exact: true,
    });
    this.nameInput = this.wizardDialog.locator('#guardrail-name');
    this.descriptionInput = this.wizardDialog.locator(
      '#guardrail-description',
    );
    this.employeeSearchInput = this.wizardDialog.getByPlaceholder(
      'Search by employee mail',
    );
    this.piiSettingsDialog = page.getByRole('dialog', {
      name: 'Contains PII Settings',
    });
    this.moderationSettingsDialog = page.getByRole('dialog', {
      name: 'Moderation Settings',
    });
    this.urlFilterSettingsDialog = page.getByRole('dialog', {
      name: 'URL Filter Settings',
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const directPageLoaded = await this.searchGuardrails
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!directPageLoaded) {
      const loginDialog = this.page.getByRole('dialog', {
        name: /log in|sign up/i,
      });
      if (await loginDialog.isVisible().catch(() => false)) {
        throw new Error(
          'June authentication expired. Run "npm.cmd run auth:refresh" first.',
        );
      }
      await this.recoverThroughSidebar();
    }
    await this.expectLoaded();
  }

  private async recoverThroughSidebar(): Promise<void> {
    const agentsButton = this.page.getByRole('button', {
      name: 'Agents',
      exact: true,
    });
    await expect(agentsButton).toBeEnabled({ timeout: 30_000 });
    await agentsButton.click();
    await expect(this.page).toHaveURL(
      new RegExp('/agents(?:[?#]|$)'),
      {
      timeout: 30_000,
      },
    );
    await expect(this.guardrailsSidebarButton).toBeEnabled({
      timeout: 30_000,
    });
    await this.guardrailsSidebarButton.click();
    await expect(this.searchGuardrails).toBeVisible({ timeout: 30_000 });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path + '(?:[?#]|$)'), {
      timeout: 30_000,
    });
    await expect(this.heading).toBeVisible();
    await expect(this.searchGuardrails).toBeVisible();
    await expect(this.createGuardrailButton).toBeVisible();
  }

  guardrailCard(name: string): Locator {
    return this.guardrailCards.filter({
      has: this.page.getByRole('link', { name, exact: true }),
    });
  }

  async visibleGuardrailNames(): Promise<string[]> {
    await expect(this.guardrailCards.first()).toBeVisible({ timeout: 30_000 });
    return this.guardrailNames();
  }

  async guardrailNames(): Promise<string[]> {
    return this.guardrailCards.evaluateAll((cards) => cards.map((card) => {
      const link = card.querySelector('a[title]');
      return (link?.textContent || '').trim();
    }).filter(Boolean));
  }

  async selectView(index: 0 | 1): Promise<void> {
    await expect(this.viewToggles).toHaveCount(3);
    const toggle = this.viewToggles.nth(index);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  async refreshGuardrails(index: 2): Promise<void> {
    const refresh = this.viewToggles.nth(index);
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect(refresh).toBeEnabled({ timeout: 30_000 });
    await this.expectLoaded();
  }

  async openCreateWizard(): Promise<void> {
    await this.createGuardrailButton.click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveWizardTab('Input');
  }

  wizardTab(name: GuardrailWizardTab): Locator {
    if (name === 'Input') return this.inputTab;
    if (name === 'Output') return this.outputTab;
    return this.accessTab;
  }

  async openWizardTab(name: GuardrailWizardTab): Promise<void> {
    await this.wizardTab(name).click();
    await this.expectActiveWizardTab(name);
  }

  async expectActiveWizardTab(name: GuardrailWizardTab): Promise<void> {
    await expect(this.wizardTab(name)).toHaveAttribute('data-state', 'active');
  }

  async fillBasics(options: {
    name: string;
    description: string;
  }): Promise<void> {
    await this.nameInput.fill(options.name);
    await this.descriptionInput.fill(options.description);
  }

  inputSwitch(type: InputGuardrailType): Locator {
    const index = type === 'Contains PII' ? 0 : type === 'Moderation' ? 1 : 2;
    return this.inputTabPanel().getByRole('switch').nth(index);
  }

  outputSwitch(type: OutputGuardrailType): Locator {
    const index = type === 'URL Filter' ? 0 : 1;
    return this.outputTabPanel().getByRole('switch').nth(index);
  }

  inputTabPanel(): Locator {
    return this.wizardDialog.getByRole('tabpanel', { name: 'Input' });
  }

  outputTabPanel(): Locator {
    return this.wizardDialog.getByRole('tabpanel', { name: 'Output' });
  }

  accessTabPanel(): Locator {
    return this.wizardDialog.getByRole('tabpanel', { name: 'Access' });
  }

  async setInputGuard(
    type: InputGuardrailType,
    enabled: boolean,
  ): Promise<void> {
    await this.openWizardTab('Input');
    const toggle = this.inputSwitch(type);
    const checked = await toggle.getAttribute('aria-checked') === 'true';
    if (checked === enabled) return;
    await toggle.click();
    if (type === 'Contains PII' && enabled) {
      await expect(this.piiSettingsDialog).toBeVisible();
      return;
    }
    if (type === 'Moderation' && enabled) {
      await expect(this.moderationSettingsDialog).toBeVisible();
      return;
    }
    await expect(toggle).toHaveAttribute(
      'aria-checked',
      enabled ? 'true' : 'false',
    );
  }

  async openPiiSettings(): Promise<Locator> {
    await this.openWizardTab('Input');
    const toggle = this.inputSwitch('Contains PII');
    if (await toggle.getAttribute('aria-checked') === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await toggle.click();
    await expect(this.piiSettingsDialog).toBeVisible();
    return this.piiSettingsDialog;
  }

  async openModerationSettings(): Promise<Locator> {
    await this.openWizardTab('Input');
    const toggle = this.inputSwitch('Moderation');
    if (await toggle.getAttribute('aria-checked') === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await toggle.click();
    await expect(this.moderationSettingsDialog).toBeVisible();
    return this.moderationSettingsDialog;
  }

  async saveSettings(dialog: Locator): Promise<void> {
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.wizardDialog).toBeVisible();
  }

  async closeSettings(dialog: Locator): Promise<void> {
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.wizardDialog).toBeVisible();
  }

  async setOutputGuard(
    type: OutputGuardrailType,
    enabled: boolean,
  ): Promise<void> {
    await this.openWizardTab('Output');
    let toggle = this.outputSwitch(type);
    const checked = await toggle.getAttribute('aria-checked') === 'true';
    if (checked === enabled) return;
    await toggle.click();
    if (enabled) {
      const dialog = type === 'URL Filter'
        ? this.urlFilterSettingsDialog
        : this.piiSettingsDialog;
      await expect(dialog).toBeVisible();
      await this.saveSettings(dialog);
      await this.openWizardTab('Output');
      toggle = this.outputSwitch(type);
    }
    await expect(toggle).toHaveAttribute(
      'aria-checked',
      enabled ? 'true' : 'false',
    );
  }

  async openOutputSettings(type: OutputGuardrailType): Promise<Locator> {
    await this.openWizardTab('Output');
    const toggle = this.outputSwitch(type);
    if (await toggle.getAttribute('aria-checked') === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await toggle.click();
    const dialog = type === 'URL Filter'
      ? this.urlFilterSettingsDialog
      : this.piiSettingsDialog;
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async clickNext(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Next',
      exact: true,
    }).click();
  }

  async clickBack(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Back',
      exact: true,
    }).click();
  }

  async cancelWizard(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeHidden();
    await this.expectLoaded();
  }

  async submitCreate(): Promise<void> {
    await this.openWizardTab('Access');
    await this.wizardDialog.getByRole('button', {
      name: 'Create Guardrail',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeHidden({ timeout: 60_000 });
    await this.expectLoaded();
  }

  async submitUpdate(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Update',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeHidden({ timeout: 60_000 });
    await this.expectLoaded();
  }

  async searchForGuardrail(name: string): Promise<Locator> {
    await this.searchGuardrails.fill(name);
    const card = this.guardrailCard(name);
    await expect(card).toBeVisible({ timeout: 30_000 });
    return card;
  }

  async openActions(name: string): Promise<Locator> {
    const card = this.guardrailCard(name);
    await expect(card).toBeVisible();
    await card.hover();
    await card.locator('[data-slot=dropdown-menu-trigger]').click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async openEditGuardrail(name: string): Promise<void> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Edit',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveWizardTab('Input');
  }

  async openDeleteConfirmation(name: string): Promise<Locator> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Delete',
      exact: true,
    }).click();
    const confirmation = this.page.getByRole('alertdialog', {
      name: 'Delete Guardrail',
    });
    await expect(confirmation).toBeVisible();
    return confirmation;
  }
}
