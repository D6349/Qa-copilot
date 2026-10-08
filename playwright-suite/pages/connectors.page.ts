import { type Locator, type Page, expect } from '@playwright/test';

export type ConnectorCountry = 'India' | 'USA' | 'UAE';
export type ConnectorDateFilter =
  | 'Today'
  | 'Yesterday'
  | 'Past 7 days'
  | 'Last Month';
export type ConnectorWizardTab = 'Information' | 'Access';

/** Stable locators and actions derived from the manual Connectors recording. */
export class ConnectorsPage {
  readonly page: Page;
  readonly path = '/connectors';
  readonly heading: Locator;
  readonly searchConnectors: Locator;
  readonly connectorCards: Locator;
  readonly createConnectorButton: Locator;
  readonly connectorsButton: Locator;
  readonly filterButton: Locator;
  readonly viewToggles: Locator;
  readonly wizardDialog: Locator;
  readonly informationTab: Locator;
  readonly accessTab: Locator;
  readonly informationPanel: Locator;
  readonly connectorNameInput: Locator;
  readonly serverUrlInput: Locator;
  readonly configInput: Locator;
  readonly countrySelect: Locator;
  readonly descriptionInput: Locator;
  readonly iconInput: Locator;
  readonly employeeSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Connectors', exact: true });
    this.searchConnectors = page.getByPlaceholder('Search connectors...');
    this.connectorCards = page.locator('[data-slot=card]').filter({
      has: page.locator('a[title]'),
    });
    this.createConnectorButton = page.getByRole('button', {
      name: 'Create Connector',
      exact: true,
    });
    this.connectorsButton = page.getByRole('button', {
      name: 'Connectors',
      exact: true,
    });
    this.filterButton = this.searchConnectors.locator(
      'xpath=../../following-sibling::button',
    );
    this.viewToggles = page.locator('button[role=radio]');
    this.wizardDialog = page.getByRole('dialog').filter({
      has: page.getByRole('tab', { name: 'Information', exact: true }),
    });
    this.informationTab = this.wizardDialog.getByRole('tab', {
      name: 'Information',
      exact: true,
    });
    this.accessTab = this.wizardDialog.getByRole('tab', {
      name: 'Access',
      exact: true,
    });
    this.informationPanel = this.wizardDialog.getByRole('tabpanel', {
      name: 'Information',
    });
    this.connectorNameInput = this.informationPanel.getByPlaceholder(
      'Give your Connector a short name',
    );
    this.serverUrlInput = this.informationPanel.getByPlaceholder(
      'Specify the URL where this connector should save data',
    );
    this.configInput = this.informationPanel.getByPlaceholder(
      "{'Content-Type':'application/json'}",
    );
    this.countrySelect = this.informationPanel.getByRole('combobox');
    this.descriptionInput = this.informationPanel.getByPlaceholder(
      'Describe the connector’s purpose and usage conditions',
    );
    this.iconInput = this.informationPanel.locator('input[type=file]');
    this.employeeSearchInput = this.wizardDialog.getByPlaceholder(
      'Search by employee mail',
    );
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const directPageLoaded = await this.searchConnectors
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
    await expect(this.page).toHaveURL(/\/agents(?:[?#]|$)/, {
      timeout: 30_000,
    });
    await expect(this.connectorsButton).toBeEnabled({ timeout: 30_000 });
    await this.connectorsButton.click();
    await expect(this.searchConnectors).toBeVisible({ timeout: 30_000 });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path + '(?:[?#]|$)'), {
      timeout: 30_000,
    });
    await expect(this.heading).toBeVisible();
    await expect(this.searchConnectors).toBeVisible();
    await expect(this.createConnectorButton).toBeVisible();
  }

  connectorCard(name: string): Locator {
    return this.connectorCards.filter({
      has: this.page.getByRole('link', { name, exact: true }),
    });
  }

  async visibleConnectorNames(): Promise<string[]> {
    await expect(this.connectorCards.first()).toBeVisible({ timeout: 30_000 });
    return this.connectorNames();
  }

  async connectorNames(): Promise<string[]> {
    return this.connectorCards.evaluateAll((cards) => cards.map((card) => {
      const link = card.querySelector('a[title]');
      return (link?.textContent || '').trim();
    }).filter(Boolean));
  }

  async selectDateFilter(name: ConnectorDateFilter): Promise<void> {
    await expect(this.filterButton).toBeVisible();
    await this.filterButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toBeHidden();
  }

  async selectView(index: 0 | 1): Promise<void> {
    await expect(this.viewToggles).toHaveCount(3);
    const toggle = this.viewToggles.nth(index);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  async refreshConnectors(index: 2): Promise<void> {
    const refresh = this.viewToggles.nth(index);
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect(refresh).toBeDisabled({ timeout: 2_000 });
    await expect(refresh).toBeEnabled({ timeout: 30_000 });
  }

  async openCreateWizard(): Promise<void> {
    await this.createConnectorButton.click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveWizardTab('Information');
  }

  wizardTab(name: ConnectorWizardTab): Locator {
    return name === 'Information' ? this.informationTab : this.accessTab;
  }

  async openWizardTab(name: ConnectorWizardTab): Promise<void> {
    await this.wizardTab(name).click();
    await this.expectActiveWizardTab(name);
  }

  async expectActiveWizardTab(name: ConnectorWizardTab): Promise<void> {
    await expect(this.wizardTab(name)).toHaveAttribute('data-state', 'active');
  }

  async fillInformation(options: {
    name: string;
    serverUrl: string;
    config: string;
    country?: ConnectorCountry;
    description?: string;
  }): Promise<void> {
    await this.openWizardTab('Information');
    await this.connectorNameInput.fill(options.name);
    await this.serverUrlInput.fill(options.serverUrl);
    await this.configInput.fill(options.config);
    if (options.country) await this.selectCountry(options.country);
    await this.descriptionInput.fill(options.description || '');
  }

  async selectCountry(country: ConnectorCountry): Promise<void> {
    await this.countrySelect.click();
    await this.page.getByRole('option', { name: country, exact: true }).click();
    await expect(this.countrySelect).toContainText(country);
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
    let cancel = this.wizardDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    if (!await cancel.isVisible().catch(() => false)) {
      const back = this.wizardDialog.getByRole('button', {
        name: 'Back',
        exact: true,
      });
      if (await back.isVisible().catch(() => false)) await back.click();
      cancel = this.wizardDialog.getByRole('button', {
        name: 'Cancel',
        exact: true,
      });
    }
    await cancel.click();
    await expect(this.wizardDialog).toBeHidden();
    await this.expectLoaded();
  }

  async submitCreate(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Create',
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

  async searchForConnector(name: string): Promise<Locator> {
    await this.searchConnectors.fill(name);
    const card = this.connectorCard(name);
    await expect(card).toBeVisible({ timeout: 60_000 });
    return card;
  }

  async openActions(name: string): Promise<Locator> {
    const card = this.connectorCard(name);
    await expect(card).toBeVisible();
    await card.hover();
    await card.locator('[data-slot=dropdown-menu-trigger]').click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async openEditConnector(name: string): Promise<void> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Edit Connector',
      exact: true,
    }).click();
    await expect(this.wizardDialog).toBeVisible();
    await this.expectActiveWizardTab('Information');
  }

  async openDeleteConfirmation(name: string): Promise<Locator> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const confirmation = this.page.getByRole('alertdialog', {
      name: 'Delete Connector',
    }).filter({
      has: this.page.getByRole('button', { name: 'Delete', exact: true }),
    });
    await expect(confirmation).toBeVisible();
    return confirmation;
  }
}
