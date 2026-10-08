# AGENTS.md

Instructions for an AI agent (Cursor / Codex / Claude Code) working in this repo.

This project is **QA Copilot**. Given a URL it scans the live DOM and derives
test cases from what it actually finds. You drive it through `cli.js`.

## Contract

- Every command prints **JSON to stdout**. Human messages go to **stderr**.
- Exit code `0` = success, `1` = failure.
- So: parse stdout, ignore stderr, branch on the exit code.
- Add `--pretty` only when a human is reading. Omit it when you are parsing.
- Project and page arguments accept an **id, a name, or a substring**. You do
  not need to track ids — `node cli.js scan June agents` works.

## Many pages at once

For the normal repeated workflow where the user supplies only URLs and wants
cases plus evidence and reports, use the generic delivery command. Do not add
page-specific scripts:

```bash
node cli.js deliver <url1> <url2> <url3> --name Project --module MODULE
node cli.js deliver --file urls.txt --name Project
```

`deliver` reuses the project, scans each URL, refreshes deterministic cases,
runs screenshot-based UI/UX/accessibility/passive-security audits, compares
common and page-specific gaps, and exports Excel/JSON/Markdown/Jira cases, a
test plan, HTML report, and screenshot PDF. Login, HTTP-error, and empty pages
make the delivery incomplete and are never counted as coverage. Use `sweep`
only when the lighter scan-and-yield table is all that is needed.

When the user gives you several URLs, or a whole area of a product:

```bash
node cli.js sweep "<project>" <url1> <url2> <url3> --module <MODULE>
node cli.js sweep "<project>" --file urls.txt
```

It scans and generates for each, then prints a yield table with a verdict per
page. **Read the verdicts.** Yield varies enormously by page type and that is
expected, not a fault:

| Verdict | What it means | What you do |
|---|---|---|
| `ok` | Form page, rules covered it well | Nothing |
| `thin` / `list-table` / `read-only` | Few or no form fields. Normal for lists and dashboards. | Cover it with a `journey` prompt |
| `LOGIN PAGE` | The session is not working | Run `login`, then sweep again |
| `EMPTY` | Nothing rendered | Needs login, or a browser scan |

Never report a `LOGIN PAGE` or `EMPTY` sweep as coverage.

## End-to-end journeys

The rules engine works one page at a time and can never see a flow between
pages. For that:

```bash
node cli.js journey "<project>" create list approve \
  --focus "maker creates, checker approves, status changes" --print
```

The prompt it builds contains the real field names, URLs, buttons and
constraints of every page in the sequence, so the flows you write must use
those and not invented ones. Answer it with a JSON array and import it against
the first page of the journey.

Use `journey` for: end-to-end happy paths, data integrity along a chain, state
transitions, role segregation, interrupted flows, reverse paths (edit after
create, delete after approve), and uniqueness collisions.

## The loop you should follow

When the user gives you a URL and asks for test cases:

```bash
# 1. One command does project + page + scan + rules generation
node cli.js quick <URL> --name "<project name>" --module <MODULE>
```

Add `--insecure` if it is an internal dev/UAT box with a self-signed
certificate. Add `--static` to skip the browser.

```bash
# 2. Read what the page actually contains before you write anything
node cli.js fields "<project>" "<page>"

# 3. See what the rules engine already covered
node cli.js cases "<project>"
```

**Now stop and think.** The rules engine has already produced every case
derivable from the DOM: required fields, length and numeric boundaries,
PAN/GSTIN/CIN/Aadhaar/IFSC formats, dropdown options, file upload types, XSS,
SQLi, IDOR, session expiry, CSRF, headers, keyboard access, labels, API
contract and auth, buttons, links, tables, viewports, performance.

**Do not duplicate any of it.** Your job is what the DOM cannot tell anyone:

1. End-to-end flows spanning more than this page
2. Business rules that need domain knowledge
3. Cross-field and conditional logic (field A changes what is valid in field B)
4. State-dependent behaviour (draft vs submitted vs approved)
5. Role differences (maker vs checker vs admin)
6. Error-message quality and recovery paths
7. Data integrity across create → edit → delete → restore

```bash
# 4. Get the full prompt, which lists every existing case title so you can avoid them
node cli.js prompt "<project>" "<page>" --print

# 5. Write your cases to a file, then merge them
node cli.js import "<project>" "<page>" my-cases.json
```

