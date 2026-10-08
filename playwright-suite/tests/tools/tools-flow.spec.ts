import { test, expect } from '../../fixtures/app.fixture';
import {
  type AccountPage,
  type BusinessSelection,
} from '../../pages/account.page';
import {
  ToolsPage,
  type HttpMethod,
  type PayloadType,
  type ToolDateFilter,
  type ToolScope,
} from '../../pages/tools.page';
import {
  loadToolsExcelRuntime,
  requireToolsExcelCase,
  requireToolsExcelSetting,
  resolveExcelTokens,
  type ExcelTokenValues,
} from '../../utils/toolsExcelData';
import {
  loadAccountExcelRuntime,
  requireAccountExcelSetting,
} from '../../utils/accountExcelData';
import {
  attachJsonEvidence,
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';
import {
  loadToolsAccessIdentities,
  ToolsAccessSession,
} from '../../utils/tools-access-session';

const EXCEL_INPUT = loadToolsExcelRuntime();
const ACCOUNT_INPUT = loadAccountExcelRuntime();
const TIME_ZONE = requireToolsExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInIndia(
  process.env.TOOLS_RUN_ISO ? new Date(process.env.TOOLS_RUN_ISO) : new Date(),
);
const RUN_TOKENS: ExcelTokenValues = {
  RUN_COMPACT: RUN.compact,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
};
const TOOL_NAME = excelSetting('Tool Name Pattern', RUN_TOKENS);
const DRAFT_NAME = excelSetting('Draft Name Pattern', RUN_TOKENS);
const CREATED_PURPOSE = excelSetting('Created Purpose Pattern', RUN_TOKENS);
const CREATED_KEYWORDS = excelSetting('Created Keywords', RUN_TOKENS);
const ENDPOINT = excelSetting('Endpoint', RUN_TOKENS);
const VALID_HEADER = excelSetting('Valid Header JSON', RUN_TOKENS);
const CREATED_PAYLOAD = excelSetting('Created Payload JSON', RUN_TOKENS);
const XSS_MARKER = excelSetting('XSS Marker', RUN_TOKENS);
const SQL_INJECTION_MARKER = excelSetting('SQL Injection Marker', RUN_TOKENS);
const DEFAULT_METHOD = excelSetting('Default Method', RUN_TOKENS) as HttpMethod;
const DEFAULT_PAYLOAD_FORMAT = excelSetting(
  'Default Payload Format',
  RUN_TOKENS,
) as PayloadType;
const UPDATE_PURPOSE_PATTERN = requireToolsExcelSetting(
  EXCEL_INPUT,
  'Update Purpose Pattern',
);
const UPDATE_KEYWORDS = excelSetting('Update Keywords', RUN_TOKENS);
const UPDATE_PAYLOAD_PATTERN = requireToolsExcelSetting(
  EXCEL_INPUT,
  'Update Payload JSON',
);
const BASE_URL = process.env.BASE_URL
  || requireToolsExcelSetting(EXCEL_INPUT, 'Base URL');
const MY_ACCOUNT = requireAccountExcelSetting(ACCOUNT_INPUT, 'My Account Label');
const SUBSCRIBED_BUSINESS = requireAccountExcelSetting(
  ACCOUNT_INPUT,
  'Subscribed Business',
);
const SUBSCRIBED_GSTIN = requireAccountExcelSetting(
  ACCOUNT_INPUT,
  'Subscribed GSTIN',
);
const COMMON_TOKENS: ExcelTokenValues = {
  ...RUN_TOKENS,
  UPDATE_DISPLAY: RUN.display,
  UPDATE_ISO: RUN.iso,
  TOOL_NAME,
  DRAFT_NAME,
  CREATED_PURPOSE,
  CREATED_KEYWORDS,
  ENDPOINT,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
};

type ToolAccountContextKey = 'myAccount' | 'subscribedBusiness';

interface ToolAccountContext {
  key: ToolAccountContextKey;
  displayName: string;
  activeLabel: string;
  selection?: BusinessSelection;
}

interface ToolContextState {
  toolName: string;
  createdPurpose: string;
  createdPayload: string;
  updatedAt?: ReturnType<typeof timestampInIndia>;
  updatedPurpose?: string;
  updatedPayload?: string;
}

interface ToolCrudMatrixCaseData {
  contexts: ToolAccountContextKey[];
  method: HttpMethod;
  payloadType: PayloadType;
  createButton: string;
  updateButton: string;
  deleteMenuItem: string;
  deleteDialogTitle: string;
  deleteButton: string;
  createPayload: string;
  updatePayload: string;
}

interface ToolLifecycleActionLabels {
  createButton: string;
  updateButton: string;
  deleteMenuItem: string;
  deleteDialogTitle: string;
  deleteButton: string;
}

interface ToolNoAuthenticationCaseData extends ToolLifecycleActionLabels {
  contexts: ToolAccountContextKey[];
  authenticationOption: string;
}

interface ToolCompanyAccessCaseData extends ToolLifecycleActionLabels {
  context: ToolAccountContextKey;
  companyAccessLabel: string;
  companyAccessStates: boolean[];
  companyMemberVisibleWhenEnabled: boolean;
  companyMemberHiddenWhenDisabled: boolean;
}

interface ToolEmployeeAccessCaseData extends ToolLifecycleActionLabels {
  context: ToolAccountContextKey;
  employeeDirectoryPath: string;
  employeeCandidateLimit: number;
  permissions: string[];
  expectedSelectedCount: number;
  assignedUserVisible: boolean;
  unassignedCompanyMemberHidden: boolean;
}

const SUBSCRIBED_ACCOUNT: BusinessSelection = {
  businessName: SUBSCRIBED_BUSINESS,
  activeAccountLabel: SUBSCRIBED_BUSINESS.replace(/\s+LIMITED$/i, ''),
  taxId: SUBSCRIBED_GSTIN,
};
const TOOL_CONTEXTS: Record<ToolAccountContextKey, ToolAccountContext> = {
  myAccount: {
    key: 'myAccount',
    displayName: MY_ACCOUNT,
    activeLabel: MY_ACCOUNT,
  },
  subscribedBusiness: {
    key: 'subscribedBusiness',
    displayName: SUBSCRIBED_BUSINESS,
    activeLabel: SUBSCRIBED_ACCOUNT.activeAccountLabel,
    selection: SUBSCRIBED_ACCOUNT,
  },
};
const TOOL_CONTEXT_STATE: Record<ToolAccountContextKey, ToolContextState> = {
  myAccount: createContextState(TOOL_CONTEXTS.myAccount, TOOL_NAME),
  subscribedBusiness: createContextState(
    TOOL_CONTEXTS.subscribedBusiness,
    `${TOOL_NAME} HCL`,
  ),
};

test.describe('Sequential June Tools module flow', () => {
  // Default mode keeps cases independent: a failed validation case does not skip
  // the later real create/edit/update cases. The npm scripts enforce one worker.
  test.describe.configure({ mode: 'default', timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'TL');
    const excelCase = requireToolsExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        toolName: TOOL_NAME,
      },
    });
  });

  test('TL-001 opens the Tools module @flow @smoke @functional @prod-smoke @sanity @regression @uat', async ({ page, toolsPage: tools }) => {
    await tools.goto();
  });

  test('TL-002 searches, filters and changes the Tools layout @flow @regression @functional @sanity @uat', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      scopes: ToolScope[];
      dateFilters: ToolDateFilter[];
      viewIndexes: Array<0 | 1>;
    }>('TL-002');
    await tools.goto();

    const initialNames = await tools.visibleToolNames();
    expect(initialNames.length).toBeGreaterThan(0);

    await test.step('Search using a tool visible in the active business', async () => {
      const targetName = initialNames[0];
      await tools.searchTools.fill(targetName);
      await expect(tools.toolCard(targetName)).toBeVisible();
      await expect.poll(async () => {
        const names = await tools.visibleToolNames();
        return names.length > 0
          && names.every((name) => name.toLowerCase().includes(targetName.toLowerCase()));
      }).toBe(true);

      await tools.searchTools.clear();
      await expect(tools.toolCards).toHaveCount(initialNames.length);
    });

    await test.step('Exercise every scope tab', async () => {
      for (const scope of data.scopes) await tools.selectScope(scope);
    });

    await test.step('Exercise every Created On filter', async () => {
      for (const filter of data.dateFilters) await tools.selectDateFilter(filter);
      await tools.goto();
    });

    await test.step('Switch between both view modes', async () => {
      for (const viewIndex of data.viewIndexes) await tools.selectView(viewIndex);
    });
  });

  test('TL-003 validates every required Information field @flow @validation @functional @sanity @regression @uat', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      invalidInformation: Array<{
        label: string;
        name: string;
        purpose: string;
        keywords: string;
      }>;
    }>('TL-003');
    await tools.goto();
    await tools.openCreateWizard();

    for (const invalid of data.invalidInformation) {
      await test.step(`Block Next when ${invalid.label}`, async () => {
        await tools.openWizardTab('Information');
        await tools.fillInformation(invalid.name, invalid.purpose, invalid.keywords);
        await tools.clickNext();
        await tools.expectActiveWizardTab('Information');
      });
    }

    await tools.fillInformation(DRAFT_NAME, CREATED_PURPOSE, CREATED_KEYWORDS);
    await tools.clickNext();
    await tools.expectActiveWizardTab('API Details');
    await tools.cancelWizard();
  });

  test('TL-004 enforces the 300-character keyword boundary @flow @validation @functional @regression', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      maximumLength: number;
      boundaryCharacter: string;
      overflowCharacter: string;
    }>('TL-004');
    await tools.goto();
    await tools.openCreateWizard();

    const maximumKeywords = data.boundaryCharacter.repeat(data.maximumLength);
    await tools.botKeywordsInput.fill(maximumKeywords);
    await expect(tools.botKeywordsInput).toHaveValue(maximumKeywords);
    await expect(page.getByText(
      String(data.maximumLength) + '/' + String(data.maximumLength),
      { exact: true },
    )).toBeVisible();

    await tools.botKeywordsInput.fill(
      data.overflowCharacter.repeat(data.maximumLength + 1),
    );
    await expect.poll(async () => (await tools.botKeywordsInput.inputValue()).length)
      .toBe(data.maximumLength);
    await expect(page.getByText(
      String(data.maximumLength) + '/' + String(data.maximumLength),
      { exact: true },
    )).toBeVisible();
    await tools.cancelWizard();
  });

  test('TL-005 rejects empty, whitespace and malformed endpoint URLs @flow @validation @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ invalidEndpoints: string[] }>('TL-005');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    for (const endpoint of data.invalidEndpoints) {
      await test.step(`Reject endpoint value "${endpoint || '(empty)'}"`, async () => {
        await tools.openWizardTab('API Details');
        await tools.fillEndpoint(endpoint);
        await tools.clickNext();
        await tools.expectActiveApiSection('Endpoint');
        await expect.soft(tools.apiDetailsTab).toHaveAttribute(
          'data-state',
          'active',
          { timeout: 2_000 },
        );
      });
    }

    await tools.cancelWizard();
  });

  test('TL-006 rejects malformed Header JSON @flow @validation @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ invalidHeaderJson: string }>('TL-006');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    await tools.fillHeaderJson(data.invalidHeaderJson);
    await tools.clickNext();
    await tools.expectActiveApiSection('Header');
    await expect(tools.apiDetailsTab).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 2_000 },
    );
  });

  test('TL-007 rejects malformed Payload JSON @flow @validation @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ invalidPayloadJson: string }>('TL-007');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    await tools.fillPayloadJson(data.invalidPayloadJson);
    await tools.clickNext();
    await tools.expectActiveApiSection('Body');
    await expect(tools.apiDetailsTab).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 2_000 },
    );
  });

  test('TL-008 rejects malformed Schema JSON and accepts generated schema @flow @validation @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ invalidSchemaJson: string }>('TL-008');
    await openApiStep(tools);
    const validSchema = await prepareValidApi(tools, CREATED_PAYLOAD);
    expect(JSON.parse(validSchema)).toBeTruthy();

    await tools.fillSchemaJson(data.invalidSchemaJson);
    await tools.clickNext();
    await tools.expectActiveApiSection('Body');
    await expect(tools.apiDetailsTab).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 2_000 },
    );
  });

  test('TL-009 exercises every HTTP method and payload format @flow @regression @functional @integration @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      methods: HttpMethod[];
      payloadFormats: PayloadType[];
      finalPayloadFormat: PayloadType;
    }>('TL-009');
    await openApiStep(tools);
    await tools.fillEndpoint(ENDPOINT);

    for (const method of data.methods) {
      await tools.selectMethod(method);
    }
    await tools.clickNext();
    await tools.expectActiveApiSection('Header');
    for (const format of data.payloadFormats) {
      await tools.selectPayloadType(format);
    }
    await tools.selectPayloadType(data.finalPayloadFormat);
    await tools.cancelWizard();
  });

  test('TL-010 validates Access controls and cancels without persistence @flow @validation @functional @sanity @regression @uat', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ employeeSearch: string }>('TL-010');
    await tools.goto();
    await tools.openCreateWizard();
    await tools.fillInformation(DRAFT_NAME, CREATED_PURPOSE, CREATED_KEYWORDS);
    await tools.openWizardTab('Access');

    await tools.employeeSearchInput.fill(data.employeeSearch);
    await expect(tools.employeeSearchInput).toHaveValue(data.employeeSearch);
    await tools.employeeSearchInput.clear();
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await expect(page.getByText('User Access', { exact: true })).toBeVisible();

    await tools.cancelWizard();
    await tools.searchTools.fill(DRAFT_NAME);
    await expect(tools.toolCard(DRAFT_NAME)).toHaveCount(0);
  });

  test('TL-011 creates date-time-stamped tools in My Account and subscribed HCL @flow @write @create @functional @regression @e2e @integration', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    const data = caseData<{
      contexts: ToolAccountContextKey[];
      createButton: string;
    }>('TL-011');

    await runInToolContexts(account, tools, data.contexts, async (_context, state) => {
      await tools.openCreateWizard();
      await tools.fillInformation(
        state.toolName,
        state.createdPurpose,
        CREATED_KEYWORDS,
      );
      await tools.clickNext();
      await tools.expectActiveWizardTab('API Details');
      await prepareValidApi(tools, state.createdPayload);
      await tools.clickNext();
      await tools.expectAccessControls();
      await tools.submitWizard(data.createButton);
      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await expect(tools.toolCard(state.toolName)).toBeVisible();
    });

    await attachJsonEvidence(testInfo, {
      operation: 'create',
      createdAt: RUN.display,
      contexts: data.contexts.map((key) => ({
        account: TOOL_CONTEXTS[key].displayName,
        toolName: TOOL_CONTEXT_STATE[key].toolName,
      })),
    });
  });

  test('TL-012 verifies persisted creation values in My Account and subscribed HCL @flow @regression @functional @e2e @integration', async ({ accountPage: account, toolsPage: tools }) => {
    const data = caseData<{ contexts: ToolAccountContextKey[] }>('TL-012');

    await runInToolContexts(account, tools, data.contexts, async (_context, state) => {
      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await tools.openEditTool(state.toolName);

      await expect(tools.toolNameInput).toHaveValue(state.toolName);
      await expect(tools.toolPurposeInput).toHaveValue(state.createdPurpose);
      await expect(tools.botKeywordsInput).toHaveValue(CREATED_KEYWORDS);

      await tools.openWizardTab('API Details');
      await tools.expectEndpoint(ENDPOINT);
      await tools.expectMethod(DEFAULT_METHOD);
      await tools.expectPayloadType(DEFAULT_PAYLOAD_FORMAT);
      expect(JSON.parse(await tools.headerJsonValue()))
        .toEqual(JSON.parse(VALID_HEADER));
      expect(JSON.parse(await tools.payloadJsonValue()))
        .toEqual(JSON.parse(state.createdPayload));
      expectGeneratedSchemaForPayload(
        await tools.schemaJsonValue(),
        state.createdPayload,
      );

      await tools.openWizardTab('Access');
      await tools.expectAccessControls();
      await tools.cancelWizard();
    });
  });

  test('TL-013 validates required edit fields in My Account and subscribed HCL @flow @validation @edit @functional @regression @e2e', async ({ accountPage: account, toolsPage: tools }) => {
    const data = caseData<{
      contexts: ToolAccountContextKey[];
      invalidEdits: Array<{
        label: string;
        name: string;
        purpose: string;
        keywords: string;
      }>;
    }>('TL-013');

    await runInToolContexts(account, tools, data.contexts, async (context, state) => {
      const contextData = caseDataForContext<typeof data>('TL-013', context, state);
      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await tools.openEditTool(state.toolName);

      for (const invalid of contextData.invalidEdits) {
        await test.step(`${context.displayName}: block ${invalid.label}`, async () => {
          await tools.openWizardTab('Information');
          await tools.fillInformation(
            invalid.name,
            invalid.purpose,
            invalid.keywords,
          );
          await tools.clickNext();
          await tools.expectActiveWizardTab('Information');
        });
      }

      await tools.fillInformation(
        state.toolName,
        state.createdPurpose,
        CREATED_KEYWORDS,
      );
      await tools.clickNext();
      await tools.expectActiveWizardTab('API Details');
      await tools.cancelWizard();
      await tools.searchForTool(state.toolName);
      await expect(tools.toolCard(state.toolName)).toBeVisible();
    });
  });

  test('TL-014 updates date-time-stamped tools in My Account and subscribed HCL @flow @write @update @functional @regression @e2e @integration', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    const data = caseData<{
      contexts: ToolAccountContextKey[];
      updateButton: string;
      method: HttpMethod;
      payloadFormat: PayloadType;
    }>('TL-014');

    await runInToolContexts(account, tools, data.contexts, async (context, state) => {
      state.updatedAt = timestampInIndia(new Date());
      const updateTokens = {
        ...COMMON_TOKENS,
        TOOL_NAME: state.toolName,
        UPDATE_DISPLAY: state.updatedAt.display,
        UPDATE_ISO: state.updatedAt.iso,
      };
      const baseUpdatedPurpose = resolveExcelTokens(
        UPDATE_PURPOSE_PATTERN,
        updateTokens,
      );
      state.updatedPurpose = contextPurpose(baseUpdatedPurpose, context);
      state.updatedPayload = contextJson(
        resolveExcelTokens(UPDATE_PAYLOAD_PATTERN, updateTokens),
        context,
      );

      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await tools.openEditTool(state.toolName);
      await tools.fillInformation(
        state.toolName,
        state.updatedPurpose,
        UPDATE_KEYWORDS,
      );
      await tools.clickNext();
      await tools.expectActiveWizardTab('API Details');
      await tools.fillApiDetails({
        method: data.method,
        payloadType: data.payloadFormat,
        endpoint: ENDPOINT,
        header: VALID_HEADER,
        payload: state.updatedPayload,
      });
      await tools.generateSchema();
      await tools.clickNext();
      await tools.expectAccessControls();
      await tools.submitWizard(data.updateButton);
      await tools.goto();
      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await expect(tools.toolCard(state.toolName)).toBeVisible();
    });

    await attachJsonEvidence(testInfo, {
      operation: 'update',
      contexts: data.contexts.map((key) => ({
        account: TOOL_CONTEXTS[key].displayName,
        toolName: TOOL_CONTEXT_STATE[key].toolName,
        updatedAt: TOOL_CONTEXT_STATE[key].updatedAt?.display,
      })),
    });
  });

  test('TL-015 verifies updated values in My Account and subscribed HCL @flow @regression @functional @e2e @integration', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    const data = caseData<{
      contexts: ToolAccountContextKey[];
      expectedMethod: HttpMethod;
      expectedPayloadFormat: PayloadType;
    }>('TL-015');

    await runInToolContexts(account, tools, data.contexts, async (context, state) => {
      const update = requireContextUpdateState(context, state);
      await tools.selectScope('All');
      await tools.searchForTool(state.toolName);
      await tools.openEditTool(state.toolName);

      await expect(tools.toolNameInput).toHaveValue(state.toolName);
      await expect(tools.toolPurposeInput).toHaveValue(update.purpose);
      await expect(tools.botKeywordsInput).toHaveValue(UPDATE_KEYWORDS);

      await tools.openWizardTab('API Details');
      await tools.expectEndpoint(ENDPOINT);
      await tools.expectMethod(data.expectedMethod);
      await tools.expectPayloadType(data.expectedPayloadFormat);
      expect(JSON.parse(await tools.headerJsonValue()))
        .toEqual(JSON.parse(VALID_HEADER));
      expect(JSON.parse(await tools.payloadJsonValue()))
        .toEqual(JSON.parse(update.payload));
      expectGeneratedSchemaForPayload(
        await tools.schemaJsonValue(),
        update.payload,
      );

      await tools.openWizardTab('Access');
      await tools.expectAccessControls();
      await tools.cancelWizard();
    });

    await attachJsonEvidence(testInfo, {
      operation: 'verify-update',
      contexts: data.contexts.map((key) => ({
        account: TOOL_CONTEXTS[key].displayName,
        toolName: TOOL_CONTEXT_STATE[key].toolName,
        updatedAt: TOOL_CONTEXT_STATE[key].updatedAt?.display,
      })),
    });
  });

  test('TL-016 accepts supported HTTPS endpoint formats @flow @positive @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ endpoints: string[] }>('TL-016');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    for (const endpoint of data.endpoints) {
      await tools.openWizardTab('API Details');
      await tools.fillEndpoint(endpoint);
      await tools.clickNext();
      await tools.expectActiveApiSection('Header');
    }
    await tools.cancelWizard();
  });

  test('TL-017 accepts nested valid JSON and generates schema @flow @positive @functional @regression @api', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ nestedPayload: Record<string, unknown> }>('TL-017');
    await openApiStep(tools);
    const nestedPayload = JSON.stringify(data.nestedPayload, null, 2);
    const schema = await prepareValidApi(tools, nestedPayload);
    expect(JSON.parse(schema)).toBeTruthy();
    await tools.clickNext();
    await tools.expectActiveWizardTab('Access');
    await tools.cancelWizard();
  });

  test('TL-018 preserves values across Back and Next navigation @flow @positive @functional @regression', async ({ page, toolsPage: tools }) => {
    await openApiStep(tools);
    const schema = await prepareValidApi(tools, CREATED_PAYLOAD);

    await tools.openWizardTab('Information');
    await tools.expectActiveWizardTab('Information');
    await expect(tools.toolNameInput).toHaveValue(DRAFT_NAME);
    await expect(tools.toolPurposeInput).toHaveValue(CREATED_PURPOSE);
    await expect(tools.botKeywordsInput).toHaveValue(CREATED_KEYWORDS);

    await tools.clickNext();
    await tools.expectActiveWizardTab('API Details');
    await tools.expectEndpoint(ENDPOINT);
    expect(JSON.parse(await tools.headerJsonValue()))
      .toEqual(JSON.parse(VALID_HEADER));
    expect(JSON.parse(await tools.payloadJsonValue()))
      .toEqual(JSON.parse(CREATED_PAYLOAD));
    expect(JSON.parse(await tools.schemaJsonValue()))
      .toEqual(JSON.parse(schema));
    await tools.clickNext();
    await tools.expectActiveWizardTab('Access');
    await tools.cancelWizard();
  });

  test('TL-019 rejects unsafe URL schemes and embedded credentials @flow @negative @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ unsafeEndpoints: string[] }>('TL-019');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    for (const endpoint of data.unsafeEndpoints) {
      await expectEndpointRejected(tools, endpoint);
    }
    await tools.cancelWizard();
  });

  test('TL-020 rejects loopback, private and link-local endpoints @flow @negative @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ internalEndpoints: string[] }>('TL-020');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    for (const endpoint of data.internalEndpoints) {
      await expectEndpointRejected(tools, endpoint);
    }
    await tools.cancelWizard();
  });

  test('TL-021 rejects CRLF injection in header values @flow @negative @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ header: Record<string, string> }>('TL-021');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);

    await tools.fillHeaderJson(JSON.stringify(data.header, null, 2));
    await tools.clickNext();
    await tools.expectActiveApiSection('Header');
    await expect(tools.apiDetailsTab).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 2_000 },
    );
  });

  test('TL-022 rejects prototype-pollution keys without mutating the browser @flow @negative @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ prototypePayload: string }>('TL-022');
    await openApiStep(tools);
    await prepareValidApi(tools, CREATED_PAYLOAD);
    expect(await hasPollutedPrototype(page)).toBe(false);
    await tools.fillPayloadJson(data.prototypePayload);
    await tools.clickNext();
    await tools.expectActiveApiSection('Body');
    await expect.soft(tools.apiDetailsTab).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 2_000 },
    );
    expect(await hasPollutedPrototype(page)).toBe(false);
  });

  test('TL-023 escapes XSS payloads in Information fields @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ securityNamePrefix: string }>('TL-023');
    await tools.goto();
    await tools.openCreateWizard();
    await setXssMarker(page, 0);
    const securityDraftName = data.securityNamePrefix
      + ' ' + RUN.compact + ' ' + XSS_MARKER;

    await tools.fillInformation(securityDraftName, XSS_MARKER, XSS_MARKER);
    const sanitizedName = await tools.toolNameInput.inputValue();
    expect(sanitizedName).toContain(data.securityNamePrefix + ' ' + RUN.compact);
    expect(sanitizedName).toContain('__qaToolsXss');
    expect(sanitizedName).not.toMatch(/[<>="']/);
    await expect(page.locator('[onerror*="__qaToolsXss"]')).toHaveCount(0);
    expect(await readXssMarker(page)).toBe(0);

    await tools.cancelWizard();
    await tools.searchTools.fill(data.securityNamePrefix + ' ' + RUN.compact);
    await expect(tools.toolCards).toHaveCount(0);
    expect(await readXssMarker(page)).toBe(0);
  });

  test('TL-024 handles SQL, NoSQL and XSS-like search input safely @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ searchPayloads: string[] }>('TL-024');
    await tools.goto();
    const initialCount = (await tools.visibleToolNames()).length;
    expect(initialCount).toBeGreaterThan(0);
    await setXssMarker(page, 0);

    for (const payload of data.searchPayloads) {
      await tools.searchTools.fill(payload);
      await expect(tools.toolCards).toHaveCount(0);
      expect(await readXssMarker(page)).toBe(0);
      await tools.searchTools.clear();
      await expect(tools.toolCards).toHaveCount(initialCount);
    }
  });

  test('TL-025 keeps sensitive draft values out of URLs and closed DOM @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      secretPrefix: string;
      purposePrefix: string;
      keywords: string;
      authorizationPrefix: string;
    }>('TL-025');
    const syntheticSecret = data.secretPrefix + RUN.compact;
    await tools.goto();
    await tools.openCreateWizard();
    await tools.fillInformation(
      DRAFT_NAME,
      data.purposePrefix + syntheticSecret,
      data.keywords,
    );
    await tools.openWizardTab('API Details');
    await tools.fillApiDetails({
      method: DEFAULT_METHOD,
      payloadType: DEFAULT_PAYLOAD_FORMAT,
      endpoint: ENDPOINT,
      header: JSON.stringify({
        Authorization: data.authorizationPrefix + syntheticSecret,
      }, null, 2),
      payload: JSON.stringify({ secret: syntheticSecret }, null, 2),
    });
    expect(decodeURIComponent(page.url())).not.toContain(syntheticSecret);

    await tools.cancelWizard();
    expect(decodeURIComponent(page.url())).not.toContain(syntheticSecret);
    const secretRemainsInDom = await page.evaluate(
      (secret) => document.documentElement.innerHTML.includes(secret),
      syntheticSecret,
    );
    expect(secretRemainsInDom).toBe(false);
  });

  test('TL-026 prevents access-search injection from selecting users @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ accessSearchPayload: string }>('TL-026');
    await tools.goto();
    await tools.openCreateWizard();
    await tools.fillInformation(DRAFT_NAME, CREATED_PURPOSE, CREATED_KEYWORDS);
    await tools.openWizardTab('Access');

    await tools.employeeSearchInput.fill(data.accessSearchPayload);
    await expect(page.getByText('Selected Users (0)', { exact: true })).toBeVisible();
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await tools.cancelWizard();
  });

  test('TL-027 restricts methods and payload formats to the allowlist @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{
      expectedMethods: string[];
      forbiddenMethods: string[];
      expectedPayloadFormats: string[];
    }>('TL-027');
    await openApiStep(tools);

    await tools.openApiSection('Endpoint');
    await tools.methodSelect.click();
    const methods = (await page.getByRole('option').allTextContents())
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    expect(methods).toEqual(data.expectedMethods);
    for (const forbiddenMethod of data.forbiddenMethods) {
      expect(methods).not.toContain(forbiddenMethod);
    }
    await page.keyboard.press('Escape');

    await tools.fillEndpoint(ENDPOINT);
    await tools.clickNext();
    await tools.expectActiveApiSection('Header');
    await tools.openApiSection('Header');
    await tools.payloadTypeSelect.click();
    const formats = (await page.getByRole('option').allTextContents())
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    expect(formats).toEqual(data.expectedPayloadFormats);
    await page.keyboard.press('Escape');
    await tools.cancelWizard();
  });

  test('TL-028 returns baseline browser security headers @flow @security @functional @regression @non-functional', async ({ page }, testInfo) => {
    const data = caseData<{
      requiredHeaders: string[];
      contentTypeOptions: string;
    }>('TL-028');
    const response = await page.goto('/tools', {
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
    for (const requiredHeader of data.requiredHeaders) {
      expect.soft(headers[requiredHeader]).toBeTruthy();
    }
    expect.soft(headers['x-content-type-options']?.toLowerCase())
      .toBe(data.contentTypeOptions.toLowerCase());
    const csp = headers['content-security-policy'] || '';
    const frameProtection = csp.toLowerCase().includes('frame-ancestors')
      || Boolean(headers['x-frame-options']);
    expect.soft(frameProtection).toBe(true);
  });

  test('TL-029 blocks anonymous access to Tools controls @flow @security @functional @regression @non-functional', async ({ browser }) => {
    const data = caseData<{
      toolsPath: string;
      searchPlaceholder: string;
      createButton: string;
    }>('TL-029');
    const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const anonymousPage = await anonymousContext.newPage();
      const toolsUrl = new URL(data.toolsPath, BASE_URL).toString();
      await anonymousPage.goto(toolsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await expect.soft(
        anonymousPage.getByPlaceholder(data.searchPlaceholder),
      ).toBeHidden({ timeout: 2_000 });
      await expect.soft(
        anonymousPage.getByRole('button', { name: data.createButton }),
      ).toBeHidden({ timeout: 2_000 });
    } finally {
      await anonymousContext.close();
    }
  });

  test('TL-030 cancels access-search changes without privilege persistence @flow @security @functional @regression @non-functional', async ({ page, toolsPage: tools }) => {
    const data = caseData<{ accessSearchPayload: string }>('TL-030');
    await tools.goto();
    await tools.selectScope('All');
    await tools.searchForTool(TOOL_NAME);
    await tools.openEditTool(TOOL_NAME);
    await tools.openWizardTab('Access');
    await expect(page.getByText('Selected Users (0)', { exact: true })).toBeVisible();
    await tools.employeeSearchInput.fill(data.accessSearchPayload);
    await expect(page.getByText('Selected Users (0)', { exact: true })).toBeVisible();
    await tools.cancelWizard();

    await tools.searchForTool(TOOL_NAME);
    await tools.openEditTool(TOOL_NAME);
    await tools.openWizardTab('Access');
    await expect(page.getByText('Selected Users (0)', { exact: true })).toBeVisible();
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await tools.cancelWizard();
  });

  test('TL-031 creates, updates and deletes GET + JSON tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-031', account, tools, testInfo);
  });

  test('TL-032 creates, updates and deletes GET + XML tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-032', account, tools, testInfo);
  });

  test('TL-033 creates, updates and deletes GET + Form Data tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-033', account, tools, testInfo);
  });

  test('TL-034 creates, updates and deletes GET + Parameters tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-034', account, tools, testInfo);
  });

  test('TL-035 creates, updates and deletes POST + JSON tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-035', account, tools, testInfo);
  });

  test('TL-036 creates, updates and deletes POST + XML tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-036', account, tools, testInfo);
  });

  test('TL-037 creates, updates and deletes POST + Form Data tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-037', account, tools, testInfo);
  });

  test('TL-038 creates, updates and deletes POST + Parameters tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-038', account, tools, testInfo);
  });

  test('TL-039 creates, updates and deletes PUT + JSON tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-039', account, tools, testInfo);
  });

  test('TL-040 creates, updates and deletes PUT + XML tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-040', account, tools, testInfo);
  });

  test('TL-041 creates, updates and deletes PUT + Form Data tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-041', account, tools, testInfo);
  });

  test('TL-042 creates, updates and deletes PUT + Parameters tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-042', account, tools, testInfo);
  });

  test('TL-043 creates, updates and deletes DELETE + JSON tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-043', account, tools, testInfo);
  });

  test('TL-044 creates, updates and deletes DELETE + XML tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-044', account, tools, testInfo);
  });

  test('TL-045 creates, updates and deletes DELETE + Form Data tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-045', account, tools, testInfo);
  });

  test('TL-046 creates, updates and deletes DELETE + Parameters tools @flow @write @crud-matrix @create @update @delete @functional @regression @e2e @integration @api', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    await runToolCrudMatrixCase('TL-046', account, tools, testInfo);
  });

  test('TL-047 Select No Authentication and verify persistence @flow @write @tools @access-controls @authentication @persistence @account-context @business-switch @functional @regression', async ({ accountPage: account, toolsPage: tools }, testInfo) => {
    testInfo.setTimeout(900_000);
    const data = caseData<ToolNoAuthenticationCaseData>('TL-047');
    const evidence: Array<Record<string, unknown>> = [];
    expect(data.authenticationOption).toBe('No Authentication');

    await runInToolContexts(account, tools, data.contexts, async (context) => {
      const toolName = accessFeatureToolName('TL-047', context);
      const purpose = contextPurpose(
        `TL-047 No Authentication persistence at ${RUN.display}.`,
        context,
      );
      const payload = contextJson(CREATED_PAYLOAD, context);
      let deleted = false;

      try {
        await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        await tools.openCreateWizard();
        await tools.fillInformation(toolName, purpose, CREATED_KEYWORDS);
        await tools.clickNext();
        await tools.expectActiveWizardTab('API Details');
        await prepareNoAuthenticationApi(tools, payload);
        await tools.clickNext();
        await tools.expectAccessControls();
        await tools.submitWizard(data.createButton);

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await expectNoAuthenticationTool(tools, {
          toolName,
          purpose,
          payload,
        });
        await tools.openWizardTab('Access');
        await tools.expectAccessControls();
        await tools.submitWizard(data.updateButton);

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await expectNoAuthenticationTool(tools, {
          toolName,
          purpose,
          payload,
        });
        await tools.cancelWizard();

        await deleteExactRunOwnedTool(tools, toolName, data);
        deleted = true;
        evidence.push({
          account: context.displayName,
          toolName,
          authenticationOption: data.authenticationOption,
          persistedAfterCreate: true,
          persistedAfterUpdate: true,
          deleted: true,
        });
      } finally {
        if (!deleted) {
          await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        }
      }
    });

    await attachJsonEvidence(testInfo, {
      operation: 'no-authentication-create-update-delete',
      contexts: evidence,
    });
  });

  test('TL-048 Verify Company Access visibility from a separate company login @flow @write @tools @access-controls @company-access @cross-user-access @authorization @persistence @account-context @business-switch @functional @regression', async ({ browser, accountPage: account, toolsPage: tools }, testInfo) => {
    testInfo.setTimeout(600_000);
    const data = caseData<ToolCompanyAccessCaseData>('TL-048');
    const identities = loadToolsAccessIdentities(BASE_URL);
    const [enabledState, disabledState] = data.companyAccessStates;
    expect(data.companyAccessLabel).toBe('Company Access');
    expect(data.companyAccessStates).toEqual([true, false]);
    expect(data.companyMemberVisibleWhenEnabled).toBe(true);
    expect(data.companyMemberHiddenWhenDisabled).toBe(true);

    await runInToolContexts(account, tools, [data.context], async (context) => {
      const toolName = accessFeatureToolName('TL-048', context);
      const purpose = contextPurpose(
        `TL-048 Company Access persistence at ${RUN.display}.`,
        context,
      );
      const payload = contextJson(CREATED_PAYLOAD, context);
      let deleted = false;
      let companySession: ToolsAccessSession | undefined;

      try {
        await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        await openConfiguredToolAtAccess(tools, toolName, purpose, payload);
        await tools.expectCompanyAccessAvailable();
        await tools.setCompanyAccess(enabledState);
        await tools.expectCompanyAccess(enabledState);
        await tools.submitWizard(data.createButton);

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await tools.openWizardTab('Access');
        await tools.expectCompanyAccessAvailable();
        await tools.expectCompanyAccess(enabledState);
        await tools.cancelWizard();

        companySession = await ToolsAccessSession.open(
          browser,
          identities.companyMember,
          SUBSCRIBED_ACCOUNT,
        );
        await companySession.expectToolVisible(
          toolName,
          testInfo,
          'company-member',
        );

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await tools.openWizardTab('Access');
        await tools.expectCompanyAccessAvailable();
        await tools.expectCompanyAccess(enabledState);
        await tools.setCompanyAccess(disabledState);
        await tools.expectCompanyAccess(disabledState);
        await tools.submitWizard(data.updateButton);

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await tools.openWizardTab('Access');
        await tools.expectCompanyAccessAvailable();
        await tools.expectCompanyAccess(disabledState);
        await tools.cancelWizard();

        await companySession.expectToolHidden(toolName);

        await deleteExactRunOwnedTool(tools, toolName, data);
        deleted = true;
      } finally {
        await companySession?.close().catch(() => undefined);
        if (!deleted) {
          await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        }
      }
    });

    await attachJsonEvidence(testInfo, {
      operation: 'company-access-create-update-delete',
      accountContext: data.context,
      enabledState,
      disabledState,
      companyMemberVisibleWhenEnabled: true,
      companyMemberHiddenWhenDisabled: true,
      identityValuesAttached: false,
      deleted: true,
    });
  });

  test('TL-049 Verify assigned-user visibility and unassigned company-user denial @flow @write @tools @access-controls @employee-access @cross-user-access @authorization @permissions @persistence @account-context @business-switch @functional @regression', async ({ browser, accountPage: account, toolsPage: tools }, testInfo) => {
    testInfo.setTimeout(600_000);
    const data = caseData<ToolEmployeeAccessCaseData>('TL-049');
    const identities = loadToolsAccessIdentities(BASE_URL);
    expect(data.employeeCandidateLimit)
      .toBeGreaterThanOrEqual(data.expectedSelectedCount);
    expect(data.permissions).toHaveLength(data.expectedSelectedCount);
    expect(data.permissions[0]).toBe('Can Edit');
    expect(data.assignedUserVisible).toBe(true);
    expect(data.unassignedCompanyMemberHidden).toBe(true);

    await runInToolContexts(account, tools, [data.context], async (context) => {
      const toolName = accessFeatureToolName('TL-049', context);
      const purpose = contextPurpose(
        `TL-049 employee permission persistence at ${RUN.display}.`,
        context,
      );
      const payload = contextJson(CREATED_PAYLOAD, context);
      let deleted = false;
      let assignedSession: ToolsAccessSession | undefined;
      let companySession: ToolsAccessSession | undefined;

      try {
        await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        await openConfiguredToolAtAccess(tools, toolName, purpose, payload);
        await tools.expectCompanyAccess(false);
        const directoryCandidates = await tools.activeEmployeeSearchCandidates(
          data.employeeDirectoryPath,
          data.employeeCandidateLimit,
        );

        const assignedUserSelected = await tools.selectDistinctEmployee(
          identities.assignedUser.username,
          1,
        );
        expect(
          assignedUserSelected,
          'The configured assigned user must resolve to an existing employee.',
        ).toBe(true);

        let selectedCount = 1;
        const additionalCandidates = directoryCandidates.filter((candidate) => (
          candidate.toLowerCase() !== identities.assignedUser.username.toLowerCase()
        ));
        for (const employeeSearch of additionalCandidates) {
          if (selectedCount === data.expectedSelectedCount) break;
          const selected = await tools.selectDistinctEmployee(
            employeeSearch,
            selectedCount + 1,
          );
          if (selected) selectedCount += 1;
        }
        expect(
          selectedCount,
          'Runtime directory candidates must resolve two distinct employees.',
        ).toBe(data.expectedSelectedCount);
        await tools.expectSelectedUsersCount(data.expectedSelectedCount);
        for (let index = 0; index < data.permissions.length; index += 1) {
          await tools.setSelectedUserPermission(index, data.permissions[index]);
        }
        await tools.expectSelectedUserPermissions(data.permissions);
        await tools.submitWizard(data.createButton);

        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await tools.openWizardTab('Access');
        await tools.expectSelectedUsersCount(data.expectedSelectedCount);
        await tools.expectSelectedUserPermissions(data.permissions);
        await tools.cancelWizard();

        assignedSession = await ToolsAccessSession.open(
          browser,
          identities.assignedUser,
          SUBSCRIBED_ACCOUNT,
        );
        await assignedSession.expectToolVisible(
          toolName,
          testInfo,
          'assigned-user',
        );
        await assignedSession.close();
        assignedSession = undefined;

        companySession = await ToolsAccessSession.open(
          browser,
          identities.companyMember,
          SUBSCRIBED_ACCOUNT,
        );
        await companySession.expectToolHidden(toolName);

        await deleteExactRunOwnedTool(tools, toolName, data);
        deleted = true;
      } finally {
        await assignedSession?.close().catch(() => undefined);
        await companySession?.close().catch(() => undefined);
        if (!deleted) {
          await bestEffortDeleteMatrixTool(account, tools, context, toolName);
        }
      }
    });

    await attachJsonEvidence(testInfo, {
      operation: 'employee-access-create-verify-delete',
      accountContext: data.context,
      selectedUserCount: data.expectedSelectedCount,
      permissions: data.permissions,
      assignedUserVisible: true,
      unassignedCompanyMemberHidden: true,
      employeeIdentifiersAttached: false,
      deleted: true,
    });
  });
});

