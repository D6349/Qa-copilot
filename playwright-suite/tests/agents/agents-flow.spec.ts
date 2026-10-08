import {
  type Locator,
  type Page,
} from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import {
  AgentsPage,
  type AgentResourceTab,
  type AgentScope,
  type AgentSort,
  type AgentWizardTab,
} from '../../pages/agents.page';
import {
  loadAgentsExcelRuntime,
  requireAgentsExcelCase,
  requireAgentsExcelSetting,
  resolveAgentsExcelTokens,
  type AgentExcelTokenValues,
} from '../../utils/agentsExcelData';
import {
  attachJsonEvidence,
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

const EXCEL_INPUT = loadAgentsExcelRuntime();
const TIME_ZONE = requireAgentsExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInZone(
  process.env.AGENTS_RUN_ISO
    ? new Date(process.env.AGENTS_RUN_ISO)
    : new Date(),
);
const RUN_TOKENS: AgentExcelTokenValues = {
  RUN_COMPACT: RUN.compact,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
};
const UPDATE = timestampInZone(new Date(new Date(RUN.iso).getTime() + 1_000));
const TIME_TOKENS: AgentExcelTokenValues = {
  ...RUN_TOKENS,
  UPDATE_COMPACT: UPDATE.compact,
  UPDATE_DISPLAY: UPDATE.display,
  UPDATE_ISO: UPDATE.iso,
};
const AGENT_NAME = excelSetting('Agent Name Pattern', RUN_TOKENS);
const UPDATED_AGENT_NAME = excelSetting(
  'Updated Agent Name Pattern',
  TIME_TOKENS,
);
const DRAFT_NAME = excelSetting('Draft Name Pattern', RUN_TOKENS);
const CREATED_DESCRIPTION = excelSetting(
  'Created Description Pattern',
  RUN_TOKENS,
);
const UPDATED_DESCRIPTION = excelSetting(
  'Updated Description Pattern',
  TIME_TOKENS,
);
const INITIAL_PROMPT = excelSetting('Initial Prompt Pattern', RUN_TOKENS);
const UPDATED_INITIAL_PROMPT = excelSetting(
  'Updated Initial Prompt Pattern',
  TIME_TOKENS,
);
const INSTRUCTIONS = excelSetting('Instructions Pattern', RUN_TOKENS);
const UPDATED_INSTRUCTIONS = excelSetting(
  'Updated Instructions Pattern',
  TIME_TOKENS,
);
const MODEL = excelSetting('Model', RUN_TOKENS);
const COUNTRY = excelSetting('Country', RUN_TOKENS);
const XSS_MARKER = excelSetting('XSS Marker', RUN_TOKENS);
const SQL_INJECTION_MARKER = excelSetting(
  'SQL Injection Marker',
  RUN_TOKENS,
);
const SYNTHETIC_SECRET_PREFIX = excelSetting(
  'Synthetic Secret Prefix',
  RUN_TOKENS,
);
const BASE_URL = process.env.BASE_URL
  || requireAgentsExcelSetting(EXCEL_INPUT, 'Base URL');
const COMMON_TOKENS: AgentExcelTokenValues = {
  ...TIME_TOKENS,
  AGENT_NAME,
  UPDATED_AGENT_NAME,
  DRAFT_NAME,
  CREATED_DESCRIPTION,
  UPDATED_DESCRIPTION,
  INITIAL_PROMPT,
  UPDATED_INITIAL_PROMPT,
  INSTRUCTIONS,
  UPDATED_INSTRUCTIONS,
  MODEL,
  COUNTRY,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
  SYNTHETIC_SECRET_PREFIX,
};

test.describe('Sequential June Agents module flow', () => {
  test.describe.configure({ mode: 'default', timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'AF');
    const excelCase = requireAgentsExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        agentName: AGENT_NAME,
        updatedAgentName: UPDATED_AGENT_NAME,
      },
    });
  });

  test('AF-001 opens the Agents module @flow @smoke @functional @prod-smoke @sanity @regression @uat', async ({ page, agentsPage: agents }) => {
    await agents.goto();
  });

  test('AF-002 searches for a visible agent and clears search @flow @regression @functional @sanity @uat', async ({ page, agentsPage: agents }) => {
    await agents.goto();
    const initialNames = await agents.visibleAgentNames();
    const target = initialNames[0];
    await agents.searchForAgent(target);
    const filteredNames = await agents.agentNames();
    expect(filteredNames.length).toBeGreaterThan(0);
    expect(filteredNames.every((name) =>
      name.toLowerCase().includes(target.toLowerCase()))).toBe(true);
    await agents.clearSearch();
    await expect.poll(async () => {
      const restored = await agents.agentNames();
      return initialNames.every((name) => restored.includes(name));
    }).toBe(true);
  });

  test('AF-003 switches every Agents scope tab @flow @regression @functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ scopes: AgentScope[] }>('AF-003');
    await agents.goto();
    for (const scope of data.scopes) {
      const count = await agents.selectScope(scope);
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('AF-004 sorts agents ascending, descending and by last modified @flow @regression @functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ sortOptions: AgentSort[] }>('AF-004');
    await agents.goto();
    const initialCount = (await agents.visibleAgentNames()).length;
    let ascending: string[] = [];
    for (const option of data.sortOptions) {
      await agents.sortBy(option);
      const names = await agents.visibleAgentNames();
      expect(names).toHaveLength(initialCount);
      if (option === 'Ascending') {
        ascending = names;
        expect(names).toEqual(sortNames(names));
      } else if (option === 'Descending') {
        const expected = ascending.length > 0
          ? [...ascending].reverse()
          : sortNames(names).reverse();
        expect(names).toEqual(expected);
      }
    }
  });

  test('AF-005 navigates through New Chat, Search Chats and Exchange @flow @regression @functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ chatDraft: string; chatSearch: string }>('AF-005');
    await agents.goto();

    await agents.newChatButton.click();
    const prompt = page.getByRole('textbox', { name: 'Ask anything' });
    await expect(prompt).toBeVisible();
    await prompt.fill(data.chatDraft);
    await expect(prompt).toHaveValue(data.chatDraft);

    await agents.searchChatsButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Agents', exact: true }).click();
    const search = dialog.getByPlaceholder('Search chats...');
    await search.fill(data.chatSearch);
    await expect(search).toHaveValue(data.chatSearch);
    await page.keyboard.press('Escape');
    if (await dialog.isVisible().catch(() => false)) {
      // This Radix dialog's X button is intentionally icon-only and currently
      // has no accessible name, so scope the first button to this dialog.
      await dialog.getByRole('button').first().click();
    }
    await expect(dialog).toBeHidden();

    await agents.exchangeButton.click();
    await expect(page.getByRole('heading', {
      name: 'Exchange',
      exact: true,
    })).toBeVisible();
    await expect(page.getByPlaceholder('Search exchange agents...'))
      .toBeVisible();
    await agents.agentsButton.click();
    await agents.expectLoaded();
  });

  test('AF-006 shows every Agent wizard field, tab and length contract @flow @validation @functional @sanity @regression @uat', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      tabs: AgentWizardTab[];
      requiredFields: string[];
      nameMaxLength: number;
      descriptionMaxLength: number;
      initialPromptMaxLength: number;
    }>('AF-006');
    await agents.goto();
    await agents.openCreateWizard();
    await expect(agents.nameInput).toHaveAttribute(
      'maxlength',
      String(data.nameMaxLength),
    );
    await expect(agents.descriptionInput).toHaveAttribute(
      'maxlength',
      String(data.descriptionMaxLength),
    );
    await expect(agents.initialPromptInput).toHaveAttribute(
      'maxlength',
      String(data.initialPromptMaxLength),
    );
    await expect(agents.nameInput).toHaveAttribute('required', '');
    await expect(agents.descriptionInput).toHaveAttribute('required', '');
    await expect(agents.initialPromptInput).toHaveAttribute('required', '');
    for (const field of data.requiredFields) {
      await expect(agents.wizardDialog).toContainText(field);
    }
    for (const tab of data.tabs) {
      await expect(agents.wizardTab(tab)).toBeVisible();
    }
    await expect(agents.wizardDialog.getByRole('button', {
      name: 'Create',
      exact: true,
    })).toBeVisible();
    await agents.cancelWizard();
  });

  test('AF-007 selects the configured model and country @flow @positive @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      model: string;
      country: string;
      providers: string[];
      openAiModels: string[];
    }>('AF-007');
    await agents.goto();
    await agents.openCreateWizard();
    await agents.modelControl().click();
    const visibleMenuItems = page.locator('[role="menuitem"]:visible');
    for (const providerName of data.providers) {
      await expect(visibleMenuItems.filter({ hasText: providerName }).first())
        .toBeVisible();
    }
    const openAiProvider = visibleMenuItems.filter({
      hasText: 'OpenAI',
    }).first();
    await openAiProvider.hover({ force: true, timeout: 5_000 });
    for (const modelName of data.openAiModels) {
      await expect(visibleMenuItems.filter({
        hasText: new RegExp('^' + escapeRegExp(modelName)),
      }).first()).toBeVisible();
    }
    await visibleMenuItems.filter({
      hasText: new RegExp('^' + escapeRegExp(data.model)),
    }).first().click();
    await agents.selectCountry(data.country);
    await expect(agents.modelControl()).toContainText(data.model);
    await expect(agents.countryControl()).toContainText(data.country);
    await agents.cancelWizard();

    await agents.openCreateWizard();
    await agents.fillInformation({
      name: DRAFT_NAME,
      description: CREATED_DESCRIPTION,
      initialPrompt: INITIAL_PROMPT,
    });
    await agents.selectCountry(data.country);
    const missingModelAccepted = await attemptWizardSubmit(
      agents,
      'Create',
    );
    if (!missingModelAccepted) {
      await agents.expectActiveWizardTab('Information');
      await agents.cancelWizard();
    } else {
      await cleanupExactSyntheticAgent(agents, DRAFT_NAME);
    }
    test.fail(
      missingModelAccepted,
      'Known product defect: an Agent can be created without a model.',
    );
    expect(missingModelAccepted, 'Missing Agent model was accepted')
      .toBe(false);
  });

  test('AF-008 rejects a missing Agent name @flow @negative @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      name: string;
      description: string;
      initialPrompt: string;
      model: string;
      country: string;
    }>('AF-008');
    await agents.goto();
    await openValidDraft(agents, {
      name: data.name,
      description: data.description,
      initialPrompt: data.initialPrompt,
      model: data.model,
      country: data.country,
    });
    expect(await isNativeInvalid(agents.nameInput)).toBe(true);
    const accepted = await attemptWizardSubmit(agents, 'Create');
    if (!accepted) {
      await agents.expectActiveWizardTab('Information');
      await agents.cancelWizard();
    }
    test.fail(accepted, 'Known product defect: a missing Agent name can advance.');
    expect(accepted, 'Missing Agent name was accepted').toBe(false);
  });

  test('AF-009 rejects a missing Agent description @flow @negative @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      name: string;
      description: string;
      initialPrompt: string;
      model: string;
      country: string;
    }>('AF-009');
    await agents.goto();
    await openValidDraft(agents, {
      name: data.name,
      description: data.description,
      initialPrompt: data.initialPrompt,
      model: data.model,
      country: data.country,
    });
    expect(await isNativeInvalid(agents.descriptionInput)).toBe(true);
    const accepted = await attemptWizardSubmit(agents, 'Create');
    if (!accepted) {
      await agents.expectActiveWizardTab('Information');
      await agents.cancelWizard();
    }
    test.fail(
      accepted,
      'Known product defect: a missing Agent description can advance.',
    );
    expect(accepted, 'Missing Agent description was accepted').toBe(false);
  });

  test('AF-010 rejects whitespace-only Agent basics @flow @negative @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      whitespaceName: string;
      whitespaceDescription: string;
      whitespaceInitialPrompt: string;
      model: string;
      country: string;
    }>('AF-010');
    await agents.goto();

    await openValidDraft(agents, {
      initialPrompt: '',
      model: data.model,
      country: data.country,
    });
    expect(await isNativeInvalid(agents.initialPromptInput)).toBe(true);
    const missingPromptAccepted = await attemptWizardSubmit(
      agents,
      'Create',
    );
    if (!missingPromptAccepted) await agents.cancelWizard();

    await agents.goto();
    await openValidDraft(agents, {
      name: data.whitespaceName,
      description: data.whitespaceDescription,
      initialPrompt: data.whitespaceInitialPrompt,
      model: data.model,
      country: data.country,
    });
    // Do not submit an all-whitespace draft: if the product accepted it, the
    // resulting blank-name card could not be identified safely for cleanup.
    // Native validity still proves whether the UI treats each value as valid.
    const whitespaceAccepted = !await isNativeInvalid(agents.nameInput)
      && !await isNativeInvalid(agents.descriptionInput)
      && !await isNativeInvalid(agents.initialPromptInput);
    await agents.cancelWizard();
    const accepted = missingPromptAccepted || whitespaceAccepted;
    test.fail(
      accepted,
      'Known product defect: missing/whitespace Agent basics can be saved.',
    );
    expect(missingPromptAccepted, 'Missing initial prompt was accepted')
      .toBe(false);
    expect(whitespaceAccepted, 'Whitespace-only Agent basics were accepted')
      .toBe(false);
  });

  test('AF-011 enforces the 100-character Agent name boundary @flow @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      maxLength: number;
      boundaryCharacter: string;
      overflowCharacter: string;
    }>('AF-011');
    await agents.goto();
    await openValidDraft(agents);
    const atLimit = data.boundaryCharacter.repeat(data.maxLength);
    await agents.nameInput.fill(atLimit);
    await expect(agents.nameInput).toHaveValue(atLimit);
    await agents.nameInput.fill(atLimit + data.overflowCharacter);
    await expect(agents.nameInput).toHaveValue(atLimit);
    await agents.cancelWizard();
  });

  test('AF-012 enforces the 1000-character Agent description boundary @flow @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      maxLength: number;
      boundaryCharacter: string;
      overflowCharacter: string;
    }>('AF-012');
    await agents.goto();
    await openValidDraft(agents);
    const atLimit = data.boundaryCharacter.repeat(data.maxLength);
    await agents.descriptionInput.fill(atLimit);
    await expect(agents.descriptionInput).toHaveValue(atLimit);
    await agents.descriptionInput.fill(atLimit + data.overflowCharacter);
    await expect(agents.descriptionInput).toHaveValue(atLimit);
    await agents.cancelWizard();
  });

  test('AF-013 enforces the 100-character initial-prompt boundary @flow @validation @functional @regression', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      maxLength: number;
      boundaryCharacter: string;
      overflowCharacter: string;
    }>('AF-013');
    await agents.goto();
    await openValidDraft(agents);
    const atLimit = data.boundaryCharacter.repeat(data.maxLength);
    await agents.initialPromptInput.fill(atLimit);
    await expect(agents.initialPromptInput).toHaveValue(atLimit);
    await agents.initialPromptInput.fill(atLimit + data.overflowCharacter);
    await expect(agents.initialPromptInput).toHaveValue(atLimit);
    await agents.cancelWizard();
  });

  test('AF-014 preserves Agent values across Next, Back and tabs @flow @regression @functional', async ({ page, agentsPage: agents }) => {
    await agents.goto();
    await openValidDraft(agents);
    await agents.clickNext();
    await agents.expectActiveWizardTab('Instructions');
    await agents.instructionsInput.fill(INSTRUCTIONS);
    await agents.clickBack();
    await agents.expectActiveWizardTab('Information');
    await expect(agents.nameInput).toHaveValue(DRAFT_NAME);
    await expect(agents.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await expect(agents.initialPromptInput).toHaveValue(INITIAL_PROMPT);
    await expect(agents.modelControl()).toContainText(MODEL);
    await expect(agents.countryControl()).toContainText(COUNTRY);
    await agents.clickNext();
    await agents.expectActiveWizardTab('Instructions');
    await expect(agents.instructionsInput).toHaveValue(INSTRUCTIONS);
    await agents.cancelWizard();
  });

  test('AF-015 exposes resource searches without selecting unrelated resources @flow @validation @functional @regression @integration', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      resourceTabs: Array<AgentResourceTab | 'Knowledge'>;
      resourceSearch: string;
    }>('AF-015');
    await agents.goto();
    await openValidDraft(agents);
    for (const tab of data.resourceTabs) {
      await agents.openWizardTab(tab);
      if (tab === 'Knowledge') {
        await expect(agents.knowledgeFileInput).toHaveAttribute(
          'type',
          'file',
        );
        await expect(agents.knowledgeFileInput).toHaveValue('');
        continue;
      }
      if (tab === 'Tools') await waitForToolInventory(agents);
      const search = agents.resourceSearchInput(tab);
      await expect(search).toBeVisible();
      const selectedBefore = await agents.selectedResourceLabels(tab).count();
      await search.fill(data.resourceSearch);
      await expect(search).toHaveValue(data.resourceSearch);
      expect(await agents.selectedResourceLabels(tab).count())
        .toBe(selectedBefore);
      await search.clear();
    }
    await agents.cancelWizard();
  });

  test('AF-016 validates User and Public access controls with unmatched search @flow @validation @functional @sanity @regression @uat', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      userTab: string;
      publicTab: string;
      accessSearch: string;
      selectedUsersText: string;
    }>('AF-016');
    await agents.goto();
    await openValidDraft(agents);
    await agents.openWizardTab('Access');
    await expect(agents.accessUserTab).toHaveText(data.userTab);
    const publicVisible = await agents.accessPublicTab.isVisible()
      .catch(() => false);
    if (publicVisible) {
      await agents.accessPublicTab.click();
      await expect(agents.accessPublicTab).toHaveAttribute(
        'data-state',
        'active',
      );
      await agents.accessUserTab.click();
      await expect(agents.accessUserTab).toHaveAttribute(
        'data-state',
        'active',
      );
    }
    const panel = agents.wizardPanel('Access');
    const selectedBefore = await panel.getByRole('checkbox', {
      checked: true,
    }).count();
    expect(selectedBefore, data.selectedUsersText).toBe(0);
    await agents.accessSearchInput.fill(data.accessSearch);
    expect(await panel.getByRole('checkbox', { checked: true }).count())
      .toBe(selectedBefore);
    await agents.cancelWizard();
    test.fail(
      !publicVisible,
      'Known product defect: the Public access tab is unavailable.',
    );
    expect(publicVisible, 'Public access tab was not visible').toBe(true);
  });

  test('AF-017 cancels an Agent draft without persistence @flow @regression @functional', async ({ page, agentsPage: agents }) => {
    await agents.goto();
    await openValidDraft(agents);
    await agents.clickNext();
    await agents.instructionsInput.fill(INSTRUCTIONS);
    await agents.cancelWizard();
    await agents.searchAgents.fill(DRAFT_NAME);
    await expect(agents.agentCard(DRAFT_NAME)).toHaveCount(0);
    await agents.clearSearch();
  });

  test('AF-018 treats XSS payloads in Agent draft fields as text @flow @security @functional @regression @non-functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ xssPayload: string }>('AF-018');
    await agents.goto();
    await setXssMarker(page, 0);
    await agents.openCreateWizard();
    await agents.fillInformation({
      name: data.xssPayload,
      description: data.xssPayload,
      initialPrompt: data.xssPayload,
    });
    await agents.openWizardTab('Instructions');
    await agents.instructionsInput.fill(data.xssPayload);
    await agents.openWizardTab('Information');
    expect(await readXssMarker(page)).toBe(0);
    expect((await page.locator('script').allTextContents()).join('\n'))
      .not.toContain(data.xssPayload);
    await agents.cancelWizard();
    expect(await readXssMarker(page)).toBe(0);
  });

  test('AF-019 creates a date-time-stamped synthetic Agent @flow @write @create @functional @regression @e2e @integration', async ({ page, agentsPage: agents }, testInfo) => {
    await attachJsonEvidence(testInfo, {
      operation: 'create',
      runAt: RUN.display,
      agentName: AGENT_NAME,
      model: MODEL,
      country: COUNTRY,
    });
    await agents.goto();
    await openValidDraft(agents, { name: AGENT_NAME });
    await agents.clickNext();
    await agents.expectActiveWizardTab('Instructions');
    await agents.instructionsInput.fill(INSTRUCTIONS);
    await clearDefaultToolSelections(agents);
    await agents.submitCreate();
    await agents.searchForAgent(AGENT_NAME);
  });

  test('AF-020 verifies every persisted Agent creation value @flow @regression @functional @e2e @integration', async ({ page, agentsPage: agents }) => {
    await agents.goto();
    await agents.searchForAgent(AGENT_NAME);
    await agents.openEditAgent(AGENT_NAME);
    await expect(agents.nameInput).toHaveValue(AGENT_NAME);
    await expect(agents.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await expect(agents.initialPromptInput).toHaveValue(INITIAL_PROMPT);
    await expect(agents.modelControl()).toContainText(MODEL);
    await expect(agents.countryControl()).toContainText(COUNTRY);
    await agents.openWizardTab('Instructions');
    await expect(agents.instructionsInput).toHaveValue(INSTRUCTIONS);
    await agents.openWizardTab('Tools');
    await waitForToolInventory(agents);
    await expect(agents.selectedResourceLabels('Tools')).toHaveCount(0);
    await agents.cancelWizard();
  });

  test('AF-021 validates required Agent fields while editing @flow @negative @validation @functional @regression @e2e', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      invalidEdits: Array<{
        label: string;
        name?: string;
        description?: string;
        initialPrompt?: string;
      }>;
      updateButton: string;
    }>('AF-021');
    await agents.goto();
    await agents.searchForAgent(AGENT_NAME);
    await agents.openEditAgent(AGENT_NAME);
    const acceptedInvalidEdits: string[] = [];
    for (const invalid of data.invalidEdits) {
      await agents.openWizardTab('Information');
      await agents.fillInformation({
        name: invalid.name ?? AGENT_NAME,
        description: invalid.description ?? CREATED_DESCRIPTION,
        initialPrompt: invalid.initialPrompt ?? INITIAL_PROMPT,
      });
      const values = await Promise.all([
        agents.nameInput.inputValue(),
        agents.descriptionInput.inputValue(),
        agents.initialPromptInput.inputValue(),
      ]);
      const whitespaceOnly = values.some((value) =>
        value.length > 0 && value.trim() === '');
      const accepted = whitespaceOnly
        ? !(await Promise.all([
          isNativeInvalid(agents.nameInput),
          isNativeInvalid(agents.descriptionInput),
          isNativeInvalid(agents.initialPromptInput),
        ])).some(Boolean)
        : await attemptWizardSubmit(agents, data.updateButton);
      if (accepted) {
        acceptedInvalidEdits.push(invalid.label);
        if (!whitespaceOnly) break;
      }
      await agents.expectActiveWizardTab('Information');
      await agents.fillInformation({
        name: AGENT_NAME,
        description: CREATED_DESCRIPTION,
        initialPrompt: INITIAL_PROMPT,
      });
    }
    if (await agents.wizardDialog.isVisible().catch(() => false)) {
      await agents.openWizardTab('Information');
      await agents.fillInformation({
        name: AGENT_NAME,
        description: CREATED_DESCRIPTION,
        initialPrompt: INITIAL_PROMPT,
      });
      await agents.cancelWizard();
    }
    test.fail(
      acceptedInvalidEdits.length > 0,
      'Known product defect: required Agent fields can advance in edit mode.',
    );
    expect(acceptedInvalidEdits, 'Invalid Agent edits were accepted')
      .toEqual([]);
  });

  test('AF-022 renames and updates the synthetic Agent @flow @write @update @functional @regression @e2e @integration', async ({ page, agentsPage: agents }, testInfo) => {
    await attachJsonEvidence(testInfo, {
      operation: 'update',
      runAt: RUN.display,
      previousAgentName: AGENT_NAME,
      updatedAgentName: UPDATED_AGENT_NAME,
    });
    await agents.goto();
    await agents.searchForAgent(AGENT_NAME);
    await agents.openEditAgent(AGENT_NAME);
    await agents.fillInformation({
      name: UPDATED_AGENT_NAME,
      description: UPDATED_DESCRIPTION,
      initialPrompt: UPDATED_INITIAL_PROMPT,
    });
    await agents.clickNext();
    await agents.expectActiveWizardTab('Instructions');
    await agents.instructionsInput.fill(UPDATED_INSTRUCTIONS);
    await agents.submitUpdate();
    await agents.searchForAgent(UPDATED_AGENT_NAME);
  });

  test('AF-023 verifies every persisted Agent update @flow @regression @functional @e2e @integration', async ({ page, agentsPage: agents }) => {
    await agents.goto();
    await agents.searchForAgent(UPDATED_AGENT_NAME);
    await agents.openEditAgent(UPDATED_AGENT_NAME);
    await expect(agents.nameInput).toHaveValue(UPDATED_AGENT_NAME);
    await expect(agents.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
    await expect(agents.initialPromptInput)
      .toHaveValue(UPDATED_INITIAL_PROMPT);
    await expect(agents.modelControl()).toContainText(MODEL);
    await expect(agents.countryControl()).toContainText(COUNTRY);
    await agents.openWizardTab('Instructions');
    await expect(agents.instructionsInput).toHaveValue(UPDATED_INSTRUCTIONS);
    await agents.openWizardTab('Tools');
    await waitForToolInventory(agents);
    await expect(agents.selectedResourceLabels('Tools')).toHaveCount(0);
    await agents.cancelWizard();
  });

  test('AF-024 finds the updated Agent exactly and restricts card actions @flow @regression @functional @e2e', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ expectedMenuItems: string[] }>('AF-024');
    await agents.goto();
    await agents.searchForAgent(UPDATED_AGENT_NAME);
    expect(await agents.agentNames()).toEqual([UPDATED_AGENT_NAME]);
    const menu = await agents.openActions(UPDATED_AGENT_NAME);
    const items = (await menu.getByRole('menuitem').allTextContents())
      .map((item) => item.trim())
      .filter(Boolean);
    expect(items).toEqual(data.expectedMenuItems);
    await page.keyboard.press('Escape');
    await agents.clearSearch();
  });

  test('AF-025 handles injection-shaped Agent searches safely @flow @security @functional @regression @non-functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ searchPayloads: string[] }>('AF-025');
    await agents.goto();
    const initialCount = (await agents.visibleAgentNames()).length;
    await setXssMarker(page, 0);
    for (const payload of data.searchPayloads) {
      await agents.searchAgents.fill(payload);
      const names = await agents.agentNames();
      expect(names.length).toBeLessThanOrEqual(initialCount);
      expect(names.every((name) =>
        name.toLowerCase().includes(payload.toLowerCase()))).toBe(true);
      expect(await readXssMarker(page)).toBe(0);
    }
    await agents.clearSearch();
    expect((await agents.visibleAgentNames()).length).toBeGreaterThan(0);
  });

  test('AF-026 keeps synthetic secrets out of URLs and closed Agent DOM @flow @security @functional @regression @non-functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{ secretValue: string }>('AF-026');
    await agents.goto();
    await openValidDraft(agents, {
      name: DRAFT_NAME,
      description: data.secretValue,
      initialPrompt: INITIAL_PROMPT,
    });
    expect(page.url()).not.toContain(data.secretValue);
    await agents.clickNext();
    await agents.instructionsInput.fill(data.secretValue);
    expect(page.url()).not.toContain(data.secretValue);
    await agents.cancelWizard();
    expect(page.url()).not.toContain(data.secretValue);
    await expect(page.locator('body')).not.toContainText(data.secretValue);
  });

  test('AF-027 prevents access-search injection from selecting users @flow @security @functional @regression @non-functional', async ({ page, agentsPage: agents }) => {
    const data = caseData<{
      accessSearch: string;
      selectedUsersText: string;
    }>('AF-027');
    await agents.goto();
    await openValidDraft(agents);
    await agents.openWizardTab('Access');
    const panel = agents.wizardPanel('Access');
    const checkedBefore = await panel.getByRole('checkbox', {
      checked: true,
    }).count();
    expect(checkedBefore, data.selectedUsersText).toBe(0);
    await agents.accessSearchInput.fill(data.accessSearch);
    expect(await panel.getByRole('checkbox', { checked: true }).count())
      .toBe(checkedBefore);
    await agents.cancelWizard();
  });

  test('AF-028 returns baseline browser security headers for Agents @flow @security @functional @regression @non-functional', async ({ page }, testInfo) => {
    const data = caseData<{
      requiredHeaders: string[];
      frameHeaders: string[];
      contentTypeOptions: string;
    }>('AF-028');
    const response = await page.goto(new URL('/agents', BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    expect(response, 'Agents document response').not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    expect(response!.url()).toMatch(/^https:/i);
    const headers = response!.headers();
    const missing = data.requiredHeaders.filter((name) =>
      !headers[name.toLowerCase()]);
    if (
      headers['x-content-type-options']?.toLowerCase()
      !== data.contentTypeOptions.toLowerCase()
    ) {
      missing.push(
        'x-content-type-options=' + data.contentTypeOptions,
      );
    }
    const hasFrameProtection = data.frameHeaders.some((name) => {
      const value = headers[name.toLowerCase()];
      return name.toLowerCase() === 'content-security-policy'
        ? value?.toLowerCase().includes('frame-ancestors')
        : Boolean(value);
    });
    if (!hasFrameProtection) missing.push(data.frameHeaders.join(' or '));
    await attachJsonEvidence(testInfo, { responseHeaders: headers, missing });
    test.fail(
      missing.length > 0,
      'Known product defect: baseline Agents security headers are missing.',
    );
    expect(missing, 'Missing Agents response headers').toEqual([]);
  });

  test('AF-029 blocks anonymous access to Agent controls @flow @security @functional @regression @non-functional', async ({ browser }) => {
    const data = caseData<{
      agentsPath: string;
      searchPlaceholder: string;
      createButton: string;
    }>('AF-029');
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const anonymousPage = await context.newPage();
      await anonymousPage.goto(new URL(data.agentsPath, BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
      });
      const searchCount = await anonymousPage.getByPlaceholder(
        data.searchPlaceholder,
        { exact: true },
      ).count();
      const createCount = await anonymousPage.getByRole('button', {
        name: data.createButton,
        exact: true,
      }).count();
      const exposed = searchCount > 0 || createCount > 0;
      test.fail(
        exposed,
        'Known product defect: anonymous users can see Agent controls.',
      );
      expect.soft(searchCount).toBe(0);
      expect.soft(createCount).toBe(0);
    } finally {
      await context.close();
    }
  });

  test('AF-030 cancels then confirms deletion of the exact synthetic Agent @flow @write @delete @functional @regression @e2e', async ({ page, agentsPage: agents }, testInfo) => {
    const data = caseData<{ cancelButton: string; deleteButton: string }>(
      'AF-030',
    );
    await agents.goto();
    await agents.searchAgents.fill(UPDATED_AGENT_NAME);
    let cleanupName = UPDATED_AGENT_NAME;
    const updatedExists = await agents.agentCard(UPDATED_AGENT_NAME)
      .isVisible({ timeout: 5_000 }).catch(() => false);
    if (!updatedExists) {
      await agents.searchAgents.fill(AGENT_NAME);
      cleanupName = AGENT_NAME;
      const originalExists = await agents.agentCard(AGENT_NAME)
        .isVisible({ timeout: 10_000 }).catch(() => false);
      if (!originalExists) {
        throw new Error(
          'Neither run-owned Agent exists for cleanup: '
            + UPDATED_AGENT_NAME + ' or ' + AGENT_NAME,
        );
      }
    }
    await attachJsonEvidence(testInfo, {
      operation: 'delete',
      runAt: RUN.display,
      expectedAgentName: UPDATED_AGENT_NAME,
      cleanupAgentName: cleanupName,
    });
    const firstConfirmation = await agents.openDeleteConfirmation(
      cleanupName,
    );
    await firstConfirmation.getByRole('button', {
      name: data.cancelButton,
      exact: true,
    }).click();
    await expect(firstConfirmation).toBeHidden();
    await agents.searchForAgent(cleanupName);

    const secondConfirmation = await agents.openDeleteConfirmation(
      cleanupName,
    );
    await secondConfirmation.getByRole('button', {
      name: data.deleteButton,
      exact: true,
    }).click();
    await expect(secondConfirmation).toBeHidden({ timeout: 60_000 });
    await agents.clearSearch();
    await agents.searchAgents.fill(cleanupName);
    await expect(agents.agentCard(cleanupName)).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(
      cleanupName,
      'AF-022 did not persist the updated Agent name; original was cleaned.',
    ).toBe(UPDATED_AGENT_NAME);
  });
});

