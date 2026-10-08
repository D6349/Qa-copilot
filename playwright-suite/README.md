# June Playwright E2E suite

Reusable Google Chrome automation built from the recorded Account, Agents,
Tools, Connectors, Knowledge, Guardrails, UI Components and Product Tour
journeys. The
account preflight gates the existing preflight-dependent modules; Knowledge
uses setup-only authentication so a Knowledge command cannot trigger Account
writes. Excel-driven module flows can exercise real create and update
operations; run them only in an approved QA business. Module-specific flows
stay behind their explicit commands, while the combined flow connects Agents
and Tools.

## Setup

```powershell
cd D:\qa-copilot\playwright-suite
npm.cmd install
npm.cmd run auth:login   # first login or intentionally replace the session
npm.cmd run auth:refresh # later, validate or refresh an expired session
```

Copy `.env.example` to `.env`, then set the selected environment's scoped
username/password pair only in that ignored local file. The shared
`TEST_USERNAME` and `TEST_PASSWORD` remain an optional fallback. `auth:login` opens Google Chrome, applies
those environment credentials, allows manual OTP/MFA completion when needed,
verifies the authenticated task, and only then saves the reusable session
to `AUTH_STORAGE_PATH` (default `storage/<environment>/auth.json`). `auth:refresh` validates
an existing session and opens the same safe manual completion flow if it has
expired. Neither command prints credentials, and `.env` plus `storage/` are
ignored by Git.

If credentials differ, use `DEV_TEST_USERNAME`/`DEV_TEST_PASSWORD`,
`UAT_TEST_USERNAME`/`UAT_TEST_PASSWORD`, and
`LIVE_TEST_USERNAME`/`LIVE_TEST_PASSWORD`. The selected environment's pair
takes precedence over the shared `TEST_*` pair; values are never mixed.

Tools cross-user authorization uses two additional, distinct business-member
accounts per environment. Put them only in the ignored `.env` file:

```dotenv
DEV_USER_ACCESS_TEST_USERNAME=
DEV_USER_ACCESS_TEST_PASSWORD=
DEV_COMPANY_ACCESS_TEST_USERNAME=
DEV_COMPANY_ACCESS_TEST_PASSWORD=
```

The user-access username must be the same employee email shown in the Tool
Access search. The company-access account must be a different company member
who is not explicitly assigned to the tool. Equivalent `UAT_*` and `LIVE_*`
keys are available in `.env.example`. Never paste these values into chat,
Excel, source files, commands, screenshots or reports.

## Environment profiles

`TARGET_ENV` is the single routing selector. The mapping is fixed in
`config/environments.json`:

| Target | Application origin | Identity entry | Session file |
| --- | --- | --- | --- |
| `dev` | `https://junedev.ledgers.cloud` | `https://dev-v4.ledgers.cloud/in/ai-agents` | `storage/dev/auth.json` |
| `uat` | `https://juneuat.ledgers.cloud` | `https://uat-v4.ledgers.cloud/in/ai-agents` | `storage/uat/auth.json` |
| `live` | `https://june.ledgers.cloud` | `https://ledgers.cloud/in/ai-agents` | `storage/live/auth.json` |

Secondary sessions are isolated under
`storage/<environment>/identities/user-access.json` and
`storage/<environment>/identities/company-access.json`; they never overwrite
the owner session.

The framework derives `BASE_URL` from this table and rejects an invalid target
or an environment/URL mismatch before Chrome starts. Excel remains the shared
data source for cases and variable input; it cannot redirect a run to another
environment. Authentication, runtime JSON, Playwright artifacts, HTML, Allure,
and Excel reports are isolated by environment.

Log in once per environment:

```powershell
npm.cmd run auth:login:dev
npm.cmd run auth:login:uat
npm.cmd run auth:login:live
```

Run any module through the environment launcher:

```powershell
npm.cmd run env:run -- dev account --headed
npm.cmd run env:run -- uat agents --headed
npm.cmd run env:run -- live tools --headed
npm.cmd run env:run -- dev knowledge --headed
npm.cmd run env:run -- dev product-tour --headed
```

