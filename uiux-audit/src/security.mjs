import { sanitizeText, stableHash } from './core.mjs';

const MAX_TRACKED_REQUESTS = 5000;
const SAFE_REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);
const SESSION_COOKIE = /(sess(?:ion)?|auth|token|jwt|(?:^|[_-])sid(?:$|[_-])|identity|connect\.sid|remember)/i;
const SENSITIVE_QUERY = /(token|secret|password|passwd|api[-_]?key|authorization|auth|session|jwt|code|signature|credential)/i;

const unique = (values) => [...new Set(values.filter(Boolean))].sort();

function normalizedHeaderEntries(headers = []) {
  if (Array.isArray(headers)) {
    return headers
      .filter((entry) => entry && entry.name)
      .map((entry) => ({ name: String(entry.name).toLowerCase(), value: String(entry.value ?? '') }));
  }
  return Object.entries(headers || {}).map(([name, value]) => ({
    name: String(name).toLowerCase(),
    value: String(value ?? ''),
  }));
}

function valuesFor(entries, name) {
  const normalized = String(name).toLowerCase();
  return entries.filter((entry) => entry.name === normalized).map((entry) => entry.value);
}

function firstValue(entries, name) {
  return valuesFor(entries, name)[0] || '';
}

function parseDirectivePolicy(value) {
  const directives = new Map();
  for (const part of String(value || '').split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    directives.set(tokens[0].toLowerCase(), tokens.slice(1).map((token) => token.toLowerCase()));
  }
  return directives;
}

function effectiveSources(policy, directive) {
  if (policy.has(directive)) return policy.get(directive);
  if (directive.endsWith('-src') && policy.has('default-src')) return policy.get('default-src');
  return null;
}

function sourceAllows(policy, directive, token) {
  const sources = effectiveSources(policy, directive);
  return sources === null || sources.includes(token);
}

function sourceIsBroad(policy, directive) {
  const sources = effectiveSources(policy, directive);
  if (sources === null) return true;
  return sources.some((source) => source === '*' || source === 'http:' || source === 'https:' || source === 'data:');
}

function sourceHasNonceOrHash(policy, directive) {
  const sources = effectiveSources(policy, directive) || [];
  return sources.some((source) => /^'(?:nonce-|sha(?:256|384|512)-)/.test(source));
}

function directiveRestricted(policy, directive) {
  const sources = effectiveSources(policy, directive);
  if (!sources) return false;
  return sources.includes("'none'") || (!sources.includes('*') && !sources.includes('http:') && !sources.includes('https:'));
}

/**
 * Return CSP posture without persisting policy text, nonce values, hashes, or
 * reporting endpoints. Multiple enforced policies are treated as an
 * intersection, matching browser enforcement.
 */
export function summarizeCsp(values, delivery = 'header') {
  const supplied = (Array.isArray(values) ? values : [values]).filter((value) => String(value || '').trim());
  if (!supplied.length) return { present: false, delivery, policyCount: 0 };
  const policies = supplied.map(parseDirectivePolicy);
  const directiveNames = unique(policies.flatMap((policy) => [...policy.keys()]));
  return {
    present: true,
    delivery,
    policyCount: policies.length,
    directiveNames,
    script: {
      restricted: policies.some((policy) => directiveRestricted(policy, 'script-src')),
      allowsUnsafeInline: policies.every((policy) => sourceAllows(policy, 'script-src', "'unsafe-inline'")),
      allowsUnsafeEval: policies.every((policy) => sourceAllows(policy, 'script-src', "'unsafe-eval'")),
      broadSource: policies.every((policy) => sourceIsBroad(policy, 'script-src')),
      nonceOrHash: policies.some((policy) => sourceHasNonceOrHash(policy, 'script-src')),
      strictDynamic: policies.some((policy) => (effectiveSources(policy, 'script-src') || []).includes("'strict-dynamic'")),
    },
    style: {
      allowsUnsafeInline: policies.every((policy) => sourceAllows(policy, 'style-src', "'unsafe-inline'")),
      broadSource: policies.every((policy) => sourceIsBroad(policy, 'style-src')),
      nonceOrHash: policies.some((policy) => sourceHasNonceOrHash(policy, 'style-src')),
    },
    objectSourceRestricted: policies.some((policy) => directiveRestricted(policy, 'object-src')),
    baseUriRestricted: policies.some((policy) => policy.has('base-uri') && directiveRestricted(policy, 'base-uri')),
    frameAncestorsPresent: policies.some((policy) => policy.has('frame-ancestors')),
    formActionPresent: policies.some((policy) => policy.has('form-action')),
    upgradeInsecureRequests: policies.some((policy) => policy.has('upgrade-insecure-requests')),
  };
}

function summarizeHsts(value) {
  if (!String(value || '').trim()) return { present: false };
  const maximumAge = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(value);
  return {
    present: true,
    maxAgeSeconds: maximumAge ? Number(maximumAge[1]) : null,
    includeSubDomains: /(?:^|;)\s*includesubdomains\s*(?:;|$)/i.test(value),
    preload: /(?:^|;)\s*preload\s*(?:;|$)/i.test(value),
  };
}

function summarizeCacheControl(value) {
  const directives = unique(String(value || '').toLowerCase().split(',').map((part) => part.trim().split('=')[0]));
  return {
    present: directives.length > 0,
    directives,
    noStore: directives.includes('no-store'),
    private: directives.includes('private'),
    public: directives.includes('public'),
  };
}

function normalizedKnownValue(value, allowed) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return allowed.has(normalized) ? normalized : 'other';
}

