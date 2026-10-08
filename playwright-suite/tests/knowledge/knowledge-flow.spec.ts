import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import {
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import {
  KnowledgePage,
  type KnowledgeProvider,
} from '../../pages/knowledge.page';
import { KNOWLEDGE_FLOW_CASES } from '../../test-cases/knowledge-flow-cases';
// The registry is intentionally shared with JavaScript workbook generators.
// @ts-ignore The .mjs registry has no separate declaration file.
import { automatedSuiteTags } from '../../test-cases/suite-tag-registry.mjs';
import {
  loadKnowledgeExcelRuntime,
  requireKnowledgeExcelCase,
  requireKnowledgeExcelSetting,
  resolveKnowledgeExcelTokens,
  type KnowledgeExcelTokenValues,
} from '../../utils/knowledgeExcelData';
import {
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

// Provider values can appear in Playwright traces and videos even when their
// inputs are visually masked. Knowledge keeps both disabled while retaining
// the privacy-masked final screenshot supplied by app.fixture.
test.use({ trace: 'off', video: 'off' });

const EXCEL_INPUT = loadKnowledgeExcelRuntime();
const TIME_ZONE = requireKnowledgeExcelSetting(EXCEL_INPUT, 'Time Zone');
const RUN = timestampInZone(
  process.env.KNOWLEDGE_RUN_ISO
    ? new Date(process.env.KNOWLEDGE_RUN_ISO)
    : new Date(),
  TIME_ZONE,
);
const UPDATE = timestampInZone(new Date(RUN.date.getTime() + 1_000), TIME_ZONE);
const RUN_NONCE = randomBytes(4).toString('hex');
const RUN_MARKER = RUN.compact + '-' + RUN_NONCE;
const RUN_TOKENS: KnowledgeExcelTokenValues = {
  RUN_COMPACT: RUN_MARKER,
  RUN_NONCE,
  RUN_DISPLAY: RUN.display,
  RUN_ISO: RUN.iso,
  UPDATE_DISPLAY: UPDATE.display,
  UPDATE_ISO: UPDATE.iso,
};
const KNOWLEDGE_PROVIDER = parseKnowledgeProvider(excelSetting(
  'Knowledge Provider',
  RUN_TOKENS,
));
const KNOWLEDGE_NAME = excelSetting('Knowledge Name Pattern', RUN_TOKENS);
const UPDATED_KNOWLEDGE_NAME = excelSetting(
  'Updated Knowledge Name Pattern',
  RUN_TOKENS,
);
const DRAFT_NAME = excelSetting('Draft Name Pattern', RUN_TOKENS);
const INDEX_NAME = excelSetting('Index Name Pattern', RUN_TOKENS);
const CREATED_DESCRIPTION = excelSetting(
  'Created Description Pattern',
  RUN_TOKENS,
);
const UPDATED_DESCRIPTION = excelSetting(
  'Updated Description Pattern',
  RUN_TOKENS,
);
const EMBEDDING_MODEL = excelSetting('Embedding Model', RUN_TOKENS);
const NONEXISTENT_EMPLOYEE_SEARCH = excelSetting(
  'Nonexistent Employee Search',
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
const QDRANT_ENV = {
  apiKey: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Qdrant API Key Environment Variable',
  ),
  endpoint: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Qdrant Endpoint Environment Variable',
  ),
};
const CHROMA_ENV = {
  apiKey: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Chroma API Key Environment Variable',
  ),
  tenant: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Chroma Tenant Environment Variable',
  ),
  database: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Chroma Database Environment Variable',
  ),
  alternateDatabase: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Chroma Alternate Database Environment Variable',
  ),
  collection: requireKnowledgeExcelSetting(
    EXCEL_INPUT,
    'Chroma Collection Environment Variable',
  ),
};
const WRITE_OPT_IN_ENV = requireKnowledgeExcelSetting(
  EXCEL_INPUT,
  'Write Opt-In Environment Variable',
);
const DELETE_OPT_IN_ENV = requireKnowledgeExcelSetting(
  EXCEL_INPUT,
  'Delete Opt-In Environment Variable',
);
const COMMON_TOKENS: KnowledgeExcelTokenValues = {
  ...RUN_TOKENS,
  KNOWLEDGE_PROVIDER,
  KNOWLEDGE_NAME,
  UPDATED_KNOWLEDGE_NAME,
  DRAFT_NAME,
  INDEX_NAME,
  CREATED_DESCRIPTION,
  UPDATED_DESCRIPTION,
  EMBEDDING_MODEL,
  NONEXISTENT_EMPLOYEE_SEARCH,
  XSS_MARKER,
  SQL_INJECTION_MARKER,
  SYNTHETIC_SECRET_PREFIX,
};

const DEFINITIONS = new Map(
  KNOWLEDGE_FLOW_CASES.map((definition) => [definition.id, definition]),
);
const PROVIDER_API_CASES = new Set([
  'KB-004',
  'KB-005',
  'KB-008',
  'KB-009',
  'KB-015',
  'KB-016',
]);
const INVALID_PROVIDER_SETTLE_MS = 1_500;
const INVALID_UPLOAD_SETTLE_MS = 1_500;
const INVALID_UPLOAD_PERSISTENCE_MS = 2_000;
let lifecycleCreated = false;
let lifecycleDocumentUploaded = false;
let lifecycleUpdated = false;
let lifecycleDeleted = false;
let lifecycleOwnedName: string | null = null;
const lifecycleCleanupCandidates = new Set<string>();

interface KnowledgeContext {
  browser: Browser;
  page: Page;
  knowledgePage: KnowledgePage;
}

type KnowledgeHandler = (
  context: KnowledgeContext,
  testInfo: TestInfo,
) => Promise<void>;

