import { colorToHex, parseCssColor } from './color.mjs';
import { stableHash } from './core.mjs';

const POSITION_TOLERANCE_PX = 2;
const SIZE_TOLERANCE_PX = 2;
const SIZE_TOLERANCE_RATIO = 0.005;
const FONT_SIZE_TOLERANCE_PX = 0.5;
const LINE_HEIGHT_TOLERANCE_PX = 0.5;
const LETTER_SPACING_TOLERANCE_PX = 0.25;
const RADIUS_TOLERANCE_PX = 0.5;
const COLOR_TOLERANCE = 1.5;
const TOKEN_COLOR_TOLERANCE = 12;

const DIFFERENCE_ORDER = new Map([
  ['capture-added', 0],
  ['capture-removed', 1],
  ['added', 2],
  ['removed', 3],
  ['moved', 4],
  ['resized', 5],
  ['restyled', 6],
  ['token-profile', 7],
]);

const TOKEN_DEFINITIONS = [
  {
    category: 'font-family',
    source: 'fontFamilies',
    kind: 'string',
    normalize: normalizeFontFamily,
  },
  {
    category: 'type-scale',
    source: 'fontSizes',
    kind: 'number',
    tolerance: FONT_SIZE_TOLERANCE_PX,
  },
  {
    category: 'palette',
    source: 'colors',
    kind: 'color',
    tolerance: TOKEN_COLOR_TOLERANCE,
  },
  {
    category: 'spacing',
    source: 'spacing',
    kind: 'number',
    tolerance: 1,
  },
  {
    category: 'radii',
    source: 'radii',
    kind: 'number',
    tolerance: RADIUS_TOLERANCE_PX,
  },
  {
    category: 'shadows',
    source: 'shadows',
    kind: 'string',
    normalize: normalizeCssText,
  },
];

const TOKEN_CATEGORY_ORDER = new Map(
  TOKEN_DEFINITIONS.map((definition, index) => [definition.category, index]),
);

/**
 * Compare two scanner results without reading files or launching a browser.
 * The target is the current page; the reference is the approved baseline or
 * another design. Results deliberately omit URLs, screenshots, timestamps and
 * artifact paths so that they are deterministic and safe to persist.
 */
export function compareScans(targetScan, referenceScan, { mode = 'reference' } = {}) {
  validateScan(targetScan, 'Target scan');
  validateScan(referenceScan, 'Reference scan');

  const normalizedMode = String(mode || 'reference');
  const targetCaptures = captureMap(targetScan.captures, 'target');
  const referenceCaptures = captureMap(referenceScan.captures, 'reference');
  const captureKeys = [...new Set([
    ...targetCaptures.keys(),
    ...referenceCaptures.keys(),
  ])].sort(compareText);

  const captures = [];
  const differences = [];

  for (const key of captureKeys) {
    const target = targetCaptures.get(key);
    const reference = referenceCaptures.get(key);

    if (!reference) {
      const item = unmatchedCapture(key, target, 'added');
      captures.push(item);
      differences.push(captureDifference(item, 'capture-added'));
      continue;
    }
    if (!target) {
      const item = unmatchedCapture(key, reference, 'removed');
      captures.push(item);
      differences.push(captureDifference(item, 'capture-removed'));
      continue;
    }

    const targetElements = elementMap(target.elements);
    const referenceElements = elementMap(reference.elements);
    const reliability = assessDomReliability(
      targetElements,
      referenceElements,
      sameDocumentHint(targetScan, referenceScan, target, reference),
    );
    const tokenProfile = compareTokenProfiles(target.tokens, reference.tokens);
    const captureDifferences = reliability.semanticMatching
      ? compareElements(key, targetElements, referenceElements)
      : tokenProfile.categories
        .filter((category) => category.similarity < 1)
        .map((category) => tokenDifference(key, category));

    const differenceCounts = countDifferenceTypes(captureDifferences);
    captures.push({
      captureKey: key,
      viewport: publicViewport(target.viewport || reference.viewport),
      theme: captureTheme(target),
      checkpoint: captureCheckpoint(target),
      status: 'matched',
      reliability,
      dom: {
        targetElements: targetElements.size,
        referenceElements: referenceElements.size,
        matchedStableKeys: reliability.matchedStableKeys,
        comparedElements: reliability.semanticMatching ? reliability.matchedStableKeys : 0,
      },
      tokenProfile,
      summary: {
        differences: captureDifferences.length,
        byType: differenceCounts,
      },
    });
    differences.push(...captureDifferences);
  }

  differences.sort(compareDifferences);
  captures.sort((a, b) => compareText(a.captureKey, b.captureKey));
  const reliability = aggregateReliability(captures);

  return {
    mode: normalizedMode,
    reliability,
    summary: buildSummary(targetCaptures, referenceCaptures, captures, differences),
    captures,
    differences,
  };
}