function cookiePrefix(name) {
  if (name.startsWith('__Host-Http-')) return '__Host-Http-';
  if (name.startsWith('__Host-')) return '__Host-';
  if (name.startsWith('__Http-')) return '__Http-';
  if (name.startsWith('__Secure-')) return '__Secure-';
  return null;
}

function summarizeCookie(header) {
  const parts = String(header || '').split(';').map((part) => part.trim()).filter(Boolean);
  const separator = parts[0]?.indexOf('=') ?? -1;
  if (separator <= 0) return null;
  const name = parts[0].slice(0, separator).trim();
  const attributes = new Map();
  for (const part of parts.slice(1)) {
    const index = part.indexOf('=');
    const key = (index < 0 ? part : part.slice(0, index)).trim().toLowerCase();
    const value = index < 0 ? true : part.slice(index + 1).trim();
    attributes.set(key, value);
  }
  const sameSiteRaw = String(attributes.get('samesite') || '').toLowerCase();
  const sameSite = ['strict', 'lax', 'none'].includes(sameSiteRaw) ? sameSiteRaw : null;
  const prefix = cookiePrefix(name);
  return {
    id: `cookie-${stableHash(name, 12)}`,
    nameClass: SESSION_COOKIE.test(name) ? 'session-like' : 'other',
    prefix,
    secure: attributes.has('secure'),
    httpOnly: attributes.has('httponly'),
    sameSite,
    partitioned: attributes.has('partitioned'),
    domainScoped: attributes.has('domain'),
    pathRoot: attributes.get('path') === '/',
    persistent: attributes.has('expires') || attributes.has('max-age'),
    expiresDefined: attributes.has('expires'),
    maxAgeDefined: attributes.has('max-age'),
    deletion: attributes.has('max-age') && Number(attributes.get('max-age')) <= 0,
  };
}

function summarizePermissionsPolicy(value) {
  const directiveNames = unique(String(value || '').split(',').map((part) => {
    const match = /^\s*([a-z0-9-]+)\s*=/.exec(part.toLowerCase());
    return match?.[1] || null;
  }));
  return { present: directiveNames.length > 0, directiveNames };
}

function summarizeContentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return {
    present: Boolean(normalized),
    mediaType: normalized.split(';')[0] || null,
    charsetDefined: /(?:^|;)\s*charset\s*=/.test(normalized),
  };
}

