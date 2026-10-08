/**
 * runner.js - actually execute test cases in a real browser.
 *
 * IMPORTANT, and the whole design rests on it:
 *
 * Only cases whose expected outcome is *structural* can be verified
 * automatically. "Submitting a blank required field must be blocked" is
 * structural — the browser either blocks it or it does not. "The error message
 * is clear" is not, and neither is "a maker cannot approve their own record",
 * because that needs two accounts and domain knowledge.
 *
 * So every case ends in one of four states:
 *
 *   Pass     the assertion was made and it held
 *   Fail     the assertion was made and it did not hold
 *   Blocked  the runner could not tell — reported honestly, never as a pass
 *   Skipped  no executor exists for this rule; it stays a manual case
 *
 * A runner that guesses and reports Pass is worse than no runner at all.
 */
import fs from 'node:fs';
import { formats, detectFormat, filler, xssPayloads } from './testData.js';

const ERROR_SELECTORS = [
  '[role=alert]', '[aria-invalid=true]', '.error', '.invalid-feedback',
  '.field-error', '.help-block', '.text-danger', '.ant-form-item-explain-error',
  '[class*=error i]', '[class*=invalid i]',
].join(', ');

/* ---------------------------------------------------------------- helpers */

function locatorFor(page, field) {
  if (field.testId) return page.getByTestId(field.testId);
  if (field.id) return page.locator(`#${CSS_escape(field.id)}`);
  if (field.name) return page.locator(`[name="${field.name}"]`);
  if (field.label) return page.getByLabel(field.label, { exact: false });
  if (field.placeholder) return page.getByPlaceholder(field.placeholder);
  return page.locator(field.tag).first();
}

const CSS_escape = (s) => String(s).replace(/([^\w-])/g, '\\$1');

/** A value this field should accept. */
function validValueFor(field) {
  const fmt = detectFormat(field);
  if (fmt) return formats[fmt].valid();
  switch (field.type) {
    case 'email': return 'qa.tester@example.com';
    case 'tel': return '9876543210';
    case 'number': {
      const min = field.min !== null ? Number(field.min) : 1;
      const max = field.max !== null ? Number(field.max) : min + 100;
      return String(Math.min(max, Math.max(min, Math.floor((min + max) / 2))));
    }
    case 'date': return '2024-06-15';
    case 'url': return 'https://example.com';
    case 'password': return 'QaCopilot!2024';
    default: {
      const n = field.minlength || 4;
      const cap = field.maxlength || 20;
      return 'QA Test'.slice(0, Math.max(n, Math.min(cap, 12))).padEnd(Math.min(n, cap), 'x');
    }
  }
}

const undriveable = new Set(); // fields we already failed on: do not pay the timeout twice

async function fillValid(page, model, { except = [] } = {}) {
  const filled = [];
  for (const f of model.fields) {
    if (except.includes(f.key)) continue;
    if (undriveable.has(f.key)) continue;
    if (f.disabled || f.readonly || f.type === 'file') continue;
    const loc = locatorFor(page, f);
    if (!await loc.count().catch(() => 0)) continue;
    try {
      if (f.type === 'select') {
        const real = (f.options || []).filter((o) => o.value && !/^--|select|choose/i.test(o.text));
        if (real.length) await loc.selectOption({ label: real[0].text }, { timeout: 1200 });
      } else if (f.type === 'checkbox' || f.type === 'radio') {
        await loc.first().check({ timeout: 1200 });
      } else {
        await loc.fill(validValueFor(f), { timeout: 1200 });
      }
      filled.push(f.key);
    } catch {
      undriveable.add(f.key); // not a test failure - just not fillable from here
    }
  }
  return filled;
}

/**
 * Submit and work out whether the app blocked it.
 * Returns { blocked, how } — `how` is the evidence, which goes into the report.
 */
