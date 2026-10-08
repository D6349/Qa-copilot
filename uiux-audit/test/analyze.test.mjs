import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeScan } from '../src/analyze.mjs';
import { colorToHex, contrastRatio, isLargeText, parseCssColor } from '../src/color.mjs';

function textElement(overrides = {}) {
  return {
    selector: '#copy',
    stableKey: 'id=copy',
    tag: 'p',
    role: null,
    text: 'Readable interface copy',
    interactive: false,
    inline: false,
    box: { x: 16, y: 16, width: 240, height: 24, right: 256, bottom: 40 },
    styles: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 24,
      color: '#111111',
      backgroundColor: '#ffffff',
      backgroundLayers: [],
      backgroundImage: 'none',
      padding: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
      overflowX: 'visible',
      overflowY: 'visible',
      objectFit: 'fill',
      ...overrides.styles,
    },
    clippedHorizontal: false,
    clippedVertical: false,
    image: null,
    ...overrides,
  };
}

function buttonElement(overrides = {}) {
  return textElement({
    selector: '#continue',
    stableKey: 'role=button|name=Continue|1',
    tag: 'button',
    role: 'button',
    text: 'Continue',
    interactive: true,
    box: { x: 16, y: 64, width: 48, height: 48, right: 64, bottom: 112 },
    styles: {
      color: '#ffffff',
      backgroundColor: '#123b70',
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 24,
      ...overrides.styles,
    },
    ...overrides,
  });
}

function capture(overrides = {}) {
  return {
    captureId: 'capture-home-mobile-light',
    checkpoint: 'initial',
    theme: 'light',
    viewport: { name: 'mobile', width: 320, height: 568 },
    url: 'https://example.test/',
    httpStatus: 200,
    status: 'ok',
    metrics: {
      documentWidth: 320,
      documentHeight: 900,
      horizontalOverflow: 0,
      visibleElements: 2,
    },
    elements: [textElement(), buttonElement()],
    fonts: [{ family: 'Inter', status: 'loaded' }],
    assets: { failed: [] },
    interactiveStates: [{
      stableKey: 'role=button|name=Continue|1',
      focusVisible: true,
      hasVisualChange: true,
      focusContrast: 4.5,
    }],
    tokens: {
      fontFamilies: [{ value: 'Inter', count: 2 }],
      fontSizes: [{ value: 16, count: 2 }],
      fontWeights: [{ value: 400, count: 1 }, { value: 600, count: 1 }],
      colors: [{ value: '#111111', count: 1 }, { value: '#ffffff', count: 2 }, { value: '#123b70', count: 1 }],
      spacing: [{ value: 16, count: 2 }],
      radii: [{ value: 0, count: 1 }],
      shadows: [],
      buttonVariants: [{ value: 'primary', count: 1 }],
      inputVariants: [],
    },
    ...overrides,
  };
}

test('color utilities parse computed CSS formats and calculate WCAG contrast', () => {
  assert.deepEqual(parseCssColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(colorToHex('rgb(255 0 128 / 50%)', true), '#ff008080');
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.ok(Math.abs(contrastRatio('rgba(0, 0, 0, 0.5)', '#fff') - 3.9767) < 0.001);
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18.6667, 700), true);
  assert.equal(isLargeText(18, 700), false);
});

test('CSS Color 4 lab and oklab values convert to sRGB with alpha and percentages', () => {
  const labRed = parseCssColor('lab(54.2905 80.8049 69.891 / 40%)');
  assert.ok(Math.abs(labRed.r - 255) < 0.1);
  assert.ok(labRed.g < 0.2);
  assert.equal(labRed.b, 0);
  assert.equal(labRed.a, 0.4);
  assert.equal(colorToHex('lab(54.2905% 64.64392% 55.9128%)'), '#ff0000');

  const oklabRed = parseCssColor('oklab(0.627955 0.224863 0.125846 / .25)');
  assert.ok(Math.abs(oklabRed.r - 255) < 0.1);
  assert.ok(oklabRed.g < 0.1);
  assert.ok(oklabRed.b < 0.1);
  assert.equal(oklabRed.a, 0.25);
  assert.equal(colorToHex('oklab(62.7955% 56.21575% 31.4615%)'), '#ff0000');

  assert.ok(Math.abs(contrastRatio('lab(0 0 0)', 'lab(100 0 0)') - 21) < 0.01);
  assert.equal(parseCssColor('lab(50 none 0)'), null);
  assert.equal(parseCssColor('oklab(50% 0 0 / none)'), null);
});