Rejected cases are reported with their **array index and the exact reason**.
Fix only those and re-import — duplicates are skipped, so re-running is safe.

```bash
# 6. Ship it
node cli.js plan "<project>" --out test-plan.md
node cli.js export "<project>" xlsx --out cases.xlsx
node cli.js codegen "<project>" --out ./playwright-suite
```

## The JSON shape for `import`

A plain array. No markdown fences, no prose around it.

```json
[
  {
    "title": "short imperative title",
    "description": "what risk this covers",
    "subModule": "logical grouping",
    "category": "Functional|Validation|UI/UX|Security|API|Accessibility|Performance|Compatibility|Data",
    "type": "Manual|Automation",
    "priority": "P1|P2|P3|P4",
    "severity": "Critical|High|Medium|Low",
    "preconditions": ["..."],
    "testData": { "label": "value" },
    "steps": [{ "action": "one atomic action", "data": "optional" }],
    "expectedResult": "specific and verifiable",
    "automatable": true,
    "isSmoke": false,
    "tags": ["..."]
  }
]
```

Only `title`, `expectedResult` and a non-empty `steps` array are required.
Everything else has a sensible default.

## Rules for the cases you write

- **One action per step**, imperative mood.
- `expectedResult` must be checkable by someone who has not seen the code.
  Never "works as expected", never "should be fine". Say what is on screen,
  what is in the database, what status code comes back.
- Each case must be runnable on its own by a tester who has never seen the page.
- Set `"automatable": false` honestly for judgement calls — message clarity,
  colour contrast, print layout, third-party OTP delivery.
- 15–30 cases per page. Quality over count. Do not pad.

## When a scan fails

`cli.js` returns a specific diagnosis, not "fetch failed". Act on it:

| Message contains | Do this |
|---|---|
| `TLS certificate` | Re-run with `--insecure` |
| `Cannot resolve` | Tell the user their VPN is probably disconnected. Do not retry blindly. |
| `refused the connection` | Service is down or a port is blocked. Ask the user. |
| `Timed out` | VPN or firewall. Ask the user. |

If the page needs a login or renders with JavaScript, the static scanner will
return almost no fields. Two options, in order of preference:

1. `npm run browsers` once, then save a Playwright `storageState.json` into
   `workspace/` — the scanner picks it up automatically.
2. Ask the user to copy the rendered DOM from devtools into a file, then
   `node cli.js scan "<project>" "<page>" --html page.html`

**A scan that returns 0 fields is a failure, not a result.** Do not generate
cases from it and present them as coverage — say the page did not load properly
and why.

## Useful extras

```bash
node cli.js doctor                      # environment check
node cli.js families                    # the 11 rule families and their ids
node cli.js diff "<project>" "<page>"   # what changed between the last two scans
node cli.js coverage "<project>"        # counts by category, priority, page
node cli.js generate "<p>" "<pg>" --families security,api --level exhaustive
```

`diff` is the regression signal. Generation is deterministic — the same page
model always produces byte-identical case ids — so any difference between two
scans is a real page change, never sampling noise. After a release, re-scan and
diff before regenerating.

## Do not

- Do not invent field names, constraints or endpoints. Everything must come
  from `node cli.js fields` or `node cli.js model`.
- Do not write cases for fields that are not in the page model.
- Do not add an AI SDK, an API key, or a call to a hosted model. This project
  deliberately has none, and that is not an oversight.
- Do not edit files under `data/` by hand — that is the database. Use the CLI.
- Do not fill in the TODO assertions in generated Playwright specs unless the
  user asks. They are left blank on purpose: an assertion guessed from a DOM
  scan passes for the wrong reason.

## Layout

```
cli.js                  the interface you use
server.js               web UI on :4100 (same data, same engine)
src/inspector.js        URL -> page model
src/rules/              the deterministic generators, one file per family
src/testData.js         Indian formats with real Verhoeff / mod-36 checksums
src/handoff.js          prompt builder + import validator
src/codegen/            page model + cases -> Playwright TypeScript project
data/                   the database (plain JSON)
```

Run `npm test` after changing anything under `src/`. 20 tests, no dependencies.
