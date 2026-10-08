/**
 * inspector.js - turn a URL into a structured Page Model.
 *
 * Two engines:
 *   playwright  full render, captures network calls + console errors, can use a
 *               saved storageState.json for pages behind a login
 *   static      plain fetch + cheerio, no browser needed, works immediately
 *
 * Playwright is an optional dependency and is lazily loaded, so the app still
 * runs when it (or its browser binaries) are not installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 QA-Copilot/1.0';

/* ------------------------------------------------- network diagnostics */

const CERT_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_SIGNATURE_FAILURE',
]);

/** Turn an opaque "fetch failed" into something you can act on. */
export function explainNetworkError(err, url) {
  const code = err?.cause?.code || err?.code || '';
  let host = url;
  try { host = new URL(url).host; } catch { /* keep raw */ }

  if (CERT_CODES.has(code)) {
    return `${host} presents a TLS certificate this machine will not accept (${code}). `
      + 'This is normal for internal dev and UAT servers. Re-scan with the '
      + '"allow self-signed certificate" option, or from the CLI add --insecure.';
  }

  const map = {
    ENOTFOUND: `Cannot resolve "${host}". The hostname does not exist from this machine — `
      + 'usually a VPN that is not connected, or a typo in the URL.',
    EAI_AGAIN: `DNS lookup for "${host}" failed. Check your network or VPN connection.`,
    ECONNREFUSED: `"${host}" resolved, but refused the connection. The service may be down, `
      + 'or a firewall is blocking that port.',
    ETIMEDOUT: `Timed out connecting to "${host}". Usually a VPN or firewall dropping the traffic silently.`,
    UND_ERR_CONNECT_TIMEOUT: `Timed out connecting to "${host}". Usually a VPN or firewall dropping the traffic silently.`,
    ECONNRESET: `"${host}" closed the connection unexpectedly. If this is a dev box it may be restarting.`,
    UND_ERR_HEADERS_TIMEOUT: `"${host}" accepted the connection but never sent a response in time.`,
  };
  if (map[code]) return map[code];
  return `Could not reach ${url}: ${err?.message || err}${code ? ` (${code})` : ''}`;
}

/**
 * Fetch HTML. The insecure path goes through node:https so we can turn off
 * certificate verification — global fetch gives no way to do that per request.
 */
