import {
  type Page,
} from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import {
  ConnectorsPage,
  type ConnectorCountry,
  type ConnectorDateFilter,
} from '../../pages/connectors.page';
import {
  loadConnectorsExcelRuntime,
  requireConnectorsExcelCase,
  requireConnectorsExcelSetting,
  resolveConnectorExcelTokens,
  type ConnectorExcelTokenValues,
} from '../../utils/connectorsExcelData';
import {
  attachJsonEvidence,
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

const EXCEL_INPUT = loadConnectorsExcelRuntime();
const TIME_ZONE = requireConnectorsExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInZone(
  process.env.CONNECTORS_RUN_ISO
    ? new Date(process.env.CONNECTORS_RUN_ISO)
    : new Date(),
);
const RUN_TOKENS: ConnectorExcelTokenValues = {
  RUN_COMPACT: RUN.compact,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
};
const CONNECTOR_NAME = excelSetting('Connector Name Pattern', RUN_TOKENS);
const UPDATED_CONNECTOR_NAME = excelSetting(
  'Updated Connector Name Pattern',
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
const SERVER_URL = excelSetting('Server URL Pattern', RUN_TOKENS);
const UPDATED_SERVER_URL = excelSetting(
  'Updated Server URL Pattern',
  RUN_TOKENS,
);
const CONFIG_JSON = excelSetting('Config JSON', RUN_TOKENS);
const COUNTRY = excelSetting('Country', RUN_TOKENS) as ConnectorCountry;
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
  || requireConnectorsExcelSetting(EXCEL_INPUT, 'Base URL');
const COMMON_TOKENS: ConnectorExcelTokenValues = {
  ...RUN_TOKENS,
  CONNECTOR_NAME,
  UPDATED_CONNECTOR_NAME,
  DRAFT_NAME,
  CREATED_DESCRIPTION,
  UPDATED_DESCRIPTION,
  SERVER_URL,
  UPDATED_SERVER_URL,
  CONFIG_JSON,
  COUNTRY,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
  SYNTHETIC_SECRET_PREFIX,
};

test.describe('Sequential June Connectors module flow', () => {
  test.describe.configure({ mode: 'default', timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'CN');
    const excelCase = requireConnectorsExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        connectorName: CONNECTOR_NAME,
        updatedConnectorName: UPDATED_CONNECTOR_NAME,
      },
    });
  });

  test('CN-001 opens the Connectors module @flow @smoke @functional @prod-smoke @sanity @regression @uat', async ({ page, connectorsPage: connectors }) => {
    await connectors.goto();
  });

  test('CN-002 searches for a visible connector and clears search @flow @regression @functional @sanity @uat', async ({ page, connectorsPage: connectors }) => {
    await connectors.goto();
    const initialNames = await connectors.visibleConnectorNames();
    expect(initialNames.length).toBeGreaterThan(0);
    const target = initialNames[0];

    await connectors.searchConnectors.fill(target);
    await expect(connectors.connectorCard(target)).toBeVisible();
    await expect.poll(async () => {
      const names = await connectors.connectorNames();
      return names.length > 0
        && names.every((name) => name.toLowerCase().includes(target.toLowerCase()));
    }).toBe(true);

    await connectors.searchConnectors.clear();
    await expect.poll(async () => {
      const restoredNames = await connectors.connectorNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
  });

  test('CN-003 applies date filters, layouts and refresh @flow @regression @functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      dateFilters: ConnectorDateFilter[];
      viewIndexes: Array<0 | 1>;
      refreshIndex: 2;
    }>('CN-003');
    await connectors.goto();

    for (const viewIndex of data.viewIndexes) {
      await connectors.selectView(viewIndex);
    }
    await connectors.refreshConnectors(data.refreshIndex);
    for (const filter of data.dateFilters) {
      await test.step('Apply ' + filter, async () => {
        await connectors.selectDateFilter(filter);
        await expect(connectors.searchConnectors).toBeVisible();
      });
    }
  });

  test('CN-004 shows fields, countries and icon guidance @flow @validation @functional @sanity @regression @integration @uat', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      countries: ConnectorCountry[];
      iconAcceptIncludes: string;
      iconGuidance: string[];
    }>('CN-004');
    await connectors.goto();
    await connectors.openCreateWizard();

    for (const input of [
      connectors.connectorNameInput,
      connectors.serverUrlInput,
      connectors.configInput,
    ]) {
      expect(await input.evaluate((element: HTMLInputElement) => element.required))
        .toBe(true);
    }
    await expect(connectors.descriptionInput).toBeVisible();
    await expect(connectors.iconInput).toHaveAttribute(
      'accept',
      new RegExp(data.iconAcceptIncludes, 'i'),
    );
    for (const guidance of data.iconGuidance) {
      await expect(connectors.wizardDialog).toContainText(guidance);
    }

    await connectors.countrySelect.click();
    const countries = (await page.getByRole('option').allTextContents())
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    expect(countries).toEqual([...data.countries].sort());
    await page.keyboard.press('Escape');
    await connectors.cancelWizard();
  });

  test('CN-005 validates every required connector field @flow @negative @validation @functional @regression', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      invalidInformation: Array<{
        label: string;
        name: string;
        serverUrl: string;
        config: string;
      }>;
    }>('CN-005');
    await connectors.goto();
    await connectors.openCreateWizard();

    for (const invalid of data.invalidInformation) {
      await test.step('Block Next when ' + invalid.label, async () => {
        await connectors.fillInformation({
          ...invalid,
          country: COUNTRY,
          description: CREATED_DESCRIPTION,
        });
        await connectors.clickNext();
        await expect.soft(connectors.informationTab).toHaveAttribute(
          'data-state',
          'active',
          { timeout: 2_000 },
        );
        if (await isTabActive(connectors.accessTab)) {
          await connectors.openWizardTab('Information');
        }
      });
    }

    await fillValidInformation(connectors, DRAFT_NAME);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await connectors.cancelWizard();
  });

  test('CN-006 rejects malformed and unsafe server URLs @flow @negative @security @functional @regression @integration @non-functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ invalidServerUrls: string[] }>('CN-006');
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, DRAFT_NAME);
    const acceptedUnsafeUrls: string[] = [];

    for (const serverUrl of data.invalidServerUrls) {
      await test.step('Reject ' + serverUrl, async () => {
        await connectors.openWizardTab('Information');
        await connectors.serverUrlInput.fill(serverUrl);
        await connectors.clickNext();
        if (await isTabActive(connectors.accessTab)) {
          acceptedUnsafeUrls.push(serverUrl);
          await connectors.openWizardTab('Information');
        }
      });
    }
    await connectors.cancelWizard();
    test.fail(
      acceptedUnsafeUrls.length > 0,
      'Known product defect: unsafe connector server URLs can advance to Access.',
    );
    expect(
      acceptedUnsafeUrls,
      'Unsafe connector server URLs accepted by the Information step',
    ).toEqual([]);
  });

  test('CN-007 cancels a connector draft without persistence @flow @regression @functional', async ({ page, connectorsPage: connectors }) => {
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, DRAFT_NAME);
    await connectors.cancelWizard();
    await connectors.searchConnectors.fill(DRAFT_NAME);
    await expect(connectors.connectorCard(DRAFT_NAME)).toHaveCount(0);
  });

  test('CN-008 selects each supported connector country @flow @positive @functional @regression', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ countries: ConnectorCountry[] }>('CN-008');
    await connectors.goto();
    await connectors.openCreateWizard();
    for (const country of data.countries) {
      await connectors.selectCountry(country);
    }
    await connectors.selectCountry(COUNTRY);
    await connectors.cancelWizard();
  });

  test('CN-009 preserves values across Back and Next @flow @regression @functional', async ({ page, connectorsPage: connectors }) => {
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, DRAFT_NAME);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await connectors.clickBack();
    await connectors.expectActiveWizardTab('Information');
    await expect(connectors.connectorNameInput).toHaveValue(DRAFT_NAME);
    await expect(connectors.serverUrlInput).toHaveValue(SERVER_URL);
    expect(JSON.parse(await connectors.configInput.inputValue()))
      .toEqual(JSON.parse(CONFIG_JSON));
    await expect(connectors.countrySelect).toContainText(COUNTRY);
    await expect(connectors.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await connectors.cancelWizard();
  });

  test('CN-010 validates Access controls and cancels @flow @validation @functional @sanity @regression @uat', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      employeeSearch: string;
      selectedUsersText: string;
      ownerText: string;
    }>('CN-010');
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, DRAFT_NAME);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await expect(connectors.employeeSearchInput).toBeVisible();
    await connectors.employeeSearchInput.fill(data.employeeSearch);
    await connectors.employeeSearchInput.clear();
    await expect(page.getByText(data.selectedUsersText, { exact: true })).toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await connectors.cancelWizard();
  });

  test('CN-011 creates a date-time-stamped connector @flow @write @create @functional @regression @e2e @integration', async ({ page, connectorsPage: connectors }, testInfo) => {
    await attachJsonEvidence(testInfo, {
      operation: 'create',
      runAt: RUN.display,
      connectorName: CONNECTOR_NAME,
      serverUrl: SERVER_URL,
      country: COUNTRY,
    });
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, CONNECTOR_NAME);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await connectors.submitCreate();
    await connectors.searchForConnector(CONNECTOR_NAME);
  });

  test('CN-012 verifies every persisted value after creation @flow @regression @functional @e2e @integration', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      selectedUsersText: string;
      ownerText: string;
    }>('CN-012');
    await connectors.goto();
    await connectors.searchForConnector(CONNECTOR_NAME);
    await connectors.openEditConnector(CONNECTOR_NAME);
    await expect(connectors.connectorNameInput).toHaveValue(CONNECTOR_NAME);
    await expect(connectors.serverUrlInput).toHaveValue(SERVER_URL);
    expect(JSON.parse(await connectors.configInput.inputValue()))
      .toEqual(JSON.parse(CONFIG_JSON));
    await expect(connectors.countrySelect).toContainText(COUNTRY);
    await expect(connectors.descriptionInput).toHaveValue(CREATED_DESCRIPTION);
    await connectors.openWizardTab('Access');
    await expect(page.getByText(data.selectedUsersText, { exact: true })).toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await connectors.cancelWizard();
  });

  test('CN-013 finds the created connector by exact name @flow @regression @functional @e2e', async ({ page, connectorsPage: connectors }) => {
    await connectors.goto();
    await connectors.searchForConnector(CONNECTOR_NAME);
    const names = await connectors.connectorNames();
    expect(names).toEqual([CONNECTOR_NAME]);
    await connectors.searchConnectors.clear();
  });

  test('CN-014 validates required fields while editing @flow @negative @validation @functional @regression @e2e', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      invalidEdits: Array<{
        label: string;
        name: string;
        serverUrl: string;
        config: string;
      }>;
      updateButton: string;
    }>('CN-014');
    await connectors.goto();
    await connectors.searchForConnector(CONNECTOR_NAME);
    await connectors.openEditConnector(CONNECTOR_NAME);

    for (const invalid of data.invalidEdits) {
      await test.step('Block Update when ' + invalid.label, async () => {
        await connectors.fillInformation({
          ...invalid,
          country: COUNTRY,
          description: CREATED_DESCRIPTION,
        });
        await connectors.wizardDialog.getByRole('button', {
          name: data.updateButton,
          exact: true,
        }).click();
        await expect(connectors.wizardDialog).toBeVisible();
        await connectors.expectActiveWizardTab('Information');
      });
    }
    await fillValidInformation(connectors, CONNECTOR_NAME);
    await connectors.cancelWizard();
  });

  test('CN-015 renames and updates the created connector @flow @write @update @functional @regression @e2e @integration', async ({ page, connectorsPage: connectors }, testInfo) => {
    await attachJsonEvidence(testInfo, {
      operation: 'update',
      runAt: RUN.display,
      previousName: CONNECTOR_NAME,
      updatedConnectorName: UPDATED_CONNECTOR_NAME,
      updatedServerUrl: UPDATED_SERVER_URL,
    });
    await connectors.goto();
    await connectors.searchForConnector(CONNECTOR_NAME);
    await connectors.openEditConnector(CONNECTOR_NAME);
    await connectors.fillInformation({
      name: UPDATED_CONNECTOR_NAME,
      serverUrl: UPDATED_SERVER_URL,
      config: CONFIG_JSON,
      country: COUNTRY,
      description: UPDATED_DESCRIPTION,
    });
    await connectors.openWizardTab('Access');
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await connectors.openWizardTab('Information');
    await connectors.submitUpdate();
    await connectors.searchForConnector(UPDATED_CONNECTOR_NAME);
  });

  test('CN-016 verifies every persisted connector update @flow @regression @functional @e2e @integration', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      selectedUsersText: string;
      ownerText: string;
    }>('CN-016');
    await connectors.goto();
    await connectors.searchForConnector(UPDATED_CONNECTOR_NAME);
    await connectors.openEditConnector(UPDATED_CONNECTOR_NAME);
    await expect(connectors.connectorNameInput).toHaveValue(UPDATED_CONNECTOR_NAME);
    await expect(connectors.serverUrlInput).toHaveValue(UPDATED_SERVER_URL);
    expect(JSON.parse(await connectors.configInput.inputValue()))
      .toEqual(JSON.parse(CONFIG_JSON));
    await expect(connectors.countrySelect).toContainText(COUNTRY);
    await expect(connectors.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
    await connectors.openWizardTab('Access');
    await expect(page.getByText(data.selectedUsersText, { exact: true })).toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await connectors.cancelWizard();
  });

  test('CN-017 restricts connector actions to Edit and Delete @flow @regression @functional @e2e', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ expectedMenuItems: string[] }>('CN-017');
    await connectors.goto();
    await connectors.searchForConnector(UPDATED_CONNECTOR_NAME);
    const menu = await connectors.openActions(UPDATED_CONNECTOR_NAME);
    const items = (await menu.getByRole('menuitem').allTextContents())
      .map((item) => item.trim())
      .filter(Boolean);
    expect(items).toEqual(data.expectedMenuItems);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('CN-018 escapes XSS payloads in connector Information @flow @security @functional @regression @non-functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ xssPayload: string }>('CN-018');
    await connectors.goto();
    await setXssMarker(page, 0);
    await connectors.openCreateWizard();
    await connectors.fillInformation({
      name: data.xssPayload,
      serverUrl: SERVER_URL,
      config: JSON.stringify({ marker: data.xssPayload }),
      country: COUNTRY,
      description: data.xssPayload,
    });
    expect(await readXssMarker(page)).toBe(0);
    await connectors.cancelWizard();
    expect(await readXssMarker(page)).toBe(0);
    await connectors.searchConnectors.fill(data.xssPayload);
    await expect(connectors.connectorCard(data.xssPayload)).toHaveCount(0);
  });

  test('CN-019 handles injection-shaped connector searches safely @flow @security @functional @regression @non-functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ searchPayloads: string[] }>('CN-019');
    await connectors.goto();
    const initialNames = await connectors.visibleConnectorNames();
    await setXssMarker(page, 0);

    for (const payload of data.searchPayloads) {
      await test.step('Search literally for ' + payload, async () => {
        await connectors.searchConnectors.fill(payload);
        await expect.poll(async () => {
          const names = await connectors.connectorNames();
          return names.every((name) =>
            name.toLowerCase().includes(payload.toLowerCase()));
        }).toBe(true);
        expect((await connectors.connectorNames()).length)
          .toBeLessThanOrEqual(initialNames.length);
        expect(await readXssMarker(page)).toBe(0);
      });
    }
    await connectors.searchConnectors.clear();
    await expect.poll(async () => {
      const restoredNames = await connectors.connectorNames();
      return initialNames.every((name) => restoredNames.includes(name));
    }).toBe(true);
  });

  test('CN-020 keeps synthetic secrets out of URLs and closed DOM @flow @security @functional @regression @non-functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{ secretValue: string }>('CN-020');
    await connectors.goto();
    await connectors.openCreateWizard();
    await connectors.fillInformation({
      name: DRAFT_NAME,
      serverUrl: SERVER_URL,
      config: JSON.stringify({ syntheticSecret: data.secretValue }),
      country: COUNTRY,
      description: data.secretValue,
    });
    expect(page.url()).not.toContain(encodeURIComponent(data.secretValue));
    expect(page.url()).not.toContain(data.secretValue);
    await connectors.cancelWizard();
    expect(page.url()).not.toContain(data.secretValue);
    await expect(page.locator('body')).not.toContainText(data.secretValue);
    await connectors.searchConnectors.fill(DRAFT_NAME);
    await expect(connectors.connectorCard(DRAFT_NAME)).toHaveCount(0);
  });

  test('CN-021 prevents access-search injection from selecting users @flow @security @functional @regression @non-functional', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      accessSearchPayload: string;
      selectedUsersText: string;
      ownerText: string;
    }>('CN-021');
    await connectors.goto();
    await connectors.openCreateWizard();
    await fillValidInformation(connectors, DRAFT_NAME);
    await connectors.clickNext();
    await connectors.expectActiveWizardTab('Access');
    await connectors.employeeSearchInput.fill(data.accessSearchPayload);
    await expect(page.getByText(data.selectedUsersText, { exact: true })).toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await connectors.cancelWizard();
  });

  test('CN-022 returns baseline browser security headers @flow @security @functional @regression @non-functional', async ({ page }, testInfo) => {
    const data = caseData<{
      requiredHeaders: string[];
      contentTypeOptions: string;
    }>('CN-022');
    const response = await page.goto('/connectors', {
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
      if (!headers[requiredHeader]) violations.push('Missing ' + requiredHeader);
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
    expect(violations, 'Connector document security-header violations')
      .toEqual([]);
  });

  test('CN-023 blocks anonymous access to Connector controls @flow @security @functional @regression @non-functional', async ({ browser }) => {
    const data = caseData<{
      connectorsPath: string;
      searchPlaceholder: string;
      createButton: string;
    }>('CN-023');
    const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const anonymousPage = await anonymousContext.newPage();
      const connectorsUrl = new URL(data.connectorsPath, BASE_URL).toString();
      await anonymousPage.goto(connectorsUrl, {
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
        'Known product defect: anonymous users can see Connector controls.',
      );
      expect(exposedControls, 'Anonymous Connector controls still exposed')
        .toEqual({ search: false, create: false });
    } finally {
      await anonymousContext.close();
    }
  });

  test('CN-024 cancels deletion and preserves the connector @flow @negative @regression @functional @e2e', async ({ page, connectorsPage: connectors }) => {
    const data = caseData<{
      cancelButton: string;
      deleteButton: string;
    }>('CN-024');
    await connectors.goto();
    await connectors.searchForConnector(UPDATED_CONNECTOR_NAME);
    const confirmation = await connectors.openDeleteConfirmation(
      UPDATED_CONNECTOR_NAME,
    );
    await expect(confirmation.getByRole('button', {
      name: data.deleteButton,
      exact: true,
    })).toBeVisible();
    await confirmation.getByRole('button', {
      name: data.cancelButton,
      exact: true,
    }).click();
    await expect(confirmation).toBeHidden();
    await connectors.searchConnectors.clear();
    await connectors.searchForConnector(UPDATED_CONNECTOR_NAME);
  });
});

async function fillValidInformation(
  connectors: ConnectorsPage,
  name: string,
): Promise<void> {
  await connectors.fillInformation({
    name,
    serverUrl: SERVER_URL,
    config: CONFIG_JSON,
    country: COUNTRY,
    description: CREATED_DESCRIPTION,
  });
}

async function isTabActive(
  tab: import('@playwright/test').Locator,
): Promise<boolean> {
  return await tab.getAttribute('data-state') === 'active';
}

async function setXssMarker(page: Page, value: number): Promise<void> {
  await page.evaluate((marker) => {
    (window as Window & { __qaConnectorsXss?: number }).__qaConnectorsXss = marker;
  }, value);
}

async function readXssMarker(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __qaConnectorsXss?: number })
      .__qaConnectorsXss || 0,
  );
}

function excelSetting(
  key: string,
  tokens: ConnectorExcelTokenValues,
): string {
  return resolveConnectorExcelTokens(
    requireConnectorsExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireConnectorsExcelCase(EXCEL_INPUT, caseId);
  return resolveConnectorExcelTokens(row.data, COMMON_TOKENS) as T;
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
