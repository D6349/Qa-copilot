import { type Locator, type Page, expect } from '@playwright/test';

export type AgentScope = 'All' | 'My Agents' | 'Public Agents' | 'Shared Agents';
export type AgentSort = 'Ascending' | 'Descending' | 'Last Modified';
export type AgentWizardTab =
  | 'Information'
  | 'Instructions'
  | 'Tools'
  | 'Connectors'
  | 'Swarm'
  | 'Knowledge'
  | 'Guardrail'
  | 'UI Component'
  | 'Access';
export type AgentResourceTab =
  | 'Tools'
  | 'Connectors'
  | 'Swarm'
  | 'Guardrail'
  | 'UI Component';

/** Semantic locators and reusable actions for the live June Agents UI. */
export class AgentsPage {
  readonly page: Page;
  readonly path = '/agents';
  readonly createPath = '/agents/create-agent';
  readonly heading: Locator;
  readonly searchAgents: Locator;
  readonly agentCards: Locator;
  readonly createAgentButton: Locator;
  readonly sortMenu: Locator;
  readonly newChatButton: Locator;
  readonly searchChatsButton: Locator;
  readonly exchangeButton: Locator;
  readonly agentsButton: Locator;
  readonly toolsButton: Locator;
  readonly exploreButton: Locator;
  readonly accountMenu: Locator;
  readonly wizardDialog: Locator;
  readonly wizardHeading: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly initialPromptInput: Locator;
  readonly instructionGeneratorInput: Locator;
  readonly instructionsInput: Locator;
  readonly toolsSearchInput: Locator;
  readonly accessSearchInput: Locator;
  readonly accessUserTab: Locator;
  readonly accessPublicTab: Locator;
  readonly knowledgeFileInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Agents', exact: true });
    this.searchAgents = page.getByPlaceholder('Search agents...');
    const cardBySlot = page.locator('[data-slot="card"]:visible').filter({
      hasText: 'Created by:',
    });
    const cardByRole = page.locator('[role="button"]:visible').filter({
      hasText: 'Created by:',
    });
    this.agentCards = cardBySlot.or(cardByRole);
    this.createAgentButton = page.getByRole('button', {
      name: 'Create Agent',
      exact: true,
    });
    this.sortMenu = page.getByRole('button', { name: 'Sort By' });
    this.newChatButton = page.getByRole('button', { name: 'New Chat' });
    this.searchChatsButton = page.getByRole('button', { name: 'Search Chats' });
    this.exchangeButton = page.getByRole('button', { name: 'Exchange' });
    this.agentsButton = page.getByRole('button', {
      name: 'Agents',
      exact: true,
    });
    this.toolsButton = page.getByRole('button', {
      name: 'Tools',
      exact: true,
    });
    this.exploreButton = page.getByRole('button', { name: 'Explore' });
    this.accountMenu = page.getByRole('complementary');