async function fetchHtml(url, headers, insecure, depth = 0) {
  if (!insecure) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
    return { status: res.status, finalUrl: res.url || url, html: await res.text() };
  }

  if (depth > 5) throw new Error('Too many redirects');
  const { request } = await import(url.startsWith('http://') ? 'node:http' : 'node:https');

  return new Promise((resolve, reject) => {
    const req = request(url, {
      headers: { 'User-Agent': UA, ...headers },
      rejectUnauthorized: false,
      timeout: 45000,
    }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.resume();
        const next = new URL(loc, url).href;
        fetchHtml(next, headers, insecure, depth + 1).then(resolve, reject);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, finalUrl: url, html: body }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

export async function playwrightAvailable() {
  try {
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    return fs.existsSync(exe);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ extraction */

function absolute(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

/** Pull every interactive element out of a DOM string. */
function extractFromHtml(html, url) {
  const $ = cheerio.load(html);

  const labelFor = {};
  $('label').each((_, el) => {
    const f = $(el).attr('for');
    if (f) labelFor[f] = $(el).text().trim().replace(/\s+/g, ' ');
  });

  const labelOf = (el) => {
    const id = $(el).attr('id');
    if (id && labelFor[id]) return labelFor[id];
    const wrap = $(el).closest('label').text().trim().replace(/\s+/g, ' ');
    if (wrap) return wrap;
    return $(el).attr('aria-label') || $(el).attr('placeholder') || '';
  };

  const fields = [];
  $('input, textarea, select').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? ($el.attr('type') || 'text').toLowerCase() : tag;
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return;

    const field = {
      tag,
      type,
      name: $el.attr('name') || '',
      id: $el.attr('id') || '',
      label: labelOf(el),
      placeholder: $el.attr('placeholder') || '',
      required: $el.attr('required') !== undefined || $el.attr('aria-required') === 'true',
      disabled: $el.attr('disabled') !== undefined,
      readonly: $el.attr('readonly') !== undefined,
      maxlength: numOrNull($el.attr('maxlength')),
      minlength: numOrNull($el.attr('minlength')),
      min: $el.attr('min') ?? null,
      max: $el.attr('max') ?? null,
      step: $el.attr('step') ?? null,
      pattern: $el.attr('pattern') || null,
      accept: $el.attr('accept') || null,
      multiple: $el.attr('multiple') !== undefined,
      defaultValue: $el.attr('value') || '',
      testId: $el.attr('data-testid') || $el.attr('data-test') || null,
      options: tag === 'select'
        ? $el.find('option').map((__, o) => ({
            value: $(o).attr('value') ?? $(o).text().trim(),
            text: $(o).text().trim(),
            disabled: $(o).attr('disabled') !== undefined,
          })).get()
        : null,
    };
    field.key = field.name || field.id || field.label || `${type}_${fields.length}`;
    fields.push(field);
  });

  const buttons = [];
  $('button, input[type=submit], input[type=button], [role=button]').each((_, el) => {
    const $el = $(el);
    const text = ($el.text().trim() || $el.attr('value') || $el.attr('aria-label') || '')
      .replace(/\s+/g, ' ');
    if (!text) return;
    buttons.push({
      text,
      type: $el.attr('type') || 'button',
      disabled: $el.attr('disabled') !== undefined,
      testId: $el.attr('data-testid') || $el.attr('data-test') || null,
    });
  });

  const seenLinks = new Set();
  const links = [];
  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
    const href = absolute(raw, url);
    if (seenLinks.has(href)) return;
    seenLinks.add(href);
    links.push({
      text: $(el).text().trim().replace(/\s+/g, ' ').slice(0, 80),
      href,
      external: safeHost(href) !== safeHost(url),
      target: $(el).attr('target') || null,
    });
  });

  const tables = [];
  $('table').each((_, el) => {
    const headers = $(el).find('th').map((__, th) => $(th).text().trim()).get();
    if (!headers.length) return;
    tables.push({ headers, rowCount: $(el).find('tbody tr').length });
  });

  const headings = $('h1,h2,h3,h4,h5,h6').map((_, el) => ({
    level: Number(el.tagName[1]),
    text: $(el).text().trim().replace(/\s+/g, ' ').slice(0, 120),
  })).get();

  const images = $('img').map((_, el) => ({
    src: absolute($(el).attr('src') || '', url),
    alt: $(el).attr('alt') ?? null,
  })).get();

  return {
    title: $('title').first().text().trim(),
    forms: $('form').length,
    fields,
    buttons,
    links: links.slice(0, 120),
    tables,
    headings,
    images: images.slice(0, 60),
    imagesMissingAlt: images.filter((i) => i.alt === null || i.alt === '').length,
    hasPagination: $('[class*=pagin], [aria-label*=pagination i], .page-item').length > 0,
    modals: $('[role=dialog], .modal, [aria-modal=true]').length,
    landmarks: {
      main: $('main, [role=main]').length,
      nav: $('nav, [role=navigation]').length,
      header: $('header, [role=banner]').length,
      footer: $('footer, [role=contentinfo]').length,
    },
  };
}

const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const safeHost = (u) => { try { return new URL(u).host; } catch { return ''; } };

/* ---------------------------------------------------------------- engines */

async function scanStatic(url, { headers = {}, insecure = false } = {}) {
  let r;
  try {
    r = await fetchHtml(url, headers, insecure);
  } catch (err) {
    const code = err?.cause?.code || err?.code || '';
    // A cert problem is recoverable - retry once without verification and say so.
    if (!insecure && CERT_CODES.has(code)) {
      r = await fetchHtml(url, headers, true);
      r.insecureRetry = true;
    } else {
      throw new Error(explainNetworkError(err, url));
    }
  }

  const notes = [];
  if (r.insecureRetry) {
    notes.push('The TLS certificate did not verify, so the page was fetched without certificate checks.');
  }
  if (r.status >= 400) {
    notes.push(`Server returned ${r.status} - the model below may be an error or login page.`);
  }
  notes.push('Static fetch: JavaScript-rendered content is not visible. Run "npm run browsers" for a full scan.');

  return {
    engine: 'static',
    httpStatus: r.status,
    finalUrl: r.finalUrl,
    ...extractFromHtml(r.html, r.finalUrl || url),
    network: [],
    consoleErrors: [],
    note: notes.join(' '),
  };
}

async function scanPlaywright(url, { headers = {}, storageStatePath = null, waitMs = 2500 } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const contextOpts = { userAgent: UA, extraHTTPHeaders: headers, ignoreHTTPSErrors: true };
  if (storageStatePath && fs.existsSync(storageStatePath)) {
    contextOpts.storageState = storageStatePath;
  }
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const network = [];
  const consoleErrors = [];

  page.on('request', (req) => {
    const u = req.url();
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|ico)(\?|$)/i.test(u)) return;
    if (req.resourceType() === 'document') return;
    network.push({ method: req.method(), url: u, resourceType: req.resourceType() });
  });
  page.on('response', (res) => {
    const hit = network.find((n) => n.url === res.url() && n.status === undefined);
    if (hit) hit.status = res.status();
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err).slice(0, 300)));

  let httpStatus = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    httpStatus = resp ? resp.status() : null;
    await page.waitForTimeout(waitMs);
  } catch (err) {
    await browser.close();
    throw new Error(explainNetworkError(err, url));
  }

  const html = await page.content();
  const finalUrl = page.url();
  const viewportTitle = await page.title();
  await browser.close();

  const model = extractFromHtml(html, finalUrl);
  const apis = network
    .filter((n) => ['xhr', 'fetch'].includes(n.resourceType))
    .filter((n, i, arr) => arr.findIndex((x) => x.url === n.url && x.method === n.method) === i)
    .slice(0, 40);

  return {
    engine: 'playwright',
    httpStatus,
    finalUrl,
    ...model,
    title: model.title || viewportTitle,
    network: apis,
    consoleErrors: consoleErrors.slice(0, 20),
    note: null,
  };
}

