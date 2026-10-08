import fs from 'node:fs';
import path from 'node:path';

import { analyzeScan } from './analyze.mjs';
import { compareAuditFiles, compareScans } from './compare.mjs';
import { PACKAGE_ROOT, publicConfig } from './config.mjs';
import { enrichScanContent } from './content.mjs';
import { sanitizeUrl, slug, stableHash, timestampId, toPosix } from './core.mjs';
import { publicFlow } from './flow.mjs';
import { buildActionPlan, buildFrameworkAssessment, buildTestCases } from './framework.mjs';
import { buildManualCases } from './manual-cases.mjs';
import { buildManifest } from './report.mjs';
import { renderProfessionalHtmlReport } from './professional-report.mjs';
import {
  renderChecklistCsv,
  renderFindingsCsv,
  renderMarkdownReport,
  renderTestCasesCsv,
} from './deliverables.mjs';
import { scanWebsite } from './scanner.mjs';

export const RESULT_LAYOUT_VERSION = '1.0';

const GENERATED_ARTIFACTS = Object.freeze({
  readme: 'README.md',
  audit: 'audit.json',
  manifest: 'manifest.json',
  inventory: 'inventory.json',
  cases: 'cases.json',
  testCases: 'test-cases.json',
  checklist: 'checklist.json',
  actionPlan: 'action-plan.json',
  report: 'report.html',
  reportMarkdown: 'report.md',
  findingsCsv: 'findings.csv',
  checklistCsv: 'checklist.csv',
  testCasesCsv: 'test-cases.csv',
  screenshots: 'screenshots/',
});

function mkdir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeAtomic(file, content) {
  mkdir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function writeJson(file, value) {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} does not exist: ${file}`);
    throw new Error(`Could not read ${label} ${file}: ${error.message}`);
  }
}

function decodedPathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function safePageName(value, fallbackSource) {
  const clean = slug(value, '');
  return clean || `page-${stableHash(fallbackSource, 8)}`;
}

export function resultFolderParts(url, date = new Date(), label = null) {
  const parsed = new URL(url);
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid audit result date: ${date}`);
  const iso = instant.toISOString();
  const explicitLabel = String(label || '').trim();
  const pathText = decodedPathname(parsed.pathname).split('/').filter(Boolean).join('-');
  const page = explicitLabel
    ? safePageName(explicitLabel, explicitLabel)
    : pathText ? safePageName(pathText, parsed.pathname) : 'home';
  const urlIdentity = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  return {
    layoutVersion: RESULT_LAYOUT_VERSION,
    dateUtc: iso.slice(0, 10),
    site: slug(parsed.host, 'site'),
    page,
    run: `${iso.slice(11, 23).replace(/[:.]/g, '-')}Z-${stableHash(`${urlIdentity}|${iso}`, 8)}`,
  };
}

export function defaultOutputDirectory(url, date = new Date(), label = null) {
  const parts = resultFolderParts(url, date, label);
  return path.join(PACKAGE_ROOT, 'output', parts.dateUtc, parts.site, parts.page, parts.run);
}

function outputDirectory(url, requested, date, label) {
  if (requested) return path.resolve(requested);
  return defaultOutputDirectory(url, date, label);
}

