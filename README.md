# QA Copilot

Paste a URL. Get test cases, a test plan, and a runnable Playwright suite.

**No API key. No account. No database to install. Nothing to pay for.**

---

## Run it

```bash
npm install
npm run seed      # optional — creates a demo project so you can see it working
npm start
```

Open <http://localhost:4100>.

To scan JavaScript-rendered or logged-in pages, add the browser once:

```bash
npm run browsers
```

Without it the scanner falls back to a plain fetch, which works fine for
server-rendered pages. The sidebar tells you which mode you're in.

---

## Repeated URL-only delivery

You do not add page-specific code when a new link arrives. Pass one URL, many
URLs, or a text file to the reusable delivery pipeline:

```bash
node cli.js deliver https://example.com/create https://example.com/list --name Example --module DOCUMENTS
node cli.js deliver --file urls.txt --name Example --insecure
```

The command creates or reuses the named project, scans each rendered DOM,
refreshes only its deterministic rule cases, runs the full responsive UI/UX,
accessibility, content, font, interaction, and passive-security audit, and
writes one timestamped delivery folder under `workspace/deliveries/`.

Every delivery has one reader-facing file: **`QA-Report.pdf`**. Open or share
that file for the verdict, priority fixes, cross-page differences, missing or
page-specific controls, desktop/mobile screenshots, and coverage summary.
The PDF deliberately avoids links to technical sub-reports.

```text
<timestamp>/
|-- QA-Report.pdf                 # the only file a reviewer needs
`-- supporting-evidence/
    |-- manifest.json
    |-- report.html / report.md
    |-- audits/                   # screenshots and per-page evidence
    |-- test-cases/
    |   |-- 01-Execute-First-P1-P2.xlsx
    |   |-- 02-All-Test-Cases.xlsx
    |   |-- 03-Jira-Import.csv
    |   `-- reference/            # JSON, CSV, and Markdown copies
    |-- analysis/                 # comparison and page models
    |-- planning/                 # test plan and journey prompt
    |-- allure-results/           # check results and screenshot attachments
    |-- allure-report/index.html  # interactive UI/UX evidence report
    `-- automation/               # optional generated Playwright suite