async function submitAndDetect(page) {
  const urlBefore = page.url();

  // 1. Native HTML5 validation is the cleanest signal available.
  const native = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form || typeof form.checkValidity !== 'function') return null;
    if (form.checkValidity()) return null;
    const bad = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    return bad ? { name: bad.name || bad.id || bad.type, message: bad.validationMessage } : { name: '?', message: 'invalid' };
  }).catch(() => null);

  if (native) {
    return { blocked: true, how: `browser validation on "${native.name}": ${native.message}` };
  }

  // 2. Otherwise submit for real and look at what happened.
  const submit = page.getByRole('button', { name: /submit|save|create|register|continue|apply|send/i }).first();
  const clicked = await submit.count()
    ? await submit.click({ timeout: 5000 }).then(() => true).catch(() => false)
    : await page.locator('form').first().evaluate((f) => { f.requestSubmit?.(); return true; }).catch(() => false);

  if (!clicked) return { blocked: null, how: 'no submit control could be activated' };

  await page.waitForTimeout(700);

  const urlAfter = page.url();
  const errors = await page.locator(ERROR_SELECTORS).filter({ hasText: /\S/ }).allTextContents().catch(() => []);
  const visibleErrors = errors.map((t) => t.trim()).filter(Boolean).slice(0, 3);

  if (visibleErrors.length) {
    return { blocked: true, how: `error shown: "${visibleErrors[0].slice(0, 120)}"` };
  }
  if (urlAfter !== urlBefore) {
    return { blocked: false, how: `navigated to ${urlAfter}` };
  }
  return { blocked: null, how: 'stayed on the same URL with no visible error — cannot tell whether it was accepted' };
}

const pass = (actual) => ({ status: 'Pass', actual });
const fail = (actual) => ({ status: 'Fail', actual });
const unknown = (actual) => ({ status: 'Blocked', actual: `Could not verify automatically: ${actual}` });

/* -------------------------------------------------------------- executors */

