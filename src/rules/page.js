/**
 * page.js - rules that come from the page as a whole rather than one field:
 * security, accessibility, navigation, tables, APIs, responsiveness.
 */
import { makeCase, fieldLabel, escapeQuotes } from './builder.js';
import { xssPayloads, sqliPayloads } from '../testData.js';

const TEXTUAL = ['text', 'textarea', 'email', 'tel', 'url', 'search'];
const MUTATION_ACTION = /\b(save|submit|create|add|update|upload|send|approve|reject|delete|remove|sign|pay|confirm|register)\b/i;
const RECORD_ACTION = /\b(view|edit|delete|remove|approve|reject|download|restore|details?)\b/i;
const TELEMETRY = /(?:google-analytics|googletagmanager|doubleclick|clarity\.ms|hotjar|sentry|segment|mixpanel|facebook|amplitude|newrelic|datadog)/i;

const buttonText = (button) => String(button?.text || button?.ariaLabel || button?.title || '').trim();

function mutationButtons(model) {
  return (model.buttons || []).filter((button) => !button.disabled && MUTATION_ACTION.test(buttonText(button)));
}

function recordSignals(model, pageUrl) {
  const fields = model.fields || [];
  const buttons = model.buttons || [];
  const idField = fields.some((field) => /(?:^|_)(?:id|uuid|reference|record|document)(?:$|_)/i.test(field.key || field.name || ''));
  const recordButton = buttons.some((button) => RECORD_ACTION.test(buttonText(button)));
  let idQuery = false;
  try {
    idQuery = [...new URL(pageUrl).searchParams.keys()].some((key) => /id|uuid|ref|record|document/i.test(key));
  } catch { /* invalid URL is handled before rule generation */ }
  const idApi = (model.network || []).some((request) => /[?&](?:id|uuid|ref|record|document)=|\/(?:\d{2,}|[0-9a-f]{8}(?:-[0-9a-f-]+)?)(?:[/?#]|$)/i.test(request.url || ''));
  return idField || recordButton || idQuery || idApi;
}

function likelyBusinessApis(model, pageUrl) {
  let pageOrigin = '';
  try { pageOrigin = new URL(pageUrl).origin; } catch { /* no origin */ }
  return (model.network || []).filter((request) => {
    if (!['xhr', 'fetch'].includes(request.resourceType) || TELEMETRY.test(request.url || '')) return false;
    try {
      const url = new URL(request.url, pageUrl);
      if (/\/(?:_next|assets?|static|fonts?)(?:\/|$)|\.(?:js|css|map|png|jpe?g|gif|svg|webp|woff2?)(?:$|\?)/i.test(url.pathname)) return false;
      const apiShape = /\/(?:api|graphql|rest|rpc|v\d+)(?:\/|$)/i.test(url.pathname);
      const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(String(request.method || 'GET').toUpperCase());
      return apiShape || changesState || (!!pageOrigin && url.origin !== pageOrigin);
    } catch {
      return false;
    }
  });
}

/* -------------------------------------------------------------- security */

export function securityRules(ctx, model) {
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: 'Security' };
  const cases = [];
  const textFields = (model.fields || []).filter((f) => TEXTUAL.includes(f.type) && !f.disabled);
  const mutatingButtons = mutationButtons(model);
  const hasInput = (model.fields || []).some((field) => !field.disabled && !field.readonly);
  const hasStatefulSurface = (model.forms || 0) > 0 || hasInput || (model.tables || []).length > 0;
  const hasRecordSurface = recordSignals(model, ctx.page.url);
  const n = ctx.limits.payloads;

  if (textFields.length) {
    const stored = mutatingButtons.length > 0;
    cases.push(makeCase({
      ...base,
      ruleId: stored ? 'sec.xss.stored' : 'sec.xss.reflected',
      title: `${stored ? 'Stored' : 'Reflected'} XSS across every free-text field`,
      description: `${textFields.length} text field(s) were observed. Verify encoding everywhere a submitted value is rendered.`,
      category: 'Security',
      priority: 'P1',
      severity: 'Critical',
      type: 'Automation',
      isSmoke: true,
      testData: Object.fromEntries(xssPayloads.slice(0, n).map((p, i) => [`payload ${i + 1}`, p])),
      steps: stored ? [
        `Enter payload 1 into each of: ${textFields.map(fieldLabel).join(', ')}`,
        `Activate the observed mutation action: ${mutatingButtons.map(buttonText).join(', ')}`,
        'Re-open every page, list, notification, email, or export that renders the saved value',
        'Repeat for the remaining payloads',
      ] : [
        `Enter payload 1 into each of: ${textFields.map(fieldLabel).join(', ')}`,
        'Activate the related search, filter, navigation, or validation action',
        'Inspect the resulting page, URL, error message, and DOM',
        'Repeat for the remaining payloads',
      ],
      expectedResult: stored
        ? 'Every payload is encoded and rendered as literal text on every observed output surface. No script, event handler, element, navigation, or dialog is created or executed.'
        : 'Every payload is treated as data. It is encoded in the result, URL, and error UI; no script, event handler, element, navigation, or dialog is created or executed.',
      tags: ['security', 'xss', 'owasp-a03'],
    }));
    cases.push(makeCase({
      ...base,
      ruleId: 'sec.sqli',
      title: 'SQL injection strings in text and search fields',
      category: 'Security',
      priority: 'P1',
      severity: 'Critical',
      type: 'Automation',
      testData: Object.fromEntries(sqliPayloads.slice(0, n).map((p, i) => [`payload ${i + 1}`, p])),
      steps: [
        'Enter each payload into every text and search field in turn',
        'Submit',
        'Observe the response body, status code and response time',
      ],
      expectedResult: 'The input is treated as a literal string. No SQL error, no stack trace, no database version leaked, no unusual delay that would indicate time-based injection. A search returns zero results rather than everything.',
      tags: ['security', 'sqli', 'owasp-a03'],
    }));
  }

  if (hasStatefulSurface) cases.push(makeCase({
    ...base,
    ruleId: 'sec.authz.directUrl',
    title: 'Verify direct URL access against the approved access policy',
    category: 'Security',
    priority: 'P1',
    severity: 'Critical',
    type: 'Automation',
    isSmoke: true,
    steps: [
      'Log out completely and clear cookies',
      `Paste ${ctx.page.url} into the address bar`,
      'Repeat in a private window',
    ],
    expectedResult: 'The result matches the approved public/private access classification. A private page redirects to sign-in or returns 401/403 without rendering protected content; a public page exposes only approved public content and no user, tenant, or record data.',
    tags: ['security', 'authz', 'owasp-a01'],
  }));

  if (!hasStatefulSurface) cases.push(makeCase({
    ...base,
    ruleId: 'sec.exposure.public',
    title: 'Confirm the anonymous page exposes only approved public information',
    category: 'Security',
    priority: 'P1',
    severity: 'High',
    type: 'Automation',
    isSmoke: true,
    steps: [
      'Open the page in a private browser with no cookies or local storage',
      'Inspect the rendered DOM, page source, network responses, and downloaded assets',
      'Search the evidence for user, tenant, account, token, internal-host, source-map, and environment values',
    ],
    expectedResult: 'Only content classified as public is returned. No personal, tenant, account, credential, internal endpoint, environment secret, or authenticated API payload is present in the DOM, source, responses, URLs, or client assets.',
    tags: ['security', 'data-exposure', 'owasp-a01'],
  }));

  if (hasRecordSurface) cases.push(makeCase({
    ...base,
    ruleId: 'sec.authz.idor',
    title: 'Access another user\'s record by changing the ID (IDOR)',
    description: 'The single highest-value test on any record-based page.',
    category: 'Security',
    priority: 'P1',
    severity: 'Critical',
    type: 'Manual',
    automatable: true,
    steps: [
      'Log in as User A and open one of their records — note the ID in the URL or request body',
      'Log in as User B in a separate browser and note one of their record IDs',
      'As User B, change the ID in the URL to User A\'s record',
      'Repeat against the API directly with User B\'s token',
      'Repeat for the edit and delete endpoints, not just view',
    ],
    expectedResult: '403 or 404 in every case. User B can neither read nor modify User A\'s record. The response must not differ between "exists but forbidden" and "does not exist" in a way that leaks which IDs are real.',
    tags: ['security', 'idor', 'owasp-a01'],
  }));

  if (hasInput || mutatingButtons.length) cases.push(makeCase({
    ...base,
    ruleId: 'sec.session.timeout',
    title: 'Behaviour after session expiry mid-form',
    category: 'Security',
    priority: 'P2',
    severity: 'High',
    type: 'Manual',
    automatable: true,
    steps: [
      'Open the page and fill the form completely',
      'Leave it idle until the session expires (or expire the token manually)',
      'Submit the form',
    ],
    expectedResult: 'The user is redirected to login with a clear message rather than seeing a silent failure or a raw 401. On re-login they are returned to the page. No partial record is created. Entered data is either preserved or the user is warned it will be lost — a silent loss of a long form is a defect.',
    tags: ['security', 'session'],
  }));

  cases.push(makeCase({
    ...base,
    ruleId: 'sec.transport.headers',
    title: 'Transport and response header check',
    category: 'Security',
    priority: 'P2',
    severity: 'High',
    type: 'Automation',
    steps: [
      'Load the page over HTTP and confirm the redirect to HTTPS',
      'Inspect the response headers in devtools or via curl -I',
      'Inspect the session cookie attributes',
    ],
    expectedResult: 'HTTPS enforced with HSTS. Session cookie has Secure, HttpOnly and SameSite set. Content-Security-Policy, X-Content-Type-Options and X-Frame-Options (or frame-ancestors) are present. No Server or X-Powered-By header leaking versions.',
    tags: ['security', 'headers', 'owasp-a05'],
  }));

  if (hasStatefulSurface) cases.push(makeCase({
    ...base,
    ruleId: 'sec.data.browserExposure',
    title: 'Prevent sensitive data leakage through browser-visible surfaces',
    category: 'Security',
    priority: 'P1',
    severity: 'Critical',
    type: 'Manual',
    automatable: true,
    steps: [
      'Complete the primary page flow with controlled test data',
      'Inspect URLs, history entries, DOM source, console output, network logs, local storage, session storage, IndexedDB, and service-worker caches',
      'Sign out and use browser back, forward, refresh, and restore-closed-tab actions',
      'Save or print the page and inspect the resulting file metadata and content',
    ],
    expectedResult: 'Credentials, tokens, secrets, full identifiers, and sensitive record data are absent from URLs, logs, browser storage, caches, and exported metadata unless explicitly required and protected. Signed-out navigation cannot reveal cached protected content.',
    tags: ['security', 'privacy', 'data-exposure', 'owasp-a02'],
  }));

  const unsafeBlankLinks = (model.links || []).filter((link) => link.external && link.target === '_blank');
  if (unsafeBlankLinks.length) cases.push(makeCase({
    ...base,
    ruleId: 'sec.links.opener',
    title: `Protect ${unsafeBlankLinks.length} external new-tab link(s) from opener control`,
    category: 'Security',
    priority: 'P2',
    severity: 'High',
    type: 'Automation',
    testData: { links: unsafeBlankLinks.slice(0, 12).map((link) => link.href).join('\n') },
    steps: [
      'Inspect every external link that opens a new tab',
      'Open each link and inspect window.opener in the destination',
      'Verify the source tab cannot be navigated or modified by the destination',
    ],
    expectedResult: 'Every external target=_blank link uses noopener protection, window.opener is null, and the destination cannot read, navigate, or modify the source tab.',
    tags: ['security', 'reverse-tabnabbing'],
  }));

  if ((model.forms || 0) > 0 && mutatingButtons.length > 0) {
    cases.push(makeCase({
      ...base,
      ruleId: 'sec.csrf',
      title: 'CSRF protection on form submission',
      category: 'Security',
      priority: 'P2',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      steps: [
        'Capture a successful submit request',
        'Replay it with the CSRF token removed',
        'Replay it with a token from a different session',
        'Replay it with the Origin/Referer header stripped',
      ],
      expectedResult: 'All three replays are rejected. Only a request with a valid token bound to the current session succeeds.',
      tags: ['security', 'csrf', 'owasp-a01'],
    }));
  }

  return cases;
}

/* --------------------------------------------------------- accessibility */

export function a11yRules(ctx, model) {
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: 'Accessibility' };
  const cases = [];
  const unlabelled = (model.fields || []).filter((f) => !f.label && !f.placeholder);

  cases.push(makeCase({
    ...base,
    ruleId: 'a11y.keyboard',
    title: 'Complete the page using the keyboard only',
    category: 'Accessibility',
    priority: 'P2',
    severity: 'High',
    type: 'Manual',
    automatable: false,
    steps: [
      'Unplug or ignore the mouse',
      'Tab from the top of the page to the bottom',
      'Operate every observed link, button, field, dropdown, date picker, and dialog control',
      'Close each observed dialog with Escape and verify focus returns to its trigger',
    ],
    expectedResult: 'Every interactive element is reachable in a logical order. The focus ring is always visible. No keyboard trap — particularly in date pickers and modals. Escape closes modals and returns focus to the trigger.',
    tags: ['a11y', 'wcag-2.1.1', 'wcag-2.4.7'],
  }));

  if (unlabelled.length) {
    cases.push(makeCase({
      ...base,
      ruleId: 'a11y.labels',
      title: `${unlabelled.length} field(s) have no associated label`,
      description: `Fields with no label, aria-label or placeholder: ${unlabelled.map((f) => f.key).join(', ')}. A screen reader announces these as just "edit text".`,
      category: 'Accessibility',
      priority: 'P2',
      severity: 'High',
      type: 'Automation',
      steps: [
        'Inspect each listed field in the accessibility tree',
        'Run a screen reader (NVDA on Windows) over the form',
      ],
      expectedResult: 'Every input has a programmatically associated name via <label for>, aria-label or aria-labelledby. Placeholder alone is not sufficient.',
      tags: ['a11y', 'wcag-1.3.1', 'wcag-4.1.2'],
    }));
  }

  if (model.imagesMissingAlt > 0) {
    cases.push(makeCase({
      ...base,
      ruleId: 'a11y.altText',
      title: `${model.imagesMissingAlt} image(s) missing alt text`,
      category: 'Accessibility',
      priority: 'P3',
      severity: 'Medium',
      type: 'Automation',
      steps: ['Inspect each image element', 'Confirm whether it is informative or decorative'],
      expectedResult: 'Informative images have meaningful alt text. Decorative images have alt="" so screen readers skip them.',
      tags: ['a11y', 'wcag-1.1.1'],
    }));
  }

  const h1s = (model.headings || []).filter((h) => h.level === 1).length;
  if (h1s !== 1) {
    cases.push(makeCase({
      ...base,
      ruleId: 'a11y.headings',
      title: `Heading structure problem — ${h1s} <h1> found`,
      description: 'Screen reader users navigate by heading. A page should have exactly one h1 and no skipped levels.',
      category: 'Accessibility',
      priority: 'P3',
      severity: 'Low',
      type: 'Automation',
      steps: ['List all headings in order', 'Check for exactly one h1 and no skipped levels'],
      expectedResult: 'Exactly one h1 describing the page. Levels descend without gaps.',
      tags: ['a11y', 'wcag-1.3.1'],
    }));
  }

  if ((model.forms || 0) > 0 || (model.fields || []).length > 0) cases.push(makeCase({
    ...base,
    ruleId: 'a11y.errors',
    title: 'Validation errors are announced, not only coloured',
    category: 'Accessibility',
    priority: 'P2',
    severity: 'High',
    type: 'Manual',
    automatable: false,
    steps: [
      'Submit the form with several fields invalid',
      'Listen to the screen reader output',
      'View the page in greyscale',
    ],
    expectedResult: 'Errors are announced via a live region or by moving focus. Each message names the field and says how to fix it. The error is still identifiable in greyscale — colour alone does not carry the meaning. Contrast ratio is at least 4.5:1.',
    tags: ['a11y', 'wcag-1.4.1', 'wcag-3.3.1'],
  }));

  return cases;
}

/* ------------------------------------------------------------------- API */

export function apiRules(ctx, model) {
  const apis = likelyBusinessApis(model, ctx.page.url);
  if (!apis.length) return [];
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: 'API' };
  const cases = [];

  const listed = apis.slice(0, 12).map((a) => `${a.method} ${a.url}`);

  cases.push(makeCase({
    ...base,
    ruleId: 'api.contract',
    title: `Response contract for ${apis.length} endpoint(s) used by this page`,
    description: 'Captured during the page scan. Lock the response shape so a backend change breaks a test rather than the UI.',
    category: 'API',
    priority: 'P1',
    severity: 'High',
    type: 'Automation',
    isSmoke: true,
    testData: { endpoints: listed.join('\n') },
    steps: [
      'Call each endpoint with valid parameters and a valid token',
      'Assert the status code, required keys, data types and null-handling of each response',
      'Assert the response time is within the agreed budget',
    ],
    expectedResult: 'Every endpoint returns its documented status and a response matching the agreed schema. No extra fields leaking internal data. No PII in a GET query string.',
    tags: ['api', 'contract'],
  }));

  cases.push(makeCase({
    ...base,
    ruleId: 'api.auth',
    title: 'Endpoint access control matches the approved public/private policy',
    category: 'API',
    priority: 'P1',
    severity: 'Critical',
    type: 'Automation',
    isSmoke: true,
    testData: { endpoints: listed.join('\n') },
    steps: [
      'Classify each endpoint as public, authenticated, role-restricted, or tenant-restricted',
      'Call each endpoint with no authentication',
      'For protected endpoints, call with a malformed and expired token',
      'For restricted endpoints, call with a valid token that lacks the required role or tenant access',
    ],
    expectedResult: 'Public endpoints return only the documented public payload. Protected endpoints return 401 for missing, malformed, or expired authentication and 403 or non-enumerating 404 for insufficient role or tenant access. No rejected response contains protected data or internal error detail.',
    tags: ['api', 'security', 'owasp-a01'],
  }));

  cases.push(makeCase({
    ...base,
    ruleId: 'api.negative',
    title: 'Malformed requests against the page endpoints',
    category: 'API',
    priority: 'P2',
    severity: 'High',
    type: 'Automation',
    testData: { endpoints: listed.join('\n') },
    steps: [
      'Omit each required parameter in turn',
      'Send a string where a number is expected and vice versa',
      'Send the wrong HTTP method (GET where POST is expected)',
      'Send a payload well above the size limit',
      'Send malformed JSON',
      'Fire 100 requests in quick succession',
    ],
    expectedResult: '400 with a clear field-level error for bad input, 405 for the wrong method, 413 for oversized payloads, 429 once the rate limit is hit. Never a 500. Never a stack trace, SQL fragment or file path in the response.',
    tags: ['api', 'negative'],
  }));

  return cases;
}