/**
 * Compare parsed audit JSON values. This accepts the direct scan shape and the
 * common audit wrappers used by the CLI, but intentionally never interprets a
 * string as a filesystem path.
 */
export function compareAuditFiles(currentAudit, baselineAudit) {
  const current = extractScan(parseAuditValue(currentAudit, 'Current audit'), 'Current audit');
  const baseline = extractScan(parseAuditValue(baselineAudit, 'Baseline audit'), 'Baseline audit');
  return compareScans(current, baseline, { mode: 'baseline' });
}

function validateScan(scan, label) {
  if (!scan || typeof scan !== 'object' || Array.isArray(scan)) {
    throw new TypeError(`${label} must be an object.`);
  }
  if (!Array.isArray(scan.captures)) {
    throw new TypeError(`${label} must contain a captures array.`);
  }
}

function parseAuditValue(value, label) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function extractScan(audit, label) {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw new TypeError(`${label} must be an object or parsed JSON object.`);
  }

  const preferred = [
    audit.scan,
    audit.targetScan,
    audit.scanResult,
    audit.target,
    audit.website,
    audit.result?.scan,
    audit.audit?.scan,
    audit.data?.scan,
    audit.scans?.target,
  ];
  if (Array.isArray(audit.captures)) preferred.unshift(audit);
  for (const candidate of preferred) {
    if (candidate && typeof candidate === 'object' && Array.isArray(candidate.captures)) {
      return candidate;
    }
  }

  const seen = new WeakSet();
  const queue = [{ value: audit, depth: 0 }];
  while (queue.length) {
    const item = queue.shift();
    if (!item.value || typeof item.value !== 'object' || seen.has(item.value)) continue;
    seen.add(item.value);
    if (Array.isArray(item.value.captures)) return item.value;
    if (item.depth >= 4) continue;
    for (const key of Object.keys(item.value).sort(compareText)) {
      if (['baseline', 'comparison', 'differences', 'reference'].includes(key)) continue;
      const child = item.value[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        queue.push({ value: child, depth: item.depth + 1 });
      }
    }
  }
  throw new Error(`${label} does not contain a scanner result with captures.`);
}

function captureMap(captures, label) {
  const map = new Map();
  for (const capture of captures) {
    const key = captureKey(capture);
    if (map.has(key)) {
      throw new Error(`Duplicate ${label} capture for ${key}.`);
    }
    map.set(key, capture);
  }
  return map;
}

function captureKey(capture) {
  const viewport = capture?.viewport?.name;
  if (!viewport || typeof viewport !== 'string') {
    throw new Error('Every capture needs viewport.name for comparison.');
  }
  return `${viewport}::${captureTheme(capture)}::${captureCheckpoint(capture)}`;
}

function captureTheme(capture) {
  return String(capture?.theme || 'no-preference');
}

function captureCheckpoint(capture) {
  return String(capture?.checkpoint || 'page');
}

function publicViewport(viewport = {}) {
  return {
    name: String(viewport.name || ''),
    width: finiteOrNull(viewport.width),
    height: finiteOrNull(viewport.height),
    isMobile: !!viewport.isMobile,
  };
}

function unmatchedCapture(key, capture, direction) {
  return {
    captureKey: key,
    viewport: publicViewport(capture.viewport),
    theme: captureTheme(capture),
    checkpoint: captureCheckpoint(capture),
    status: direction,
    reliability: {
      level: 'low',
      status: 'unreliable',
      semanticMatching: false,
      score: 0,
      matchedStableKeys: 0,
      reason: direction === 'added'
        ? 'No reference capture has this viewport, theme and checkpoint.'
        : 'No target capture has this viewport, theme and checkpoint.',
    },
    dom: {
      targetElements: direction === 'added' ? elementMap(capture.elements).size : 0,
      referenceElements: direction === 'removed' ? elementMap(capture.elements).size : 0,
      matchedStableKeys: 0,
      comparedElements: 0,
    },
    tokenProfile: null,
    summary: {
      differences: 1,
      byType: { [direction === 'added' ? 'capture-added' : 'capture-removed']: 1 },
    },
  };
}