test.describe('Sequential June Knowledge Base module flow', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'KB');
    const excelCase = requireKnowledgeExcelCase(EXCEL_INPUT, caseId);
    const resolvedData = caseData<Record<string, unknown>>(caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData,
      additionalData: {
        timeZone: TIME_ZONE,
        suiteRunAt: RUN.display,
        knowledgeName: KNOWLEDGE_NAME,
        updatedKnowledgeName: UPDATED_KNOWLEDGE_NAME,
        indexName: INDEX_NAME,
      },
    });

    const safetyReason = knowledgeSafetySkipReason(
      caseId,
      resolvedData,
      testInfo,
    );
    testInfo.skip(Boolean(safetyReason), safetyReason || undefined);
  });

  test.afterAll(async ({ browser }, testInfo) => {
    if (
      lifecycleDeleted
      || lifecycleCleanupCandidates.size === 0
      || !cleanupSafetyAllows(testInfo)
    ) {
      return;
    }

    const baseURL = testInfo.project.use.baseURL;
    const storageState = testInfo.project.use.storageState;
    if (typeof baseURL !== 'string' || !baseURL.trim() || !storageState) {
      console.warn(
        '[knowledge-cleanup] Cleanup context was not configured; '
        + 'no deletion was attempted.',
      );
      return;
    }

    const context = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      storageState,
    });
    try {
      const page = await context.newPage();
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();
      const present: string[] = [];
      for (const candidate of lifecycleCleanupCandidates) {
        if (!candidate.includes(RUN_MARKER)) return;
        const count = await knowledge.exactKnowledgeCardCount(candidate);
        if (count > 1) {
          console.warn(
            '[knowledge-cleanup] Refused cleanup because the exact run name '
            + 'was not unique.',
          );
          return;
        }
        if (count === 1) present.push(candidate);
      }
      if (present.length === 0) {
        lifecycleDeleted = true;
        return;
      }
      if (present.length !== 1) {
        console.warn(
          '[knowledge-cleanup] Refused cleanup because current-attempt '
          + 'ownership was ambiguous.',
        );
        return;
      }
      const exactTarget = present[0];
      await knowledge.expectExactKnowledgeCardCount(exactTarget, 1);
      await knowledge.confirmDeleteExact(
        exactTarget,
        exactTarget,
        RUN_MARKER,
      );
      lifecycleDeleted = true;
      lifecycleOwnedName = null;
    } catch {
      console.warn(
        '[knowledge-cleanup] Best-effort exact cleanup did not complete; '
        + 'no broad deletion was attempted.',
      );
    } finally {
      await context.close();
    }
  });

  knowledgeCase('KB-001', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      knowledgePath: string;
      heading: string;
      createButton: string;
      searchPlaceholder: string;
    }>('KB-001');
    await knowledge.goto();
    await expect(knowledge.page).toHaveURL(
      new RegExp(data.knowledgePath + '(?:[/?#]|$)'),
    );
    await expect(knowledge.heading).toContainText(data.heading);
    await expect(knowledge.createKnowledgeButton).toBeVisible();
    await expect(knowledge.createKnowledgeButton)
      .toHaveAccessibleName(data.createButton);
    await expect(knowledge.searchKnowledge).toBeVisible();
  });

  knowledgeCase('KB-002', async ({ knowledgePage: knowledge }) => {
    await knowledge.goto();
    const initialNames = await knowledge.visibleKnowledgeNames();
    expect(initialNames.length).toBeGreaterThan(0);
    const target = initialNames[0];
    await knowledge.searchForExact(target);
    const filtered = await knowledge.knowledgeNames();
    expect(filtered.every(
      (name) => name.toLowerCase().includes(target.toLowerCase()),
    )).toBe(true);
    await knowledge.clearSearch();
    await expect.poll(async () => {
      const restored = await knowledge.knowledgeNames();
      return initialNames.every((name) => restored.includes(name));
    }).toBe(true);
  });

  knowledgeCase('KB-003', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      provider: KnowledgeProvider;
      secretValue: string;
      masked: boolean;
    }>('KB-003');
    await knowledge.goto();
    await knowledge.openProvider(data.provider);
    const secret = await knowledge.fillSyntheticProviderSecret(
      data.provider,
      data.secretValue,
    );
    if (data.masked) await expect(secret).toHaveAttribute('type', 'password');
    await expect(secret).toHaveAttribute('data-evidence-mask', 'true');
    await expect(await knowledge.providerVerifyButton(data.provider)).toBeVisible();
    await knowledge.closeProvider();
  });

  knowledgeCase('KB-004', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      invalidConnections: Array<{
        label: string;
        apiKey: string;
        endpoint: string;
      }>;
    }>('KB-004');
    await knowledge.goto();
    await knowledge.openProvider('Qdrant');
    let blockedRequestCount = 0;
    await page.route('**/*', async (route) => {
      blockedRequestCount += 1;
      await route.abort();
    });
    for (const invalid of data.invalidConnections) {
      await test.step(invalid.label, async () => {
        const requestsBeforeAttempt = blockedRequestCount;
        await knowledge.configureQdrant(invalid);
        const verify = await knowledge.providerVerifyButton('Qdrant');
        if (await verify.isEnabled()) {
          await verify.click().catch(() => undefined);
        }
        await page.waitForTimeout(INVALID_PROVIDER_SETTLE_MS);
        expect(
          blockedRequestCount,
          'Invalid provider input must be rejected before a request.',
        ).toBe(requestsBeforeAttempt);
        await expect(await knowledge.providerPanel('Qdrant')).toBeVisible();
      });
    }
    await knowledge.closeProvider();
    expect(blockedRequestCount).toBe(0);
  });

  knowledgeCase('KB-005', async ({ knowledgePage: knowledge }) => {
    await knowledge.goto();
    await knowledge.openProvider('Qdrant');
    await configureProviderFromEnvironment(knowledge, 'Qdrant');
    await verifyProviderAndClose(knowledge, 'Qdrant');
  });

  knowledgeCase('KB-006', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      provider: KnowledgeProvider;
      secretValue: string;
      masked: boolean;
    }>('KB-006');
    await knowledge.goto();
    await knowledge.openProvider(data.provider);
    const secret = await knowledge.fillSyntheticProviderSecret(
      data.provider,
      data.secretValue,
    );
    if (data.masked) await expect(secret).toHaveAttribute('type', 'password');
    await expect(secret).toHaveAttribute('data-evidence-mask', 'true');
    await expect(await knowledge.providerVerifyButton(data.provider)).toBeVisible();
    await knowledge.closeProvider();
  });

  knowledgeCase('KB-007', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      invalidConnections: Array<{
        label: string;
        apiKey: string;
        tenant: string;
      }>;
    }>('KB-007');
    await knowledge.goto();
    await knowledge.openProvider('Chroma');
    let blockedRequestCount = 0;
    await page.route('**/*', async (route) => {
      blockedRequestCount += 1;
      await route.abort();
    });
    for (const invalid of data.invalidConnections) {
      await test.step(invalid.label, async () => {
        const requestsBeforeAttempt = blockedRequestCount;
        await knowledge.configureChroma(invalid);
        const verify = await knowledge.providerVerifyButton('Chroma');
        if (await verify.isEnabled()) {
          await verify.click().catch(() => undefined);
        }
        await page.waitForTimeout(INVALID_PROVIDER_SETTLE_MS);
        expect(
          blockedRequestCount,
          'Invalid provider input must be rejected before a request.',
        ).toBe(requestsBeforeAttempt);
        await expect(await knowledge.providerPanel('Chroma')).toBeVisible();
      });
    }
    await knowledge.closeProvider();
    expect(blockedRequestCount).toBe(0);
  });

  knowledgeCase('KB-008', async ({ knowledgePage: knowledge }) => {
    await knowledge.goto();
    await knowledge.openProvider('Chroma');
    const configuredDatabase = environmentValue(CHROMA_ENV.database);
    const alternateDatabase = environmentValue(CHROMA_ENV.alternateDatabase);
    const configuredCollection = environmentValue(CHROMA_ENV.collection);
    await knowledge.configureChroma({
      apiKey: environmentValue(CHROMA_ENV.apiKey),
      tenant: environmentValue(CHROMA_ENV.tenant),
    });
    await knowledge.selectChromaDatabase(configuredDatabase);
    await knowledge.selectChromaCollection(configuredCollection);
    const collectionControl = await knowledge.chromaCollectionControl();
    expect(
      Boolean(collectionControl)
        && (await collectionControl!.textContent() || '')
          .includes(configuredCollection),
      'The configured Chroma collection should be selected.',
    ).toBe(true);
    await knowledge.selectChromaDatabase(alternateDatabase);
    await expect.poll(async () => {
      const control = await knowledge.chromaDatabaseControl();
      return (await control.textContent() || '').includes(alternateDatabase);
    }).toBe(true);
    await expect.poll(async () => {
      const control = await knowledge.chromaCollectionControl(false);
      if (!control) return false;
      return !(await control.textContent() || '').includes(
        configuredCollection,
      );
    }).toBe(true);
    await knowledge.closeProvider();
  });

  knowledgeCase('KB-009', async ({ knowledgePage: knowledge }) => {
    await knowledge.goto();
    await knowledge.openProvider('Chroma');
    await configureProviderFromEnvironment(knowledge, 'Chroma');
    await verifyProviderAndClose(knowledge, 'Chroma');
  });

  knowledgeCase('KB-010', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      invalidNames: string[];
      validName: string;
    }>('KB-010');
    await openDraft(knowledge);
    const initialize = page.getByRole('button', {
      name: 'Initialize',
      exact: true,
    });
    let mutationRequestCount = 0;
    await page.route('**/*', async (route) => {
      const method = route.request().method();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        await route.continue();
        return;
      }
      mutationRequestCount += 1;
      await route.abort();
    });
    try {
      for (const invalidName of data.invalidNames) {
        await knowledge.nameInput.fill(invalidName);
        const requestsBeforeAttempt = mutationRequestCount;
        if (await initialize.isEnabled()) await initialize.click();
        await page.waitForTimeout(INVALID_PROVIDER_SETTLE_MS);
        expect(
          mutationRequestCount,
          'An empty or whitespace-only name must be rejected before mutation.',
        ).toBe(requestsBeforeAttempt);
        await expect(knowledge.nameInput).toBeVisible();
        expect((await knowledge.nameInput.inputValue()).trim()).toBe('');
      }
      await knowledge.nameInput.fill(data.validName);
      await expect(knowledge.nameInput).toHaveValue(data.validName);
      await expect(initialize).toBeEnabled();
    } finally {
      await page.unroute('**/*');
    }
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-011', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      providerOptions: string[];
      selectedProvider: string;
    }>('KB-011');
    const selectedProvider = parseKnowledgeProvider(data.selectedProvider);
    await openDraft(knowledge);
    expect(await knowledge.visibleKnowledgeProviderOptions())
      .toEqual(expect.arrayContaining(data.providerOptions));
    await knowledge.selectKnowledgeProvider(selectedProvider);
    await expect(await knowledge.providerSelectionControl())
      .toContainText(selectedProvider);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-012', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      embeddingModels: string[];
      finalModel: string;
    }>('KB-012');
    await openDraft(knowledge);
    expect(await knowledge.visibleEmbeddingOptions())
      .toEqual(expect.arrayContaining(data.embeddingModels));
    let previousModel: string | null = null;
    for (const model of data.embeddingModels) {
      await knowledge.selectEmbeddingModel(model);
      const control = await knowledge.embeddingControl();
      await expect(control).toContainText(model);
      if (previousModel && previousModel !== model) {
        await expect(control).not.toContainText(previousModel);
      }
      previousModel = model;
    }
    await knowledge.selectEmbeddingModel(data.finalModel);
    await expect(await knowledge.embeddingControl())
      .toContainText(data.finalModel);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-013', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      draftProvider: string;
      draftEmbeddingModel: string;
      providerPlaceholder: string;
      embeddingPlaceholder: string;
    }>('KB-013');
    await openDraft(knowledge);
    await knowledge.selectEmbeddingModel(data.draftEmbeddingModel);
    await expect(await knowledge.embeddingControl())
      .toContainText(data.draftEmbeddingModel);
    await knowledge.selectKnowledgeProvider(
      parseKnowledgeProvider(data.draftProvider),
    );
    await expect(await knowledge.providerSelectionControl())
      .toContainText(data.draftProvider);
    await knowledge.cancelEditor();

    await knowledge.openCreateForm();
    await expect(await knowledge.providerSelectionControl())
      .toContainText(data.providerPlaceholder);
    await expect(await knowledge.embeddingControl())
      .toContainText(data.embeddingPlaceholder);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-014', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{ xssPayload: string }>('KB-014');
    await openDraft(knowledge);
    await page.evaluate(() => {
      (window as Window & { __qaKnowledgeXss?: number }).__qaKnowledgeXss = 0;
    });
    await knowledge.fillInformation({
      name: DRAFT_NAME,
      description: data.xssPayload,
    });
    expect(await page.evaluate(
      () => (window as Window & { __qaKnowledgeXss?: number })
        .__qaKnowledgeXss || 0,
    )).toBe(0);
    await expect(page.locator('[onerror*="__qaKnowledgeXss"]')).toHaveCount(0);
    await knowledge.cancelEditor();
    await expect(page.locator('body')).not.toContainText(data.xssPayload);
  });

  knowledgeCase('KB-015', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{ provider: KnowledgeProvider }>('KB-015');
    const initialize = () => page.getByRole('button', {
      name: 'Initialize',
      exact: true,
    });

    await test.step('provider verification is independently required', async () => {
      await openDraft(knowledge);
      await knowledge.nameInput.fill(DRAFT_NAME);
      await configureRetrieval(
        knowledge,
        data.provider,
        EMBEDDING_MODEL,
      );
      await expectInitializeRejected(page, knowledge);
      await knowledge.cancelEditor();
    });

    await test.step('Knowledge Base name is independently required', async () => {
      await knowledge.goto();
      await knowledge.openProvider(data.provider);
      await configureProviderFromEnvironment(knowledge, data.provider);
      await verifyProviderAndClose(knowledge, data.provider);
      await knowledge.openCreateForm();
      await configureConnectedIndex(
        knowledge,
        data.provider,
        INDEX_NAME,
        EMBEDDING_MODEL,
      );
      await expectInitializeRejected(page, knowledge);
      await knowledge.cancelEditor();
    });

    await test.step('connected index configuration is independently required', async () => {
      await knowledge.goto();
      await knowledge.openProvider(data.provider);
      await configureProviderFromEnvironment(knowledge, data.provider);
      await verifyProviderAndClose(knowledge, data.provider);
      await knowledge.openCreateForm();
      await knowledge.nameInput.fill(DRAFT_NAME);
      await expectInitializeRejected(page, knowledge);
      await configureConnectedIndex(
        knowledge,
        data.provider,
        INDEX_NAME,
        EMBEDDING_MODEL,
      );
      await expect(initialize()).toBeEnabled();
      await knowledge.cancelEditor();
    });
  });

  knowledgeCase('KB-016', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      provider: KnowledgeProvider;
      name: string;
      indexName: string;
      embeddingModel: string;
      description: string;
    }>('KB-016');
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(data.name, 0);
    await knowledge.expectExactKnowledgeCardCount(UPDATED_KNOWLEDGE_NAME, 0);
    await knowledge.openProvider(data.provider);
    await configureProviderFromEnvironment(knowledge, data.provider);
    await verifyProviderAndClose(knowledge, data.provider);
    await knowledge.openCreateForm();
    await knowledge.fillInformation({
      name: data.name,
      description: data.description,
    });
    await configureConnectedIndex(
      knowledge,
      data.provider,
      data.indexName,
      data.embeddingModel,
    );
    lifecycleCleanupCandidates.add(data.name);
    await knowledge.initialize();
    lifecycleOwnedName = data.name;
    await knowledge.cancelEditor();
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(data.name, 1);
    lifecycleCreated = true;
  });

  knowledgeCase('KB-017', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      expectedName: string;
      expectedProvider: KnowledgeProvider;
      expectedDescription: string;
    }>('KB-017');
    await openCreated(knowledge, data.expectedName);
    await expect(knowledge.nameInput).toHaveValue(data.expectedName);
    await knowledge.revealDescription();
    await expect(knowledge.descriptionInput).toHaveValue(data.expectedDescription);
    await expect(await knowledge.providerSelectionControl())
      .toContainText(data.expectedProvider);
    await expect(await knowledge.initializedStatus()).toBeVisible();
    await expect(await knowledge.providerCollectionControl(data.expectedProvider))
      .toContainText(INDEX_NAME);
    await expect(knowledge.documentsTab).toBeVisible();
    await expect(knowledge.accessTab).toBeVisible();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-018', async ({ knowledgePage: knowledge }) => {
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Documents');
    await expect(knowledge.documentInput).toBeAttached();
    await expect(knowledge.documentInput).toBeEnabled();
    await expect(knowledge.documentInput).not.toHaveValue(/[A-Za-z]:\\|\//);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-019', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      maximumUploadBytes: number;
      invalidUploads: Array<{
        label: string;
        name: string;
        mimeType: string;
        body?: string;
        sizeBytes?: number;
      }>;
    }>('KB-019');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Documents');
    let containUploadRequests = true;
    let blockedRequestCount = 0;
    const blockedUploadDetails: string[] = [];
    let activeInvalidName: string | null = null;
    await page.route('**/*', async (route) => {
      const request = route.request();
      const method = request.method();
      const contentType = request.headers()['content-type'] || '';
      const pathname = new URL(request.url()).pathname;
      const postData = request.postData() || '';
      const isUploadMutation = ['POST', 'PUT', 'PATCH'].includes(method)
        && (
          /multipart\/form-data/i.test(contentType)
          || /upload|document|file|ingest/i.test(pathname)
          || Boolean(activeInvalidName && postData.includes(activeInvalidName))
        );
      if (containUploadRequests && isUploadMutation) {
        blockedRequestCount += 1;
        blockedUploadDetails.push(
          `${method} ${pathname} (${contentType.split(';')[0] || 'unknown content type'})`,
        );
        await route.abort();
        return;
      }
      await route.continue();
    });
    for (const invalid of data.invalidUploads) {
      await test.step(invalid.label, async () => {
        activeInvalidName = invalid.name;
        const requestsBeforeAttempt = blockedRequestCount;
        if (invalid.sizeBytes !== undefined) {
          expect(invalid.sizeBytes).toBeGreaterThan(data.maximumUploadBytes);
        }
        const buffer = invalid.sizeBytes === undefined
          ? Buffer.from(invalid.body || '', 'utf8')
          : Buffer.alloc(invalid.sizeBytes, 0x61);
        await knowledge.documentInput.setInputFiles({
          name: invalid.name,
          mimeType: invalid.mimeType,
          buffer,
        });
        const persistedRows = documentRows(page, invalid.name);
        await expectLocatorAbsentFor(
          page,
          persistedRows,
          INVALID_UPLOAD_SETTLE_MS,
        );
        expect(
          blockedRequestCount,
          `Unsafe upload "${invalid.label}" (${invalid.name}) attempted `
            + `a network mutation: ${blockedUploadDetails
              .slice(requestsBeforeAttempt)
              .join(', ') || 'unknown upload request'}. `
            + 'Unsafe uploads must be rejected before any request leaves the page.',
        ).toBe(requestsBeforeAttempt);
        await knowledge.documentInput.setInputFiles([]);
        activeInvalidName = null;
      });
    }
    await page.goto('about:blank');
    containUploadRequests = false;
    expect(blockedRequestCount).toBe(0);

    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Documents');
    for (const invalid of data.invalidUploads) {
      await expectLocatorAbsentFor(
        page,
        documentRows(page, invalid.name),
        INVALID_UPLOAD_PERSISTENCE_MS,
      );
    }
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-020', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      document: { name: string; mimeType: string; body: string };
    }>('KB-020');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.uploadDocument({
      name: data.document.name,
      mimeType: data.document.mimeType,
      buffer: Buffer.from(data.document.body, 'utf8'),
    });
    await knowledge.submitUpdate();
    lifecycleDocumentUploaded = true;
  });

  knowledgeCase('KB-021', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      expectedDocumentName: string;
      approvedOriginOnly: boolean;
    }>('KB-021');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Documents');
    const documentName = page.getByText(data.expectedDocumentName, {
      exact: true,
    });
    await expect(documentName).toHaveCount(1);
    const origin = new URL(page.url()).origin;
    await documentName.click();
    if (data.approvedOriginOnly) expect(new URL(page.url()).origin).toBe(origin);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-022', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      employeeSearch: string;
      selectedUsersText: string;
      ownerText: string;
    }>('KB-022');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Access');
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await knowledge.employeeSearchInput.fill(data.employeeSearch);
    await expect(page.getByText(data.selectedUsersText, { exact: true }))
      .toBeVisible();
    await knowledge.employeeSearchInput.clear();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-023', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      accessSearchPayloads: string[];
      selectedUsersText: string;
      ownerText: string;
    }>('KB-023');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Access');
    await page.evaluate(() => {
      (window as Window & { __qaKnowledgeXss?: number }).__qaKnowledgeXss = 0;
    });
    for (const payload of data.accessSearchPayloads) {
      await knowledge.employeeSearchInput.fill(payload);
      await expect(page.getByText(data.selectedUsersText, { exact: true }))
        .toBeVisible();
      await knowledge.employeeSearchInput.clear();
    }
    expect(await page.evaluate(
      () => (window as Window & { __qaKnowledgeXss?: number })
        .__qaKnowledgeXss || 0,
    )).toBe(0);
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-024', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      selectedUsersText: string;
      ownerText: string;
      updateButton: string;
    }>('KB-024');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Access');
    await expect(page.getByText(data.selectedUsersText, { exact: true }))
      .toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await page.getByRole('button', {
      name: data.updateButton,
      exact: true,
    }).click();
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await knowledge.openTab('Access');
    await expect(page.getByText(data.selectedUsersText, { exact: true }))
      .toBeVisible();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-025', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{ expectedMenuItems: string[] }>('KB-025');
    await knowledge.goto();
    const menu = await knowledge.openActionsExact(KNOWLEDGE_NAME);
    const items = (await menu.getByRole('menuitem').allTextContents())
      .map((item) => item.trim())
      .filter(Boolean)
      .sort();
    expect(items).toEqual([...data.expectedMenuItems].sort());
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  knowledgeCase('KB-026', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      invalidEdits: Array<{ label: string; name: string }>;
      updateButton: string;
    }>('KB-026');
    await openCreated(knowledge, KNOWLEDGE_NAME);
    for (const invalid of data.invalidEdits) {
      await test.step(invalid.label, async () => {
        await knowledge.nameInput.fill(invalid.name);
        const update = page.getByRole('button', {
          name: data.updateButton,
          exact: true,
        });
        if (await update.isEnabled()) await update.click();
        await expect(knowledge.nameInput).toBeVisible();
      });
    }
    await knowledge.nameInput.fill(KNOWLEDGE_NAME);
    await knowledge.cancelEditor();
    await openCreated(knowledge, KNOWLEDGE_NAME);
    await expect(knowledge.nameInput).toHaveValue(KNOWLEDGE_NAME);
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-027', async ({ knowledgePage: knowledge }) => {
    const data = caseData<{
      updatedName: string;
      updatedDescription: string;
    }>('KB-027');
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(data.updatedName, 0);
    await knowledge.expectExactKnowledgeCardCount(KNOWLEDGE_NAME, 1);
    await knowledge.openEditExact(KNOWLEDGE_NAME);
    await knowledge.fillInformation({
      name: data.updatedName,
      description: data.updatedDescription,
    });
    await knowledge.openTab('Documents');
    await knowledge.openTab('Access');
    await knowledge.openTab('Information');
    lifecycleCleanupCandidates.add(data.updatedName);
    await knowledge.submitUpdate();
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(data.updatedName, 1);
    await knowledge.expectExactKnowledgeCardCount(KNOWLEDGE_NAME, 0);
    lifecycleOwnedName = data.updatedName;
    lifecycleUpdated = true;
  });

  knowledgeCase('KB-028', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      expectedName: string;
      expectedDescription: string;
      expectedProvider: KnowledgeProvider;
      expectedIndexName: string;
      expectedEmbeddingModel: string;
      expectedDocumentName: string;
      selectedUsersText: string;
      ownerText: string;
    }>('KB-028');
    await openCreated(knowledge, data.expectedName);
    await expect(knowledge.nameInput).toHaveValue(data.expectedName);
    await knowledge.revealDescription();
    await expect(knowledge.descriptionInput).toHaveValue(data.expectedDescription);
    await expect(await knowledge.providerCollectionControl(data.expectedProvider))
      .toContainText(data.expectedIndexName);
    await expect(await knowledge.embeddingControl())
      .toContainText(data.expectedEmbeddingModel);
    await expect(await knowledge.initializedStatus()).toBeVisible();
    await knowledge.openTab('Documents');
    await expect(page.getByText(data.expectedDocumentName, { exact: true }))
      .toBeVisible();
    await knowledge.openTab('Access');
    await expect(page.getByText(data.selectedUsersText, { exact: true }))
      .toBeVisible();
    await expect(page.getByText(data.ownerText, { exact: true })).toBeVisible();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-029', async ({ page, knowledgePage: knowledge }) => {
    const data = caseData<{
      cancelButton: string;
      deleteButton: string;
    }>('KB-029');
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(UPDATED_KNOWLEDGE_NAME, 1);
    const confirmation = await knowledge.openDeleteConfirmationExact(
      UPDATED_KNOWLEDGE_NAME,
      UPDATED_KNOWLEDGE_NAME,
      RUN_MARKER,
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
    await knowledge.searchForExact(UPDATED_KNOWLEDGE_NAME);
    await knowledge.openEditExact(UPDATED_KNOWLEDGE_NAME);
    await knowledge.openTab('Documents');
    const documentName = caseData<{ expectedDocumentName: string }>('KB-028')
      .expectedDocumentName;
    await expect(page.getByText(documentName, { exact: true })).toBeVisible();
    await knowledge.cancelEditor();
  });

  knowledgeCase('KB-030', async ({ knowledgePage: knowledge }) => {
    await knowledge.goto();
    await knowledge.expectExactKnowledgeCardCount(UPDATED_KNOWLEDGE_NAME, 1);
    await knowledge.confirmDeleteExact(
      UPDATED_KNOWLEDGE_NAME,
      UPDATED_KNOWLEDGE_NAME,
      RUN_MARKER,
    );
    lifecycleDeleted = true;
    lifecycleOwnedName = null;
  });
});

