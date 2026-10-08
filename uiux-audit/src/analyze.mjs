import { createHash } from 'node:crypto';

import {
  colorToHex,
  compositeColors,
  contrastRatio,
  isLargeText,
  parseCssColor,
} from './color.mjs';
import { guidanceForRule, priorityForIssue } from './framework.mjs';

export const DEFAULT_THRESHOLDS = Object.freeze({
  normalTextContrast: 4.5,
  largeTextContrast: 3,
  targetSize: 24,
  recommendedTargetSize: 44,
  horizontalOverflow: 1,
  offscreenTolerance: 1,
  minimumReadableFontSize: 12,
  minimumBodyFontSize: 14,
  minimumLineHeightRatio: 1.2,
  recommendedBodyLineHeightRatio: 1.4,
  maximumNegativeLetterSpacingEm: 0.025,
  maximumUppercaseCharacters: 24,
  nonTextContrast: 3,
  focusContrast: 3,
  focusPixelDifference: 0.001,
  imageAspectRatioTolerance: 0.03,
  imageUpscaleTolerance: 1.1,
  maxFontFamilies: 4,
  maxFontSizes: 12,
  maxFontWeights: 6,
  maxColors: 24,
  maxSpacingTokens: 16,
  maxRadii: 8,
  maxShadows: 8,
  maxButtonVariants: 6,
  maxInputVariants: 5,
  nearColorDistance: 12,
  maximumLineCharacters: 100,
});

const VALID_CAPTURE_STATUSES = new Set(['ok', 'valid', 'success', 'completed', 'complete', 'ready']);
const INVALID_CAPTURE_STATUSES = new Set(['invalid', 'error', 'failed', 'empty', 'timeout', 'login-required']);
const FAILED_FONT_STATUSES = new Set(['error', 'failed', 'missing', 'unavailable', 'timeout', 'blocked']);
const FOCUS_STYLE_PROPERTIES = [
  'outline',
  'outlineColor',
  'outlineOffset',
  'outlineStyle',
  'outlineWidth',
  'boxShadow',
  'borderColor',
  'borderStyle',
  'borderWidth',
  'backgroundColor',
  'color',
];

function finiteNumber(value, fallback = null) {
  const number = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function configuredNumber(source, names, fallback) {
  for (const name of names) {
    const value = finiteNumber(getPath(source, name));
    if (value !== null) return value;
  }
  return fallback;
}

function resolveThresholds(config = {}) {
  const source = config.thresholds ?? {};
  return {
    normalTextContrast: configuredNumber(source, ['normalTextContrast', 'minimumTextContrast', 'contrast.normalText', 'contrast.text'], DEFAULT_THRESHOLDS.normalTextContrast),
    largeTextContrast: configuredNumber(source, ['largeTextContrast', 'minimumLargeTextContrast', 'contrast.largeText', 'contrast.large'], DEFAULT_THRESHOLDS.largeTextContrast),
    targetSize: configuredNumber(source, ['targetSize', 'minimumTargetPx', 'target.minimum', 'interaction.targetSize'], DEFAULT_THRESHOLDS.targetSize),
    recommendedTargetSize: configuredNumber(source, ['recommendedTargetSize', 'recommendedTargetPx', 'target.recommended', 'interaction.recommendedTargetSize'], DEFAULT_THRESHOLDS.recommendedTargetSize),
    horizontalOverflow: configuredNumber(source, ['horizontalOverflow', 'layout.horizontalOverflow'], DEFAULT_THRESHOLDS.horizontalOverflow),
    offscreenTolerance: configuredNumber(source, ['offscreenTolerance', 'layout.offscreenTolerance'], DEFAULT_THRESHOLDS.offscreenTolerance),
    minimumReadableFontSize: configuredNumber(source, ['minimumReadableFontSize', 'minimumHardTextPx', 'minReadableFontSize', 'typography.minimumFontSize'], DEFAULT_THRESHOLDS.minimumReadableFontSize),
    minimumBodyFontSize: configuredNumber(source, ['minimumBodyFontSize', 'minimumBodyFontPx', 'typography.minimumBodyFontSize'], DEFAULT_THRESHOLDS.minimumBodyFontSize),
    minimumLineHeightRatio: configuredNumber(source, ['minimumLineHeightRatio', 'minLineHeightRatio', 'typography.minimumLineHeightRatio'], DEFAULT_THRESHOLDS.minimumLineHeightRatio),
    recommendedBodyLineHeightRatio: configuredNumber(source, ['recommendedBodyLineHeightRatio', 'typography.recommendedBodyLineHeightRatio'], DEFAULT_THRESHOLDS.recommendedBodyLineHeightRatio),
    maximumNegativeLetterSpacingEm: configuredNumber(source, ['maximumNegativeLetterSpacingEm', 'typography.maximumNegativeLetterSpacingEm'], DEFAULT_THRESHOLDS.maximumNegativeLetterSpacingEm),
    maximumUppercaseCharacters: configuredNumber(source, ['maximumUppercaseCharacters', 'typography.maximumUppercaseCharacters'], DEFAULT_THRESHOLDS.maximumUppercaseCharacters),
    nonTextContrast: configuredNumber(source, ['nonTextContrast', 'minimumNonTextContrast', 'contrast.nonText'], DEFAULT_THRESHOLDS.nonTextContrast),
    focusContrast: configuredNumber(source, ['focusContrast', 'focus.minimumContrast'], DEFAULT_THRESHOLDS.focusContrast),
    focusPixelDifference: configuredNumber(source, ['focusPixelDifference', 'focus.minimumPixelDifference'], DEFAULT_THRESHOLDS.focusPixelDifference),
    imageAspectRatioTolerance: configuredNumber(source, ['imageAspectRatioTolerance', 'imageAspectTolerance', 'media.aspectRatioTolerance'], DEFAULT_THRESHOLDS.imageAspectRatioTolerance),
    imageUpscaleTolerance: configuredNumber(source, ['imageUpscaleTolerance', 'media.upscaleTolerance'], DEFAULT_THRESHOLDS.imageUpscaleTolerance),
    maxFontFamilies: configuredNumber(source, ['maxFontFamilies', 'maximumFontFamilies', 'tokens.maxFontFamilies'], DEFAULT_THRESHOLDS.maxFontFamilies),
    maxFontSizes: configuredNumber(source, ['maxFontSizes', 'maximumFontSizes', 'tokens.maxFontSizes'], DEFAULT_THRESHOLDS.maxFontSizes),
    maxFontWeights: configuredNumber(source, ['maxFontWeights', 'tokens.maxFontWeights'], DEFAULT_THRESHOLDS.maxFontWeights),
    maxColors: configuredNumber(source, ['maxColors', 'maximumPaletteColors', 'tokens.maxColors'], DEFAULT_THRESHOLDS.maxColors),
    maxSpacingTokens: configuredNumber(source, ['maxSpacingTokens', 'tokens.maxSpacing'], DEFAULT_THRESHOLDS.maxSpacingTokens),
    maxRadii: configuredNumber(source, ['maxRadii', 'maximumRadiusTokens', 'tokens.maxRadii'], DEFAULT_THRESHOLDS.maxRadii),
    maxShadows: configuredNumber(source, ['maxShadows', 'maximumShadowTokens', 'tokens.maxShadows'], DEFAULT_THRESHOLDS.maxShadows),
    maxButtonVariants: configuredNumber(source, ['maxButtonVariants', 'maximumButtonVariants', 'tokens.maxButtonVariants'], DEFAULT_THRESHOLDS.maxButtonVariants),
    maxInputVariants: configuredNumber(source, ['maxInputVariants', 'maximumInputVariants', 'tokens.maxInputVariants'], DEFAULT_THRESHOLDS.maxInputVariants),
    nearColorDistance: configuredNumber(source, ['nearColorDistance'], DEFAULT_THRESHOLDS.nearColorDistance),
    maximumLineCharacters: configuredNumber(source, ['maximumLineCharacters'], DEFAULT_THRESHOLDS.maximumLineCharacters),
  };
}

function normalizedUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    parsed.searchParams.sort();
    return parsed.href;
  } catch {
    return String(value).trim();
  }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function stableIssueId(ruleId, location, discriminator = '') {
  const viewport = location.viewport ?? {};
  const identity = [
    ruleId,
    normalizedUrl(location.url),
    location.checkpoint ?? '',
    location.theme ?? '',
    viewport.name ?? '',
    viewport.width ?? '',
    viewport.height ?? '',
    location.stableKey ?? location.selector ?? 'capture',
    discriminator,
  ].join('|');
  return `uiux-${hash(identity)}`;
}

function captureLocation(capture, element) {
  return {
    captureId: capture.captureId ?? null,
    url: capture.url ?? null,
    checkpoint: capture.checkpoint ?? 'initial',
    theme: capture.theme ?? 'light',
    viewport: {
      name: capture.viewport?.name ?? null,
      width: finiteNumber(capture.viewport?.width),
      height: finiteNumber(capture.viewport?.height),
    },
    ...(element
      ? {
          selector: element.selector ?? null,
          stableKey: element.stableKey ?? element.selector ?? null,
        }
      : {}),
  };
}

function issue(capture, element, definition) {
  const location = captureLocation(capture, element);
  const guidance = guidanceForRule(definition.ruleId);
  const result = {
    id: stableIssueId(definition.ruleId, location, definition.discriminator),
    ruleId: definition.ruleId,
    class: definition.class,
    status: definition.class === 'objective' ? 'fail' : 'review',
    category: definition.category,
    severity: definition.severity,
    confidence: definition.confidence ?? (definition.class === 'objective' ? 'high' : 'medium'),
    title: definition.title,
    message: definition.message,
    location,
    actual: definition.actual ?? null,
    expected: definition.expected ?? null,
    recommendation: definition.recommendation,
    impact: definition.impact ?? guidance.impact,
    owner: definition.owner ?? guidance.owner,
    standards: definition.standards ?? guidance.standards,
    remediation: {
      summary: definition.recommendation,
      steps: definition.fixSteps ?? guidance.fixSteps,
    },
    verification: {
      steps: definition.verifySteps ?? guidance.verifySteps,
      passCondition: definition.passCondition ?? guidance.passCondition,
    },
  };
  result.priority = definition.priority ?? priorityForIssue(result);
  return result;
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueSorted(values, mapper = (value) => value) {
  const byKey = new Map();
  for (const value of values) {
    const mapped = mapper(value);
    const key = JSON.stringify(mapped);
    if (!byKey.has(key)) byKey.set(key, mapped);
  }
  return [...byKey.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function createCoverage() {
  return {
    captures: { total: 0, valid: 0, invalid: 0 },
    viewports: [],
    themes: [],
    checkpoints: [],
    elements: { total: 0, text: 0, interactive: 0, images: 0 },
    checks: {
      contrast: { eligible: 0, tested: 0, passed: 0, failed: 0, indeterminate: 0 },
      targetSize: { eligible: 0, tested: 0, passed: 0, failed: 0, exempt: 0 },
      focus: { eligible: 0, tested: 0, passed: 0, failed: 0, untested: 0 },
      clipping: { tested: 0, failed: 0, exempt: 0 },
      fonts: { tested: 0, failed: 0 },
      images: { tested: 0, failed: 0 },
      accessibleNames: { eligible: 0, tested: 0, passed: 0, failed: 0 },
      formLabels: { eligible: 0, tested: 0, passed: 0, failed: 0 },
      alternativeText: { eligible: 0, tested: 0, passed: 0, failed: 0 },
      documentSemantics: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0 },
      placeholderContrast: { eligible: 0, tested: 0, passed: 0, failed: 0, indeterminate: 0 },
      nonTextContrast: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, indeterminate: 0 },
      linkDistinguishability: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, indeterminate: 0 },
      spelling: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      contentQuality: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0 },
      accessibilityEngine: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityTransport: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityHeaders: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityCsp: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityCookies: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityDom: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
      securityPrivacy: { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, untested: 0 },
    },
  };
}

function captureInvalidReason(capture) {
  const status = String(capture?.status ?? '').toLowerCase();
  if (INVALID_CAPTURE_STATUSES.has(status)) return `capture status is ${status}`;
  if (status && !VALID_CAPTURE_STATUSES.has(status)) return `capture status is ${status}`;
  const httpStatus = finiteNumber(capture?.httpStatus);
  if (httpStatus !== null && httpStatus >= 400) return `page returned HTTP ${httpStatus}`;
  const elements = Array.isArray(capture?.elements) ? capture.elements : [];
  const visibleElements = finiteNumber(capture?.metrics?.visibleElements);
  if (elements.length === 0 && (visibleElements === null || visibleElements === 0)) return 'capture contains no visible elements';
  return null;
}

function hasComplexBackground(styles = {}) {
  const images = [styles.backgroundImage];
  for (const layer of Array.isArray(styles.backgroundLayers) ? styles.backgroundLayers : []) {
    if (typeof layer === 'string') images.push(layer);
    else if (layer && typeof layer === 'object') images.push(layer.backgroundImage, layer.image, layer.gradient);
  }
  return images.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized && normalized !== 'none' && !parseCssColor(normalized);
  });
}

function effectiveBackground(styles = {}, canvasColor = '#ffffff') {
  if (hasComplexBackground(styles)) return { color: null, reason: 'image-or-gradient' };
  const layers = [styles.backgroundColor];
  for (const layer of Array.isArray(styles.backgroundLayers) ? styles.backgroundLayers : []) {
    if (typeof layer === 'string') layers.push(layer);
    else if (layer && typeof layer === 'object') {
      layers.push(layer.backgroundColor ?? layer.color ?? layer.value);
    }
  }

  let result = parseCssColor(canvasColor);
  if (!result || result.a < 1) return { color: null, reason: 'unsupported-canvas-color' };
  for (const value of layers.reverse()) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const parsed = parseCssColor(value);
    if (!parsed) return { color: null, reason: 'unsupported-background-color' };
    result = compositeColors(parsed, result);
    if (!result) return { color: null, reason: 'unsupported-background-color' };
  }
  return result ? { color: result, reason: null } : { color: null, reason: 'unparseable' };
}

function meaningfulText(element) {
  return typeof element?.text === 'string' && element.text.trim().length > 0;
}

function validBox(element) {
  const box = element?.box;
  const x = finiteNumber(box?.x);
  const y = finiteNumber(box?.y);
  const width = finiteNumber(box?.width);
  const height = finiteNumber(box?.height);
  if ([x, y, width, height].some((value) => value === null)) return null;
  return {
    x,
    y,
    width,
    height,
    right: finiteNumber(box?.right, x + width),
    bottom: finiteNumber(box?.bottom, y + height),
  };
}