test('lab and oklab computed backgrounds are measured instead of becoming 1:1 fallbacks', () => {
  const colorFourText = textElement({
    stableKey: 'id=color-four',
    selector: '#color-four',
    text: 'Modern CSS color',
    styles: {
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'oklab(0.695996 -0.162107 0.0511875 / 0.8)',
      backgroundLayers: [
        { color: 'rgba(0, 0, 0, 0)', image: 'none' },
        { color: 'rgb(255, 255, 255)', image: 'none' },
      ],
    },
  });
  const colorCapture = capture({ elements: [colorFourText], interactiveStates: [] });
  const result = analyzeScan({ url: colorCapture.url, captures: [colorCapture] }, {});
  const contrastIssue = result.issues.find((item) => item.ruleId === 'color.text-contrast');

  assert.equal(result.coverage.checks.contrast.tested, 1);
  assert.equal(result.coverage.checks.contrast.indeterminate, 0);
  assert.ok(contrastIssue);
  assert.ok(contrastIssue.actual.ratio > 1);
  assert.equal(result.issues.some((item) => item.ruleId === 'color.text-contrast-indeterminate'), false);
});

test('unsupported computed colors are review items and can never create objective contrast failures', () => {
  const unsupportedBackground = textElement({
    stableKey: 'id=unsupported-background',
    selector: '#unsupported-background',
    styles: {
      color: '#ffffff',
      backgroundColor: 'color(display-p3 0.1 0.2 0.3)',
      backgroundLayers: [],
    },
  });
  const unsupportedForeground = textElement({
    stableKey: 'id=unsupported-foreground',
    selector: '#unsupported-foreground',
    styles: { color: 'device-cmyk(0 0 0 1)', backgroundColor: '#ffffff' },
  });
  const unsupportedCapture = capture({
    elements: [unsupportedBackground, unsupportedForeground],
    interactiveStates: [],
  });
  const result = analyzeScan({ url: unsupportedCapture.url, captures: [unsupportedCapture] }, {});
  const contrastFindings = result.issues.filter((item) => item.ruleId.startsWith('color.text-contrast'));

  assert.equal(result.coverage.checks.contrast.tested, 0);
  assert.equal(result.coverage.checks.contrast.failed, 0);
  assert.equal(result.coverage.checks.contrast.indeterminate, 2);
  assert.equal(contrastFindings.length, 2);
  assert.ok(contrastFindings.every((item) => item.class === 'heuristic' && item.status === 'review'));
  assert.equal(result.issues.some((item) => item.ruleId === 'color.text-contrast'), false);
});

test('large absolute sibling media behind hero text makes contrast indeterminate', () => {
  const heroText = textElement({
    selector: 'body > main > section:nth-of-type(1) > div > div:nth-of-type(1) > h1',
    stableKey: 'hero-heading',
    tag: 'h1',
    text: 'Run your business on LEDGERS',
    box: { x: 416, y: 134, width: 608, height: 44, right: 1024, bottom: 178 },
    styles: {
      color: 'lab(96.286 -0.852436 -2.46847)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundLayers: [
        { color: 'rgba(0, 0, 0, 0)', image: 'none' },
        { color: '#ffffff', image: 'none' },
      ],
      fontSize: 36,
      fontWeight: 700,
      lineHeight: 44,
    },
  });
  const heroImage = textElement({
    selector: 'body > main > section:nth-of-type(1) > div > img',
    stableKey: 'hero-background-image',
    tag: 'img',
    text: '',
    box: { x: 80, y: 70, width: 1280, height: 720, right: 1360, bottom: 790 },
    styles: { position: 'absolute', zIndex: 'auto', objectFit: 'cover' },
    image: {
      src: '/hero-background.avif',
      complete: true,
      naturalWidth: 1280,
      naturalHeight: 720,
    },
  });
  const heroCapture = capture({
    viewport: { name: 'desktop', width: 1440, height: 900 },
    metrics: { documentWidth: 1440, documentHeight: 1200, horizontalOverflow: 0, visibleElements: 2 },
    elements: [heroText, heroImage],
    interactiveStates: [],
  });

  const result = analyzeScan({ url: heroCapture.url, captures: [heroCapture] }, {});
  const review = result.issues.find((item) => item.ruleId === 'color.text-contrast-indeterminate');

  assert.ok(review);
  assert.equal(review.class, 'heuristic');
  assert.equal(review.status, 'review');
  assert.equal(review.actual.reason, 'overlapping-media');
  assert.equal(review.actual.overlappingMedia.selector, heroImage.selector);
  assert.equal(result.issues.some((item) => item.ruleId === 'color.text-contrast'), false);
  assert.deepEqual(result.coverage.checks.contrast, {
    eligible: 1,
    tested: 0,
    passed: 0,
    failed: 0,
    indeterminate: 1,
  });
});

