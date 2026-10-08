# Reporting

Every normal run produces complementary report formats for the selected
environment (`dev`, `uat`, or `live`):

| Format | Location | Purpose |
|---|---|---|
| Excel | `test-results/<env>/excel/` | Business-readable cases, results and screenshot evidence |
| JSON | `test-results/<env>/json/results.json` | Machine integration and custom analysis |
| JUnit | `test-results/<env>/junit/results.xml` | CI test-result publishing |
| HTML | `playwright-report/<env>/` | Interactive Playwright steps and attachments |
| Allure source | `allure-results/<env>/` | Allure history/report generation input |
| Artifacts | `test-results/<env>/artifacts/` | Retained traces and videos for failures |
| MySQL | Optional external database | Historical result persistence when configured |

Excel screenshots are privacy-masked by the shared fixture. Authentication
tests never capture screenshots, traces or video. Sensitive Knowledge provider
verification enables only the redacting Excel reporter.

Open the selected environment's HTML report with `npm.cmd run report`. Strict
Excel verification uses `report:verify:<module>` or `report:verify:all`.
Tagged subset runs use `report:verify:tagged`; partial verification is kept
separate so it cannot be mistaken for a complete 198-case execution.
Focused module runs use `report:verify:<module>:partial`.
Partial executions update `<scope>-<env>-partial-latest.xlsx`; only a complete
scope execution updates `<scope>-<env>-latest.xlsx`.

Run `npm.cmd run report:index` to refresh
`test-results/<env>/report-index.html`. This lightweight report center links
all available formats and shows the latest Excel Pass, Fail, Skipped and
screenshot totals by scope.

Generate the selected environment's Allure HTML with
`npm.cmd run allure:generate`, or generate and open it with
`npm.cmd run allure`. The command never mixes DEV, UAT and LIVE source files.

Historical root-level report folders are legacy evidence. They are not deleted
or moved automatically. New output is environment-scoped, and cleanup should
only happen after the evidence owner confirms retention requirements.