function selectorRelationship(textSelector, mediaSelector) {
  if (typeof textSelector !== 'string' || typeof mediaSelector !== 'string') return null;
  const textParts = textSelector.split(/\s*>\s*/).map((part) => part.trim()).filter(Boolean);
  const mediaParts = mediaSelector.split(/\s*>\s*/).map((part) => part.trim()).filter(Boolean);
  if (!textParts.length || !mediaParts.length) return null;

  let commonDepth = 0;
  while (commonDepth < textParts.length
    && commonDepth < mediaParts.length
    && textParts[commonDepth] === mediaParts[commonDepth]) {
    commonDepth += 1;
  }

  const mediaIsDescendant = mediaParts.length > textParts.length
    && commonDepth === textParts.length;
  return {
    commonDepth,
    branchDistance: (textParts.length - commonDepth) + (mediaParts.length - commonDepth),
    mediaIsDescendant,
  };
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y));
  return width * height;
}

function isComplexMediaCandidate(element) {
  const tag = String(element?.tag ?? '').toLowerCase();
  const role = String(element?.role ?? '').toLowerCase();
  const position = String(element?.styles?.position ?? '').toLowerCase();
  if (imageData(element) || ['img', 'video', 'canvas', 'picture'].includes(tag)) return true;
  if (!['absolute', 'fixed'].includes(position)) return false;
  return tag === 'svg' || role === 'img' || hasComplexBackground(element?.styles);
}

/**
 * A sibling media layer is not represented in the text element's captured
 * ancestor backgrounds. Only treat it as relevant when the geometry and DOM
 * relationship strongly resemble deliberate text-over-media composition.
 */
function overlappingMediaBackground(capture, element) {
  const textBox = validBox(element);
  if (!textBox || textBox.width <= 0 || textBox.height <= 0) return null;
  if (hasComplexBackground(element?.styles)) return null;

  const ownBackground = parseCssColor(element?.styles?.backgroundColor);
  if (ownBackground?.a >= 0.999) return null;

  const textArea = textBox.width * textBox.height;
  const textPosition = String(element?.styles?.position ?? '').toLowerCase();
  const textZIndex = finiteNumber(element?.styles?.zIndex);
  let best = null;

  for (const candidate of (Array.isArray(capture?.elements) ? capture.elements : [])) {
    if (candidate === element || !isComplexMediaCandidate(candidate)) continue;

    const relationship = selectorRelationship(element?.selector, candidate?.selector);
    if (!relationship || relationship.mediaIsDescendant) continue;
    const sharesLocalContainer = relationship.commonDepth >= 2 || relationship.branchDistance <= 4;
    if (!sharesLocalContainer || relationship.branchDistance > 8) continue;

    const mediaBox = validBox(candidate);
    if (!mediaBox || mediaBox.width < 96 || mediaBox.height < 96) continue;
    const mediaArea = mediaBox.width * mediaBox.height;
    const overlapRatio = intersectionArea(textBox, mediaBox) / textArea;
    const areaRatio = mediaArea / textArea;
    const substantiallyLarger = mediaBox.width >= textBox.width * 1.15
      && mediaBox.height >= textBox.height * 2
      && areaRatio >= 4;
    if (overlapRatio < 0.8 || !substantiallyLarger) continue;

    const mediaPosition = String(candidate?.styles?.position ?? '').toLowerCase();
    const positionedMedia = ['absolute', 'fixed'].includes(mediaPosition);
    const positionedText = ['absolute', 'fixed'].includes(textPosition);
    if (!positionedMedia && !positionedText) continue;

    const mediaZIndex = finiteNumber(candidate?.styles?.zIndex);
    if (mediaZIndex !== null && textZIndex !== null && mediaZIndex > textZIndex) continue;

    const score = overlapRatio * Math.min(areaRatio, 100);
    if (!best || score > best.score) {
      best = {
        element: candidate,
        box: mediaBox,
        overlapRatio,
        areaRatio,
        relationship,
        score,
      };
    }
  }

  return best;
}

function cssSides(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.trim().split(/\s+/)
      : value === undefined || value === null
        ? []
        : [value];
  const parsed = raw.map((item) => finiteNumber(item));
  if (!parsed.length || parsed.some((item) => item === null) || parsed.length > 4) return null;
  if (parsed.length === 1) return [parsed[0], parsed[0], parsed[0], parsed[0]];
  if (parsed.length === 2) return [parsed[0], parsed[1], parsed[0], parsed[1]];
  if (parsed.length === 3) return [parsed[0], parsed[1], parsed[2], parsed[1]];
  return parsed;
}

/**
 * Recognize the complete, canonical screen-reader-only CSS recipe captured by
 * the scanner. Requiring every signal avoids treating an accidentally tiny or
 * genuinely clipped visible element as hidden accessibility copy.
 */
function isCanonicalVisuallyHidden(element, box = validBox(element)) {
  if (!box || !meaningfulText(element) || element.interactive || imageData(element)) return false;
  const styles = element.styles ?? {};
  const margin = cssSides(styles.margin);
  const padding = cssSides(styles.padding);
  const overflowX = String(styles.overflowX ?? '').toLowerCase();
  const overflowY = String(styles.overflowY ?? '').toLowerCase();
  const borderWidth = finiteNumber(styles.borderWidth);
  const tinyBox = box.width > 0 && box.width <= 1.5 && box.height > 0 && box.height <= 1.5;
  const clippedOverflow = ['hidden', 'clip'].includes(overflowX)
    && ['hidden', 'clip'].includes(overflowY);
  const negativeMargin = margin
    && margin.some((value) => value <= -0.5)
    && margin.every((value) => value <= 0);
  const zeroPadding = padding && padding.every((value) => Math.abs(value) <= 0.01);

  return tinyBox
    && String(styles.position ?? '').toLowerCase() === 'absolute'
    && clippedOverflow
    && String(styles.whiteSpace ?? '').toLowerCase() === 'nowrap'
    && negativeMargin
    && zeroPadding
    && borderWidth !== null
    && Math.abs(borderWidth) <= 0.01;
}

function tokenValues(entries) {
  if (!Array.isArray(entries)) return [];
  const values = entries
    .map((entry) => (entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry))
    .filter((value) => value !== undefined && value !== null && value !== '');
  return uniqueSorted(values, (value) => (typeof value === 'string' ? value.trim() : value));
}

function circleIntersectsRectangle(centerX, centerY, radius, box) {
  const closestX = Math.max(box.x, Math.min(centerX, box.right));
  const closestY = Math.max(box.y, Math.min(centerY, box.bottom));
  return Math.hypot(centerX - closestX, centerY - closestY) < radius;
}

function spacingExceptionResult(element, interactiveElements, minimumSize) {
  const box = validBox(element);
  if (!box) return { passes: false, nearest: null };
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radius = minimumSize / 2;

  for (const candidate of interactiveElements) {
    if (candidate === element || candidate.inline) continue;
    const other = validBox(candidate);
    if (!other || other.width <= 0 || other.height <= 0) continue;
    const otherUndersized = other.width < minimumSize || other.height < minimumSize;
    const intersects = otherUndersized
      ? Math.hypot(centerX - (other.x + other.width / 2), centerY - (other.y + other.height / 2)) < minimumSize
      : circleIntersectsRectangle(centerX, centerY, radius, other);
    if (intersects) {
      return { passes: false, nearest: candidate.stableKey ?? candidate.selector ?? null };
    }
  }
  return { passes: true, nearest: null };
}

function isInlineTextTarget(element) {
  if (!element?.inline || !meaningfulText(element)) return false;
  const tag = String(element.tag ?? '').toLowerCase();
  const role = String(element.role ?? '').toLowerCase();
  return tag === 'a' || role === 'link';
}

function isKnownTwoDimensionalContent(element) {
  const tag = String(element?.tag ?? '').toLowerCase();
  const role = String(element?.role ?? '').toLowerCase();
  return ['table', 'canvas'].includes(tag) || ['table', 'grid', 'treegrid'].includes(role);
}

function imageData(element) {
  if (!element?.image || typeof element.image !== 'object') return null;
  return element.image;
}

function comparableAssetUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return normalizedUrl(new URL(value, baseUrl).href);
  } catch {
    return normalizedUrl(value);
  }
}

function matchingFailedImageAsset(capture, image) {
  const sources = new Set(
    [image.currentSrc, image.src]
      .map((value) => comparableAssetUrl(value, capture.url))
      .filter(Boolean),
  );
  if (!sources.size) return null;

  for (const asset of (Array.isArray(capture.assets?.failed) ? capture.assets.failed : [])) {
    const data = typeof asset === 'string' ? { url: asset } : (asset ?? {});
    if (data.type && String(data.type).toLowerCase() !== 'image') continue;
    const assetUrl = comparableAssetUrl(data.url ?? data.src, capture.url);
    if (assetUrl && sources.has(assetUrl)) return data;
  }
  return null;
}

function stateElementKey(state) {
  return state?.stableKey ?? state?.element?.stableKey ?? state?.selector ?? state?.element?.selector ?? null;
}

function firstBoolean(...values) {
  return values.find((value) => typeof value === 'boolean');
}

function selectedStyle(style = {}) {
  return Object.fromEntries(FOCUS_STYLE_PROPERTIES.map((key) => [key, style?.[key] ?? null]));
}

function focusStyleChanged(state) {
  const explicit = firstBoolean(state?.focusChanged, state?.hasVisibleFocus, state?.hasVisualChange, state?.visualChange, state?.changed);
  if (explicit !== undefined) return explicit;

  const before = state?.base ?? state?.before ?? state?.default ?? state?.defaultStyles ?? state?.baseStyles;
  const after = state?.after ?? state?.focus ?? state?.focusStyles ?? state?.styles;
  if (before && after) return JSON.stringify(selectedStyle(before)) !== JSON.stringify(selectedStyle(after));
  if (after) {
    const outlineWidth = finiteNumber(after.outlineWidth, 0);
    const outlineStyle = String(after.outlineStyle ?? '').toLowerCase();
    const boxShadow = String(after.boxShadow ?? '').toLowerCase();
    const visibleOutline = outlineWidth > 0 && !['', 'none', 'hidden'].includes(outlineStyle);
    const visibleShadow = boxShadow && boxShadow !== 'none';
    return Boolean(visibleOutline || visibleShadow);
  }
  return undefined;
}

function analyzeContrast(capture, element, thresholds, config, coverage, issues) {
  if (!meaningfulText(element)) return;
  coverage.elements.text += 1;
  coverage.checks.contrast.eligible += 1;

  const foreground = parseCssColor(element.styles?.color);
  const overlappingMedia = overlappingMediaBackground(capture, element);
  const background = overlappingMedia
    ? { color: null, reason: 'overlapping-media' }
    : effectiveBackground(element.styles, config.canvasColor ?? '#ffffff');
  if (!foreground || !background.color) {
    const reason = overlappingMedia
      ? 'overlapping-media'
      : !foreground
        ? 'unsupported-foreground-color'
        : background.reason;
    const explanation = reason === 'image-or-gradient'
      ? ' because the text is drawn over an image or gradient'
      : reason === 'overlapping-media'
        ? ' because a large media layer overlaps the text and may form its rendered background'
      : reason?.startsWith('unsupported')
        ? ' because a computed CSS color could not be converted safely'
        : '';
    coverage.checks.contrast.indeterminate += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.text-contrast-indeterminate',
      class: 'heuristic',
      category: 'Color',
      severity: 'minor',
      confidence: 'high',
      title: 'Review text contrast on a complex background',
      message: `Contrast could not be calculated${explanation}.`,
      actual: {
        foreground: element.styles?.color ?? null,
        background: element.styles?.backgroundColor ?? null,
        reason,
        ...(overlappingMedia
          ? {
              overlappingMedia: {
                tag: overlappingMedia.element?.tag ?? null,
                selector: overlappingMedia.element?.selector ?? null,
                stableKey: overlappingMedia.element?.stableKey ?? overlappingMedia.element?.selector ?? null,
                box: overlappingMedia.box,
                position: overlappingMedia.element?.styles?.position ?? null,
                overlapRatio: Number(overlappingMedia.overlapRatio.toFixed(3)),
                areaRatio: Number(overlappingMedia.areaRatio.toFixed(3)),
              },
            }
          : {}),
      },
      expected: { manualReview: true },
      recommendation: 'Inspect the least-contrasting part of the rendered background and verify the text remains readable.',
    }));
    return;
  }

  const ratio = contrastRatio(foreground, background.color);
  if (ratio === null) {
    coverage.checks.contrast.indeterminate += 1;
    return;
  }
  coverage.checks.contrast.tested += 1;
  const large = isLargeText(element.styles?.fontSize, element.styles?.fontWeight);
  const required = large ? thresholds.largeTextContrast : thresholds.normalTextContrast;
  if (ratio < required) {
    coverage.checks.contrast.failed += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.text-contrast',
      class: 'objective',
      category: 'Color',
      severity: ratio < 3 ? 'major' : 'minor',
      title: 'Increase text contrast',
      message: `Text contrast is ${ratio.toFixed(2)}:1; this text requires at least ${required}:1.`,
      actual: { ratio: Number(ratio.toFixed(3)), foreground: element.styles?.color ?? null, background: element.styles?.backgroundColor ?? null },
      expected: { minimumRatio: required, largeText: large },
      recommendation: 'Use a text or background color pair that meets the required contrast ratio in every visual state.',
    }));
  } else {
    coverage.checks.contrast.passed += 1;
  }
}

function renderedColor(value, opacity, background) {
  const parsed = parseCssColor(value);
  if (!parsed || !background) return null;
  const alpha = Math.max(0, Math.min(1, parsed.a * (finiteNumber(opacity, 1))));
  return compositeColors({ ...parsed, a: alpha }, background);
}

function adjacentBackground(styles = {}, canvasColor = '#ffffff') {
  return effectiveBackground({
    backgroundColor: 'transparent',
    backgroundLayers: styles.backgroundLayers,
  }, canvasColor);
}

function analyzePlaceholderContrast(capture, element, thresholds, config, coverage, issues) {
  const placeholder = String(element?.placeholder || '').trim();
  if (!placeholder || element?.disabled) return;
  const tag = String(element?.tag || '').toLowerCase();
  if (!['input', 'textarea'].includes(tag)) return;

  const check = coverage.checks.placeholderContrast;
  check.eligible += 1;
  const background = effectiveBackground(element.styles, config.canvasColor ?? '#ffffff');
  const foreground = background.color
    ? renderedColor(element.styles?.placeholderColor, element.styles?.placeholderOpacity, background.color)
    : null;
  if (!background.color || !foreground) {
    check.indeterminate += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.placeholder-contrast-indeterminate',
      class: 'heuristic',
      category: 'Color',
      severity: 'minor',
      confidence: 'high',
      title: 'Review placeholder contrast',
      message: 'Placeholder contrast could not be measured safely against the rendered background.',
      actual: {
        placeholderColor: element.styles?.placeholderColor ?? null,
        placeholderOpacity: element.styles?.placeholderOpacity ?? null,
        backgroundReason: background.reason,
      },
      expected: { manualReview: true },
      recommendation: 'Measure the rendered placeholder against its least-contrasting background and do not use it as the only label.',
    }));
    return;
  }

  check.tested += 1;
  const ratio = contrastRatio(foreground, background.color);
  const large = isLargeText(element.styles?.fontSize, element.styles?.fontWeight);
  const required = large ? thresholds.largeTextContrast : thresholds.normalTextContrast;
  if (ratio !== null && ratio < required) {
    check.failed += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.placeholder-contrast',
      class: 'objective',
      category: 'Color',
      severity: ratio < 3 ? 'major' : 'minor',
      title: 'Increase placeholder text contrast',
      message: `Placeholder contrast is ${ratio.toFixed(2)}:1; it requires at least ${required}:1.`,
      actual: {
        ratio: Number(ratio.toFixed(3)),
        placeholderColor: element.styles?.placeholderColor ?? null,
        placeholderOpacity: element.styles?.placeholderOpacity ?? null,
      },
      expected: { minimumRatio: required, largeText: large },
      recommendation: 'Use a placeholder color and opacity that meet text contrast requirements in every applicable theme and state.',
    }));
  } else if (ratio !== null) {
    check.passed += 1;
  }
}