function prepareOutput(directory, overwrite) {
  const auditFile = path.join(directory, 'audit.json');
  if (fs.existsSync(auditFile) && !overwrite) {
    throw new Error(`Output already contains an audit: ${directory}. Choose another --out directory or pass --overwrite.`);
  }
  if (!overwrite) return;

  const root = path.resolve(directory);
  for (const relative of Object.values(GENERATED_ARTIFACTS)) {
    const target = path.resolve(root, relative);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing to clean an audit artifact outside the output directory: ${target}`);
    }
    fs.rmSync(target, {
      force: true,
      recursive: relative.endsWith('/'),
    });
  }
}

function inventoryFor(captures) {
  return {
    captures: captures.map((capture) => ({
      captureId: capture.captureId,
      checkpoint: capture.checkpoint,
      theme: capture.theme,
      viewport: capture.viewport,
      url: capture.url,
      status: capture.status,
      metrics: capture.metrics,
      tokens: capture.tokens,
      fonts: capture.fonts,
      assets: capture.assets,
      accessibility: capture.accessibility,
      security: capture.security,
      contentAudit: capture.contentAudit,
      limitations: capture.limitations,
    })),
  };
}

function markdownInline(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\`|])/g, '\\$1')
    .trim();
}

function renderPackageReadme(audit) {
  const coverage = audit.coverage || {};
  const captures = coverage.captures || {};
  const viewports = (coverage.viewports || [])
    .map((viewport) => `${viewport.name} (${viewport.width}x${viewport.height})`)
    .join(', ') || 'None recorded';
  const themes = (coverage.themes || []).join(', ') || 'None recorded';
  const checkpoints = (coverage.checkpoints || []).join(', ') || 'page';
  const targetUrl = String(audit.target?.url || '').replace(/[<>\r\n]/g, '');
  return `# UI/UX and passive security audit package

Open [report.html](report.html) first. Share this entire directory so screenshots and evidence links remain available.

| Item | Value |
|---|---|
| Page | ${markdownInline(audit.target?.title || audit.resultOrganization?.page || 'Untitled page')} |
| Target | <${targetUrl}> |
| Run ID | \`${markdownInline(audit.runId)}\` |
| Generated | ${markdownInline(audit.completedAt)} |
| Release decision | **${markdownInline(audit.actionPlan?.decision || audit.verdict || 'UNKNOWN')}** |
| Valid captures | ${captures.valid ?? 0}/${captures.total ?? 0} |
| Viewports | ${markdownInline(viewports)} |
| Themes | ${markdownInline(themes)} |
| Checkpoints | ${markdownInline(checkpoints)} |
| Security mode | ${markdownInline(audit.securityScope?.mode || 'not recorded')} |

## Contents

| Path | Purpose |
|---|---|
| \`report.html\` | Human-readable audit, evidence, fixes, and test guidance |
| \`report.md\` | Pull request, wiki, email, or ticket-friendly report |
| \`action-plan.json\` | Deduplicated P0-P3 work items |
| \`test-cases.json\` / \`test-cases.csv\` | Generated verification and regression cases |
| \`checklist.json\` / \`checklist.csv\` | Full professional framework status |
| \`findings.csv\` | Backlog-ready findings export |
| \`audit.json\` | Complete normalized source of truth |
| \`manifest.json\` | Compact machine-readable run index |
| \`inventory.json\` | Observed design tokens, assets, accessibility, and redacted passive security evidence |
| \`cases.json\` | Reusable manual UI/UX cases |
| \`screenshots/\` | Viewport, theme, reference, and flow-state evidence |

A pass applies only to checks with collected evidence. Manual, blocked, indeterminate, and not-tested work remains visible and is never counted as passed.
`;
}

function publicTarget(scan) {
  return {
    url: sanitizeUrl(scan.url),
    finalUrl: sanitizeUrl(scan.finalUrl),
    title: scan.title,
    browser: scan.browser,
    browserVersion: scan.browserVersion,
  };
}

function baselineScan(audit) {
  if (audit?.captures) {
    return {
      url: audit.target?.url || audit.url || '',
      finalUrl: audit.target?.finalUrl || '',
      title: audit.target?.title || '',
      captures: audit.captures,
    };
  }
  return audit;
}

export async function runAudit({
  url,
  config,
  output,
  resultLabel = null,
  overwrite = false,
  storageStatePath = null,
  headers = {},
  headed = false,
  insecure = false,
  flow = null,
  referenceUrl = null,
  baselineFile = null,
  expectAuthenticated = false,
  onProgress = () => {},
} = {}) {
  const startedAt = new Date();
  const resultOrganization = resultFolderParts(url, startedAt, resultLabel);
  const artifactDir = outputDirectory(url, output, startedAt, resultLabel);
  prepareOutput(artifactDir, overwrite);
  mkdir(artifactDir);

  const targetScan = await scanWebsite({
    url,
    config,
    artifactDir,
    storageStatePath,
    headers,
    headed,
    insecure,
    flow,
    label: 'target',
    onProgress,
  });
  if (expectAuthenticated) {
    for (const capture of targetScan.captures) {
      if (!capture.loginDetected) continue;
      capture.status = 'invalid';
      capture.invalidReasons.push('A sign-in form was rendered even though an authenticated page was expected.');
    }
  }
  await enrichScanContent(targetScan, config);

  const analysis = analyzeScan(targetScan, config);
  let reference = null;
  let comparison = null;
  if (referenceUrl) {
    reference = await scanWebsite({
      url: referenceUrl,
      config,
      artifactDir,
      storageStatePath,
      headers,
      headed,
      insecure,
      flow: flow ? { ...flow, startUrl: referenceUrl } : null,
      label: 'reference',
      onProgress,
    });
    comparison = compareScans(targetScan, reference, { mode: 'reference' });
  } else if (baselineFile) {
    const baselineAudit = readJson(path.resolve(baselineFile), 'baseline');
    comparison = compareAuditFiles({
      target: publicTarget(targetScan),
      captures: targetScan.captures,
    }, baselineAudit);
    reference = { ...publicTarget(baselineScan(baselineAudit)), captures: baselineScan(baselineAudit).captures || [] };
  }

  const completedAt = new Date();
  const runId = `${timestampId(startedAt)}-${slug(new URL(url).hostname)}-${stableHash(`${url}|${startedAt.toISOString()}`, 8)}`;
  const artifacts = { ...GENERATED_ARTIFACTS };
  const audit = {
    schemaVersion: '2.0',
    runId,
    configHash: stableHash(publicConfig(config), 24),
    executionStatus: 'completed',
    verdict: analysis.verdict,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    target: publicTarget(targetScan),
    resultOrganization: {
      ...resultOrganization,
      automaticDirectory: !output,
      format: 'output/YYYY-MM-DD/site/page/HH-MM-SS-mmmZ-hash',
    },
    runtime: {
      authenticatedState: storageStatePath ? path.basename(storageStatePath) : null,
      requestHeaderNames: Object.keys(headers).sort(),
      ignoreHTTPSErrors: !!insecure,
      headed: !!headed,
    },
    securityScope: {
      mode: 'passive-safe',
      automatedEvidence: [
        'HTTPS and mixed-content posture',
        'main-document security response headers and CSP',
        'cookie attributes with names hashed and values omitted',
        'form destinations, external resources, iframe boundaries, caching, and URL leakage signals',
      ],
      redaction: 'Cookie values, authorization headers, CSP nonces/hashes, typed field values, and recognized secret query values are not serialized into JSON. Screenshots can contain rendered sensitive content and require configured masks.',
      requiresAuthorizedActiveTesting: [
        'authentication and session abuse',
        'authorization, role boundaries, IDOR/BOLA, and server-side data access',
        'CSRF, injection, stored output, file upload, API, rate-limit, replay, race, and business-logic behavior',
      ],
    },
    config: publicConfig(config),
    flow: publicFlow(flow),
    captures: targetScan.captures,
    issues: analysis.issues,
    coverage: analysis.coverage,
    summary: analysis.summary,
    colorGrade: analysis.colorGrade,
    reference: reference ? {
      ...publicTarget(reference),
      captures: reference.captures,
    } : null,
    comparison,
    artifacts,
  };
  audit.framework = buildFrameworkAssessment(audit);
  audit.actionPlan = buildActionPlan(audit);
  audit.manualCases = buildManualCases(audit);
  audit.testCases = buildTestCases(audit);

  writeAtomic(path.join(artifactDir, artifacts.readme), renderPackageReadme(audit));
  writeJson(path.join(artifactDir, artifacts.inventory), inventoryFor(audit.captures));
  writeJson(path.join(artifactDir, artifacts.cases), audit.manualCases);
  writeJson(path.join(artifactDir, artifacts.testCases), audit.testCases);
  writeJson(path.join(artifactDir, artifacts.checklist), audit.framework);
  writeJson(path.join(artifactDir, artifacts.actionPlan), audit.actionPlan);
  writeJson(path.join(artifactDir, artifacts.audit), audit);
  writeJson(path.join(artifactDir, artifacts.manifest), buildManifest(audit));
  writeAtomic(path.join(artifactDir, artifacts.report), renderProfessionalHtmlReport(audit));
  writeAtomic(path.join(artifactDir, artifacts.reportMarkdown), renderMarkdownReport(audit));
  writeAtomic(path.join(artifactDir, artifacts.findingsCsv), renderFindingsCsv(audit));
  writeAtomic(path.join(artifactDir, artifacts.checklistCsv), renderChecklistCsv(audit));
  writeAtomic(path.join(artifactDir, artifacts.testCasesCsv), renderTestCasesCsv(audit));

  return {
    audit,
    outputDir: artifactDir,
    files: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, path.resolve(artifactDir, value)])),
  };
}

