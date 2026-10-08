import {
  type Locator,
  type Page,
} from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import {
  UI_COMPONENT_TYPES,
  UiComponentsPage,
  type UiComponentType,
} from '../../pages/ui-components.page';
import {
  loadUiComponentsExcelRuntime,
  requireUiComponentsExcelCase,
  requireUiComponentsExcelSetting,
  resolveUiComponentsExcelTokens,
  type UiComponentExcelTokenValues,
} from '../../utils/uiComponentsExcelData';
import {
  attachJsonEvidence,
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

const EXCEL_INPUT = loadUiComponentsExcelRuntime();
const TIME_ZONE = requireUiComponentsExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInZone(
  process.env.UI_COMPONENTS_RUN_ISO
    ? new Date(process.env.UI_COMPONENTS_RUN_ISO)
    : new Date(),
);
const RUN_TOKENS: UiComponentExcelTokenValues = {
  RUN_COMPACT: RUN.compact,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
};
const UI_COMPONENT_NAME = excelSetting(
  'UI Component Name Pattern',
  RUN_TOKENS,
);
const UPDATED_UI_COMPONENT_NAME = excelSetting(
  'Updated UI Component Name Pattern',
  RUN_TOKENS,
);
const DRAFT_NAME = excelSetting('Draft Name Pattern', RUN_TOKENS);
const CREATED_DESCRIPTION = excelSetting(
  'Created Description Pattern',
  RUN_TOKENS,
);
const UPDATED_DESCRIPTION = excelSetting(
  'Updated Description Pattern',
  RUN_TOKENS,
);
const DESIGN_PROMPT = excelSetting(
  'Design Prompt Pattern',
  RUN_TOKENS,
);
const UPDATED_DESIGN_PROMPT = excelSetting(
  'Updated Design Prompt Pattern',
  RUN_TOKENS,
);
const COMPONENT_TYPE = excelSetting(
  'Component Type',
  RUN_TOKENS,
) as UiComponentType;
const UPDATED_COMPONENT_TYPE = excelSetting(
  'Updated Component Type',
  RUN_TOKENS,
) as UiComponentType;
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
  || requireUiComponentsExcelSetting(EXCEL_INPUT, 'Base URL');
const COMMON_TOKENS: UiComponentExcelTokenValues = {
  ...RUN_TOKENS,
  UI_COMPONENT_NAME,
  UPDATED_UI_COMPONENT_NAME,
  DRAFT_NAME,
  CREATED_DESCRIPTION,
  UPDATED_DESCRIPTION,
  DESIGN_PROMPT,
  UPDATED_DESIGN_PROMPT,
  COMPONENT_TYPE,
  UPDATED_COMPONENT_TYPE,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
  SYNTHETIC_SECRET_PREFIX,
};

test.describe('Sequential June UI Components module flow', () => {
  test.describe.configure({ mode: 'default', timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'UC');
    const excelCase = requireUiComponentsExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        uiComponentName: UI_COMPONENT_NAME,
        updatedUiComponentName: UPDATED_UI_COMPONENT_NAME,
      },
    });
  });

  test('UC-001 opens the UI Components module @flow @smoke @functional @prod-smoke @sanity @regression @uat', async ({ page, uiComponentsPage: ui }) => {
    await ui.goto();
  });

  test('UC-002 searches for a visible UI Component and clears the search @flow @regression @functional @sanity @uat', async ({ page, uiComponentsPage: ui }) => {
    await ui.goto();
    const initialNames = await ui.visibleComponentNames();
    expect(initialNames.length).toBeGreaterThan(0);
    const target = initialNames[0];
    await ui.searchForComponent(target);
    const filteredNames = await ui.componentNames();
    expect(
      filteredNames.every((name) =>
        name.toLowerCase().includes(target.toLowerCase())),
    ).toBe(true);
    await ui.clearSearch();
    await expect.poll(async () => {
      const restoredNames = await ui.componentNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
  });

  test('UC-003 switches layouts and refreshes UI Components @flow @regression @functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      viewIndexes: Array<0 | 1>;
      refreshIndex: number;
    }>('UC-003');
    await ui.goto();
    for (const viewIndex of data.viewIndexes) {
      await ui.selectView(viewIndex);
    }
    expect(data.refreshIndex).toBe(2);
    await ui.refreshComponents();
  });

  test('UC-004 shows every recorded UI Component field and wizard section @flow @validation @functional @sanity @regression @uat', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      tabs: string[];
      requiredFields: string[];
      actions: string[];
    }>('UC-004');
    await ui.goto();
    await ui.openCreateWizard();
    for (const field of data.requiredFields) {
      await expect(ui.wizardDialog).toContainText(field);
    }
    for (const tab of data.tabs) {
      await expect(
        ui.wizardDialog.getByRole('tab', { name: tab, exact: true }),
      ).toBeVisible();
    }
    for (const action of data.actions) {
      await expect(
        ui.wizardDialog.getByRole('button', { name: action, exact: true }),
      ).toBeVisible();
    }
    await ui.cancelWizard();
  });

  test('UC-005 shows all eight recorded component types @flow @positive @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ componentTypes: UiComponentType[] }>('UC-005');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.typeSelect.click();
    const options = (await page.getByRole('option').allTextContents())
      .map((value) => value.trim())
      .filter(Boolean);
    expect(options).toEqual(data.componentTypes);
    expect(options).toEqual([...UI_COMPONENT_TYPES]);
    await page.keyboard.press('Escape');
    await ui.cancelWizard();
  });

  test('UC-006 rejects a missing UI Component name @flow @negative @validation @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      name: string;
      description: string;
      componentType: UiComponentType;
    }>('UC-006');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: data.name,
      description: data.description,
    });
    await ui.selectType(data.componentType);
    await ui.chooseNext();
    const accepted = await isTabActive(ui.designsTab);
    if (accepted) await ui.openWizardTab('Information');
    await ui.cancelWizard();
    test.fail(
      accepted,
      'Known product defect: missing UI Component Name can advance to Designs.',
    );
    expect(accepted, 'Missing Name was accepted').toBe(false);
  });

  test('UC-007 rejects a missing UI Component description @flow @negative @validation @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      name: string;
      description: string;
      componentType: UiComponentType;
    }>('UC-007');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: data.name,
      description: data.description,
    });
    await ui.selectType(data.componentType);
    await ui.chooseNext();
    const accepted = await isTabActive(ui.designsTab);
    if (accepted) await ui.openWizardTab('Information');
    await ui.cancelWizard();
    test.fail(
      accepted,
      'Known product defect: missing UI Component Description can advance to Designs.',
    );
    expect(accepted, 'Missing Description was accepted').toBe(false);
  });

  test('UC-008 rejects a missing UI Component type @flow @negative @validation @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      name: string;
      description: string;
      componentType: string;
    }>('UC-008');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: data.name,
      description: data.description,
    });
    await ui.chooseNext();
    const accepted = await isTabActive(ui.designsTab);
    if (accepted) await ui.openWizardTab('Information');
    await ui.cancelWizard();
    test.fail(
      accepted,
      'Known product defect: missing Component Type can advance to Designs.',
    );
    expect(accepted, 'Missing Component Type was accepted').toBe(false);
  });

  test('UC-009 rejects whitespace-only UI Component basics @flow @negative @validation @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      whitespaceName: string;
      whitespaceDescription: string;
      componentType: UiComponentType;
    }>('UC-009');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: data.whitespaceName,
      description: data.whitespaceDescription,
    });
    await ui.selectType(data.componentType);
    await ui.chooseNext();
    const accepted = await isTabActive(ui.designsTab);
    if (accepted) await ui.openWizardTab('Information');
    await ui.cancelWizard();
    test.fail(
      accepted,
      'Known product defect: whitespace-only UI Component basics can advance.',
    );
    expect(accepted, 'Whitespace-only basics were accepted').toBe(false);
  });

  test('UC-010 cancels a UI Component draft without persistence @flow @regression @functional', async ({ page, uiComponentsPage: ui }) => {
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.cancelWizard();
    await ui.searchUiComponents.fill(DRAFT_NAME);
    await expect(ui.componentCard(DRAFT_NAME)).toHaveCount(0);
    await ui.clearSearch();
  });

  test('UC-011 preserves values across Next, Back and tabs @flow @regression @functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ prompt: string }>('UC-011');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.instructionsInput.fill(data.prompt);
    await ui.chooseNext();
    await ui.expectActiveTab('Visibility');
    await ui.chooseBack();
    await ui.expectActiveTab('Designs');
    await expect(ui.instructionsInput).toHaveValue(data.prompt);
    await ui.chooseBack();
    await ui.expectActiveTab('Information');
    await expect(ui.nameInput).toHaveValue(DRAFT_NAME);
    const preservedDescription = await ui.descriptionInput.inputValue()
      === CREATED_DESCRIPTION;
    test.fail(
      !preservedDescription,
      'Known product defect: wizard navigation strips slash characters from descriptions.',
    );
    expect.soft(ui.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await expect(ui.typeSelect).toContainText(COMPONENT_TYPE);
    await ui.cancelWizard();
  });

  test('UC-012 validates recorded JSON and React editor controls @flow @validation @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      prompt: string;
      formatButton: string;
      runButton: string;
      jsonPlaceholder: string;
      reactPlaceholder: string;
    }>('UC-012');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.instructionsInput.fill(data.prompt);
    await expect(ui.jsonEditor).toHaveAttribute(
      'placeholder',
      data.jsonPlaceholder,
    );
    await expect(ui.reactEditor).toHaveAttribute(
      'placeholder',
      data.reactPlaceholder,
    );
    await expect(ui.jsonEditor).toHaveJSProperty('readOnly', true);
    await expect(ui.reactEditor).toHaveJSProperty('readOnly', true);
    await expect(
      ui.wizardDialog.getByRole('button', {
        name: data.formatButton,
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      ui.wizardDialog.getByRole('button', {
        name: data.runButton,
        exact: true,
      }),
    ).toBeEnabled();
    await expect(ui.designPanel).toContainText(
      'Click Run in the React panel to render a live preview here.',
    );
    await ui.cancelWizard();
  });

  test('UC-013 generates JSON and React code and runs the live preview @flow @positive @functional @regression @integration', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ prompt: string }>('UC-013');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.generateDesign(data.prompt);
    const schema = JSON.parse(await ui.jsonEditor.inputValue()) as {
      component_name?: string;
      component_type?: string;
      data?: unknown;
    };
    expect(schema.component_name).toBeTruthy();
    expect(schema.component_type).toBe(COMPONENT_TYPE.toLowerCase());
    expect(schema.data).toBeDefined();
    expect(await ui.reactEditor.inputValue()).toMatch(
      /export\s+default\s+function/,
    );
    await ui.runPreview(schema.component_name || DRAFT_NAME);
    await ui.cancelWizard();
  });

  test('UC-014 validates Visibility controls and Owner access @flow @validation @functional @sanity @regression @uat', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      employeeSearch: string;
      selectedUsersText: string;
      ownerText: string;
    }>('UC-014');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.openWizardTab('Visibility');
    await ui.visibilitySearchInput.fill(data.employeeSearch);
    await ui.visibilitySearchInput.clear();
    await expect(
      ui.wizardDialog.getByText(data.selectedUsersText, { exact: true }),
    ).toBeVisible();
    await expect(
      ui.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await ui.cancelWizard();
  });

  test('UC-015 keeps unmatched Visibility searches unselected @flow @negative @authorization @functional @regression', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      accessSearch: string;
      selectedUsersText: string;
      ownerText: string;
    }>('UC-015');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.openWizardTab('Visibility');
    await ui.visibilitySearchInput.fill(data.accessSearch);
    await expect(
      ui.wizardDialog.getByText(data.selectedUsersText, { exact: true }),
    ).toBeVisible();
    await expect(
      ui.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await ui.cancelWizard();
  });

  test('UC-016 gives layout and card action controls accessible names @flow @negative @a11y @functional @sanity @regression @uat @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      layoutControlCount: number;
      requireAccessibleNames: boolean;
    }>('UC-016');
    await ui.goto();
    await ui.visibleComponentNames();
    await expect(ui.viewToggles).toHaveCount(data.layoutControlCount);
    const unnamedLayouts = await unnamedControls(ui.viewToggles);
    const actionTriggers = ui.componentCards.locator(
      '[data-slot=dropdown-menu-trigger]',
    );
    const unnamedActions = await unnamedControls(actionTriggers);
    const unnamed = [...unnamedLayouts, ...unnamedActions];
    test.fail(
      data.requireAccessibleNames && unnamed.length > 0,
      'Known product defect: icon-only UI Component controls have no accessible names.',
    );
    expect(unnamed, 'Unnamed UI Component controls').toEqual([]);
  });

  test('UC-017 creates a date-time-stamped generated UI Component @flow @write @create @functional @regression @e2e @integration', async ({ page, uiComponentsPage: ui }, testInfo) => {
    const data = caseData<{
      componentType: UiComponentType;
      prompt: string;
    }>('UC-017');
    await attachJsonEvidence(testInfo, {
      operation: 'create',
      runAt: RUN.display,
      uiComponentName: UI_COMPONENT_NAME,
      componentType: data.componentType,
    });
    await ui.goto();
    await fillValidDraft(
      ui,
      UI_COMPONENT_NAME,
      CREATED_DESCRIPTION,
      data.componentType,
    );
    await ui.chooseNext();
    await ui.generateDesign(data.prompt);
    const schema = JSON.parse(await ui.jsonEditor.inputValue()) as {
      component_name?: string;
      component_type?: string;
    };
    expect(schema.component_name).toBeTruthy();
    expect(schema.component_type).toBe(data.componentType.toLowerCase());
    await ui.runPreview(schema.component_name || UI_COMPONENT_NAME);
    await ui.submitCreate();
    await ui.searchForComponent(UI_COMPONENT_NAME);
  });

  test('UC-018 verifies every persisted UI Component creation value @flow @regression @functional @e2e @integration', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ componentType: UiComponentType }>('UC-018');
    await ui.goto();
    await ui.searchForComponent(UI_COMPONENT_NAME);
    await ui.openEditComponent(UI_COMPONENT_NAME);
    await expect(ui.nameInput).toHaveValue(UI_COMPONENT_NAME);
    const persistedDescription = await ui.descriptionInput.inputValue()
      === CREATED_DESCRIPTION;
    test.fail(
      !persistedDescription,
      'Known product defect: persisted descriptions can lose slash characters.',
    );
    expect.soft(ui.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await expect(ui.typeSelect).toContainText(data.componentType);
    await ui.chooseNext();
    await expect.poll(
      async () => (await ui.jsonEditor.inputValue()).trim(),
    ).not.toBe('');
    await expect.poll(
      async () => (await ui.reactEditor.inputValue()).trim(),
    ).not.toBe('');
    expect(JSON.parse(await ui.jsonEditor.inputValue())).toMatchObject({
      component_type: data.componentType.toLowerCase(),
    });
    await ui.openWizardTab('Visibility');
    await expect(ui.wizardDialog).toContainText('Owner');
    await ui.cancelWizard();
  });

  test('UC-019 finds the created UI Component by exact unique name @flow @regression @functional @e2e', async ({ page, uiComponentsPage: ui }) => {
    await ui.goto();
    await ui.searchForComponent(UI_COMPONENT_NAME);
    expect(await ui.componentNames()).toEqual([UI_COMPONENT_NAME]);
    await ui.clearSearch();
  });

  test('UC-020 validates required fields while editing @flow @negative @validation @functional @regression @e2e', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      invalidEdits: Array<{
        label: string;
        name: string;
        description: string;
      }>;
    }>('UC-020');
    await ui.goto();
    await ui.searchForComponent(UI_COMPONENT_NAME);
    await ui.openEditComponent(UI_COMPONENT_NAME);
    const acceptedInvalidEdits: string[] = [];
    for (const invalid of data.invalidEdits) {
      await test.step('Block Next when ' + invalid.label, async () => {
        await ui.openWizardTab('Information');
        await ui.fillInformation({
          name: invalid.name,
          description: invalid.description,
        });
        await ui.chooseNext();
        if (await isTabActive(ui.designsTab)) {
          acceptedInvalidEdits.push(invalid.label);
          await ui.openWizardTab('Information');
        }
      });
    }
    await ui.fillInformation({
      name: UI_COMPONENT_NAME,
      description: CREATED_DESCRIPTION,
    });
    await ui.cancelWizard();
    test.fail(
      acceptedInvalidEdits.length > 0,
      'Known product defect: required UI Component fields can advance in edit mode.',
    );
    expect(acceptedInvalidEdits, 'Invalid edits were accepted').toEqual([]);
  });

  test('UC-021 renames, regenerates and updates the UI Component @flow @write @update @functional @regression @e2e @integration', async ({ page, uiComponentsPage: ui }, testInfo) => {
    const data = caseData<{
      updatedComponentType: UiComponentType;
      updatedPrompt: string;
    }>('UC-021');
    await attachJsonEvidence(testInfo, {
      operation: 'update',
      runAt: RUN.display,
      previousName: UI_COMPONENT_NAME,
      updatedUiComponentName: UPDATED_UI_COMPONENT_NAME,
      updatedComponentType: data.updatedComponentType,
    });
    await ui.goto();
    await ui.searchForComponent(UI_COMPONENT_NAME);
    await ui.openEditComponent(UI_COMPONENT_NAME);
    await ui.fillInformation({
      name: UPDATED_UI_COMPONENT_NAME,
      description: UPDATED_DESCRIPTION,
    });
    await ui.selectType(data.updatedComponentType);
    await ui.chooseNext();
    await ui.generateDesign(data.updatedPrompt);
    const schema = JSON.parse(await ui.jsonEditor.inputValue()) as {
      component_name?: string;
      component_type?: string;
    };
    expect(schema.component_name).toBeTruthy();
    const generatedTypeMatches = schema.component_type
      === data.updatedComponentType.toLowerCase();
    test.fail(
      !generatedTypeMatches,
      'Known product defect: regenerated UI Component schema can retain the previous component type.',
    );
    expect.soft(schema.component_type).toBe(
      data.updatedComponentType.toLowerCase(),
    );
    await ui.runPreview(
      schema.component_name || UPDATED_UI_COMPONENT_NAME,
    );
    await ui.submitUpdate();
    await ui.searchForComponent(UPDATED_UI_COMPONENT_NAME);
  });

  test('UC-022 verifies every persisted UI Component update @flow @regression @functional @e2e @integration', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ componentType: UiComponentType }>('UC-022');
    await ui.goto();
    await ui.searchForComponent(UPDATED_UI_COMPONENT_NAME);
    await ui.openEditComponent(UPDATED_UI_COMPONENT_NAME);
    await expect(ui.nameInput).toHaveValue(UPDATED_UI_COMPONENT_NAME);
    const persistedDescription = await ui.descriptionInput.inputValue()
      === UPDATED_DESCRIPTION;
    test.fail(
      !persistedDescription,
      'Known product defect: updated descriptions can lose slash characters.',
    );
    expect.soft(ui.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
    await expect(ui.typeSelect).toContainText(data.componentType);
    await ui.chooseNext();
    await expect.poll(
      async () => (await ui.jsonEditor.inputValue()).trim(),
    ).not.toBe('');
    await expect.poll(
      async () => (await ui.reactEditor.inputValue()).trim(),
    ).not.toBe('');
    const persistedSchema = JSON.parse(await ui.jsonEditor.inputValue()) as {
      component_type?: string;
    };
    expect.soft(persistedSchema).toMatchObject({
      component_type: data.componentType.toLowerCase(),
    });
    await ui.openWizardTab('Visibility');
    await expect(ui.wizardDialog).toContainText('Owner');
    await ui.cancelWizard();
  });

  test('UC-023 restricts component card actions to Edit and Delete @flow @regression @functional @e2e', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ expectedMenuItems: string[] }>('UC-023');
    await ui.goto();
    await ui.searchForComponent(UPDATED_UI_COMPONENT_NAME);
    const menu = await ui.openActions(UPDATED_UI_COMPONENT_NAME);
    const items = (await menu.getByRole('menuitem').allTextContents())
      .map((item) => item.trim())
      .filter(Boolean);
    expect(items).toEqual(data.expectedMenuItems);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('UC-024 escapes XSS payloads in UI Component fields @flow @security @functional @regression @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ xssPayload: string }>('UC-024');
    await ui.goto();
    await setXssMarker(page, 0);
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: data.xssPayload,
      description: data.xssPayload,
    });
    await ui.selectType(COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.instructionsInput.fill(data.xssPayload);
    expect(await readXssMarker(page)).toBe(0);
    await ui.cancelWizard();
    expect(await readXssMarker(page)).toBe(0);
    await ui.searchUiComponents.fill(data.xssPayload);
    await expect(ui.componentCards).toHaveCount(0);
  });

  test('UC-025 handles injection-shaped UI Component searches safely @flow @security @functional @regression @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ searchPayloads: string[] }>('UC-025');
    await ui.goto();
    const initialNames = await ui.visibleComponentNames();
    await setXssMarker(page, 0);
    for (const payload of data.searchPayloads) {
      await test.step('Search literally for ' + payload, async () => {
        await ui.searchUiComponents.fill(payload);
        await expect.poll(async () => {
          const names = await ui.componentNames();
          return names.length <= initialNames.length;
        }).toBe(true);
        expect(await readXssMarker(page)).toBe(0);
      });
    }
    await ui.clearSearch();
    await expect.poll(async () => {
      const restoredNames = await ui.componentNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
  });

  test('UC-026 keeps synthetic secrets out of URLs and closed DOM @flow @security @functional @regression @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{ secretValue: string }>('UC-026');
    await ui.goto();
    await ui.openCreateWizard();
    await ui.fillInformation({
      name: DRAFT_NAME,
      description: data.secretValue,
    });
    await ui.selectType(COMPONENT_TYPE);
    await ui.chooseNext();
    await ui.instructionsInput.fill(data.secretValue);
    expect(page.url()).not.toContain(data.secretValue);
    await ui.cancelWizard();
    expect(page.url()).not.toContain(data.secretValue);
    expect(await page.locator('body').innerText()).not.toContain(
      data.secretValue,
    );
    await ui.searchUiComponents.fill(data.secretValue);
    await expect(ui.componentCards).toHaveCount(0);
  });

  test('UC-027 prevents Visibility search injection from selecting users @flow @security @functional @regression @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      accessSearchPayload: string;
      selectedUsersText: string;
      ownerText: string;
    }>('UC-027');
    await ui.goto();
    await fillValidDraft(ui, DRAFT_NAME, CREATED_DESCRIPTION, COMPONENT_TYPE);
    await ui.openWizardTab('Visibility');
    await ui.visibilitySearchInput.fill(data.accessSearchPayload);
    await expect(
      ui.wizardDialog.getByText(data.selectedUsersText, { exact: true }),
    ).toBeVisible();
    await expect(
      ui.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await ui.cancelWizard();
  });

  test('UC-028 returns baseline browser security headers for UI Components @flow @security @functional @regression @non-functional', async ({ page, uiComponentsPage: ui }) => {
    const data = caseData<{
      requiredHeaders: string[];
      frameProtectionHeaders: string[];
      contentTypeOptions: string;
    }>('UC-028');
    const response = await page.goto(new URL('/ui-components', BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/ui-components(?:[?#]|$)/);
    const headers = response?.headers() || {};
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/^https:/);
    const missing = data.requiredHeaders.filter(
      (header) => !headers[header.toLowerCase()],
    );
    const missingFrameProtection = data.frameProtectionHeaders.filter(
      (header) => !headers[header.toLowerCase()],
    );
    test.fail(
      missing.length > 0 || missingFrameProtection.length > 0,
      'Known product defect: UI Components is missing baseline CSP/frame security headers.',
    );
    expect(missing, 'Missing required browser security headers').toEqual([]);
    expect(
      headers['x-content-type-options'] || '',
      'X-Content-Type-Options',
    ).toContain(data.contentTypeOptions);
    expect(
      missingFrameProtection,
      'Missing frame-protection headers',
    ).toEqual([]);
  });

  test('UC-029 blocks anonymous access to UI Component controls @flow @security @functional @regression @non-functional', async ({ browser }) => {
    const data = caseData<{
      uiComponentsPath: string;
      searchPlaceholder: string;
      createButton: string;
    }>('UC-029');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(data.uiComponentsPath, {
        waitUntil: 'domcontentloaded',
      });
      const searchCount = await page.getByPlaceholder(
        data.searchPlaceholder,
      ).count();
      const createCount = await page.getByRole('button', {
        name: data.createButton,
        exact: true,
      }).count();
      const anonymousControlsExposed = searchCount > 0 || createCount > 0;
      test.fail(
        anonymousControlsExposed,
        'Known product defect: anonymous users can see UI Component controls.',
      );
      expect.soft(searchCount).toBe(0);
      expect.soft(createCount).toBe(0);
    } finally {
      await context.close();
    }
  });

  test('UC-030 cancels then confirms deletion of the synthetic UI Component @flow @write @delete @functional @regression @e2e', async ({ page, uiComponentsPage: ui }, testInfo) => {
    const data = caseData<{
      cancelButton: string;
      deleteButton: string;
    }>('UC-030');
    await attachJsonEvidence(testInfo, {
      operation: 'delete',
      runAt: RUN.display,
      uiComponentName: UPDATED_UI_COMPONENT_NAME,
    });
    await ui.goto();
    await ui.searchForComponent(UPDATED_UI_COMPONENT_NAME);
    const firstConfirmation = await ui.openDeleteConfirmation(
      UPDATED_UI_COMPONENT_NAME,
    );
    await expect(firstConfirmation).toContainText(
      UPDATED_UI_COMPONENT_NAME,
    );
    await firstConfirmation.getByRole('button', {
      name: data.cancelButton,
      exact: true,
    }).click();
    await expect(firstConfirmation).toBeHidden();
    await ui.searchForComponent(UPDATED_UI_COMPONENT_NAME);

    const secondConfirmation = await ui.openDeleteConfirmation(
      UPDATED_UI_COMPONENT_NAME,
    );
    await secondConfirmation.getByRole('button', {
      name: data.deleteButton,
      exact: true,
    }).click();
    await expect(secondConfirmation).toBeHidden({ timeout: 60_000 });
    await ui.clearSearch();
    await ui.searchUiComponents.fill(UPDATED_UI_COMPONENT_NAME);
    await expect(ui.componentCard(UPDATED_UI_COMPONENT_NAME)).toHaveCount(0);
  });
});