function captureDifference(capture, type) {
  return {
    captureKey: capture.captureKey,
    type,
    viewport: capture.viewport,
    theme: capture.theme,
    checkpoint: capture.checkpoint,
  };
}

function elementMap(elements) {
  const sorted = (Array.isArray(elements) ? elements : [])
    .filter((element) => element && typeof element.stableKey === 'string' && element.stableKey)
    .slice()
    .sort((a, b) => compareText(a.stableKey, b.stableKey)
      || compareText(a.selector || '', b.selector || '')
      || compareText(a.tag || '', b.tag || ''));
  const map = new Map();
  for (const element of sorted) {
    if (!map.has(element.stableKey)) map.set(element.stableKey, element);
  }
  return map;
}

function assessDomReliability(target, reference, sameDocument) {
  const targetKeys = [...target.keys()];
  const referenceKeys = new Set(reference.keys());
  const matched = targetKeys.filter((key) => referenceKeys.has(key));
  const union = new Set([...targetKeys, ...reference.keys()]).size;
  const jaccard = union ? matched.length / union : 0;
  const f1 = target.size + reference.size
    ? (2 * matched.length) / (target.size + reference.size)
    : 0;
  const strongMatches = matched.filter(isStrongStableKey).length;
  const exactNonEmpty = target.size > 0 && target.size === reference.size && matched.length === target.size;
  const enoughEvidence = sameDocument
    ? (matched.length >= 3 || strongMatches >= 1 || (exactNonEmpty && matched.length >= 2))
    : strongMatches >= 2;
  const threshold = sameDocument ? 0.4 : 0.5;
  const semanticMatching = enoughEvidence && f1 >= threshold;
  const score = round((f1 * 0.7) + (jaccard * 0.3));
  const level = semanticMatching && f1 >= 0.75 ? 'high'
    : semanticMatching ? 'medium'
      : 'low';
  const reason = semanticMatching
    ? `Stable DOM keys overlap sufficiently (${matched.length} matched; F1 ${formatScore(f1)}).`
    : `Semantic matching is unreliable: stable DOM overlap is insufficient (${matched.length} matched; F1 ${formatScore(f1)}). Element-level differences were suppressed and design-token profiles were compared instead.`;
  return {
    level,
    status: semanticMatching ? 'reliable' : 'unreliable',
    semanticMatching,
    score,
    matchedStableKeys: matched.length,
    strongStableKeyMatches: strongMatches,
    jaccard: round(jaccard),
    f1: round(f1),
    reason,
  };
}

function isStrongStableKey(key) {
  return /^(?:testid|id|role)=/i.test(key);
}

function sameDocumentHint(targetScan, referenceScan, targetCapture, referenceCapture) {
  const target = canonicalDocumentUrl(targetCapture?.url || targetScan?.finalUrl || targetScan?.url);
  const reference = canonicalDocumentUrl(referenceCapture?.url || referenceScan?.finalUrl || referenceScan?.url);
  return !!target && target === reference;
}

function canonicalDocumentUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.href;
  } catch {
    return null;
  }
}