export function saveBaseline({ audit, outputDir }, name, { update = false } = {}) {
  if (!name) throw new Error('A baseline name is required.');
  const baselineDir = path.join(PACKAGE_ROOT, 'baselines', slug(name, 'baseline'));
  const baselineFile = path.join(baselineDir, 'baseline.json');
  if (fs.existsSync(baselineFile) && !update) {
    throw new Error(`Baseline "${name}" already exists. Pass --update to replace it explicitly.`);
  }
  mkdir(path.join(baselineDir, 'screenshots'));
  const portable = JSON.parse(JSON.stringify(audit));
  for (const collection of [portable.captures, portable.reference?.captures || []]) {
    for (const capture of collection) {
      if (!capture.screenshot) continue;
      const source = path.resolve(outputDir, capture.screenshot);
      const targetName = path.basename(capture.screenshot);
      const destination = path.join(baselineDir, 'screenshots', targetName);
      if (fs.existsSync(source)) fs.copyFileSync(source, destination);
      capture.screenshot = toPosix(path.join('screenshots', targetName));
    }
  }
  portable.artifacts = { baseline: 'baseline.json', screenshots: 'screenshots/' };
  writeJson(baselineFile, portable);
  return { name: slug(name, 'baseline'), directory: baselineDir, file: baselineFile, updated: fs.existsSync(baselineFile) && update };
}
