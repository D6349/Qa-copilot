import {
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

export const UI_COMPONENT_TYPES = [
  'Table',
  'Form',
  'Card',
  'List',
  'Chart',
  'Catalog',
  'Checkout',
  'Suggestion List',
] as const;

export type UiComponentType = typeof UI_COMPONENT_TYPES[number];
export type UiComponentTab = 'Information' | 'Designs' | 'Visibility';

/** Stable locators and actions derived from the manual UI Components recording. */
export class UiComponentsPage {
  readonly page: Page;
  readonly path = '/ui-components';
  readonly heading: Locator;
  readonly searchUiComponents: Locator;
  readonly componentCards: Locator;
  readonly createUiComponentButton: Locator;
  readonly viewToggles: Locator;
  readonly wizardDialog: Locator;
  readonly informationTab: Locator;
  readonly designsTab: Locator;
  readonly visibilityTab: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly typeSelect: Locator;
  readonly instructionsInput: Locator;
  readonly jsonEditor: Locator;
  readonly reactEditor: Locator;
  readonly generateButton: Locator;
  readonly formatButton: Locator;
  readonly runButton: Locator;
  readonly designPanel: Locator;
  readonly visibilitySearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', {
      name: 'UI Components',
      exact: true,
    });
    this.searchUiComponents = page.getByPlaceholder(
      'Search ui components...',
    );
    this.componentCards = page.locator(
      '[data-slot=card]:has(a[title])',
    );
    this.createUiComponentButton = page.getByRole('button', {
      name: 'Create UI Component',
      exact: true,
    });
    this.viewToggles = page.locator('main button[role=radio]');
    this.wizardDialog = page.getByRole('dialog').filter({
      has: page.getByRole('tab', {
        name: 'Information',
        exact: true,
      }),
    });
    this.informationTab = this.wizardDialog.getByRole('tab', {
      name: 'Information',
      exact: true,
    });
    this.designsTab = this.wizardDialog.getByRole('tab', {
      name: 'Designs',
      exact: true,
    });
    this.visibilityTab = this.wizardDialog.getByRole('tab', {
      name: 'Visibility',
      exact: true,
    });
    this.nameInput = this.wizardDialog.locator('#ui-component-name');
    this.descriptionInput = this.wizardDialog.locator(
      '#ui-component-description',
    );
    this.typeSelect = this.wizardDialog.locator('#ui-component-type');
    this.instructionsInput = this.wizardDialog.locator(
      '#ui-component-instructions',
    );
    this.jsonEditor = this.wizardDialog.locator('#ui-component-json');
    this.reactEditor = this.wizardDialog.locator('#ui-component-react');
    this.generateButton = this.wizardDialog.getByRole('button', {
      name: 'Generate JSON and React code',
      exact: true,
    });
    this.formatButton = this.wizardDialog.getByRole('button', {
      name: 'Format',
      exact: true,
    });
    this.runButton = this.wizardDialog.getByRole('button', {
      name: 'Run',
      exact: true,
    });
    this.designPanel = this.wizardDialog.getByRole('tabpanel', {
      name: 'Designs',
    });
    this.visibilitySearchInput = this.wizardDialog.getByPlaceholder(
      'Search by employee mail',
    );
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const loaded = await this.searchUiComponents
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const login = this.page.getByRole('dialog', {
        name: /log in|sign up/i,
      });
      if (await login.isVisible().catch(() => false)) {
        throw new Error(
          'June authentication expired. Run "npm.cmd run auth:refresh" first.',
        );
      }
      throw new Error(
        'UI Components did not load. Check the authenticated June session.',
      );
    }
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(this.path + '(?:[?#]|$)'),
      { timeout: 30_000 },
    );
    await expect(this.heading).toBeVisible();
    await expect(this.searchUiComponents).toBeVisible();
    await expect(this.createUiComponentButton).toBeVisible();
  }

  componentCard(name: string): Locator {
    return this.componentCards.filter({
      has: this.page.getByRole('link', { name, exact: true }),
    });
  }

  async componentNames(): Promise<string[]> {
    return (await this.componentCards.locator('a[title]').allTextContents())
      .map((name) => name.trim())
      .filter(Boolean);
  }

  async visibleComponentNames(): Promise<string[]> {
    await expect(this.componentCards.first()).toBeVisible({
      timeout: 30_000,
    });
    return this.componentNames();
  }

  async searchForComponent(name: string): Promise<Locator> {
    await this.searchUiComponents.fill(name);
    const card = this.componentCard(name);
    await expect(card).toBeVisible({ timeout: 30_000 });
    return card;
  }

  async clearSearch(): Promise<void> {
    await this.searchUiComponents.clear();
    await expect(this.searchUiComponents).toHaveValue('');
  }

  async selectView(index: 0 | 1): Promise<void> {
    await expect(this.viewToggles).toHaveCount(3);
    const toggle = this.viewToggles.nth(index);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  async refreshComponents(): Promise<void> {
    await expect(this.viewToggles).toHaveCount(3);
    const refresh = this.viewToggles.nth(2);
    await refresh.click();
    await expect(this.searchUiComponents).toBeVisible({
      timeout: 30_000,
    });
    await this.expectLoaded();
  }

  async openCreateWizard(): Promise<void> {
    await this.createUiComponentButton.click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveTab('Information');
  }

  tab(name: UiComponentTab): Locator {
    if (name === 'Information') return this.informationTab;
    if (name === 'Designs') return this.designsTab;
    return this.visibilityTab;
  }

  async openWizardTab(name: UiComponentTab): Promise<void> {
    await this.tab(name).click();
    await this.expectActiveTab(name);
  }

  async expectActiveTab(name: UiComponentTab): Promise<void> {
    await expect(this.tab(name)).toHaveAttribute(
      'data-state',
      'active',
    );
  }

  async fillInformation(options: {
    name: string;
    description: string;
  }): Promise<void> {
    await this.nameInput.fill(options.name);
    await this.descriptionInput.fill(options.description);
  }

  async selectType(type: UiComponentType): Promise<void> {
    await this.typeSelect.click();
    await this.page.getByRole('option', {
      name: type,
      exact: true,
    }).click();
    await expect(this.typeSelect).toContainText(type);
  }

  async chooseNext(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Next',
      exact: true,
    }).click();
  }

  async chooseBack(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Back',
      exact: true,
    }).click();
  }

  async generateDesign(prompt: string): Promise<void> {
    await this.openWizardTab('Designs');
    await this.instructionsInput.fill(prompt);
    await expect(this.generateButton).toBeEnabled({
      timeout: 10_000,
    });
    await this.generateButton.click();
    await expect.poll(
      async () => (await this.jsonEditor.inputValue()).trim(),
      {
        timeout: 60_000,
        message: 'Wait for generated UI Component JSON',
      },
    ).not.toBe('');
    await expect.poll(
      async () => (await this.reactEditor.inputValue()).trim(),
      {
        timeout: 60_000,
        message: 'Wait for generated UI Component React code',
      },
    ).not.toBe('');
  }

  async runPreview(expectedText?: string): Promise<void> {
    await this.runButton.click();
    if (expectedText) {
      await expect(this.designPanel).toContainText(expectedText, {
        timeout: 30_000,
      });
    }
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
    await this.openWizardTab('Visibility');
    await this.wizardDialog.getByRole('button', {
      name: 'Create UI Component',
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

  async openEditComponent(name: string): Promise<void> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Edit',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveTab('Information');
  }

  async openActions(name: string): Promise<Locator> {
    const card = this.componentCard(name);
    await expect(card).toBeVisible();
    await card.hover();
    await card.locator('[data-slot=dropdown-menu-trigger]').click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async openDeleteConfirmation(name: string): Promise<Locator> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Delete',
      exact: true,
    }).click();
    const confirmation = this.page.getByRole('alertdialog', {
      name: 'Delete UI Component',
    });
    await expect(confirmation).toBeVisible();
    return confirmation;
  }
}