function knowledgeCase(caseId: string, handler: KnowledgeHandler): void {
  const definition = DEFINITIONS.get(caseId);
  if (!definition) throw new Error('Missing Knowledge definition: ' + caseId);
  const tags = automatedSuiteTags(definition.id, definition.tags)
    .map((tag: string) => '@' + tag)
    .join(' ');
  test(
    `${definition.id} ${definition.title} ${tags}`,
    async ({ browser, page, knowledgePage }, testInfo) => {
      await handler({ browser, page, knowledgePage }, testInfo);
    },
  );
}

async function openDraft(knowledge: KnowledgePage): Promise<void> {
  await knowledge.goto();
  await knowledge.openCreateForm();
}

async function openCreated(
  knowledge: KnowledgePage,
  exactName: string,
): Promise<void> {
  await knowledge.goto();
  await knowledge.openEditExact(exactName);
}

async function configureRetrieval(
  knowledge: KnowledgePage,
  provider: KnowledgeProvider,
  embeddingModel: string,
): Promise<void> {
  await knowledge.selectEmbeddingModel(embeddingModel);
  await knowledge.selectKnowledgeProvider(provider);
}

async function configureConnectedIndex(
  knowledge: KnowledgePage,
  provider: KnowledgeProvider,
  indexName: string,
  embeddingModel: string,
): Promise<void> {
  await knowledge.openIndexConfiguration(provider);
  await knowledge.fillIndexName(provider, indexName);
  await knowledge.selectIndexEmbeddingModel(provider, embeddingModel);
  await knowledge.saveIndexConfiguration(provider);
  await knowledge.closeIndexConfiguration(provider);
  await knowledge.selectProviderCollection(provider, indexName);
}

