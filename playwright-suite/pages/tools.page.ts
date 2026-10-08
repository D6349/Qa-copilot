import { type Page, type Locator, expect } from '@playwright/test';

export type ToolScope = 'All' | 'My Tools' | 'Shared Tools';
export type ToolDateFilter = 'Today' | 'Yesterday' | 'Past 7 days' | 'Last Month';
export type ToolWizardTab = 'Information' | 'API Details' | 'Access';
export type ToolApiSection = 'Endpoint' | 'Header' | 'Body';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type PayloadType = 'JSON' | 'XML' | 'Form Data' | 'Parameters';

export interface ToolKeyValueEntry {
  key: string;
  value: string;
}

export type ToolPayloadValue = string | readonly ToolKeyValueEntry[];

/** Stable locators and actions for the live Tools experience. */
export class ToolsPage {
  readonly page: Page;
  readonly path = '/tools';
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly searchTools: Locator;
  readonly toolCards: Locator;
  readonly createToolButton: Locator;
  readonly filterButton: Locator;
  readonly viewToggles: Locator;
  readonly toolsButton: Locator;
  readonly informationTab: Locator;
  readonly apiDetailsTab: Locator;
  readonly accessTab: Locator;
  readonly toolNameInput: Locator;
  readonly toolPurposeInput: Locator;
  readonly botKeywordsInput: Locator;
  readonly apiPanel: Locator;
  readonly endpointInput: Locator;
  readonly headerJsonInput: Locator;
  readonly payloadJsonInput: Locator;
  readonly payloadXmlInput: Locator;
  readonly payloadBulkEditInput: Locator;
  readonly schemaJsonInput: Locator;
  readonly generateSchemaButton: Locator;
  readonly employeeSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Tools', exact: true });
    this.subtitle = page.getByText(
      'Tools are created by humans with specific inputs and outputs. '
      + 'They help agents perform reliable, reusable actions across your task.',
      { exact: true },
    );
    this.searchTools = page.getByPlaceholder('Search tools...');
    this.toolCards = page.locator('[data-slot=card]').filter({
      has: page.locator('a[title]'),
    });
    this.createToolButton = page.getByRole('button', { name: 'Create Tool' });
    // The date filter is the first unnamed button beside Search; the next sibling is Sort By.
    this.filterButton = this.searchTools.locator('xpath=../../following-sibling::button[1]');
    this.viewToggles = page.locator('button[role=radio]');
    this.toolsButton = page.getByRole('button', { name: 'Tools', exact: true });
    this.informationTab = page.getByRole('tab', { name: 'Information', exact: true });
    this.apiDetailsTab = page.getByRole('tab', { name: 'API Details', exact: true });
    this.accessTab = page.getByRole('tab', { name: 'Access', exact: true });
    this.toolNameInput = page.getByPlaceholder(
      'Enter a short,clear and descriptive tool name',
    );
    this.toolPurposeInput = page.getByPlaceholder('Enter tool purpose');
    this.botKeywordsInput = page.getByPlaceholder('Enter bot keywords');
    this.apiPanel = page.getByRole('tabpanel', { name: 'API Details' });
    this.endpointInput = this.apiPanel.getByPlaceholder('api.example.com/data');
    this.headerJsonInput = this.apiPanel.getByPlaceholder(
      /\{"Content-Type":"application\//,
    );
    this.payloadJsonInput = this.apiPanel.getByPlaceholder(
      'Enter the request payload in JSON format.',
    );
    this.payloadXmlInput = this.apiPanel.getByPlaceholder(
      'Enter the request payload in XML format.',
    );
    this.payloadBulkEditInput = this.apiPanel.getByPlaceholder(
      /^name: John Doe/,
    );
    this.schemaJsonInput = this.apiPanel.getByPlaceholder(
      'Define the expected structure of the request or response JSON.',
    );
    this.generateSchemaButton = this.apiPanel.getByRole('button', {
      name: 'Generate Schema',
      exact: true,
    });
    this.employeeSearchInput = page.getByPlaceholder('Search by employee mail');
  }

  get wizardDialog(): Locator {
    return this.informationTab.locator("xpath=ancestor::*[@role='dialog']");
  }

