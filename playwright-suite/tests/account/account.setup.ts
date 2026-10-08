import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture';
import type {
  AccountPage,
  BusinessSelection,
} from '../../pages/account.page';
import type { TaskPage } from '../../pages/task.page';
import { resolveAuthStoragePath } from '../../config/environment';
import {
  loadAccountExcelRuntime,
  requireAccountExcelCase,
  requireAccountExcelSetting,
  resolveAccountExcelTokens,
} from '../../utils/accountExcelData';
import { saveStorageStateSafely } from '../../utils/auth-session';
import {
  extractExcelCaseId,
  prepareExcelCase,
} from '../../utils/excel-test-case';

const EXCEL_INPUT = loadAccountExcelRuntime();
const AUTH_FILE = resolveAuthStoragePath();
const MY_ACCOUNT = setting('My Account Label');
const SUBSCRIBED_BUSINESS = setting('Subscribed Business');
const SUBSCRIBED_GSTIN = setting('Subscribed GSTIN');
const NO_SUBSCRIPTION_BUSINESS = setting('No Subscription Business');
const PRO_PLAN_HEADING = setting('Pro Plan Heading');
const PRO_PLAN_CTA = setting('Pro Plan CTA');
const RESTRICTED_MODULES = setting('Restricted Modules');
const CONNECTED_CONNECTOR = setting('Connected Connector');
const SUBSCRIBED_CONNECTED_CONNECTOR = setting(
  'Subscribed Connected Connector',
);
const NO_SUBSCRIPTION_CONNECTED_CONNECTOR = setting(
  'No Subscription Connected Connector',
);
const RUN_ISO = process.env.ACCOUNT_RUN_ISO || new Date().toISOString();
const RUN_STAMP = RUN_ISO.replace(/\D/g, '').slice(0, 17);
const TOKENS = {
  BASE_URL: process.env.BASE_URL || setting('Base URL'),
  MY_ACCOUNT_LABEL: MY_ACCOUNT,
  SUBSCRIBED_BUSINESS,
  SUBSCRIBED_GSTIN,
  NO_SUBSCRIPTION_BUSINESS,
  PRO_PLAN_HEADING,
  PRO_PLAN_CTA,
  RESTRICTED_MODULES,
  CONNECTED_CONNECTOR,
  SUBSCRIBED_CONNECTED_CONNECTOR,
  NO_SUBSCRIPTION_CONNECTED_CONNECTOR,
  RUN_ISO,
  RUN_STAMP,
};
const SUBSCRIBED_ACCOUNT: BusinessSelection = {
  businessName: SUBSCRIBED_BUSINESS,
  activeAccountLabel: SUBSCRIBED_BUSINESS.replace(/\s+LIMITED$/i, ''),
  taxId: SUBSCRIBED_GSTIN,
};
const NO_SUBSCRIPTION_ACCOUNT: BusinessSelection = {
  businessName: NO_SUBSCRIPTION_BUSINESS,
  activeAccountLabel: NO_SUBSCRIPTION_BUSINESS,
};

interface ChatEntryData {
  message: string;
}

interface ConnectorEntryData extends ChatEntryData {
  connectorName: string;
}

interface UploadEntryData {
  roomMessage: string;
  fileName: string;
  mimeType: string;
  documentText: string;
  uploadMessage: string;
  completionTimeoutMs: number;
}

