import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import {
  resolveAuthStoragePath,
  resolveEnvironmentArtifactPath,
  resolveEnvironmentConfig,
} from './config/environment';
import { knowledgeProviderVerificationEnabled } from './utils/report-privacy';

const RUN_AUTH_MANUAL = process.env.RUN_AUTH_MANUAL === '1';
const SENSITIVE_EMPLOYEE_ACCESS_RUN = process.env.SENSITIVE_EMPLOYEE_ACCESS_RUN === '1';
const ENVIRONMENT = resolveEnvironmentConfig();
const BASE_URL = ENVIRONMENT.baseURL;
process.env.RUN_ID ||= new Date().toISOString().replace(/[:.]/g, '-');
process.env.EXCEL_REPORT_DIR ||= resolveEnvironmentArtifactPath('excel');
// Replacement workers must address the same entities after an earlier failure.
const suiteRunIso = new Date().toISOString();
process.env.AGENTS_RUN_ISO ||= suiteRunIso;
process.env.ACCOUNT_RUN_ISO ||= suiteRunIso;
process.env.TOOLS_RUN_ISO ||= suiteRunIso;
process.env.CONNECTORS_RUN_ISO ||= suiteRunIso;
process.env.KNOWLEDGE_RUN_ISO ||= suiteRunIso;
process.env.GUARDRAILS_RUN_ISO ||= suiteRunIso;
process.env.UI_COMPONENTS_RUN_ISO ||= suiteRunIso;
process.env.PRODUCT_TOUR_RUN_ISO ||= suiteRunIso;

const RUN_UI_COMPONENTS_FLOW = process.env.RUN_UI_COMPONENTS_FLOW === '1';
const RUN_CONNECTORS_FLOW = process.env.RUN_CONNECTORS_FLOW === '1';
const RUN_KNOWLEDGE_FLOW = process.env.RUN_KNOWLEDGE_FLOW === '1';
const RUN_GUARDRAILS_FLOW = process.env.RUN_GUARDRAILS_FLOW === '1';
const RUN_AGENTS_FLOW = process.env.RUN_AGENTS_FLOW === '1';
const RUN_PRODUCT_TOUR_FLOW = process.env.RUN_PRODUCT_TOUR_FLOW === '1';
const RUN_ALL_FLOWS = process.env.RUN_ALL_FLOWS === '1';
const SENSITIVE_KNOWLEDGE_PROVIDER_RUN = knowledgeProviderVerificationEnabled();
const AUTH_STORAGE_PATH = resolveAuthStoragePath('owner');

const COMMON_TEST_IGNORES = [
  '**/unit/**',
  '**/agents/agents.spec.ts',
  '**/agents/recorded-agents-flow.spec.ts',
  '**/account/*.recording.ts',
  '**/knowledge/*.recording.ts',
  '**/product-tour/*.recording.ts',
  '**/setup/auth.manual.ts',
];

const FLOW_TEST_IGNORES = RUN_PRODUCT_TOUR_FLOW
  ? [
    ...COMMON_TEST_IGNORES,
    '**/account/**',
    '**/agents/**',
    '**/tools/**',
    '**/connectors/**',
    '**/knowledge/**',
    '**/guardrails/**',
    '**/ui-components/**',
  ]
  : RUN_KNOWLEDGE_FLOW
  ? [
    ...COMMON_TEST_IGNORES,
    '**/agents/**',
    '**/tools/**',
    '**/connectors/**',
    '**/guardrails/**',
    '**/ui-components/**',
    '**/product-tour/**',
  ]
  : RUN_AGENTS_FLOW
  ? [
    ...COMMON_TEST_IGNORES,
    '**/tools/**',
    '**/connectors/**',
    '**/knowledge/**',
    '**/guardrails/**',
    '**/ui-components/**',
    '**/product-tour/**',
  ]
  : RUN_UI_COMPONENTS_FLOW
  ? [
    ...COMMON_TEST_IGNORES,
    '**/agents/**',
    '**/tools/**',
    '**/connectors/**',
    '**/knowledge/**',
    '**/guardrails/**',
  ]
  : RUN_CONNECTORS_FLOW
    ? [
      ...COMMON_TEST_IGNORES,
      '**/knowledge/knowledge-flow.spec.ts',
      '**/guardrails/guardrails-flow.spec.ts',
      '**/ui-components/**',
      '**/product-tour/**',
    ]
    : RUN_GUARDRAILS_FLOW
      ? [
        ...COMMON_TEST_IGNORES,
        '**/connectors/connectors-flow.spec.ts',
        '**/knowledge/knowledge-flow.spec.ts',
      '**/ui-components/**',
      '**/product-tour/**',
      ]
    : [
      ...COMMON_TEST_IGNORES,
      '**/connectors/connectors-flow.spec.ts',
      '**/knowledge/knowledge-flow.spec.ts',
      '**/guardrails/guardrails-flow.spec.ts',
      '**/ui-components/ui-components-flow.spec.ts',
      '**/product-tour/product-tour-flow.spec.ts',
    ];