function analyzeNonTextContrast(capture, element, thresholds, config, coverage, issues) {
  const tag = String(element?.tag || '').toLowerCase();
  const role = String(element?.role || '').toLowerCase();
  const inputButton = tag === 'input' && ['button', 'image', 'reset', 'submit'].includes(String(element?.inputType || '').toLowerCase());
  const formControl = ((['input', 'select', 'textarea'].includes(tag) && !inputButton)
    || ['checkbox', 'combobox', 'radio', 'searchbox', 'slider', 'spinbutton', 'switch', 'textbox'].includes(role))
    && role !== 'button';
  if (!formControl || element?.disabled || element?.inputType === 'hidden') return;

  const check = coverage.checks.nonTextContrast;
  check.eligible += 1;
  const background = adjacentBackground(element.styles, config.canvasColor ?? '#ffffff');
  if (!background.color) {
    check.indeterminate += 1;
    return;
  }

  const candidates = [];
  const borderWidth = finiteNumber(element.styles?.borderWidth, 0);
  if (borderWidth > 0) candidates.push({ source: 'border', value: element.styles?.borderColor });
  candidates.push({ source: 'fill', value: element.styles?.backgroundColor });
  const measured = candidates.map((candidate) => {
    const color = renderedColor(candidate.value, element.styles?.opacity, background.color);
    return color ? { ...candidate, ratio: contrastRatio(color, background.color) } : null;
  }).filter((candidate) => candidate?.ratio !== null);

  if (!measured.length) {
    check.indeterminate += 1;
    return;
  }
  check.tested += 1;
  const strongest = measured.sort((left, right) => right.ratio - left.ratio)[0];
  if (strongest.ratio < thresholds.nonTextContrast) {
    check.review += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.non-text-contrast',
      class: 'heuristic',
      category: 'Color',
      severity: 'minor',
      title: 'Review control boundary contrast',
      message: `The strongest measured control boundary is ${strongest.ratio.toFixed(2)}:1 against adjacent color; the review target is ${thresholds.nonTextContrast}:1.`,
      actual: {
        strongestSource: strongest.source,
        ratio: Number(strongest.ratio.toFixed(3)),
        candidates: measured.map((candidate) => ({ source: candidate.source, value: candidate.value, ratio: Number(candidate.ratio.toFixed(3)) })),
      },
      expected: { minimumRatio: thresholds.nonTextContrast, essentialVisualCue: true },
      recommendation: 'Strengthen the essential border, fill, or state indicator and verify it against every adjacent color. Confirm decorative boundaries separately.',
    }));
  } else {
    check.passed += 1;
  }
}

function analyzeLinkDistinguishability(capture, element, thresholds, coverage, issues) {
  const tag = String(element?.tag || '').toLowerCase();
  const role = String(element?.role || '').toLowerCase();
  if ((tag !== 'a' && role !== 'link') || !element?.inTextBlock) return;

  const check = coverage.checks.linkDistinguishability;
  check.eligible += 1;
  if (String(element.styles?.textDecorationLine || '').toLowerCase().includes('underline')) {
    check.tested += 1;
    check.passed += 1;
    return;
  }

  const link = parseCssColor(element.styles?.color);
  const surrounding = parseCssColor(element.styles?.parentColor);
  if (!link || !surrounding) {
    check.indeterminate += 1;
    return;
  }
  const ratio = contrastRatio(link, surrounding);
  check.tested += 1;
  if (ratio !== null && ratio < thresholds.nonTextContrast) {
    check.review += 1;
    issues.push(issue(capture, element, {
      ruleId: 'color.link-distinguishability',
      class: 'heuristic',
      category: 'Color',
      severity: 'minor',
      title: 'Distinguish the inline link without relying on weak color contrast',
      message: `The non-underlined inline link differs from surrounding text by ${ratio.toFixed(2)}:1; color-only differentiation should reach ${thresholds.nonTextContrast}:1 and include an additional interaction cue.`,
      actual: { ratio: Number(ratio.toFixed(3)), linkColor: element.styles?.color, surroundingTextColor: element.styles?.parentColor, underlined: false },
      expected: { minimumColorDifference: thresholds.nonTextContrast, additionalVisualCue: true },
      recommendation: 'Underline the link by default or provide sufficient color differentiation plus a clear non-color cue on hover and keyboard focus.',
    }));
  } else if (ratio !== null) {
    check.passed += 1;
  }
}

function isBodyCopy(element) {
  const tag = String(element?.tag || '').toLowerCase();
  return !element?.interactive
    && ['p', 'li', 'dd', 'dt', 'blockquote'].includes(tag)
    && String(element?.text || '').trim().length >= 20;
}

function letters(value) {
  return String(value || '').match(/\p{L}/gu) || [];
}

function analyzeReadability(capture, element, thresholds, issues) {
  if (!meaningfulText(element)) return;
  const fontSize = finiteNumber(element.styles?.fontSize);
  if (fontSize !== null && fontSize > 0 && fontSize < thresholds.minimumReadableFontSize) {
    issues.push(issue(capture, element, {
      ruleId: 'typography.small-text',
      class: 'heuristic',
      category: 'Typography',
      severity: 'minor',
      title: 'Review very small text',
      message: `Rendered text is ${fontSize}px, below the configured ${thresholds.minimumReadableFontSize}px readability threshold.`,
      actual: { fontSize },
      expected: { minimumReadableFontSize: thresholds.minimumReadableFontSize },
      recommendation: 'Increase the type size or confirm that the text is intentionally secondary and remains legible on the target device.',
    }));
  }
  const bodyCopy = isBodyCopy(element);
  if (bodyCopy && fontSize !== null
    && fontSize >= thresholds.minimumReadableFontSize
    && fontSize < thresholds.minimumBodyFontSize) {
    issues.push(issue(capture, element, {
      ruleId: 'typography.small-body-text',
      class: 'heuristic',
      category: 'Typography',
      severity: 'minor',
      title: 'Review small body copy',
      message: `Body copy is ${fontSize}px, below the configured ${thresholds.minimumBodyFontSize}px body-text threshold.`,
      actual: { fontSize, textSample: element.text.slice(0, 120) },
      expected: { minimumBodyFontSize: thresholds.minimumBodyFontSize },
      recommendation: 'Use the approved body-text token or confirm readability on the smallest supported physical display.',
    }));
  }

  const lineHeight = finiteNumber(element.styles?.lineHeight);
  if (fontSize && lineHeight !== null) {
    const ratio = lineHeight / fontSize;
    if (ratio < thresholds.minimumLineHeightRatio) {
      issues.push(issue(capture, element, {
        ruleId: 'typography.tight-line-height',
        class: 'heuristic',
        category: 'Typography',
        severity: 'minor',
        title: 'Review tight line spacing',
        message: `Line height is ${ratio.toFixed(2)} times the font size, below the configured ${thresholds.minimumLineHeightRatio} ratio.`,
        actual: { fontSize, lineHeight, ratio: Number(ratio.toFixed(3)) },
        expected: { minimumRatio: thresholds.minimumLineHeightRatio },
        recommendation: 'Increase line height and confirm multi-line text does not look crowded or clip glyphs.',
      }));
    } else if (bodyCopy && ratio < thresholds.recommendedBodyLineHeightRatio) {
      issues.push(issue(capture, element, {
        ruleId: 'typography.body-line-height',
        class: 'heuristic',
        category: 'Typography',
        severity: 'info',
        title: 'Review dense body-copy line spacing',
        message: `Body-copy line height is ${ratio.toFixed(2)} times the font size; the configured review target is ${thresholds.recommendedBodyLineHeightRatio}.`,
        actual: { fontSize, lineHeight, ratio: Number(ratio.toFixed(3)) },
        expected: { recommendedMinimumRatio: thresholds.recommendedBodyLineHeightRatio },
        recommendation: 'Increase the body-copy line height unless a documented compact component requires this density.',
      }));
    }
  }

  const letterSpacing = finiteNumber(element.styles?.letterSpacing);
  if (fontSize && letterSpacing !== null && element.text.length >= 12
    && letterSpacing / fontSize < -thresholds.maximumNegativeLetterSpacingEm) {
    issues.push(issue(capture, element, {
      ruleId: 'typography.tight-letter-spacing',
      class: 'heuristic',
      category: 'Typography',
      severity: 'minor',
      title: 'Review tightly tracked text',
      message: 'Negative letter spacing may reduce legibility, especially at small sizes and for localized copy.',
      actual: { fontSize, letterSpacing, em: Number((letterSpacing / fontSize).toFixed(3)) },
      expected: { minimumEm: -thresholds.maximumNegativeLetterSpacingEm },
      recommendation: 'Use the approved tracking token and avoid tight negative spacing for body copy or small labels.',
    }));
  }

  const textLetters = letters(element.text);
  const uppercaseLetters = textLetters.filter((character) => (
    character === character.toLocaleUpperCase() && character !== character.toLocaleLowerCase()
  ));
  if (textLetters.length > thresholds.maximumUppercaseCharacters
    && uppercaseLetters.length / textLetters.length >= 0.8) {
    issues.push(issue(capture, element, {
      ruleId: 'typography.long-uppercase',
      class: 'heuristic',
      category: 'Typography',
      severity: 'info',
      title: 'Review the long uppercase text',
      message: 'A long text run is predominantly uppercase and may be slower to scan.',
      actual: { letters: textLetters.length, uppercaseRatio: Number((uppercaseLetters.length / textLetters.length).toFixed(3)) },
      expected: { maximumUppercaseCharacters: thresholds.maximumUppercaseCharacters },
      recommendation: 'Use sentence or title case for longer copy and reserve uppercase for short, intentional labels.',
    }));
  }

  const box = validBox(element);
  const estimatedLineHeight = lineHeight || (fontSize ? fontSize * 1.2 : null);
  const appearsSingleLine = box && estimatedLineHeight
    && (box.height <= estimatedLineHeight * 1.5
      || ['nowrap', 'pre'].includes(String(element.styles?.whiteSpace).toLowerCase()));
  const estimatedCharactersPerLine = box && fontSize
    ? box.width / Math.max(fontSize * 0.52, 1)
    : null;
  if ((appearsSingleLine && element.text.length > thresholds.maximumLineCharacters)
    || (bodyCopy && estimatedCharactersPerLine > thresholds.maximumLineCharacters)) {
    issues.push(issue(capture, element, {
      ruleId: 'typography.long-line',
      class: 'heuristic',
      category: 'Typography',
      severity: 'info',
      title: 'Review the long unwrapped text line',
      message: 'A long text run appears on one rendered line and may be difficult to scan.',
      actual: { characters: element.text.length, width: box.width, estimatedCharactersPerLine: estimatedCharactersPerLine === null ? null : Number(estimatedCharactersPerLine.toFixed(1)) },
      expected: { recommendedMaximumCharacters: thresholds.maximumLineCharacters },
      recommendation: 'Constrain the readable measure or allow natural wrapping unless the content must remain on one line.',
    }));
  }
}

function analyzeElementLayout(capture, element, thresholds, coverage, issues) {
  const box = validBox(element);
  if (!box) return;
  const viewportWidth = finiteNumber(capture.viewport?.width);
  const meaningful = meaningfulText(element) || element.interactive || Boolean(imageData(element));
  const clipped = Boolean(element.clippedHorizontal || element.clippedVertical);
  const intentionallyCroppedImage = imageData(element) && ['cover', 'contain'].includes(String(element.styles?.objectFit).toLowerCase());

  if (meaningful && clipped && isCanonicalVisuallyHidden(element, box)) {
    coverage.checks.clipping.exempt += 1;
    return;
  }

  if (meaningful && clipped && !intentionallyCroppedImage) {
    coverage.checks.clipping.tested += 1;
    coverage.checks.clipping.failed += 1;
    issues.push(issue(capture, element, {
      ruleId: 'layout.content-clipped',
      class: 'objective',
      category: 'Layout',
      severity: element.interactive ? 'major' : 'minor',
      title: 'Prevent visible content from being clipped',
      message: `Content is clipped${element.clippedHorizontal && element.clippedVertical ? ' horizontally and vertically' : element.clippedHorizontal ? ' horizontally' : ' vertically'}.`,
      actual: { clippedHorizontal: Boolean(element.clippedHorizontal), clippedVertical: Boolean(element.clippedVertical), box },
      expected: { clippedHorizontal: false, clippedVertical: false },
      recommendation: 'Allow the content to wrap or resize the container so that all meaningful content remains visible.',
    }));
  } else if (meaningful) {
    coverage.checks.clipping.tested += 1;
  }

  if (viewportWidth !== null) {
    const outside = box.x < -thresholds.offscreenTolerance || box.right > viewportWidth + thresholds.offscreenTolerance;
    if (outside && meaningful) {
      const documentOverflow = finiteNumber(capture.metrics?.documentWidth, viewportWidth) - viewportWidth > thresholds.horizontalOverflow;
      const objective = Boolean(element.interactive && documentOverflow);
      issues.push(issue(capture, element, {
        ruleId: objective ? 'layout.interactive-offscreen' : 'layout.content-offscreen-review',
        class: objective ? 'objective' : 'heuristic',
        category: 'Layout',
        severity: objective ? 'major' : 'minor',
        title: objective ? 'Keep interactive content inside the viewport' : 'Review content positioned outside the viewport',
        message: `The element spans x=${box.x} to ${box.right} in a ${viewportWidth}px-wide viewport.`,
        actual: { left: box.x, right: box.right, viewportWidth },
        expected: { minimumLeft: 0, maximumRight: viewportWidth },
        recommendation: 'Reflow, wrap, or constrain the element at this viewport; confirm that it is not an intentional carousel item.',
      }));
    }
  }
}

