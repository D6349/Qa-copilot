import { test, expect } from '@playwright/test';

test.use({
  ignoreHTTPSErrors: true,
  storageState: 'storage/auth.json',
  timezoneId: 'Asia/Kolkata'
});

test('test', async ({ page }) => {
  await page.goto('https://june.ledgers.cloud/connectors');
  await page.getByRole('textbox', { name: 'Search connectors...' }).click();
  await page.getByRole('textbox', { name: 'Search connectors...' }).fill('d');
  await page.getByRole('textbox', { name: 'Search connectors...' }).click();
  await page.getByRole('textbox', { name: 'Search connectors...' }).fill('');
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('button', { name: 'Yesterday' }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('button', { name: 'Past 7 days' }).click();
  await page.getByRole('radio').nth(1).click();
  await page.getByRole('radio').first().click();
  await page.getByRole('radio').nth(2).click();
  await page.getByRole('button', { name: 'Create Connector' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).fill('sd');
  await page.getByRole('textbox', { name: 'Specify the URL where this' }).click();
  await page.getByRole('textbox', { name: 'Specify the URL where this' }).fill('ss');
  await page.getByRole('textbox', { name: '{\'Content-Type\':\'application/' }).click();
  await page.getByRole('textbox', { name: '{\'Content-Type\':\'application/' }).fill('{}');
  await page.getByRole('tabpanel', { name: 'Information' }).click();
  await page.getByRole('textbox', { name: 'Describe the connector’s' }).click();
  await page.getByRole('textbox', { name: 'Describe the connector’s' }).fill('sas');
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('textbox', { name: 'Search by employee mail' }).click();
  await page.getByRole('tabpanel', { name: 'Access' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByText('Edit Connector').click();
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('tab', { name: 'Information' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).click();
  await page.getByRole('textbox', { name: 'Give your Connector a short' }).fill('sds');
  await page.getByRole('button', { name: 'Update' }).click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByText('Delete').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.locator('div').filter({ hasText: /^Exa$/ }).nth(1).click();
});