#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

import {
  ensureHttpUrl,
  sanitizeText,
  sanitizeUrl,
  slug,
  stableHash,
  timestampId,
  toPosix,
} from '../src/core.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserNames = ['chromium', 'chrome', 'msedge', 'firefox', 'webkit'];
const playwrightBrowserNames = ['chromium', 'firefox', 'webkit'];
const themeNames = ['light', 'dark', 'no-preference'];
const defaultMaskSelectors = [
  "input[type='password']",
  "input[autocomplete='current-password']",
  "input[autocomplete='new-password']",
  "input[autocomplete='one-time-code']",
  "input[autocomplete='cc-number']",
  "input[autocomplete='cc-csc']",
  '[data-sensitive]',
  '[data-private]',
  '[data-pii]',
  '[data-uiux-mask]',
];
const booleanFlags = new Set([
  'allow-partial', 'fail-on-fix', 'headed', 'help', 'insecure', 'overwrite',
  'preflight-only', 'pretty', 'screenshots',
]);
const valueFlags = new Set([
  'browser', 'browsers', 'header', 'locale', 'mask', 'min-font', 'out',
  'preflight-timeout', 'settle', 'storage-state', 'theme', 'themes', 'timeout',
  'timezone', 'url', 'viewport', 'viewports',
]);

const criticalViewports = [
  { name: 'mobile-320', width: 320, height: 568, hasTouch: true },
  { name: 'mobile-390', width: 390, height: 844, hasTouch: true },
  { name: 'mobile-landscape-844', width: 844, height: 390, hasTouch: true },
  { name: 'tablet-768', width: 768, height: 1024, hasTouch: true },
  { name: 'tablet-landscape-1024', width: 1024, height: 768, hasTouch: true },
  { name: 'windows-1280', width: 1280, height: 720, hasTouch: false },
  { name: 'windows-1366', width: 1366, height: 768, hasTouch: false },
  { name: 'windows-1536', width: 1536, height: 864, hasTouch: false },
  { name: 'windows-1920', width: 1920, height: 1080, hasTouch: false },
];

const browserDefinitions = {
  chromium: { type: chromium, engine: 'chromium' },
  chrome: { type: chromium, engine: 'chromium', channel: 'chrome' },
  msedge: { type: chromium, engine: 'chromium', channel: 'msedge' },
  firefox: { type: firefox, engine: 'firefox' },
  webkit: { type: webkit, engine: 'webkit' },
};

const progress = (message) => process.stderr.write(`${message}\n`);
const print = (value, pretty = false) => process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
const oneOrMany = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];

function addFlag(flags, key, value) {
  flags[key] = key in flags ? [...oneOrMany(flags[key]), value] : value;
}