/* ------------------------------------------------------------ public API */

export async function inspect(url, opts = {}) {
  const started = Date.now();
  const wantBrowser = opts.engine !== 'static' && await playwrightAvailable();
  let model;
  if (wantBrowser) {
    try {
      model = await scanPlaywright(url, opts);
    } catch (browserErr) {
      try {
        model = await scanStatic(url, opts);
        model.note = `Browser scan failed (${browserErr.message}) - fell back to static fetch. ${model.note}`;
      } catch {
        throw browserErr; // both engines failed: report the more informative one
      }
    }
  } else {
    model = await scanStatic(url, opts);
  }
  return {
    ...model,
    url,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

/** Parse pasted HTML instead of fetching - for pages you can only reach by hand. */
export function inspectHtml(html, url = 'about:blank') {
  return {
    engine: 'pasted',
    httpStatus: null,
    finalUrl: url,
    url,
    ...extractFromHtml(html, url),
    network: [],
    consoleErrors: [],
    note: 'Built from pasted HTML.',
    scannedAt: new Date().toISOString(),
    durationMs: 0,
  };
}

/* --------------------------------------------------------------- diffing */

/** What changed between two scans - this is the regression signal. */
export function diffModels(oldModel, newModel) {
  if (!oldModel) return null;
  const keyOf = (f) => f.key;
  const oldFields = new Map((oldModel.fields || []).map((f) => [keyOf(f), f]));
  const newFields = new Map((newModel.fields || []).map((f) => [keyOf(f), f]));

  const added = [...newFields.keys()].filter((k) => !oldFields.has(k));
  const removed = [...oldFields.keys()].filter((k) => !newFields.has(k));
  const changed = [];
  for (const [k, nf] of newFields) {
    const of = oldFields.get(k);
    if (!of) continue;
    const deltas = [];
    for (const attr of ['type', 'required', 'maxlength', 'minlength', 'min', 'max', 'pattern', 'disabled', 'label']) {
      if (String(of[attr]) !== String(nf[attr])) {
        deltas.push({ attr, from: of[attr], to: nf[attr] });
      }
    }
    if (deltas.length) changed.push({ key: k, deltas });
  }

  const oldBtn = new Set((oldModel.buttons || []).map((b) => b.text));
  const newBtn = new Set((newModel.buttons || []).map((b) => b.text));

  return {
    fieldsAdded: added,
    fieldsRemoved: removed,
    fieldsChanged: changed,
    buttonsAdded: [...newBtn].filter((b) => !oldBtn.has(b)),
    buttonsRemoved: [...oldBtn].filter((b) => !newBtn.has(b)),
    titleChanged: oldModel.title !== newModel.title
      ? { from: oldModel.title, to: newModel.title } : null,
    clean: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}
