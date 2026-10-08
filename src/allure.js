/**
 * Native Allure 2 result generation for the URL-driven UI/UX audit.
 *
 * The audit is not a Playwright Test run, so feeding it through
 * allure-playwright would invent execution semantics. Instead, this module
 * writes the documented Allure result files directly and uses the local
 * Allure CLI only for the final static HTML build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLURE_STATUSES = ['passed', 'failed', 'broken', 'skipped', 'unknown'];
const SEVERITY_RANK = { critical: 4, major: 3, minor: 2, info: 1 };

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function json(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeName(value, fallback = 'page') {
  const clean = text(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean || fallback;
}

export function mapAuditStatus(status) {
  switch (text(status).toLowerCase()) {
    case 'pass': return 'passed';
    case 'fail': return 'failed';
    case 'blocked': return 'broken';
    case 'review':
    case 'manual':
    case 'not-tested':
    case 'not-applicable':
      return 'skipped';
    default: return 'unknown';
  }
}

export function mapAuditSeverity(check = {}, relatedIssues = []) {
  const highest = relatedIssues.reduce((winner, issue) => (
    (SEVERITY_RANK[issue.severity] || 0) > (SEVERITY_RANK[winner] || 0)
      ? issue.severity : winner
  ), '');
  if (highest === 'critical') return 'blocker';
  if (highest === 'major') return 'critical';
  if (highest === 'minor') return 'normal';
  if (highest === 'info') return 'minor';
  if (check.status === 'blocked') return 'blocker';
  if (check.status === 'fail') return 'critical';
  if (check.status === 'not-applicable') return 'trivial';
  return 'normal';
}

function statusMessage(check, relatedCount) {
  const count = `${relatedCount} related finding${relatedCount === 1 ? '' : 's'}`;
  switch (check.status) {
    case 'fail': return `Objective UI/UX check failed: ${check.title}. ${count}.`;
    case 'blocked': return `UI/UX verification was blocked: ${check.title}. No pass is claimed.`;
    case 'review': return `Human review required: ${check.title}. ${count}; no automated pass is claimed.`;
    case 'manual': return `Manual verification required: ${check.title}. No automated pass is claimed.`;
    case 'not-tested': return `Not tested: ${check.title}. No pass is claimed.`;
    case 'not-applicable': return `Not applicable to the observed page: ${check.title}.`;
    default: return `Unknown audit status for ${check.title}. No pass is claimed.`;
  }
}

function compactLocation(location = {}) {
  return {
    captureId: location.captureId || null,
    url: location.url || null,
    checkpoint: location.checkpoint || null,
    theme: location.theme || null,
    viewport: location.viewport ? {
      name: location.viewport.name || null,
      width: location.viewport.width || null,
      height: location.viewport.height || null,
    } : null,
    selector: location.selector || null,
    stableKey: location.stableKey || null,
  };
}

function compactIssue(issue = {}) {
  return {
    id: issue.id || null,
    ruleId: issue.ruleId || null,
    class: issue.class || null,
    category: issue.category || null,
    status: issue.status || null,
    severity: issue.severity || null,
    confidence: issue.confidence || null,
    priority: issue.priority || null,
    title: issue.title || null,
    message: issue.message || null,
    location: compactLocation(issue.location),
    actual: issue.actual ?? null,
    expected: issue.expected ?? null,
    impact: issue.impact ?? null,
    recommendation: issue.recommendation ?? null,
    remediation: issue.remediation ?? null,
    verification: issue.verification ?? null,
    standards: issue.standards || [],
  };
}

function compactCapture(capture = {}) {
  return {
    captureId: capture.captureId || null,
    checkpoint: capture.checkpoint || null,
    theme: capture.theme || null,
    viewport: capture.viewport ? {
      name: capture.viewport.name || null,
      width: capture.viewport.width || null,
      height: capture.viewport.height || null,
      isMobile: !!capture.viewport.isMobile,
    } : null,
    url: capture.url || null,
    status: capture.status || null,
    screenshot: capture.screenshot || null,
  };
}

function representativeCaptureIds(captures) {
  const valid = captures.filter((capture) => capture.status === 'valid' && capture.screenshot);
  const picks = [];
  const take = (predicate) => {
    const capture = valid.find(predicate);
    if (capture && !picks.includes(capture.captureId)) picks.push(capture.captureId);
  };
  take((capture) => capture.theme === 'light' && capture.viewport?.isMobile);
  take((capture) => capture.theme === 'light' && !capture.viewport?.isMobile);
  take((capture) => capture.theme === 'dark' && capture.viewport?.isMobile);
  take((capture) => capture.theme === 'dark' && !capture.viewport?.isMobile);
  if (!picks.length && valid[0]) picks.push(valid[0].captureId);
  return picks;
}

function screenshotMime(extension) {
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  })[extension.toLowerCase()] || 'application/octet-stream';
}

function copyScreenshot({ capture, auditDirectory, resultsDirectory, pageUrl, copied }) {
  if (!capture?.screenshot || !auditDirectory) return null;
  const auditRoot = path.resolve(auditDirectory);
  const source = path.resolve(auditRoot, capture.screenshot);
  if (source !== auditRoot && !source.startsWith(`${auditRoot}${path.sep}`)) return null;
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return null;

  const extension = path.extname(source) || '.png';
  const targetName = `${hash(`${pageUrl}|${capture.captureId}|${capture.screenshot}`).slice(0, 32)}-attachment${extension}`;
  const target = path.join(resultsDirectory, targetName);
  if (!copied.has(targetName)) {
    fs.copyFileSync(source, target);
    copied.add(targetName);
  }
  const profile = [capture.viewport?.name, capture.theme, capture.checkpoint].filter(Boolean).join(' / ');
  return {
    name: `Screenshot - ${profile || capture.captureId}`,
    source: targetName,
    type: screenshotMime(extension),
  };
}

function checkDescription(check, relatedIssues, captureCount) {
  const verification = (check.verificationSteps || []).length
    ? check.verificationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
    : 'No separate verification steps were supplied.';
  const criteria = check.passCriteria || check.pass || 'No explicit criterion was supplied.';
  const applicability = check.appliesTo || check.applies || 'always';
  return [
    '### Audit result',
    `- **Source status:** ${check.status}`,
    `- **Method:** ${check.method || 'not specified'}`,
    `- **Pillar:** ${check.pillar || 'UI/UX'}`,
    `- **Applies to:** ${applicability}`,
    `- **Related findings:** ${relatedIssues.length}`,
    `- **Screenshot profiles attached:** ${captureCount}`,
    '',
    '### Pass criteria',
    criteria,
    '',
    '### Verification procedure',
    verification,
    '',
    '_Generated from the rendered-page audit. Manual and review checks are never represented as passes._',
  ].join('\n');
}

function standardsFor(check) {
  const candidates = [...(check.standards || []), ...(check.standard || [])];
  const seen = new Set();
  return candidates.filter((standard) => {
    if (!standard?.url || seen.has(standard.url)) return false;
    seen.add(standard.url);
    return true;
  });
}

function propertyValue(value) {
  return text(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([:=])/g, '\\$1');
}

function writeMetadata({ project, pages, resultsDirectory, generatedAt }) {
  const urls = unique(pages.map((entry) => entry.url || entry.audit?.target?.url));
  const viewportNames = unique(pages.flatMap((entry) => (
    entry.audit?.captures || []
  ).map((capture) => capture.viewport?.name)));
  const themes = unique(pages.flatMap((entry) => (
    entry.audit?.captures || []
  ).map((capture) => capture.theme)));
  const properties = [
    ['Project', project.name || 'QA Copilot delivery'],
    ['Framework', 'QA Copilot UI/UX Audit'],
    ['Evidence source', 'Rendered live DOM'],
    ['Security mode', 'Passive-safe'],
    ['Pages', urls.length],
    ['Viewports', viewportNames.join(', ')],
    ['Themes', themes.join(', ')],
    ['Generated', generatedAt],
  ].map(([key, value]) => `${propertyValue(key)}=${propertyValue(value)}`).join('\n');
  fs.writeFileSync(path.join(resultsDirectory, 'environment.properties'), `${properties}\n`);

  json(path.join(resultsDirectory, 'categories.json'), [
    {
      name: 'Objective UI/UX failures',
      matchedStatuses: ['failed'],
      messageRegex: '.*Objective UI/UX check failed.*',
    },
    {
      name: 'Blocked UI/UX verification',
      matchedStatuses: ['broken'],
      messageRegex: '.*UI/UX verification was blocked.*',
    },
  ]);
  json(path.join(resultsDirectory, 'executor.json'), {
    name: 'QA Copilot',
    type: 'qa-copilot',
    buildName: `${project.name || 'QA Copilot'} UI/UX delivery`,
    reportName: `${project.name || 'QA Copilot'} UI/UX Allure Report`,
  });
}

/**
 * Convert completed page-audit checks into Allure result files.
 */
