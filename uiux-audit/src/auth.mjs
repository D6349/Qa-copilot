import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stderr as output } from 'node:process';
import { chromium } from 'playwright';

export async function captureAuthState({ url, out, insecure = false } = {}) {
  const destination = path.resolve(out);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: !!insecure });
  const page = await context.newPage();
  const prompt = readline.createInterface({ input, output });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    output.write('Complete sign-in in the browser, navigate to the page you need, then press Enter here.\n');
    await prompt.question('');
    await context.storageState({ path: destination });
    return { file: destination, finalUrl: page.url() };
  } finally {
    prompt.close();
    await context.close();
    await browser.close();
  }
}