export function summarizeResponseSecurity({ url, status = null, headers = [] } = {}) {
  const entries = normalizedHeaderEntries(headers);
  let parsedUrl = null;
  try { parsedUrl = new URL(url); } catch { /* Keep posture available for malformed fixtures. */ }
  const contentSecurityPolicy = summarizeCsp(valuesFor(entries, 'content-security-policy'), 'header');
  const reportOnlyPolicy = summarizeCsp(valuesFor(entries, 'content-security-policy-report-only'), 'report-only-header');
  const cookieItems = valuesFor(entries, 'set-cookie').map(summarizeCookie).filter(Boolean);
  const xFrameOptions = normalizedKnownValue(firstValue(entries, 'x-frame-options'), new Set(['deny', 'sameorigin']));
  const referrerPolicy = normalizedKnownValue(firstValue(entries, 'referrer-policy'), SAFE_REFERRER_POLICIES);
  const xContentType = normalizedKnownValue(firstValue(entries, 'x-content-type-options'), new Set(['nosniff']));
  return {
    captured: true,
    status,
    protocol: parsedUrl?.protocol || null,
    headers: {
      strictTransportSecurity: summarizeHsts(firstValue(entries, 'strict-transport-security')),
      contentSecurityPolicy,
      contentSecurityPolicyReportOnly: reportOnlyPolicy,
      xContentTypeOptions: { present: Boolean(xContentType), value: xContentType },
      referrerPolicy: { present: Boolean(referrerPolicy), value: referrerPolicy },
      xFrameOptions: { present: Boolean(xFrameOptions), value: xFrameOptions },
      permissionsPolicy: summarizePermissionsPolicy(firstValue(entries, 'permissions-policy')),
      cacheControl: summarizeCacheControl(firstValue(entries, 'cache-control')),
      contentType: summarizeContentType(firstValue(entries, 'content-type')),
      crossOriginOpenerPolicy: { present: Boolean(firstValue(entries, 'cross-origin-opener-policy')) },
      crossOriginEmbedderPolicy: { present: Boolean(firstValue(entries, 'cross-origin-embedder-policy')) },
      crossOriginResourcePolicy: { present: Boolean(firstValue(entries, 'cross-origin-resource-policy')) },
      serverDisclosure: { present: Boolean(firstValue(entries, 'server')) },
      poweredByDisclosure: { present: Boolean(firstValue(entries, 'x-powered-by')) },
      legacyXssProtection: {
        present: Boolean(firstValue(entries, 'x-xss-protection')),
        disabled: String(firstValue(entries, 'x-xss-protection')).trim() === '0',
      },
    },
    cookies: {
      count: cookieItems.length,
      items: cookieItems,
    },
    redaction: {
      cookieNames: 'sha256 identifier only',
      cookieValues: 'not collected',
      authorizationHeaders: 'not collected',
      cspNoncesAndHashes: 'not collected',
    },
  };
}

async function collectResponseSecurity(response) {
  if (!response) return { captured: false, reason: 'main-document-response-unavailable' };
  let headers = [];
  try {
    headers = await response.headersArray();
  } catch {
    const object = await response.allHeaders().catch(() => ({}));
    headers = Object.entries(object).map(([name, value]) => ({ name, value }));
  }
  return summarizeResponseSecurity({
    url: response.url(),
    status: response.status(),
    headers,
  });
}

export function safeUrlReference(raw, baseUrl) {
  try {
    const parsed = new URL(String(raw || ''), baseUrl);
    return {
      id: `url-${stableHash(parsed.href, 12)}`,
      protocol: parsed.protocol,
      origin: ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null,
      path: ['http:', 'https:'].includes(parsed.protocol) ? parsed.pathname.slice(0, 300) : null,
    };
  } catch {
    return { id: `url-${stableHash(String(raw || ''), 12)}`, protocol: null, origin: null, path: null };
  }
}

function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function summarizePageUrl(raw) {
  try {
    const parsed = new URL(raw);
    const sensitiveCategories = [];
    for (const name of parsed.searchParams.keys()) {
      if (!SENSITIVE_QUERY.test(name)) continue;
      const match = name.toLowerCase().match(SENSITIVE_QUERY);
      sensitiveCategories.push(match?.[1]?.toLowerCase() || 'sensitive');
    }
    return {
      protocol: parsed.protocol,
      secureTransport: parsed.protocol === 'https:',
      localDevelopment: isLocalHost(parsed.hostname),
      queryParameterCount: [...parsed.searchParams.keys()].length,
      sensitiveQueryParameterCount: sensitiveCategories.length,
      sensitiveQueryCategories: unique(sensitiveCategories),
    };
  } catch {
    return {
      protocol: null,
      secureTransport: false,
      localDevelopment: false,
      queryParameterCount: 0,
      sensitiveQueryParameterCount: 0,
      sensitiveQueryCategories: [],
    };
  }
}