function compareElements(captureKeyValue, target, reference) {
  const differences = [];
  const targetKeys = new Set(target.keys());
  const referenceKeys = new Set(reference.keys());

  for (const key of [...targetKeys].filter((value) => !referenceKeys.has(value)).sort(compareText)) {
    differences.push({
      captureKey: captureKeyValue,
      type: 'added',
      stableKey: key,
      element: elementDescriptor(target.get(key)),
      target: elementState(target.get(key)),
    });
  }
  for (const key of [...referenceKeys].filter((value) => !targetKeys.has(value)).sort(compareText)) {
    differences.push({
      captureKey: captureKeyValue,
      type: 'removed',
      stableKey: key,
      element: elementDescriptor(reference.get(key)),
      reference: elementState(reference.get(key)),
    });
  }

  const matched = [...targetKeys].filter((key) => referenceKeys.has(key)).sort(compareText);
  for (const key of matched) {
    const after = target.get(key);
    const before = reference.get(key);
    const descriptor = elementDescriptor(after);
    const moved = movementChange(after.box, before.box);
    if (moved) {
      differences.push({
        captureKey: captureKeyValue,
        type: 'moved',
        stableKey: key,
        element: descriptor,
        reference: moved.reference,
        target: moved.target,
        delta: moved.delta,
        tolerancePx: POSITION_TOLERANCE_PX,
      });
    }
    const resized = sizeChange(after.box, before.box);
    if (resized) {
      differences.push({
        captureKey: captureKeyValue,
        type: 'resized',
        stableKey: key,
        element: descriptor,
        reference: resized.reference,
        target: resized.target,
        delta: resized.delta,
        tolerancePx: resized.tolerance,
      });
    }
    const changes = styleChanges(after.styles, before.styles);
    if (changes.length) {
      differences.push({
        captureKey: captureKeyValue,
        type: 'restyled',
        stableKey: key,
        element: descriptor,
        changes,
      });
    }
  }
  return differences;
}

function elementDescriptor(element = {}) {
  return {
    selector: String(element.selector || ''),
    tag: String(element.tag || ''),
    role: String(element.role || ''),
  };
}

function elementState(element = {}) {
  return {
    box: publicBox(element.box),
    styles: publicStyles(element.styles),
  };
}

function publicBox(box = {}) {
  return {
    x: finiteOrNull(box.x),
    y: finiteOrNull(box.y),
    width: finiteOrNull(box.width),
    height: finiteOrNull(box.height),
  };
}

function publicStyles(styles = {}) {
  return {
    fontFamily: safeValue(styles.fontFamily),
    fontSize: finiteOrValue(styles.fontSize),
    fontWeight: finiteOrValue(styles.fontWeight),
    lineHeight: finiteOrValue(styles.lineHeight),
    color: canonicalColor(styles.color),
    backgroundColor: canonicalColor(styles.backgroundColor),
    backgroundImage: safeBackgroundImage(styles.backgroundImage),
    borderColor: canonicalColor(styles.borderColor),
    borderRadius: finiteOrValue(styles.borderRadius),
  };
}

function movementChange(targetBox = {}, referenceBox = {}) {
  const targetX = finiteOrNull(targetBox.x);
  const targetY = finiteOrNull(targetBox.y);
  const referenceX = finiteOrNull(referenceBox.x);
  const referenceY = finiteOrNull(referenceBox.y);
  if ([targetX, targetY, referenceX, referenceY].some((value) => value === null)) return null;
  const delta = { x: round(targetX - referenceX, 2), y: round(targetY - referenceY, 2) };
  if (Math.abs(delta.x) <= POSITION_TOLERANCE_PX && Math.abs(delta.y) <= POSITION_TOLERANCE_PX) return null;
  return {
    reference: { x: referenceX, y: referenceY },
    target: { x: targetX, y: targetY },
    delta,
  };
}

function sizeChange(targetBox = {}, referenceBox = {}) {
  const targetWidth = finiteOrNull(targetBox.width);
  const targetHeight = finiteOrNull(targetBox.height);
  const referenceWidth = finiteOrNull(referenceBox.width);
  const referenceHeight = finiteOrNull(referenceBox.height);
  if ([targetWidth, targetHeight, referenceWidth, referenceHeight].some((value) => value === null)) return null;
  const widthTolerance = Math.max(SIZE_TOLERANCE_PX, Math.abs(referenceWidth) * SIZE_TOLERANCE_RATIO);
  const heightTolerance = Math.max(SIZE_TOLERANCE_PX, Math.abs(referenceHeight) * SIZE_TOLERANCE_RATIO);
  const delta = {
    width: round(targetWidth - referenceWidth, 2),
    height: round(targetHeight - referenceHeight, 2),
  };
  if (Math.abs(delta.width) <= widthTolerance && Math.abs(delta.height) <= heightTolerance) return null;
  return {
    reference: { width: referenceWidth, height: referenceHeight },
    target: { width: targetWidth, height: targetHeight },
    delta,
    tolerance: {
      width: round(widthTolerance, 2),
      height: round(heightTolerance, 2),
    },
  };
}

