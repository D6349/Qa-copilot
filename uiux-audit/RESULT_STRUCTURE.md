# Result folder structure

The audit framework works with any HTTP or HTTPS URL. Unless `--out` is
provided, every run is stored with this UTC hierarchy:

```text
output/
  YYYY-MM-DD/
    site/
      page/
        HH-MM-SS-mmmZ-hash/
          README.md
          report.html
          report.md
          audit.json
          manifest.json
          inventory.json
          action-plan.json
          checklist.json
          checklist.csv
          cases.json
          test-cases.json
          test-cases.csv
          findings.csv
          screenshots/
```

Example:

```text
output/2026-09-28/example-com/products-e-sign/12-09-27-123Z-a1b2c3d4/
```

## URL-to-folder rules

| URL kind | Derived folders |
|---|---|
| `https://example.com/` | `example-com/home/` |
| `https://example.com/products/e-sign` | `example-com/products-e-sign/` |
| `http://localhost:4100/dashboard` | `localhost-4100/dashboard/` |
| `https://example.com/search?q=one` | `example-com/search/`; the query affects only the run hash |
| International path with no safe Latin slug | `example-com/page-<hash>/` |
| Dynamic path plus `--label invoice-details` | `example-com/invoice-details/` |

Credentials and raw query values are never placed in folder names. URL
fragments do not change the folder identity. Milliseconds and a short hash make
repeated runs distinct.

## Overrides

Use a readable label while keeping automatic date organization:

```powershell
node cli.mjs audit "https://example.com/items/8429137" --label "invoice-details"
```

Use an exact destination when another system controls the path:

```powershell
node cli.mjs audit "https://example.com" --out "D:\audits\release-42\homepage"
```

`--out` bypasses the automatic hierarchy. `--overwrite` replaces only the
framework-owned files and screenshot directory in that selected run folder;
unrelated files are preserved.

## Sharing and parsing

Open `README.md` or `report.html` first. Share the entire run directory so
relative screenshot links continue to work.

The terminal contract is unchanged: stdout is one JSON document, progress is
written to stderr, and the returned `outputDirectory`, `organization`, and
`artifacts` values provide machine-readable paths for CI or another tool.