async function openValidDraft(
  agents: AgentsPage,
  overrides: Partial<{
    name: string;
    description: string;
    initialPrompt: string;
    model: string;
    country: string;
  }> = {},
): Promise<void> {
  await agents.openCreateWizard();
  await agents.fillInformation({
    name: overrides.name ?? DRAFT_NAME,
    description: overrides.description ?? CREATED_DESCRIPTION,
    initialPrompt: overrides.initialPrompt ?? INITIAL_PROMPT,
  });
  await agents.selectModel(overrides.model ?? MODEL);
  await agents.selectCountry(overrides.country ?? COUNTRY);
}

async function clearDefaultToolSelections(agents: AgentsPage): Promise<void> {
  await agents.openWizardTab('Tools');
  await waitForToolInventory(agents);
  const checked = agents.selectedResourceLabels('Tools');
  while (await checked.count() > 0) {
    await checked.first().click();
  }
  await expect(agents.selectedResourceLabels('Tools')).toHaveCount(0);
  await agents.openWizardTab('Instructions');
}

async function waitForToolInventory(agents: AgentsPage): Promise<void> {
  await expect.poll(
    () => agents.resourceCheckboxes('Tools').count(),
    {
      message: 'The recorded built-in Tools inventory did not finish loading.',
      timeout: 30_000,
    },
  ).toBeGreaterThan(0);
}

