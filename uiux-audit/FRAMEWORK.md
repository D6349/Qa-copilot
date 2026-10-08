# QA Copilot professional UI/UX and security audit framework

This framework turns rendered-page evidence into three separate decisions:

1. **What the browser proved** — objective pass/fail checks with measurements.
2. **What a specialist must judge** — design, content, accessibility, and usability reviews.
3. **What was not tested** — manual, blocked, or non-applicable work shown explicitly.

It intentionally does not calculate a universal aesthetic score. A page can pass
automated checks and still be confusing, visually weak, inaccessible in an
untested state, or unsuitable for its users.
Security is deliberately split into passive browser-visible evidence, contextual
hardening review, and authorized active testing. A header or DOM scan never
marks server-side authentication, authorization, or input handling as passed.


## Standards and professional foundations

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies normative,
  technology-independent accessibility success criteria.
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
  supplies established semantics, focus, and keyboard patterns for complex
  widgets. APG is informative guidance, not a substitute for WCAG conformance.
- [Nielsen Norman Group's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
  supply broad interaction-design review principles.
- [Core Web Vitals](https://web.dev/articles/vitals) supplies the LCP, INP,
  and CLS experience metrics and current good/poor thresholds.
- [axe-core](https://www.deque.com/axe/core-documentation/) adds deterministic
  WCAG and ARIA checks beyond the framework's rendered-style rules.
- [CSpell](https://cspell.org/docs/api/cspell-lib) checks visible English copy
  locally. Product names and domain vocabulary remain configurable and every
  result is a review candidate rather than an automatic language verdict.
- [OWASP HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
  supplies current defensive header guidance.
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
  supplies CSP delivery, rollout, and restriction guidance.
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
  supplies active authentication, authorization, session, input, API, and business-logic test methodology.
- [MDN secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
  supplies browser-facing cookie attribute and scope guidance.

- The product's approved design system, supported-device matrix, user research,
  analytics, legal requirements, and domain rules remain authoritative inputs.

## Coverage model

The catalog covers these professional pillars:

| Pillar | Typical evidence | Primary owner |
|---|---|---|
| Evidence quality | Valid routes, states, viewports, themes, screenshots | QA / Platform |
| Color and contrast | Text, placeholder, control-boundary and inline-link ratios; complex-background review; transparent compliance grade | Design + Frontend |
| Typography and hierarchy | Font loading, scale, spacing, measure, five-second scan | Design + Content |
| Design-system consistency | Color, type, spacing, radius, shadow, button, input tokens | Design System |
| Layout and responsiveness | Clipping, overlap, reflow, zoom, orientation, breakpoints | Design + Frontend |
| Interaction | Targets, focus, feedback, disabled/busy/selected states | Design + Frontend |
| Accessibility semantics | Names, labels, alternatives, title, language, headings, landmarks | Accessibility + Frontend |
| Keyboard and assistive technology | Order, traps, widget keys, announcements, focus restoration | Accessibility + QA |
| Navigation and wayfinding | Location, deep links, back/forward, preserved context | Product + Design |
| Forms and data entry | Instructions, autocomplete, validation, recovery, undo | Product + Frontend |
| Content and system states | Local spelling, encoding, leaked templates, capitalization, language, loading, empty, partial, error, success, permission | Content + Product |
| Images, media, and motion | Loading, crop, density, alternatives, captions, reduced motion | Content + Frontend |
| Complex components and data | APG behavior, tables, charts, sorting, filtering, density | Frontend + Design |
| Internationalization | Expansion, scripts, RTL, local formats and input methods | Localization + QA |
| Perceived performance | LCP, INP, CLS, slow/offline behavior, duplicate protection | Performance + Frontend |
| Trust and safety | Consent, permissions, sensitive data, destructive consequences | Product + Security |
| Task usability | Learnability, completion, efficiency, errors, satisfaction | UX Research + Product |
| Transport security | HTTPS, mixed content, password transport, form destinations | Platform + Security |
| Response security headers | HSTS, MIME, framing, referrer, permissions, cache, encoding | Platform + Security |
| Content Security Policy | Enforced/report-only posture, scripts, objects, base, frames, forms | Security + Frontend |
| Cookie security | Secure, HttpOnly, SameSite, scope, prefixes, lifetime | Backend + Security |
| Client trust boundaries | Forms, external code/styles, frames, base URLs, navigation | Frontend + Security |
| Sensitive data protection | URL leakage, cache policy, redaction, technology disclosure | Security + Privacy |
| Active application security | Auth, session, access control, IDOR/BOLA, CSRF, injection, uploads, APIs, abuse | Security + Backend |
| Compatibility | Browsers, operating systems, devices, input modes | QA |

Feature-specific checks are included only when the captured DOM indicates that
the feature exists. Core checks remain visible. This keeps the suite focused
without silently dropping universal responsibilities.

## Result meanings

| Status | Meaning | Can it count as a pass? |
|---|---|---|
| `pass` | Collected evidence met an objective acceptance criterion | Yes |
| `fail` | A deterministic check crossed a threshold or violated a criterion | No |
| `review` | Evidence indicates a concern that needs qualified human judgement | No |
| `manual` | Automation cannot truthfully decide the criterion | No |
| `blocked` | Required page/state/evidence was unavailable | No |
| `not-tested` | The check applied but did not execute | No |
| `not-applicable` | The required feature was not detected for this audit scope | Excluded |

The release decision is conservative:

- **BLOCKED** — the capture itself is not trustworthy.
- **NOT READY** — critical or major objective failures remain.
- **FIX BEFORE RELEASE** — lower-severity objective failures remain.
- **HUMAN REVIEW REQUIRED** — automated gates have no blocker, but judgement or
  manual execution is still outstanding.
- **AUTOMATED GATES PASS** — only the executed automated scope passed; this is
  not full UX sign-off by itself.

## Color compliance grade

The report grades the measured color scope as `PASS`, `FAIL`, `REVIEW`,
`BLOCKED`, or `NOT TESTED`. This is not a beauty or brand-quality score.
It summarizes text and placeholder contrast, essential component-boundary
signals, inline-link distinction, focus review evidence, complex backgrounds,
and configured palette exceptions. `REVIEW` means automation found evidence
that still needs a qualified human decision.

Spelling works the same way: a dictionary mismatch is never treated as a
confirmed defect. Add approved product and domain terms under
`approved.terms` or `content.spelling.words`; a content owner still signs off
grammar, meaning, tone, and terminology in context.

## Finding and priority model

Every finding contains:

- a stable ID and rule;
- objective or heuristic classification;
- severity and P0–P3 delivery priority;
- exact capture, state, viewport, theme, selector, and evidence;
- the observed value and explicit expected value;
- user impact and suggested owner;
- applicable standards links;
- an ordered fix plan;
- ordered retest steps and a binary pass condition.

Priorities are interpreted as:

- **P0** — invalid coverage or critical user/release risk;
- **P1** — major standards-backed blocker or core-task risk;
- **P2** — confirmed lower-severity defect or important design concern;
- **P3** — polish, consistency, comfort, or informational improvement.

Priority supports scheduling; severity describes impact. Teams may apply an
approved product-risk override, but the reason should be recorded.

## Recommended audit workflow

1. Define critical user journeys, user groups, roles, content extremes,
   supported locales, and the browser/device matrix.
2. Capture every required state. Treat login, error, and empty-shell captures as
   blocked unless that state is the intended subject.
3. Run the automated audit across at least 320px mobile, mobile, tablet, and
   desktop. Add light/dark themes and flow checkpoints that the product supports.
4. Review the release decision and P0/P1 action items before visual polish.
5. Execute all applicable manual cases. Attach a screenshot, measurement,
   recording, assistive-technology note, or user-test observation to every result.
6. Fix with approved tokens and components; do not patch one viewport while
   leaving the same issue in another state.
7. For security-sensitive features, obtain explicit authorization and execute
   the generated OWASP-aligned active cases using isolated accounts and data.
   Passive findings alone never mark server-side controls as passed.
8. Re-run the identical profiles. A fix passes only when the stated acceptance
   condition is met and no related regression appears.
9. Preserve the previous audit or accepted baseline for comparison and sign-off.

## Shareable outputs

Every audit produces:

| Artifact | Audience and use |
|---|---|
| `README.md` | Start-here guide with target, date, scope, decision, and artifact map |
| `report.html` | Offline visual report entry point; share the complete run directory |
| `report.md` | Pull request, wiki, email, or ticket-friendly summary |
| `findings.csv` | Developer backlog import with impact, fix, and retest columns |
| `checklist.json` / `checklist.csv` | Complete framework status and verification matrix |
| `action-plan.json` | Deduplicated, priority-ordered implementation work |
| `test-cases.json` / `test-cases.csv` | Feature-aware framework cases plus exact regression cases |
| `audit.json` | Complete normalized source of truth |
| `inventory.json` | Observed design-token, accessibility, asset, and redacted passive-security evidence |
| `manifest.json` | Small machine-readable run index |
| `screenshots/` | Viewport, theme, and state evidence |

Automatic results use `output/YYYY-MM-DD/site/page/HH-MM-SS-mmmZ-hash/`.
`--label` overrides only the page folder; `--out` overrides the complete path.

CSV cells beginning with spreadsheet formula characters are escaped to prevent
formula injection when a report is opened in Excel or similar tools.

## What still requires people

Automation cannot truthfully certify beauty, comprehension, emotional tone,
brand appropriateness, task success, screen-reader usability, caption quality,
translation quality, or real-world performance. These require specialist review
and representative users. The report keeps them visible instead of converting
missing evidence into green status.

Likewise, passive automation cannot certify authentication, authorization,
session invalidation, IDOR/BOLA, CSRF, injection, stored output, upload safety,
API access control, rate limits, race conditions, or business logic. Those tests
require explicit authorization, controlled data, server-observable evidence, and
qualified security review.