async function prepareNoAuthenticationApi(
  tools: ToolsPage,
  payload: string,
): Promise<void> {
  await tools.fillEndpoint(ENDPOINT);
  await tools.selectMethod(DEFAULT_METHOD);
  await tools.clickNext();
  await tools.expectActiveApiSection('Header');
  await tools.selectPayloadType(DEFAULT_PAYLOAD_FORMAT);
  await tools.selectNoAuthentication();
  await tools.expectNoAuthenticationSelected();
  await tools.clickNext();
  await tools.expectActiveApiSection('Body');
  await tools.fillPayload(DEFAULT_PAYLOAD_FORMAT, payload);
  await tools.generateSchema();
}

async function expectNoAuthenticationTool(
  tools: ToolsPage,
  expected: {
    toolName: string;
    purpose: string;
    payload: string;
  },
): Promise<void> {
  await expect(tools.toolNameInput).toHaveValue(expected.toolName);
  await expect(tools.toolPurposeInput).toHaveValue(expected.purpose);
  await expect(tools.botKeywordsInput).toHaveValue(CREATED_KEYWORDS);
  await tools.openWizardTab('API Details');
  await tools.expectEndpoint(ENDPOINT);
  await tools.expectMethod(DEFAULT_METHOD);
  await tools.expectPayloadType(DEFAULT_PAYLOAD_FORMAT);
  await tools.expectNoAuthenticationSelected();
  expectMatrixPayload(
    DEFAULT_PAYLOAD_FORMAT,
    await tools.payloadValue(DEFAULT_PAYLOAD_FORMAT),
    expected.payload,
  );
}