test('flat-color contrast stays measurable around inline icons and descendant images', () => {
  const flatText = textElement({
    selector: 'body > main > article > p',
    stableKey: 'flat-copy',
    styles: {
      color: '#777777',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundLayers: [{ color: '#ffffff', image: 'none' }],
    },
  });
  const descendantImage = textElement({
    selector: 'body > main > article > p > img',
    stableKey: 'descendant-decoration',
    tag: 'img',
    text: '',
    box: { x: 0, y: 0, width: 320, height: 180, right: 320, bottom: 180 },
    styles: { position: 'absolute', objectFit: 'cover' },
    image: { src: '/decoration.png', complete: true, naturalWidth: 320, naturalHeight: 180 },
  });
  const inlineIcon = textElement({
    selector: 'body > main > article > img',
    stableKey: 'inline-icon',
    tag: 'img',
    text: '',
    box: { x: 16, y: 16, width: 20, height: 20, right: 36, bottom: 36 },
    styles: { position: 'static', objectFit: 'contain' },
    image: { src: '/icon.svg', complete: true, naturalWidth: 20, naturalHeight: 20 },
  });
  const flatCapture = capture({
    elements: [flatText, descendantImage, inlineIcon],
    interactiveStates: [],
  });

  const result = analyzeScan({ url: flatCapture.url, captures: [flatCapture] }, {});
  const failure = result.issues.find((item) => item.ruleId === 'color.text-contrast');

  assert.ok(failure);
  assert.equal(failure.actual.ratio > 4 && failure.actual.ratio < 4.5, true);
  assert.equal(result.issues.some((item) => item.ruleId === 'color.text-contrast-indeterminate'), false);
  assert.equal(result.coverage.checks.contrast.tested, 1);
  assert.equal(result.coverage.checks.contrast.failed, 1);
});

test('a clean capture passes without manufacturing an aesthetic score', () => {
  const result = analyzeScan({ url: 'https://example.test/', captures: [capture()] }, {});

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.objectiveFailures, 0);
  assert.equal(result.summary.heuristicReviews, 0);
  assert.equal('score' in result, false);
  assert.deepEqual(result.coverage.captures, { total: 1, valid: 1, invalid: 0 });
  assert.equal(result.coverage.checks.contrast.tested, 2);
  assert.equal(result.coverage.checks.targetSize.passed, 1);
  assert.equal(result.coverage.checks.focus.passed, 1);
});