function analyzeImage(capture, element, thresholds, coverage, issues) {
  const image = imageData(element);
  if (!image) return;
  coverage.elements.images += 1;
  coverage.checks.images.tested += 1;
  const naturalWidth = finiteNumber(image.naturalWidth);
  const naturalHeight = finiteNumber(image.naturalHeight);
  const source = image.currentSrc ?? image.src ?? null;
  const explicitLoadError = image.failed === true || image.error === true;
  const failedAsset = matchingFailedImageAsset(capture, image);
  const completedWithoutIntrinsicSize = image.complete === true && (naturalWidth === 0 || naturalHeight === 0);
  const failureEvidence = explicitLoadError
    ? 'element-load-error'
    : failedAsset
      ? 'failed-asset-request'
      : completedWithoutIntrinsicSize
        ? 'completed-without-intrinsic-dimensions'
        : null;

  if (failureEvidence) {
    coverage.checks.images.failed += 1;
    issues.push(issue(capture, element, {
      ruleId: 'media.image-broken',
      class: 'objective',
      category: 'Media',
      severity: 'major',
      title: 'Fix the broken image',
      message: failureEvidence === 'element-load-error'
        ? 'The image emitted an explicit load error.'
        : failureEvidence === 'failed-asset-request'
          ? 'The image has a matching failed network request.'
          : 'The browser marked the image complete, but it has no usable intrinsic dimensions.',
      actual: {
        source,
        complete: image.complete ?? null,
        naturalWidth,
        naturalHeight,
        failureEvidence,
        failedAsset,
      },
      expected: { complete: true, naturalWidth: '> 0', naturalHeight: '> 0' },
      recommendation: 'Correct the image source or loading policy and provide a reliable fallback.',
    }));
    return;
  }

  const unresolved = image.complete === false || naturalWidth === 0 || naturalHeight === 0;
  if (unresolved) {
    issues.push(issue(capture, element, {
      ruleId: 'media.image-load-unconfirmed',
      class: 'heuristic',
      category: 'Media',
      severity: 'minor',
      title: 'Review the incomplete image capture',
      message: 'The image was incomplete when captured, but no matching failed request or load error was recorded. It may be lazy-loaded or not yet in view.',
      actual: {
        source,
        complete: image.complete ?? null,
        naturalWidth,
        naturalHeight,
        loading: image.loading ?? null,
        failedAssetEvidence: false,
      },
      expected: { captureState: 'Loaded after entering the viewport, or accompanied by explicit failure evidence' },
      recommendation: 'Bring the image into view and wait for loading to settle; treat it as broken only if a load error or failed request is observed.',
    }));
    return;
  }

  const box = validBox(element);
  if (!box || !naturalWidth || !naturalHeight || box.width <= 0 || box.height <= 0) return;
  const objectFit = String(element.styles?.objectFit ?? image.objectFit ?? 'fill').toLowerCase();
  const intrinsicRatio = naturalWidth / naturalHeight;
  const renderedRatio = box.width / box.height;
  const ratioDifference = Math.abs(renderedRatio / intrinsicRatio - 1);
  if (!['cover', 'contain', 'scale-down', 'none'].includes(objectFit) && ratioDifference > thresholds.imageAspectRatioTolerance) {
    coverage.checks.images.failed += 1;
    issues.push(issue(capture, element, {
      ruleId: 'media.image-distorted',
      class: 'objective',
      category: 'Media',
      severity: 'minor',
      title: 'Preserve the image aspect ratio',
      message: `The rendered aspect ratio differs from the intrinsic image ratio by ${(ratioDifference * 100).toFixed(1)}%.`,
      actual: { naturalWidth, naturalHeight, renderedWidth: box.width, renderedHeight: box.height, objectFit },
      expected: { maximumRelativeDifference: thresholds.imageAspectRatioTolerance },
      recommendation: 'Preserve the intrinsic aspect ratio or use object-fit when deliberate cropping is required.',
    }));
  }

  const dpr = finiteNumber(capture.viewport?.dpr, 1);
  const upscale = Math.max((box.width * dpr) / naturalWidth, (box.height * dpr) / naturalHeight);
  if (upscale > thresholds.imageUpscaleTolerance) {
    issues.push(issue(capture, element, {
      ruleId: 'media.image-upscaled',
      class: 'heuristic',
      category: 'Media',
      severity: 'minor',
      title: 'Review image sharpness',
      message: `The image is rendered at ${upscale.toFixed(2)} times its intrinsic pixel size.`,
      actual: { upscale: Number(upscale.toFixed(3)), naturalWidth, naturalHeight, renderedWidth: box.width, renderedHeight: box.height, dpr },
      expected: { maximumUpscale: thresholds.imageUpscaleTolerance },
      recommendation: 'Supply a higher-resolution source or a responsive srcset for this display size.',
    }));
  }
}

function analyzeTargets(capture, elements, thresholds, coverage, issues) {
  const interactiveElements = elements.filter((element) => element?.interactive);
  coverage.elements.interactive += interactiveElements.length;
  coverage.checks.targetSize.eligible += interactiveElements.length;

  for (const element of interactiveElements) {
    if (isInlineTextTarget(element)) {
      coverage.checks.targetSize.exempt += 1;
      continue;
    }
    const box = validBox(element);
    if (!box) continue;
    coverage.checks.targetSize.tested += 1;
    const meetsSize = box.width >= thresholds.targetSize && box.height >= thresholds.targetSize;
    const spacing = meetsSize ? { passes: true, nearest: null } : spacingExceptionResult(element, interactiveElements, thresholds.targetSize);
    if (!meetsSize && !spacing.passes) {
      coverage.checks.targetSize.failed += 1;
      issues.push(issue(capture, element, {
        ruleId: 'interaction.target-size',
        class: 'objective',
        category: 'Interaction',
        severity: 'major',
        title: 'Increase the pointer target size or spacing',
        message: `The ${box.width.toFixed(1)}×${box.height.toFixed(1)}px target is below ${thresholds.targetSize}×${thresholds.targetSize}px and does not meet the spacing exception.`,
        actual: { width: box.width, height: box.height, nearestTarget: spacing.nearest },
        expected: { minimumWidth: thresholds.targetSize, minimumHeight: thresholds.targetSize, spacingException: true },
        recommendation: 'Increase the active target area or add enough separation from neighboring targets.',
      }));
      continue;
    }

    coverage.checks.targetSize.passed += 1;
    if (thresholds.recommendedTargetSize > thresholds.targetSize
      && (box.width < thresholds.recommendedTargetSize || box.height < thresholds.recommendedTargetSize)) {
      issues.push(issue(capture, element, {
        ruleId: 'interaction.target-size-advisory',
        class: 'heuristic',
        category: 'Interaction',
        severity: 'info',
        title: 'Consider a larger interaction target',
        message: `The target is ${box.width.toFixed(1)}×${box.height.toFixed(1)}px; ${thresholds.recommendedTargetSize}×${thresholds.recommendedTargetSize}px is the configured comfort target.`,
        actual: { width: box.width, height: box.height },
        expected: { recommendedWidth: thresholds.recommendedTargetSize, recommendedHeight: thresholds.recommendedTargetSize },
        recommendation: 'Consider enlarging the active area for easier touch and pointer use.',
      }));
    }
  }
}

function analyzeFocus(capture, elements, thresholds, coverage, issues) {
  const interactives = elements.filter((element) => element?.interactive);
  const states = Array.isArray(capture.interactiveStates) ? capture.interactiveStates : [];
  const stateByKey = new Map(states.map((state) => [stateElementKey(state), state]).filter(([key]) => key));
  coverage.checks.focus.eligible += interactives.length;

  for (const element of interactives) {
    const key = element.stableKey ?? element.selector ?? null;
    const state = stateByKey.get(key)
      ?? states.find((candidate) => candidate?.selector && candidate.selector === element.selector);
    if (!state) {
      coverage.checks.focus.untested += 1;
      continue;
    }

    const visible = firstBoolean(state.focusVisible, state.visible, state.focus?.visible, state.after?.visible);
    const obscured = firstBoolean(state.focusObscured, state.obscured, state.focus?.obscured, state.after?.obscured);
    const pixelDifference = finiteNumber(state.pixelDifferenceRatio ?? state.pixelDifference ?? state.visualDifference);
    const styleChanged = focusStyleChanged(state);
    const changed = styleChanged === undefined && pixelDifference !== null
      ? pixelDifference >= thresholds.focusPixelDifference
      : styleChanged;
    if (visible === undefined && obscured === undefined && changed === undefined) {
      coverage.checks.focus.untested += 1;
      continue;
    }
    coverage.checks.focus.tested += 1;

    if (visible === false || changed === false) {
      coverage.checks.focus.failed += 1;
      issues.push(issue(capture, element, {
        ruleId: 'focus.not-visible',
        class: 'objective',
        category: 'Interaction',
        severity: 'major',
        title: 'Provide a visible keyboard focus indicator',
        message: 'Keyboard focus produced no reliably visible styling change.',
        actual: { focusVisible: visible ?? null, visualChange: changed ?? null },
        expected: { focusVisible: true, visualChange: true },
        recommendation: 'Add a persistent outline, border, shadow, or other clearly visible focus treatment.',
      }));
    } else if (obscured === true) {
      coverage.checks.focus.failed += 1;
      issues.push(issue(capture, element, {
        ruleId: 'focus.obscured',
        class: 'objective',
        category: 'Interaction',
        severity: 'major',
        title: 'Keep the focused control visible',
        message: 'The focused element is obscured by author-created content.',
        actual: { obscured: true },
        expected: { obscured: false },
        recommendation: 'Adjust sticky content, scroll padding, or focus behavior so the focused control remains visible.',
      }));
    } else {
      coverage.checks.focus.passed += 1;
    }

    const focusContrast = finiteNumber(state.focusContrast ?? state.contrastRatio ?? state.focus?.contrastRatio);
    if (focusContrast !== null && focusContrast < thresholds.focusContrast) {
      issues.push(issue(capture, element, {
        ruleId: 'focus.appearance-contrast',
        class: 'heuristic',
        category: 'Interaction',
        severity: 'minor',
        title: 'Strengthen the focus indicator contrast',
        message: `The measured focus-state contrast is ${focusContrast.toFixed(2)}:1, below the configured ${thresholds.focusContrast}:1 threshold.`,
        actual: { ratio: focusContrast },
        expected: { minimumRatio: thresholds.focusContrast },
        recommendation: 'Increase focus indicator contrast against both the unfocused state and adjacent colors.',
      }));
    }

  }
}

const TOKEN_RULES = [
  { field: 'fontFamilies', threshold: 'maxFontFamilies', category: 'Typography', label: 'font families' },
  { field: 'fontSizes', threshold: 'maxFontSizes', category: 'Typography', label: 'font sizes' },
  { field: 'fontWeights', threshold: 'maxFontWeights', category: 'Typography', label: 'font weights' },
  { field: 'colors', threshold: 'maxColors', category: 'Color', label: 'colors' },
  { field: 'spacing', threshold: 'maxSpacingTokens', category: 'Consistency', label: 'spacing values' },
  { field: 'radii', threshold: 'maxRadii', category: 'Consistency', label: 'corner radii' },
  { field: 'shadows', threshold: 'maxShadows', category: 'Consistency', label: 'shadows' },
  { field: 'buttonVariants', threshold: 'maxButtonVariants', category: 'Consistency', label: 'button variants' },
  { field: 'inputVariants', threshold: 'maxInputVariants', category: 'Consistency', label: 'input variants' },
];

function normalizeFontName(value) {
  let normalized = String(value || '').trim();
  const quoteCharacters = new Set([String.fromCharCode(39), String.fromCharCode(34)]);
  if (quoteCharacters.has(normalized[0])) normalized = normalized.slice(1);
  if (quoteCharacters.has(normalized[normalized.length - 1])) normalized = normalized.slice(0, -1);
  return normalized.toLowerCase();
}

function primaryFontName(value) {
  return normalizeFontName(String(value || '').split(',')[0]);
}

function canonicalColorOptions(value) {
  const parsed = parseCssColor(value);
  if (!parsed) return [];
  return uniqueSorted([
    colorToHex(parsed, false).toLowerCase(),
    colorToHex(parsed, true).toLowerCase(),
  ], String);
}

function rgbDistance(left, right) {
  return Math.sqrt(
    (left.r - right.r) ** 2
    + (left.g - right.g) ** 2
    + (left.b - right.b) ** 2
    + ((left.a - right.a) * 255) ** 2,
  );
}

function analyzeBrandTokens(capture, thresholds, config, issues) {
  const approvedFonts = new Set((config.approved?.fontFamilies || []).map(normalizeFontName).filter(Boolean));
  if (approvedFonts.size) {
    const unapproved = tokenValues(capture.tokens?.fontFamilies)
      .filter((value) => !approvedFonts.has(primaryFontName(value)));
    if (unapproved.length) {
      issues.push(issue(capture, null, {
        ruleId: 'brand.font-family',
        discriminator: unapproved.join('|'),
        class: 'heuristic',
        category: 'Typography',
        severity: 'minor',
        title: 'Review fonts outside the approved family list',
        message: 'Rendered text uses one or more primary font families that are not in the configured brand list.',
        actual: { unapproved },
        expected: { approved: [...approvedFonts].sort() },
        recommendation: 'Confirm each exception is intentional or update the component to use an approved font token.',
      }));
    }
  }

  const approvedColors = new Set((config.approved?.colors || []).flatMap(canonicalColorOptions));
  const observedColors = tokenValues(capture.tokens?.colors);
  if (approvedColors.size) {
    const unapproved = observedColors.filter((value) => {
      const options = canonicalColorOptions(value);
      return options.length && !options.some((candidate) => approvedColors.has(candidate));
    });
    if (unapproved.length) {
      issues.push(issue(capture, null, {
        ruleId: 'brand.color-palette',
        discriminator: unapproved.join('|'),
        class: 'heuristic',
        category: 'Color',
        severity: 'minor',
        title: 'Review colors outside the approved palette',
        message: 'Rendered UI colors were found outside the configured brand palette.',
        actual: { unapproved },
        expected: { approved: [...approvedColors].sort() },
        recommendation: 'Map intentional colors to approved semantic tokens and remove accidental one-off values.',
      }));
    }
  }

  const parsedColors = observedColors
    .map((value) => ({ value, parsed: parseCssColor(value) }))
    .filter((entry) => entry.parsed);
  const nearPairs = [];
  for (let left = 0; left < parsedColors.length && nearPairs.length < 10; left += 1) {
    for (let right = left + 1; right < parsedColors.length && nearPairs.length < 10; right += 1) {
      const distance = rgbDistance(parsedColors[left].parsed, parsedColors[right].parsed);
      if (distance > 0.5 && distance <= thresholds.nearColorDistance) {
        nearPairs.push({
          first: parsedColors[left].value,
          second: parsedColors[right].value,
          distance: Number(distance.toFixed(2)),
        });
      }
    }
  }
  if (nearPairs.length) {
    issues.push(issue(capture, null, {
      ruleId: 'consistency.near-duplicate-colors',
      class: 'heuristic',
      category: 'Color',
      severity: 'info',
      title: 'Review near-duplicate color values',
      message: 'Very similar colors may be accidental one-off values instead of intentional design tokens.',
      actual: { pairs: nearPairs },
      expected: { maximumDistance: thresholds.nearColorDistance },
      recommendation: 'Consolidate visually equivalent colors unless each value has a documented semantic purpose.',
    }));
  }
}