async function openConfiguredToolAtAccess(
  tools: ToolsPage,
  toolName: string,
  purpose: string,
  payload: string,
): Promise<void> {
  await tools.openCreateWizard();
  await tools.fillInformation(toolName, purpose, CREATED_KEYWORDS);
  await tools.clickNext();
  await tools.expectActiveWizardTab('API Details');
  await prepareValidApi(tools, payload);
  await tools.clickNext();
  await tools.expectAccessControls();
}

async function deleteExactRunOwnedTool(
  tools: ToolsPage,
  toolName: string,
  labels: Pick<
    ToolLifecycleActionLabels,
    'deleteMenuItem' | 'deleteDialogTitle' | 'deleteButton'
  >,
): Promise<void> {
  expect(labels.deleteMenuItem).toBe('Delete');
  await tools.selectScope('All');
  await tools.searchForTool(toolName);
  const confirmation = await tools.openDeleteConfirmation(toolName);
  await expect(confirmation.getByText(labels.deleteDialogTitle, { exact: true }))
    .toBeVisible();
  await expect(confirmation.getByRole('button', {
    name: labels.deleteButton,
    exact: true,
  })).toBeEnabled();
  await tools.confirmDelete(toolName);
}

function accessFeatureToolName(
  caseId: 'TL-047' | 'TL-048' | 'TL-049',
  context: ToolAccountContext,
): string {
  const contextSuffix = context.key === 'myAccount' ? '' : ' HCL';
  return `QA ${caseId} Access ${RUN.compact}${contextSuffix}`;
}