  get noAuthenticationButton(): Locator {
    return this.apiPanel.getByRole('button', {
      name: /^No Authentication\b/,
    });
  }

  get customHeadersButton(): Locator {
    return this.apiPanel.getByRole('button', {
      name: /^Custom Headers\b/,
    });
  }

  get companyAccessToggle(): Locator {
    return this.wizardDialog.locator('#company-access-toggle');
  }

  /** The redesigned wizard renders one section-specific combobox at a time. */
  get methodSelect(): Locator {
    return this.apiPanel.getByRole('combobox');
  }

  /** The same semantic combobox slot represents payload type on Header. */
  get payloadTypeSelect(): Locator {
    return this.apiPanel.getByRole('combobox');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const directPageLoaded = await this.searchTools
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!directPageLoaded) {
      await this.recoverThroughSidebar();
    }
    await this.expectLoaded();
  }

  private async recoverThroughSidebar(): Promise<void> {
    const agentsButton = this.page.getByRole('button', { name: 'Agents', exact: true });
    await expect(agentsButton).toBeEnabled({ timeout: 30_000 });
    await agentsButton.click();
    await expect(this.page).toHaveURL(/\/agents(?:[?#]|$)/, { timeout: 30_000 });
    await expect(this.toolsButton).toBeEnabled({ timeout: 30_000 });
    await this.toolsButton.click();
    await expect(this.searchTools).toBeVisible({ timeout: 30_000 });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path + '(?:[?#]|$)'), {
      timeout: 30_000,
    });
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
    await expect(this.searchTools).toBeVisible();
    await expect(this.createToolButton).toBeVisible();
  }

  scopeTab(name: ToolScope): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  toolCard(name: string): Locator {
    return this.toolCards.filter({
      has: this.page.getByRole('link', { name, exact: true }),
    });
  }

  async visibleToolNames(): Promise<string[]> {
    return this.toolCards.evaluateAll((cards) => cards.map((card) => {
      const link = card.querySelector('a[title]');
      return (link?.textContent || '').trim();
    }).filter(Boolean));
  }

  async selectScope(name: ToolScope): Promise<void> {
    const tab = this.scopeTab(name);
    await tab.click();
    await expect(tab).toHaveAttribute('data-state', 'active');
  }

  async selectDateFilter(name: ToolDateFilter): Promise<void> {
    await this.filterButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toBeHidden();
  }

  async selectView(index: 0 | 1): Promise<void> {
    await expect(this.viewToggles).toHaveCount(2);
    const toggle = this.viewToggles.nth(index);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  wizardTab(name: ToolWizardTab): Locator {
    if (name === 'Information') return this.informationTab;
    if (name === 'API Details') return this.apiDetailsTab;
    return this.accessTab;
  }

  async openCreateWizard(): Promise<void> {
    await this.createToolButton.click();
    await expect(this.wizardDialog).toBeVisible();
    await expect(this.informationTab).toBeVisible();
    await this.expectActiveWizardTab('Information');
  }

  async openWizardTab(name: ToolWizardTab): Promise<void> {
    const tab = this.wizardTab(name);
    await tab.click();
    await this.expectActiveWizardTab(name);
  }

  async expectActiveWizardTab(name: ToolWizardTab): Promise<void> {
    await expect(this.wizardTab(name)).toHaveAttribute('data-state', 'active');
  }

  apiSectionButton(name: ToolApiSection): Locator {
    return this.apiPanel.getByRole('button', {
      name: new RegExp(`^(?:[123]\\s*)?${name}\\b`, 'i'),
    });
  }

  async openApiSection(name: ToolApiSection): Promise<void> {
    await this.expectActiveWizardTab('API Details');
    const marker = this.apiSectionMarker(name);
    if (await marker.isVisible().catch(() => false)) return;

    let currentSection = await this.visibleApiSection();
    if (currentSection === 'Endpoint' && name !== 'Endpoint') {
      await this.advanceApiSection('Header');
      if (name === 'Header') return;
      currentSection = 'Header';
    }
    if (currentSection === 'Header' && name === 'Body') {
      await this.advanceApiSection('Body');
      return;
    }

    const sectionButton = this.apiSectionButton(name);
    await expect(sectionButton).toBeEnabled({ timeout: 30_000 });
    await sectionButton.click();
    await expect(marker).toBeVisible({ timeout: 30_000 });
  }

  async expectActiveApiSection(name: ToolApiSection): Promise<void> {
    await expect(this.apiSectionMarker(name)).toBeVisible();
  }

  private apiSectionMarker(name: ToolApiSection): Locator {
    if (name === 'Endpoint') return this.endpointInput;
    if (name === 'Header') {
      return this.customHeadersButton.or(this.noAuthenticationButton).first();
    }
    return this.apiPanel.getByText(/^5\. Payload \(/).first();
  }

  private async visibleApiSection(): Promise<ToolApiSection | null> {
    for (const section of ['Endpoint', 'Header', 'Body'] as const) {
      if (await this.apiSectionMarker(section).isVisible().catch(() => false)) {
        return section;
      }
    }
    return null;
  }

  private async advanceApiSection(expectedSection: 'Header' | 'Body'): Promise<void> {
    const sectionNext = this.apiPanel.getByRole('button', {
      name: 'Next',
      exact: true,
    });
    await expect(sectionNext).toBeVisible({ timeout: 30_000 });
    await expect(sectionNext).toBeEnabled({ timeout: 30_000 });
    await sectionNext.click();
    await expect(this.apiSectionMarker(expectedSection)).toBeVisible({
      timeout: 30_000,
    });
  }

  async fillInformation(
    name: string,
    purpose: string,
    keywords: string,
  ): Promise<void> {
    await this.toolNameInput.fill(name);
    await this.toolPurposeInput.fill(purpose);
    await this.botKeywordsInput.fill(keywords);
  }

  async selectMethod(method: HttpMethod): Promise<void> {
    await this.openApiSection('Endpoint');
    await this.methodSelect.click();
    await this.page.getByRole('option', { name: method, exact: true }).click();
    await expect(this.methodSelect).toContainText(method);
  }

  async selectPayloadType(type: PayloadType): Promise<void> {
    await this.openApiSection('Header');
    await this.payloadTypeSelect.click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
    await expect(this.payloadTypeSelect).toContainText(type);
  }

  async fillEndpoint(endpoint: string): Promise<void> {
    await this.openApiSection('Endpoint');
    await this.endpointInput.fill(endpoint);
    await this.endpointInput.blur();
  }

  async expectEndpoint(endpoint: string): Promise<void> {
    await this.openApiSection('Endpoint');
    await expect(this.endpointInput).toHaveValue(normalizeEndpointFieldValue(endpoint));
  }

  async expectMethod(method: HttpMethod): Promise<void> {
    await this.openApiSection('Endpoint');
    await expect(this.methodSelect).toContainText(method);
  }

  async fillHeaderJson(header: string): Promise<void> {
    await this.openApiSection('Header');
    await this.apiPanel.getByRole('button', {
      name: /^Custom Headers\b/,
    }).click();
    if (!await this.headerJsonInput.isVisible().catch(() => false)) {
      await this.apiPanel.getByRole('button', {
        name: 'JSON',
        exact: true,
      }).click();
    }
    await expect(this.headerJsonInput).toBeVisible();
    await this.headerJsonInput.fill(header);
    await this.headerJsonInput.blur();
  }

  async headerJsonValue(): Promise<string> {
    await this.openApiSection('Header');
    await this.apiPanel.getByRole('button', {
      name: /^Custom Headers\b/,
    }).click();
    if (!await this.headerJsonInput.isVisible().catch(() => false)) {
      await this.apiPanel.getByRole('button', {
        name: 'JSON',
        exact: true,
      }).click();
    }
    await expect(this.headerJsonInput).toBeVisible();
    return this.headerJsonInput.inputValue();
  }

  async selectNoAuthentication(): Promise<void> {
    await this.openApiSection('Header');
    await expect(this.noAuthenticationButton).toBeVisible();
    await this.noAuthenticationButton.click();
    await this.expectNoAuthenticationSelected();
  }

  async expectNoAuthenticationSelected(): Promise<void> {
    await this.openApiSection('Header');
    await expect(this.noAuthenticationButton).toBeVisible();
    // The current application does not expose aria-pressed/aria-checked for
    // these two cards. Assert both its selected visual state and the resulting
    // behavior: the Custom Headers editor is not rendered.
    await expect(this.noAuthenticationButton).toHaveClass(/ring-foreground/);
    await expect(this.customHeadersButton).not.toHaveClass(/ring-foreground/);
    await expect(this.apiPanel.getByRole('group', {
      name: 'Header format',
      exact: true,
    })).toBeHidden();
    await expect(this.headerJsonInput).toBeHidden();
  }

  async expectPayloadType(type: PayloadType): Promise<void> {
    await this.openApiSection('Header');
    await expect(this.payloadTypeSelect).toContainText(type);
  }

  async fillPayloadJson(payload: string): Promise<void> {
    await this.openApiSection('Body');
    await expect(this.payloadJsonInput).toBeVisible();
    await this.payloadJsonInput.fill(payload);
    await this.payloadJsonInput.blur();
  }

  async payloadJsonValue(): Promise<string> {
    await this.openApiSection('Body');
    await expect(this.payloadJsonInput).toBeVisible();
    return this.payloadJsonInput.inputValue();
  }

  async fillPayload(
    payloadType: PayloadType,
    value: ToolPayloadValue,
  ): Promise<void> {
    if (payloadType === 'JSON') {
      await this.fillPayloadJson(requireTextPayload(payloadType, value));
      return;
    }

    await this.openApiSection('Body');
    if (payloadType === 'XML') {
      await expect(this.payloadXmlInput).toBeVisible();
      await this.payloadXmlInput.fill(requireTextPayload(payloadType, value));
      await this.payloadXmlInput.blur();
      return;
    }

    const bulkEditor = await this.openPayloadBulkEditor();
    await bulkEditor.fill(formatKeyValuePayload(value));
    const applyButton = this.apiPanel.getByRole('button', {
      name: 'Apply',
      exact: true,
    });
    await expect(applyButton).toBeEnabled();
    await applyButton.click();
    await expect(bulkEditor).toBeHidden();
  }

  async payloadValue(payloadType: PayloadType): Promise<string> {
    if (payloadType === 'JSON') return this.payloadJsonValue();

    await this.openApiSection('Body');
    if (payloadType === 'XML') {
      await expect(this.payloadXmlInput).toBeVisible();
      return this.payloadXmlInput.inputValue();
    }

    const bulkEditor = await this.openPayloadBulkEditor();
    const value = await bulkEditor.inputValue();
    await this.apiPanel.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click();
    await expect(bulkEditor).toBeHidden();
    return value;
  }

  private async openPayloadBulkEditor(): Promise<Locator> {
    if (!await this.payloadBulkEditInput.isVisible().catch(() => false)) {
      await this.apiPanel.getByRole('button', {
        name: 'Bulk Edit',
        exact: true,
      }).click();
    }
    await expect(this.payloadBulkEditInput).toBeVisible();
    return this.payloadBulkEditInput;
  }

  async fillSchemaJson(schema: string): Promise<void> {
    await this.openApiSection('Body');
    await this.schemaJsonInput.fill(schema);
    await this.schemaJsonInput.blur();
  }

  async schemaJsonValue(): Promise<string> {
    await this.openApiSection('Body');
    return this.schemaJsonInput.inputValue();
  }

  async fillApiDetails(options: {
    method: HttpMethod;
    payloadType: PayloadType;
    endpoint: string;
    header: string;
    payload: string;
    schema?: string;
  }): Promise<void> {
    await this.fillEndpoint(options.endpoint);
    await this.selectMethod(options.method);
    await this.clickNext();
    await this.expectActiveApiSection('Header');
    await this.selectPayloadType(options.payloadType);
    await this.fillHeaderJson(options.header);
    await this.clickNext();
    await this.expectActiveApiSection('Body');
    await this.fillPayload(options.payloadType, options.payload);
    if (options.schema !== undefined) {
      await this.fillSchemaJson(options.schema);
    }
  }

  async generateSchema(): Promise<string> {
    await this.openApiSection('Body');
    const previousSchema = await this.schemaJsonInput.inputValue();
    const validateButton = this.apiPanel.getByRole('button', {
      name: 'Validate',
      exact: true,
    });
    if (await validateButton.isVisible().catch(() => false)) {
      await validateButton.click();
      await expect(this.apiPanel.getByText('JSON is valid', { exact: true }))
        .toBeVisible();
    }
    await this.generateSchemaButton.click();
    await expect(this.generateSchemaButton).toBeVisible({ timeout: 30_000 });
    await expect.poll(
      async () => this.schemaJsonInput.inputValue(),
      { timeout: 30_000 },
    ).not.toBe(previousSchema);
    const schema = await this.schemaJsonInput.inputValue();
    expect(schema.trim()).not.toBe('{}');
    return schema;
  }

  async clickNext(): Promise<void> {
    if (await this.apiDetailsTab.getAttribute('data-state') === 'active') {
      const currentSection = await this.visibleApiSection();
      if (currentSection === 'Endpoint' || currentSection === 'Header') {
        const sectionNext = this.apiPanel.getByRole('button', {
          name: 'Next',
          exact: true,
        });
        await expect(sectionNext).toBeVisible({ timeout: 30_000 });
        if (!await sectionNext.isEnabled()) {
          await expect(sectionNext).toBeDisabled();
          return;
        }
        await sectionNext.click();
        return;
      }
    }
    const wizardNext = this.wizardDialog.getByRole('button', {
      name: 'Next',
      exact: true,
    });
    if (!await wizardNext.isEnabled()) {
      await expect(wizardNext).toBeDisabled();
      return;
    }
    await wizardNext.click();
  }

  async clickBack(): Promise<void> {
    if (await this.apiDetailsTab.getAttribute('data-state') === 'active') {
      const sectionBack = this.apiPanel.getByRole('button', {
        name: 'Back',
        exact: true,
      });
      if (await sectionBack.isVisible().catch(() => false)) {
        await sectionBack.click();
        return;
      }
    }
    await this.wizardDialog.getByRole('button', {
      name: 'Back',
      exact: true,
    }).click();
  }

  async cancelWizard(): Promise<void> {
    await this.wizardDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).first().click();
    await expect(this.informationTab).toBeHidden();
    await this.expectLoaded();
  }

  async expectAccessControls(): Promise<void> {
    await this.expectActiveWizardTab('Access');
    await expect(this.page.getByText('User Access', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Selected Users (0)', { exact: true }))
      .toBeVisible();
    await expect(this.page.getByText('No users selected.', { exact: true }))
      .toBeVisible();
    await expect(this.page.getByText('People with access', { exact: true }))
      .toBeVisible();
    await expect(this.page.getByText('Owner', { exact: true })).toBeVisible();
  }

  async expectCompanyAccessAvailable(): Promise<void> {
    await this.expectActiveWizardTab('Access');
    await expect(this.page.getByText('Company Access', { exact: true }))
      .toBeVisible();
    await expect(this.companyAccessToggle).toBeVisible();
    await expect(this.companyAccessToggle).toHaveAttribute('role', 'switch');
  }

  async setCompanyAccess(enabled: boolean): Promise<void> {
    await this.expectCompanyAccessAvailable();
    const desiredState = enabled ? 'checked' : 'unchecked';
    if (await this.companyAccessToggle.getAttribute('data-state') !== desiredState) {
      await this.companyAccessToggle.click();
    }
    await this.expectCompanyAccess(enabled);
  }

  async expectCompanyAccess(enabled: boolean): Promise<void> {
    await this.expectCompanyAccessAvailable();
    await expect(this.companyAccessToggle).toHaveAttribute(
      'data-state',
      enabled ? 'checked' : 'unchecked',
    );
    await expect(this.companyAccessToggle).toHaveAttribute(
      'aria-checked',
      String(enabled),
    );
  }

  async expectSelectedUsersCount(count: number): Promise<void> {
    await this.expectActiveWizardTab('Access');
    await expect(this.wizardDialog.getByText(
      `Selected Users (${count})`,
      { exact: true },
    )).toBeVisible();
  }

  async activeEmployeeSearchCandidates(
    directoryPath: string,
    limit: number,
  ): Promise<string[]> {
    await this.expectActiveWizardTab('Access');
    const directoryUrl = new URL(directoryPath, this.page.url()).toString();
    const directoryResponse = await this.page.evaluate(async (url) => {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      return {
        ok: response.ok,
        status: response.status,
        payload: await response.json(),
      };
    }, directoryUrl);
    if (!directoryResponse.ok) {
      throw new Error(
        `Employee directory request failed with status ${directoryResponse.status}.`,
      );
    }

    const payload = directoryResponse.payload as {
      data?: {
        data?: Array<{
          email?: unknown;
          status?: unknown;
        }>;
      };
    };
    const records = Array.isArray(payload.data?.data) ? payload.data.data : [];
    const candidates = [...new Map(records
      .filter((record) => String(record.status).toLowerCase() === 'active')
      .map((record) => typeof record.email === 'string'
        ? record.email.trim()
        : '')
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      .map((email) => [email.toLowerCase(), email] as const))
      .values()]
      .slice(0, limit);

    if (candidates.length < 2) {
      throw new Error(
        'The active business directory did not provide two eligible employees.',
      );
    }
    return candidates;
  }

  async selectDistinctEmployee(
    searchValue: string,
    expectedCount: number,
  ): Promise<boolean> {
    await this.expectActiveWizardTab('Access');
    await expect(this.employeeSearchInput).toBeVisible();
    const expectedHeading = this.wizardDialog.getByText(
      `Selected Users (${expectedCount})`,
      { exact: true },
    );
    const employeeList = this.employeeSearchInput.locator(
      'xpath=../following-sibling::div['
      + 'contains(concat(" ", normalize-space(@class), " "), " divide-y ")][1]',
    );
    const addExistingEmployeeButton = employeeList
      .locator('button[data-slot="button"]')
      .filter({ has: this.page.locator('svg.lucide-plus') })
      .filter({ hasNotText: 'Add User' })
      .first();

    // Set the controlled input in the page so dynamic employee identifiers
    // never become Playwright action names, traces, or reporter step values.
    await this.setEmployeeSearchValue('');
    await employeeList.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
    await this.setEmployeeSearchValue(searchValue);

    const resolved = await employeeList
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!resolved) {
      await this.setEmployeeSearchValue('');
      return false;
    }
    await expect(addExistingEmployeeButton).toBeVisible({ timeout: 5_000 });
    await addExistingEmployeeButton.click();

    const selected = await expectedHeading
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (selected) {
      await this.setEmployeeSearchValue('');
      return true;
    }
    if (!await this.accessTab.isVisible().catch(() => false)) {
      throw new Error(
        'Selecting an existing employee unexpectedly closed the Tool wizard.',
      );
    }

    await this.setEmployeeSearchValue('');
    return false;
  }

  private async setEmployeeSearchValue(value: string): Promise<void> {
    await this.employeeSearchInput.evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(input, nextValue);
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: nextValue,
        inputType: nextValue ? 'insertText' : 'deleteContentBackward',
      }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect.poll(
      async () => (await this.employeeSearchInput.inputValue()) === value,
      { timeout: 5_000 },
    ).toBe(true);
  }

  async setSelectedUserPermission(index: number, permission: string): Promise<void> {
    await this.expectActiveWizardTab('Access');
    const controls = this.wizardDialog.getByRole('combobox');
    await expect.poll(async () => controls.count()).toBeGreaterThan(index);
    const control = controls.nth(index);
    await control.click();
    await this.page.getByRole('option', {
      name: permission,
      exact: true,
    }).click();
    await expect(control).toContainText(permission);
  }

  async expectSelectedUserPermission(
    index: number,
    permission: string,
  ): Promise<void> {
    const controls = this.wizardDialog.getByRole('combobox');
    await expect.poll(async () => controls.count()).toBeGreaterThan(index);
    await expect(controls.nth(index)).toContainText(permission);
  }

  async expectSelectedUserPermissions(permissions: string[]): Promise<void> {
    const controls = this.wizardDialog.getByRole('combobox');
    await expect(controls).toHaveCount(permissions.length);
    for (let index = 0; index < permissions.length; index += 1) {
      await this.expectSelectedUserPermission(index, permissions[index]);
    }
  }

  async submitWizard(actionName: string): Promise<void> {
    await this.expectActiveWizardTab('Access');
    await this.wizardDialog.getByRole('button', {
      name: actionName,
      exact: true,
    }).click();
    await expect(this.informationTab).toBeHidden({ timeout: 60_000 });
    await this.expectLoaded();
  }

  async searchForTool(name: string): Promise<Locator> {
    await this.searchTools.fill(name);
    const card = this.toolCard(name);
    await expect(card).toBeVisible({ timeout: 60_000 });
    return card;
  }

  async openEditTool(name: string): Promise<void> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Edit Tool',
      exact: true,
    }).click();
    await expect(this.informationTab).toBeVisible();
    await this.expectActiveWizardTab('Information');
  }

  async openActions(name: string): Promise<Locator> {
    const card = this.toolCard(name);
    await expect(card).toBeVisible();
    await card.hover();
    const trigger = card.locator('button[aria-haspopup=menu]');
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const menu = this.page.getByRole('menu').filter({
      has: this.page.getByRole('menuitem', { name: 'Delete', exact: true }),
    });
    await expect(menu).toBeVisible();
    return menu;
  }

  async openDeleteConfirmation(name: string): Promise<Locator> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: 'Delete',
      exact: true,
    }).click();
    const confirmation = this.deleteConfirmation(name);
    await this.expectDeleteConfirmation(confirmation, name);
    return confirmation;
  }

  async cancelDelete(name: string): Promise<void> {
    const confirmation = await this.visibleOrOpenDeleteConfirmation(name);
    await confirmation.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click();
    await expect(confirmation).toBeHidden();
    await expect(this.toolCard(name)).toBeVisible();
  }

  async confirmDelete(name: string): Promise<void> {
    const confirmation = await this.visibleOrOpenDeleteConfirmation(name);
    await confirmation.getByRole('button', {
      name: 'Delete',
      exact: true,
    }).click();
    await expect(confirmation).toBeHidden({ timeout: 60_000 });
    await expect(this.page.getByText('Tool deleted successfully!', {
      exact: true,
    })).toBeVisible({ timeout: 60_000 });
    await this.expectToolAbsent(name);
  }

  async expectToolAbsent(name: string): Promise<void> {
    await this.expectLoaded();
    await this.searchTools.fill(name);
    await expect(this.toolCard(name)).toHaveCount(0, { timeout: 60_000 });

    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
    await this.searchTools.fill(name);
    await expect(this.toolCard(name)).toHaveCount(0, { timeout: 60_000 });
  }

  private deleteConfirmation(name: string): Locator {
    return this.page.getByRole('alertdialog', {
      name: 'Delete Tool',
      exact: true,
    }).filter({ hasText: deleteConfirmationMessage(name) });
  }

  private async visibleOrOpenDeleteConfirmation(name: string): Promise<Locator> {
    const confirmation = this.deleteConfirmation(name);
    if (!await confirmation.isVisible().catch(() => false)) {
      return this.openDeleteConfirmation(name);
    }
    await this.expectDeleteConfirmation(confirmation, name);
    return confirmation;
  }

  private async expectDeleteConfirmation(
    confirmation: Locator,
    name: string,
  ): Promise<void> {
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText('Delete Tool', { exact: true }))
      .toBeVisible();
    await expect(confirmation.getByText(
      deleteConfirmationMessage(name),
      { exact: true },
    )).toBeVisible();
  }
}

function normalizeEndpointFieldValue(endpoint: string): string {
  return endpoint.replace(/^https:\/\//i, '');
}

function requireTextPayload(
  payloadType: 'JSON' | 'XML',
  value: ToolPayloadValue,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${payloadType} payload data must be a string.`);
  }
  return value;
}

function formatKeyValuePayload(value: ToolPayloadValue): string {
  if (typeof value === 'string') return value;
  return value.map((entry) => `${entry.key}: ${entry.value}`).join('\n');
}

function deleteConfirmationMessage(name: string): string {
  return `Are you sure you want to delete "${name}"? This action cannot be undone.`;
}