const executors = {

  'field.required.blank': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fillValid(page, model, { except: [field.key] });
    const r = await submitAndDetect(page);
    if (r.blocked === true) return pass(`Submission was blocked — ${r.how}`);
    if (r.blocked === false) return fail(`Submitted successfully with "${field.label || field.key}" empty — ${r.how}. Required validation is missing.`);
    return unknown(r.how);
  },

  'field.required.whitespace': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fillValid(page, model, { except: [field.key] });
    await locatorFor(page, field).fill('   ').catch(() => {});
    const r = await submitAndDetect(page);
    if (r.blocked === true) return pass(`Whitespace-only input rejected — ${r.how}`);
    if (r.blocked === false) return fail(`Accepted three spaces as a value for "${field.label || field.key}" — ${r.how}. The value is not being trimmed before validation.`);
    return unknown(r.how);
  },

  'field.maxlength.boundary': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const n = field.maxlength;
    const loc = locatorFor(page, field);
    await loc.fill(filler(n + 1)).catch(() => {});
    const got = (await loc.inputValue().catch(() => '')).length;
    if (got <= n) return pass(`Typed ${n + 1} characters, field holds ${got} — the maxlength=${n} limit is enforced.`);
    return fail(`Typed ${n + 1} characters and the field holds all ${got}. maxlength=${n} is not enforced on input.`);
  },

  'field.maxlength.paste': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const n = field.maxlength;
    const loc = locatorFor(page, field);
    // Set the value programmatically — this is what paste and autofill do.
    await loc.evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, filler(n + 50)).catch(() => {});
    const got = (await loc.inputValue().catch(() => '')).length;
    if (got <= n) return pass(`Programmatic set of ${n + 50} characters was truncated to ${got}.`);
    const r = await submitAndDetect(page);
    if (r.blocked === true) return pass(`Field accepted ${got} characters but submission was blocked — ${r.how}`);
    if (r.blocked === false) return fail(`${got} characters bypassed maxlength=${n} and submitted successfully — ${r.how}. Check what the database stored; client-side maxlength is not a control.`);
    return unknown(`field accepted ${got} characters; ${r.how}`);
  },

  'field.numeric.range': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fillValid(page, model, { except: [field.key] });
    const probe = field.max !== null ? String(Number(field.max) + 1) : String(Number(field.min) - 1);
    await locatorFor(page, field).fill(probe).catch(() => {});
    const r = await submitAndDetect(page);
    if (r.blocked === true) return pass(`Out-of-range value ${probe} rejected — ${r.how}`);
    if (r.blocked === false) return fail(`Out-of-range value ${probe} was accepted — ${r.how}. Declared range is min=${field.min}, max=${field.max}.`);
    return unknown(r.how);
  },

  'field.select.noSelection': async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fillValid(page, model, { except: [field.key] });
    const r = await submitAndDetect(page);
    if (r.blocked === true) return pass(`Placeholder option rejected — ${r.how}`);
    if (r.blocked === false) return fail(`Submitted with "${field.label || field.key}" still on its placeholder option — ${r.how}`);
    return unknown(r.how);
  },

  'a11y.labels': async (page) => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const name = el.getAttribute('aria-label')
          || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
          || byFor?.textContent
          || el.closest('label')?.textContent;
        if (!name || !name.trim()) out.push(el.name || el.id || el.type);
      }
      return out;
    }).catch(() => null);
    if (bad === null) return unknown('could not read the accessibility tree');
    if (!bad.length) return pass('Every input has a programmatically associated name.');
    return fail(`${bad.length} input(s) have no accessible name: ${bad.join(', ')}. A screen reader announces these as "edit text".`);
  },

  'a11y.altText': async (page) => {
    const bad = await page.evaluate(() => [...document.images]
      .filter((i) => i.getAttribute('alt') === null)
      .map((i) => i.getAttribute('src')?.slice(-60) || '(no src)')).catch(() => null);
    if (bad === null) return unknown('could not read the images');
    if (!bad.length) return pass('Every image has an alt attribute (empty alt counts — decorative images should have it).');
    return fail(`${bad.length} image(s) have no alt attribute at all: ${bad.slice(0, 5).join(', ')}`);
  },

  'a11y.headings': async (page) => {
    const h = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((el) => Number(el.tagName[1]))).catch(() => null);
    if (h === null) return unknown('could not read the headings');
    const h1 = h.filter((x) => x === 1).length;
    const gaps = h.some((lvl, i) => i > 0 && lvl - h[i - 1] > 1);
    if (h1 === 1 && !gaps) return pass('Exactly one h1 and no skipped heading levels.');
    return fail(`${h1} h1 element(s)${gaps ? ' and at least one skipped heading level' : ''}. Screen reader users navigate by heading.`);
  },

  'platform.consoleErrors': async (page, c, model, field, ctx) => {
    const errs = ctx.consoleErrors;
    if (!errs.length) return pass('No console errors or failed requests during load.');
    return fail(`${errs.length} console error(s) on load: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`);
  },

  'platform.responsive': async (page) => {
    const results = [];
    for (const [w, h, name] of [[320, 568, 'small phone'], [768, 1024, 'tablet'], [1280, 800, 'laptop']]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 2) results.push(`${name} (${w}px) overflows by ${overflow}px`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    if (!results.length) return pass('No horizontal overflow at 320, 768 or 1280 px.');
    return fail(`Horizontal scroll appears at: ${results.join('; ')}`);
  },

  'ui.links': async (page, c, model, field, ctx) => {
    const links = (model.links || []).filter((l) => !l.external).slice(0, 25);
    if (!links.length) return { status: 'Skipped', actual: 'No internal links on this page.' };
    const broken = [];
    for (const l of links) {
      try {
        const res = await ctx.request.get(l.href, { timeout: 15000, maxRedirects: 5 });
        if (res.status() >= 400) broken.push(`${l.href} → ${res.status()}`);
      } catch (err) {
        broken.push(`${l.href} → ${err.message.slice(0, 60)}`);
      }
    }
    if (!broken.length) return pass(`All ${links.length} internal links returned under 400.`);
    return fail(`${broken.length} broken link(s): ${broken.slice(0, 5).join('; ')}`);
  },

  'sec.authz.directUrl': async (page, c, model, field, ctx) => {
    // A fresh context with no storage state — a logged-out visitor.
    const anon = await ctx.browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const p = await anon.newPage();
      const res = await p.goto(c.pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(1200);
      const status = res ? res.status() : null;
      const finalUrl = p.url();
      const passwordFields = await p.locator('input[type=password]').count();
      const redirectedToLogin = /log ?in|sign ?in|auth|sso/i.test(finalUrl) || passwordFields > 0;

      if (redirectedToLogin || status === 401 || status === 403) {
        return pass(`Logged-out visitor was stopped (status ${status}, landed on ${finalUrl}).`);
      }
      return fail(`The page rendered for a logged-out visitor: status ${status} at ${finalUrl}. Check whether real data was exposed before any redirect.`);
    } finally {
      await anon.close();
    }
  },
};