test.describe('Excel-driven June account preflight', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test.beforeEach(async ({}, testInfo) => {
    const caseId = extractExcelCaseId(testInfo.title, 'AC');
    const excelCase = requireAccountExcelCase(EXCEL_INPUT, caseId);
    await prepareExcelCase(testInfo, {
      caseId,
      excelCase,
      sourceWorkbook: EXCEL_INPUT.sourceWorkbook,
      resolvedData: caseData(caseId),
    });
  });

  test('AC-001 verifies the saved login and opens My Account @flow @preflight @functional @smoke @prod-smoke @sanity @regression @e2e @uat', async ({ page, accountPage: account }) => {
    const data = caseData<{
      baseUrl: string;
      myAccountLabel: string;
    }>('AC-001');

    await account.gotoTask();
    expect(new URL(page.url()).origin).toBe(new URL(data.baseUrl).origin);
    await account.switchToMyAccount(
      data.myAccountLabel,
      SUBSCRIBED_ACCOUNT,
    );
    await account.expectActiveAccount(data.myAccountLabel);
    await persistRestoredSession(page);
  });

  test('AC-004 enters an Excel-driven message in My Account chat @flow @preflight @chat @functional @regression @e2e', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyChatEntry(
      page,
      account,
      task,
      undefined,
      caseData<ChatEntryData>('AC-004'),
    );
  });

  test('AC-005 selects the connected Excel-driven connector in My Account chat @flow @preflight @connector @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyConnectorEntry(
      page,
      account,
      task,
      undefined,
      caseData<ConnectorEntryData>('AC-005'),
    );
  });

  test('AC-006 uploads and submits an Excel-driven PDF in My Account chat @flow @preflight @document-upload @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyDocumentUpload(
      page,
      account,
      task,
      undefined,
      caseData<UploadEntryData>('AC-006'),
    );
  });

  test('AC-002 switches to subscribed HCL business and verifies module navigation @flow @preflight @functional @sanity @regression @e2e @uat', async ({ page, accountPage: account }) => {
    const data = caseData<{
      subscribedBusiness: string;
      subscribedGstin: string;
      navigationModules: string;
      blockedHeading: string;
    }>('AC-002');
    const selection: BusinessSelection = {
      businessName: data.subscribedBusiness,
      activeAccountLabel: data.subscribedBusiness.replace(/\s+LIMITED$/i, ''),
      taxId: data.subscribedGstin,
    };

    await account.gotoTask();
    await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
    try {
      await account.switchBusiness(selection);
      await account.expectActiveAccount(selection.activeAccountLabel);
      for (const moduleName of parseModules(data.navigationModules)) {
        await test.step(`Subscribed access: ${moduleName}`, async () => {
          await account.expectSubscribedModule(
            moduleName,
            data.blockedHeading,
          );
        });
      }
    } finally {
      await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
      await account.expectActiveAccount(MY_ACCOUNT);
      await persistRestoredSession(page);
    }
  });

  test('AC-007 enters an Excel-driven message in subscribed HCL chat @flow @preflight @chat @functional @regression @e2e', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyChatEntry(
      page,
      account,
      task,
      SUBSCRIBED_ACCOUNT,
      caseData<ChatEntryData>('AC-007'),
    );
  });

  test('AC-008 selects the connected Excel-driven connector in subscribed HCL chat @flow @preflight @connector @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyConnectorEntry(
      page,
      account,
      task,
      SUBSCRIBED_ACCOUNT,
      caseData<ConnectorEntryData>('AC-008'),
    );
  });

  test('AC-009 uploads and submits an Excel-driven PDF in subscribed HCL chat @flow @preflight @document-upload @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyDocumentUpload(
      page,
      account,
      task,
      SUBSCRIBED_ACCOUNT,
      caseData<UploadEntryData>('AC-009'),
    );
  });

  test('AC-010 enters an Excel-driven message in USHA no-subscription chat @flow @preflight @chat @functional @regression @e2e', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyChatEntry(
      page,
      account,
      task,
      NO_SUBSCRIPTION_ACCOUNT,
      caseData<ChatEntryData>('AC-010'),
    );
  });

  test('AC-011 selects the connected Excel-driven connector in USHA chat @flow @preflight @connector @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyConnectorEntry(
      page,
      account,
      task,
      NO_SUBSCRIPTION_ACCOUNT,
      caseData<ConnectorEntryData>('AC-011'),
    );
  });

  test('AC-012 uploads and submits an Excel-driven PDF in USHA chat @flow @preflight @document-upload @functional @regression @e2e @integration', async ({ page, accountPage: account, taskPage: task }) => {
    await verifyDocumentUpload(
      page,
      account,
      task,
      NO_SUBSCRIPTION_ACCOUNT,
      caseData<UploadEntryData>('AC-012'),
    );
  });

  test('AC-003 verifies the no-subscription gate and restores My Account @flow @preflight @functional @sanity @regression @e2e @uat', async ({ page, accountPage: account }) => {
    const data = caseData<{
      noSubscriptionBusiness: string;
      restrictedModules: string;
      proPlanHeading: string;
      proPlanCta: string;
      restoreAccountLabel: string;
      activateSubscription: boolean;
    }>('AC-003');
    const noSubscriptionAccount: BusinessSelection = {
      ...NO_SUBSCRIPTION_ACCOUNT,
      businessName: data.noSubscriptionBusiness,
      activeAccountLabel: data.noSubscriptionBusiness,
    };

    expect(
      data.activateSubscription,
      'The account preflight must never activate a trial or enter checkout.',
    ).toBe(false);
    await account.gotoTask();
    await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
    try {
      await account.switchBusiness(noSubscriptionAccount);
      await account.expectActiveAccount(noSubscriptionAccount.activeAccountLabel);
      for (const moduleName of parseModules(data.restrictedModules)) {
        await test.step(`No-subscription gate: ${moduleName}`, async () => {
          await account.expectNoSubscriptionGate(
            moduleName,
            data.proPlanHeading,
            data.proPlanCta,
          );
        });
      }
    } finally {
      await account.switchToMyAccount(
        data.restoreAccountLabel,
        SUBSCRIBED_ACCOUNT,
      );
      await account.expectActiveAccount(data.restoreAccountLabel);
      await persistRestoredSession(page);
    }
  });
});