test('standards defects are objective failures with specific evidence', () => {
  const lowContrast = textElement({
    stableKey: 'id=low-contrast',
    selector: '#low-contrast',
    styles: { color: '#777777', backgroundColor: '#ffffff' },
    clippedHorizontal: true,
  });
  const firstSmall = buttonElement({
    stableKey: 'id=small-one',
    selector: '#small-one',
    text: 'One',
    box: { x: 300, y: 64, width: 16, height: 16, right: 316, bottom: 80 },
  });
  const secondSmall = buttonElement({
    stableKey: 'id=small-two',
    selector: '#small-two',
    text: 'Two',
    box: { x: 320, y: 64, width: 16, height: 16, right: 336, bottom: 80 },
  });
  const brokenImage = textElement({
    stableKey: 'id=hero',
    selector: '#hero',
    tag: 'img',
    text: '',
    box: { x: 0, y: 130, width: 320, height: 180, right: 320, bottom: 310 },
    image: { src: '/hero.png', complete: true, naturalWidth: 0, naturalHeight: 0 },
  });
  const broken = capture({
    metrics: { documentWidth: 336, documentHeight: 900, horizontalOverflow: 16, visibleElements: 4 },
    elements: [lowContrast, firstSmall, secondSmall, brokenImage],
    fonts: [{ family: 'Inter', status: 'error' }],
    assets: { failed: [{ url: '/decor.svg', status: 404 }] },
    interactiveStates: [
      { stableKey: 'id=small-one', focusVisible: false, hasVisualChange: false },
      { stableKey: 'id=small-two', focusVisible: true, hasVisualChange: true },
    ],
  });

  const result = analyzeScan({ url: broken.url, captures: [broken] }, {});
  const rules = new Set(result.issues.map((item) => item.ruleId));

  assert.equal(result.verdict, 'fail');
  assert.ok(rules.has('color.text-contrast'));
  assert.ok(rules.has('layout.horizontal-overflow'));
  assert.ok(rules.has('layout.content-clipped'));
  assert.ok(rules.has('layout.interactive-offscreen'));
  assert.ok(rules.has('interaction.target-size'));
  assert.ok(rules.has('focus.not-visible'));
  assert.ok(rules.has('typography.font-load-failed'));
  assert.ok(rules.has('media.image-broken'));
  assert.ok(rules.has('media.asset-load-failed'));
  assert.ok(result.issues.filter((item) => item.class === 'objective').every((item) => item.status === 'fail'));
  assert.ok(result.summary.objectiveFailures >= 8);
});

test('an incomplete image without failure evidence is a review instead of a false failure', () => {
  const lazyImage = textElement({
    stableKey: 'id=lazy-hero',
    selector: '#lazy-hero',
    tag: 'img',
    text: '',
    image: {
      src: '/images/lazy-hero.webp',
      complete: false,
      naturalWidth: 0,
      naturalHeight: 0,
      loading: 'lazy',
    },
  });
  const lazyCapture = capture({ elements: [lazyImage], assets: { failed: [] }, interactiveStates: [] });

  const result = analyzeScan({ url: lazyCapture.url, captures: [lazyCapture] }, {});
  const review = result.issues.find((item) => item.ruleId === 'media.image-load-unconfirmed');

  assert.ok(review);
  assert.equal(review.class, 'heuristic');
  assert.equal(review.status, 'review');
  assert.match(review.message, /no matching failed request or load error/i);
  assert.equal(result.issues.some((item) => item.ruleId === 'media.image-broken'), false);
  assert.equal(result.coverage.checks.images.failed, 0);
  assert.equal(result.summary.objectiveFailures, 0);
});

test('a matching failed image request proves an incomplete image is broken', () => {
  const image = textElement({
    stableKey: 'id=network-failed-image',
    selector: '#network-failed-image',
    tag: 'img',
    text: '',
    image: { src: '/images/hero.png', complete: false, naturalWidth: 0, naturalHeight: 0 },
  });
  const failedCapture = capture({
    url: 'https://example.test/page',
    elements: [image],
    assets: { failed: [{ type: 'image', url: 'https://example.test/images/hero.png', status: 404 }] },
    interactiveStates: [],
  });

  const result = analyzeScan({ url: failedCapture.url, captures: [failedCapture] }, {});
  const failure = result.issues.find((item) => item.ruleId === 'media.image-broken');

  assert.ok(failure);
  assert.equal(failure.class, 'objective');
  assert.equal(failure.actual.failureEvidence, 'failed-asset-request');
  assert.equal(result.issues.some((item) => item.ruleId === 'media.image-load-unconfirmed'), false);
  assert.equal(result.coverage.checks.images.failed, 1);
});