export function writeAllureResults({
  project = {}, pages = [], resultsDirectory, clean = false, generatedAt = new Date().toISOString(),
}) {
  if (!resultsDirectory) throw new Error('An Allure results directory is required.');
  const output = path.resolve(resultsDirectory);
  if (clean && fs.existsSync(output)) {
    if (path.basename(output).toLowerCase() !== 'allure-results') {
      throw new Error(`Refusing to clean a directory not named allure-results: ${output}`);
    }
    fs.rmSync(output, { recursive: true, force: true });
  }
  fs.mkdirSync(output, { recursive: true });

  const copiedScreenshots = new Set();
  const counts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
  const perPage = [];
  let evidenceFiles = 0;
  let screenshotReferences = 0;
  let total = 0;

  for (const [pageIndex, pageResult] of pages.entries()) {
    const audit = pageResult.audit;
    const checks = audit?.framework?.checks || [];
    if (!audit || !checks.length) continue;

    const pageName = pageResult.page?.name || audit.target?.title || `Page ${pageIndex + 1}`;
    const pageUrl = pageResult.url || audit.target?.url || audit.target?.finalUrl || '';
    const issuesById = new Map((audit.issues || []).map((issue) => [issue.id, issue]));
    const captures = audit.captures || [];
    const capturesById = new Map(captures.map((capture) => [capture.captureId, capture]));
    const representative = representativeCaptureIds(captures);
    const pageCounts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
    const auditStart = Number.isFinite(Date.parse(audit.startedAt)) ? Date.parse(audit.startedAt) : Date.parse(generatedAt);

    for (const [checkIndex, check] of checks.entries()) {
      const resultStatus = mapAuditStatus(check.status);
      const status = ALLURE_STATUSES.includes(resultStatus) ? resultStatus : 'unknown';
      const relatedIssues = (check.relatedIssueIds || []).map((id) => issuesById.get(id)).filter(Boolean);
      let captureIds = unique(relatedIssues.map((issue) => issue.location?.captureId));
      if (check.id === 'CAP-001') captureIds = captures.filter((capture) => capture.screenshot).map((capture) => capture.captureId);
      else if (!captureIds.length && check.status !== 'not-applicable') captureIds = representative;

      const screenshotAttachments = captureIds
        .map((captureId) => copyScreenshot({
          capture: capturesById.get(captureId),
          auditDirectory: pageResult.auditDirectory,
          resultsDirectory: output,
          pageUrl,
          copied: copiedScreenshots,
        }))
        .filter(Boolean);
      screenshotReferences += screenshotAttachments.length;

      const evidenceSource = `${randomUUID()}-attachment.json`;
      json(path.join(output, evidenceSource), {
        schemaVersion: '1.0',
        project: { id: project.id || null, name: project.name || null },
        page: { id: pageResult.page?.id || null, name: pageName, url: pageUrl },
        audit: {
          runId: audit.runId || null,
          verdict: audit.verdict || null,
          startedAt: audit.startedAt || null,
          completedAt: audit.completedAt || null,
        },
        check,
        relatedFindings: relatedIssues.map(compactIssue),
        attachedCaptureProfiles: captureIds.map((id) => capturesById.get(id)).filter(Boolean).map(compactCapture),
      });
      evidenceFiles += 1;

      const uuid = randomUUID();
      const stableKey = `${project.name || project.id || 'project'}|${pageUrl}|${check.id}`;
      const standards = standardsFor(check);
      const start = Number.isFinite(auditStart) ? auditStart + checkIndex : Date.now() + checkIndex;
      const severity = mapAuditSeverity(check, relatedIssues);
      const labels = [
        { name: 'language', value: 'javascript' },
        { name: 'framework', value: 'QA Copilot UI/UX Audit' },
        { name: 'epic', value: 'UI/UX Testing' },
        { name: 'feature', value: check.pillar || 'UI/UX' },
        { name: 'story', value: check.title || check.id },
        { name: 'parentSuite', value: project.name || 'QA Copilot delivery' },
        { name: 'suite', value: pageName },
        { name: 'subSuite', value: check.pillar || 'UI/UX' },
        { name: 'package', value: `qa-copilot.uiux.${safeName(pageName)}` },
        { name: 'testClass', value: pageName },
        { name: 'testMethod', value: check.id },
        { name: 'severity', value: severity },
        { name: 'tag', value: 'uiux' },
        { name: 'tag', value: check.method || 'unspecified-method' },
        { name: 'tag', value: check.status || 'unknown' },
      ];
      try { labels.push({ name: 'host', value: new URL(pageUrl).host }); } catch { /* optional */ }

      const result = {
        uuid,
        historyId: hash(`history|${stableKey}`),
        testCaseId: hash(`case|${stableKey}`),
        name: `${check.id} - ${check.title}`,
        fullName: `QA Copilot.UIUX.${safeName(pageName)}.${check.id}`,
        description: checkDescription(check, relatedIssues, screenshotAttachments.length),
        status,
        stage: 'finished',
        steps: [],
        attachments: [
          ...screenshotAttachments,
          { name: 'Check evidence and related findings', source: evidenceSource, type: 'application/json' },
        ],
        parameters: [
          { name: 'URL', value: pageUrl },
          { name: 'Audit status', value: check.status || 'unknown' },
          { name: 'Method', value: check.method || 'not specified' },
          { name: 'Pillar', value: check.pillar || 'UI/UX' },
          { name: 'Related findings', value: String(relatedIssues.length) },
          { name: 'Screenshot profiles', value: String(screenshotAttachments.length) },
        ],
        labels,
        links: standards.map((standard) => ({
          name: standard.label || standard.id || standard.url,
          url: standard.url,
          type: 'custom',
        })),
        start,
        stop: start + 1,
      };
      if (status !== 'passed') {
        result.statusDetails = { message: statusMessage(check, relatedIssues.length) };
      }
      json(path.join(output, `${uuid}-result.json`), result);
      counts[status] += 1;
      pageCounts[status] += 1;
      total += 1;
    }
    perPage.push({ name: pageName, url: pageUrl, total: checks.length, ...pageCounts });
  }

  writeMetadata({ project, pages, resultsDirectory: output, generatedAt });
  return {
    total,
    ...counts,
    pages: perPage,
    evidenceFiles,
    screenshotFiles: copiedScreenshots.size,
    screenshotReferences,
    resultsDirectory: output,
  };
}