    this.wizardHeading = page.getByRole('heading', {
      name: /^(?:New|Edit) Agent$/,
    });
    this.wizardDialog = page.getByRole('dialog').filter({
      has: this.wizardHeading,
    });
    this.nameInput = this.wizardDialog.getByPlaceholder(
      'Give your agent a short name',
      { exact: true },
    );
    this.descriptionInput = this.wizardDialog.getByPlaceholder(
      'Describe what this agent will help your team with',
      { exact: true },
    );
    this.initialPromptInput = this.wizardDialog.getByPlaceholder(
      /This will be the first instruction/i,
    );
    this.instructionGeneratorInput = this.wizardDialog.getByPlaceholder(
      /Describe what your AI agent should do/i,
    );
    this.instructionsInput = this.wizardDialog.getByPlaceholder(
      'Instructions for the agent',
      { exact: true },
    );
    this.toolsSearchInput = this.wizardDialog.getByPlaceholder(
      'Search tools...',
      { exact: true },
    ).first();
    this.accessSearchInput = this.wizardDialog.getByPlaceholder(
      'Search by employee mail',
      { exact: true },
    );
    this.accessUserTab = this.wizardDialog.getByRole('tab', {
      name: 'User',
      exact: true,
    });
    this.accessPublicTab = this.wizardDialog.getByRole('tab', {
      name: 'Public',
      exact: true,
    });
    this.knowledgeFileInput = this.wizardDialog.locator('input[type="file"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    const loaded = await this.searchAgents
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const login = this.page.getByRole('dialog', { name: /log in|sign up/i });
      if (await login.isVisible().catch(() => false)) {
        throw new Error(
          'June authentication expired. Run "npm.cmd run auth:refresh" first.',
        );
      }
      if (await this.agentsButton.isEnabled().catch(() => false)) {
        await this.agentsButton.click();
      }
    }
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path + '(?:[?#]|$)'), {
      timeout: 30_000,
    });
    await expect(this.heading).toBeVisible();
    await expect(this.searchAgents).toBeVisible();
    await expect(this.createAgentButton).toBeVisible();
  }

  scopeTab(name: AgentScope): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  agentCard(name: string): Locator {
    return this.agentCards.filter({
      has: this.page.getByRole('link', { name, exact: true }),
    }).first();
  }

  async agentNames(): Promise<string[]> {
    const names = await this.agentCards.evaluateAll((cards) => cards.map((card) => {
      const heading = card.querySelector('a[title], a');
      return (heading?.textContent || '').trim();
    }).filter(Boolean));
    return [...new Set(names)];
  }

  async visibleAgentNames(): Promise<string[]> {
    await expect(this.agentCards.first()).toBeVisible({ timeout: 30_000 });
    return this.agentNames();
  }

  async searchForAgent(name: string): Promise<Locator> {
    await this.searchAgents.fill(name);
    const card = this.agentCard(name);
    await expect(card).toBeVisible({ timeout: 30_000 });
    return card;
  }

  async clearSearch(): Promise<void> {
    await this.searchAgents.clear();
    await expect(this.searchAgents).toHaveValue('');
  }

  async selectScope(name: AgentScope): Promise<number> {
    const tab = this.scopeTab(name);
    if (await tab.getAttribute('data-state') === 'active') {
      return this.agentCards.count();
    }
    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes('/get_agents_list/')
        && response.request().method() === 'GET',
      { timeout: 20_000 },
    );
    await tab.click();
    const response = await responsePromise;
    expect(response.status(), name + ' API status').toBeLessThan(400);
    await expect(tab).toHaveAttribute('data-state', 'active');
    return this.agentCards.count();
  }

  async sortBy(name: AgentSort): Promise<void> {
    await this.sortMenu.click();
    const option = this.page.getByRole('menuitemradio', {
      name,
      exact: true,
    });
    await expect(option).toBeVisible();
    await option.click();
    await expect(this.sortMenu).toBeVisible();
  }

  async openAccountMenu(): Promise<void> {
    const currentBusiness = (await this.page.getByRole('contentinfo')
      .getByRole('button').innerText()).trim();
    await this.accountMenu.getByText(currentBusiness, { exact: true })
      .last().click();
  }

  async openCreateWizard(): Promise<void> {
    await this.createAgentButton.click();
    await expect(this.page).toHaveURL(
      new RegExp(this.createPath + '(?:[?#]|$)'),
      { timeout: 30_000 },
    );
    await expect(this.wizardDialog).toBeVisible();
    await expect(this.wizardHeading).toHaveText('New Agent');
    await this.expectActiveWizardTab('Information');
  }

  wizardTab(name: AgentWizardTab): Locator {
    return this.wizardDialog.getByRole('tab', { name, exact: true });
  }

  wizardPanel(name: AgentWizardTab): Locator {
    return this.wizardDialog.getByRole('tabpanel', { name, exact: true });
  }

  async openWizardTab(name: AgentWizardTab): Promise<void> {
    await this.wizardTab(name).click();
    await this.expectActiveWizardTab(name);
  }

  async expectActiveWizardTab(name: AgentWizardTab): Promise<void> {
    await expect(this.wizardTab(name)).toHaveAttribute('data-state', 'active');
  }

  async fillInformation(options: {
    name: string;
    description: string;
    initialPrompt?: string;
  }): Promise<void> {
    await this.nameInput.fill(options.name);
    await this.descriptionInput.fill(options.description);
    if (options.initialPrompt !== undefined) {
      await this.initialPromptInput.fill(options.initialPrompt);
    }
  }

  modelControl(): Locator {
    const button = this.wizardDialog.getByRole('button', {
      name: /^(?:Select the model|GPT\b|Claude\b|Gemini\b)/i,
    });
    const menu = this.wizardDialog.getByRole('menu', {
      name: /^(?:Select the model|GPT\b|Claude\b|Gemini\b)/i,
    });
    return button.or(menu).first();
  }

  countryControl(): Locator {
    const combobox = this.wizardDialog.getByRole('combobox', {
      name: /country/i,
    });
    const button = this.wizardDialog.getByRole('button', {
      name: /^(?:Select country|India|United States|United Kingdom)/i,
    });
    return combobox.or(button)
      .or(this.wizardDialog.getByRole('combobox').first()).first();
  }

  async selectModel(model: string): Promise<void> {
    const control = this.modelControl();
    await expect(control).toBeVisible();
    await control.click();
    const providerName = model.startsWith('Claude')
      ? 'Claude'
      : model.startsWith('Grok')
        ? 'Grok'
        : model.startsWith('Bedrock')
          ? 'Bedrock'
          : 'OpenAI';
    const provider = this.page.locator('[role="menuitem"]:visible')
      .filter({ hasText: providerName }).first();
    await expect(provider).toBeVisible();
    await provider.hover({ force: true, timeout: 5_000 });
    const option = this.page.locator('[role="menuitem"]:visible')
      .filter({ hasText: new RegExp('^' + escapeRegExp(model), 'i') })
      .first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(this.modelControl()).toContainText(model);
  }

  async selectCountry(country: string): Promise<void> {
    const control = this.countryControl();
    await expect(control).toBeVisible();
    const selected = (await control.innerText().catch(() => '')).trim();
    if (selected.toLowerCase().includes(country.toLowerCase())) return;
    await control.click();
    const option = this.page.getByRole('option', {
      name: country,
      exact: true,
    }).or(this.page.getByRole('menuitem', {
      name: country,
      exact: true,
    })).first();
    await expect(option).toBeVisible();
    await option.click();
  }

  resourceSearchInput(tab: AgentResourceTab): Locator {
    if (tab === 'Tools') return this.toolsSearchInput;
    const panel = this.wizardPanel(tab);
    const placeholder = tab === 'Connectors'
      ? 'Search connectors...'
      : tab === 'Swarm'
        ? 'Search swarms...'
        : tab === 'Guardrail'
          ? 'Search guardrails...'
          : 'Search UI components...';
    return panel.getByPlaceholder(placeholder, { exact: true });
  }

  resourceCheckboxes(tab: AgentResourceTab): Locator {
    return this.wizardPanel(tab).getByRole('checkbox');
  }

  selectedResourceLabels(tab: AgentResourceTab): Locator {
    return this.wizardPanel(tab).getByRole('checkbox', { checked: true });
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
    await this.wizardDialog.getByRole('button', {
      name: /^Create(?: Agent)?$/,
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

  async openActions(name: string): Promise<Locator> {
    const card = this.agentCard(name);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.hover();
    const trigger = card.locator(
      '[data-slot="dropdown-menu-trigger"], button[aria-haspopup="menu"]',
    ).first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async openEditAgent(name: string): Promise<void> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: /^Edit(?: Agent)?$/,
    }).click();
    await expect(this.wizardDialog).toBeVisible({ timeout: 30_000 });
    await expect(this.wizardHeading).toHaveText('Edit Agent');
    await this.expectActiveWizardTab('Information');
  }

  async openDeleteConfirmation(name: string): Promise<Locator> {
    const menu = await this.openActions(name);
    await menu.getByRole('menuitem', {
      name: /^Delete(?: Agent)?$/,
    }).click();
    const confirmation = this.page.getByRole('alertdialog').filter({
      hasText: 'Delete Agent',
    }).or(this.page.getByRole('dialog').filter({
      hasText: 'Delete Agent',
    })).first();
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(
      'Are you sure you want to delete "' + name
        + '"? This action cannot be undone.',
    );
    return confirmation;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