test('an explicit element load error remains objective without a failed asset record', () => {
  const image = textElement({
    stableKey: 'id=errored-image',
    selector: '#errored-image',
    tag: 'img',
    text: '',
    image: { src: '/images/error.png', complete: false, naturalWidth: 0, naturalHeight: 0, error: true },
  });
  const erroredCapture = capture({ elements: [image], assets: { failed: [] }, interactiveStates: [] });

  const result = analyzeScan({ url: erroredCapture.url, captures: [erroredCapture] }, {});
  const failure = result.issues.find((item) => item.ruleId === 'media.image-broken');

  assert.ok(failure);
  assert.equal(failure.class, 'objective');
  assert.equal(failure.actual.failureEvidence, 'element-load-error');
  assert.equal(result.coverage.checks.images.failed, 1);
});

test('canonical screen-reader-only copy is exempt without suppressing visible clipped content or controls', () => {
  const visuallyHiddenStyles = {
    ...textElement().styles,
    position: 'absolute',
    overflowX: 'hidden',
    overflowY: 'hidden',
    whiteSpace: 'nowrap',
    margin: [-1, -1, -1, -1],
    padding: [0, 0, 0, 0],
    borderWidth: 0,
  };
  const hiddenBrandName = textElement({
    selector: '#hidden-brand-name',
    stableKey: 'id=hidden-brand-name',
    tag: 'span',
    text: 'ledgers.cloud',
    box: { x: 11, y: 29.5, width: 1, height: 1, right: 12, bottom: 30.5 },
    styles: visuallyHiddenStyles,
    clippedHorizontal: true,
    clippedVertical: true,
  });
  const visibleClippedCopy = textElement({
    selector: '#visible-clipped-copy',
    stableKey: 'id=visible-clipped-copy',
    text: 'Visible content that must remain readable',
    box: { x: 16, y: 80, width: 80, height: 24, right: 96, bottom: 104 },
    styles: {
      ...textElement().styles,
      overflowX: 'hidden',
      overflowY: 'hidden',
      whiteSpace: 'nowrap',
      margin: [0, 0, 0, 0],
      padding: [0, 0, 0, 0],
      borderWidth: 0,
    },
    clippedHorizontal: true,
  });
  const clippedControl = buttonElement({
    selector: '#clipped-control',
    stableKey: 'id=clipped-control',
    box: { x: 120, y: 80, width: 1, height: 1, right: 121, bottom: 81 },
    styles: {
      ...buttonElement().styles,
      ...visuallyHiddenStyles,
    },
    clippedHorizontal: true,
    clippedVertical: true,
  });
  const layoutCapture = capture({
    metrics: {
      ...capture().metrics,
      visibleElements: 3,
    },
    elements: [hiddenBrandName, visibleClippedCopy, clippedControl],
    interactiveStates: [{
      stableKey: clippedControl.stableKey,
      focusVisible: true,
      hasVisualChange: true,
    }],
  });

  const result = analyzeScan({ url: layoutCapture.url, captures: [layoutCapture] }, {});
  const clippingIssues = result.issues
    .filter((item) => item.ruleId === 'layout.content-clipped')
    .map((item) => item.location.stableKey)
    .sort();

  assert.deepEqual(clippingIssues, ['id=clipped-control', 'id=visible-clipped-copy']);
  assert.equal(result.issues.some((item) => item.location.stableKey === hiddenBrandName.stableKey
    && item.ruleId.startsWith('layout.')), false);
  assert.deepEqual(result.coverage.checks.clipping, {
    tested: 2,
    failed: 2,
    exempt: 1,
  });
});