Supported targets are `all`, `flow`, `account`, `agents`, `tools`,
`connectors`, `knowledge`, `guardrails`, `ui-components`, and `product-tour`. Recorder targets
include `record-account`, `record-agents`, `record-tools`, `record-connectors`, `record-knowledge`,
`record-guardrails`, `record-ui-components`, and `record-product-tour`. The shortcuts `test:dev`,
`test:uat`, and `test:live` run the complete suite. Live is never selected by
a dev or UAT command.

Every normal test command discovers the `setup` project first. Focused commands
that intentionally skip the full dependency chain run `auth:ensure` first. It validates
the saved session against `AUTH_VALIDATE_PATH` (default `/task`), reuses it
when valid, or performs the same username/password login automatically. If the
site requires OTP/MFA in a headless run, the setup stops with an instruction to
run `npm.cmd run auth:refresh`; a partial login never overwrites the saved
session. Recorder launchers also run the same authentication check before
opening codegen.

Before the first DEV cross-user run, either enter both secondary credential
pairs in `.env` and let `auth:ensure:tools-users` log in automatically, or use
the visible OTP/MFA commands:

```powershell
npm.cmd run auth:login:user-access:dev
npm.cmd run auth:login:company-access:dev
npm.cmd run test:tools:access:headed
```

`test:tools:access:failed:headed` runs TL-048 and TL-049 only. TL-048 proves an
unassigned company member sees the tool only while Company Access is enabled.
TL-049 proves the explicitly assigned user sees the tool while a different,
unassigned company member cannot see it when Company Access is disabled.

Tools employee-access runs discover active employee identifiers only in memory
from the configured business directory. They do not store those identifiers in
Excel or report text. Trace/video and persistent HTML/Allure/JSON/JUnit/MySQL
reporting are disabled for these sensitive access-control commands. Excel keeps
only role labels and boolean visibility outcomes, and its authorized-user
screenshot masks the complete identity sidebar.

## Framework architecture

The maintained suite uses one consistent hybrid framework:

- Playwright Test owns execution, isolation, retries, projects and assertions.
- `fixtures/app.fixture.ts` lazily supplies typed Page Objects to each test.
- `pages/*.page.ts` contains browser selectors and reusable UI behavior only.
- `test-data/*.xlsx` controls case execution and variable test data.
- `utils/*ExcelData.ts` validates workbook schemas and resolves tokens.
- `utils/excel-test-case.ts` applies the shared Execute, annotation and evidence
  behavior to every Excel-driven case.
- `tests/setup/auth.setup.ts` verifies or creates the reusable session.
- `tests/account/account.setup.ts` runs the twelve ordered Account checks.
- module specs contain scenario orchestration and assertions without creating
  Page Objects directly.

The dependency chain is `authentication setup -> account preflight -> module
tests`. Lifecycle cases inside a module retain declaration order, while Page
Object fixtures remain isolated per test. The interactive authentication
project is separate from normal discovery and never writes Excel result files.

To capture the selected environment's Agents journey again without making the
raw recording a discovered test, run
`npm.cmd run env:run -- uat record-agents`. It writes
`tests/agents/recorded-agents-flow.recording.ts`.

Knowledge recording is handled more defensively because provider dialogs may
contain credentials. `npm.cmd run env:run -- live record-knowledge` writes the
raw capture only to the ignored runtime path
`test-results/live/recordings/recorded-knowledge-flow.recording.ts`; it never
overwrites the sanitized source reference. Review and sanitize any raw capture
before retaining it, and rotate a credential immediately if it was exposed.

Product Tour recording starts from `/task` with
`npm.cmd run env:run -- dev record-product-tour` and writes the raw capture to
`test-results/dev/recordings/recorded-new-module-tour.recording.ts`. The
maintained Page Object and test suite remain separate from that raw recording.