/** Invalid-format executors are generated per format so PAN/GSTIN/etc all work. */
for (const key of Object.keys(formats)) {
  executors[`field.format.${key}.invalid`] = async (page, c, model, field) => {
    const variants = formats[key].invalid().slice(0, 3);
    const accepted = [];
    for (const v of variants) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await fillValid(page, model, { except: [field.key] });
      await locatorFor(page, field).fill(v.value).catch(() => {});
      const r = await submitAndDetect(page);
      if (r.blocked === false) accepted.push(`"${v.value}" (${v.why})`);
      if (r.blocked === null) return unknown(`on value "${v.value}": ${r.how}`);
    }
    if (!accepted.length) return pass(`All ${variants.length} malformed ${formats[key].label} values were rejected.`);
    return fail(`${accepted.length} malformed ${formats[key].label} value(s) were accepted: ${accepted.join('; ')}`);
  };

  executors[`field.format.${key}.valid`] = async (page, c, model, field) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fillValid(page, model);
    const value = formats[key].valid();
    await locatorFor(page, field).fill(value).catch(() => {});
    const r = await submitAndDetect(page);
    if (r.blocked === false) return pass(`Valid ${formats[key].label} "${value}" was accepted — ${r.how}`);
    if (r.blocked === true) return fail(`Valid ${formats[key].label} "${value}" was rejected — ${r.how}. This value satisfies the real checksum, so the validation rule is wrong.`);
    return unknown(r.how);
  };
}

export const executableRules = Object.keys(executors);
export const isExecutable = (ruleId) => Boolean(executors[ruleId]);

/* ------------------------------------------------------------------- run */

/**
 * @returns {Promise<{results: object[], summary: object}>}
 */
export async function runCases({
  cases, model, page: pageRecord, storageStatePath = null,
  headless = true, onProgress = () => {},
}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless });

  const contextOpts = { ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } };
  if (storageStatePath && fs.existsSync(storageStatePath)) contextOpts.storageState = storageStatePath;
  const context = await browser.newContext(contextOpts);

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

  const results = [];
  const ctx = { browser, context, request: context.request, consoleErrors };

  try {
    await page.goto(pageRecord.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    // If the session died we must not report a wall of failures as findings.
    const onLogin = /log ?in|sign ?in|auth|sso/i.test(page.url())
      || await page.locator('input[type=password]').count() > 0;
    if (onLogin && !/log ?in/i.test(pageRecord.url)) {
      throw new Error(
        `Landed on a login page at ${page.url()}. The saved session has expired. `
        + 'Run "login" again before running cases — otherwise every result would be meaningless.',
      );
    }

    for (const c of cases) {
      const exec = executors[c.ruleId];
      if (!exec) {
        results.push({ id: c.id, title: c.title, status: 'Skipped', actual: 'No automatic executor for this rule — it stays a manual case.', ruleId: c.ruleId });
        onProgress(results[results.length - 1], results.length, cases.length);
        continue;
      }

      const field = (model.fields || []).find((f) => (f.label || f.placeholder || f.name || f.id || f.type) === c.subModule);
      const started = Date.now();
      let r;
      try {
        r = await exec(page, c, model, field, ctx);
      } catch (err) {
        r = { status: 'Blocked', actual: `Executor error: ${err.message.slice(0, 200)}` };
      }
      results.push({ id: c.id, title: c.title, ruleId: c.ruleId, durationMs: Date.now() - started, ...r });
      onProgress(results[results.length - 1], results.length, cases.length);
    }
  } finally {
    await browser.close();
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    results,
    summary: {
      total: results.length,
      pass: count('Pass'),
      fail: count('Fail'),
      blocked: count('Blocked'),
      skipped: count('Skipped'),
      executed: results.length - count('Skipped'),
      ranAt: new Date().toISOString(),
      url: pageRecord.url,
    },
  };
}