function styleChanges(targetStyles = {}, referenceStyles = {}) {
  const specifications = [
    ['font', 'fontFamily', fontEquivalent, null],
    ['font', 'fontSize', numericEquivalent, FONT_SIZE_TOLERANCE_PX],
    ['font', 'fontWeight', exactStyleEquivalent, null],
    ['font', 'lineHeight', numericEquivalent, LINE_HEIGHT_TOLERANCE_PX],
    ['font', 'letterSpacing', numericEquivalent, LETTER_SPACING_TOLERANCE_PX],
    ['color', 'color', colorEquivalent, COLOR_TOLERANCE],
    ['color', 'borderColor', colorEquivalent, COLOR_TOLERANCE],
    ['background', 'backgroundColor', colorEquivalent, COLOR_TOLERANCE],
    ['background', 'backgroundImage', backgroundEquivalent, null],
    ['radius', 'borderRadius', numericEquivalent, RADIUS_TOLERANCE_PX],
  ];
  const changes = [];
  for (const [group, property, equivalent, tolerance] of specifications) {
    const target = targetStyles[property];
    const reference = referenceStyles[property];
    const same = equivalent(target, reference, tolerance);
    if (same) continue;
    const change = {
      group,
      property,
      reference: safeStyleOutput(property, reference),
      target: safeStyleOutput(property, target),
    };
    if (tolerance !== null) change.tolerance = tolerance;
    if (numericValue(target) !== null && numericValue(reference) !== null) {
      change.delta = round(numericValue(target) - numericValue(reference), 3);
    }
    changes.push(change);
  }
  return changes;
}

function fontEquivalent(a, b) {
  return normalizeFontFamily(a) === normalizeFontFamily(b);
}

function exactStyleEquivalent(a, b) {
  const aNumber = numericValue(a);
  const bNumber = numericValue(b);
  if (aNumber !== null && bNumber !== null) return aNumber === bNumber;
  return normalizeCssText(a) === normalizeCssText(b);
}

function numericEquivalent(a, b, tolerance = 0) {
  const aNumber = numericValue(a);
  const bNumber = numericValue(b);
  if (aNumber === null || bNumber === null) return aNumber === bNumber;
  return Math.abs(aNumber - bNumber) <= tolerance;
}

function colorEquivalent(a, b, tolerance = 0) {
  const aColor = parseCssColor(a);
  const bColor = parseCssColor(b);
  if (!aColor || !bColor) return normalizeCssText(a) === normalizeCssText(b);
  return colorDistance(aColor, bColor) <= tolerance;
}

function backgroundEquivalent(a, b) {
  return backgroundFingerprint(a) === backgroundFingerprint(b);
}

function safeStyleOutput(property, value) {
  if (property === 'backgroundImage') return safeBackgroundImage(value);
  if (['color', 'borderColor', 'backgroundColor'].includes(property)) return canonicalColor(value);
  if (property === 'fontFamily') return normalizeFontFamily(value);
  return finiteOrValue(value);
}