async function fillValidDraft(
  ui: UiComponentsPage,
  name: string,
  description: string,
  componentType: UiComponentType,
): Promise<void> {
  await ui.openCreateWizard();
  await ui.fillInformation({ name, description });
  await ui.selectType(componentType);
}

async function unnamedControls(locator: Locator): Promise<string[]> {
  return (await locator.evaluateAll((elements) => elements.map((element) => {
    const aria = element.getAttribute('aria-label')?.trim();
    const title = element.getAttribute('title')?.trim();
    const text = element.textContent?.trim();
    return aria || title || text || '';
  }))).map((name, index) => name || 'control-' + String(index + 1))
    .filter((name) => /^control-\d+$/.test(name));
}

async function isTabActive(tab: Locator): Promise<boolean> {
  return await tab.getAttribute('data-state') === 'active';
}

async function setXssMarker(page: Page, value: number): Promise<void> {
  await page.evaluate((marker) => {
    (window as Window & { __qaUiComponentsXss?: number })
      .__qaUiComponentsXss = marker;
  }, value);
}

async function readXssMarker(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __qaUiComponentsXss?: number })
      .__qaUiComponentsXss || 0,
  );
}

function excelSetting(
  key: string,
  tokens: UiComponentExcelTokenValues,
): string {
  return resolveUiComponentsExcelTokens(
    requireUiComponentsExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireUiComponentsExcelCase(EXCEL_INPUT, caseId);
  return resolveUiComponentsExcelTokens(row.data, COMMON_TOKENS) as T;
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
  const compact = parts.year + parts.month + parts.day + '-'
    + parts.hour + parts.minute + parts.second + '-' + milliseconds;
  const display = parts.year + '-' + parts.month + '-' + parts.day + ' '
    + parts.hour + ':' + parts.minute + ':' + parts.second + '.'
    + milliseconds + ' ' + TIME_ZONE;
  return { compact, display, iso: date.toISOString() };
}
