import { spellCheckDocument } from 'cspell-lib';

const ENGLISH_LOCALE = /^en(?:-|$)/i;
const WORD = /[\p{L}][\p{L}\p{M}'\u2019-]*/gu;
const URL_OR_EMAIL = /(?:https?:\/\/|www\.)\S+|\b\S+@\S+\.\S+\b/giu;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function spellingOptions(config = {}) {
  const settings = config.content?.spelling ?? {};
  return {
    enabled: settings.enabled !== false,
    locale: settings.locale || null,
    words: [...new Set([
      ...asArray(config.approved?.terms),
      ...asArray(settings.words),
    ].map(String).map((word) => word.trim()).filter(Boolean))],
    ignoreWords: [...new Set(asArray(settings.ignoreWords).map(String).map((word) => word.trim()).filter(Boolean))],
    minimumWordLength: Number.isFinite(settings.minimumWordLength) ? settings.minimumWordLength : 4,
    maximumIssuesPerCapture: Number.isFinite(settings.maximumIssuesPerCapture)
      ? settings.maximumIssuesPerCapture
      : 50,
    ignoreUppercaseAcronyms: settings.ignoreUppercaseAcronyms !== false,
  };
}

function localeFor(capture, config, options) {
  return String(options.locale || capture?.language || config.locale || 'en').trim();
}

function dictionaryLocaleFor(locale) {
  const normalized = String(locale || 'en').replace('_', '-');
  if (/^en-in$/i.test(normalized)) return 'en-GB';
  if (/^en-(?!gb$|us$)/i.test(normalized)) return 'en';
  return normalized;
}

function spellingSegments(capture) {
  const seen = new Set();
  const segments = [];
  const add = (text, source, element = null) => {
    let normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return;
    const collectorLimited = source === 'visible-text' || source.startsWith('accessible-name:');
    if (collectorLimited && normalized.length >= 160) {
      normalized = normalized.replace(/\S+$/u, '').trim();
      if (!normalized) return;
    }
    const stableKey = element?.stableKey ?? element?.selector ?? 'capture';
    const key = `${stableKey}|${source}|${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({
      text: normalized,
      source,
      selector: element?.selector ?? null,
      stableKey,
    });
  };

  add(capture?.title, 'document-title');
  for (const element of asArray(capture?.elements)) {
    add(element?.text, 'visible-text', element);
    add(element?.placeholder, 'placeholder', element);
    if (element?.accessibleName && element.accessibleName !== element.text
      && element.accessibleName !== element.placeholder) {
      add(element.accessibleName, `accessible-name:${element.nameSource || 'computed'}`, element);
    }
    if (element?.image?.alt && element.image.alt !== element.text
      && element.image.alt !== element.accessibleName) {
      add(element.image.alt, 'image-alt', element);
    }
  }
  return segments;
}

function maskIgnoredText(text) {
  return String(text).replace(URL_OR_EMAIL, (match) => ' '.repeat(match.length));
}

function buildDocument(segments) {
  const ranges = [];
  let offset = 0;
  const lines = [];
  for (const segment of segments) {
    const text = maskIgnoredText(segment.text).replace(/[\r\n]+/g, ' ');
    ranges.push({ start: offset, end: offset + text.length, segment });
    lines.push(text);
    offset += text.length + 1;
  }
  return { text: lines.join('\n'), ranges };
}

function segmentAt(ranges, offset) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle];
    if (offset < range.start) high = middle - 1;
    else if (offset > range.end) low = middle + 1;
    else return range.segment;
  }
  return null;
}

function countEligibleWords(text, options) {
  return [...String(text).matchAll(WORD)]
    .map((match) => match[0])
    .filter((word) => word.length >= options.minimumWordLength)
    .filter((word) => !(options.ignoreUppercaseAcronyms && /^[A-Z]{2,8}$/.test(word)))
    .length;
}

function normalizedSuggestions(item) {
  return [...new Set(asArray(item?.suggestions)
    .map(String)
    .map((word) => word.trim())
    .filter(Boolean))].slice(0, 5);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function spellingCacheKey(locale, dictionaryLocale, segments, options) {
  return JSON.stringify({
    locale,
    dictionaryLocale,
    segments,
    words: options.words,
    ignoreWords: options.ignoreWords,
    minimumWordLength: options.minimumWordLength,
    maximumIssuesPerCapture: options.maximumIssuesPerCapture,
    ignoreUppercaseAcronyms: options.ignoreUppercaseAcronyms,
  });
}

function cacheCompleteResult(cache, key, result) {
  const completed = { ...result, cacheHit: false };
  if (cache) cache.set(key, cloneData(completed));
  return completed;
}

async function inspectCaptureSpelling(capture, config, options, cache = null) {
  const locale = localeFor(capture, config, options);
  const dictionaryLocale = dictionaryLocaleFor(locale);
  if (!options.enabled) {
    return { status: 'disabled', locale, testedWords: 0, issueCount: 0, issues: [] };
  }
  if (!ENGLISH_LOCALE.test(locale)) {
    return {
      status: 'not-applicable',
      locale,
      reason: 'The bundled spelling profile currently supports English-language page content.',
      testedWords: 0,
      issueCount: 0,
      issues: [],
    };
  }

  const segments = spellingSegments(capture);
  const document = buildDocument(segments);
  const cacheKey = spellingCacheKey(locale, dictionaryLocale, segments, options);
  const cached = cache?.get(cacheKey);
  if (cached) {
    return { ...cloneData(cached), cacheHit: true };
  }

  const testedWords = countEligibleWords(document.text, options);
  if (!document.text.trim() || testedWords === 0) {
    return cacheCompleteResult(cache, cacheKey, {
      status: 'complete', locale, testedWords: 0, issueCount: 0, issues: [],
    });
  }

  try {
    const result = await spellCheckDocument(
      {
        uri: `uiux://${capture?.captureId || 'capture'}/visible-copy.txt`,
        text: document.text,
        languageId: 'plaintext',
        locale: dictionaryLocale,
      },
      {
        generateSuggestions: true,
        noConfigSearch: true,
        numSuggestions: 5,
      },
      {
        language: dictionaryLocale,
        words: options.words,
        ignoreWords: options.ignoreWords,
        suggestionsTimeout: 1500,
      },
    );

    const byWord = new Map();
    for (const item of asArray(result?.issues)) {
      const word = String(item?.text || '').trim();
      if (word.length < options.minimumWordLength) continue;
      if (options.ignoreUppercaseAcronyms && /^[A-Z]{2,8}$/.test(word)) continue;
      const key = word.toLocaleLowerCase('en');
      const segment = segmentAt(document.ranges, Number(item?.offset) || 0);
      const existing = byWord.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (segment?.selector && !existing.selectors.includes(segment.selector)) {
          existing.selectors.push(segment.selector);
        }
        continue;
      }
      byWord.set(key, {
        word,
        suggestions: normalizedSuggestions(item),
        occurrences: 1,
        selector: segment?.selector ?? null,
        stableKey: segment?.stableKey ?? segment?.selector ?? null,
        sample: segment?.text ?? null,
        source: segment?.source ?? null,
        selectors: segment?.selector ? [segment.selector] : [],
      });
    }

    const allIssues = [...byWord.values()].sort((left, right) => (
      left.word.localeCompare(right.word, 'en', { sensitivity: 'base' })
    ));
    const issues = allIssues.slice(0, options.maximumIssuesPerCapture);
    return cacheCompleteResult(cache, cacheKey, {
      status: 'complete',
      locale,
      dictionaryLocale,
      testedWords,
      issueCount: allIssues.length,
      reportedIssues: issues.length,
      truncated: allIssues.length > issues.length,
      issues,
    });
  } catch (error) {
    return {
      status: 'error',
      locale,
      testedWords,
      issueCount: 0,
      issues: [],
      error: String(error?.message || error).slice(0, 500),
    };
  }
}

/**
 * Add deterministic, local spelling evidence to every valid browser capture.
 * No page copy is sent to a remote service.
 */
export async function enrichScanContent(scan, config = {}) {
  const options = spellingOptions(config);
  const spellingCache = new Map();
  for (const capture of asArray(scan?.captures)) {
    if (String(capture?.status || '').toLowerCase() === 'invalid') continue;
    capture.contentAudit = {
      ...(capture.contentAudit || {}),
      spelling: await inspectCaptureSpelling(capture, config, options, spellingCache),
    };
  }
  return scan;
}