async function collectDomSecurity(page) {
  const raw = await page.evaluate(() => {
    const selectorFor = (element) => {
      if (!(element instanceof Element)) return '';
      const escape = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      if (element.id) return `#${escape(element.id)}`;
      const parent = element.parentElement;
      const tag = element.tagName.toLowerCase();
      if (!parent) return tag;
      const matches = [...parent.children].filter((child) => child.tagName === element.tagName);
      return matches.length > 1 ? `${tag}:nth-of-type(${matches.indexOf(element) + 1})` : tag;
    };
    const absolute = (value) => {
      try { return new URL(value, document.baseURI).href; } catch { return String(value || ''); }
    };
    const forms = [...document.forms].map((form) => {
      const passwords = [...form.querySelectorAll('input[type="password"]')];
      const sensitivePurpose = [...form.querySelectorAll('input[autocomplete]')]
        .map((input) => String(input.getAttribute('autocomplete') || '').trim().toLowerCase())
        .filter((value) => /(?:^|\s)(?:current-password|new-password|one-time-code|cc-[a-z-]+)(?:\s|$)/.test(value));
      return {
        selector: selectorFor(form),
        action: absolute(form.getAttribute('action') || location.href),
        method: String(form.getAttribute('method') || 'get').toUpperCase(),
        target: String(form.getAttribute('target') || ''),
        hasPassword: passwords.length > 0,
        passwordCount: passwords.length,
        passwordAutocomplete: passwords.map((input) => String(input.getAttribute('autocomplete') || '').trim().toLowerCase() || 'missing'),
        sensitivePurposeCount: sensitivePurpose.length,
      };
    });
    const resourceNodes = [
      ...document.querySelectorAll('script[src],link[rel~="stylesheet"][href],iframe[src],img[src],audio[src],video[src],source[src],object[data],embed[src]'),
    ];
    const resources = resourceNodes.map((element) => {
      const attribute = element.hasAttribute('src') ? 'src' : element.hasAttribute('href') ? 'href' : 'data';
      const integrity = String(element.getAttribute('integrity') || '').trim();
      return {
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        attribute,
        url: absolute(element.getAttribute(attribute) || ''),
        isStylesheet: element.matches('link[rel~="stylesheet"]'),
        hasIntegrity: Boolean(integrity),
        integrityAlgorithms: [...new Set(integrity.split(/\s+/).map((token) => token.split('-')[0].toLowerCase()).filter((name) => /^(sha256|sha384|sha512)$/.test(name)))],
      };
    });
    const javascriptLinks = [...document.querySelectorAll('a[href],area[href]')]
      .filter((element) => /^\s*javascript:/i.test(element.getAttribute('href') || ''))
      .map((element) => ({ selector: selectorFor(element), protocol: 'javascript:' }));
    const blankLinks = [...document.querySelectorAll('a[target="_blank"][href],area[target="_blank"][href]')].map((element) => ({
      selector: selectorFor(element),
      url: absolute(element.getAttribute('href') || ''),
      rel: String(element.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean),
    }));
    const iframes = [...document.querySelectorAll('iframe')].map((frame) => ({
      selector: selectorFor(frame),
      url: absolute(frame.getAttribute('src') || 'about:blank'),
      sandboxed: frame.hasAttribute('sandbox'),
      sandboxTokens: String(frame.getAttribute('sandbox') || '').toLowerCase().split(/\s+/).filter(Boolean),
      allowFeatures: String(frame.getAttribute('allow') || '').split(';').map((part) => part.trim().split(/\s+/)[0].toLowerCase()).filter(Boolean),
    }));
    const base = document.querySelector('base[href]');
    return {
      pageUrl: location.href,
      forms,
      resources,
      javascriptLinks,
      blankLinks,
      iframes,
      baseUrl: base ? absolute(base.getAttribute('href')) : null,
      metaCsp: [...document.querySelectorAll('meta[http-equiv]')]
        .filter((meta) => String(meta.getAttribute('http-equiv')).toLowerCase() === 'content-security-policy')
        .map((meta) => String(meta.getAttribute('content') || '')),
      metaReferrer: String(document.querySelector('meta[name="referrer"]')?.getAttribute('content') || '').toLowerCase(),
      inlineEventHandlerCount: [...document.querySelectorAll('*')].reduce((count, element) => count
        + [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).length, 0),
    };
  });

  const pageUrl = summarizePageUrl(raw.pageUrl);
  let pageOrigin = null;
  try { pageOrigin = new URL(raw.pageUrl).origin; } catch { /* No origin available. */ }
  const reference = (value) => safeUrlReference(value, raw.pageUrl);
  const forms = raw.forms.map((form) => {
    const action = reference(form.action);
    return {
      ...form,
      action,
      sameOriginAction: Boolean(pageOrigin && action.origin === pageOrigin),
    };
  });
  const resources = raw.resources.map((resource) => {
    const url = reference(resource.url);
    return {
      ...resource,
      url,
      crossOrigin: Boolean(pageOrigin && url.origin && url.origin !== pageOrigin),
      mixedContent: pageUrl.secureTransport && url.protocol === 'http:',
    };
  });
  const iframes = raw.iframes.map((frame) => {
    const url = reference(frame.url);
    return {
      ...frame,
      url,
      crossOrigin: Boolean(pageOrigin && url.origin && url.origin !== pageOrigin),
      mixedContent: pageUrl.secureTransport && url.protocol === 'http:',
    };
  });
  return {
    page: pageUrl,
    forms,
    resources,
    javascriptLinks: raw.javascriptLinks,
    blankLinks: raw.blankLinks.map((link) => ({
      ...link,
      url: reference(link.url),
    })),
    iframes,
    baseUrl: raw.baseUrl ? reference(raw.baseUrl) : null,
    metaContentSecurityPolicy: summarizeCsp(raw.metaCsp, 'meta'),
    metaReferrerPolicy: normalizedKnownValue(raw.metaReferrer, SAFE_REFERRER_POLICIES),
    inlineEventHandlerCount: raw.inlineEventHandlerCount,
    sensitiveInputCount: forms.reduce((total, form) => total + form.passwordCount + form.sensitivePurposeCount, 0),
  };
}

