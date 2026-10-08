# Project structure

The suite uses a layer-first structure so all modules share one implementation
pattern and every concern has one predictable home.

```text
playwright-suite/
|-- config/                 environment and canonical module registries
|-- docs/                   framework and reporting guides
|-- fixtures/               typed Playwright fixtures and evidence capture
|-- pages/                  Page Object Models
|-- reporters/              Excel and optional MySQL reporters
|-- scripts/                runners, generators and verification commands
|-- test-cases/             automated catalogs and manual UI/UX definitions
|-- test-data/
|   |-- *-data-driven.xlsx  editable automation input
|   `-- Workbook/           readable combined UI/UX suites
|-- tests/
|   |-- setup/              authentication only
|   `-- <module>/           maintained module specifications
|-- test-results/<env>/     generated runtime data, evidence and machine reports
|-- playwright-report/<env>/ environment-specific HTML report
|-- allure-results/<env>/   environment-specific Allure source results
|-- storage/<env>/          ignored authenticated browser state
`-- utils/                  shared data, auth, privacy and test helpers
```

The authoritative eight-module inventory is `config/modules.json`. Run
`npm.cmd run structure:check` after adding or renaming a module. The check
requires each module to provide a specification, Page Object, case catalog,
data workbook, readable UI/UX workbook, data preparation/check commands,
headed/headless commands, recorder command and Excel report verifier.

Generated output must never be used as test input. Editable data remains under
`test-data`, runtime JSON and evidence remain under `test-results`, and saved
authentication remains under `storage/<env>`.