function analyzeTokens(capture, thresholds, config, issues) {
  for (const rule of TOKEN_RULES) {
    const values = tokenValues(capture.tokens?.[rule.field]);
    const maximum = thresholds[rule.threshold];
    if (values.length <= maximum) continue;
    issues.push(issue(capture, null, {
      ruleId: `consistency.token-proliferation.${rule.field}`,
      discriminator: rule.field,
      class: 'heuristic',
      category: rule.category,
      severity: 'minor',
      title: `Review the number of ${rule.label}`,
      message: `This capture uses ${values.length} distinct ${rule.label}; the configured review threshold is ${maximum}.`,
      actual: { count: values.length, values },
      expected: { maximum },
      recommendation: `Consolidate near-duplicate ${rule.label} into intentional design tokens, while retaining necessary semantic variants.`,
    }));
  }
  analyzeBrandTokens(capture, thresholds, config, issues);
}

function analyzeInteractiveOverlaps(capture, elements, issues) {
  const interactives = elements.filter((element) => element?.interactive && validBox(element));
  const overlaps = [];
  for (let left = 0; left < interactives.length && overlaps.length < 10; left += 1) {
    const a = validBox(interactives[left]);
    for (let right = left + 1; right < interactives.length && overlaps.length < 10; right += 1) {
      const b = validBox(interactives[right]);
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      const area = width * height;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (area > 4 && smaller > 0 && area / smaller >= 0.2) {
        overlaps.push({
          first: interactives[left].stableKey || interactives[left].selector,
          second: interactives[right].stableKey || interactives[right].selector,
          overlapRatio: Number((area / smaller).toFixed(3)),
        });
      }
    }
  }
  if (overlaps.length) {
    issues.push(issue(capture, null, {
      ruleId: 'layout.interactive-overlap',
      discriminator: overlaps.map((entry) => entry.first + '|' + entry.second).join(';'),
      class: 'heuristic',
      category: 'Layout',
      severity: 'minor',
      title: 'Review overlapping interactive controls',
      message: 'Interactive control rectangles overlap substantially and may compete for pointer input.',
      actual: { overlaps },
      expected: { unintendedOverlaps: 0 },
      recommendation: 'Separate the controls or confirm that the overlap is an intentional composite component with one clear hit area.',
    }));
  }
}

function analyzeFonts(capture, coverage, issues) {
  for (const font of Array.isArray(capture.fonts) ? capture.fonts : []) {
    coverage.checks.fonts.tested += 1;
    const status = String(font?.status ?? '').toLowerCase();
    if (!FAILED_FONT_STATUSES.has(status)) continue;
    coverage.checks.fonts.failed += 1;
    issues.push(issue(capture, null, {
      ruleId: 'typography.font-load-failed',
      discriminator: String(font?.family ?? 'unknown'),
      class: 'objective',
      category: 'Typography',
      severity: 'major',
      title: 'Fix the failed webfont',
      message: `The ${font?.family ?? 'unknown'} font has status “${status}”.`,
      actual: { family: font?.family ?? null, status },
      expected: { status: 'loaded' },
      recommendation: 'Correct the font URL, CORS policy, preload configuration, or declared family name and confirm the intended face renders.',
    }));
  }
}

function analyzeAssets(capture, issues) {
  for (const [index, asset] of (Array.isArray(capture.assets?.failed) ? capture.assets.failed : []).entries()) {
    const data = typeof asset === 'string' ? { url: asset } : (asset ?? {});
    const discriminator = data.url ?? data.src ?? data.family ?? String(index);
    issues.push(issue(capture, null, {
      ruleId: 'media.asset-load-failed',
      discriminator: String(discriminator),
      class: 'objective',
      category: 'Media',
      severity: 'major',
      title: 'Fix the failed visual asset',
      message: `A visual asset failed to load${discriminator ? `: ${discriminator}` : ''}.`,
      actual: data,
      expected: { loadStatus: 'success' },
      recommendation: 'Correct the asset URL, response, or access policy and repeat the capture.',
    }));
  }
}

const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea']);
const AMBIGUOUS_LINK_TEXT = /^(click here|here|read more|learn more|more|details|link)$/i;

function analyzeDocumentSemantics(capture, coverage, issues) {
  const semantics = capture?.semantics;
  if (!semantics || typeof semantics !== 'object') return;
  const check = coverage.checks.documentSemantics;

  check.eligible += 1;
  check.tested += 1;
  if (!String(capture.title || semantics.title || '').trim()) {
    check.failed += 1;
    issues.push(issue(capture, null, {
      ruleId: 'accessibility.page-title',
      class: 'objective',
      category: 'Accessibility',
      severity: 'major',
      title: 'Provide a descriptive page title',
      message: 'The document title is empty, so the page cannot be identified reliably in a browser tab or assistive-technology page list.',
      actual: { title: capture.title || semantics.title || '' },
      expected: { title: 'A concise title that identifies the page purpose and context' },
      recommendation: 'Set a concise, route-specific document title and update it after client-side navigation.',
    }));
  } else {
    check.passed += 1;
  }

  check.eligible += 1;
  check.tested += 1;
  const language = String(capture.language || semantics.language || '').trim();
  if (!language || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) {
    check.failed += 1;
    issues.push(issue(capture, null, {
      ruleId: 'accessibility.document-language',
      class: 'objective',
      category: 'Accessibility',
      severity: 'major',
      title: 'Declare the page language',
      message: language
        ? 'The root document language is not a recognizable BCP 47 language tag.'
        : 'The root document does not declare its primary language.',
      actual: { language: language || null },
      expected: { language: 'A valid BCP 47 tag such as en, en-IN, or ar' },
      recommendation: 'Set the html lang attribute to the primary language and update it when the interface language changes.',
    }));
  } else {
    check.passed += 1;
  }

  check.eligible += 1;
  check.tested += 1;
  const mainLandmarks = finiteNumber(semantics.mainLandmarks, 0);
  if (mainLandmarks !== 1) {
    check.review += 1;
    issues.push(issue(capture, null, {
      ruleId: 'structure.main-landmark',
      class: 'heuristic',
      category: 'Accessibility',
      severity: 'minor',
      title: mainLandmarks === 0 ? 'Add a main content landmark' : 'Review multiple main content landmarks',
      message: 'The page exposes ' + mainLandmarks + ' visible main landmarks.',
      actual: { mainLandmarks },
      expected: { visibleMainLandmarks: 1 },
      recommendation: 'Use one visible main element or role=main for the primary content and label intentionally nested or alternate landmarks.',
    }));
  } else {
    check.passed += 1;
  }

  check.eligible += 1;
  check.tested += 1;
  const headings = Array.isArray(semantics.headings) ? semantics.headings : [];
  const h1Count = headings.filter((heading) => Number(heading.level) === 1).length;
  const skipped = [];
  for (let index = 1; index < headings.length; index += 1) {
    const previous = Number(headings[index - 1]?.level);
    const current = Number(headings[index]?.level);
    if (previous && current > previous + 1) skipped.push({ from: previous, to: current, selector: headings[index]?.selector || null });
  }
  if (h1Count !== 1) {
    check.review += 1;
    issues.push(issue(capture, null, {
      ruleId: 'structure.page-heading',
      class: 'heuristic',
      category: 'Accessibility',
      severity: 'minor',
      title: h1Count === 0 ? 'Provide a clear page heading' : 'Review multiple page-level headings',
      message: 'The rendered page contains ' + h1Count + ' visible h1 elements.',
      actual: { h1Count, headingCount: headings.length },
      expected: { clearPageHeading: true, recommendedVisibleH1Count: 1 },
      recommendation: 'Give the page one clear visible heading and use lower heading levels for nested content sections.',
    }));
  }
  if (skipped.length) {
    check.review += 1;
    issues.push(issue(capture, null, {
      ruleId: 'structure.heading-order',
      discriminator: JSON.stringify(skipped),
      class: 'heuristic',
      category: 'Accessibility',
      severity: 'minor',
      title: 'Review skipped heading levels',
      message: 'One or more visible headings jump over an intermediate level and may not reflect the content hierarchy.',
      actual: { skipped },
      expected: { headingOutline: 'Levels reflect nested content structure without unexplained jumps' },
      recommendation: 'Choose heading levels from the content hierarchy, not from their default visual size.',
    }));
  }
  if (h1Count === 1 && !skipped.length) check.passed += 1;
}

function analyzeElementSemantics(capture, elements, coverage, issues) {
  if (!capture?.semantics || typeof capture.semantics !== 'object') return;
  for (const element of elements) {
    const tag = String(element?.tag || '').toLowerCase();
    const role = String(element?.role || '').toLowerCase();
    const name = String(element?.accessibleName || '').trim();
    const isFormControl = FORM_CONTROL_TAGS.has(tag) && element?.inputType !== 'hidden';

    if (element?.interactive && !isFormControl && !['presentation', 'none'].includes(role)) {
      coverage.checks.accessibleNames.eligible += 1;
      coverage.checks.accessibleNames.tested += 1;
      if (!name) {
        coverage.checks.accessibleNames.failed += 1;
        issues.push(issue(capture, element, {
          ruleId: 'accessibility.control-name',
          class: 'objective',
          category: 'Accessibility',
          severity: 'major',
          title: 'Give the interactive control an accessible name',
          message: 'The visible interactive element exposes no accessible name.',
          actual: { tag, role: role || null, accessibleName: null },
          expected: { accessibleName: 'A concise name that describes the control purpose' },
          recommendation: 'Use visible native text or a correctly associated label; use aria-label or aria-labelledby only when a visible label is not practical.',
        }));
      } else {
        coverage.checks.accessibleNames.passed += 1;
      }
    }

    if (isFormControl) {
      coverage.checks.formLabels.eligible += 1;
      coverage.checks.formLabels.tested += 1;
      if (!name || element?.nameSource === 'placeholder') {
        coverage.checks.formLabels.failed += 1;
        issues.push(issue(capture, element, {
          ruleId: 'accessibility.form-label',
          class: 'objective',
          category: 'Accessibility',
          severity: 'major',
          title: 'Associate a persistent label with the form control',
          message: element?.nameSource === 'placeholder'
            ? 'The control relies on placeholder text instead of a persistent programmatic label.'
            : 'The form control exposes no programmatically associated label.',
          actual: { tag, inputType: element?.inputType || null, accessibleName: name || null, nameSource: element?.nameSource || null },
          expected: { accessibleName: 'A visible, persistent, programmatically associated label' },
          recommendation: 'Add a visible label and associate it with the control using native HTML or an accurate accessible naming relationship.',
        }));
      } else {
        coverage.checks.formLabels.passed += 1;
      }
    }

    if (tag === 'img') {
      coverage.checks.alternativeText.eligible += 1;
      coverage.checks.alternativeText.tested += 1;
      if (element?.altPresent !== true) {
        coverage.checks.alternativeText.failed += 1;
        issues.push(issue(capture, element, {
          ruleId: 'accessibility.image-alt',
          class: 'objective',
          category: 'Accessibility',
          severity: 'major',
          title: 'Provide an intentional text alternative for the image',
          message: 'The img element has no alt attribute, so its purpose is not explicitly available to non-visual users.',
          actual: { altPresent: false, source: element?.image?.src || null },
          expected: { altPresent: true, decorativeImageAlt: '' },
          recommendation: 'Add concise equivalent alt text for informative images or alt="" for images that are purely decorative.',
        }));
      } else {
        coverage.checks.alternativeText.passed += 1;
      }
    }

    if (element?.interactive && Number(element?.tabIndex) > 0) {
      issues.push(issue(capture, element, {
        ruleId: 'accessibility.positive-tabindex',
        class: 'heuristic',
        category: 'Accessibility',
        severity: 'minor',
        title: 'Remove the positive tabindex',
        message: 'The control uses tabindex=' + element.tabIndex + ', which can create a focus order that conflicts with DOM and visual order.',
        actual: { tabIndex: Number(element.tabIndex) },
        expected: { maximumTabIndex: 0 },
        recommendation: 'Use DOM order for the task sequence and reserve managed roving tabindex for recognized composite widgets.',
      }));
    }

    if ((tag === 'a' || role === 'link') && AMBIGUOUS_LINK_TEXT.test(name || String(element?.text || '').trim())) {
      issues.push(issue(capture, element, {
        ruleId: 'content.ambiguous-link',
        class: 'heuristic',
        category: 'Content',
        severity: 'minor',
        title: 'Make the link label describe its purpose',
        message: 'The link label “' + (name || element.text) + '” may be ambiguous when read outside its surrounding text.',
        actual: { label: name || element.text },
        expected: { label: 'Destination- or action-specific wording' },
        recommendation: 'Replace generic wording with a concise label that identifies the destination or action.',
      }));
    }
  }
}

function findingElement(selector, stableKey = selector) {
  return selector ? { selector, stableKey: stableKey || selector } : null;
}

function analyzeSpelling(capture, coverage, issues) {
  const spelling = capture?.contentAudit?.spelling;
  const check = coverage.checks.spelling;
  if (!spelling) {
    check.eligible += 1;
    check.untested += 1;
    return;
  }
  if (spelling.status === 'disabled' || spelling.status === 'error') {
    check.eligible += 1;
    check.untested += 1;
    if (spelling.status === 'error') {
      issues.push(issue(capture, null, {
        ruleId: 'content.spelling-unavailable',
        class: 'heuristic',
        category: 'Content',
        severity: 'minor',
        title: 'Repeat the spelling inspection',
        message: 'The local spelling engine could not complete this capture.',
        actual: { locale: spelling.locale ?? null, error: spelling.error ?? null },
        expected: { status: 'complete' },
        recommendation: 'Resolve the local dictionary or configuration error and repeat the audit; do not treat spelling as passed.',
      }));
    }
    return;
  }
  if (spelling.status === 'not-applicable') return;

  const testedWords = finiteNumber(spelling.testedWords, 0);
  check.eligible += testedWords;
  check.tested += testedWords;
  const spellingIssues = Array.isArray(spelling.issues) ? spelling.issues : [];
  const flaggedOccurrences = spellingIssues.reduce((total, item) => total + finiteNumber(item?.occurrences, 1), 0);
  check.passed += Math.max(0, testedWords - flaggedOccurrences);
  check.review += finiteNumber(spelling.issueCount, spellingIssues.length);

  for (const item of spellingIssues) {
    const suggestions = Array.isArray(item?.suggestions) ? item.suggestions : [];
    issues.push(issue(capture, findingElement(item?.selector, item?.stableKey), {
      ruleId: 'content.spelling',
      discriminator: String(item?.word || '').toLocaleLowerCase('en'),
      class: 'heuristic',
      category: 'Content',
      severity: 'minor',
      title: `Review possible spelling error: ${item?.word || 'unknown word'}`,
      message: suggestions.length
        ? `The local dictionary did not recognize “${item.word}”. Suggested alternatives include ${suggestions.join(', ')}.`
        : `The local dictionary did not recognize “${item.word}”.`,
      actual: {
        word: item?.word ?? null,
        occurrences: finiteNumber(item?.occurrences, 1),
        suggestions,
        sample: item?.sample ?? null,
        source: item?.source ?? null,
        additionalSelectors: Array.isArray(item?.selectors) ? item.selectors.slice(1) : [],
      },
      expected: { dictionaryRecognizedOrApprovedTerm: true, locale: spelling.locale ?? null },
      recommendation: 'Correct the copy or add an intentional product, person, or domain term to approved.terms in the audit configuration.',
    }));
  }
}