function parseArguments(tokens) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const equalsAt = token.indexOf('=');
    const key = token.slice(2, equalsAt > -1 ? equalsAt : undefined);
    if (!booleanFlags.has(key) && !valueFlags.has(key)) throw new Error(`Unknown option --${key}.`);
    if (booleanFlags.has(key)) {
      if (equalsAt > -1) throw new Error(`--${key} does not accept a value.`);
      addFlag(flags, key, true);
      continue;
    }
    const value = equalsAt > -1 ? token.slice(equalsAt + 1) : tokens[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value.`);
    addFlag(flags, key, value);
  }
  return { flags, positional };
}

function numberOption(flags, name, fallback, minimum) {
  if (!(name in flags)) return fallback;
  const value = Number(oneOrMany(flags[name]).at(-1));
  if (!Number.isFinite(value) || value < minimum) throw new Error(`--${name} must be at least ${minimum}.`);
  return value;
}

function selections(values) {
  return oneOrMany(values).flatMap((value) => String(value).split(','))
    .map((value) => value.trim()).filter(Boolean);
}

function selectedBrowsers(flags) {
  const requested = selections([...oneOrMany(flags.browser), ...oneOrMany(flags.browsers)]);
  const expanded = (requested.length ? requested : playwrightBrowserNames)
    .flatMap((name) => ['playwright', 'engines'].includes(name.toLowerCase())
      ? playwrightBrowserNames
      : name.toLowerCase() === 'all' ? browserNames : [name.toLowerCase()]);
  const unique = [...new Set(expanded)];
  const unknown = unique.filter((name) => !browserNames.includes(name));
  if (unknown.length) throw new Error(`Unknown browser ${unknown.join(', ')}. Use playwright, ${browserNames.join(', ')}, or all.`);
  return unique;
}

function selectedViewports(flags) {
  const requested = selections([...oneOrMany(flags.viewport), ...oneOrMany(flags.viewports)]);
  if (!requested.length || (requested.length === 1 && requested[0].toLowerCase() === 'critical')) {
    return criticalViewports.map((item) => ({ ...item }));
  }
  const profiles = requested.map((item) => {
    const named = criticalViewports.find((profile) => profile.name.toLowerCase() === item.toLowerCase());
    if (named) return { ...named };
    const match = item.match(/^(?:([a-z0-9][a-z0-9-]*)=)?(\d{3,4})x(\d{3,4})$/i);
    if (!match) throw new Error(`Invalid viewport "${item}". Use a critical profile, WIDTHxHEIGHT, or NAME=WIDTHxHEIGHT.`);
    const width = Number(match[2]);
    const height = Number(match[3]);
    if (width < 240 || height < 240) throw new Error(`Viewport ${item} must be at least 240x240.`);
    return {
      name: match[1] || `custom-${width}x${height}`,
      width,
      height,
      hasTouch: width < 768,
    };
  });
  const names = new Set();
  for (const profile of profiles) {
    if (names.has(profile.name)) throw new Error(`Duplicate viewport name ${profile.name}.`);
    names.add(profile.name);
  }
  return profiles;
}

function selectedThemes(flags) {
  const requested = selections([...oneOrMany(flags.theme), ...oneOrMany(flags.themes)]);
  const themes = requested.length ? requested.map((theme) => theme.toLowerCase()) : ['light', 'dark'];
  const unknown = themes.filter((theme) => !themeNames.includes(theme));
  if (unknown.length) throw new Error(`Unknown theme ${unknown.join(', ')}. Use ${themeNames.join(', ')}.`);
  return [...new Set(themes)];
}

function parseHeaders(values) {
  const headers = {};
  for (const item of oneOrMany(values)) {
    const splitAt = String(item).indexOf(':');
    if (splitAt < 1) throw new Error(`Invalid --header value "${item}". Use "Name: value".`);
    const name = String(item).slice(0, splitAt).trim();
    const value = String(item).slice(splitAt + 1).trim();
    if (!name) throw new Error('A request header name cannot be empty.');
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new Error(`Invalid request header name: ${name}`);
    }
    if (/[\r\n]/.test(value)) throw new Error(`Request header ${name} contains an invalid line break.`);
    headers[name.toLowerCase()] = value;
  }
  return headers;
}

function selectedStorageState(flags) {
  const supplied = oneOrMany(flags['storage-state']).at(-1);
  if (!supplied) return null;
  const file = path.resolve(String(supplied));
  if (!fs.existsSync(file)) throw new Error(`Storage-state file does not exist: ${file}`);
  return file;
}

function selectedUrls(flags, positional) {
  const values = [...positional, ...oneOrMany(flags.url)].map((value) => ensureHttpUrl(String(value)));
  return [...new Set(values)];
}

function helpDocument() {
  return {
    ok: true,
    name: 'Standalone UI/UX browser matrix',
    usage: 'node scripts/run-browser-matrix.mjs [URL ...] [--url URL] [options]',
    defaults: {
      browsers: playwrightBrowserNames,
      themes: ['light', 'dark'],
      viewports: criticalViewports,
      screenshots: false,
    },
    options: {
      '--url URL': 'Repeatable; positional URLs are also accepted.',
      '--browsers LIST': `playwright, comma-separated ${browserNames.join('|')}, or all.`,
      '--themes LIST': `Comma-separated ${themeNames.join('|')}.`,
      '--viewports LIST': 'Critical profile names, WIDTHxHEIGHT, or NAME=WIDTHxHEIGHT.',
      '--preflight-only': 'Check URL and browser readiness without opening pages.',
      '--allow-partial': 'Run reachable combinations while retaining an overall BLOCKED status.',
      '--screenshots': 'Save full-page PNG evidence.',
      '--mask SELECTOR': 'Repeatable CSS selector masked in screenshots.',
      '--storage-state FILE': 'Playwright authentication state; sensitive values are not reported.',
      '--header "Name: value"': 'Repeatable request header; values are never reported.',
      '--locale LOCALE': 'Browser locale; default en-IN.',
      '--timezone ZONE': 'Browser timezone; default Asia/Kolkata.',
      '--out DIRECTORY': 'Defaults to output/YYYY-MM-DD/browser-matrix/<timestamp>.',
      '--timeout MS': 'Navigation timeout; default 45000.',
      '--preflight-timeout MS': 'Connectivity timeout; default 8000.',
      '--settle MS': 'Post-navigation render wait; default 800.',
      '--min-font PX': 'Small-text review threshold; default 12.',
      '--headed': 'Show browsers while running.',
      '--insecure': 'Accept invalid TLS certificates.',
      '--overwrite': 'Replace only matrix files with the same names.',
      '--fail-on-fix': 'Exit 1 when objective checks find FIX items.',
      '--pretty': 'Indent JSON written to stdout.',
    },
    statusMeaning: {
      PASS: 'All collected checks passed.',
      REVIEW: 'A raw heuristic needs human confirmation; it is not an automatic failure.',
      FIX: 'An objective rendered defect was measured.',
      ERROR: 'The page could not be audited reliably.',
      BLOCKED: 'Connectivity or browser availability prevented execution.',
    },
  };
}

function requestOnce(url, { timeoutMs, insecure, headers = {} }, redirects = 0) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const request = transport.request(parsed, {
      method: 'GET',
      agent: false,
      rejectUnauthorized: !insecure,
      headers: {
        Accept: 'text/html,*/*;q=0.1',
        Range: 'bytes=0-0',
        'User-Agent': 'uiux-browser-matrix-preflight/1.0',
        ...headers,
      },
    }, (response) => {
      const location = response.headers.location;
      const status = response.statusCode || 0;
      response.destroy();
      if (location && status >= 300 && status < 400 && redirects < 5) {
        const redirected = new URL(location, parsed);
        const redirectedHeaders = redirected.origin === parsed.origin ? headers : {};
        finish(requestOnce(redirected.href, { timeoutMs, insecure, headers: redirectedHeaders }, redirects + 1));
        return;
      }
      finish({ status: 'READY', httpStatus: status, finalUrl: sanitizeUrl(parsed.href), redirects });
    });
    timer = setTimeout(() => request.destroy(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    request.on('error', (error) => finish({
      status: 'BLOCKED',
      httpStatus: null,
      finalUrl: sanitizeUrl(url),
      error: sanitizeRuntimeText(error.message),
    }));
    request.end();
  });
}

function channelCandidates(name) {
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const relative = name === 'chrome'
      ? path.join('Google', 'Chrome', 'Application', 'chrome.exe')
      : path.join('Microsoft', 'Edge', 'Application', 'msedge.exe');
    return roots.map((root) => path.join(root, relative));
  }
  if (process.platform === 'darwin') {
    return name === 'chrome'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  }
  return name === 'chrome'
    ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
}

function browserPreflight(name) {
  const definition = browserDefinitions[name];
  try {
    const candidates = definition.channel ? channelCandidates(definition.channel) : [definition.type.executablePath()];
    const executable = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!executable) {
      return {
        browser: name,
        engine: definition.engine,
        status: 'BLOCKED',
        executable: null,
        error: definition.channel
          ? `${name} channel is not installed.`
          : `${name} browser revision required by this Playwright package is not installed.`,
      };
    }
    return { browser: name, engine: definition.engine, status: 'READY', executable };
  } catch (error) {
    return {
      browser: name,
      engine: definition.engine,
      status: 'BLOCKED',
      executable: null,
      error: sanitizeText(error.message),
    };
  }
}

async function preflight(urls, browsers, options) {
  const [urlResults, browserResults] = await Promise.all([
    Promise.all(urls.map(async (url) => ({ url: sanitizeUrl(url), ...await requestOnce(url, options) }))),
    Promise.resolve(browsers.map(browserPreflight)),
  ]);
  const blocked = urlResults.filter((item) => item.status === 'BLOCKED').length
    + browserResults.filter((item) => item.status === 'BLOCKED').length;
  return { status: blocked ? 'BLOCKED' : 'READY', urls: urlResults, browsers: browserResults, blocked };
}

async function warmPage(page, settleMs) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  }).catch(() => {});
  await page.waitForTimeout(settleMs);
  await page.evaluate(async () => {
    const root = document.scrollingElement || document.documentElement;
    const distance = Math.max(innerHeight * 0.8, 300);
    const limit = Math.min(30, Math.ceil(root.scrollHeight / distance));
    for (let step = 0; step < limit; step += 1) {
      scrollTo(0, Math.min(root.scrollHeight, (step + 1) * distance));
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(Math.min(settleMs, 500));
}

async function collectEvidence(page, minimumFontPx) {
  return page.evaluate((minFont) => {
    const round = (value) => Math.round(value * 100) / 100;
    const box = (rect) => ({
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      left: round(rect.left),
      right: round(rect.right),
      top: round(rect.top),
      bottom: round(rect.bottom),
    });
    const short = (value, limit = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    const safeUrl = (value) => {
      try {
        const parsed = new URL(String(value || ''), location.href);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.href;
      } catch { return '[unavailable]'; }
    };
    const sensitiveSelector = [
      "input[type='password']", "input[autocomplete='current-password']",
      "input[autocomplete='new-password']", "input[autocomplete='one-time-code']",
      "input[autocomplete='cc-number']", "input[autocomplete='cc-csc']",
      '[data-sensitive]', '[data-private]', '[data-pii]', '[data-uiux-mask]',
    ].join(',');
    const sensitive = (element) => Boolean(element.closest(sensitiveSelector));
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const selector = (element) => {
      if (sensitive(element)) return '[sensitive-element]';
      if (element.id) return '#' + CSS.escape(element.id);
      const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
      if (testId) return '[data-testid="' + String(testId).replaceAll('"', '\\"') + '"]';
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const siblings = current.parentElement
          ? [...current.parentElement.children].filter((item) => item.tagName === current.tagName)
          : [];
        parts.unshift(siblings.length > 1 ? tag + ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : tag);
        current = current.parentElement;
      }
      return parts.join(' > ') || element.tagName.toLowerCase();
    };
    const accessibleName = (element) => sensitive(element) ? '[REDACTED]' : short(
      element.getAttribute('aria-label') || element.getAttribute('alt')
      || element.getAttribute('title') || element.getAttribute('placeholder') || element.innerText,
    );
    const directText = (element) => sensitive(element)
      ? '[REDACTED]'
      : short([...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join(' '));
    const hasHorizontalScroller = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = getComputedStyle(current);
        if (['auto', 'scroll'].includes(style.overflowX) && current.scrollWidth > current.clientWidth + 1) return true;
        current = current.parentElement;
      }
      return false;
    };

    const all = [...document.querySelectorAll('body *')];
    const visibleElements = all.filter(visible);
    const interactiveSelector = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])';
    const allOffscreenInteractive = [...document.querySelectorAll(interactiveSelector)]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => (rect.left < -1 || rect.right > innerWidth + 1) && !hasHorizontalScroller(element))
      .map(({ element, rect }) => ({
        selector: selector(element),
        name: accessibleName(element),
        box: box(rect),
      }));
    const offscreenInteractive = allOffscreenInteractive.slice(0, 30);

    const overlays = visibleElements.filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return ['fixed', 'sticky'].includes(style.position) && style.bottom !== 'auto'
        && rect.bottom >= innerHeight - 2 && rect.top < innerHeight - 1;
    });
    const overlapPairs = [];
    for (const overlay of overlays) {
      const overlayRect = overlay.getBoundingClientRect();
      const candidates = visibleElements.filter((element) => {
        if (element === overlay || overlay.contains(element) || element.contains(overlay)) return false;
        const style = getComputedStyle(element);
        if (['fixed', 'sticky'].includes(style.position)) return false;
        const meaningful = element.matches(interactiveSelector + ',img,h1,h2,h3,h4,p,li,label') || directText(element);
        if (!meaningful) return false;
        const rect = element.getBoundingClientRect();
        return rect.right > overlayRect.left && rect.left < overlayRect.right
          && rect.bottom > overlayRect.top && rect.top < overlayRect.bottom;
      });
      for (const covered of candidates.slice(0, 8)) {
        overlapPairs.push({
          overlay: selector(overlay),
          overlayName: accessibleName(overlay),
          covered: selector(covered),
          coveredName: accessibleName(covered) || directText(covered),
          overlayBox: box(overlayRect),
          coveredBox: box(covered.getBoundingClientRect()),
        });
      }
    }

    const textElements = visibleElements.filter((element) => {
      if (directText(element)) return true;
      return element.matches('input,select,textarea,button') && accessibleName(element);
    });
    const allSmallText = textElements.map((element) => ({
      element,
      size: Number.parseFloat(getComputedStyle(element).fontSize),
    })).filter((item) => Number.isFinite(item.size) && item.size < minFont)
      .map(({ element, size }) => ({
        selector: selector(element),
        text: directText(element) || accessibleName(element),
        fontSize: round(size),
      }));
    const smallText = allSmallText.slice(0, 30);
    const allIncompleteImages = [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => ({
        selector: selector(image),
        alt: sensitive(image) ? '[REDACTED]' : short(image.alt),
        src: sensitive(image) ? '[REDACTED]' : safeUrl(image.currentSrc || image.src),
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }));
    const incompleteImages = allIncompleteImages.slice(0, 30);
    const root = document.documentElement;
    const bodyText = short(document.body?.innerText, 100000);
    const scrollWidth = Math.max(root.scrollWidth, document.body?.scrollWidth || 0);
    return {
      title: document.title,
      finalUrl: location.href,
      content: {
        textCharacters: bodyText.length,
        visibleElements: visibleElements.length,
        interactiveElements: [...document.querySelectorAll(interactiveSelector)].filter(visible).length,
        images: document.images.length,
      },
      document: {
        clientWidth: root.clientWidth,
        scrollWidth,
        horizontalOverflow: Math.max(0, scrollWidth - root.clientWidth),
      },
      offscreenInteractive,
      offscreenInteractiveCount: allOffscreenInteractive.length,
      bottomOverlaps: overlapPairs.slice(0, 30),
      bottomOverlapCount: overlapPairs.length,
      typography: {
        reviewThresholdPx: minFont,
        inspectedTextElements: textElements.length,
        minimumObservedPx: textElements.length
          ? round(Math.min(...textElements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
            .filter(Number.isFinite)))
          : null,
        smallText,
        smallTextCount: allSmallText.length,
      },
      incompleteImages,
      incompleteImageCount: allIncompleteImages.length,
      fonts: document.fonts ? [...document.fonts].map((font) => ({
        family: font.family,
        style: font.style,
        weight: font.weight,
        status: font.status,
      })) : [],
    };
  }, minimumFontPx);
}

function check(status, evidence, expected, confidence = 'objective') {
  return { status, confidence, expected, ...evidence };
}

const SECRET_TEXT = /\b(authorization|api[-_ ]?key|token|secret|password|passwd|session|jwt|credential)\b(\s*[:=]\s*)([^\s,;]+)/gi;

function sanitizeRuntimeText(value) {
  return sanitizeText(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(SECRET_TEXT, '$1$2[REDACTED]');
}

function sanitizeEvidence(value) {
  if (typeof value === 'string') return sanitizeRuntimeText(value);
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEvidence(item)]));
  }
  return value;
}

function runtimeEvidence(pageErrors, consoleErrors, networkErrors) {
  const unique = (values) => [...new Set(values.map(sanitizeRuntimeText))].slice(0, 30);
  const evidence = {
    pageErrors: unique(pageErrors),
    consoleErrors: unique(consoleErrors),
    networkErrors: unique(networkErrors),
  };
  evidence.total = evidence.pageErrors.length + evidence.consoleErrors.length + evidence.networkErrors.length;
  return evidence;
}

function assessCapture(evidence, httpStatus, runtime) {
  const validContent = evidence.content.textCharacters >= 20 && evidence.content.visibleElements >= 3
    && !/^(chrome-error:\/\/|about:neterror)/.test(evidence.finalUrl);
  const httpValid = Number.isInteger(httpStatus) && httpStatus >= 200 && httpStatus < 400;
  const runtimeStatus = runtime.pageErrors.length ? 'FIX'
    : runtime.consoleErrors.length || runtime.networkErrors.length ? 'REVIEW' : 'PASS';
  const checks = {
    http: check(httpValid ? 'PASS' : 'ERROR', { actual: httpStatus }, 'Main document returns HTTP 200-399.'),
    content: check(
      validContent ? 'PASS' : 'ERROR',
      evidence.content,
      'Rendered page has meaningful visible content.',
    ),
    documentOverflow: check(
      evidence.document.horizontalOverflow <= 1 ? 'PASS' : 'FIX',
      evidence.document,
      'Horizontal document overflow is at most 1px.',
    ),
    offscreenInteractive: check(
      evidence.offscreenInteractiveCount ? 'REVIEW' : 'PASS',
      { count: evidence.offscreenInteractiveCount, samples: evidence.offscreenInteractive },
      'No visible required control extends outside the viewport unless it belongs to an operable carousel or scroller.',
      'heuristic',
    ),
    bottomOverlap: check(
      evidence.bottomOverlapCount ? 'REVIEW' : 'PASS',
      { count: evidence.bottomOverlapCount, samples: evidence.bottomOverlaps },
      'No fixed or bottom-sticky surface covers meaningful content or controls.',
      'heuristic',
    ),
    minimumFont: check(
      evidence.typography.smallTextCount ? 'REVIEW' : 'PASS',
      evidence.typography,
      `Rendered text below ${evidence.typography.reviewThresholdPx}px is reviewed in its visual context.`,
      'heuristic',
    ),
    incompleteImages: check(
      evidence.incompleteImageCount ? 'REVIEW' : 'PASS',
      {
        count: evidence.incompleteImageCount,
        samples: evidence.incompleteImages.map((item) => ({ ...item, src: sanitizeUrl(item.src) })),
      },
      'All intended image elements complete after an automated scroll warm-up; lazy or intentionally deferred images require review.',
      'heuristic',
    ),
    runtimeErrors: check(
      runtimeStatus,
      runtime,
      'No page exceptions, console errors, failed requests, or HTTP 4xx/5xx assets are recorded.',
      runtime.pageErrors.length ? 'objective' : 'heuristic',
    ),
  };
  const statuses = Object.values(checks).map((item) => item.status);
  const status = statuses.includes('ERROR') ? 'ERROR'
    : statuses.includes('FIX') ? 'FIX'
      : statuses.includes('REVIEW') ? 'REVIEW' : 'PASS';
  return { status, checks };
}

function pageId(url) {
  const parsed = new URL(url);
  return `${slug(`${parsed.hostname}-${parsed.pathname}`)}-${stableHash(url, 6)}`;
}

async function captureProfile({
  browser,
  browserName,
  browserVersion,
  url,
  viewport,
  theme,
  options,
  outputDirectory,
}) {
  let context;
  let page;
  const pageErrors = [];
  const consoleErrors = [];
  const networkErrors = [];
  const base = {
    url: sanitizeUrl(url),
    browser: browserName,
    browserVersion,
    viewport,
    theme,
    status: 'ERROR',
    httpStatus: null,
    finalUrl: null,
    title: null,
    screenshot: null,
  };
  try {
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.hasTouch,
      locale: options.locale,
      timezoneId: options.timezoneId,
      colorScheme: theme,
      reducedMotion: 'reduce',
      ignoreHTTPSErrors: options.insecure,
      ...(Object.keys(options.headers).length ? { serviceWorkers: 'block' } : {}),
      ...(options.storageState ? { storageState: options.storageState } : {}),
    });
    if (Object.keys(options.headers).length) {
      const allowedOrigin = new URL(url).origin;
      const customHeaderNames = new Set(Object.keys(options.headers));
      await context.route('**/*', async (route) => {
        const request = route.request();
        const requestHeaders = { ...request.headers() };
        let sameOrigin = false;
        try { sameOrigin = new URL(request.url()).origin === allowedOrigin; } catch { /* strip below */ }
        for (const name of customHeaderNames) delete requestHeaders[name];
        await route.continue({
          headers: sameOrigin ? { ...requestHeaders, ...options.headers } : requestHeaders,
        });
      });
    }
    page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 500)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
    });
    page.on('requestfailed', (request) => {
      if (['document', 'stylesheet', 'script', 'font', 'image'].includes(request.resourceType())) {
        networkErrors.push(`${request.resourceType()} ${request.failure()?.errorText || 'failed'} ${sanitizeUrl(request.url())}`);
      }
    });
    page.on('response', (response) => {
      const resourceType = response.request().resourceType();
      if (response.status() >= 400 && ['document', 'stylesheet', 'script', 'font', 'image'].includes(resourceType)) {
        networkErrors.push(`${resourceType} HTTP ${response.status()} ${sanitizeUrl(response.url())}`);
      }
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await warmPage(page, options.settleMs);
    const evidence = sanitizeEvidence(await collectEvidence(page, options.minimumFontPx));
    const runtime = runtimeEvidence(pageErrors, consoleErrors, networkErrors);
    const assessment = assessCapture(evidence, response?.status() ?? null, runtime);
    let screenshot = null;
    if (options.screenshots) {
      const relative = path.join(
        'screenshots', browserName, pageId(url), slug(theme), `${slug(viewport.name)}.png`,
      );
      const absolute = path.join(outputDirectory, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      await page.screenshot({
        path: absolute,
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        mask: options.maskSelectors.map((selector) => page.locator(selector)),
        maskColor: '#000000',
      });
      screenshot = toPosix(relative);
    }
    return {
      ...base,
      status: assessment.status,
      httpStatus: response?.status() ?? null,
      finalUrl: sanitizeUrl(evidence.finalUrl),
      title: sanitizeRuntimeText(evidence.title),
      metrics: { ...evidence.document, ...evidence.content },
      fonts: evidence.fonts,
      checks: assessment.checks,
      screenshot,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      finalUrl: sanitizeUrl(page?.url() || url),
      checks: null,
      runtime: runtimeEvidence(pageErrors, consoleErrors, networkErrors),
      error: sanitizeText(error.message),
    };
  } finally {
    await context?.close().catch(() => {});
  }
}

function errorProfiles(browserName, urls, viewports, themes, message) {
  return urls.flatMap((url) => viewports.flatMap((viewport) => themes.map((theme) => ({
    url: sanitizeUrl(url),
    browser: browserName,
    browserVersion: null,
    viewport,
    theme,
    status: 'ERROR',
    httpStatus: null,
    finalUrl: null,
    title: null,
    metrics: null,
    fonts: [],
    checks: null,
    screenshot: null,
    error: sanitizeRuntimeText(message),
  }))));
}

async function runMatrix(urls, browsers, viewports, themes, options, outputDirectory) {
  const results = [];
  for (const browserName of browsers) {
    const definition = browserDefinitions[browserName];
    progress(`Launching ${browserName}...`);
    let browser;
    try {
      browser = await definition.type.launch({
        headless: !options.headed,
        ...(definition.channel ? { channel: definition.channel } : {}),
      });
      const browserVersion = browser.version();
      for (const url of urls) {
        for (const viewport of viewports) {
          for (const theme of themes) {
            progress(`Checking ${browserName} ${viewport.name} ${theme}: ${sanitizeUrl(url)}`);
            results.push(await captureProfile({
              browser,
              browserName,
              browserVersion,
              url,
              viewport,
              theme,
              options,
              outputDirectory,
            }));
          }
        }
      }
    } catch (error) {
      results.push(...errorProfiles(browserName, urls, viewports, themes, error.message));
    } finally {
      await browser?.close().catch(() => {});
    }
  }
  return results;
}

function summarize(results, blocked = 0) {
  const counts = { PASS: 0, REVIEW: 0, FIX: 0, ERROR: 0, BLOCKED: blocked };
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  const status = counts.BLOCKED ? 'BLOCKED'
    : counts.ERROR ? 'ERROR'
      : counts.FIX ? 'FIX'
        : counts.REVIEW ? 'REVIEW'
          : counts.PASS ? 'PASS' : 'ERROR';
  return { status, counts, totalProfiles: results.length };
}

function compatibilityValue(result, key) {
  const values = {
    status: result.status,
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    horizontalOverflowPx: result.checks?.documentOverflow?.horizontalOverflow ?? null,
    offscreenInteractive: result.checks?.offscreenInteractive?.count ?? null,
    bottomOverlaps: result.checks?.bottomOverlap?.count ?? null,
    smallText: result.checks?.minimumFont?.smallTextCount ?? null,
    incompleteImages: result.checks?.incompleteImages?.count ?? null,
    runtimeErrors: result.checks?.runtimeErrors?.total ?? null,
  };
  return values[key];
}

function summarizeCompatibility(results) {
  const grouped = new Map();
  for (const result of results) {
    const key = JSON.stringify([result.url, result.viewport?.name, result.theme]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(result);
  }
  const dimensions = [
    'status', 'httpStatus', 'finalUrl', 'horizontalOverflowPx', 'offscreenInteractive',
    'bottomOverlaps', 'smallText', 'incompleteImages', 'runtimeErrors',
  ];
  const differences = [];
  let groupsCompared = 0;
  let divergentGroups = 0;
  for (const group of grouped.values()) {
    if (new Set(group.map((item) => item.browser)).size < 2) continue;
    groupsCompared += 1;
    const divergentDimensions = dimensions.filter((dimension) => (
      new Set(group.map((item) => JSON.stringify(compatibilityValue(item, dimension)))).size > 1
    ));
    if (!divergentDimensions.length) continue;
    divergentGroups += 1;
    differences.push({
      url: group[0].url,
      viewport: group[0].viewport,
      theme: group[0].theme,
      dimensions: Object.fromEntries(divergentDimensions.map((dimension) => [
        dimension,
        Object.fromEntries(group.map((item) => [item.browser, compatibilityValue(item, dimension)])),
      ])),
    });
  }
  return {
    status: !groupsCompared ? 'INSUFFICIENT' : divergentGroups ? 'REVIEW' : 'CONSISTENT',
    groupsCompared,
    consistentGroups: groupsCompared - divergentGroups,
    divergentGroups,
    differences: differences.slice(0, 50),
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRows(report) {
  const headers = [
    'url', 'browser', 'browserVersion', 'viewport', 'theme', 'width', 'height', 'status',
    'httpStatus', 'finalUrl', 'title', 'horizontalOverflowPx', 'offscreenInteractive',
    'bottomOverlaps', 'minimumObservedFontPx', 'smallText', 'incompleteImages',
    'runtimeErrors', 'screenshot', 'error',
  ];
  const rows = report.results.map((result) => [
    result.url,
    result.browser,
    result.browserVersion,
    result.viewport?.name,
    result.theme,
    result.viewport?.width,
    result.viewport?.height,
    result.status,
    result.httpStatus,
    result.finalUrl,
    result.title,
    result.checks?.documentOverflow?.horizontalOverflow,
    result.checks?.offscreenInteractive?.count,
    result.checks?.bottomOverlap?.count,
    result.checks?.minimumFont?.minimumObservedPx,
    result.checks?.minimumFont?.smallTextCount,
    result.checks?.incompleteImages?.count,
    result.checks?.runtimeErrors?.total,
    result.screenshot,
    result.error,
  ]);
  for (const item of report.preflight.urls.filter((entry) => entry.status === 'BLOCKED')) {
    rows.push([
      item.url, '', '', 'preflight', '', '', '', 'BLOCKED', item.httpStatus, item.finalUrl,
      '', '', '', '', '', '', '', '', '', item.error,
    ]);
  }
  for (const item of report.preflight.browsers.filter((entry) => entry.status === 'BLOCKED')) {
    rows.push([
      '', item.browser, '', 'preflight', '', '', '', 'BLOCKED', '', '', '', '', '', '',
      '', '', '', '', '', item.error,
    ]);
  }
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function artifactDirectory(flags, startedAt) {
  const supplied = oneOrMany(flags.out).at(-1);
  const localDate = new Date(startedAt.getTime() - startedAt.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  return supplied
    ? path.resolve(String(supplied))
    : path.join(packageRoot, 'output', localDate, 'browser-matrix', timestampId(startedAt));
}

function artifactFiles(directory) {
  return {
    json: path.join(directory, 'matrix.json'),
    csv: path.join(directory, 'matrix.csv'),
  };
}

function assertFreshOutput(directory, overwrite) {
  const files = artifactFiles(directory);
  if (!overwrite && (fs.existsSync(files.json) || fs.existsSync(files.csv))) {
    throw new Error(`Matrix output already exists in ${directory}. Use --overwrite or a different --out directory.`);
  }
}

function writeArtifacts(report, directory) {
  const files = artifactFiles(directory);
  fs.mkdirSync(directory, { recursive: true });
  report.artifacts = {
    ...files,
    screenshots: report.options.screenshots ? path.join(directory, 'screenshots') : null,
  };
  fs.writeFileSync(files.json, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(files.csv, csvRows(report), 'utf8');
  return report.artifacts;
}

let pretty = false;
try {
  const parsed = parseArguments(process.argv.slice(2));
  const { flags, positional } = parsed;
  pretty = !!flags.pretty;
  if (flags.help) {
    print(helpDocument(), pretty);
  } else {
    const urls = selectedUrls(flags, positional);
    if (!urls.length) throw new Error('Provide at least one positional URL or repeat --url URL.');
    const browsers = selectedBrowsers(flags);
    const viewports = selectedViewports(flags);
    const themes = selectedThemes(flags);
    const headers = parseHeaders(flags.header);
    const storageState = selectedStorageState(flags);
    const options = {
      allowPartial: !!flags['allow-partial'],
      headed: !!flags.headed,
      insecure: !!flags.insecure,
      screenshots: !!flags.screenshots,
      headers,
      storageState,
      locale: String(oneOrMany(flags.locale).at(-1) || 'en-IN'),
      timezoneId: String(oneOrMany(flags.timezone).at(-1) || 'Asia/Kolkata'),
      maskSelectors: [...new Set([...defaultMaskSelectors, ...oneOrMany(flags.mask).map(String)])],
      timeoutMs: numberOption(flags, 'timeout', 45000, 1000),
      preflightTimeoutMs: numberOption(flags, 'preflight-timeout', 8000, 500),
      settleMs: numberOption(flags, 'settle', 800, 0),
      minimumFontPx: numberOption(flags, 'min-font', 12, 1),
    };
    progress(`Preflighting ${urls.length} URL(s) and ${browsers.length} browser(s)...`);
    const readiness = await preflight(urls, browsers, {
      timeoutMs: options.preflightTimeoutMs,
      insecure: options.insecure,
      headers: options.headers,
    });
    if (flags['preflight-only']) {
      const output = {
        ok: readiness.status === 'READY',
        executionStatus: 'preflight-only',
        status: readiness.status,
        requested: { urls: urls.map(sanitizeUrl), browsers, viewports, themes },
        preflight: readiness,
      };
      print(output, pretty);
      if (!output.ok) process.exitCode = 1;
    } else {
      const startedAt = new Date();
      const outputDirectory = artifactDirectory(flags, startedAt);
      assertFreshOutput(outputDirectory, !!flags.overwrite);
      const readyUrls = new Set(readiness.urls
        .filter((item) => item.status === 'READY').map((item) => item.url));
      const readyBrowsers = new Set(readiness.browsers
        .filter((item) => item.status === 'READY').map((item) => item.browser));
      const runnableUrls = options.allowPartial
        ? urls.filter((url) => readyUrls.has(sanitizeUrl(url)))
        : urls;
      const runnableBrowsers = options.allowPartial
        ? browsers.filter((name) => readyBrowsers.has(name))
        : browsers;
      let results = [];
      if (readiness.status === 'READY' || options.allowPartial) {
        results = await runMatrix(runnableUrls, runnableBrowsers, viewports, themes, options, outputDirectory);
      } else {
        progress('Matrix blocked by preflight; no browser pages were opened.');
      }
      const completedAt = new Date();
      const summary = summarize(results, readiness.blocked);
      const compatibility = summarizeCompatibility(results);
      if (compatibility.status === 'REVIEW' && summary.status === 'PASS') summary.status = 'REVIEW';
      const report = {
        kind: 'uiux-browser-matrix',
        schemaVersion: '1.1',
        executionStatus: readiness.status === 'BLOCKED'
          ? options.allowPartial ? 'partial' : 'blocked'
          : 'completed',
        status: summary.status,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt - startedAt,
        requested: { urls: urls.map(sanitizeUrl), browsers, viewports, themes },
        options: {
          screenshots: options.screenshots,
          maskedSelectorCount: options.maskSelectors.length,
          authenticatedState: Boolean(options.storageState),
          customHeaderCount: Object.keys(options.headers).length,
          locale: options.locale,
          timezoneId: options.timezoneId,
          minimumFontPx: options.minimumFontPx,
          timeoutMs: options.timeoutMs,
          settleMs: options.settleMs,
          allowPartial: options.allowPartial,
        },
        preflight: readiness,
        summary,
        compatibility,
        results,
        artifacts: null,
      };
      const artifacts = writeArtifacts(report, outputDirectory);
      const failed = ['BLOCKED', 'ERROR'].includes(summary.status)
        || (flags['fail-on-fix'] && summary.status === 'FIX');
      print({
        ok: !failed,
        executionStatus: report.executionStatus,
        status: summary.status,
        summary,
        compatibility,
        preflight: readiness,
        artifacts,
      }, pretty);
      if (failed) process.exitCode = 1;
    }
  }
} catch (error) {
  progress(`Browser matrix error: ${error.message}`);
  print({
    ok: false,
    executionStatus: 'failed',
    status: 'ERROR',
    error: { name: error.name || 'Error', message: sanitizeText(error.message) },
  }, pretty);
  process.exitCode = 1;
}