async function runToolCrudMatrixCase(
  caseId: string,
  account: AccountPage,
  tools: ToolsPage,
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  testInfo.setTimeout(900_000);
  const updatedAt = timestampInIndia(new Date());
  const data = matrixCaseData(caseId, updatedAt);
  const evidence: Array<Record<string, unknown>> = [];

  await runInToolContexts(account, tools, data.contexts, async (context) => {
    const toolPrefix = matrixToolPrefix(caseId, data);
    const toolName = matrixToolName(caseId, data, context);
    const createdPayload = contextualizeMatrixPayload(
      data.payloadType,
      data.createPayload,
      context,
    );
    const updatedPayload = contextualizeMatrixPayload(
      data.payloadType,
      data.updatePayload,
      context,
    );
    const createdPurpose = contextPurpose(
      `${caseId} ${data.method} with ${data.payloadType} created at ${RUN.display}.`,
      context,
    );
    const updatedPurpose = contextPurpose(
      `${caseId} ${data.method} with ${data.payloadType} updated at ${updatedAt.display}.`,
      context,
    );
    const createdKeywords = `qa, crud, create, ${data.method.toLowerCase()}`;
    const updatedKeywords = `qa, crud, update, ${data.payloadType.toLowerCase()}`;
    let toolExists = false;

    try {
      await bestEffortDeleteMatrixToolsByPrefix(tools, toolPrefix);

      await test.step(`${context.displayName}: create ${data.method} + ${data.payloadType}`, async () => {
        await tools.openCreateWizard();
        await tools.fillInformation(
          toolName,
          createdPurpose,
          createdKeywords,
        );
        await tools.clickNext();
        await tools.expectActiveWizardTab('API Details');
        const schema = matrixSchema(
          caseId,
          'create',
          data.payloadType,
          createdPayload,
          context,
        );
        await tools.fillApiDetails({
          method: data.method,
          payloadType: data.payloadType,
          endpoint: ENDPOINT,
          header: VALID_HEADER,
          payload: createdPayload,
          schema: data.payloadType === 'XML' ? schema : undefined,
        });
        const createdSchema = data.payloadType === 'XML'
          ? await tools.schemaJsonValue()
          : await tools.generateSchema();
        expectMatrixSchema(createdSchema, data.payloadType, createdPayload);
        await tools.clickNext();
        await tools.expectAccessControls();
        await tools.submitWizard(data.createButton);
        toolExists = true;
        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await expect(tools.toolCard(toolName)).toBeVisible();
      });

      await test.step(`${context.displayName}: verify created values`, async () => {
        await verifyMatrixTool(tools, {
          toolName,
          purpose: createdPurpose,
          keywords: createdKeywords,
          method: data.method,
          payloadType: data.payloadType,
          payload: createdPayload,
        });
      });

      await test.step(`${context.displayName}: update ${data.method} + ${data.payloadType}`, async () => {
        await tools.searchForTool(toolName);
        await tools.openEditTool(toolName);
        await tools.fillInformation(
          toolName,
          updatedPurpose,
          updatedKeywords,
        );
        await tools.clickNext();
        await tools.expectActiveWizardTab('API Details');
        const schema = matrixSchema(
          caseId,
          'update',
          data.payloadType,
          updatedPayload,
          context,
        );
        await tools.fillApiDetails({
          method: data.method,
          payloadType: data.payloadType,
          endpoint: ENDPOINT,
          header: VALID_HEADER,
          payload: updatedPayload,
          schema: data.payloadType === 'XML' ? schema : undefined,
        });
        const updatedSchema = data.payloadType === 'XML'
          ? await tools.schemaJsonValue()
          : await tools.generateSchema();
        expectMatrixSchema(updatedSchema, data.payloadType, updatedPayload);
        await tools.clickNext();
        await tools.expectAccessControls();
        await tools.submitWizard(data.updateButton);
        await account.expectActiveAccount(context.activeLabel);
        await tools.selectScope('All');
        await tools.searchForTool(toolName);
        await expect(tools.toolCard(toolName)).toBeVisible();
      });

      await test.step(`${context.displayName}: verify updated values`, async () => {
        await verifyMatrixTool(tools, {
          toolName,
          purpose: updatedPurpose,
          keywords: updatedKeywords,
          method: data.method,
          payloadType: data.payloadType,
          payload: updatedPayload,
        });
      });

      await test.step(`${context.displayName}: delete and verify absence`, async () => {
        await tools.searchForTool(toolName);
        const confirmation = await tools.openDeleteConfirmation(toolName);
        await expect(confirmation.getByText(data.deleteDialogTitle, { exact: true }))
          .toBeVisible();
        await expect(confirmation.getByRole('button', {
          name: data.deleteButton,
          exact: true,
        })).toBeEnabled();
        await tools.confirmDelete(toolName);
        toolExists = false;
      });

      evidence.push({
        account: context.displayName,
        toolName,
        method: data.method,
        payloadType: data.payloadType,
        createdAt: RUN.display,
        updatedAt: updatedAt.display,
        deleted: true,
      });
    } finally {
      if (toolExists) {
        await bestEffortDeleteMatrixTool(
          account,
          tools,
          context,
          toolName,
        );
      }
    }
  });

  await attachJsonEvidence(testInfo, {
    operation: 'create-update-delete',
    matrixCaseId: caseId,
    method: data.method,
    payloadType: data.payloadType,
    contexts: evidence,
  });
}

