import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEnvironmentAuthPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const suiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = resolveEnvironmentProfile();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  storageState: resolveEnvironmentAuthPath(suiteRoot),
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
await page.goto(new URL('/agents', environment.baseURL).toString(), {
  waitUntil: 'domcontentloaded',
  timeout: 90_000,
});
await page.waitForTimeout(5_000);
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  headings: await page.getByRole('heading').allTextContents(),
  buttons: await page.getByRole('button').allTextContents(),
  tabs: await page.getByRole('tab').allTextContents(),
  inputs: await page.locator('input').evaluateAll((elements) => elements.map((element) => ({
    placeholder: element.placeholder,
    type: element.type,
    value: element.value,
    aria: element.getAttribute('aria-label'),
  }))),
  links: await page.getByRole('link').allTextContents(),
}, null, 2));
await browser.close();