async function expectInitializeRejected(
  page: Page,
  knowledge: KnowledgePage,
): Promise<void> {
  let mutationRequestCount = 0;
  await page.route('**/*', async (route) => {
    const method = route.request().method();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      await route.continue();
      return;
    }
    mutationRequestCount += 1;
    await route.abort();
  });
  try {
    const initialize = page.getByRole('button', {
      name: 'Initialize',
      exact: true,
    });
    const requestsBeforeAttempt = mutationRequestCount;
    if (await initialize.isEnabled()) await initialize.click();
    await page.waitForTimeout(INVALID_PROVIDER_SETTLE_MS);
    expect(
      mutationRequestCount,
      'Incomplete Knowledge prerequisites must be rejected before mutation.',
    ).toBe(requestsBeforeAttempt);
    await expect(knowledge.nameInput).toBeVisible();
  } finally {
    await page.unroute('**/*');
  }
}

async function configureProviderFromEnvironment(
  knowledge: KnowledgePage,
  provider: KnowledgeProvider,
): Promise<void> {
  if (provider === 'Qdrant') {
    const endpoint = environmentValue(QDRANT_ENV.endpoint);
    assertSafeProviderEndpoint(endpoint, QDRANT_ENV.endpoint);
    await knowledge.configureQdrant({
      apiKey: environmentValue(QDRANT_ENV.apiKey),
      endpoint,
    });
    return;
  }
  await knowledge.configureChroma({
    apiKey: environmentValue(CHROMA_ENV.apiKey),
    tenant: environmentValue(CHROMA_ENV.tenant),
    database: environmentValue(CHROMA_ENV.database),
    collection: environmentValue(CHROMA_ENV.collection),
  });
}