async function verifyMatrixTool(
  tools: ToolsPage,
  expected: {
    toolName: string;
    purpose: string;
    keywords: string;
    method: HttpMethod;
    payloadType: PayloadType;
    payload: string;
  },
): Promise<void> {
  await tools.selectScope('All');
  await tools.searchForTool(expected.toolName);
  await tools.openEditTool(expected.toolName);
  await expect(tools.toolNameInput).toHaveValue(expected.toolName);
  await expect(tools.toolPurposeInput).toHaveValue(expected.purpose);
  await expect(tools.botKeywordsInput).toHaveValue(expected.keywords);

  await tools.openWizardTab('API Details');
  await tools.expectEndpoint(ENDPOINT);
  await tools.expectMethod(expected.method);
  await tools.expectPayloadType(expected.payloadType);
  expect(JSON.parse(await tools.headerJsonValue()))
    .toEqual(JSON.parse(VALID_HEADER));
  expectMatrixPayload(
    expected.payloadType,
    await tools.payloadValue(expected.payloadType),
    expected.payload,
  );
  expectMatrixSchema(
    await tools.schemaJsonValue(),
    expected.payloadType,
    expected.payload,
  );

  await tools.openWizardTab('Access');
  await tools.expectAccessControls();
  await tools.cancelWizard();
}

