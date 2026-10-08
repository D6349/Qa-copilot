/**
 * handoff.js - the "bring your own model" bridge.
 *
 * The rules engine handles everything derivable from the DOM. It cannot read a
 * requirements document, judge whether an error message is clear, or invent a
 * multi-page business flow. For those, this module builds a self-contained
 * prompt you paste into Cursor / Codex / any chat, and validates the JSON that
 * comes back. No API key, no SDK, no network call from this app.
 */
import crypto from 'node:crypto';

const CATEGORIES = ['Functional', 'Validation', 'UI/UX', 'Security', 'API', 'Accessibility', 'Performance', 'Compatibility', 'Data'];

/* ------------------------------------------------------- prompt building */

export function buildPrompt({ project, page, model, existingTitles = [], focus = '' }) {
  const fieldTable = (model.fields || []).map((f) => [
    f.key,
    f.type,
    f.label || f.placeholder || '-',
    f.required ? 'required' : 'optional',
    [f.maxlength && `maxlength=${f.maxlength}`, f.minlength && `minlength=${f.minlength}`,
      f.min !== null && `min=${f.min}`, f.max !== null && `max=${f.max}`,
      f.pattern && `pattern=${f.pattern}`, f.accept && `accept=${f.accept}`]
      .filter(Boolean).join(' ') || '-',
  ].join(' | ')).join('\n');

  const apis = (model.network || []).slice(0, 20).map((n) => `${n.method} ${n.url}`).join('\n') || '(none captured)';

  return `You are a senior QA engineer writing test cases for an Indian legal/compliance web product.

## Context

Project: ${project.name}${project.product ? ` (${project.product})` : ''}
Page:    ${page.name} — ${page.url}
Module:  ${page.module}

### Fields on this page
key | type | label | required | constraints
${fieldTable || '(no form fields found)'}

### Buttons
${(model.buttons || []).map((b) => b.text).join(', ') || '(none)'}

### API calls captured during page load
${apis}

${page.requirements ? `### Requirements / acceptance criteria\n${page.requirements}\n` : ''}
${focus ? `### Focus for this batch\n${focus}\n` : ''}

## What is ALREADY covered — do not repeat any of these

A deterministic rules engine has already produced cases for: required-field
validation, length and numeric boundaries, PAN/GSTIN/CIN/Aadhaar/IFSC/pincode
format validation, dropdown options, file upload types, XSS and SQLi payloads,
IDOR and direct-URL access, session timeout, CSRF, security headers, keyboard
accessibility, labels and alt text, API contract and auth, button and link
checks, table sort/filter/paging, refresh and back-button state, responsive
viewports, cross-browser, and performance budgets.

Existing case titles:
${existingTitles.slice(0, 120).map((t) => `- ${t}`).join('\n') || '(none yet)'}

## Your job

Write test cases the rules engine CANNOT derive from the DOM:
1. End-to-end business flows that span more than this one page
2. Business-rule validation that depends on domain knowledge, not field attributes
3. Cross-field and conditional logic (field A changes what is valid in field B)
4. State-dependent behaviour (draft vs submitted vs approved records)
5. Role-based differences (what a maker sees vs a checker vs an admin)
6. Error-message quality and recovery paths
7. Anything implied by the requirements text above
8. Data integrity across the full record lifecycle: create, edit, delete, restore

## Output format

Return ONLY a JSON array. No prose before it, no prose after it, no markdown
code fences. Each element:

{
  "title": "short imperative title",
  "description": "why this case exists and what risk it covers",
  "module": "${page.module}",
  "subModule": "logical grouping",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "type": "Manual" | "Automation",
  "priority": "P1" | "P2" | "P3" | "P4",
  "severity": "Critical" | "High" | "Medium" | "Low",
  "preconditions": ["..."],
  "testData": { "label": "value" },
  "steps": [{ "action": "one atomic action", "data": "optional" }],
  "expectedResult": "specific and verifiable — never 'works as expected'",
  "automatable": true | false,
  "isSmoke": true | false,
  "isRegression": true | false,
  "tags": ["..."]
}

Rules:
- Each case independently executable by a tester who has never seen this page.
- One action per step, imperative mood.
- expectedResult must be checkable by someone who does not know the implementation.
- Mark automatable:false honestly for judgement calls (message clarity, colour, print layout, third-party OTP).
- 15 to 30 cases. Quality over count — do not pad.
`;
}

/* ------------------------------------------------------------ validation */

const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/**
 * Validate and normalise a JSON array pasted back from Codex.
 * Returns { cases, errors } — errors carry the array index so the user can fix
 * exactly the offending element rather than regenerating the whole batch.
 */
export function validateImport(raw, { project, page }) {
  let parsed;
  if (typeof raw === 'string') {
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start !== -1 && end > start) {
        try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
      }
      if (!parsed) return { cases: [], errors: [{ index: -1, message: `Not valid JSON: ${err.message}` }] };
    }
  } else {
    parsed = raw;
  }

  if (!Array.isArray(parsed)) {
    return { cases: [], errors: [{ index: -1, message: 'Expected a JSON array at the top level.' }] };
  }

  const errors = [];
  const cases = [];

  parsed.forEach((c, index) => {
    const problems = [];
    if (!c || typeof c !== 'object') { errors.push({ index, message: 'Not an object' }); return; }
    if (!c.title || typeof c.title !== 'string') problems.push('missing "title"');
    if (!c.expectedResult || typeof c.expectedResult !== 'string') problems.push('missing "expectedResult"');
    if (!Array.isArray(c.steps) || c.steps.length === 0) problems.push('"steps" must be a non-empty array');
    if (problems.length) { errors.push({ index, message: problems.join('; '), title: c.title || '(untitled)' }); return; }

    const dedupeKey = crypto.createHash('sha1')
      .update(`${page.id}|codex|${c.title}`).digest('hex').slice(0, 10);
    const mod = c.module || page.module || 'GENERAL';
    const modSlug = mod.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'GEN';

    cases.push({
      id: `TC_${modSlug}_${dedupeKey.slice(0, 6).toUpperCase()}`,
      dedupeKey,
      projectId: project.id,
      pageId: page.id,
      pageUrl: page.url,
      module: mod,
      subModule: c.subModule || '',
      title: c.title.trim(),
      description: c.description || '',
      type: oneOf(c.type, ['Manual', 'Automation'], 'Manual'),
      category: oneOf(c.category, CATEGORIES, 'Functional'),
      priority: oneOf(c.priority, ['P1', 'P2', 'P3', 'P4'], 'P3'),
      severity: oneOf(c.severity, ['Critical', 'High', 'Medium', 'Low'], 'Medium'),
      source: 'codex',
      ruleId: 'codex.import',
      preconditions: Array.isArray(c.preconditions) ? c.preconditions : [],
      testData: (c.testData && typeof c.testData === 'object') ? c.testData : {},
      steps: c.steps.map((s, i) => ({
        step: i + 1,
        action: typeof s === 'string' ? s : String(s.action || ''),
        data: typeof s === 'string' ? '' : String(s.data || ''),
      })).filter((s) => s.action),
      expectedResult: c.expectedResult.trim(),
      actualResult: '',
      status: 'Not Run',
      isRegression: c.isRegression !== false,
      isSmoke: c.isSmoke === true,
      automatable: c.automatable !== false,
      selectors: {},
      requirementRef: c.requirementRef || '',
      pageOwner: project.defaults?.pageOwner || '',
      createdBy: project.defaults?.createdBy || '',
      tags: Array.isArray(c.tags) ? c.tags : [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return { cases, errors };
}

/* ------------------------------------------------------ journey prompts */

/**
 * A prompt for end-to-end flows that span several pages.
 *
 * The rules engine works one page at a time and can never see a journey. This
 * gives the model the real field names, real URLs and real buttons of every
 * page in the sequence, so the flow it writes is grounded in what exists
 * rather than invented. The judgement is still the model's (and yours) — but
 * the scaffolding underneath it is factual.
 */
export function buildJourneyPrompt({ project, steps, focus = '', existingTitles = [] }) {
  const pageBlocks = steps.map(({ page, model }, i) => {
    const fields = (model?.fields || []).map((f) => {
      const cons = [
        f.required && 'required',
        f.maxlength && `maxlength=${f.maxlength}`,
        f.minlength && `minlength=${f.minlength}`,
        f.min !== null && f.min !== undefined && `min=${f.min}`,
        f.max !== null && f.max !== undefined && `max=${f.max}`,
        f.pattern && `pattern=${f.pattern}`,
        f.accept && `accept=${f.accept}`,
        f.options && `options: ${f.options.map((o) => o.text).filter(Boolean).slice(0, 8).join(' / ')}`,
      ].filter(Boolean).join(', ');
      return `    ${f.key} (${f.type})${f.label ? ` — "${f.label}"` : ''}${cons ? ` [${cons}]` : ''}`;
    }).join('\n');

    const buttons = (model?.buttons || []).map((b) => b.text).filter(Boolean).join(', ');
    const apis = (model?.network || []).slice(0, 10).map((n) => `${n.method} ${n.url}`).join('\n    ');

    return `### Step ${i + 1}: ${page.name}
  URL: ${page.url}
  Module: ${page.module}
${model ? `  Fields:
${fields || '    (none)'}
  Buttons: ${buttons || '(none)'}${apis ? `\n  API calls observed:\n    ${apis}` : ''}` : '  NOT SCANNED — do not invent fields for this page.'}
${page.requirements ? `  Requirements:\n${page.requirements.split('\n').map((l) => `    ${l}`).join('\n')}` : ''}`;
  }).join('\n\n');

  return `You are a senior QA engineer writing END-TO-END test cases for an Indian
legal/compliance web product.

## The journey

Project: ${project.name}${project.product ? ` (${project.product})` : ''}
${steps.length} pages, in order:

${pageBlocks}

${focus ? `## What this journey is about\n\n${focus}\n` : ''}
## What is ALREADY covered — do not repeat it

A deterministic rules engine has already produced per-page cases for every
field on every page above: required-field validation, length and numeric
boundaries, PAN/GSTIN/CIN/DIN/Aadhaar/IFSC/pincode format checks, dropdown
options, file upload types, XSS and SQL injection payloads, IDOR, direct-URL
access, session expiry, CSRF, security headers, keyboard accessibility,
labels and alt text, API contract and auth, button and link checks, table
sort/filter/paging, browser back and refresh, responsive viewports and
performance budgets.

${existingTitles.length ? `Existing case titles:\n${existingTitles.slice(0, 150).map((t) => `- ${t}`).join('\n')}\n` : ''}
## Your job — only what spans more than one page

Write cases that follow data and state ACROSS the pages above. Specifically:

1. **The happy path, end to end.** Create something on step 1, then verify with
   your own eyes on each later step that it arrived correctly — right values,
   right formatting, right status.
2. **Data integrity along the chain.** A value entered on step 1 must appear
   unchanged on every later step: no truncation, no case change, no stripped
   characters, no timezone shift on dates, no rounding on amounts.
3. **State transitions.** Draft → submitted → approved → rejected → withdrawn.
   Which transitions are legal, which are not, and what each one does to the
   record and to who can see it.
4. **Role segregation.** Where a maker, a checker and an admin see or can do
   different things. Include the case where the same user tries to perform two
   roles in one journey.
5. **Interrupted journeys.** Abandon mid-flow and come back. Session expires
   between step 2 and step 3. Browser back after a successful submit. Two tabs
   progressing the same record. What survives, what is lost, what must never
   duplicate.
6. **Cross-field and cross-page rules.** A value chosen on an earlier page
   changing what is valid on a later one.
7. **Reverse paths.** Edit after create. Delete after approve. Withdraw and
   re-file. Does the list, the count and any downstream document all update?
8. **Uniqueness and collision.** File the same thing twice. Two users filing
   the same thing at the same moment.

## Rules

- Use ONLY the field names, URLs and button labels listed above. Do not invent
  a field, an endpoint or a page that is not in the journey.
- Every case must name which step it starts on and which step verifies it.
- Steps must be atomic and imperative, one action each.
- expectedResult must be checkable by someone who has not seen the code. Never
  "works as expected". Say what is on screen, what the record shows, what
  status code comes back.
- Mark automatable:false honestly where a second account, a real OTP, or human
  judgement is needed.
- 12 to 25 cases. Quality over count. Do not pad with per-field validation —
  that is already covered.

## Output

Return ONLY a JSON array, no prose and no markdown fences. Each element:

{
  "title": "short imperative title",
  "description": "which risk this covers and why one page cannot catch it",
  "subModule": "E2E",
  "category": "Functional|Validation|Security|Data|API",
  "type": "Manual" | "Automation",
  "priority": "P1" | "P2" | "P3" | "P4",
  "severity": "Critical" | "High" | "Medium" | "Low",
  "preconditions": ["accounts, data or state needed before starting"],
  "testData": { "label": "value" },
  "steps": [{ "action": "one atomic action", "data": "optional" }],
  "expectedResult": "specific and verifiable",
  "automatable": true | false,
  "isSmoke": true | false,
  "tags": ["e2e", "..."]
}
`;
}
