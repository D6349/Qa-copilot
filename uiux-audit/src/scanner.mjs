import fs from 'node:fs';
import path from 'node:path';
import axe from 'axe-core';
import { chromium } from 'playwright';

import { sanitizeText, sanitizeUrl, stableHash, slug, toPosix } from './core.mjs';
import { executeFlowStep } from './flow.mjs';
import { collectSecurityEvidence, createSecurityTracker, recordSecurityRequest } from './security.mjs';

const ASSET_TYPES = new Set(['font', 'image', 'stylesheet']);

function mkdir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function relativeArtifact(artifactDir, file) {
  return toPosix(path.relative(artifactDir, file));
}

async function settlePage(page, config) {
  if (config.capture.disableMotion) {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
          scroll-behavior: auto !important;
          caret-color: transparent !important;
        }
      `,
    }).catch(() => {});
  }
  await page.evaluate(async () => {
    if (!document.fonts?.ready) return;
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }).catch(() => {});
  if (config.navigation.settleMs) await page.waitForTimeout(config.navigation.settleMs);
}

async function warmLazyContent(page, config) {
  if (!config.capture.warmLazyContent) return;
  await page.evaluate(async ({ delayMs, maxSteps }) => {
    const root = document.scrollingElement || document.documentElement;
    const startX = window.scrollX;
    const startY = window.scrollY;
    const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs));
    let steps = 0;
    let y = startY;
    while (steps < maxSteps) {
      const bottom = Math.max(0, root.scrollHeight - window.innerHeight);
      if (y >= bottom) break;
      y = Math.min(bottom, y + Math.max(240, Math.floor(window.innerHeight * 0.8)));
      window.scrollTo(startX, y);
      await pause();
      steps += 1;
    }
    window.scrollTo(startX, startY);
    await pause();
  }, {
    delayMs: config.capture.autoScrollDelayMs,
    maxSteps: config.capture.autoScrollMaxSteps,
  }).catch(() => {});
  if (config.navigation.settleMs) {
    await page.waitForTimeout(Math.min(config.navigation.settleMs, 1000));
  }
}

async function collectSnapshot(page, input) {
  return page.evaluate(({ viewport, ignoreSelectors, maxElements }) => {
    const rounded = (value, places = 2) => {
      const factor = 10 ** places;
      return Math.round((Number(value) || 0) * factor) / factor;
    };
    const px = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? rounded(parsed) : null;
    };
    const short = (value, length = 160) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
    const ignored = (element) => ignoreSelectors.some((selector) => {
      try { return element.matches(selector) || !!element.closest(selector); } catch { return false; }
    });
    const visible = (element, style, rect) => style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.visibility !== 'collapse'
      && Number.parseFloat(style.opacity || '1') > 0
      && rect.width > 0
      && rect.height > 0;
    const selectorFor = (element) => {
      if (!(element instanceof Element)) return '';
      const escape = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
      if (testId && element.hasAttribute('data-test') && !element.hasAttribute('data-testid')) {
        return '[data-test=' + escape(testId) + ']';
      }
      if (testId) return `[data-testid="${String(testId).replace(/"/g, '\\"')}"]`;
      if (element.id && document.querySelectorAll(`#${escape(element.id)}`).length === 1) return `#${escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && parts.length < 7) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((sibling) => sibling.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    };
    const ownText = (element) => short([...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' '));
    const accessibleName = (element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
        if (short(label)) return short(label);
      }
      const id = element.id;
      const explicitLabel = id ? document.querySelector(`label[for="${window.CSS?.escape ? window.CSS.escape(id) : id}"]`) : null;
      return short(element.getAttribute('aria-label')
        || explicitLabel?.innerText
        || element.getAttribute('alt')
        || element.getAttribute('title')
        || element.getAttribute('placeholder')
        || element.innerText);
    };
    const semanticName = (element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const value = short(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' '));
        if (value) return { name: value, source: 'aria-labelledby', visibleLabel: value };
      }
      const ariaLabel = short(element.getAttribute('aria-label'));
      if (ariaLabel) return { name: ariaLabel, source: 'aria-label', visibleLabel: '' };
      const id = element.id;
      const escapedId = id && window.CSS?.escape ? window.CSS.escape(id) : id;
      const explicitLabel = escapedId ? document.querySelector('label[for="' + escapedId + '"]') : null;
      const implicitLabel = element.closest('label');
      const label = short(explicitLabel?.innerText || implicitLabel?.innerText);
      if (label) return { name: label, source: explicitLabel ? 'label-for' : 'label-wrap', visibleLabel: label };
      const descendantLabel = short([
        ...element.querySelectorAll('img[alt], svg[aria-label], svg title'),
      ].map((child) => child.getAttribute('alt') || child.getAttribute('aria-label') || child.textContent || '').join(' '));
      if (descendantLabel) return { name: descendantLabel, source: 'descendant', visibleLabel: '' };
      if (element.hasAttribute('alt')) return { name: short(element.getAttribute('alt')), source: 'alt', visibleLabel: '' };
      const visibleText = short(element.innerText || (['button', 'submit', 'reset'].includes((element.getAttribute('type') || '').toLowerCase()) ? element.value : ''));
      if (visibleText) return { name: visibleText, source: 'content', visibleLabel: visibleText };
      const title = short(element.getAttribute('title'));
      if (title) return { name: title, source: 'title', visibleLabel: '' };
      const placeholder = short(element.getAttribute('placeholder'));
      if (placeholder) return { name: placeholder, source: 'placeholder', visibleLabel: '' };
      return { name: accessibleName(element), source: null, visibleLabel: '' };
    };
    const interactiveRoles = new Set([
      'button', 'checkbox', 'combobox', 'link', 'listbox', 'menu', 'menubar', 'menuitem',
      'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'scrollbar', 'searchbox',
      'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'tree', 'treegrid', 'treeitem',
    ]);
    const interactiveRole = (element) => {
      const explicit = element.getAttribute('role');
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === 'a' && element.hasAttribute('href')) return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'range') return 'slider';
        return 'textbox';
      }
      return '';
    };
    const styleLayers = (element) => {
      const layers = [];
      let current = element.parentElement;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const style = getComputedStyle(current);
        layers.push({ color: style.backgroundColor, image: style.backgroundImage });
        current = current.parentElement;
      }
      return layers;
    };
    const four = (style, prefix) => [
      px(style[`${prefix}Top`]),
      px(style[`${prefix}Right`]),
      px(style[`${prefix}Bottom`]),
      px(style[`${prefix}Left`]),
    ];
    const box = (rect) => ({
      x: rounded(rect.x), y: rounded(rect.y), width: rounded(rect.width), height: rounded(rect.height),
      top: rounded(rect.top), right: rounded(rect.right), bottom: rounded(rect.bottom), left: rounded(rect.left),
    });
    const increment = (map, value) => {
      if (value === null || value === undefined || value === '' || value === 'none' || value === 'normal') return;
      const key = typeof value === 'number' ? String(rounded(value)) : String(value).trim();
      map.set(key, (map.get(key) || 0) + 1);
    };
    const entries = (map) => [...map.entries()]
      .map(([value, count]) => ({ value: /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value, count }))
      .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));

    const tokenMaps = {
      fontFamilies: new Map(), fontSizes: new Map(), fontWeights: new Map(), colors: new Map(),
      spacing: new Map(), radii: new Map(), shadows: new Map(), buttonVariants: new Map(), inputVariants: new Map(),
    };
    const candidates = [document.body, ...document.querySelectorAll('body *')].filter(Boolean);
    const elements = [];
    const stableOccurrences = new Map();

    for (const element of candidates) {
      if (elements.length >= maxElements || ignored(element)) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (!visible(element, style, rect)) continue;

      const tag = element.tagName.toLowerCase();
      const role = interactiveRole(element);
      const inputType = (element.getAttribute('type') || '').toLowerCase();
      const interactive = interactiveRoles.has(String(role).toLowerCase()) || element.tabIndex >= 0 || element.isContentEditable;
      let text = ownText(element);
      if (!text && interactive) {
        const safeControlValue = ['button', 'submit', 'reset'].includes(inputType) ? element.value : '';
        text = short(element.innerText || safeControlValue);
      }
      const nameDetails = semanticName(element);
      const name = nameDetails.name;
      const selector = selectorFor(element);
      let stableBase = element.getAttribute('data-testid') || element.getAttribute('data-test')
        ? `testid=${element.getAttribute('data-testid') || element.getAttribute('data-test')}`
        : element.id ? `id=${element.id}`
          : role && name ? `role=${role}|name=${name.toLowerCase()}`
            : selector;
      const occurrence = (stableOccurrences.get(stableBase) || 0) + 1;
      stableOccurrences.set(stableBase, occurrence);
      if (occurrence > 1) stableBase += `|occurrence=${occurrence}`;

      const fontSize = px(style.fontSize);
      const lineHeight = style.lineHeight === 'normal' ? null : px(style.lineHeight);
      const padding = four(style, 'padding');
      const margin = four(style, 'margin');
      const radius = px(style.borderTopLeftRadius);
      const placeholderStyle = ['input', 'textarea'].includes(tag)
        ? getComputedStyle(element, '::placeholder')
        : null;
      const parentStyle = element.parentElement ? getComputedStyle(element.parentElement) : null;
      const inTextBlock = (tag === 'a' || role === 'link') && !!element.parentElement
        && [...element.parentElement.childNodes].some((node) => (
          node !== element && node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim()
        ));
      const elementStyles = {
        fontFamily: style.fontFamily,
        fontSize,
        fontWeight: Number.parseInt(style.fontWeight, 10) || style.fontWeight,
        lineHeight,
        letterSpacing: style.letterSpacing === 'normal' ? 0 : px(style.letterSpacing),
        textAlign: style.textAlign,
        textDecorationLine: style.textDecorationLine,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundLayers: text ? styleLayers(element) : [],
        backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor,
        borderWidth: px(style.borderTopWidth),
        borderRadius: radius,
        boxShadow: style.boxShadow,
        fill: style.fill,
        stroke: style.stroke,
        placeholderColor: placeholderStyle?.color ?? null,
        placeholderOpacity: placeholderStyle ? Number.parseFloat(placeholderStyle.opacity || '1') : null,
        parentColor: parentStyle?.color ?? null,
        parentBackgroundColor: parentStyle?.backgroundColor ?? null,
        padding,
        margin,
        gap: px(style.gap),
        display: style.display,
        position: style.position,
        zIndex: style.zIndex,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        objectFit: style.objectFit,
        opacity: Number.parseFloat(style.opacity || '1'),
        cursor: style.cursor,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      };

      if (text) {
        increment(tokenMaps.fontFamilies, style.fontFamily);
        increment(tokenMaps.fontSizes, fontSize);
        increment(tokenMaps.fontWeights, elementStyles.fontWeight);
        increment(tokenMaps.colors, style.color);
      }
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
        increment(tokenMaps.colors, style.backgroundColor);
      }
      if (elementStyles.borderWidth > 0) increment(tokenMaps.colors, style.borderTopColor);
      [...padding, ...margin, px(style.gap)].forEach((value) => { if (value > 0) increment(tokenMaps.spacing, value); });
      increment(tokenMaps.radii, radius);
      increment(tokenMaps.shadows, style.boxShadow);

      const variantSignature = [
        style.fontFamily, fontSize, elementStyles.fontWeight, style.color, style.backgroundColor,
        style.borderTopColor, elementStyles.borderWidth, radius, padding.join('/'), style.boxShadow,
      ].join('|');
      if (role === 'button') increment(tokenMaps.buttonVariants, variantSignature);
      if (['input', 'textarea', 'select'].includes(tag)) increment(tokenMaps.inputVariants, variantSignature);

      let image = null;
      if (tag === 'img') {
        image = {
          src: element.currentSrc || element.src || '',
          alt: element.getAttribute('alt'),
          naturalWidth: element.naturalWidth,
          naturalHeight: element.naturalHeight,
          complete: element.complete,
        };
      }

      const hasHiddenX = ['hidden', 'clip'].includes(style.overflowX);
      const hasHiddenY = ['hidden', 'clip'].includes(style.overflowY);
      elements.push({
        selector,
        stableKey: stableBase,
        tag,
        role,
        accessibleName: name,
        nameSource: nameDetails.source,
        visibleLabel: nameDetails.visibleLabel,
        inputType: inputType || null,
        placeholder: ['input', 'textarea'].includes(tag) ? element.getAttribute('placeholder') : null,
        required: ['input', 'select', 'textarea'].includes(tag) ? (element.required || element.getAttribute('aria-required') === 'true') : null,
        inTextBlock,
        altPresent: tag === 'img' ? element.hasAttribute('alt') : null,
        tabIndex: element.tabIndex,
        headingLevel: /^h[1-6]$/.test(tag)
          ? Number(tag.slice(1))
          : role === 'heading' ? Number(element.getAttribute('aria-level')) || null : null,
        text,
        interactive,
        inline: style.display.startsWith('inline'),
        disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        box: box(rect),
        styles: elementStyles,
        clippedHorizontal: !!text && hasHiddenX && element.scrollWidth > element.clientWidth + 1,
        clippedVertical: !!text && hasHiddenY && element.scrollHeight > element.clientHeight + 1,
        scroll: {
          width: element.scrollWidth, height: element.scrollHeight,
          clientWidth: element.clientWidth, clientHeight: element.clientHeight,
        },
        image,
      });
    }

    const fonts = document.fonts ? [...document.fonts].map((font) => ({
      family: font.family,
      style: font.style,
      weight: font.weight,
      stretch: font.stretch,
      status: font.status,
    })) : [];
    const pageText = short(document.body?.innerText, 500);
    const passwordFields = document.querySelectorAll('input[type=password]').length;
    const forms = document.querySelectorAll('form').length;
    const headings = elements
      .filter((element) => element.headingLevel)
      .map((element) => ({
        level: element.headingLevel,
        text: short(element.accessibleName || element.text),
        selector: element.selector,
      }));
    const semantics = {
      title: document.title,
      language: document.documentElement.lang || null,
      mainLandmarks: elements.filter((element) => element.tag === 'main' || element.role === 'main').length,
      navigationLandmarks: elements.filter((element) => element.tag === 'nav' || element.role === 'navigation').length,
      headings,
    };
    return {
      title: document.title,
      url: location.href,
      language: document.documentElement.lang || null,
      metrics: {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        documentHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        visibleElements: elements.length,
        totalDomElements: document.querySelectorAll('*').length,
        inspectionTruncated: elements.length >= maxElements,
        interactiveElements: elements.filter((element) => element.interactive).length,
        textElements: elements.filter((element) => element.text).length,
        images: elements.filter((element) => element.image).length,
        forms,
        formControls: elements.filter((element) => ['input', 'select', 'textarea'].includes(element.tag) && element.inputType !== 'hidden').length,
        tables: elements.filter((element) => element.tag === 'table' || ['table', 'grid', 'treegrid'].includes(element.role)).length,
        dialogs: elements.filter((element) => element.tag === 'dialog' || ['dialog', 'alertdialog'].includes(element.role)).length,
        navigationLandmarks: semantics.navigationLandmarks,
        mainLandmarks: semantics.mainLandmarks,
        liveRegions: elements.filter((element) => ['status', 'alert', 'log', 'timer'].includes(element.role)).length,
        canvas: document.querySelectorAll('canvas').length,
        video: document.querySelectorAll('video').length,
        audio: document.querySelectorAll('audio').length,
        iframes: document.querySelectorAll('iframe').length,
      },
      pageText,
      loginDetected: passwordFields > 0 && forms > 0,
      semantics,
      elements,
      fonts,
      tokens: Object.fromEntries(Object.entries(tokenMaps).map(([key, map]) => [key, entries(map)])),
      viewport,
    };
  }, input);
}

async function styleFingerprint(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      boxShadow: style.boxShadow,
      textDecoration: style.textDecorationLine,
      transform: style.transform,
      opacity: style.opacity,
      focusVisible: element.matches(':focus-visible'),
    };
  });
}

async function collectInteractiveStates(page, elements, limit) {
  const states = [];
  const candidates = elements.filter((element) => element.interactive && !element.disabled && element.selector).slice(0, limit);
  for (const element of candidates) {
    const locator = page.locator(element.selector).first();
    try {
      if (!await locator.isVisible({ timeout: 500 })) continue;
      const base = await styleFingerprint(locator);
      let hover = null;
      let focus = null;
      try {
        await locator.hover({ timeout: 1200 });
        hover = await styleFingerprint(locator);
      } catch { /* state is recorded as unavailable */ }
      try {
        // A preceding flow click leaves Chromium in pointer modality. Establish
        // keyboard modality before moving focus so :focus-visible is measured
        // as a keyboard user experiences it, not as a programmatic/pointer focus.
        await page.keyboard.press('Tab');
        await locator.focus({ timeout: 1200 });
        focus = await styleFingerprint(locator);
      } catch { /* state is recorded as unavailable */ }
      const changed = (value) => value ? JSON.stringify(value) !== JSON.stringify(base) : null;
      states.push({
        selector: element.selector,
        stableKey: element.stableKey,
        role: element.role,
        base,
        hover,
        focus,
        hoverChanged: changed(hover),
        focusChanged: changed(focus),
        focusVisible: focus?.focusVisible ?? null,
        focusMethod: 'keyboard-modality-programmatic',
      });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }).catch(() => {});
      await page.mouse.move(0, 0).catch(() => {});
    } catch {
      states.push({
        selector: element.selector,
        stableKey: element.stableKey,
        role: element.role,
        unavailable: true,
      });
    }
  }
  return states;
}

async function collectAccessibility(page, config) {
  const settings = config.accessibility?.axe ?? {};
  if (settings.enabled === false) {
    return { status: 'disabled', engine: 'axe-core', rulesTested: 0, passes: 0, violations: [], incomplete: [] };
  }
  try {
    return await page.evaluate(async ({ source, tags, disabledRules, maximumNodesPerRule, ignoreSelectors }) => {
      (0, eval)(source);
      const validExcludes = ignoreSelectors.filter((selector) => {
        try {
          return !!document.querySelector(selector);
        } catch {
          return false;
        }
      });
      const context = validExcludes.length
        ? { exclude: validExcludes.map((selector) => [selector]) }
        : document;
      const rules = Object.fromEntries(disabledRules.map((id) => [id, { enabled: false }]));
      const options = {
        resultTypes: ['violations', 'incomplete', 'passes', 'inapplicable'],
        rules,
        ...(tags.length ? { runOnly: { type: 'tag', values: tags } } : {}),
      };
      const result = await globalThis.axe.run(context, options);
      const simplify = (entries) => entries.map((entry) => ({
        id: entry.id,
        impact: entry.impact ?? null,
        tags: entry.tags ?? [],
        description: entry.description,
        help: entry.help,
        helpUrl: entry.helpUrl,
        totalNodes: entry.nodes.length,
        truncated: entry.nodes.length > maximumNodesPerRule,
        nodes: entry.nodes.slice(0, maximumNodesPerRule).map((node) => ({
          impact: node.impact ?? entry.impact ?? null,
          target: Array.isArray(node.target) ? node.target.map(String) : [],
          failureSummary: node.failureSummary ?? null,
        })),
      }));
      return {
        status: 'complete',
        engine: result.testEngine?.name || 'axe-core',
        engineVersion: result.testEngine?.version || globalThis.axe.version || null,
        tags,
        rulesTested: result.violations.length + result.incomplete.length + result.passes.length + result.inapplicable.length,
        passes: result.passes.length,
        inapplicable: result.inapplicable.length,
        violations: simplify(result.violations),
        incomplete: simplify(result.incomplete),
      };
    }, {
      source: axe.source,
      tags: Array.isArray(settings.tags) ? settings.tags : [],
      disabledRules: Array.isArray(settings.disabledRules) ? settings.disabledRules : [],
      maximumNodesPerRule: Number(settings.maximumNodesPerRule) || 20,
      ignoreSelectors: Array.isArray(config.capture?.ignoreSelectors) ? config.capture.ignoreSelectors : [],
    });
  } catch (error) {
    return {
      status: 'error',
      engine: 'axe-core',
      rulesTested: 0,
      passes: 0,
      violations: [],
      incomplete: [],
      error: sanitizeText(String(error?.message || error)).slice(0, 500),
    };
  }
}

async function captureCheckpoint({ page, contextLabel, checkpoint, viewport, theme, config, artifactDir, assets, consoleErrors, httpStatus, securityTracker }) {
  await settlePage(page, config);
  await warmLazyContent(page, config);
  const snapshot = await collectSnapshot(page, {
    viewport,
    ignoreSelectors: config.capture.ignoreSelectors,
    maxElements: config.capture.maxElements,
  });
  const accessibility = await collectAccessibility(page, config);
  const captureName = [contextLabel, viewport.name, theme, checkpoint].map((part) => slug(part)).join('-');
  const screenshotFile = path.join(artifactDir, 'screenshots', `${captureName}.png`);
  mkdir(path.dirname(screenshotFile));
  const masks = config.capture.maskSelectors.map((selector) => page.locator(selector));
  await page.screenshot({
    path: screenshotFile,
    fullPage: config.capture.fullPage,
    // Motion is neutralized by settlePage's injected stylesheet. Playwright's
    // animation fast-forward can reset JS animation libraries to a hidden
    // initial state, producing blank screenshots even though the DOM is valid.
    animations: 'allow',
    caret: 'hide',
    mask: masks,
  });
  const interactiveStates = await collectInteractiveStates(
    page,
    snapshot.elements,
    config.capture.maxInteractiveStateSamples,
  );
  const security = await collectSecurityEvidence(page, securityTracker);
  const invalidReasons = [];
  if (httpStatus && httpStatus >= 400) invalidReasons.push(`Main document returned HTTP ${httpStatus}.`);
  if (snapshot.metrics.visibleElements < 3 || snapshot.metrics.textElements === 0) {
    invalidReasons.push('The rendered page contains too little visible content for a reliable UI/UX audit.');
  }
  if (/^(chrome-error:\/\/|about:neterror)/.test(snapshot.url)) invalidReasons.push('The browser displayed a network error page.');
  return {
    captureId: stableHash(`${contextLabel}|${snapshot.url}|${checkpoint}|${viewport.name}|${theme}`),
    scenario: contextLabel,
    checkpoint,
    theme,
    viewport,
    url: sanitizeUrl(snapshot.url),
    title: snapshot.title,
    httpStatus,
    status: invalidReasons.length ? 'invalid' : 'valid',
    invalidReasons,
    loginDetected: snapshot.loginDetected,
    language: snapshot.language,
    semantics: snapshot.semantics,
    metrics: snapshot.metrics,
    elements: snapshot.elements,
    fonts: snapshot.fonts,
    tokens: snapshot.tokens,
    assets: {
      failed: assets.failed.map((asset) => ({ ...asset, url: sanitizeUrl(asset.url) })),
      requested: assets.requested,
    },
    consoleErrors: [...new Set(consoleErrors.map(sanitizeText))].slice(0, 30),
    accessibility,
    interactiveStates,
    security,
    limitations: {
      canvas: snapshot.metrics.canvas,
      video: snapshot.metrics.video,
      iframes: snapshot.metrics.iframes,
      complexBackgrounds: snapshot.elements.filter((element) => element.text && element.styles.backgroundLayers.some((layer) => layer.image !== 'none')).length,
    },
    screenshot: relativeArtifact(artifactDir, screenshotFile),
  };
}

function contextOptions(config, viewport, theme, runtime) {
  const options = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    hasTouch: !!viewport.isMobile,
    locale: config.locale,
    timezoneId: config.timezoneId,
    reducedMotion: 'reduce',
    ignoreHTTPSErrors: !!runtime.insecure,
    extraHTTPHeaders: runtime.headers || {},
  };
  if (theme !== 'no-preference') options.colorScheme = theme;
  if (runtime.storageStatePath) options.storageState = runtime.storageStatePath;
  return options;
}

export async function scanWebsite({
  url,
  config,
  artifactDir,
  storageStatePath = null,
  headers = {},
  headed = false,
  insecure = false,
  flow = null,
  label = 'target',
  onProgress = () => {},
} = {}) {
  if (storageStatePath && !fs.existsSync(storageStatePath)) {
    throw new Error(`Storage state file does not exist: ${storageStatePath}`);
  }
  mkdir(artifactDir);
  const browser = await chromium.launch({ headless: !headed });
  const captures = [];
  let browserVersion;
  try {
    browserVersion = browser.version();
    for (const viewport of config.viewports) {
      for (const theme of config.themes) {
        onProgress({ event: 'profile-start', label, viewport: viewport.name, theme });
        const context = await browser.newContext(contextOptions(config, viewport, theme, {
          storageStatePath, headers, insecure,
        }));
        const page = await context.newPage();
        const assets = { requested: 0, failed: [] };
        const consoleErrors = [];
        const securityTracker = createSecurityTracker();
        let documentStatus = null;
        page.on('request', (request) => {
          if (ASSET_TYPES.has(request.resourceType())) assets.requested += 1;
          recordSecurityRequest(securityTracker, request);
        });
        page.on('requestfailed', (request) => {
          if (!ASSET_TYPES.has(request.resourceType())) return;
          assets.failed.push({
            type: request.resourceType(),
            url: sanitizeUrl(request.url()),
            error: request.failure()?.errorText || 'Request failed',
          });
        });
        page.on('response', (response) => {
          const request = response.request();
          if (request.resourceType() === 'document' && request.frame() === page.mainFrame()) {
            documentStatus = response.status();
            securityTracker.documentResponse = response;
          }
          if (ASSET_TYPES.has(request.resourceType()) && response.status() >= 400) {
            assets.failed.push({ type: request.resourceType(), url: sanitizeUrl(response.url()), status: response.status() });
          }
        });
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
        });
        page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 500)));

        const startUrl = flow?.startUrl || url;
        let response;
        try {
          response = await page.goto(startUrl, {
            waitUntil: config.navigation.waitUntil,
            timeout: config.navigation.timeoutMs,
          });
          documentStatus = response?.status() ?? documentStatus;
          securityTracker.documentResponse = response || securityTracker.documentResponse;
          if (!flow) {
            captures.push(await captureCheckpoint({
              page, contextLabel: label, checkpoint: 'page', viewport, theme, config,
              artifactDir, assets, consoleErrors, httpStatus: documentStatus, securityTracker,
            }));
          } else {
            for (const step of flow.steps) {
              const result = await executeFlowStep(page, step, config.navigation.timeoutMs);
              if (!result?.checkpoint) continue;
              captures.push(await captureCheckpoint({
                page, contextLabel: label + '-' + flow.name, checkpoint: result.checkpoint, viewport, theme, config,
                artifactDir, assets, consoleErrors, httpStatus: documentStatus, securityTracker,
              }));
            }
          }
        } catch (error) {
          const failureUrl = sanitizeUrl(page.url() || startUrl);
          throw new Error(`${label} ${viewport.name}/${theme} failed at ${failureUrl}: ${sanitizeText(error.message)}`);
        } finally {
          await context.close();
        }
        onProgress({ event: 'profile-complete', label, viewport: viewport.name, theme });
      }
    }
  } finally {
    await browser.close();
  }
  return {
    url: sanitizeUrl(url),
    finalUrl: captures[0]?.url || url,
    title: captures[0]?.title || '',
    browser: 'chromium',
    browserVersion,
    captures,
  };
}