async function bestEffortDeleteMatrixTool(
  account: AccountPage,
  tools: ToolsPage,
  context: ToolAccountContext,
  toolName: string,
): Promise<void> {
  try {
    if (await tools.informationTab.isVisible().catch(() => false)) {
      await tools.cancelWizard();
    }
    if (!await tools.searchTools.isVisible().catch(() => false)) {
      await enterToolContext(account, tools, context);
    }
    await account.expectActiveAccount(context.activeLabel);
    await tools.selectScope('All');
    await tools.searchTools.fill(toolName);
    if (await tools.toolCard(toolName).count() > 0) {
      await tools.openDeleteConfirmation(toolName);
      await tools.confirmDelete(toolName);
    }
  } catch {
    // Cleanup must never hide the original lifecycle failure.
  }
}

async function bestEffortDeleteMatrixToolsByPrefix(
  tools: ToolsPage,
  prefix: string,
): Promise<void> {
  try {
    await tools.selectScope('All');
    await tools.searchTools.fill(prefix);
    const names = (await tools.visibleToolNames())
      .filter((name) => name.startsWith(prefix));
    for (const name of [...new Set(names)]) {
      await tools.searchForTool(name);
      await tools.openDeleteConfirmation(name);
      await tools.confirmDelete(name);
    }
    await tools.searchTools.fill('');
  } catch {
    // Stale run cleanup is best effort and must not hide the current lifecycle.
  }
}

