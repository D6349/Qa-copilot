import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import {
  PRODUCT_TOUR_ENTRIES,
  type ProductTourEntry,
  type ProductTourFlow,
  type ProductTourPage,
} from '../../pages/product-tour.page';
import {
  loadProductTourExcelRuntime,
  requireProductTourExcelCase,
  requireProductTourExcelSetting,
} from '../../utils/productTourExcelData';
import {
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';
import { PRODUCT_TOUR_FLOW_CASES } from '../../test-cases/product-tour-flow-cases';

const EXCEL_INPUT = loadProductTourExcelRuntime();
const BASE_URL = process.env.BASE_URL
  || requireProductTourExcelSetting(EXCEL_INPUT, 'Base URL');
const TIME_ZONE = requireProductTourExcelSetting(EXCEL_INPUT, 'Time Zone');
const DEFINITIONS = new Map(
  PRODUCT_TOUR_FLOW_CASES.map((item) => [item.id, item]),
);

test.describe('June Explore Product Tour flows', () => {
  test.describe.configure({ mode: 'default', timeout: 240_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'PT');
    const excelCase = requireProductTourExcelCase(EXCEL_INPUT, caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData: excelCase.data,
      additionalData: {
        timeZone: TIME_ZONE,
        mutationPolicy: requireProductTourExcelSetting(
          EXCEL_INPUT,
          'Mutation Policy',
        ),
      },
    });
  });

  test('PT-001 completes the Platform Overview guided tour @flow @smoke @prod-smoke @sanity @regression @uat @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-001');
  });

  test('PT-002 completes the Agents guided tour without creating an agent @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-002');
  });

  test('PT-003 completes the Tools guided tour without creating a tool @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-003');
  });

  test('PT-004 completes the Connectors guided tour without creating a connector @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-004');
  });

  test('PT-005 completes the Knowledge guided tour without creating a knowledge base @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-005');
  });

  test('PT-006 completes the Guardrails guided tour without creating a guardrail @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-006');
  });

  test('PT-007 completes the UI Components guided tour without creating a component @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-007');
  });

  test('PT-008 completes the Inbox guided tour @flow @e2e @regression @functional', async ({ productTourPage: tour }) => {
    await executeRecordedTour(tour, 'PT-008');
  });

  test('PT-009 shows every recorded Explore June AI entry @flow @sanity @regression @uat @functional', async ({ productTourPage: tour }) => {
    const data = caseData<{ entries: ProductTourEntry[] }>('PT-009');
    expect(data.entries).toEqual(PRODUCT_TOUR_ENTRIES);
    expect(await tour.visibleLauncherEntries()).toEqual(data.entries);
    await tour.expectOrigin(BASE_URL);
  });

  test('PT-010 skips a guided tour without leaving the selected module @flow @negative @regression @functional', async ({ productTourPage: tour }) => {
    const data = caseData<{
      tourEntry: ProductTourEntry;
      expectedPath: string;
      firstStep: string;
      secondStep: string;
    }>('PT-010');
    await tour.launch(data.tourEntry, data.expectedPath);
    await expect(tour.description).toContainText(data.firstStep);
    await tour.nextButton.click();
    await expect(tour.description).toContainText(data.secondStep);
    await tour.skipFromCurrentStep();
    await expect(tour.page).toHaveURL(pathPattern(data.expectedPath));
    await tour.expectOrigin(BASE_URL);
  });

  test('PT-011 moves backward within a guided tour @flow @negative @regression @functional', async ({ productTourPage: tour }) => {
    const data = caseData<{
      tourEntry: ProductTourEntry;
      expectedPath: string;
      firstStep: string;
      secondStep: string;
      totalSteps: number;
    }>('PT-011');
    await tour.launch(data.tourEntry, data.expectedPath);
    await expect(tour.description).toContainText(data.firstStep);
    await tour.nextButton.click();
    await expect(tour.description).toContainText(data.secondStep);
    await tour.backButton.click();
    await expect(tour.description).toContainText(data.firstStep);
    await expect(tour.description).toContainText(
      `Step 1 of ${data.totalSteps}`,
    );
    await tour.skipFromCurrentStep();
    await tour.expectOrigin(BASE_URL);
  });

  test('PT-012 blocks anonymous access to the Product Tour launcher @flow @negative @security @non-functional @regression @functional', async ({ browser, productTourPage: tour }) => {
    const data = caseData<{
      protectedPath: string;
      loginPathPattern: string;
    }>('PT-012');
    await tour.gotoTask();
    await expectAnonymousTourBlocked(browser, data, tour.page);
    await tour.expectOrigin(BASE_URL);
  });
});

async function executeRecordedTour(
  tour: ProductTourPage,
  caseId: string,
): Promise<void> {
  const data = caseData<ProductTourFlow>(caseId);
  await tour.run(data);
  await tour.expectOrigin(BASE_URL);
  await tour.closeResidualDraft();
}

async function expectAnonymousTourBlocked(
  browser: Browser,
  data: { protectedPath: string; loginPathPattern: string },
  evidencePage: Page,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(new URL(data.protectedPath, BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    const loginPattern = new RegExp(data.loginPathPattern, 'i');
    await expect.poll(async () => (
      loginPattern.test(new URL(page.url()).pathname)
      || !await page.getByText('Explore June AI', { exact: true })
        .isVisible()
        .catch(() => false)
    ), { timeout: 30_000 }).toBe(true);
    expect(await page.getByText('Explore June AI', { exact: true }).count())
      .toBe(0);
  } finally {
    await context.close();
  }
  await expect(evidencePage).toHaveURL(pathPattern('/task'));
}

function caseData<T>(caseId: string): T {
  return requireProductTourExcelCase(EXCEL_INPUT, caseId).data as T;
}

function pathPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?:[/?#]|$)`);
}

for (const definition of DEFINITIONS.values()) {
  if (!requireProductTourExcelCase(EXCEL_INPUT, definition.id)) {
    throw new Error('Missing Product Tour Excel row: ' + definition.id);
  }
}