test('readability, 44px comfort targets, and token proliferation remain review items', () => {
  const tinyCopy = textElement({
    styles: { fontSize: 10, lineHeight: 10, color: '#000000', backgroundColor: '#ffffff' },
  });
  const comfortableEnough = buttonElement({
    box: { x: 16, y: 64, width: 30, height: 30, right: 46, bottom: 94 },
  });
  const reviewCapture = capture({
    elements: [tinyCopy, comfortableEnough],
    interactiveStates: [{
      stableKey: comfortableEnough.stableKey,
      focusVisible: true,
      hasVisualChange: true,
    }],
    tokens: {
      ...capture().tokens,
      fontFamilies: [
        { value: 'Inter', count: 2 },
        { value: 'Roboto', count: 1 },
        { value: 'Arial', count: 1 },
      ],
    },
  });
  const result = analyzeScan(
    { url: reviewCapture.url, captures: [reviewCapture] },
    { thresholds: { maxFontFamilies: 2 } },
  );
  const rules = new Set(result.issues.map((item) => item.ruleId));

  assert.equal(result.verdict, 'review');
  assert.equal(result.summary.objectiveFailures, 0);
  assert.ok(rules.has('typography.small-text'));
  assert.ok(rules.has('typography.tight-line-height'));
  assert.ok(rules.has('interaction.target-size-advisory'));
  assert.ok(rules.has('consistency.token-proliferation.fontFamilies'));
  assert.ok(result.issues.every((item) => item.class === 'heuristic' && item.status === 'review'));
});

test('the 24px spacing exception and inline-text exception prevent blanket target failures', () => {
  const isolatedSmall = buttonElement({
    stableKey: 'id=isolated-small',
    selector: '#isolated-small',
    box: { x: 16, y: 64, width: 16, height: 16, right: 32, bottom: 80 },
  });
  const inlineLink = textElement({
    stableKey: 'id=inline-link',
    selector: '#inline-link',
    tag: 'a',
    role: 'link',
    text: 'Terms',
    interactive: true,
    inline: true,
    box: { x: 150, y: 200, width: 20, height: 16, right: 170, bottom: 216 },
  });
  const targetCapture = capture({
    elements: [isolatedSmall, inlineLink],
    interactiveStates: [
      { stableKey: isolatedSmall.stableKey, focusVisible: true, hasVisualChange: true },
      { stableKey: inlineLink.stableKey, focusVisible: true, hasVisualChange: true },
    ],
  });

  const result = analyzeScan({ url: targetCapture.url, captures: [targetCapture] }, {});

  assert.equal(result.issues.some((item) => item.ruleId === 'interaction.target-size'), false);
  assert.equal(result.coverage.checks.targetSize.exempt, 1);
  assert.equal(result.coverage.checks.targetSize.passed, 1);
});

test('an inline-styled button is not mistaken for the inline text exception', () => {
  const inlineButton = buttonElement({
    stableKey: 'id=inline-button',
    selector: '#inline-button',
    inline: true,
    box: { x: 16, y: 64, width: 12, height: 12, right: 28, bottom: 76 },
  });
  const neighbor = buttonElement({
    stableKey: 'id=neighbor',
    selector: '#neighbor',
    box: { x: 30, y: 64, width: 12, height: 12, right: 42, bottom: 76 },
  });
  const targetCapture = capture({
    elements: [inlineButton, neighbor],
    interactiveStates: [
      { stableKey: inlineButton.stableKey, focusVisible: true, hasVisualChange: true },
      { stableKey: neighbor.stableKey, focusVisible: true, hasVisualChange: true },
    ],
  });
  const result = analyzeScan({ url: targetCapture.url, captures: [targetCapture] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'interaction.target-size' && item.location.stableKey === inlineButton.stableKey));
});

test('a numeric focus-state comparison can prove that focus styling is absent', () => {
  const control = buttonElement();
  const focusCapture = capture({
    elements: [control],
    interactiveStates: [{ stableKey: control.stableKey, pixelDifferenceRatio: 0 }],
  });
  const result = analyzeScan({ url: focusCapture.url, captures: [focusCapture] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'focus.not-visible'));
  assert.equal(result.coverage.checks.focus.failed, 1);
});

test('overflow from known two-dimensional content is a review rather than a false reflow failure', () => {
  const table = textElement({
    stableKey: 'role=table|1',
    selector: 'table',
    tag: 'table',
    role: 'table',
    text: '',
    box: { x: 0, y: 0, width: 600, height: 300, right: 600, bottom: 300 },
  });
  const tableCapture = capture({
    metrics: { documentWidth: 600, documentHeight: 900, horizontalOverflow: 280, visibleElements: 1 },
    elements: [table],
    interactiveStates: [],
  });
  const result = analyzeScan({ url: tableCapture.url, captures: [tableCapture] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'layout.horizontal-overflow-review' && item.class === 'heuristic'));
  assert.equal(result.issues.some((item) => item.ruleId === 'layout.horizontal-overflow'), false);
  assert.equal(result.summary.objectiveFailures, 0);
});