export default defineConfig({
  testDir: './tests',
  outputDir: resolveEnvironmentArtifactPath('artifacts'),
  testIgnore: FLOW_TEST_IGNORES,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Files may run independently, while lifecycle cases inside each module file
  // retain their declared create -> verify -> update -> cleanup order.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Provider verification can place credential/config values in failures.
  // Its only reporter is the exact-value-redacting Excel reporter; normal
  // runs retain list, HTML, Allure, Excel and optional MySQL reporting.
  reporter: SENSITIVE_KNOWLEDGE_PROVIDER_RUN
    ? [
      ['./reporters/excel-reporter.ts'],
    ]
    : SENSITIVE_EMPLOYEE_ACCESS_RUN
      ? [
        ['list'],
        ['./reporters/excel-reporter.ts'],
      ]
    : [
      ['list'],
      ['html', {
        outputFolder: `playwright-report/${ENVIRONMENT.name}`,
        open: 'never',
      }],
      ['allure-playwright', {
        resultsDir: `allure-results/${ENVIRONMENT.name}`,
      }],
      ['json', {
        outputFile: resolveEnvironmentArtifactPath('json', 'results.json'),
      }],
      ['junit', {
        outputFile: resolveEnvironmentArtifactPath('junit', 'results.xml'),
        embedAnnotationsAsProperties: true,
      }],
      ['./reporters/excel-reporter.ts'],
      ['./reporters/mysql-reporter.ts'],
    ],
  use: {
    baseURL: BASE_URL,
    trace: SENSITIVE_EMPLOYEE_ACCESS_RUN ? 'off' : 'retain-on-failure',
    // The maintained app fixture captures one privacy-masked final-state image
    // per executed case. Disable Playwright's unmasked failure duplicate.
    screenshot: 'off',
    video: SENSITIVE_EMPLOYEE_ACCESS_RUN ? 'off' : 'retain-on-failure',
    actionTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },
  metadata: {
    environment: ENVIRONMENT.name,
    baseURL: ENVIRONMENT.baseURL,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        // Credential setup must never retain traces/screenshots/videos that
        // could contain a username, password field, OTP, or identity data.
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    ...(RUN_AUTH_MANUAL ? [{
      name: 'auth-manual',
      testMatch: /auth\.manual\.ts/,
      testIgnore: [],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        trace: 'off' as const,
        screenshot: 'off' as const,
        video: 'off' as const,
      },
    }] : []),
    ...((RUN_ALL_FLOWS || RUN_KNOWLEDGE_FLOW || RUN_PRODUCT_TOUR_FLOW) ? [{
      name: 'tagged-chromium',
      testMatch: RUN_ALL_FLOWS
        ? [
          /account\.setup\.ts/,
          /(?:agents|tools|connectors|knowledge|guardrails|ui-components|product-tour)-flow\.spec\.ts/,
        ]
        : RUN_PRODUCT_TOUR_FLOW
          ? /product-tour-flow\.spec\.ts/
          : /knowledge-flow\.spec\.ts/,
      testIgnore: COMMON_TEST_IGNORES,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: AUTH_STORAGE_PATH,
      },
      dependencies: ['setup'],
    }] : []),
    {
      name: 'account-preflight',
      testMatch: /account\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: AUTH_STORAGE_PATH,
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium',
      testIgnore: [...FLOW_TEST_IGNORES, '**/account/account.setup.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: AUTH_STORAGE_PATH,
      },
      dependencies: ['account-preflight'],
    },
    {
      name: 'firefox',
      testIgnore: [...FLOW_TEST_IGNORES, '**/account/account.setup.ts'],
      use: { ...devices['Desktop Firefox'], storageState: AUTH_STORAGE_PATH },
      dependencies: ['account-preflight'],
    },
    {
      name: 'webkit',
      testIgnore: [...FLOW_TEST_IGNORES, '**/account/account.setup.ts'],
      use: { ...devices['Desktop Safari'], storageState: AUTH_STORAGE_PATH },
      dependencies: ['account-preflight'],
    },
    {
      name: 'mobile',
      testIgnore: [...FLOW_TEST_IGNORES, '**/account/account.setup.ts'],
      use: { ...devices['Pixel 7'], storageState: AUTH_STORAGE_PATH },
      dependencies: ['account-preflight'],
    },
  ],
});