const CONTENT_PATTERNS = [
  {
    id: 'content.encoding-corruption',
    class: 'objective',
    severity: 'major',
    title: 'Fix corrupted text encoding',
    pattern: /\uFFFD|\u00c3[\u0080-\u00ff]|\u00e2[\u0080-\u00bf\u20ac\u2122\u0153\u017e]/u,
    message: 'Visible copy contains a replacement character or a common mojibake sequence.',
    expected: { corruptedSequences: 0 },
    recommendation: 'Serve, decode, store, and render the copy as UTF-8, then verify punctuation and non-ASCII characters in the browser.',
  },
  {
    id: 'content.template-placeholder',
    class: 'objective',
    severity: 'major',
    title: 'Replace leaked template or runtime text',
    pattern: /\{\{[^{}]+\}\}|\$\{[^{}]+\}|\[object Object\]|\b(?:undefined|NaN)\b/u,
    message: 'Visible copy appears to expose an unresolved template token or runtime value.',
    expected: { unresolvedRuntimeValues: 0 },
    recommendation: 'Resolve the content value before rendering and provide an intentional empty or error state when data is unavailable.',
  },
  {
    id: 'content.placeholder-copy',
    class: 'heuristic',
    severity: 'minor',
    title: 'Review placeholder or unfinished copy',
    pattern: /\b(?:lorem ipsum|dummy text|sample text|placeholder text|todo|tbd)\b/iu,
    message: 'Visible copy resembles placeholder or unfinished content.',
    expected: { productionReadyCopy: true },
    recommendation: 'Replace the placeholder with approved production copy or document why the wording is intentional.',
  },
  {
    id: 'content.repeated-word',
    class: 'heuristic',
    severity: 'minor',
    title: 'Review a repeated adjacent word',
    pattern: /\b([\p{L}][\p{L}'\u2019-]{1,})\s+\1\b/iu,
    message: 'Visible copy repeats the same word consecutively.',
    expected: { accidentalRepeatedWords: 0 },
    recommendation: 'Remove the duplicate word unless repetition is intentional and approved.',
  },
  {
    id: 'content.excessive-punctuation',
    class: 'heuristic',
    severity: 'info',
    title: 'Review excessive punctuation',
    pattern: /[!?]{3,}/u,
    message: 'Visible copy uses three or more consecutive exclamation or question marks.',
    expected: { punctuationMatchesVoiceGuidelines: true },
    recommendation: 'Use restrained punctuation unless the product voice explicitly requires this emphasis.',
  },
];

function analyzeContentQuality(capture, elements, coverage, issues) {
  const check = coverage.checks.contentQuality;
  const caseVariants = new Map();
  for (const element of elements) {
    if (!meaningfulText(element)) continue;
    check.eligible += 1;
    check.tested += 1;
    let found = false;
    for (const definition of CONTENT_PATTERNS) {
      const match = element.text.match(definition.pattern);
      if (!match) continue;
      found = true;
      if (definition.class === 'objective') check.failed += 1;
      else check.review += 1;
      issues.push(issue(capture, element, {
        ruleId: definition.id,
        discriminator: `${definition.id}|${match[0].toLocaleLowerCase('en')}`,
        class: definition.class,
        category: 'Content',
        severity: definition.severity,
        title: definition.title,
        message: definition.message,
        actual: { matchedText: match[0], sample: element.text.slice(0, 160) },
        expected: definition.expected,
        recommendation: definition.recommendation,
      }));
    }
    if (!found) check.passed += 1;

    const text = element.text.trim();
    if (text.length >= 3 && text.length <= 60 && !/[.!?]\s.+/.test(text)) {
      const key = text.toLocaleLowerCase('en');
      const entry = caseVariants.get(key) || { variants: new Set(), elements: [] };
      entry.variants.add(text);
      entry.elements.push(element);
      caseVariants.set(key, entry);
    }
  }

  for (const [normalized, entry] of caseVariants) {
    if (entry.variants.size < 2) continue;
    check.review += 1;
    const variants = [...entry.variants].sort((left, right) => left.localeCompare(right));
    issues.push(issue(capture, entry.elements[0], {
      ruleId: 'content.inconsistent-capitalization',
      discriminator: normalized,
      class: 'heuristic',
      category: 'Content',
      severity: 'info',
      title: 'Review inconsistent capitalization',
      message: 'The same short UI phrase appears with different capitalization.',
      actual: { variants },
      expected: { variants: 1, approvedStyle: true },
      recommendation: 'Apply the content style guide consistently, accounting for intentional sentence-position differences.',
    }));
  }
}

function axeSeverity(impact) {
  if (impact === 'critical' || impact === 'serious') return 'major';
  if (impact === 'moderate') return 'minor';
  return 'minor';
}

function axeStandard(rule) {
  return [{
    id: `AXE-${String(rule?.id || 'RULE').toUpperCase()}`,
    label: `${rule?.help || rule?.id || 'axe-core rule'} (${(rule?.tags || []).join(', ')})`,
    url: rule?.helpUrl || 'https://www.deque.com/axe/core-documentation/',
    authority: 'axe-core automated accessibility rule',
  }];
}

function analyzeAccessibilityEngine(capture, coverage, issues) {
  const result = capture?.accessibility;
  const check = coverage.checks.accessibilityEngine;
  if (!result || result.status === 'disabled') {
    check.eligible += 1;
    check.untested += 1;
    return;
  }
  if (result.status !== 'complete') {
    check.eligible += 1;
    check.untested += 1;
    issues.push(issue(capture, null, {
      ruleId: 'axe.scan-incomplete',
      class: 'heuristic',
      category: 'Accessibility',
      severity: 'major',
      title: 'Repeat the automated accessibility scan',
      message: 'The axe-core ruleset did not complete, so broader accessibility coverage remains unverified.',
      actual: { status: result.status ?? null, error: result.error ?? null },
      expected: { status: 'complete' },
      recommendation: 'Resolve script injection, frame, or page-state errors and repeat the same capture.',
    }));
    return;
  }

  check.eligible += finiteNumber(result.rulesTested, 0);
  check.tested += finiteNumber(result.rulesTested, 0);
  check.passed += finiteNumber(result.passes, 0);
  for (const rule of (Array.isArray(result.violations) ? result.violations : [])) {
    const standardsBacked = (rule.tags || []).some((tag) => /^wcag\d/i.test(String(tag)));
    for (const [index, node] of (Array.isArray(rule.nodes) ? rule.nodes : []).entries()) {
      const target = Array.isArray(node?.target) ? node.target.join(' ') : '';
      if (standardsBacked) check.failed += 1;
      else check.review += 1;
      issues.push(issue(capture, findingElement(target, `axe=${rule.id}|${target || index}`), {
        ruleId: `axe.${rule.id}`,
        discriminator: `${rule.id}|${target || index}`,
        class: standardsBacked ? 'objective' : 'heuristic',
        category: 'Accessibility',
        severity: axeSeverity(node?.impact || rule?.impact),
        confidence: 'high',
        title: rule.help || `Fix accessibility rule ${rule.id}`,
        message: node?.failureSummary || rule.description || 'The element failed an automated axe-core accessibility rule.',
        actual: { impact: node?.impact || rule?.impact || null, target: node?.target || [], tags: rule.tags || [] },
        expected: { axeRule: rule.id, violations: 0 },
        recommendation: `${rule.description || rule.help || 'Correct the affected markup and interaction.'} See ${rule.helpUrl || 'the axe-core rule documentation'}.`,
        standards: axeStandard(rule),
      }));
    }
  }

  for (const rule of (Array.isArray(result.incomplete) ? result.incomplete : [])) {
    const nodes = Array.isArray(rule.nodes) ? rule.nodes : [];
    check.review += Math.max(1, nodes.length);
    issues.push(issue(capture, null, {
      ruleId: `axe.review.${rule.id}`,
      discriminator: rule.id,
      class: 'heuristic',
      category: 'Accessibility',
      severity: 'minor',
      title: `Manually review: ${rule.help || rule.id}`,
      message: 'axe-core could not determine the result automatically for one or more elements.',
      actual: { impact: rule.impact ?? null, nodeCount: rule.totalNodes ?? nodes.length, nodes, tags: rule.tags || [] },
      expected: { manualDecisionRecorded: true, violations: 0 },
      recommendation: `Inspect each recorded target using the axe guidance at ${rule.helpUrl || 'the rule documentation'} and record pass or fail evidence.`,
      standards: axeStandard(rule),
    }));
  }
}

const SECURITY_COVERAGE_KEYS = [
  'securityTransport',
  'securityHeaders',
  'securityCsp',
  'securityCookies',
  'securityDom',
  'securityPrivacy',
];

function recordSecurityCoverage(coverage, key, outcome) {
  const check = coverage.checks[key];
  if (!check) return;
  check.eligible += 1;
  if (outcome === 'untested') {
    check.untested += 1;
    return;
  }
  check.tested += 1;
  if (outcome === 'failed') check.failed += 1;
  else if (outcome === 'review') check.review += 1;
  else check.passed += 1;
}

function analyzeSecurity(capture, coverage, issues) {
  const security = capture?.security;
  if (!security || security.status !== 'complete') {
    for (const key of SECURITY_COVERAGE_KEYS) recordSecurityCoverage(coverage, key, 'untested');
    return;
  }

  const state = new Map();
  const rank = { pass: 0, review: 1, failed: 2 };
  const elevate = (key, outcome) => {
    const current = state.get(key) || 'pass';
    if (rank[outcome] > rank[current]) state.set(key, outcome);
    else if (!state.has(key)) state.set(key, current);
  };
  const add = (key, definition, element = null) => {
    elevate(key, definition.class === 'objective' ? 'failed' : 'review');
    issues.push(issue(capture, element, definition));
  };
  const pass = (key) => elevate(key, 'pass');
  const dom = security.dom || {};
  const page = dom.page || {};
  const response = security.response || {};
  const headers = response.headers || {};
  const forms = Array.isArray(dom.forms) ? dom.forms : [];

  pass('securityTransport');
  if (page.protocol === 'http:' && !page.localDevelopment) {
    add('securityTransport', {
      ruleId: 'security.transport.http-page',
      class: 'heuristic',
      category: 'Security',
      severity: 'major',
      title: 'Serve the page over HTTPS',
      message: 'The rendered page used unencrypted HTTP outside a recognized local-development host.',
      actual: { protocol: page.protocol, localDevelopment: false },
      expected: { protocol: 'https:' },
      recommendation: 'Redirect HTTP to HTTPS, update internal links, and enable HSTS after confirming the HTTPS deployment is complete.',
    });
  }
  const mixedById = new Map();
  for (const resource of [...(dom.resources || []), ...(dom.iframes || [])]) {
    if (resource?.mixedContent && resource?.url?.id) mixedById.set(resource.url.id, { type: resource.tag, url: resource.url, selector: resource.selector });
  }
  for (const resource of security.traffic?.mixedContent || []) {
    if (resource?.url?.id && !mixedById.has(resource.url.id)) mixedById.set(resource.url.id, resource);
  }
  for (const resource of mixedById.values()) {
    add('securityTransport', {
      ruleId: 'security.transport.mixed-content',
      discriminator: resource.url?.id,
      class: 'objective',
      category: 'Security',
      severity: 'major',
      title: 'Remove insecure mixed content',
      message: 'An HTTPS page references or requested a resource over unencrypted HTTP.',
      actual: { resourceType: resource.type || null, resource: resource.url },
      expected: { resourceProtocol: 'https:' },
      recommendation: 'Serve the resource over HTTPS or remove it, then verify that no mixed-content request appears in a clean browser session.',
    }, resource.selector ? { selector: resource.selector, stableKey: resource.selector } : null);
  }
  for (const form of forms.filter((item) => item.hasPassword && page.protocol === 'http:' && !page.localDevelopment)) {
    add('securityTransport', {
      ruleId: 'security.transport.password-over-http',
      discriminator: form.selector,
      class: 'objective',
      category: 'Security',
      severity: 'critical',
      title: 'Never collect passwords over HTTP',
      message: 'A password field is rendered on an unencrypted non-local page.',
      actual: { pageProtocol: page.protocol, formAction: form.action },
      expected: { pageProtocol: 'https:', actionProtocol: 'https:' },
      recommendation: 'Move the entire authentication experience to HTTPS and redirect every HTTP entry point before accepting credentials.',
    }, { selector: form.selector, stableKey: form.selector });
  }

  if (!response.captured) {
    recordSecurityCoverage(coverage, 'securityHeaders', 'untested');
  } else {
    pass('securityHeaders');
    const hsts = headers.strictTransportSecurity || {};
    if (page.protocol === 'https:' && (!hsts.present || !Number(hsts.maxAgeSeconds))) {
      add('securityHeaders', {
        ruleId: 'security.header.hsts',
        class: 'heuristic',
        category: 'Security',
        severity: 'major',
        title: 'Enable HTTP Strict Transport Security',
        message: hsts.present ? 'The HSTS policy has no effective positive max-age.' : 'The HTTPS response does not include an HSTS policy.',
        actual: hsts,
        expected: { present: true, positiveMaxAge: true },
        recommendation: 'Add a tested Strict-Transport-Security policy on HTTPS responses and increase scope only after all subdomains are ready.',
      });
    }
    if (headers.xContentTypeOptions?.value !== 'nosniff') {
      add('securityHeaders', {
        ruleId: 'security.header.content-type-options',
        class: 'heuristic',
        category: 'Security',
        severity: 'major',
        title: 'Disable MIME type sniffing',
        message: 'The response does not provide X-Content-Type-Options: nosniff.',
        actual: headers.xContentTypeOptions || { present: false },
        expected: { value: 'nosniff' },
        recommendation: 'Send X-Content-Type-Options: nosniff and serve every resource with the correct Content-Type.',
      });
    }
    const framedByCsp = Boolean(headers.contentSecurityPolicy?.frameAncestorsPresent);
    if (!framedByCsp && !headers.xFrameOptions?.present) {
      add('securityHeaders', {
        ruleId: 'security.header.frame-protection',
        class: 'heuristic',
        category: 'Security',
        severity: 'major',
        title: 'Define an anti-clickjacking framing policy',
        message: 'Neither an enforced CSP frame-ancestors directive nor X-Frame-Options was observed.',
        actual: { cspFrameAncestors: false, xFrameOptions: null },
        expected: { explicitFramingPolicy: true },
        recommendation: 'Prefer CSP frame-ancestors with the minimum required origins; retain X-Frame-Options where legacy-browser coverage is required.',
      });
    }
    if (!headers.referrerPolicy?.present || ['unsafe-url', 'no-referrer-when-downgrade'].includes(headers.referrerPolicy?.value)) {
      add('securityHeaders', {
        ruleId: 'security.header.referrer-policy',
        class: 'heuristic',
        category: 'Security',
        severity: 'minor',
        title: 'Set an explicit privacy-preserving referrer policy',
        message: headers.referrerPolicy?.present ? 'The observed referrer policy can disclose more URL information than necessary.' : 'No explicit Referrer-Policy header was observed.',
        actual: headers.referrerPolicy || { present: false },
        expected: { recommendedValue: 'strict-origin-when-cross-origin or stricter' },
        recommendation: 'Set Referrer-Policy to strict-origin-when-cross-origin, same-origin, or no-referrer according to product requirements.',
      });
    }
    if (!headers.permissionsPolicy?.present) {
      add('securityHeaders', {
        ruleId: 'security.header.permissions-policy',
        class: 'heuristic',
        category: 'Security',
        severity: 'minor',
        title: 'Restrict unused browser capabilities',
        message: 'No Permissions-Policy header was observed.',
        actual: { present: false },
        expected: { explicitLeastPrivilegePolicy: true },
        recommendation: 'Define a Permissions-Policy that disables unused powerful features and allowlists only required origins.',
      });
    }
    if (headers.contentType?.mediaType === 'text/html' && !headers.contentType?.charsetDefined) {
      add('securityHeaders', {
        ruleId: 'security.header.html-charset',
        class: 'heuristic',
        category: 'Security',
        severity: 'minor',
        title: 'Declare the HTML response character set',
        message: 'The HTML Content-Type header does not declare a character encoding.',
        actual: headers.contentType,
        expected: { charsetDefined: true },
        recommendation: 'Serve HTML with an explicit UTF-8 charset in Content-Type and keep the document metadata consistent.',
      });
    }
    if (headers.legacyXssProtection?.present && !headers.legacyXssProtection?.disabled) {
      add('securityHeaders', {
        ruleId: 'security.header.legacy-xss-protection',
        class: 'heuristic',
        category: 'Security',
        severity: 'minor',
        title: 'Remove or disable the legacy X-XSS-Protection filter',
        message: 'The obsolete browser XSS filter is enabled instead of being omitted or explicitly disabled.',
        actual: headers.legacyXssProtection,
        expected: { absentOrDisabled: true },
        recommendation: 'Use a well-designed Content Security Policy and output encoding; omit X-XSS-Protection or set it to 0 for legacy clients.',
      });
    }
  }

  const enforcedCsp = headers.contentSecurityPolicy?.present
    ? headers.contentSecurityPolicy
    : dom.metaContentSecurityPolicy?.present ? dom.metaContentSecurityPolicy : null;
  if (!response.captured && !enforcedCsp) {
    recordSecurityCoverage(coverage, 'securityCsp', 'untested');
  } else {
    pass('securityCsp');
    if (!enforcedCsp) {
      add('securityCsp', {
        ruleId: 'security.csp.missing',
        class: 'heuristic',
        category: 'Security',
        severity: 'major',
        title: 'Deploy an enforced Content Security Policy',
        message: headers.contentSecurityPolicyReportOnly?.present
          ? 'A report-only policy exists, but no enforced CSP protects the page.'
          : 'No enforced CSP header or meta policy was observed.',
        actual: { enforced: false, reportOnly: Boolean(headers.contentSecurityPolicyReportOnly?.present) },
        expected: { enforced: true },
        recommendation: 'Roll out a restrictive policy in report-only mode, resolve violations, then enforce it with nonces or hashes for scripts.',
      });
    } else {
      if (enforcedCsp.script?.allowsUnsafeEval) {
        add('securityCsp', {
          ruleId: 'security.csp.unsafe-eval', class: 'heuristic', category: 'Security', severity: 'major',
          title: 'Remove unsafe-eval from the script policy',
          message: 'The effective CSP script policy permits string-to-code evaluation.',
          actual: { allowsUnsafeEval: true, delivery: enforcedCsp.delivery },
          expected: { allowsUnsafeEval: false },
          recommendation: 'Remove eval-like code and dependencies, then delete unsafe-eval from script-src.',
        });
      }
      if (enforcedCsp.script?.allowsUnsafeInline && !enforcedCsp.script?.nonceOrHash) {
        add('securityCsp', {
          ruleId: 'security.csp.unsafe-inline-script', class: 'heuristic', category: 'Security', severity: 'major',
          title: 'Remove unrestricted inline script execution',
          message: 'The effective CSP script policy permits inline scripts without an observed nonce or hash strategy.',
          actual: { allowsUnsafeInline: true, nonceOrHash: false, delivery: enforcedCsp.delivery },
          expected: { allowsUnsafeInline: false, nonceOrHash: true },
          recommendation: 'Move inline behavior to trusted files or adopt per-response nonces/hashes and remove unsafe-inline from script-src.',
        });
      }
      if (enforcedCsp.script?.broadSource) {
        add('securityCsp', {
          ruleId: 'security.csp.broad-script-source', class: 'heuristic', category: 'Security', severity: 'major',
          title: 'Narrow broad CSP script sources',
          message: 'The effective script policy remains unrestricted or accepts a broad scheme/wildcard source.',
          actual: { broadSource: true, delivery: enforcedCsp.delivery },
          expected: { broadSource: false },
          recommendation: 'Allow only required script origins and prefer nonces or hashes over host-wide wildcards.',
        });
      }
      if (!enforcedCsp.objectSourceRestricted) {
        add('securityCsp', {
          ruleId: 'security.csp.object-source', class: 'heuristic', category: 'Security', severity: 'minor',
          title: 'Restrict plugin content in CSP',
          message: 'The effective policy does not restrict object-src.',
          actual: { objectSourceRestricted: false },
          expected: { objectSourceRestricted: true },
          recommendation: "Set object-src 'none' unless a documented legacy integration requires a narrower exception.",
        });
      }
      if (!enforcedCsp.baseUriRestricted) {
        add('securityCsp', {
          ruleId: 'security.csp.base-uri', class: 'heuristic', category: 'Security', severity: 'minor',
          title: 'Restrict document base URLs in CSP',
          message: 'The policy does not explicitly restrict base-uri.',
          actual: { baseUriRestricted: false },
          expected: { baseUriRestricted: true },
          recommendation: "Set base-uri 'none' or 'self' to prevent injected base elements from rewriting relative destinations.",
        });
      }
      if (forms.length && !enforcedCsp.formActionPresent) {
        add('securityCsp', {
          ruleId: 'security.csp.form-action', class: 'heuristic', category: 'Security', severity: 'minor',
          title: 'Restrict form destinations in CSP',
          message: 'Forms are present but the CSP has no explicit form-action directive.',
          actual: { forms: forms.length, formActionPresent: false },
          expected: { formActionPresent: true },
          recommendation: "Add form-action 'self' plus only explicitly required external submission origins.",
        });
      }
    }
  }

  const cookies = (response.cookies?.items || []).filter((cookie) => !cookie.deletion);
  if (cookies.length) {
    pass('securityCookies');
    for (const cookie of cookies) {
      const location = { selector: cookie.id, stableKey: cookie.id };
      if (cookie.sameSite === 'none' && !cookie.secure) {
        add('securityCookies', {
          ruleId: 'security.cookie.samesite-none-without-secure', discriminator: cookie.id,
          class: 'objective', category: 'Security', severity: 'major',
          title: 'Pair SameSite=None with Secure',
          message: 'A cookie declares SameSite=None without the required Secure attribute.',
          actual: { cookieId: cookie.id, sameSite: cookie.sameSite, secure: cookie.secure },
          expected: { secure: true },
          recommendation: 'Add Secure or choose Lax/Strict when cross-site cookie delivery is not required.',
        }, location);
      }
      if (page.secureTransport && !cookie.secure) {
        add('securityCookies', {
          ruleId: 'security.cookie.secure', discriminator: cookie.id,
          class: 'heuristic', category: 'Security', severity: 'major',
          title: 'Set Secure on HTTPS cookies',
          message: 'A cookie set by the HTTPS response lacks the Secure attribute.',
          actual: { cookieId: cookie.id, secure: false, nameClass: cookie.nameClass },
          expected: { secure: true },
          recommendation: 'Add Secure to cookies delivered by HTTPS, especially authentication and sensitive-state cookies.',
        }, location);
      }
      if (cookie.nameClass === 'session-like' && !cookie.httpOnly) {
        add('securityCookies', {
          ruleId: 'security.cookie.httponly', discriminator: cookie.id,
          class: 'heuristic', category: 'Security', severity: 'major',
          title: 'Protect session-like cookies from script access',
          message: 'A session-like cookie does not declare HttpOnly.',
          actual: { cookieId: cookie.id, httpOnly: false, nameClass: cookie.nameClass },
          expected: { httpOnly: true },
          recommendation: 'Set HttpOnly unless the application has a documented need for JavaScript to read this cookie.',
        }, location);
      }
      if (!cookie.sameSite) {
        add('securityCookies', {
          ruleId: 'security.cookie.samesite', discriminator: cookie.id,
          class: 'heuristic', category: 'Security', severity: 'minor',
          title: 'Declare SameSite explicitly',
          message: 'A cookie relies on browser-default cross-site behavior because SameSite is omitted.',
          actual: { cookieId: cookie.id, sameSite: null },
          expected: { sameSite: 'Lax, Strict, or justified None' },
          recommendation: 'Set SameSite=Strict or Lax where possible; use None only for a documented cross-site requirement with Secure.',
        }, location);
      }
      if (cookie.nameClass === 'session-like' && cookie.domainScoped) {
        add('securityCookies', {
          ruleId: 'security.cookie.domain-scope', discriminator: cookie.id,
          class: 'heuristic', category: 'Security', severity: 'minor',
          title: 'Minimize session-cookie domain scope',
          message: 'A session-like cookie includes a Domain attribute and is available to additional subdomains.',
          actual: { cookieId: cookie.id, domainScoped: true },
          expected: { hostOnly: true },
          recommendation: 'Use a host-only cookie unless multiple trusted subdomains demonstrably require shared state.',
        }, location);
      }
      const hostPrefix = cookie.prefix === '__Host-' || cookie.prefix === '__Host-Http-';
      const httpPrefix = cookie.prefix === '__Http-' || cookie.prefix === '__Host-Http-';
      const prefixInvalid = cookie.prefix && (!cookie.secure || (hostPrefix && (cookie.domainScoped || !cookie.pathRoot)) || (httpPrefix && !cookie.httpOnly));
      if (prefixInvalid) {
        add('securityCookies', {
          ruleId: 'security.cookie.prefix-contract', discriminator: cookie.id,
          class: 'objective', category: 'Security', severity: 'major',
          title: 'Honor the cookie prefix security contract',
          message: 'A prefixed cookie omits one or more attributes required by that prefix.',
          actual: { cookieId: cookie.id, prefix: cookie.prefix, secure: cookie.secure, httpOnly: cookie.httpOnly, domainScoped: cookie.domainScoped, pathRoot: cookie.pathRoot },
          expected: { prefixRequirementsSatisfied: true },
          recommendation: 'Set the Secure, HttpOnly, Path, and Domain attributes required by the selected cookie prefix.',
        }, location);
      }
    }
  }

  pass('securityDom');
  for (const form of forms) {
    const location = { selector: form.selector, stableKey: form.selector };
    if (form.hasPassword && form.method === 'GET') {
      add('securityDom', {
        ruleId: 'security.form.password-get', discriminator: form.selector,
        class: 'objective', category: 'Security', severity: 'critical',
        title: 'Do not submit passwords with GET',
        message: 'A password form uses GET, which can place credentials in URLs, history, logs, and referrers.',
        actual: { method: form.method, action: form.action },
        expected: { method: 'POST' },
        recommendation: 'Submit credentials through an HTTPS POST endpoint and prevent password values from entering URLs or logs.',
      }, location);
    }
    if (page.secureTransport && form.action?.protocol === 'http:') {
      add('securityDom', {
        ruleId: 'security.form.insecure-action', discriminator: form.selector,
        class: 'objective', category: 'Security', severity: form.hasPassword ? 'critical' : 'major',
        title: 'Submit forms only to HTTPS destinations',
        message: 'A form on the HTTPS page resolves to an unencrypted HTTP action.',
        actual: { action: form.action, hasPassword: form.hasPassword },
        expected: { actionProtocol: 'https:' },
        recommendation: 'Update the form action and destination service to HTTPS before collecting any user data.',
      }, location);
    }
    if (form.action?.origin && !form.sameOriginAction) {
      add('securityDom', {
        ruleId: 'security.form.cross-origin-action', discriminator: form.selector,
        class: 'heuristic', category: 'Security', severity: 'major',
        title: 'Review the cross-origin form destination',
        message: 'A form submits user data to a different origin.',
        actual: { action: form.action, hasPassword: form.hasPassword },
        expected: { approvedExternalDestination: true, disclosureAndProtectionVerified: true },
        recommendation: 'Confirm the destination is approved, HTTPS-protected, disclosed to users, minimally scoped, and covered by CSP form-action.',
      }, location);
    }
    if (form.hasPassword && form.passwordAutocomplete.some((value) => !['current-password', 'new-password'].includes(value))) {
      add('securityDom', {
        ruleId: 'security.form.password-autocomplete', discriminator: form.selector,
        class: 'heuristic', category: 'Security', severity: 'minor',
        title: 'Declare the password autocomplete purpose',
        message: 'A password field does not consistently declare current-password or new-password.',
        actual: { autocompleteStates: form.passwordAutocomplete },
        expected: { autocomplete: 'current-password or new-password' },
        recommendation: 'Use the appropriate autocomplete token so password managers can fill the correct credential safely.',
      }, location);
    }
  }
  for (const link of dom.javascriptLinks || []) {
    add('securityDom', {
      ruleId: 'security.dom.javascript-url', discriminator: link.selector,
      class: 'heuristic', category: 'Security', severity: 'major',
      title: 'Replace javascript: navigation',
      message: 'An actionable link uses a javascript: URL, increasing injection risk and coupling behavior to markup.',
      actual: { protocol: link.protocol },
      expected: { safeNavigationOrEventHandler: true },
      recommendation: 'Use a real URL for navigation or a button with a separately registered event handler.',
    }, { selector: link.selector, stableKey: link.selector });
  }
  for (const resource of (dom.resources || []).filter((item) => item.crossOrigin && (item.tag === 'script' || item.isStylesheet) && !item.hasIntegrity)) {
    add('securityDom', {
      ruleId: 'security.resource.external-without-integrity', discriminator: resource.url?.id,
      class: 'heuristic', category: 'Security', severity: 'minor',
      title: 'Review integrity protection for external executable resources',
      message: 'A cross-origin script or stylesheet is loaded without a Subresource Integrity attribute.',
      actual: { tag: resource.tag, resource: resource.url, hasIntegrity: false },
      expected: { pinnedTrustedResourceOrDocumentedException: true },
      recommendation: 'Self-host the asset or pin an immutable cross-origin file with SRI and an appropriate crossorigin mode; document dynamic-provider exceptions.',
    }, { selector: resource.selector, stableKey: resource.selector });
  }
  for (const frame of (dom.iframes || []).filter((item) => item.crossOrigin && !item.sandboxed)) {
    add('securityDom', {
      ruleId: 'security.embed.unsandboxed-cross-origin-frame', discriminator: frame.url?.id,
      class: 'heuristic', category: 'Security', severity: 'major',
      title: 'Review sandboxing for cross-origin frames',
      message: 'A cross-origin iframe is embedded without a sandbox attribute.',
      actual: { frame: frame.url, sandboxed: false, allowFeatures: frame.allowFeatures },
      expected: { leastPrivilegeSandboxOrDocumentedTrustedException: true },
      recommendation: 'Apply the minimum sandbox and Permissions Policy capabilities that preserve the integration, or document why the trusted provider cannot be sandboxed.',
    }, { selector: frame.selector, stableKey: frame.selector });
  }
  if (dom.baseUrl?.origin && dom.baseUrl.origin !== safeOrigin(capture.url)) {
    add('securityDom', {
      ruleId: 'security.dom.external-base-url', class: 'heuristic', category: 'Security', severity: 'major',
      title: 'Review the external document base URL',
      message: 'The base element redirects relative URLs to a different origin.',
      actual: { baseUrl: dom.baseUrl },
      expected: { sameOriginOrStrictlyControlledBase: true },
      recommendation: "Keep base URLs same-origin where possible and restrict base-uri in CSP to prevent injected redirection of relative links and forms.",
    });
  }

  pass('securityPrivacy');
  if (!response.captured) {
    const check = coverage.checks.securityPrivacy;
    check.eligible += 1;
    check.untested += 1;
  } else {
    if (headers.serverDisclosure?.present) {
      add('securityPrivacy', {
        ruleId: 'security.disclosure.server-header', class: 'heuristic', category: 'Security', severity: 'minor',
        title: 'Minimize server technology disclosure',
        message: 'The response includes a Server header.',
        actual: { headerPresent: true, valueCollected: false },
        expected: { unnecessaryTechnologyDisclosure: false },
        recommendation: 'Suppress or generalize server-identification headers where operationally possible; keep patching as the primary defense.',
      });
    }
    if (headers.poweredByDisclosure?.present) {
      add('securityPrivacy', {
        ruleId: 'security.disclosure.powered-by-header', class: 'heuristic', category: 'Security', severity: 'minor',
        title: 'Remove framework technology disclosure',
        message: 'The response includes an X-Powered-By header.',
        actual: { headerPresent: true, valueCollected: false },
        expected: { unnecessaryTechnologyDisclosure: false },
        recommendation: 'Disable X-Powered-By at the application or edge and avoid exposing framework versions in responses.',
      });
    }
    if (dom.sensitiveInputCount > 0 && !headers.cacheControl?.noStore) {
      add('securityPrivacy', {
        ruleId: 'security.cache.sensitive-page', class: 'heuristic', category: 'Security', severity: 'major',
        title: 'Prevent storage of sensitive form pages',
        message: 'Sensitive input is present but the response does not declare Cache-Control: no-store.',
        actual: { sensitiveInputCount: dom.sensitiveInputCount, cacheControl: headers.cacheControl },
        expected: { noStore: true },
        recommendation: 'Use Cache-Control: no-store for responses containing credentials or other sensitive user data and verify browser back/forward behavior.',
      });
    }
  }
  if (page.sensitiveQueryParameterCount > 0) {
    add('securityPrivacy', {
      ruleId: 'security.privacy.sensitive-query', class: 'heuristic', category: 'Security', severity: 'major',
      title: 'Remove sensitive data from the visible URL',
      message: 'The rendered URL contains one or more query parameter names associated with credentials, sessions, tokens, or signatures.',
      actual: { count: page.sensitiveQueryParameterCount, categories: page.sensitiveQueryCategories, valuesCollected: false },
      expected: { sensitiveQueryParameterCount: 0 },
      recommendation: 'Exchange short-lived values server-side or remove them from browser-visible history immediately after use; never place passwords or long-lived secrets in URLs.',
    });
  }

  for (const key of SECURITY_COVERAGE_KEYS) {
    if (key === 'securityCookies' && !cookies.length) continue;
    if ((key === 'securityHeaders' || key === 'securityCsp') && !response.captured && !state.has(key)) continue;
    if (state.has(key)) recordSecurityCoverage(coverage, key, state.get(key));
  }
}

function safeOrigin(value) {
  try { return new URL(value).origin; } catch { return null; }
}

function analyzeCapture(capture, thresholds, config, coverage, issues) {
  const elements = Array.isArray(capture.elements) ? capture.elements : [];
  coverage.elements.total += elements.length;

  const viewportWidth = finiteNumber(capture.viewport?.width, 0);
  const renderedViewportWidth = finiteNumber(capture.metrics?.viewportWidth, viewportWidth);
  if (capture.viewport?.isMobile && viewportWidth <= 480
    && capture.metrics?.hasViewportMeta === false) {
    issues.push(issue(capture, null, {
      ruleId: 'responsive.viewport-metadata',
      class: 'objective',
      category: 'Layout',
      severity: 'major',
      title: 'Configure the mobile layout viewport',
      message: 'The mobile browser used a wider fallback layout viewport because the page has no viewport metadata.',
      actual: { requestedWidth: viewportWidth, renderedViewportWidth, hasViewportMeta: false },
      expected: { renderedViewportWidth: viewportWidth, hasViewportMeta: true },
      recommendation: 'Add responsive viewport metadata and verify that the page reflows at the requested CSS-pixel width.',
    }));
  }
  const documentWidth = finiteNumber(capture.metrics?.documentWidth, viewportWidth);
  const reportedOverflow = capture.metrics?.horizontalOverflow;
  const overflowPixels = typeof reportedOverflow === 'boolean'
    ? (reportedOverflow ? Math.max(1, documentWidth - viewportWidth) : 0)
    : finiteNumber(reportedOverflow, Math.max(0, documentWidth - viewportWidth));
  if (overflowPixels > thresholds.horizontalOverflow) {
    const overflowingElements = elements.filter((element) => {
      const box = validBox(element);
      return box && (box.x < -thresholds.offscreenTolerance || box.right > viewportWidth + thresholds.offscreenTolerance);
    });
    const knownTwoDimensionalOverflow = overflowingElements.some(isKnownTwoDimensionalContent);
    issues.push(issue(capture, null, {
      ruleId: knownTwoDimensionalOverflow ? 'layout.horizontal-overflow-review' : 'layout.horizontal-overflow',
      class: knownTwoDimensionalOverflow ? 'heuristic' : 'objective',
      category: 'Layout',
      severity: 'major',
      confidence: knownTwoDimensionalOverflow ? 'medium' : 'high',
      title: knownTwoDimensionalOverflow ? 'Review overflow from two-dimensional content' : 'Remove page-level horizontal overflow',
      message: knownTwoDimensionalOverflow
        ? `The document exceeds the viewport by ${overflowPixels.toFixed(1)}px and contains a table, grid, or canvas that may qualify for a reflow exception.`
        : `The document exceeds the viewport width by ${overflowPixels.toFixed(1)}px.`,
      actual: { viewportWidth, documentWidth, overflowPixels, knownTwoDimensionalOverflow },
      expected: { maximumOverflow: thresholds.horizontalOverflow, exceptionRequiresTwoDimensionalLayout: true },
      recommendation: knownTwoDimensionalOverflow
        ? 'Confirm that two-dimensional scrolling is essential, then constrain scrolling to that component rather than the whole page.'
        : 'Identify the overflowing element and make it wrap, shrink, or scroll inside an intentional local container.',
    }));
  }

  analyzeFonts(capture, coverage, issues);
  analyzeAssets(capture, issues);
  for (const element of elements) {
    analyzeContrast(capture, element, thresholds, config, coverage, issues);
    analyzePlaceholderContrast(capture, element, thresholds, config, coverage, issues);
    analyzeNonTextContrast(capture, element, thresholds, config, coverage, issues);
    analyzeLinkDistinguishability(capture, element, thresholds, coverage, issues);
    analyzeReadability(capture, element, thresholds, issues);
    analyzeElementLayout(capture, element, thresholds, coverage, issues);
    analyzeImage(capture, element, thresholds, coverage, issues);
  }
  analyzeTargets(capture, elements, thresholds, coverage, issues);
  analyzeInteractiveOverlaps(capture, elements, issues);
  analyzeFocus(capture, elements, thresholds, coverage, issues);
  analyzeTokens(capture, thresholds, config, issues);
  analyzeDocumentSemantics(capture, coverage, issues);
  analyzeElementSemantics(capture, elements, coverage, issues);
  analyzeSpelling(capture, coverage, issues);
  analyzeContentQuality(capture, elements, coverage, issues);
  analyzeAccessibilityEngine(capture, coverage, issues);
  analyzeSecurity(capture, coverage, issues);
}

function finalizeCoverage(coverage) {
  coverage.viewports = uniqueSorted(coverage.viewports, (viewport) => ({
    name: viewport?.name ?? null,
    width: finiteNumber(viewport?.width),
    height: finiteNumber(viewport?.height),
  }));
  coverage.themes = uniqueSorted(coverage.themes.filter(Boolean), String);
  coverage.checkpoints = uniqueSorted(coverage.checkpoints.filter(Boolean), String);
  return coverage;
}

function buildColorGrade(coverage, issues) {
  const keys = ['contrast', 'placeholderContrast', 'nonTextContrast', 'linkDistinguishability'];
  const checks = Object.fromEntries(keys.map((key) => [key, { ...(coverage.checks?.[key] || {}) }]));
  const totals = keys.reduce((result, key) => {
    const value = checks[key];
    result.eligible += finiteNumber(value.eligible, 0);
    result.tested += finiteNumber(value.tested, 0);
    result.passed += finiteNumber(value.passed, 0);
    result.failed += finiteNumber(value.failed, 0);
    result.review += finiteNumber(value.review, 0);
    result.indeterminate += finiteNumber(value.indeterminate, 0);
    return result;
  }, { eligible: 0, tested: 0, passed: 0, failed: 0, review: 0, indeterminate: 0 });
  const paletteReviews = issues.filter((item) => (
    /^brand\.color|^consistency\.(near-duplicate-colors|token-proliferation\.colors)/.test(item.ruleId)
  )).length;
  const focusReviews = issues.filter((item) => item.ruleId === 'focus.appearance-contrast').length;
  const validCaptures = finiteNumber(coverage.captures?.valid, 0);
  let grade;
  if (!validCaptures) grade = 'BLOCKED';
  else if (totals.failed > 0) grade = 'FAIL';
  else if (totals.tested === 0) grade = 'NOT TESTED';
  else if (totals.review > 0 || totals.indeterminate > 0 || paletteReviews > 0 || focusReviews > 0) grade = 'REVIEW';
  else grade = 'PASS';
  return {
    grade,
    scope: 'Measured color accessibility and design-token consistency; this is not an aesthetic score.',
    totals,
    checks,
    paletteReviews,
    focusReviews,
    passCondition: 'All measurable text and placeholder contrast checks pass; essential non-text and inline-link cues are accepted; complex backgrounds and palette exceptions are reviewed.',
  };
}

function summarize(issues, coverage) {
  const byCategory = {};
  const bySeverity = {};
  for (const item of issues) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] ?? 0) + 1;
  }
  return {
    totalIssues: issues.length,
    objectiveFailures: issues.filter((item) => item.class === 'objective').length,
    heuristicReviews: issues.filter((item) => item.class === 'heuristic').length,
    byCategory: sortObject(byCategory),
    bySeverity: sortObject(bySeverity),
    spellingFindings: issues.filter((item) => item.ruleId === 'content.spelling').length,
    accessibilityEngineFindings: issues.filter((item) => item.ruleId.startsWith('axe.')).length,
    securityFindings: issues.filter((item) => item.category === 'Security').length,
    captures: { ...coverage.captures },
  };
}