test('transparent element backgrounds use captured ancestor layers for contrast', () => {
  const layered = textElement({
    styles: {
      color: '#ffffff',
      backgroundColor: 'transparent',
      backgroundLayers: [
        { backgroundColor: 'transparent', backgroundImage: 'none' },
        { backgroundColor: '#111111', backgroundImage: 'none' },
      ],
    },
  });
  const layeredCapture = capture({ elements: [layered], interactiveStates: [] });
  const result = analyzeScan({ url: layeredCapture.url, captures: [layeredCapture] }, {});

  assert.equal(result.issues.some((item) => item.ruleId.startsWith('color.text-contrast')), false);
  assert.equal(result.coverage.checks.contrast.passed, 1);
});

test('invalid captures are never reported as coverage', () => {
  const invalid = capture({ status: 'invalid', elements: [], metrics: { visibleElements: 0 } });
  const result = analyzeScan({ url: invalid.url, captures: [invalid] }, {});

  assert.equal(result.verdict, 'invalid-capture');
  assert.equal(result.coverage.captures.valid, 0);
  assert.equal(result.coverage.captures.invalid, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].ruleId, 'capture.invalid');
});

test('issue IDs and issue ordering are deterministic', () => {
  const failingCapture = capture({
    elements: [textElement({ styles: { color: '#777', backgroundColor: '#fff' } })],
    interactiveStates: [],
  });
  const scan = { url: failingCapture.url, captures: [failingCapture] };
  const first = analyzeScan(structuredClone(scan), {});
  const second = analyzeScan(structuredClone(scan), {});

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.issues.map((item) => item.id),
    [...first.issues.map((item) => item.id)].sort(),
  );
});

test('scanner focus aliases and public configuration names are honored', () => {
  const control = buttonElement();
  const aliased = capture({
    elements: [control],
    interactiveStates: [{
      stableKey: control.stableKey,
      base: { outline: '0px none rgb(0, 0, 0)' },
      focus: { outline: '2px solid rgb(0, 0, 0)' },
      focusChanged: true,
    }],
    tokens: {
      ...capture().tokens,
      fontFamilies: [{ value: 'Inter', count: 1 }, { value: 'Roboto', count: 1 }],
    },
  });
  const result = analyzeScan(
    { url: aliased.url, captures: [aliased] },
    { thresholds: { maximumFontFamilies: 1 } },
  );

  assert.equal(result.issues.some((item) => item.ruleId === 'focus.not-visible'), false);
  assert.ok(result.issues.some((item) => item.ruleId === 'consistency.token-proliferation.fontFamilies'));
});

test('approved font and color lists produce brand review evidence', () => {
  const branded = capture({
    tokens: {
      ...capture().tokens,
      fontFamilies: [{ value: 'Inter, sans-serif', count: 1 }],
      colors: [{ value: 'rgb(17, 17, 17)', count: 1 }, { value: '#ffffff', count: 1 }],
    },
  });
  const result = analyzeScan(
    { url: branded.url, captures: [branded] },
    { approved: { fontFamilies: ['Roboto'], colors: ['#ffffff'] } },
  );
  const rules = new Set(result.issues.map((item) => item.ruleId));

  assert.ok(rules.has('brand.font-family'));
  assert.ok(rules.has('brand.color-palette'));
  assert.equal(result.issues.find((item) => item.ruleId === 'brand.font-family').class, 'heuristic');
});

test('a missing mobile viewport declaration is objective responsive evidence', () => {
  const noViewport = capture({
    viewport: { name: 'mobile-320', width: 320, height: 568, isMobile: true },
    metrics: {
      ...capture().metrics,
      viewportWidth: 980,
      hasViewportMeta: false,
    },
  });
  const result = analyzeScan({ url: noViewport.url, captures: [noViewport] }, {});

  assert.ok(result.issues.some((item) => item.ruleId === 'responsive.viewport-metadata' && item.class === 'objective'));
  assert.equal(result.verdict, 'fail');
});