async function verifyProviderAndClose(
  knowledge: KnowledgePage,
  provider: KnowledgeProvider,
): Promise<void> {
  const panel = await knowledge.providerPanel(provider);
  await knowledge.verifyProviderConnection(provider);
  if (await panel.isVisible().catch(() => false)) await knowledge.closeProvider();
}

function knowledgeSafetySkipReason(
  caseId: string,
  data: Record<string, unknown>,
  testInfo: TestInfo,
): string | null {
  const number = Number(caseId.slice(3));
  const lifecycle = number >= 16 && number <= 30;
  if (lifecycle) {
    const writeFlag = typeof data.writeOptInEnvironmentVariable === 'string'
      ? data.writeOptInEnvironmentVariable
      : WRITE_OPT_IN_ENV;
    if (!environmentFlag(writeFlag)) {
      return `Lifecycle disabled: set ${writeFlag}=true for approved synthetic writes.`;
    }
    if (!isSyntheticLifecycleConfiguration()) {
      return 'Lifecycle disabled: generated Knowledge values are not recognizably synthetic.';
    }
    if (isLiveEnvironment() && !environmentFlag('ALLOW_LIVE_KNOWLEDGE_WRITES')) {
      return 'LIVE lifecycle disabled: set ALLOW_LIVE_KNOWLEDGE_WRITES=1 explicitly.';
    }
    if (testInfo.project.name !== 'tagged-chromium') {
      return 'Lifecycle is restricted to the single tagged-chromium project.';
    }
    if (number > 16 && !lifecycleCreated) {
      return 'Lifecycle dependency skipped: KB-016 did not create this run artifact.';
    }
    if (
      ['KB-021', 'KB-028', 'KB-029'].includes(caseId)
      && !lifecycleDocumentUploaded
    ) {
      return 'Lifecycle dependency skipped: KB-020 did not upload this run document.';
    }
    if (number >= 28 && !lifecycleUpdated) {
      return 'Lifecycle dependency skipped: KB-027 did not update this run artifact.';
    }
    if (caseId === 'KB-020') {
      const document = data.document as Record<string, unknown> | undefined;
      if (
        typeof document?.name !== 'string'
        || !document.name.includes(RUN_MARKER)
        || typeof document.body !== 'string'
        || !/approved synthetic/i.test(document.body)
        || !/no customer or production data/i.test(document.body)
      ) {
        return 'Upload disabled: the in-memory document is not approved synthetic data.';
      }
    }
  }

  if (PROVIDER_API_CASES.has(caseId) || lifecycle) {
    if (!environmentFlag('RUN_KNOWLEDGE_PROVIDER_VERIFY')) {
      return 'Provider request disabled: set RUN_KNOWLEDGE_PROVIDER_VERIFY=1 explicitly.';
    }
    if (!environmentFlag('KNOWLEDGE_PROVIDER_CONFIG_IS_SYNTHETIC')) {
      return 'Provider request disabled: synthetic provider configuration was not affirmed.';
    }
    if (
      isLiveEnvironment()
      && !environmentFlag('ALLOW_LIVE_KNOWLEDGE_PROVIDER_VERIFY')
    ) {
      return 'LIVE provider request disabled: explicit LIVE verification gate is absent.';
    }
    const provider = providerForCase(caseId, data);
    const missing = requiredProviderEnvironmentNames(caseId, provider)
      .filter((name) => !process.env[name]?.trim());
    if (caseId !== 'KB-004' && missing.length > 0) {
      return 'Provider request disabled: required environment variables are absent: '
        + missing.join(', ');
    }
  }

  if (caseId === 'KB-030') {
    const deleteFlag = typeof data.deleteOptInEnvironmentVariable === 'string'
      ? data.deleteOptInEnvironmentVariable
      : DELETE_OPT_IN_ENV;
    if (!environmentFlag(deleteFlag)) {
      return `Cleanup disabled: set ${deleteFlag}=true explicitly.`;
    }
  }
  return null;
}