/**
 * Analyze a browser scan without I/O, network access, mutable global state, or
 * subjective scoring. Standards-backed defects have class=objective/status=fail;
 * configurable design signals have class=heuristic/status=review.
 */
export function analyzeScan(scan, config = {}) {
  const thresholds = resolveThresholds(config);
  const coverage = createCoverage();
  const issues = [];
  const captures = Array.isArray(scan?.captures) ? scan.captures : [];
  coverage.captures.total = captures.length;

  if (captures.length === 0) {
    const syntheticCapture = {
      captureId: null,
      url: scan?.url ?? null,
      checkpoint: 'initial',
      theme: null,
      viewport: {},
    };
    issues.push(issue(syntheticCapture, null, {
      ruleId: 'capture.missing',
      class: 'objective',
      category: 'Capture',
      severity: 'critical',
      title: 'No page capture is available',
      message: 'The scan contains no captures, so no UI/UX checks could run.',
      actual: { captureCount: 0 },
      expected: { minimumCaptureCount: 1 },
      recommendation: 'Capture the page successfully before treating this run as UI/UX coverage.',
    }));
  }

  for (const inputCapture of captures) {
    const capture = inputCapture?.url || !scan?.url
      ? inputCapture
      : { ...inputCapture, url: scan.url };
    coverage.viewports.push(capture?.viewport ?? {});
    coverage.themes.push(capture?.theme);
    coverage.checkpoints.push(capture?.checkpoint ?? 'initial');
    const invalidReason = captureInvalidReason(capture);
    if (invalidReason) {
      coverage.captures.invalid += 1;
      issues.push(issue(capture, null, {
        ruleId: 'capture.invalid',
        discriminator: invalidReason,
        class: 'objective',
        category: 'Capture',
        severity: 'critical',
        title: 'Capture is not valid UI/UX coverage',
        message: `The capture cannot be analyzed because ${invalidReason}.`,
        actual: { status: capture?.status ?? null, httpStatus: capture?.httpStatus ?? null, reason: invalidReason },
        expected: { status: 'ok', visibleElements: '> 0' },
        recommendation: 'Resolve loading or authentication problems and capture the rendered page again.',
      }));
      continue;
    }
    coverage.captures.valid += 1;
    analyzeCapture(capture, thresholds, config, coverage, issues);
  }

  issues.sort((left, right) => left.id.localeCompare(right.id));
  finalizeCoverage(coverage);
  const colorGrade = buildColorGrade(coverage, issues);
  coverage.colorGrade = colorGrade;
  const summary = summarize(issues, coverage);
  summary.colorGrade = colorGrade.grade;
  const verdict = coverage.captures.valid === 0
    ? 'invalid-capture'
    : summary.objectiveFailures > 0
      ? 'fail'
      : summary.heuristicReviews > 0
        ? 'review'
        : 'pass';

  return { verdict, issues, coverage, summary, colorGrade };
}