async function verifyChatEntry(
  page: Page,
  account: AccountPage,
  task: TaskPage,
  selection: BusinessSelection | undefined,
  data: ChatEntryData,
): Promise<void> {
  await enterAccountContext(account, selection);
  try {
    await task.startNewChat();
    await account.expectActiveAccount(
      selection?.activeAccountLabel || MY_ACCOUNT,
    );
    await task.enterMessage(data.message);
  } finally {
    await task.clearComposer();
    await restoreMyAccount(page, account);
  }
}

async function verifyConnectorEntry(
  page: Page,
  account: AccountPage,
  task: TaskPage,
  selection: BusinessSelection | undefined,
  data: ConnectorEntryData,
): Promise<void> {
  await enterAccountContext(account, selection);
  try {
    await task.startNewChat();
    await account.expectActiveAccount(
      selection?.activeAccountLabel || MY_ACCOUNT,
    );
    await task.selectConnectedConnector(data.connectorName);
    await task.expectConnectedConnectorSelected(data.connectorName);
    await task.enterMessage(data.message);
  } finally {
    await task.clearComposer();
    await task.removeConnectedConnector(data.connectorName);
    await restoreMyAccount(page, account);
  }
}

async function verifyDocumentUpload(
  page: Page,
  account: AccountPage,
  task: TaskPage,
  selection: BusinessSelection | undefined,
  data: UploadEntryData,
): Promise<void> {
  await enterAccountContext(account, selection);
  try {
    await task.startNewChat();
    await account.expectActiveAccount(
      selection?.activeAccountLabel || MY_ACCOUNT,
    );
    await task.sendMessageAndWaitForCompletion(
      data.roomMessage,
      data.completionTimeoutMs,
    );
    await account.expectActiveAccount(
      selection?.activeAccountLabel || MY_ACCOUNT,
    );
    await task.uploadPdf({
      fileName: data.fileName,
      mimeType: data.mimeType,
      documentText: data.documentText,
    });
    await task.submitAttachedDocumentAndWaitForCompletion(
      data.uploadMessage,
      data.fileName,
      data.completionTimeoutMs,
    );
  } finally {
    await task.removePendingAttachment(data.fileName);
    await restoreMyAccount(page, account);
  }
}

async function enterAccountContext(
  account: AccountPage,
  selection?: BusinessSelection,
): Promise<void> {
  await account.gotoTask();
  await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
  if (selection) await account.switchBusiness(selection);
  await account.expectActiveAccount(
    selection?.activeAccountLabel || MY_ACCOUNT,
  );
}

async function restoreMyAccount(
  page: Page,
  account: AccountPage,
): Promise<void> {
  await account.switchToMyAccount(MY_ACCOUNT, SUBSCRIBED_ACCOUNT);
  await account.expectActiveAccount(MY_ACCOUNT);
  await persistRestoredSession(page);
}

function setting(key: string): string {
  return requireAccountExcelSetting(EXCEL_INPUT, key);
}

function caseData<T>(caseId: string): T {
  const row = requireAccountExcelCase(EXCEL_INPUT, caseId);
  return resolveAccountExcelTokens(row.data, TOKENS) as T;
}

function parseModules(value: string): string[] {
  const modules = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (modules.length === 0) throw new Error('Account module list is empty.');
  return modules;
}

async function persistRestoredSession(
  page: Page,
): Promise<void> {
  await saveStorageStateSafely(page.context(), AUTH_FILE);
}