function safeBackgroundImage(value) {
  const normalized = normalizeCssText(value);
  if (!normalized || normalized === 'none') return 'none';
  if (/url\s*\(/i.test(normalized)) return `asset:${stableHash(normalized, 12)}`;
  return normalized;
}

function backgroundFingerprint(value) {
  return safeBackgroundImage(value);
}

function compareTokenProfiles(targetTokens = {}, referenceTokens = {}) {
  const categories = TOKEN_DEFINITIONS.map((definition) => compareTokenCategory(
    targetTokens?.[definition.source],
    referenceTokens?.[definition.source],
    definition,
  ));
  const informative = categories.filter((category) => category.targetWeight > 0 || category.referenceWeight > 0);
  const overallSimilarity = informative.length
    ? round(informative.reduce((total, category) => total + category.similarity, 0) / informative.length)
    : 1;
  return { overallSimilarity, categories };
}

function compareTokenCategory(targetValues, referenceValues, definition) {
  const target = tokenEntries(targetValues, definition);
  const reference = tokenEntries(referenceValues, definition);
  const targetRemaining = target.map((entry) => ({ ...entry, remaining: entry.count }));
  const referenceRemaining = reference.map((entry) => ({ ...entry, remaining: entry.count }));
  let matchedWeight = 0;

  for (const targetEntry of targetRemaining) {
    const candidates = referenceRemaining
      .map((referenceEntry) => ({
        referenceEntry,
        distance: tokenDistance(targetEntry, referenceEntry, definition),
      }))
      .filter((candidate) => Number.isFinite(candidate.distance))
      .sort((a, b) => a.distance - b.distance
        || compareText(a.referenceEntry.key, b.referenceEntry.key));
    for (const candidate of candidates) {
      if (targetEntry.remaining <= 0) break;
      if (candidate.referenceEntry.remaining <= 0) continue;
      const amount = Math.min(targetEntry.remaining, candidate.referenceEntry.remaining);
      targetEntry.remaining -= amount;
      candidate.referenceEntry.remaining -= amount;
      matchedWeight += amount;
    }
  }

  const targetWeight = target.reduce((total, entry) => total + entry.count, 0);
  const referenceWeight = reference.reduce((total, entry) => total + entry.count, 0);
  const unionWeight = targetWeight + referenceWeight - matchedWeight;
  const similarity = unionWeight ? matchedWeight / unionWeight : 1;
  return {
    category: definition.category,
    similarity: round(similarity),
    targetWeight,
    referenceWeight,
    matchedWeight: round(matchedWeight),
    targetOnly: remainingTokens(targetRemaining),
    referenceOnly: remainingTokens(referenceRemaining),
  };
}

function tokenEntries(values, definition) {
  const accumulated = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    const rawValue = item && typeof item === 'object' && 'value' in item ? item.value : item;
    const countValue = item && typeof item === 'object' && 'count' in item ? Number(item.count) : 1;
    const count = Number.isFinite(countValue) && countValue > 0 ? countValue : 1;
    const normalized = normalizeToken(rawValue, definition);
    if (!normalized) continue;
    const previous = accumulated.get(normalized.key);
    if (previous) previous.count += count;
    else accumulated.set(normalized.key, { ...normalized, count });
  }
  return [...accumulated.values()].sort((a, b) => compareText(a.key, b.key));
}

function normalizeToken(value, definition) {
  if (definition.kind === 'number') {
    const number = numericValue(value);
    if (number === null) return null;
    const rounded = round(number, 3);
    return { key: String(rounded), value: rounded, metric: rounded };
  }
  if (definition.kind === 'color') {
    const parsed = parseCssColor(value);
    if (!parsed) {
      const normalized = normalizeCssText(value);
      return normalized ? { key: normalized, value: normalized, metric: null } : null;
    }
    const canonical = colorToHex(parsed, true);
    return { key: canonical, value: canonical, metric: parsed };
  }
  const normalized = (definition.normalize || normalizeCssText)(value);
  return normalized ? { key: normalized, value: normalized, metric: normalized } : null;
}

function tokenDistance(target, reference, definition) {
  if (definition.kind === 'number') {
    const distance = Math.abs(target.metric - reference.metric);
    return distance <= definition.tolerance ? distance : Number.POSITIVE_INFINITY;
  }
  if (definition.kind === 'color' && target.metric && reference.metric) {
    const distance = colorDistance(target.metric, reference.metric);
    return distance <= definition.tolerance ? distance : Number.POSITIVE_INFINITY;
  }
  return target.key === reference.key ? 0 : Number.POSITIVE_INFINITY;
}

function remainingTokens(entries) {
  return entries
    .filter((entry) => entry.remaining > 0)
    .map((entry) => ({ value: entry.value, count: round(entry.remaining) }))
    .sort((a, b) => compareText(String(a.value), String(b.value)));
}

function tokenDifference(captureKeyValue, category) {
  return {
    captureKey: captureKeyValue,
    type: 'token-profile',
    category: category.category,
    similarity: category.similarity,
    targetWeight: category.targetWeight,
    referenceWeight: category.referenceWeight,
    matchedWeight: category.matchedWeight,
    targetOnly: category.targetOnly,
    referenceOnly: category.referenceOnly,
  };
}