/* ------------------------------------------- navigation, tables, buttons */

export function interactionRules(ctx, model) {
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: 'Interaction' };
  const cases = [];

  const actionButtons = (model.buttons || []).filter((b) => !b.disabled).slice(0, 20);
  const mutationActionButtons = mutationButtons(model).slice(0, 20);
  if (actionButtons.length) {
    cases.push(makeCase({
      ...base,
      ruleId: 'ui.buttons.actions',
      title: `Each of the ${actionButtons.length} action button(s) performs its stated action`,
      category: 'Functional',
      priority: 'P1',
      severity: 'High',
      type: 'Automation',
      isSmoke: true,
      testData: { buttons: actionButtons.map((b) => b.text).join(' | ') },
      steps: [
        'Click each button in turn from a clean page state',
        'Observe the resulting navigation, modal, toast or save',
        'Confirm the effect against the business expectation for that button',
      ],
      expectedResult: 'Each button does exactly what its label says. A loading state appears during any request. The button is disabled while in flight. No silent failures.',
      selectors: Object.fromEntries(actionButtons.map((b) => [b.text, b.testId ? `getByTestId('${b.testId}')` : `getByRole('button', { name: '${escapeQuotes(b.text)}' })`])),
      tags: ['functional', 'smoke'],
    }));
    if (mutationActionButtons.length) cases.push(makeCase({
      ...base,
      ruleId: 'ui.buttons.doubleClick',
      title: 'Double-click and rapid re-submit on each mutation action',
      description: 'Duplicate records from a double-click are one of the most common production defects in form-heavy products.',
      category: 'Functional',
      priority: 'P1',
      severity: 'High',
      type: 'Automation',
      steps: [
        'Prepare valid data for the observed mutation action',
        `Double-click each mutation action rapidly: ${mutationActionButtons.map(buttonText).join(', ')}`,
        'Separately: submit, then press browser back and submit again',
        'Separately: submit on a throttled connection and click again during the spinner',
      ],
      expectedResult: 'Exactly one record is created in all three scenarios. The button disables on first click. The server is idempotent for this action, not just the UI.',
      tags: ['functional', 'duplicate'],
    }));
  }

  const internalLinks = (model.links || []).filter((l) => !l.external).slice(0, 30);
  if (internalLinks.length) {
    cases.push(makeCase({
      ...base,
      ruleId: 'ui.links',
      title: `All ${internalLinks.length} internal link(s) resolve without error`,
      category: 'Functional',
      priority: 'P3',
      severity: 'Medium',
      type: 'Automation',
      testData: { sample: internalLinks.slice(0, 8).map((l) => l.href).join('\n') },
      steps: [
        'Click each internal link',
        'Record the HTTP status of each destination',
        'Return to the page after each',
      ],
      expectedResult: 'No 404s, no redirect loops, no links to a staging or localhost host. Each destination matches what the link text promises.',
      tags: ['navigation'],
    }));
  }

  if ((model.tables || []).length) {
    const t = model.tables[0];
    const dateHeaders = (t.headers || []).filter((header) => /date|time|created|updated|modified|signed|expiry|expires/i.test(header));
    cases.push(makeCase({
      ...base,
      ruleId: 'ui.table',
      title: `Table behaviour: sorting, filtering, paging and empty state`,
      description: `Columns found: ${t.headers.join(', ')}`,
      category: 'Functional',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      steps: [
        'Sort by each column ascending and descending',
        'Verify sorting is correct for dates and numbers, not lexicographic',
        'Apply each filter, alone and in combination',
        'Page to the last page and back',
        'Apply a filter that matches nothing',
        'Apply a filter that matches one row',
      ],
      expectedResult: 'Sorting is type-aware. Filters combine with AND as documented. Pagination keeps the active filter and sort. The empty state shows a helpful message, not a blank box or a spinner that never ends.',
      tags: ['table', 'functional'],
    }));
    if (dateHeaders.length) cases.push(makeCase({
      ...base,
      ruleId: 'data.table.dateTime',
      title: `Verify source, timezone, format, and sorting for ${dateHeaders.join(', ')}`,
      description: 'A date that looks plausible can still be wrong because of stale data, timezone conversion, locale parsing, or lexicographic sorting.',
      category: 'Data',
      priority: 'P1',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      testData: { observedDateColumns: dateHeaders.join(' | ') },
      steps: [
        'Select a row whose authoritative stored timestamp can be read from an approved API, database, or event log',
        'Record the source timestamp, timezone, precision, and expected display timezone',
        'Compare the rendered date and time with the converted source value',
        'Repeat with the browser timezone set to UTC and Asia/Kolkata',
        'Sort the column ascending and descending',
        'Check values around midnight, month end, leap day, and any supported daylight-saving boundary',
      ],
      expectedResult: 'Every displayed instant matches its authoritative source after the documented timezone conversion, uses the approved locale format consistently, and is never shifted or stale. Sorting is chronological rather than text-based, and no value appears in the future unless the source timestamp is also in the future.',
      tags: ['data', 'date-time', 'timezone', 'table'],
    }));
  }

  const statefulNavigation = (model.forms || 0) > 0 || (model.fields || []).length > 0
    || (model.tables || []).length > 0 || mutationActionButtons.length > 0;
  cases.push(makeCase({
    ...base,
    ruleId: statefulNavigation ? 'ui.navigation.state' : 'ui.navigation.history',
    title: statefulNavigation ? 'Refresh, back and forward mid-flow' : 'Browser history and refresh preserve a usable read-only page',
    category: 'Functional',
    priority: 'P2',
    severity: 'Medium',
    type: 'Automation',
    steps: statefulNavigation ? [
      'Fill the form part-way and press F5',
      'Fill the form, submit, then press browser back',
      'Then press browser forward',
      'Open the page in two tabs and submit from both',
    ] : [
      'Scroll to the middle of the page and refresh',
      'Open an internal destination and press browser back',
      'Press browser forward',
      'Open the same destination in a second tab',
    ],
    expectedResult: statefulNavigation
      ? 'Behaviour is deliberate and consistent in all four cases. No duplicate submission occurs after back navigation, no stale record appears after forward navigation, and two tabs cannot corrupt the same state.'
      : 'Refresh, back, and forward render the correct route without a blank page, redirect loop, stale content, or broken scroll/focus state. Opening the route in another tab does not change either tab unexpectedly.',
    tags: ['navigation', 'state'],
  }));

  return cases;
}