```

The delivery folder also keeps supporting evidence for QA traceability and
automation, but a normal reviewer does not need to open it:

- the HTML/Markdown report source and complete per-page audit evidence;
- common, missing, shared, and page-specific comparison data;
- a P1/P2 execution workbook first, then the complete Excel case set and Jira import;
- machine-readable CSV, JSON, and Markdown copies under `test-cases/reference/`;
- an evidence-derived test plan and raw page models;
- a cross-page journey prompt when two or more pages scan successfully.
- an Allure UI/UX report where measurable failures, passed checks, and manual
  reviews are separated, with the relevant responsive screenshots attached.

Use `--auth workspace/storageState.json` for protected pages, repeat
`--header Name:value` for request headers, and repeat `--mask selector` for
sensitive screenshot regions. Login, HTTP-error, and empty captures are never
reported as coverage. Add `--codegen` only when you also want a generated
Playwright skeleton. Run `node cli.js help` for viewport, theme, output, and CI
options.

The security mode is safe by default: it records passive browser-visible
evidence and designs active OWASP verification cases, but it does not attack a
live target. Authorization, injection, rate-limit, race-condition, and other
active security cases must be executed only in an approved test environment.

---

## Standalone UI/UX audits

Visual design, responsive layout, interaction, semantic accessibility, content,
usability, and design-system testing have a separate URL-first runner. It does
not use QA Copilot projects, stored page models, functional cases, or the
product-specific Playwright suite.

    npm run uiux:doctor
    npm run uiux:audit -- https://example.com --pretty
    npm run uiux:compare -- https://target.example.com --reference https://reference.example.com --pretty

It writes screenshots, normalized design tokens, deterministic findings, a
release decision, prioritized developer fixes, a professional verification
matrix, feature-aware test cases, and HTML/Markdown/CSV reports. See
[uiux-audit/README.md](uiux-audit/README.md) for authenticated pages,
responsive/theme profiles, state flows, baselines, masking, and CI gates, and
[uiux-audit/FRAMEWORK.md](uiux-audit/FRAMEWORK.md) for the full methodology.

---

## How it actually works

Most "AI test case generators" take a URL string and hallucinate plausible-looking
cases. This one doesn't.

**1. It reads the real page.** Playwright opens the URL and extracts a *Page
Model*: every field with its `required` / `maxlength` / `min` / `max` / `pattern`
/ `accept` attributes, every dropdown option, every button, every link, the
network calls fired on load, console errors, heading structure and alt text.

**2. A rules engine derives cases from those facts.** If a field declares
`maxlength=10`, you get boundary cases at 9, 10 and 11 characters — not a guess.
If it's named `pan`, you get a valid PAN plus seven malformed variants, each
labelled with *why* it's invalid.

**3. The same page produces the same cases, every time.** IDs are hashes of
content, not counters. This is the point of the whole design: it means the
**re-scan diff is trustworthy**. Scan a page after a release and QA Copilot tells
you exactly which fields were added, removed or had their constraints changed —
which is your regression signal. An LLM gives slightly different output on every
run, so you could never tell a real page change from sampling noise.

**4. What rules can't derive, you generate yourself in Cursor.** See below.

### What the rules engine covers

| Family | Derived from |
|---|---|
| Required-field validation | `required` — blank, whitespace-only, cleared-after-fill |
| Length boundaries | `maxlength` / `minlength` — n−1, n, n+1, and paste-bypass |
| Numeric ranges | `min` / `max` / `step` — boundaries, decimals, exponents, negatives |
| Indian formats | field name — PAN, GSTIN, CIN, DIN, Aadhaar, TAN, IFSC, UPI, pincode, mobile |
| Data type | `type` — dropdowns, file uploads, dates, passwords, readonly/disabled tampering |
| Unicode & stress | any text field — emoji, RTL, 10k chars, null byte, path traversal |
| Security / OWASP | page — stored XSS, SQLi, IDOR, direct-URL access, session expiry, CSRF, headers |
| Accessibility | DOM — keyboard-only, missing labels, alt text, heading structure, error announcement |
| API | captured network calls — contract, auth (401/403), malformed requests, rate limits |
| Interaction | buttons, links, tables — double-click duplicates, sorting, paging, back-button |
| Platform | page — 4 viewports, 4 browsers, load budgets, console hygiene |

A 13-field registration form produces **106 cases**.

### The Indian data is real

Aadhaar values use the **Verhoeff** checksum. GSTIN uses the **mod-36** check
character. These pass server-side validation, not just the form regex — so a
"valid PAN" case actually tests the happy path instead of failing at the API and
looking like a bug.

Every format also ships its invalid variants with the reason attached:

```
"only 4 leading letters (needs 5)"  → ABCD1234E
"ends with digit instead of letter" → ABCPD12345
"lowercase"                         → abcpd1234e
```

---

## Driving it from Cursor / Codex (CLI)

Everything the web UI does works from the terminal, so an agent can run the
whole loop itself. Commands print JSON to stdout, messages to stderr, exit 0/1.

```bash
node cli.js quick https://junedev.ledgers.cloud/agents --name June --insecure
```

That one command creates the project, adds the page, scans it and generates the
rules cases. Then:

```bash
node cli.js fields June agents      # what the page actually contains
node cli.js cases June              # what is already covered
node cli.js prompt June agents --print
node cli.js import June agents my-cases.json
node cli.js export June xlsx --out cases.xlsx
node cli.js codegen June --out ./suite
```

Project and page arguments accept an id, a name, or a substring — no ids to
track. `node cli.js help` lists everything.

**`AGENTS.md` at the repo root tells Codex all of this**, including which cases
the rules engine already covers so it does not duplicate them, and what to do
when a scan fails. Cursor picks it up automatically; `.cursorrules` has the same
content for older versions.

---

## The Codex hand-off

Rules can't read a requirements document, judge whether an error message is
clear, or invent a business flow that spans three pages. For those:

1. On a scanned page, press **Build Codex prompt**.
2. Copy it, or `@`-mention the file it writes to `workspace/inbox/`.
3. Paste into the Cursor agent panel. It returns a JSON array.
4. Press **Import Codex JSON** and paste it back.

The prompt already lists every case the rules engine produced, so Codex is told
explicitly not to repeat them. Imports are validated: bad entries are rejected
with their array index and the exact reason, and the good ones still come
through. Duplicates are skipped, so re-importing is safe.

**Your Cursor subscription does the work. This app never holds a credential.**

Attach acceptance criteria per page (**Attach requirements**) and they go into
the prompt — that's where the domain-specific cases come from.

---

## Exports

| Format | Notes |
|---|---|
| Excel | One sheet per module plus a summary sheet. Styled ranges, **not** Excel Table objects — those break on re-import. `type` column is exactly `Manual` / `Automation`. |
| CSV | Flat, every column |
| Jira / Xray CSV | Summary, description, steps, priority mapped to Jira fields |
| Markdown | For docs and PRs |
| Test plan | IEEE-829 style with a traceability matrix, every number computed from your actual case list |
| JSON | Full backup — restore from the sidebar |

Filter on the Test cases tab first; exports respect the active filter.

---

## Playwright suite generation

**Export & code → Download suite as .zip** gives you a complete TypeScript project:

```
playwright.config.ts        projects per browser, dev/UAT/prod via BASE_URL
global.setup.ts             logs in once, saves storage/auth.json
pages/*.page.ts             one Page Object per scanned page
tests/<module>/*.spec.ts    grouped by category, tagged @smoke @security @a11y
fixtures/auth.fixture.ts
utils/testData.ts           the checksum-correct Indian data factory
reporters/mysql-reporter.ts writes results to your test_cases table
.github/workflows/e2e.yml
```

Locators follow `getByTestId` → `getByLabel` → `getByPlaceholder` → `[name=]`.
**No XPath.** Each test carries its manual steps as `test.step()` calls and its
expected result as an annotation, so the HTML report reads like the manual case.

### One thing to know

**The assertions inside each step are left as TODO on purpose.** An assertion
guessed from a DOM scan passes for the wrong reason — you'd get a green suite
that tests nothing, which is worse than no suite. The structure, locators, data
and steps are done; the verification is yours.

Start with `npm run test:smoke`.

### MySQL logging

Set `DB_HOST` in the generated project's `.env` and the reporter creates and
fills a `test_cases` table automatically. `DB_WRITE_MODE=insert` keeps a row per
run; `update` keeps one row per case. Leave `DB_HOST` blank and logging is
skipped entirely, so local runs need no database.

---

## Hosting it

It's a plain Node server — it runs anywhere.

**Docker**

```bash
docker compose up -d
```

`data/` and `workspace/` are mounted as volumes, so rebuilding loses nothing.
The image is based on the official Playwright image, so full browser scanning
works out of the box.

**A VPS, Render, Railway, Fly.io**

Build command `npm install`, start command `npm start`, and set `PORT`. Mount a
persistent disk at `data/` or your projects vanish on redeploy.

**Anything shared**: there is no authentication. Put it behind a VPN, an SSO
proxy, or basic auth before exposing it to the internet. It's designed as a
personal tool.

---

## Where your data lives

Everything is plain JSON under `data/`:

```
data/projects.json          projects, pages, environments
data/cases/<projectId>.json test cases
data/models/<pageId>.json   last 10 page scans (this is what diffing uses)
data/plans/<projectId>.md   the test plan
```

No migrations, no database server. Back it up by copying the folder. Move it to
another machine by copying the folder. Inspect it with any text editor.

---

## Commands

```bash
npm start          # run
npm run dev        # run with auto-restart on file change
npm test           # 20 unit tests (Node's built-in runner, no dependency)
npm run seed       # create the demo project
npm run browsers   # install Chromium for full page scanning
```

## Keyboard

`/` jump to search · `Esc` close dialog

---

## Dependencies

`express`, `cheerio`, `exceljs`, and `playwright` (optional). That's it. No build
step, no bundler, no framework, no native modules — so it installs cleanly on
Windows without a compiler.