export function findAllureLauncher(searchRoot = PROJECT_ROOT) {
  const candidates = unique([
    process.env.ALLURE_COMMANDLINE_PATH,
    path.join(searchRoot, 'node_modules', 'allure-commandline', 'bin', 'allure'),
    path.join(PROJECT_ROOT, 'node_modules', 'allure-commandline', 'bin', 'allure'),
    path.join(PROJECT_ROOT, 'playwright-suite', 'node_modules', 'allure-commandline', 'bin', 'allure'),
  ]).map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/** Build the static Allure HTML site without leaking CLI output onto stdout. */
export function generateAllureReport({ resultsDirectory, reportDirectory, searchRoot = PROJECT_ROOT }) {
  const results = path.resolve(resultsDirectory);
  const report = path.resolve(reportDirectory);
  const launcher = findAllureLauncher(searchRoot);
  if (!launcher) {
    return {
      generated: false,
      resultsDirectory: results,
      reportDirectory: report,
      index: null,
      error: 'The Allure CLI is not installed. Run npm install in the QA Copilot root.',
    };
  }

  const execution = spawnSync(
    process.execPath,
    [launcher, 'generate', results, '--clean', '-o', report],
    {
      cwd: searchRoot,
      env: process.env,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const combinedOutput = [execution.stderr, execution.stdout].filter(Boolean).join('\n').trim();
  if (execution.error || execution.status !== 0) {
    return {
      generated: false,
      resultsDirectory: results,
      reportDirectory: report,
      index: null,
      launcher,
      error: execution.error?.message || combinedOutput || `Allure exited with code ${execution.status}.`,
    };
  }
  const index = path.join(report, 'index.html');
  if (!fs.existsSync(index)) {
    return {
      generated: false,
      resultsDirectory: results,
      reportDirectory: report,
      index: null,
      launcher,
      error: 'Allure completed but did not create index.html.',
    };
  }
  return {
    generated: true,
    resultsDirectory: results,
    reportDirectory: report,
    index,
    launcher,
    error: null,
  };
}