The dedicated `account-preflight` Chrome project runs after login setup and
before Chromium, Firefox, WebKit, or mobile module tests. Its twelve Excel-driven
checks repeat chat, connected-connector and PDF upload coverage across My
Account, subscribed HCL and no-subscription USHA, then verify each module-access
boundary.
Raw `tests/account/*.recording.ts` captures are always excluded from discovery.

## Excel-driven execution

The Account preflight reads twelve cases in account-context order: AC-001,
AC-004 through AC-006, AC-002, AC-007 through AC-012, and AC-003, from:

`test-data/account-data-driven.xlsx`

Run or validate it independently from the repository root:

~~~powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run data:account:check
npm.cmd run data:account:sync
npm.cmd run test:account:excel
npm.cmd run test:account:excel:headed
npm.cmd run report:verify:account
~~~

The existing Agents, Tools, Connectors, Guardrails and UI Components commands
prepare this workbook and run the account preflight dependency once before the
module flow. Knowledge intentionally uses the authenticated `tagged-chromium`
project with setup-only dependency, so `env:run live knowledge` cannot trigger
the Account chat/upload write checks.

The Agents automation reads its execution control and test values from:

`test-data/agents-data-driven.xlsx`

The workbook contains Instructions, Settings, and Agents Test Data sheets.
Its thirty AF-001 through AF-030 rows provide Execute YES/NO, titles, expected
results, and editable Test Data JSON. Common names, descriptions, model values,
timestamps, and security markers come from Settings.

Run it from the repository root:

~~~powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run data:agents:check
npm.cmd run test:agents:excel
npm.cmd run test:agents:excel:headed
~~~

Use `npm.cmd run data:agents:init` only when the input workbook does not exist.
`data:agents:reset` intentionally replaces it with the generated defaults.

AF-019 through AF-024 and AF-030 remain enabled because they form the create,
persistence, edit validation, update, update verification, and cleanup chain.

The Tools automation now reads its execution control and test values from:

`test-data/tools-data-driven.xlsx`

The workbook contains:

- Instructions - how to edit and run it
- Settings - base URL, time zone, names, purpose, keywords, endpoint, headers,
  create payload, update payload and security markers
- Tools Test Data - all TL-001 through TL-049 rows, Execute YES/NO, title,
  expected result and editable Test Data JSON

Run the Excel-driven suite from the repository root:

~~~powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run data:tools:check
npm.cmd run data:tools:sync
npm.cmd run test:tools:excel
npm.cmd run test:tools:excel:headed
npm.cmd run test:tools:matrix
npm.cmd run test:tools:matrix:headed
npm.cmd run test:tools:access
npm.cmd run test:tools:access:headed
~~~

`data:tools:sync` adds or refreshes catalog-defined rows while preserving the
existing execution choices and editable values for known IDs. TL-031 through
TL-046 are the independent HTTP-method-by-payload CRUD matrix. Each matrix case
creates a uniquely named run-owned tool, verifies and updates it, then deletes
only that exact matrix tool. The baseline TL-011 through TL-015 tools remain
protected and are never selected for matrix cleanup.

TL-047 through TL-049 cover authentication, Company Access, and employee
permissions in My Account and subscribed-business contexts. Employee selectors
use the workbook's search queries and distinct live results; no employee PII is
stored in source code or environment variables.

The Connectors flow reads:

`test-data/connectors-data-driven.xlsx`

It contains Settings plus all CN-001 through CN-024 rows with Execute YES/NO
and editable Test Data JSON. Run it with:

~~~powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run data:connectors:check
npm.cmd run test:connectors:excel
npm.cmd run test:connectors:excel:headed
~~~

CN-011 through CN-017 and CN-024 remain enabled as one create, persistence,
edit, update, action-menu and safe Delete-cancel chain.

The Knowledge flow reads all thirty `KB-001` through `KB-030` cases from:

`test-data/knowledge-data-driven.xlsx`

The workbook contains Instructions, Settings and Knowledge Test Data sheets.
Validate or run it with:

~~~powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run data:knowledge:check
npm.cmd run test:knowledge:excel
npm.cmd run test:knowledge:excel:headed
npm.cmd run report:verify:knowledge
~~~

