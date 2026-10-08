import {
  type Locator,
  type Page,
} from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import { GuardrailsPage } from '../../pages/guardrails.page';
import {
  loadGuardrailsExcelRuntime,
  requireGuardrailsExcelCase,
  requireGuardrailsExcelSetting,
  resolveGuardrailExcelTokens,
  type GuardrailExcelTokenValues,
} from '../../utils/guardrailsExcelData';
import {
  attachJsonEvidence,
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

const EXCEL_INPUT = loadGuardrailsExcelRuntime();
const TIME_ZONE = requireGuardrailsExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInZone(
  process.env.GUARDRAILS_RUN_ISO
    ? new Date(process.env.GUARDRAILS_RUN_ISO)
    : new Date(),
);
const RUN_TOKENS: GuardrailExcelTokenValues = {
  RUN_COMPACT: RUN.compact,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
};
const GUARDRAIL_NAME = excelSetting('Guardrail Name Pattern', RUN_TOKENS);
const UPDATED_GUARDRAIL_NAME = excelSetting(
  'Updated Guardrail Name Pattern',
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
const PII_CUSTOM_ENTITY = excelSetting('PII Custom Entity', RUN_TOKENS);
const PII_FALLBACK_MESSAGE = excelSetting(
  'PII Fallback Message',
  RUN_TOKENS,
);
const MODERATION_FALLBACK_MESSAGE = excelSetting(
  'Moderation Fallback Message',
  RUN_TOKENS,
);
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
  || requireGuardrailsExcelSetting(EXCEL_INPUT, 'Base URL');
const CONCATENATED_UPDATED_GUARDRAIL_NAME =
  GUARDRAIL_NAME + UPDATED_GUARDRAIL_NAME;
const COMMON_TOKENS: GuardrailExcelTokenValues = {
  ...RUN_TOKENS,
  GUARDRAIL_NAME,
  UPDATED_GUARDRAIL_NAME,
  DRAFT_NAME,
  CREATED_DESCRIPTION,
  UPDATED_DESCRIPTION,
  PII_CUSTOM_ENTITY,
  PII_FALLBACK_MESSAGE,
  MODERATION_FALLBACK_MESSAGE,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
  SYNTHETIC_SECRET_PREFIX,
};

test.describe('Sequential June Guardrails module flow', () => {
  test.describe.configure({ mode: 'default', timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'GR');
    const excelCase = requireGuardrailsExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        guardrailName: GUARDRAIL_NAME,
        updatedGuardrailName: UPDATED_GUARDRAIL_NAME,
      },
    });
  });

  test('GR-001 opens the Guardrails module @flow @smoke @functional @prod-smoke @sanity @regression @uat', async ({ page, guardrailsPage: guardrails }) => {
    await guardrails.goto();
  });

  test('GR-002 searches for a visible Guardrail and clears search @flow @regression @functional @sanity @uat', async ({ page, guardrailsPage: guardrails }) => {
    await guardrails.goto();
    const initialNames = await guardrails.visibleGuardrailNames();
    expect(initialNames.length).toBeGreaterThan(0);
    const target = initialNames[0];

    await guardrails.searchGuardrails.fill(target);
    await expect(guardrails.guardrailCard(target)).toBeVisible();
    await page.waitForTimeout(500);
    const filteredNames = await guardrails.guardrailNames();
    const unrelatedNames = filteredNames.filter(
      (name) => !name.toLowerCase().includes(target.toLowerCase()),
    );

    await guardrails.searchGuardrails.clear();
    await expect.poll(async () => {
      const restoredNames = await guardrails.guardrailNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
    test.fail(
      unrelatedNames.length > 0,
      'Known product defect: Guardrail search does not filter the list.',
    );
    expect(
      unrelatedNames,
      'Unrelated Guardrails remained after search',
    ).toEqual([]);
  });

  test('GR-003 switches layouts and refreshes Guardrails @flow @regression @functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      viewIndexes: Array<0 | 1>;
      refreshIndex: 2;
    }>('GR-003');
    await guardrails.goto();
    for (const viewIndex of data.viewIndexes) {
      await guardrails.selectView(viewIndex);
    }
    await guardrails.refreshGuardrails(data.refreshIndex);
  });

  test('GR-004 shows every recorded Guardrail field and type @flow @validation @functional @sanity @regression @uat', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      tabs: string[];
      inputTypes: string[];
      outputTypes: string[];
    }>('GR-004');
    await guardrails.goto();
    await guardrails.openCreateWizard();

    for (const input of [guardrails.nameInput, guardrails.descriptionInput]) {
      expect(await input.evaluate(
        (element: HTMLInputElement) => element.required,
      )).toBe(true);
    }
    for (const tab of data.tabs) {
      await expect(
        guardrails.wizardDialog.getByRole('tab', { name: tab, exact: true }),
      ).toBeVisible();
    }
    for (const type of data.inputTypes) {
      await expect(
        guardrails.inputTabPanel().getByText(type, { exact: true }),
      ).toBeVisible();
    }
    await guardrails.openWizardTab('Output');
    for (const type of data.outputTypes) {
      await expect(
        guardrails.outputTabPanel().getByText(type, { exact: true }),
      ).toBeVisible();
    }
    await guardrails.cancelWizard();
  });

  test('GR-005 validates every required Guardrail field @flow @negative @validation @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      invalidBasics: Array<{
        label: string;
        name: string;
        description: string;
      }>;
    }>('GR-005');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const acceptedInvalidBasics: string[] = [];

    for (const invalid of data.invalidBasics) {
      await test.step('Block Next when ' + invalid.label, async () => {
        await guardrails.openWizardTab('Input');
        await guardrails.fillBasics(invalid);
        await guardrails.clickNext();
        if (await isTabActive(guardrails.outputTab)) {
          acceptedInvalidBasics.push(invalid.label);
        }
      });
    }

    await guardrails.openWizardTab('Input');
    await fillValidDraft(guardrails);
    await guardrails.setInputGuard('Jailbreak', true);
    await guardrails.clickNext();
    await guardrails.expectActiveWizardTab('Output');
    await guardrails.cancelWizard();
    test.fail(
      acceptedInvalidBasics.length > 0,
      'Known product defect: missing required basics can advance to Output.',
    );
    expect(
      acceptedInvalidBasics,
      'Invalid required-field combinations were accepted',
    ).toEqual([]);
  });

  test('GR-006 rejects whitespace-only Guardrail basics @flow @negative @validation @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      whitespaceName: string;
      whitespaceDescription: string;
    }>('GR-006');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await guardrails.fillBasics({
      name: data.whitespaceName,
      description: data.whitespaceDescription,
    });
    await guardrails.clickNext();
    const acceptedWhitespace = await isTabActive(guardrails.outputTab);
    if (acceptedWhitespace) await guardrails.openWizardTab('Input');
    await guardrails.cancelWizard();
    test.fail(
      acceptedWhitespace,
      'Known product defect: whitespace-only basics can advance to Output.',
    );
    expect(
      acceptedWhitespace,
      'Whitespace-only Name and Description were accepted',
    ).toBe(false);
  });

  test('GR-007 cancels a Guardrail draft without persistence @flow @regression @functional', async ({ page, guardrailsPage: guardrails }) => {
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await fillValidDraft(guardrails);
    await guardrails.setInputGuard('Jailbreak', true);
    await guardrails.cancelWizard();
    await guardrails.searchGuardrails.fill(DRAFT_NAME);
    await expect(guardrails.guardrailCard(DRAFT_NAME)).toHaveCount(0);
  });

  test('GR-008 shows all eight PII identity choices @flow @positive @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      identityLabels: string[];
      identityCount: number;
      entityPlaceholder: string;
      fallbackPlaceholder: string;
    }>('GR-008');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const dialog = await guardrails.openPiiSettings();
    await expect(dialog.getByRole('checkbox')).toHaveCount(
      data.identityCount + 1,
    );
    for (const label of data.identityLabels) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(dialog.getByPlaceholder(data.entityPlaceholder)).toBeVisible();
    await expect(
      dialog.getByPlaceholder(data.fallbackPlaceholder),
    ).toBeVisible();
    await guardrails.closeSettings(dialog);
    await expect(
      guardrails.inputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'false');
    await guardrails.cancelWizard();
  });

  test('GR-009 selects and clears every PII identity @flow @positive @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{ identityCount: number }>('GR-009');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const dialog = await guardrails.openPiiSettings();
    const checkboxes = dialog.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(data.identityCount + 1);
    await checkboxes.first().click();
    await expect.poll(async () => checkboxes.evaluateAll(
      (items) => items.every(
        (item) => item.getAttribute('aria-checked') === 'true',
      ),
    )).toBe(true);
    await checkboxes.first().click();
    await expect.poll(async () => checkboxes.evaluateAll(
      (items) => items.every(
        (item) => item.getAttribute('aria-checked') === 'false',
      ),
    )).toBe(true);
    await guardrails.closeSettings(dialog);
    await guardrails.cancelWizard();
  });

  test('GR-010 validates and saves a custom PII entity @flow @validation @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      customEntity: string;
      fallbackMessage: string;
    }>('GR-010');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const dialog = await guardrails.openPiiSettings();
    const entityInput = dialog.getByPlaceholder(/Add entity name/);
    const addButton = dialog.getByRole('button', {
      name: 'Add',
      exact: true,
    });
    await addButton.click();
    await expect(dialog.getByText(data.customEntity, {
      exact: true,
    })).toHaveCount(0);
    await dialog.getByRole('checkbox').nth(1).click();
    await entityInput.fill(data.customEntity);
    await addButton.click();
    await expect(
      dialog.getByText(data.customEntity, { exact: true }),
    ).toBeVisible();
    await dialog.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.fallbackMessage);
    await guardrails.saveSettings(dialog);
    await expect(
      guardrails.inputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.cancelWizard();
  });

  test('GR-011 shows all thirteen moderation categories @flow @positive @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      moderationCodes: string[];
      categoryCount: number;
      fallbackPlaceholder: string;
    }>('GR-011');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const dialog = await guardrails.openModerationSettings();
    await expect(dialog.getByRole('checkbox')).toHaveCount(
      data.categoryCount + 1,
    );
    for (const code of data.moderationCodes) {
      await expect(dialog.getByText(code, { exact: true })).toBeVisible();
    }
    await expect(
      dialog.getByPlaceholder(data.fallbackPlaceholder),
    ).toBeVisible();
    await guardrails.closeSettings(dialog);
    await expect(
      guardrails.inputSwitch('Moderation'),
    ).toHaveAttribute('aria-checked', 'false');
    await guardrails.cancelWizard();
  });

  test('GR-012 selects and clears every moderation category @flow @positive @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      categoryCount: number;
      selectedCodes: string[];
      fallbackMessage: string;
    }>('GR-012');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const dialog = await guardrails.openModerationSettings();
    const checkboxes = dialog.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(data.categoryCount + 1);
    await checkboxes.first().click();
    await expect.poll(async () => checkboxes.evaluateAll(
      (items) => items.every(
        (item) => item.getAttribute('aria-checked') === 'true',
      ),
    )).toBe(true);
    await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect.poll(async () => checkboxes.evaluateAll(
      (items) => items.every(
        (item) => item.getAttribute('aria-checked') === 'false',
      ),
    )).toBe(true);
    for (const code of data.selectedCodes) {
      await checkboxByPrefix(dialog, code).click();
    }
    await dialog.getByPlaceholder(/Required message when Moderation/)
      .fill(data.fallbackMessage);
    await guardrails.saveSettings(dialog);
    await expect(
      guardrails.inputSwitch('Moderation'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.cancelWizard();
  });

  test('GR-013 toggles the Jailbreak input Guardrail @flow @positive @functional @regression', async ({ page, guardrailsPage: guardrails }) => {
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await guardrails.setInputGuard('Jailbreak', true);
    await expect(
      guardrails.inputSwitch('Jailbreak'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.setInputGuard('Jailbreak', false);
    await expect(
      guardrails.inputSwitch('Jailbreak'),
    ).toHaveAttribute('aria-checked', 'false');
    await guardrails.cancelWizard();
  });

  test('GR-014 configures and toggles both output Guardrail types @flow @positive @functional @regression @integration', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      allowedUrl: string;
      urlFallback: string;
      selectedIdentity: string;
      customEntity: string;
      piiFallback: string;
    }>('GR-014');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    const urlDialog = await guardrails.openOutputSettings('URL Filter');
    const urlInput = urlDialog.getByPlaceholder(
      'Allowed URLs, domains, or IP addresses',
    );
    await urlDialog.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await expect(
      urlDialog.getByText(data.allowedUrl, { exact: true }),
    ).toHaveCount(0);
    await urlInput.fill(data.allowedUrl);
    await urlDialog.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await expect(
      urlDialog.getByText(data.allowedUrl, { exact: true }),
    ).toBeVisible();
    await urlDialog.getByPlaceholder(
      'Required message when URL Filter is triggered',
    ).fill(data.urlFallback);
    await guardrails.saveSettings(urlDialog);

    const outputPii = await guardrails.openOutputSettings('Contains PII');
    await checkboxByPrefix(outputPii, data.selectedIdentity).click();
    await outputPii.getByPlaceholder(/Add entity name/)
      .fill(data.customEntity);
    await outputPii.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await outputPii.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.piiFallback);
    await guardrails.saveSettings(outputPii);
    await guardrails.openWizardTab('Output');
    await expect(
      guardrails.outputSwitch('URL Filter'),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      guardrails.outputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.setOutputGuard('URL Filter', false);
    await guardrails.setOutputGuard('Contains PII', false);
    await guardrails.cancelWizard();
  });

  test('GR-015 preserves Guardrail values across tabs and Back @flow @regression @functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      allowedUrl: string;
      urlFallback: string;
    }>('GR-015');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await fillValidDraft(guardrails);
    await guardrails.setInputGuard('Jailbreak', true);
    await guardrails.clickNext();
    await guardrails.expectActiveWizardTab('Output');
    const urlDialog = await guardrails.openOutputSettings('URL Filter');
    await urlDialog.getByPlaceholder(
      'Allowed URLs, domains, or IP addresses',
    ).fill(data.allowedUrl);
    await urlDialog.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await urlDialog.getByPlaceholder(
      'Required message when URL Filter is triggered',
    ).fill(data.urlFallback);
    await guardrails.saveSettings(urlDialog);
    await guardrails.clickNext();
    await guardrails.expectActiveWizardTab('Access');
    await guardrails.clickBack();
    await guardrails.expectActiveWizardTab('Output');
    await expect(
      guardrails.outputSwitch('URL Filter'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.clickBack();
    await guardrails.expectActiveWizardTab('Input');
    await expect(guardrails.nameInput).toHaveValue(DRAFT_NAME);
    await expect(guardrails.descriptionInput).toHaveValue(
      CREATED_DESCRIPTION,
    );
    await expect(
      guardrails.inputSwitch('Jailbreak'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.cancelWizard();
  });

  test('GR-016 validates Access controls and Owner @flow @validation @functional @sanity @regression @uat', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      employeeSearch: string;
      selectedUsersText: string;
      ownerText: string;
    }>('GR-016');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await fillValidDraft(guardrails);
    await guardrails.setInputGuard('Jailbreak', true);
    await guardrails.openWizardTab('Access');
    await guardrails.employeeSearchInput.fill(data.employeeSearch);
    await guardrails.employeeSearchInput.clear();
    await expect(
      guardrails.wizardDialog.getByText(
        data.selectedUsersText,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guardrails.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await guardrails.cancelWizard();
  });

  test('GR-017 creates a date-time-stamped Guardrail @flow @write @create @functional @regression @e2e @integration', async ({ page, guardrailsPage: guardrails }, testInfo) => {
    const data = caseData<{
      selectedIdentity: string;
      customEntity: string;
      fallbackMessage: string;
      allowedUrl: string;
      urlFallback: string;
      outputSelectedIdentity: string;
      outputCustomEntity: string;
      outputFallback: string;
      selectedUsersText: string;
      ownerText: string;
    }>('GR-017');
    await attachJsonEvidence(testInfo, {
      operation: 'create',
      runAt: RUN.display,
      guardrailName: GUARDRAIL_NAME,
      customEntity: data.customEntity,
    });
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await guardrails.fillBasics({
      name: GUARDRAIL_NAME,
      description: CREATED_DESCRIPTION,
    });
    const dialog = await guardrails.openPiiSettings();
    await checkboxByPrefix(dialog, data.selectedIdentity).click();
    const entityInput = dialog.getByPlaceholder(/Add entity name/);
    await entityInput.fill(data.customEntity);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.fallbackMessage);
    await guardrails.saveSettings(dialog);

    const urlDialog = await guardrails.openOutputSettings('URL Filter');
    await urlDialog.getByPlaceholder(
      'Allowed URLs, domains, or IP addresses',
    ).fill(data.allowedUrl);
    await urlDialog.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await urlDialog.getByPlaceholder(
      'Required message when URL Filter is triggered',
    ).fill(data.urlFallback);
    await guardrails.saveSettings(urlDialog);

    const outputPii = await guardrails.openOutputSettings('Contains PII');
    await checkboxByPrefix(
      outputPii,
      data.outputSelectedIdentity,
    ).click();
    await outputPii.getByPlaceholder(/Add entity name/)
      .fill(data.outputCustomEntity);
    await outputPii.getByRole('button', {
      name: 'Add',
      exact: true,
    }).click();
    await outputPii.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.outputFallback);
    await guardrails.saveSettings(outputPii);
    await guardrails.openWizardTab('Access');
    await expect(
      guardrails.wizardDialog.getByText(
        data.selectedUsersText,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guardrails.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await guardrails.submitCreate();
    await guardrails.searchForGuardrail(GUARDRAIL_NAME);
  });

  test('GR-018 verifies persisted Guardrail creation values @flow @regression @functional @e2e @integration', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      selectedUsersText: string;
      ownerText: string;
    }>('GR-018');
    await guardrails.goto();
    await guardrails.searchForGuardrail(GUARDRAIL_NAME);
    await guardrails.openEditGuardrail(GUARDRAIL_NAME);
    await expect(guardrails.nameInput).toHaveValue(GUARDRAIL_NAME);
    await expect(guardrails.descriptionInput).toHaveValue(
      CREATED_DESCRIPTION,
    );
    await expect(
      guardrails.inputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.openWizardTab('Output');
    await expect(
      guardrails.outputSwitch('URL Filter'),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      guardrails.outputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.openWizardTab('Access');
    await expect(
      guardrails.wizardDialog.getByText(
        data.selectedUsersText,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guardrails.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await guardrails.cancelWizard();
  });

  test('GR-019 finds the created Guardrail by exact name @flow @regression @functional @e2e', async ({ page, guardrailsPage: guardrails }) => {
    await guardrails.goto();
    await guardrails.searchForGuardrail(GUARDRAIL_NAME);
    expect(await guardrails.guardrailNames()).toEqual([GUARDRAIL_NAME]);
    await guardrails.searchGuardrails.clear();
  });

  test('GR-020 validates required Guardrail fields while editing @flow @negative @validation @functional @regression @e2e', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      invalidEdits: Array<{
        label: string;
        name: string;
        description: string;
      }>;
      updateButton: string;
    }>('GR-020');
    await guardrails.goto();
    await guardrails.searchForGuardrail(GUARDRAIL_NAME);
    await guardrails.openEditGuardrail(GUARDRAIL_NAME);
    for (const invalid of data.invalidEdits) {
      await test.step('Block Update when ' + invalid.label, async () => {
        await guardrails.openWizardTab('Input');
        await guardrails.fillBasics(invalid);
        await guardrails.wizardDialog.getByRole('button', {
          name: data.updateButton,
          exact: true,
        }).click();
        await expect(guardrails.wizardDialog).toBeVisible();
        await guardrails.expectActiveWizardTab('Input');
      });
    }
    await guardrails.fillBasics({
      name: GUARDRAIL_NAME,
      description: CREATED_DESCRIPTION,
    });
    await guardrails.cancelWizard();
  });

  test('GR-021 renames and updates the created Guardrail @flow @write @update @functional @regression @e2e @integration', async ({ page, guardrailsPage: guardrails }, testInfo) => {
    const data = caseData<{
      selectedModerationCodes: string[];
      moderationFallback: string;
    }>('GR-021');
    await attachJsonEvidence(testInfo, {
      operation: 'update',
      runAt: RUN.display,
      previousName: GUARDRAIL_NAME,
      updatedGuardrailName: UPDATED_GUARDRAIL_NAME,
    });
    await guardrails.goto();
    await guardrails.searchForGuardrail(GUARDRAIL_NAME);
    await guardrails.openEditGuardrail(GUARDRAIL_NAME);
    await guardrails.fillBasics({
      name: UPDATED_GUARDRAIL_NAME,
      description: UPDATED_DESCRIPTION,
    });
    const moderation = await guardrails.openModerationSettings();
    for (const code of data.selectedModerationCodes) {
      await checkboxByPrefix(moderation, code).click();
    }
    await moderation.getByPlaceholder(/Required message when Moderation/)
      .fill(data.moderationFallback);
    await guardrails.saveSettings(moderation);
    await guardrails.setInputGuard('Jailbreak', true);
    await expect(
      guardrails.inputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.setOutputGuard('URL Filter', false);
    await guardrails.setOutputGuard('Contains PII', true);
    await guardrails.openWizardTab('Access');
    await expect(
      guardrails.wizardDialog.getByText('Owner', { exact: true }),
    ).toBeVisible();
    await guardrails.submitUpdate();
    const persistedName = await resolveUpdatedGuardrailName(guardrails);
    await attachJsonEvidence(testInfo, {
      operation: 'update-result',
      requestedName: UPDATED_GUARDRAIL_NAME,
      persistedName,
    });
    const renameWasConcatenated = persistedName
      === CONCATENATED_UPDATED_GUARDRAIL_NAME;
    test.fail(
      renameWasConcatenated,
      'Known product defect: update concatenates the old and new names.',
    );
    expect(
      persistedName,
      'Persisted Guardrail name after Update',
    ).toBe(UPDATED_GUARDRAIL_NAME);
  });

  test('GR-022 verifies every persisted Guardrail update @flow @regression @functional @e2e @integration', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      selectedUsersText: string;
      ownerText: string;
    }>('GR-022');
    await guardrails.goto();
    const persistedName = await resolveUpdatedGuardrailName(guardrails);
    await guardrails.searchForGuardrail(persistedName);
    await guardrails.openEditGuardrail(persistedName);
    await expect(guardrails.nameInput).toHaveValue(persistedName);
    await expect(guardrails.descriptionInput).toHaveValue(
      UPDATED_DESCRIPTION,
    );
    for (const type of ['Contains PII', 'Moderation', 'Jailbreak'] as const) {
      await expect(
        guardrails.inputSwitch(type),
      ).toHaveAttribute('aria-checked', 'true');
    }
    await guardrails.openWizardTab('Output');
    await expect(
      guardrails.outputSwitch('URL Filter'),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(
      guardrails.outputSwitch('Contains PII'),
    ).toHaveAttribute('aria-checked', 'true');
    await guardrails.openWizardTab('Access');
    await expect(
      guardrails.wizardDialog.getByText(
        data.selectedUsersText,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guardrails.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await guardrails.cancelWizard();
  });

  test('GR-023 restricts Guardrail actions to Edit and Delete @flow @regression @functional @e2e', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{ expectedMenuItems: string[] }>('GR-023');
    await guardrails.goto();
    const persistedName = await resolveUpdatedGuardrailName(guardrails);
    await guardrails.searchForGuardrail(persistedName);
    const menu = await guardrails.openActions(persistedName);
    const items = (await menu.getByRole('menuitem').allTextContents())
      .map((item) => item.trim())
      .filter(Boolean);
    expect(items).toEqual(data.expectedMenuItems);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('GR-024 escapes XSS payloads in Guardrail fields @flow @security @functional @regression @non-functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{ xssPayload: string }>('GR-024');
    await guardrails.goto();
    await setXssMarker(page, 0);
    await guardrails.openCreateWizard();
    await guardrails.fillBasics({
      name: data.xssPayload,
      description: data.xssPayload,
    });
    const dialog = await guardrails.openPiiSettings();
    const entityInput = dialog.getByPlaceholder(/Add entity name/);
    await entityInput.fill(data.xssPayload);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.xssPayload);
    expect(await readXssMarker(page)).toBe(0);
    await guardrails.closeSettings(dialog);
    await guardrails.cancelWizard();
    expect(await readXssMarker(page)).toBe(0);
    await guardrails.searchGuardrails.fill(data.xssPayload);
    await expect(guardrails.guardrailCard(data.xssPayload)).toHaveCount(0);
  });

  test('GR-025 handles injection-shaped Guardrail searches safely @flow @security @functional @regression @non-functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{ searchPayloads: string[] }>('GR-025');
    await guardrails.goto();
    const initialNames = await guardrails.visibleGuardrailNames();
    await setXssMarker(page, 0);
    for (const payload of data.searchPayloads) {
      await test.step('Search literally for ' + payload, async () => {
        await guardrails.searchGuardrails.fill(payload);
        await expect.poll(async () => {
          const names = await guardrails.guardrailNames();
          return names.every(
            (name) => name.toLowerCase().includes(payload.toLowerCase()),
          );
        }).toBe(true);
        expect((await guardrails.guardrailNames()).length)
          .toBeLessThanOrEqual(initialNames.length);
        expect(await readXssMarker(page)).toBe(0);
      });
    }
    await guardrails.searchGuardrails.clear();
    await expect.poll(async () => {
      const restoredNames = await guardrails.guardrailNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
  });

  test('GR-026 keeps synthetic secrets out of URLs and closed DOM @flow @security @functional @regression @non-functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{ secretValue: string }>('GR-026');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await guardrails.fillBasics({
      name: DRAFT_NAME,
      description: data.secretValue,
    });
    const dialog = await guardrails.openPiiSettings();
    await dialog.getByPlaceholder(/Add entity name/).fill(data.secretValue);
    await dialog.getByPlaceholder(/Required message when Contains PII/)
      .fill(data.secretValue);
    expect(page.url()).not.toContain(encodeURIComponent(data.secretValue));
    expect(page.url()).not.toContain(data.secretValue);
    await guardrails.closeSettings(dialog);
    await guardrails.cancelWizard();
    expect(page.url()).not.toContain(data.secretValue);
    await expect(page.locator('body')).not.toContainText(data.secretValue);
    await guardrails.searchGuardrails.fill(DRAFT_NAME);
    await expect(guardrails.guardrailCard(DRAFT_NAME)).toHaveCount(0);
  });

  test('GR-027 prevents access-search injection from selecting users @flow @security @functional @regression @non-functional', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      accessSearchPayload: string;
      selectedUsersText: string;
      ownerText: string;
    }>('GR-027');
    await guardrails.goto();
    await guardrails.openCreateWizard();
    await fillValidDraft(guardrails);
    await guardrails.setInputGuard('Jailbreak', true);
    await guardrails.openWizardTab('Access');
    await guardrails.employeeSearchInput.fill(data.accessSearchPayload);
    await expect(
      guardrails.wizardDialog.getByText(
        data.selectedUsersText,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guardrails.wizardDialog.getByText(data.ownerText, { exact: true }),
    ).toBeVisible();
    await guardrails.cancelWizard();
  });

  test('GR-028 returns baseline browser security headers @flow @security @functional @regression @non-functional', async ({ page }, testInfo) => {
    const data = caseData<{
      requiredHeaders: string[];
      contentTypeOptions: string;
    }>('GR-028');
    const response = await page.goto('/guardrails', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response).not.toBeNull();
    if (!response) return;
    const headers = response.headers();
    await attachJsonEvidence(testInfo, {
      operation: 'security-headers',
      hsts: headers['strict-transport-security'] || '(missing)',
      csp: headers['content-security-policy'] || '(missing)',
      xFrameOptions: headers['x-frame-options'] || '(missing)',
    });
    expect(response.url()).toMatch(/^https:\/\//);
    const violations: string[] = [];
    for (const requiredHeader of data.requiredHeaders) {
      if (!headers[requiredHeader]) {
        violations.push('Missing ' + requiredHeader);
      }
    }
    if (headers['x-content-type-options']?.toLowerCase()
      !== data.contentTypeOptions.toLowerCase()) {
      violations.push('Invalid x-content-type-options');
    }
    const csp = headers['content-security-policy'] || '';
    const frameProtection = csp.toLowerCase().includes('frame-ancestors')
      || Boolean(headers['x-frame-options']);
    if (!frameProtection) violations.push('Missing frame protection');
    test.fail(
      violations.length > 0,
      'Known product defect: baseline security headers are incomplete.',
    );
    expect(
      violations,
      'Guardrails document security-header violations',
    ).toEqual([]);
  });

  test('GR-029 blocks anonymous access to Guardrail controls @flow @security @functional @regression @non-functional', async ({ browser }) => {
    const data = caseData<{
      guardrailsPath: string;
      searchPlaceholder: string;
      createButton: string;
    }>('GR-029');
    const anonymousContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const anonymousPage = await anonymousContext.newPage();
      const guardrailsUrl = new URL(
        data.guardrailsPath,
        BASE_URL,
      ).toString();
      await anonymousPage.goto(guardrailsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      const search = anonymousPage.getByPlaceholder(data.searchPlaceholder);
      const create = anonymousPage.getByRole('button', {
        name: data.createButton,
      });
      await Promise.all([
        search.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {}),
        create.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {}),
      ]);
      const exposedControls = {
        search: await search.isVisible().catch(() => false),
        create: await create.isVisible().catch(() => false),
      };
      test.fail(
        exposedControls.search || exposedControls.create,
        'Known product defect: anonymous users can see Guardrail controls.',
      );
      expect(
        exposedControls,
        'Anonymous Guardrail controls still exposed',
      ).toEqual({ search: false, create: false });
    } finally {
      await anonymousContext.close();
    }
  });

  test('GR-030 cancels deletion and preserves the Guardrail @flow @negative @regression @functional @e2e', async ({ page, guardrailsPage: guardrails }) => {
    const data = caseData<{
      cancelButton: string;
      deleteButton: string;
    }>('GR-030');
    await guardrails.goto();
    const persistedName = await resolveUpdatedGuardrailName(guardrails);
    await guardrails.searchForGuardrail(persistedName);
    const confirmation = await guardrails.openDeleteConfirmation(
      persistedName,
    );
    await expect(confirmation).toContainText(persistedName);
    await expect(confirmation.getByRole('button', {
      name: data.deleteButton,
      exact: true,
    })).toBeVisible();
    await confirmation.getByRole('button', {
      name: data.cancelButton,
      exact: true,
    }).click();
    await expect(confirmation).toBeHidden();
    await guardrails.searchGuardrails.clear();
    await guardrails.searchForGuardrail(persistedName);
  });
});