function providerForCase(
  caseId: string,
  data: Record<string, unknown>,
): KnowledgeProvider {
  if (caseId === 'KB-004' || caseId === 'KB-005') return 'Qdrant';
  if (caseId === 'KB-008' || caseId === 'KB-009') return 'Chroma';
  return data.provider === 'Qdrant' ? 'Qdrant' : KNOWLEDGE_PROVIDER;
}

function providerEnvironmentNames(provider: KnowledgeProvider): string[] {
  return provider === 'Qdrant'
    ? [QDRANT_ENV.apiKey, QDRANT_ENV.endpoint]
    : [
      CHROMA_ENV.apiKey,
      CHROMA_ENV.tenant,
      CHROMA_ENV.database,
      CHROMA_ENV.collection,
    ];
}

function requiredProviderEnvironmentNames(
  caseId: string,
  provider: KnowledgeProvider,
): string[] {
  const names = providerEnvironmentNames(provider);
  return caseId === 'KB-008'
    ? [...names, CHROMA_ENV.alternateDatabase]
    : names;
}

function environmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error('Required provider environment variable is unavailable: ' + name);
  }
  return value;
}

function assertSafeProviderEndpoint(value: string, variableName: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(variableName + ' must contain a valid HTTPS provider URL.');
  }
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  const labels = hostname.split('.');
  const localSuffix = /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|home\.arpa|test|invalid|example|onion)$/i;
  const publicDnsName = isIP(hostname) === 0
    && labels.length >= 2
    && !localSuffix.test(hostname)
    && labels.every((label) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    ));
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || !publicDnsName
  ) {
    throw new Error(variableName + ' must be an approved public HTTPS test endpoint.');
  }
}