function matrixCaseData(
  caseId: string,
  updatedAt: ReturnType<typeof timestampInIndia>,
): ToolCrudMatrixCaseData {
  const row = requireToolsExcelCase(EXCEL_INPUT, caseId);
  return resolveExcelTokens(row.data, {
    ...COMMON_TOKENS,
    UPDATE_DISPLAY: updatedAt.display,
    UPDATE_ISO: updatedAt.iso,
  }) as ToolCrudMatrixCaseData;
}

function matrixToolName(
  caseId: string,
  data: Pick<ToolCrudMatrixCaseData, 'method' | 'payloadType'>,
  context: ToolAccountContext,
): string {
  const prefix = matrixToolPrefix(caseId, data);
  const accountSuffix = context.key === 'myAccount' ? '' : ' HCL';
  return `${prefix} ${RUN.compact}${accountSuffix}`;
}

function matrixToolPrefix(
  caseId: string,
  data: Pick<ToolCrudMatrixCaseData, 'method' | 'payloadType'>,
): string {
  const payloadSlug = data.payloadType.replace(/\s+/g, '-');
  return `QA ${caseId} ${data.method} ${payloadSlug}`;
}

function contextualizeMatrixPayload(
  payloadType: PayloadType,
  payload: string,
  context: ToolAccountContext,
): string {
  if (payloadType === 'JSON') {
    return JSON.stringify({
      ...(JSON.parse(payload) as Record<string, unknown>),
      accountContext: context.key,
    }, null, 2);
  }
  if (payloadType === 'XML') {
    return payload.replace(
      '</toolRequest>',
      `  <accountContext>${context.key}</accountContext>\n</toolRequest>`,
    );
  }
  return `${payload.trim()}\naccountContext:${context.key}`;
}