/* -------------------------------------------- responsive and performance */

export function platformRules(ctx, model) {
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: 'Platform' };
  const viewports = [
    '320x568 (small phone)',
    '768x1024 (tablet)',
    '1280x800 (laptop)',
    '1920x1080 (desktop)',
  ].slice(0, ctx.limits.viewports);

  const cases = [
    makeCase({
      ...base,
      ruleId: 'platform.responsive',
      title: 'Layout holds at each supported viewport',
      category: 'UI/UX',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: { viewports: viewports.join('\n') },
      steps: [
        ...viewports.map((v) => `Resize to ${v}, complete the primary page task, and inspect the full page`),
        'Zoom to 200% at 1280x800',
      ],
      expectedResult: 'No horizontal scroll, no overlapping or clipped text, no control pushed off screen. Tap targets are at least 44x44 px on phone widths. Nothing is lost at 200% zoom.',
      tags: ['responsive', 'ui'],
    }),
    makeCase({
      ...base,
      ruleId: 'platform.browsers',
      title: 'Cross-browser check on Chrome, Firefox, Edge and Safari',
      category: 'UI/UX',
      priority: 'P3',
      severity: 'Medium',
      type: 'Manual',
      automatable: true,
      steps: [
        'Complete the primary flow in each browser',
        'Pay particular attention to date pickers, file uploads and custom dropdowns',
      ],
      expectedResult: 'The flow completes in all four. No console errors unique to one browser. Native controls (date, file) behave acceptably even where they render differently.',
      tags: ['compatibility'],
    }),
    makeCase({
      ...base,
      ruleId: 'platform.performance',
      title: 'Load and interaction performance budget',
      category: 'Performance',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      steps: [
        'Load the page cold with cache disabled and record the time to interactive',
        'Record each API call duration in the network tab',
        'Throttle to Slow 3G and repeat',
        (model.tables || []).length
          ? 'Load the largest realistic dataset in each observed table or list'
          : 'Load the highest-content realistic page state',
      ],
      expectedResult: 'The page becomes interactive within the agreed budget (default 3s on broadband), no observed business API exceeds 2s, and Slow 3G shows meaningful progress instead of a blank or frozen page. Large observed collections paginate or virtualize rather than rendering an unbounded result set.',
      tags: ['performance'],
    }),
  ];

  if ((model.consoleErrors || []).length) {
    cases.push(makeCase({
      ...base,
      ruleId: 'platform.consoleErrors',
      title: `${model.consoleErrors.length} console error(s) present on page load`,
      description: `Captured during the scan:\n${model.consoleErrors.slice(0, 5).join('\n')}`,
      category: 'Functional',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      steps: ['Open the page with devtools console open', 'Record every error and failed request'],
      expectedResult: 'Zero console errors and zero failed network requests on a clean load. Each error found above is either fixed or has an accepted, documented reason.',
      tags: ['hygiene'],
    }));
  }

  return cases;
}