export function createSecurityTracker() {
  return { documentResponse: null, requests: [], droppedRequests: 0 };
}

export function recordSecurityRequest(tracker, request) {
  if (!tracker || !request) return;
  if (tracker.requests.length >= MAX_TRACKED_REQUESTS) {
    tracker.droppedRequests += 1;
    return;
  }
  const url = request.url();
  if (!/^https?:/i.test(url)) return;
  tracker.requests.push({ url, type: request.resourceType() });
}

function summarizeTraffic(tracker, pageUrl) {
  let pageOrigin = null;
  let securePage = false;
  try {
    const parsed = new URL(pageUrl);
    pageOrigin = parsed.origin;
    securePage = parsed.protocol === 'https:';
  } catch { /* No origin available. */ }
  const seen = new Set();
  const mixedContent = [];
  const crossOriginByType = {};
  for (const request of tracker?.requests || []) {
    const reference = safeUrlReference(request.url, pageUrl);
    const key = `${request.type}|${reference.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (securePage && reference.protocol === 'http:') mixedContent.push({ type: request.type, url: reference });
    if (pageOrigin && reference.origin && reference.origin !== pageOrigin) {
      crossOriginByType[request.type] = (crossOriginByType[request.type] || 0) + 1;
    }
  }
  return {
    uniqueRequestCount: seen.size,
    droppedRequestCount: tracker?.droppedRequests || 0,
    mixedContent,
    crossOriginByType: Object.fromEntries(Object.entries(crossOriginByType).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export async function collectSecurityEvidence(page, tracker) {
  try {
    const [response, dom] = await Promise.all([
      collectResponseSecurity(tracker?.documentResponse),
      collectDomSecurity(page),
    ]);
    return {
      status: 'complete',
      mode: 'passive-safe',
      response,
      dom,
      traffic: summarizeTraffic(tracker, page.url()),
      limitations: [
        'No payload injection, credential attack, authorization bypass, rate-limit test, or destructive action was attempted.',
        'Client evidence cannot prove server-side validation, access control, CSRF protection, or database safety.',
      ],
    };
  } catch (error) {
    return {
      status: 'error',
      mode: 'passive-safe',
      error: sanitizeText(error?.message || String(error)).slice(0, 500),
      limitations: ['Security posture collection did not complete; no security check may be treated as passed.'],
    };
  }
}