function documentRows(page: Page, fileName: string): Locator {
  return page.locator('tr, [role="row"], [data-slot="card"]').filter({
    has: page.getByText(fileName, { exact: true }),
  });
}

async function expectLocatorAbsentFor(
  page: Page,
  locator: Locator,
  durationMs: number,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  do {
    expect(await locator.count()).toBe(0);
    await page.waitForTimeout(200);
  } while (Date.now() < deadline);
  expect(await locator.count()).toBe(0);
}

function isSyntheticLifecycleConfiguration(): boolean {
  return /^QA Knowledge\b/.test(KNOWLEDGE_NAME)
    && KNOWLEDGE_NAME.includes(RUN_MARKER)
    && /^QA Knowledge Updated\b/.test(UPDATED_KNOWLEDGE_NAME)
    && UPDATED_KNOWLEDGE_NAME.includes(RUN_MARKER)
    && /^qa-knowledge-index-/.test(INDEX_NAME)
    && INDEX_NAME.includes(RUN_MARKER)
    && /approved synthetic/i.test(CREATED_DESCRIPTION)
    && /approved synthetic/i.test(UPDATED_DESCRIPTION);
}

function cleanupSafetyAllows(testInfo: TestInfo): boolean {
  if (
    testInfo.project.name !== 'tagged-chromium'
    || !environmentFlag(WRITE_OPT_IN_ENV)
    || !environmentFlag(DELETE_OPT_IN_ENV)
    || !environmentFlag('RUN_KNOWLEDGE_PROVIDER_VERIFY')
    || !environmentFlag('KNOWLEDGE_PROVIDER_CONFIG_IS_SYNTHETIC')
    || !isSyntheticLifecycleConfiguration()
  ) {
    return false;
  }
  if (
    isLiveEnvironment()
    && (
      !environmentFlag('ALLOW_LIVE_KNOWLEDGE_WRITES')
      || !environmentFlag('ALLOW_LIVE_KNOWLEDGE_PROVIDER_VERIFY')
    )
  ) {
    return false;
  }
  if (
    lifecycleOwnedName
    && !lifecycleCleanupCandidates.has(lifecycleOwnedName)
  ) {
    return false;
  }
  const required = providerEnvironmentNames(KNOWLEDGE_PROVIDER);
  if (required.some((name) => !process.env[name]?.trim())) return false;
  if (KNOWLEDGE_PROVIDER === 'Qdrant') {
    try {
      assertSafeProviderEndpoint(
        process.env[QDRANT_ENV.endpoint]!.trim(),
        QDRANT_ENV.endpoint,
      );
    } catch {
      return false;
    }
  }
  return true;
}

