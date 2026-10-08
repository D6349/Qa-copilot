import { test, expect } from '@playwright/test';

test.use({
  storageState: 'D:\\qa-copilot\\playwright-suite\\storage\\dev\\auth.json'
});

test('test', async ({ page }) => {
  await page.goto('https://junedev.ledgers.cloud/tools');
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit Tool' }).click();
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Tool' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByText('Delete').click();
  await page.getByRole('button', { name: 'Delete' }).click();
});