function matrixSchema(
  caseId: string,
  operation: 'create' | 'update',
  payloadType: PayloadType,
  payload: string,
  context: ToolAccountContext,
): string {
  const keys = matrixPayloadKeys(payloadType, payload);
  const name = [
    'qa',
    caseId.toLowerCase().replace('-', '_'),
    operation,
    context.key.toLowerCase(),
  ].join('_');
  return JSON.stringify({
    name,
    parameters: {
      type: 'object',
      required: keys,
      properties: Object.fromEntries(keys.map((key) => [key, {
        type: 'string',
        description: `The ${key} parameter.`,
      }])),
      additionalProperties: false,
    },
    description: `${caseId} ${payloadType} ${operation} payload schema.`,
  }, null, 2);
}

function expectMatrixPayload(
  payloadType: PayloadType,
  actual: string,
  expectedValue: string,
): void {
  if (payloadType === 'JSON') {
    expect(JSON.parse(actual)).toEqual(JSON.parse(expectedValue));
    return;
  }
  if (payloadType === 'XML') {
    expect(normalizeXml(actual)).toBe(normalizeXml(expectedValue));
    return;
  }
  expect(parseBulkPayload(actual)).toEqual(parseBulkPayload(expectedValue));
}

function expectMatrixSchema(
  schemaJson: string,
  payloadType: PayloadType,
  payload: string,
): void {
  const schema = JSON.parse(schemaJson) as {
    name?: string;
    parameters?: {
      type?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };
  };
  const keys = matrixPayloadKeys(payloadType, payload);
  expect(schema.name).toBeTruthy();
  expect(schema.parameters?.type).toBe('object');
  expect(schema.parameters?.required).toEqual(expect.arrayContaining(keys));
  for (const key of keys) {
    expect(schema.parameters?.properties).toHaveProperty(key);
  }
}

function matrixPayloadKeys(payloadType: PayloadType, payload: string): string[] {
  if (payloadType === 'JSON') {
    return Object.keys(JSON.parse(payload) as Record<string, unknown>);
  }
  if (payloadType === 'XML') {
    return [...payload.matchAll(/<([A-Za-z_][\w.-]*)>/g)]
      .map((match) => match[1])
      .filter((key) => key !== 'toolRequest')
      .filter((key, index, values) => values.indexOf(key) === index);
  }
  return Object.keys(parseBulkPayload(payload));
}

function parseBulkPayload(payload: string): Record<string, string> {
  return Object.fromEntries(payload.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) throw new Error(`Invalid Bulk Edit payload line: ${line}`);
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    }));
}

function normalizeXml(value: string): string {
  return value.trim().replace(/>\s+</g, '><');
}

async function runInToolContexts(
  account: AccountPage,
  tools: ToolsPage,
  keys: ToolAccountContextKey[],
  action: (
    context: ToolAccountContext,
    state: ToolContextState,
  ) => Promise<void>,
): Promise<void> {
  const failures: string[] = [];
  try {
    for (const key of keys) {
      const context = TOOL_CONTEXTS[key];
      if (!context) throw new Error(`Unsupported Tools account context: ${key}`);
      const state = TOOL_CONTEXT_STATE[key];
      try {
        await test.step(`Account context: ${context.displayName}`, async () => {
          await enterToolContext(account, tools, context);
          await action(context, state);
          await account.expectActiveAccount(context.activeLabel);
        });
      } catch (error) {
        failures.push(
          `${context.displayName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (await tools.informationTab.isVisible().catch(() => false)) {
          await tools.cancelWizard().catch(() => undefined);
        }
      }
    }
  } finally {
    await restoreMyAccount(account);
  }

  if (failures.length > 0) {
    throw new Error(
      'One or more Tools account-context steps failed:\n- '
      + failures.join('\n- '),
    );
  }
}

async function enterToolContext(
  account: AccountPage,
  tools: ToolsPage,
  context: ToolAccountContext,
): Promise<void> {
  await account.gotoTask();
  await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
  if (context.selection) await account.switchBusiness(context.selection);
  await account.expectActiveAccount(context.activeLabel);
  await tools.goto();
  await account.expectActiveAccount(context.activeLabel);
  await tools.expectLoaded();
}

async function restoreMyAccount(account: AccountPage): Promise<void> {
  await account.gotoTask();
  await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
  await account.expectActiveAccount(MY_ACCOUNT);
}

function createContextState(
  context: ToolAccountContext,
  toolName: string,
): ToolContextState {
  return {
    toolName,
    createdPurpose: contextPurpose(CREATED_PURPOSE, context),
    createdPayload: contextJson(CREATED_PAYLOAD, context),
  };
}

function contextPurpose(
  purpose: string,
  context: ToolAccountContext,
): string {
  return `${purpose} Account context: ${context.displayName}.`;
}

function contextJson(
  json: string,
  context: ToolAccountContext,
): string {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return JSON.stringify({
    ...parsed,
    accountContext: context.key,
  }, null, 2);
}

function caseDataForContext<T>(
  caseId: string,
  _context: ToolAccountContext,
  state: ToolContextState,
): T {
  const row = requireToolsExcelCase(EXCEL_INPUT, caseId);
  return resolveExcelTokens(row.data, {
    ...COMMON_TOKENS,
    TOOL_NAME: state.toolName,
    CREATED_PURPOSE: state.createdPurpose,
  }) as T;
}

function requireContextUpdateState(
  context: ToolAccountContext,
  state: ToolContextState,
): { at: ReturnType<typeof timestampInIndia>; purpose: string; payload: string } {
  if (!state.updatedAt || !state.updatedPurpose || !state.updatedPayload) {
    throw new Error(
      `TL-014 update state is missing for ${context.displayName}.`,
    );
  }
  return {
    at: state.updatedAt,
    purpose: state.updatedPurpose,
    payload: state.updatedPayload,
  };
}

function expectGeneratedSchemaForPayload(schemaJson: string, payloadJson: string): void {
  const schema = JSON.parse(schemaJson) as {
    name?: string;
    parameters?: {
      type?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };
  };
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  expect(schema.name).toBeTruthy();
  expect(schema.parameters?.type).toBe('object');
  expect(schema.parameters?.required).toEqual(
    expect.arrayContaining(Object.keys(payload)),
  );
  for (const key of Object.keys(payload)) {
    expect(schema.parameters?.properties).toHaveProperty(key);
  }
}

async function openApiStep(tools: ToolsPage): Promise<void> {
  await tools.goto();
  await tools.openCreateWizard();
  await tools.fillInformation(DRAFT_NAME, CREATED_PURPOSE, CREATED_KEYWORDS);
  await tools.clickNext();
  await tools.expectActiveWizardTab('API Details');
}

async function prepareValidApi(tools: ToolsPage, payload: string): Promise<string> {
  await tools.fillApiDetails({
    method: DEFAULT_METHOD,
    payloadType: DEFAULT_PAYLOAD_FORMAT,
    endpoint: ENDPOINT,
    header: VALID_HEADER,
    payload,
  });
  return tools.generateSchema();
}

async function expectEndpointRejected(tools: ToolsPage, endpoint: string): Promise<void> {
  await tools.openWizardTab('API Details');
  await tools.fillEndpoint(endpoint);
  await tools.clickNext();
  await tools.expectActiveApiSection('Endpoint');
  await expect.soft(tools.apiDetailsTab).toHaveAttribute(
    'data-state',
    'active',
    { timeout: 2_000 },
  );
}

async function hasPollutedPrototype(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => Object.prototype.hasOwnProperty.call(
    Object.prototype,
    'polluted',
  ));
}

async function setXssMarker(
  page: import('@playwright/test').Page,
  value: number,
): Promise<void> {
  await page.evaluate((marker) => {
    (window as Window & { __qaToolsXss?: number }).__qaToolsXss = marker;
  }, value);
}

async function readXssMarker(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __qaToolsXss?: number }).__qaToolsXss || 0,
  );
}

function excelSetting(key: string, tokens: ExcelTokenValues): string {
  return resolveExcelTokens(
    requireToolsExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireToolsExcelCase(EXCEL_INPUT, caseId);
  return resolveExcelTokens(row.data, COMMON_TOKENS) as T;
}

function timestampInIndia(date: Date): {
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
  const compact = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${milliseconds}`;
  const display = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${milliseconds} IST`;
  return { compact, display, iso: date.toISOString() };
}