async function fillValidDraft(guardrails: GuardrailsPage): Promise<void> {
  await guardrails.fillBasics({
    name: DRAFT_NAME,
    description: CREATED_DESCRIPTION,
  });
}

async function resolveUpdatedGuardrailName(
  guardrails: GuardrailsPage,
): Promise<string> {
  await guardrails.searchGuardrails.fill(UPDATED_GUARDRAIL_NAME);
  let resolvedName = '';
  await expect.poll(async () => {
    const names = await guardrails.guardrailNames();
    resolvedName = names.find(
      (name) => name === UPDATED_GUARDRAIL_NAME,
    ) || names.find(
      (name) => name === CONCATENATED_UPDATED_GUARDRAIL_NAME,
    ) || '';
    return resolvedName;
  }, {
    timeout: 30_000,
    message: 'Wait for the updated or concatenated Guardrail card',
  }).not.toBe('');
  return resolvedName;
}

function checkboxByPrefix(dialog: Locator, prefix: string): Locator {
  return dialog.getByRole('checkbox', {
    name: new RegExp(
      '^' + escapeRegExp(prefix) + '(?:\\s|$)',
      'i',
    ),
  });
}

function escapeRegExp(value: string): string {
  const special = '\\^$.*+?()[]{}|';
  return [...value]
    .map((character) => special.includes(character)
      ? '\\' + character
      : character)
    .join('');
}

async function isTabActive(tab: Locator): Promise<boolean> {
  return await tab.getAttribute('data-state') === 'active';
}

async function setXssMarker(page: Page, value: number): Promise<void> {
  await page.evaluate((marker) => {
    (window as Window & { __qaGuardrailsXss?: number })
      .__qaGuardrailsXss = marker;
  }, value);
}

async function readXssMarker(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __qaGuardrailsXss?: number })
      .__qaGuardrailsXss || 0,
  );
}

function excelSetting(
  key: string,
  tokens: GuardrailExcelTokenValues,
): string {
  return resolveGuardrailExcelTokens(
    requireGuardrailsExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireGuardrailsExcelCase(EXCEL_INPUT, caseId);
  return resolveGuardrailExcelTokens(row.data, COMMON_TOKENS) as T;
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