Use `npm.cmd run data:knowledge:init` only when the workbook is missing;
`data:knowledge:reset` intentionally replaces it with generated defaults.
Knowledge write cases require `KNOWLEDGE_ALLOW_WRITES=true`, and deletion also
requires `KNOWLEDGE_ALLOW_DELETE=true`; LIVE writes additionally require
`ALLOW_LIVE_KNOWLEDGE_WRITES=1`. Provider verification requires
`RUN_KNOWLEDGE_PROVIDER_VERIFY=1` and
`KNOWLEDGE_PROVIDER_CONFIG_IS_SYNTHETIC=1`; LIVE provider calls additionally
require `ALLOW_LIVE_KNOWLEDGE_PROVIDER_VERIFY=1`. Keep these gates unset for
read-only, no-provider runs.

When `RUN_KNOWLEDGE_PROVIDER_VERIFY` is `1` or `true`, Playwright
conservatively enables only the Excel reporter for the entire invocation,
including direct-spec and custom commands. The list, HTML, Allure and MySQL
reporters are disabled because they do not provide the same exact-value
redaction guarantee. Normal reporter behavior returns when the flag is unset
or false. The Excel workbook redacts configured credential/provider values and
uses repository-relative workbook, attachment and output paths.
Provider-value redaction covers `KNOWLEDGE_QDRANT_API_KEY`,
`KNOWLEDGE_QDRANT_ENDPOINT`, `KNOWLEDGE_CHROMA_API_KEY`,
`KNOWLEDGE_CHROMA_TENANT`, `KNOWLEDGE_CHROMA_DATABASE`,
`KNOWLEDGE_CHROMA_ALTERNATE_DATABASE`, and
`KNOWLEDGE_CHROMA_COLLECTION`.

`npm.cmd run data:ui-ux-suites` also creates
`test-data/Workbook/knowledge-ui-ux-test-cases.xlsx`, combining the thirty
automated KB cases with the `KNOWLEDGE_UI_UX_CASES` manual design set. The
generator and verifier derive the manual count from that export instead of
duplicating a hard-coded count.

The Product Tour flow reads twelve `PT-001` through `PT-012` cases from
`test-data/product-tour-data-driven.xlsx`. It covers all eight recorded tour
entries, launcher contents, Skip, Back, and anonymous-access security without
creating or updating business records. Validate, run, or verify it with:

~~~powershell
npm.cmd run data:product-tour:check
npm.cmd run test:product-tour:excel:headed
npm.cmd run report:verify:product-tour
~~~

Its readable combined workbook is
`test-data/Workbook/product-tour-ui-ux-test-cases.xlsx` (12 automated plus 9
manual UI/UX cases).

Every run validates the workbook before Chrome starts. Invalid JSON, missing
columns, duplicate/out-of-order IDs and invalid Execute values stop the run
with a precise message. All rows default to YES. The mandatory Agents chain
above and TL-011 through TL-015 cannot be disabled because later persistence
checks depend on the records created earlier in the same run.

Playwright code remains the reusable browser-action and assertion engine.
Excel controls which cases run and supplies their variable data, so normal
data changes do not require editing the TypeScript tests.

## Run from the repository root

```powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run test:flow          # Agents + Tools in headless Google Chrome
npm.cmd run test:flow:headed   # same connected flow in visible Chrome
npm.cmd run test:account       # all 12 Excel-driven Account checks
npm.cmd run test:account:headed # same preflight in visible Google Chrome
npm.cmd run test:agents        # all 30 Excel-driven Agents cases
npm.cmd run test:agents:headed # same sequential flow in visible Chrome
npm.cmd run test:agents:excel  # explicit alias for the Agents flow
npm.cmd run test:tools         # all 49 Tools cases, including CRUD/access/security
npm.cmd run test:tools:headed  # same sequential flow in visible Chrome
npm.cmd run test:tools:excel   # explicit alias for the Excel-driven Tools flow
npm.cmd run test:tools:matrix  # DEV method-by-payload create/update/delete matrix
npm.cmd run test:tools:matrix:headed # same DEV matrix in visible Chrome
npm.cmd run test:tools:access  # DEV owner/assigned-user/company-member access checks
npm.cmd run test:tools:access:headed # same cross-login access flow in visible Chrome
npm.cmd run test:connectors    # all 24 Excel-driven Connectors cases
npm.cmd run test:connectors:headed # same flow in visible Google Chrome
npm.cmd run test:knowledge     # all 30 Excel-driven Knowledge cases
npm.cmd run test:knowledge:headed # same flow in visible Google Chrome
npm.cmd run test:guardrails    # all 30 Excel-driven Guardrails cases
npm.cmd run test:ui-components # all 30 Excel-driven UI Components cases
npm.cmd run test:product-tour  # all 12 read-only Product Tour cases
npm.cmd run test:all           # all 217 cases across all eight modules
npm.cmd run report:verify      # validate the latest Excel workbook
npm.cmd run report:verify:account # validate the Account preflight workbook
npm.cmd run report:verify:agents # validate the Agents-only Excel workbook
npm.cmd run report:verify:tools # validate the Tools-only Excel workbook
npm.cmd run report:verify:connectors # validate the Connectors Excel workbook
npm.cmd run report:verify:knowledge # validate the Knowledge Excel workbook
npm.cmd run report:verify:all   # strictly validate all 217 execution rows
npm.cmd run report:verify:tagged # validate an ordered tagged/partial subset
npm.cmd run report:index        # refresh the environment report center
```

The combined flow runs:

- Thirty Agents cases: `AF-001` through `AF-030`
- Forty-nine Tools cases: TL-001 through TL-049
- Both modules read Excel settings and case data before the browser starts
- Agents create/update and Tools create/update/delete execute in their declared order
- Tools creation (TL-011) and update (TL-014) always run and are never guarded by test.skip
- The TL-031 through TL-046 CRUD matrix deletes only its exact run-owned tools;
  it never targets the TL-011 through TL-015 baseline records
- TL-047 through TL-049 validate authentication, Company Access, and two
  distinct employee permissions without storing employee PII
- One worker preserves the declared case order; failed validation cases do not skip later cases

The Tools catalog classifies every case as Positive, Negative, Security, or a
combined type. Security cases include an explicit security area and OWASP
reference in Excel.

Current Pass/Fail totals belong in generated reports, not in this README. Use
`npm.cmd run report:index` for the selected environment's current report center
and the scope-specific Excel verifier for evidence-backed status.

## Excel test-case report

Every Playwright run creates a workbook with:

- Summary - environment, IST run date/time and Pass/Fail/Skipped totals
- Test Cases - sequence, scenario type, security area, OWASP reference, case
  IDs, preconditions, steps, expected results, latest run date/time, test data,
  and the final-state screenshot embedded in the same Test Case ID row
- Execution Results - sequence, IST date/time, status, browser, timestamped
  module data, failure details, evidence status and the full screenshot link

Execution never writes results or screenshots back into `test-data/*.xlsx` or
the generated design workbooks under `test-data/Workbook`. Those files remain
the immutable test-data and test-design sources. Runtime status and evidence
belong to the timestamped report under `test-results/<env>/excel`.

Each executed Pass or Fail case has one compact preview in its `Test Cases`
row. Select `Open screenshot` in `Screenshot File` to open the full-resolution
image. Skipped cases are labelled `Not captured — Skipped`, and cases outside
a tagged run are labelled `Not captured — Not Run`. `Not captured —
Unavailable` makes a capture or file-write problem visible instead of claiming
evidence exists. Full images are kept beside the reports at:

```text
test-results/<env>/excel/evidence/<run-id>/<case-id>--<project>--retry-<n>.jpg
```

The report uses relative links, so copy the workbook together with its
`evidence/<run-id>` directory when sharing it. The embedded preview remains
visible if the workbook is copied by itself.

