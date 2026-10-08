# Standalone framework setup

This setup is for the reusable framework itself. It does not audit an external
URL and does not depend on an AI agent, QA Copilot project, hosted model, API
key, or product-specific page definition.

## Prerequisites

- Node.js 20 or newer
- npm
- Windows, macOS, or Linux with permission to launch a local browser
- Network access during the one-time dependency and browser installation

## One-time installation

Run from this directory:

```powershell
npm ci
npm run setup
npm run verify
npm run security
```

The commands have separate responsibilities:

1. `npm ci` installs exactly the versions in `package-lock.json`.
2. `npm run setup` installs the required Playwright Chromium, Firefox, and
   WebKit builds and runs the environment doctor.
3. `npm run verify` launches all three engines and runs the complete local test
   suite, including light/dark matrix captures. It does not contact a target
   website.
4. `npm run security` checks production dependencies against the npm advisory
   database and must report zero known vulnerabilities.

To reinstall the required engine bundle independently, run:

```powershell
npm run browsers
```

Native Chrome and Edge channels are optional matrix targets when already
installed; they are not part of the portable Playwright completion gate.

## Completion gate

Setup is complete only when `npm run doctor` exits `0` and its JSON reports:

| JSON field | Required value |
|---|---|
| `ok` | `true` |
| `requirements.node.supported` | `true` |
| `dependencies.allInstalled` | `true` |
| `filesystem.packageRootWritable` | `true` |
| `playwright.browserInstalled` | `true` |
| `playwright.browserLaunchable` | `true` |
| `playwright.crossBrowserReady` | `true` |
| `config.valid` | `true` |
| `independentFromQaProjects` | `true` |

`npm run verify` must also finish with zero failed or cancelled tests. Its
cross-browser gate captures one local page in three engines and two themes (six
profiles total). A browser path alone is not considered ready; the doctor
performs a real headless launch of Chromium, Firefox, and WebKit.
`npm run security` must exit `0` with zero production vulnerabilities. It uses
the npm advisory service and therefore requires registry access.

## Terminal interface

The framework works directly from a terminal:

```powershell
node cli.mjs help --pretty
node cli.mjs doctor --pretty
node cli.mjs framework --pretty
```

Optionally expose the package command globally on the current machine:

```powershell
npm link
uiux-audit doctor --pretty
```

`node cli.mjs ...` remains the most portable invocation and does not require
the global link.

## Generic commands after setup

These examples accept any HTTP or HTTPS URL; they are not tied to one endpoint.

```powershell
# Cross-browser release matrix: 3 engines x 9 viewports x 2 themes
npm run matrix -- "https://example.com" --screenshots --pretty

# Small focused matrix while developing
npm run matrix -- "https://example.com" `
  --viewports smoke=1366x768 --themes light,dark --pretty

# Show the browser windows
npm run matrix -- "https://example.com" --headed --pretty
```

The ordinary full audit and comparison commands remain:

```powershell
# Full default audit: four viewports and light/dark themes
node cli.mjs audit "https://example.com" --pretty

# Visible Chromium
node cli.mjs audit "https://example.com" --headed --pretty

# Two live URLs
node cli.mjs compare "https://target.example.com" `
  --reference "https://reference.example.com" --pretty

# Accepted baseline followed by regression comparison
node cli.mjs baseline "https://example.com" --name homepage-v1 --pretty
node cli.mjs compare "https://example.com" `
  --baseline baselines/homepage-v1/baseline.json --pretty
```

A normal command returns one compact JSON document on stdout. Progress goes to
stderr. Full findings remain in the date-wise artifact directory; use `--full`
only when every complete finding must also be returned on stdout.
The matrix command follows the same stdout/stderr contract and writes to
`output/YYYY-MM-DD/browser-matrix/<timestamp>/` by default.

## Result structure

Without `--out`, every run creates a new collision-safe directory:

```text
output/YYYY-MM-DD/site/page/HH-MM-SS-mmmZ-hash/
```

Each completed run contains an offline HTML report, Markdown handoff, raw JSON,
CSV findings/checklists/test cases, action plan, inventory, manifest, and
screenshots. Query secrets and credentials are excluded from folder names.

## Security defaults

- Authentication state and generated output directories are ignored by Git.
- `.env` files and standalone storage-state JSON files are ignored by Git.
- Request-header values, cookie values, typed field values, recognized secret
  query values, and CSP nonces/hashes are not serialized into JSON evidence.
- Password fields and configured sensitive selectors are masked in screenshots.
- Matrix screenshots also mask password, one-time-code, card-number, and
  card-security-code autocomplete controls plus `[data-sensitive]`,
  `[data-private]`, `[data-pii]`, and `[data-uiux-mask]`. Add any other sensitive
  rendered region with repeatable `--mask` flags before reports are shared.
- Custom matrix headers are never reported and are dropped on cross-origin
  preflight redirects.
- Ordinary audits are passive-safe. Active authentication, authorization,
  IDOR/BOLA, CSRF, injection, upload, rate-limit, replay, and business-logic
  testing requires explicit authorization and separate execution.

## Troubleshooting

- Any `playwright.browsers.<name>.installed: false`: run `npm run browsers`.
- Any `playwright.browsers.<name>.launchable: false`: read that browser's
  `launchError`; endpoint scanning will not be reliable until all three core
  engines launch.
- `playwright.crossBrowserReady: false`: do not treat setup as complete. Repair
  the reported engine and rerun `npm run doctor` plus `npm run matrix:verify`.
- `config.valid: false`: fix the reported configuration error or restore
  `uiux.config.json`.
- TLS certificate failure on an approved internal environment: use
  `--insecure` only for that environment.
- Login or empty capture: create storage state with `node cli.mjs auth ...` or
  provide an authorized declarative flow. Never present an invalid capture as
  audit coverage.
