# Standalone UI/UX and Passive Security Audit

This package audits the rendered experience and browser-visible security posture of any web URL. It is deliberately
independent from QA Copilot projects, page records, generated functional cases,
and the product-specific `playwright-suite`.

It uses a real Chromium page to collect computed fonts, colors, spacing,
geometry, responsive behavior, images, semantic structure, accessible names,
form labels, focus/hover evidence, screenshots, security response headers,
redacted cookie attributes, CSP posture, form/resource destinations, and mixed
content. Each run produces a release decision, prioritized fix plan,
standards-backed findings, a feature-aware verification matrix, generated
regression cases, and shareable reports.

See [FRAMEWORK.md](FRAMEWORK.md) for the complete professional methodology,
status and priority definitions, ownership model, verification workflow, and
standards references.

## Security coverage and boundaries

Every ordinary `audit`, `compare`, and `baseline` run includes safe passive
security checks. No extra flag is required. The browser records:

- HTTPS, insecure form actions, and mixed-content references/requests;
- HSTS, CSP, MIME-sniffing, framing, referrer, permissions, cache, encoding,
  legacy, and disclosure header posture;
- cookie `Secure`, `HttpOnly`, `SameSite`, prefix, lifetime, path, and domain
  posture without saving cookie names or values;
- password-form method/autocomplete, cross-origin form actions,
  `javascript:` URLs, external script/stylesheet integrity, iframe sandboxing,
  and external base URLs;
- sensitive query-parameter categories and protected-page cache signals.

The audit never serializes cookie values, authorization header values, CSP
nonces/hashes, typed field values, or recognized secret query values into JSON.
Cookie names are represented only by stable SHA-256 identifiers. Screenshots
capture the rendered page and can contain sensitive content; configure
`capture.maskSelectors` or repeatable `--mask` selectors before sharing them.

Passive browser evidence cannot prove server-side authentication,
authorization, IDOR/BOLA protection, CSRF defense, injection resistance, file
upload safety, API authorization, rate limits, race safety, or business logic.
The framework therefore generates explicit OWASP-aligned human-owned test cases
for those areas and leaves them `manual` until an authorized controlled test is
actually executed.

## Setup

The standalone setup is deterministic and uses the committed lockfile. From
this directory run:

```powershell
npm ci
npm run setup
npm run verify
npm run security
```

`setup` installs the required Playwright Chromium, Firefox, and WebKit builds.
`doctor` verifies Node 20+, every runtime dependency, configuration validity,
output-directory write access, each browser executable, and a real headless
launch of all three engines. `verify` repeats that check and runs the complete
deterministic regression suite, including a six-profile local browser matrix,
without contacting a live target URL. `security` checks the installed
production dependency tree against the npm advisory database; it must report
zero vulnerabilities before release.

WebKit is a useful Safari-engine proxy, but it is not a substitute for a final
check on real Safari, macOS, or iOS hardware. Installed native Chrome and Edge
channels can be added to a run with `--browsers all`; they are not required by
the core completion gate. See [SETUP.md](SETUP.md) for the completion gate,
folder contract, global command option, and troubleshooting.

## Audit any URL

```powershell
node cli.mjs audit "https://example.com" --pretty
```

When `--out` is omitted, every URL is placed in a predictable UTC date-wise
folder. Hostname, port, and page path are converted to safe folder names; query
values and credentials are never exposed in those names.

```text
output/YYYY-MM-DD/site/page/HH-MM-SS-mmmZ-hash/
```

For opaque or dynamic paths, provide a readable page folder without giving up
the automatic date and run folders:

```powershell
node cli.mjs audit "https://example.com/items/8429137" --label "invoice-details"
```

The default run covers:

- 320 × 568 mobile reflow
- 390 × 844 mobile
- 768 × 1024 tablet
- 1440 × 900 desktop
- light and dark color schemes

Override the profiles when a smaller targeted run is intentional:

```powershell
node cli.mjs audit "https://example.com" `
  --viewports mobile,desktop `
  --themes light `
  --out output/example `
  --pretty
```

`stdout` is always one JSON document. Progress and human diagnostics go to
`stderr`. A completed audit exits `0` even when it finds defects unless a CI
quality gate is requested. Capture/input failures and invalid captures exit `1`.
Normal stdout includes the complete aggregate summary and at most 25 compact
finding previews so terminal and CI logs remain usable. The complete evidence
is always saved in the run directory; add `--full` only when a downstream
consumer explicitly needs every complete finding on stdout.

```powershell
node cli.mjs audit "https://example.com" --fail-on major
```

Inspect or share the complete framework catalog without opening a page:

    node cli.mjs framework --pretty

## Reference and regression comparison

Compare a target with a live visual reference:

```powershell
node cli.mjs compare "https://target.example.com" `
  --reference "https://reference.example.com" `
  --pretty
```

Create an explicitly accepted baseline:

```powershell
node cli.mjs baseline "https://example.com" --name homepage-v1 --pretty
```

Baseline replacement is never implicit. Use `--update` only when a changed
design has been reviewed and accepted.

```powershell
node cli.mjs baseline "https://example.com" --name homepage-v1 --update
node cli.mjs compare "https://example.com" `
  --baseline baselines/homepage-v1/baseline.json
```

For a live reference with unrelated DOM/content, the comparison reports
design-token similarity and side-by-side evidence. It does not pretend that
unrelated elements are exact semantic matches.

## Authenticated pages

Capture a Playwright storage-state file by signing in manually:

```powershell
node cli.mjs auth "https://app.example.com/login" `
  --out .auth/example.json --pretty
```

Then audit with that state:

```powershell
node cli.mjs audit "https://app.example.com/dashboard" `
  --storage-state .auth/example.json `
  --expect-authenticated
```

Use repeatable `--header "Name: value"` flags for non-browser authentication
or test routing. Header values are never written to the report.

## Audit states in a UI flow

A flow is only a path to visual checkpoints. It is not tied to a QA project and
it never permits arbitrary JavaScript. Supported locators are role/name, label,
placeholder, test ID, text, and CSS.

```powershell
node cli.mjs audit "https://shop.example.com/products" `
  --flow examples/checkout.flow.example.json
```

Every checkpoint is audited at every selected viewport and theme. Sensitive
fill values can come from an environment variable:

```json
{ "action": "fill", "locator": { "label": "Password" }, "value": { "env": "TEST_PASSWORD" } }
```

The value is redacted from saved flow metadata. Add stable sensitive regions
to `capture.maskSelectors`, or pass repeatable `--mask` flags, so they are also
covered in screenshots.

## Configuration

Copy `uiux.config.json`, customize it, then pass `--config path/to/file.json`.
Important controls include:

- viewports and themes
- locale and timezone
- navigation timeout and render-settle delay
- ignored DOM regions and screenshot masks
- evidence collection limits
- contrast, typography, target-size, and consistency thresholds
- optional approved font families and brand colors

The 24 × 24 target rule is the objective WCAG-oriented threshold. The 44 × 44
target is reported only as a best-practice review item, not mislabeled as a
standards failure.

## Artifacts

Each automatic run has its own portable package. See
[RESULT_STRUCTURE.md](RESULT_STRUCTURE.md) for the complete naming contract and
examples covering home pages, nested paths, ports, query strings, dynamic IDs,
and international paths. Passing `--out` intentionally uses that exact custom
directory instead.

```text
output/
  YYYY-MM-DD/
    site/
      page/
        HH-MM-SS-mmmZ-hash/
          README.md
          report.html
          ...
```

Inside each run:

```text
README.md       start-here guide, scope, release decision, and file map
audit.json       complete normalized evidence and findings
manifest.json    small run/result index
inventory.json   design tokens, accessibility, assets, and redacted security evidence
cases.json       reusable manual UI/UX review cases
test-cases.json  applicable framework cases plus finding-specific regressions
checklist.json   complete professional framework assessment
action-plan.json deduplicated P0-P3 developer work items
report.html      offline report entry point; share the complete run directory
report.md        pull-request, wiki, email, and ticket-friendly report
findings.csv     spreadsheet/backlog-ready actionable findings
checklist.csv    spreadsheet-ready verification matrix
test-cases.csv   spreadsheet-ready generated test suite
screenshots/     full-page target/reference evidence per profile and checkpoint
```

The report separates:

- **fail** — high-confidence standards violations or rendered defects
- **review** — design consistency, readability, or subjective judgement
- **invalid-capture** — empty/error/login content that cannot represent the
  intended authenticated page

There is intentionally no universal “beauty score.” Brand quality, hierarchy,
clarity, emotional tone, and ease of use need a reference/design system or a
human reviewer.

## Cross-browser and window-size matrix

Use the independent matrix runner for a release-oriented browser sweep. By
default it tests Chromium, Firefox, and WebKit in both light and dark themes:

```powershell
npm.cmd run matrix -- "https://example.com" `
  --viewports critical `
  --screenshots `
  --pretty
```

The default run creates 54 profiles per URL: three browser engines, nine
critical viewport sizes, and two color-scheme preferences. Use
`--browsers playwright` to state that core set explicitly. Use `--browsers all`
only when installed native Chrome and Edge channels should be added. `--headed`
shows each browser while the same checks run.

The critical matrix covers 320x568 and 390x844 mobile portrait, 844x390 mobile
landscape, 768x1024 and 1024x768 tablet, plus Windows-oriented 1280x720,
1366x768, 1536x864, and 1920x1080 sizes. Custom profiles use
`--viewports NAME=WIDTHxHEIGHT`. Themes accept `light`, `dark`, and
`no-preference` through `--themes`.

For an authorized signed-in page, pass an existing Playwright state file and
mask any additional sensitive regions:

```powershell
npm.cmd run matrix -- "https://example.com/account" `
  --storage-state workspace/storageState.json `
  --mask ".customer-number" `
  --header "X-Environment: approved-uat" `
  --screenshots `
  --pretty
```

Header values, authentication-state contents, password controls, and default
sensitive selectors are never serialized into the matrix report. Custom
headers are not forwarded across a cross-origin preflight redirect.

Run `--preflight-only` first for private URLs. An unreachable URL is reported
as `BLOCKED`, never as a pass. The default gate opens no pages if any requested
URL or browser is unavailable; `--allow-partial` must be explicit. Output is a
date-wise `output/YYYY-MM-DD/browser-matrix/<timestamp>/` directory containing
machine-readable `matrix.json`, Excel-friendly `matrix.csv`, and optional
masked screenshots. The report records per-browser HTTP/content validity,
horizontal overflow, offscreen controls, fixed-overlay collisions, rendered
font sizes and loaded font faces, incomplete images, console/page/network
errors, and browser-to-browser divergences. Objective layout failures are
`FIX`; lazy images, small type, possible carousel overflow, and overlay
candidates remain `REVIEW` until a person confirms them.

Run the isolated cross-browser completion gate at any time with:

```powershell
npm run matrix:verify
```

## Test

```powershell
npm run verify
```

The suite is deterministic and does not contact a live target. It tests color
math, alpha compositing, findings, comparisons, report escaping, configuration,
flow validation, browser readiness, and the complete three-engine matrix
against an isolated localhost fixture.