function parseKnowledgeProvider(value: string): KnowledgeProvider {
  if (value === 'Qdrant' || value === 'Chroma') return value;
  throw new Error('Knowledge Provider must be either Chroma or Qdrant.');
}

function environmentFlag(name: string): boolean {
  return /^(?:1|true)$/i.test(process.env[name]?.trim() || '');
}

function isLiveEnvironment(): boolean {
  return (process.env.TARGET_ENV || process.env.ENV_NAME || '')
    .trim()
    .toLowerCase() === 'live';
}

function excelSetting(
  key: string,
  tokens: KnowledgeExcelTokenValues,
): string {
  return resolveKnowledgeExcelTokens(
    requireKnowledgeExcelSetting(EXCEL_INPUT, key),
    tokens,
  );
}

function caseData<T>(caseId: string): T {
  const row = requireKnowledgeExcelCase(EXCEL_INPUT, caseId);
  return resolveKnowledgeExcelTokens(row.data, COMMON_TOKENS) as T;
}

function timestampInZone(date: Date, timeZone: string): {
  compact: string;
  display: string;
  iso: string;
  date: Date;
} {
  if (Number.isNaN(date.getTime())) {
    throw new Error('KNOWLEDGE_RUN_ISO must contain a valid ISO timestamp.');
  }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
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
    + milliseconds + ' ' + timeZone;
  return { compact, display, iso: date.toISOString(), date };
}