function aggregateReliability(captures) {
  const matched = captures.filter((capture) => capture.status === 'matched');
  const reliable = matched.filter((capture) => capture.reliability.semanticMatching);
  const score = matched.length
    ? round(matched.reduce((total, capture) => total + capture.reliability.score, 0) / matched.length)
    : 0;
  if (!matched.length || !reliable.length) {
    return {
      level: 'low',
      status: 'unreliable',
      semanticMatching: false,
      score,
      reason: matched.length
        ? 'Semantic matching is unreliable for every matched capture; comparison uses design-token profiles.'
        : 'No captures share the same viewport, theme and checkpoint.',
    };
  }
  if (reliable.length !== matched.length) {
    return {
      level: 'mixed',
      status: 'mixed',
      semanticMatching: false,
      score,
      reason: `${reliable.length} of ${matched.length} matched captures support semantic element comparison; the rest use design-token profiles.`,
    };
  }
  const level = matched.every((capture) => capture.reliability.level === 'high') ? 'high' : 'medium';
  return {
    level,
    status: 'reliable',
    semanticMatching: true,
    score,
    reason: `All ${matched.length} matched capture${matched.length === 1 ? '' : 's'} support semantic element comparison.`,
  };
}

function buildSummary(targetCaptures, referenceCaptures, captures, differences) {
  const matched = captures.filter((capture) => capture.status === 'matched');
  const targetElementCount = captures.reduce((total, capture) => total + capture.dom.targetElements, 0);
  const referenceElementCount = captures.reduce((total, capture) => total + capture.dom.referenceElements, 0);
  return {
    captures: {
      target: targetCaptures.size,
      reference: referenceCaptures.size,
      matched: matched.length,
      added: captures.filter((capture) => capture.status === 'added').length,
      removed: captures.filter((capture) => capture.status === 'removed').length,
      semanticCompared: matched.filter((capture) => capture.reliability.semanticMatching).length,
      tokenProfileCompared: matched.filter((capture) => !capture.reliability.semanticMatching).length,
    },
    elements: {
      target: targetElementCount,
      reference: referenceElementCount,
      matchedStableKeys: matched.reduce((total, capture) => total + capture.dom.matchedStableKeys, 0),
      comparedSemantically: matched.reduce((total, capture) => total + capture.dom.comparedElements, 0),
    },
    differences: {
      total: differences.length,
      byType: countDifferenceTypes(differences),
    },
  };
}

function countDifferenceTypes(differences) {
  const counts = new Map();
  for (const difference of differences) {
    counts.set(difference.type, (counts.get(difference.type) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => {
    const aOrder = DIFFERENCE_ORDER.get(a[0]) ?? 99;
    const bOrder = DIFFERENCE_ORDER.get(b[0]) ?? 99;
    return aOrder - bOrder || compareText(a[0], b[0]);
  }));
}

function compareDifferences(a, b) {
  return compareText(a.captureKey, b.captureKey)
    || (DIFFERENCE_ORDER.get(a.type) ?? 99) - (DIFFERENCE_ORDER.get(b.type) ?? 99)
    || (TOKEN_CATEGORY_ORDER.get(a.category) ?? 99) - (TOKEN_CATEGORY_ORDER.get(b.category) ?? 99)
    || compareText(a.stableKey || a.category || '', b.stableKey || b.category || '');
}

function canonicalColor(value) {
  const parsed = parseCssColor(value);
  return parsed ? colorToHex(parsed, true) : normalizeCssText(value) || null;
}

function colorDistance(a, b) {
  const alphaDistance = Math.abs(a.a - b.a) * 255;
  return Math.sqrt(
    (a.r - b.r) ** 2
    + (a.g - b.g) ** 2
    + (a.b - b.b) ** 2
    + alphaDistance ** 2,
  );
}

function normalizeFontFamily(value) {
  return String(value ?? '')
    .split(',')
    .map((family) => family.trim().replace(/^(?:['"])(.*)(?:['"])$/, '$1').toLowerCase())
    .filter(Boolean)
    .join(', ');
}

function normalizeCssText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteOrNull(value) {
  const number = numericValue(value);
  return number === null ? null : round(number, 3);
}

function finiteOrValue(value) {
  const number = numericValue(value);
  return number === null ? safeValue(value) : round(number, 3);
}

function safeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function formatScore(value) {
  return round(value, 3).toFixed(3);
}

function compareText(a, b) {
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
