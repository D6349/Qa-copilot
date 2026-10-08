import { test } from '@playwright/test';

/**
 * Sanitized raw recorder reference only.
 *
 * LIVE credentials, tenant identifiers, endpoint identifiers and the original
 * document path were removed immediately after capture. Do not execute this
 * file directly; the maintained Knowledge suite uses environment variables,
 * approved synthetic data and explicit write guards.
 */
test.use({ storageState: 'storage/live/auth.json' });
test.skip(true, 'Raw LIVE recorder reference; intentionally non-executable.');

test('recorded Knowledge Base reference', async ({ page }) => {
  await page.goto('https://june.ledgers.cloud/knowledge-base');

  // Provider connection panels.
  await page.getByRole('button', { name: /Qdrant/i }).click();
  await page.getByRole('textbox', { name: /[•*]{4,}/ }).fill('[REDACTED]');
  await page.getByRole('textbox', { name: 'https://your-qdrant-endpoint' })
    .fill('https://qdrant.example.test:6333');
  await page.getByRole('button', { name: 'Verify Connection' }).click();
  await page.getByRole('button', { name: /close|✕/i }).click();

  await page.getByRole('button', { name: /Chroma/i }).click();
  await page.getByRole('textbox', { name: /[•*]{4,}/ }).fill('[REDACTED]');
  await page.getByRole('textbox', { name: 'your-chroma-tenant' })
    .fill('[REDACTED]');
  await page.getByRole('option', { name: 'qa-knowledge-database' }).click();
  await page.getByText('qa-knowledge-collection', { exact: true }).click();
  await page.getByRole('button', { name: 'Verify Connection' }).click();

  // Information and index configuration.
  await page.getByRole('textbox', { name: 'e.g. Product documentation' })
    .fill('QA Knowledge Base {{RUN_ID}}');
  await page.getByRole('button', { name: /Chroma index/i }).click();
  await page.getByRole('textbox', { name: 'Chroma name' })
    .fill('qa-knowledge-{{RUN_ID}}');
  await page.getByRole('option', { name: /Embedding Small/i }).click();
  await page.getByRole('option', { name: /Embedding Large/i }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /Chroma index/i }).click();
  await page.getByRole('textbox', { name: 'Chroma name' })
    .fill('qa-allowed-index-{{RUN_ID}}');
  await page.getByRole('option', { name: /Embedding Small/i }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: '+ Show' }).click();
  await page.getByRole('textbox', { name: 'Describe the content and how' })
    .fill('Approved synthetic Knowledge Base description.');
  await page.getByRole('button', { name: 'Initialize' }).click();

  // Documents and Access.
  await page.getByRole('tab', { name: 'Documents' }).click();
  await page.locator('input[type="file"]')
    .setInputFiles('test-data/fixtures/knowledge-test-document.docx');
  await page.getByText('knowledge-test-document.docx', { exact: true }).click();
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('textbox', { name: 'Search by employee mail' }).click();
  await page.getByText(/Selected Users \(0\)/).click();
  await page.getByRole('button', { name: 'Update', exact: true }).click();

  // Card actions and update navigation.
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'e.g. Product documentation' }).click();
  await page.getByRole('tab', { name: 'Documents' }).click();
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('tab', { name: 'Information' }).click();
  await page.getByRole('button', { name: 'Update' }).click();

  // Destructive action captured for selector reference only.
  await page.getByLabel('', { exact: true }).click();
  await page.getByText('Delete', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
});