function sortNames(names: string[]): string[] {
  const collator = new Intl.Collator(undefined, {
    sensitivity: 'base',
    numeric: true,
  });
  return [...names].sort((left, right) => collator.compare(left, right));
}

async function attemptWizardSubmit(
  agents: AgentsPage,
  buttonName: string,
): Promise<boolean> {
  await agents.wizardDialog.getByRole('button', {
    name: buttonName,
    exact: true,
  }).click();
  return agents.wizardDialog.waitFor({
    state: 'hidden',
    timeout: 3_000,
  }).then(() => true).catch(() => false);
}

async function isNativeInvalid(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    return !field.checkValidity();
  });
}

async function cleanupExactSyntheticAgent(
  agents: AgentsPage,
  name: string,
): Promise<void> {
  await agents.expectLoaded();
  await agents.searchForAgent(name);
  const confirmation = await agents.openDeleteConfirmation(name);
  await confirmation.getByRole('button', {
    name: 'Delete',
    exact: true,
  }).click();
  await expect(confirmation).toBeHidden({ timeout: 60_000 });
  await agents.clearSearch();
  await agents.searchAgents.fill(name);
  await expect(agents.agentCard(name)).toHaveCount(0);
}

async function setXssMarker(page: Page, value: number): Promise<void> {
  await page.evaluate((marker) => {
    (window as Window & { __qaAgentsXss?: number }).__qaAgentsXss = marker;
  }, value);
}

async function readXssMarker(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __qaAgentsXss?: number })
      .__qaAgentsXss || 0,
  );
}

function excelSetting(
  key: string,
  tokens: AgentExcelTokenValues,
): string {
  return resolveAgentsExcelTokens(
    requireAgentsExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireAgentsExcelCase(EXCEL_INPUT, caseId);
  return resolveAgentsExcelTokens(row.data, COMMON_TOKENS) as T;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timestampInZone(date: Date): {
  compact: string;
  display: string;
  iso: string;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  // The live Agent inputs strip slash characters on blur, so preserve the
  // configured zone in a stable form that round-trips through create/edit.
  const inputSafeTimeZone = TIME_ZONE.replaceAll('/', '-');
  const compact = parts.year + parts.month + parts.day + '-'
    + parts.hour + parts.minute + parts.second + '-' + milliseconds;
  const display = parts.year + '-' + parts.month + '-' + parts.day + ' '
    + parts.hour + ':' + parts.minute + ':' + parts.second + '.'
    + milliseconds + ' ' + inputSafeTimeZone;
  return { compact, display, iso: date.toISOString() };
}