Screenshot capture is privacy-aware. Authentication setup and manual login do
not capture screenshots, and normal case screenshots mask password, username,
email, OTP/MFA, secret, token and API-key controls. Add project-specific CSS
selectors to the semicolon-separated `EVIDENCE_MASK_SELECTORS` environment
variable, or mark an element with `data-evidence-mask`, when a page contains
additional sensitive values. Continue to use approved synthetic test data.

The combined command writes environment-isolated files (`<env>` is `dev`,
`uat`, or `live`):

```text
test-results/<env>/excel/e2e-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/e2e-flow-<env>-latest.xlsx
```

The standalone Account preflight writes all twelve AC-* cases to:

```text
test-results/<env>/excel/account-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/account-flow-<env>-latest.xlsx
```

The separate Agents commands write all thirty AF-* cases to:

```text
test-results/<env>/excel/agent-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/agent-flow-<env>-latest.xlsx
```

The separate Tools commands write all forty-six TL-* cases to:

```text
test-results/<env>/excel/tools-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/tools-flow-<env>-latest.xlsx
```

The Connectors commands write all twenty-four CN-* cases to:

```text
test-results/<env>/excel/connectors-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/connectors-flow-<env>-latest.xlsx
```

The Knowledge commands write all thirty KB-* cases, with final screenshots
embedded on their matching Test Case ID rows, to:

```text
test-results/<env>/excel/knowledge-flow-<env>-<timestamp>.xlsx
test-results/<env>/excel/knowledge-flow-<env>-latest.xlsx
```

The true all-module command `test:all` uses the 217-case, eight-module catalog.
Cross-module tagged commands such as `test:smoke`, `test:sanity`,
`test:regression`, `test:security`, `test:a11y`, `test:api`,
`test:e2e:tagged`, `test:integration`, `test:prod-smoke` and
`test:uat:tagged` use an ordered subset of the same catalog. Both write:

```text
test-results/<env>/excel/all-modules-<env>-<timestamp>.xlsx
test-results/<env>/excel/all-modules-<env>-latest.xlsx
```

Only tag-selected IDs appear in a tagged run's `Execution Results`; they stay in catalog
order and the unselected `Test Cases` rows remain `Not Run`. Validate this
ordered subset, its evidence links and embedded previews with:

```powershell
npm.cmd run report:verify:tagged
```

Use `report:verify:all` only for a complete 217-row execution. The timestamped
files preserve individual runs, while each scope also exposes a convenient
`latest` workbook.

Normal runs additionally create environment-scoped JSON and JUnit files at
`test-results/<env>/json/results.json` and
`test-results/<env>/junit/results.xml`, Playwright HTML under
`playwright-report/<env>`, and Allure source under `allure-results/<env>`.
See `docs/PROJECT_STRUCTURE.md` and `docs/REPORTING.md` for the maintained map.

## Write behavior

The Agents suite creates a uniquely date-time-stamped agent in its mandatory
chain, verifies the saved values, validates edit rules, updates it with a new
timestamp, verifies the update, and performs its configured cleanup. These
write cases run in the normal Agents and combined commands; they are not hidden
behind RUN_WRITE_FLOW.

The Tools suite creates a uniquely date-time-stamped baseline tool in each
configured account context in TL-011, validates its saved values, updates it to
POST with a separate update timestamp in TL-014, and validates the update in
TL-015. Those baseline records remain in the business and are protected from
automatic matrix cleanup.

TL-031 through TL-046 cover every GET, POST, PUT and DELETE method combined
with JSON, XML, Form Data and Parameters. Each case creates, verifies, updates
and deletes only its own uniquely named run-owned tool in both account contexts.

TL-047 through TL-049 create unique run-owned tools to validate No
Authentication persistence, the Company Access enabled/disabled lifecycle, and
two distinct employee selections with Can Edit and Can View permissions. Each
case verifies its saved settings, updates the tool, and deletes only its own
record.

The Connectors suite creates one uniquely timestamped connector, verifies every
saved field, renames and updates it, then opens Delete and cancels. It never
confirms permanent deletion, so created QA connectors remain in the business.

Run them only in an approved QA business:

```powershell
npm.cmd run test:agents:headed # visible Agents create/update flow
npm.cmd run test:flow:write   # visible combined Agents + Tools write flow
npm.cmd run test:tools:write  # alias for the visible all-Tools flow
```

## Recorded and cleaned files

| Path | Purpose |
|---|---|
| `fixtures/app.fixture.ts` | Lazy typed fixtures for all maintained Page Objects |
| `pages/login.page.ts` | Reusable username/password login interactions |
| `pages/app-shell.page.ts` | Authenticated task/session verification |
| `pages/task.page.ts` | Shared chat, connected-connector and PDF behavior for every account context |
| `tests/setup/auth.setup.ts` | Automatic environment login and saved-session setup project |
| `tests/setup/auth.manual.ts` | Visible Chrome OTP/MFA refresh project |
| `utils/auth-session.ts` | Safe session validation and atomic storage-state persistence |
| `utils/excel-test-case.ts` | Shared Excel Execute, annotation and evidence handling |
| `tests/account/recorded-switch-account-flow.recording.ts` | Optional raw Account recorder output; never discovered as a test |
| `tests/account/account.setup.ts` | Twelve ordered Account checks that gate browser module projects |
| `utils/accountExcelData.ts` | Validated Account workbook runtime loader |
| `scripts/prepare-account-data.mjs` | Validates Account Excel and creates runtime JSON |
| `scripts/create-account-data-workbook.mjs` | Creates or safely synchronizes the editable Account input workbook |
| `tests/agents/recorded-agents-flow.recording.ts` | Optional raw Agents recorder output; not discovered as a test |
| `tests/agents/agents-flow.spec.ts` | Stable Excel-driven Agents tests |
| `tests/tools/recorded-tools-flow.recording.ts` | Original manual Tools capture; not discovered as a test |
| `tests/tools/tools-flow.spec.ts` | Stable Tools tests |
| `tests/connectors/recorded-connectors-flow.recording.ts` | Original manual Connectors capture; not discovered as a test |
| `tests/connectors/connectors-flow.spec.ts` | Stable Excel-driven Connectors tests |
| `tests/knowledge/recorded-knowledge-flow.recording.ts` | Sanitized, non-executable Knowledge recorder reference |
| `test-results/<environment>/recordings/recorded-knowledge-flow.recording.ts` | Ignored raw Knowledge recorder output; sanitize before retaining |
| `tests/knowledge/knowledge-flow.spec.ts` | Stable Excel-driven Knowledge tests for KB-001 through KB-030 |
| `pages/agents.page.ts` | Agents page object |
| `pages/tools.page.ts` | Tools page object |
| `pages/connectors.page.ts` | Connectors page object |
| `pages/knowledge.page.ts` | Knowledge page object |
| `utils/agentsExcelData.ts` | Validated Agents workbook runtime loader and token resolution |
| `scripts/prepare-agents-data.mjs` | Validates Agents Excel and creates runtime JSON |
| `scripts/create-agents-data-workbook.mjs` | Creates the editable Agents input workbook |
| `utils/knowledgeExcelData.ts` | Validated Knowledge workbook runtime loader and token resolution |
| `scripts/prepare-knowledge-data.mjs` | Validates Knowledge Excel and creates environment runtime JSON |
| `scripts/create-knowledge-data-workbook.mjs` | Creates the editable Knowledge input workbook |
| `test-cases/knowledge-flow-cases.ts` | KB-001 through KB-030 catalog |
| `test-cases/connector-flow-cases.ts` | CN-001 through CN-024 catalog |
| `test-cases/agent-flow-cases.ts` | Combined Agents, Tools and imported module catalogs |
| `reporters/excel-reporter.ts` | Scope-aware Agents, Tools, module or combined workbook generation |

The cleaned tests use semantic locators and dynamic card names. Recorded
business names, tax identifiers and user-specific selectors are not used.

## Other reports

```powershell
cd D:\qa-copilot\playwright-suite
npm.cmd run report
npm.cmd run report:index
```

MySQL logging remains optional. Set `DB_HOST` in `.env` to enable it;
otherwise local runs skip database writes.
