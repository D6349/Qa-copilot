#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  DEFAULT_CONFIG_PATH,
  PACKAGE_ROOT,
  loadConfig,
  parseThemeSelection,
  parseViewportSelection,
  validateConfig,
} from './src/config.mjs';
import { ensureHttpUrl, sanitizeUrl } from './src/core.mjs';
import { FRAMEWORK_VERSION, REFERENCES, frameworkChecks } from './src/framework.mjs';
import { loadFlow } from './src/flow.mjs';

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
const tokens = command === 'help' && argv[0]?.startsWith('-') ? argv : argv.slice(1);
const flags = {};
const positional = [];
for (let index = 0; index < tokens.length; index += 1) {
  const token = tokens[index];
  if (!token.startsWith('--')) {
    positional.push(token);
    continue;
  }
  const equalsAt = token.indexOf('=');
  const key = token.slice(2, equalsAt > -1 ? equalsAt : undefined);
  let value = equalsAt > -1 ? token.slice(equalsAt + 1) : true;
  if (equalsAt === -1 && tokens[index + 1] && !tokens[index + 1].startsWith('--')) value = tokens[++index];
  if (key in flags) flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
  else flags[key] = value;
}

const pretty = !!flags.pretty;
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
const progress = (message) => process.stderr.write(`${message}\n`);
const oneOrMany = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const DEFAULT_FINDING_PREVIEW_LIMIT = 25;

function parseHeaders(values) {
  const headers = {};
  for (const item of oneOrMany(values)) {
    const splitAt = String(item).indexOf(':');
    if (splitAt < 1) throw new Error(`Invalid --header value "${item}". Use "Name: value".`);
    const name = String(item).slice(0, splitAt).trim();
    const value = String(item).slice(splitAt + 1).trim();
    if (!name) throw new Error('A request header name cannot be empty.');
    headers[name] = value;
  }
  return headers;
}

function numberFlag(name, fallback) {
  if (!(name in flags)) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a positive number.`);
  return value;
}

function selectedConfig() {
  const config = loadConfig({ configPath: flags.config || DEFAULT_CONFIG_PATH });
  config.viewports = parseViewportSelection(flags.viewports || flags.viewport, config.viewports);
  config.themes = parseThemeSelection(flags.themes || flags.theme, config.themes);
  config.navigation.timeoutMs = numberFlag('timeout', config.navigation.timeoutMs);
  config.navigation.settleMs = numberFlag('wait', config.navigation.settleMs);
  config.capture.ignoreSelectors.push(...oneOrMany(flags.ignore).map(String));
  config.capture.maskSelectors.push(...oneOrMany(flags.mask).map(String));
  return validateConfig(config);
}

function gateResult(audit) {
  if (!flags['fail-on'] || flags['fail-on'] === 'none') return { enabled: false, passed: true };
  const threshold = String(flags['fail-on']).toLowerCase();
  if (threshold === 'fail') {
    const matches = audit.issues.filter((issue) => issue.status === 'fail');
    return { enabled: true, threshold, passed: matches.length === 0, matches: matches.length };
  }
  if (threshold === 'review') {
    return { enabled: true, threshold, passed: audit.issues.length === 0, matches: audit.issues.length };
  }
  const rank = { info: 1, minor: 2, major: 3, critical: 4 };
  if (!rank[threshold]) throw new Error('--fail-on must be one of: critical, major, minor, info, fail, review, none.');
  const matches = audit.issues.filter((issue) => rank[issue.severity] >= rank[threshold]);
  return { enabled: true, threshold, passed: matches.length === 0, matches: matches.length };
}

async function executeAudit({ requireComparison = false, saveAsBaseline = false } = {}) {
  const { runAudit, saveBaseline } = await import('./src/run.mjs');
  const rawUrl = positional[0];
  if (!rawUrl) throw new Error(`The ${command} command needs a URL.`);
  const url = ensureHttpUrl(rawUrl);
  const referenceUrl = flags.reference ? ensureHttpUrl(flags.reference, 'Reference URL') : null;
  const baselineFile = flags.baseline ? path.resolve(String(flags.baseline)) : null;
  if (referenceUrl && baselineFile) throw new Error('Use either --reference or --baseline, not both.');
  if (requireComparison && !referenceUrl && !baselineFile) {
    throw new Error('The compare command needs --reference <url> or --baseline <audit.json>.');
  }
  const flow = loadFlow(flags.flow);
  if (flow?.startUrl) flow.startUrl = ensureHttpUrl(flow.startUrl, 'Flow start URL');
  const config = selectedConfig();
  const result = await runAudit({
    url,
    config,
    output: flags.out,
    resultLabel: flags.label ? String(oneOrMany(flags.label).at(-1)) : null,
    overwrite: !!flags.overwrite,
    storageStatePath: flags['storage-state'] || flags.auth || null,
    headers: parseHeaders(flags.header),
    headed: !!flags.headed,
    insecure: !!flags.insecure,
    flow,
    referenceUrl,
    baselineFile,
    expectAuthenticated: !!flags['expect-authenticated'],
    onProgress: ({ event, label, viewport, theme }) => {
      if (event === 'profile-start') progress(`Auditing ${label}: ${viewport}, ${theme}…`);
    },
  });
  let baseline = null;
  if (saveAsBaseline) {
    if (result.audit.verdict === 'invalid-capture') throw new Error('An invalid capture cannot be accepted as a baseline.');
    baseline = saveBaseline(result, flags.name, { update: !!flags.update });
  }
  const qualityGate = gateResult(result.audit);
  const invalid = result.audit.verdict === 'invalid-capture';
  const allFindings = result.audit.issues || [];
  const outputFindings = flags.full
    ? allFindings
    : allFindings.slice(0, DEFAULT_FINDING_PREVIEW_LIMIT).map((issue) => ({
      id: issue.id,
      ruleId: issue.ruleId,
      status: issue.status,
      severity: issue.severity,
      title: issue.title,
      location: issue.location,
    }));

  print({
    ok: !invalid,
    executionStatus: invalid ? 'invalid-capture' : 'completed',
    verdict: result.audit.verdict,
    runId: result.audit.runId,
    url: result.audit.target.url,
    finalUrl: result.audit.target.finalUrl,
    outputDirectory: result.outputDir,
    organization: result.audit.resultOrganization,
    summary: result.audit.summary,
    coverage: result.audit.coverage,
    colorGrade: result.audit.colorGrade,
    releaseDecision: result.audit.actionPlan?.decision || null,
    actionPlan: {
      counts: result.audit.actionPlan?.counts || {},
      nextActions: result.audit.actionPlan?.nextActions || [],
    },
    framework: {
      version: result.audit.framework?.version || null,
      counts: result.audit.framework?.counts || {},
    },
    testCases: result.audit.testCases?.length || 0,
    comparison: result.audit.comparison?.summary || null,
    qualityGate,
    findingOutput: {
      total: allFindings.length,
      returned: outputFindings.length,
      omitted: Math.max(0, allFindings.length - outputFindings.length),
      allFindingsReturned: outputFindings.length === allFindings.length,
      completeRecords: !!flags.full,
      hint: flags.full ? null : 'Use --full for every complete finding, or read audit.json/findings.csv.',
    },
    findings: outputFindings,
    baseline,
    artifacts: result.files,
  });
  if (invalid || !qualityGate.passed) process.exitCode = 1;
}

const commands = {
  async help() {
    print({
      ok: true,
      name: 'Standalone UI/UX and Passive Security Audit',
      description: 'Audit any URL for rendered UI/UX, accessibility, content, and safe browser-visible security posture.',
      commands: {
        audit: 'audit <url> [--viewports names] [--themes light,dark] [--flow file] [--reference url] [--baseline file]',
        compare: 'compare <url> (--reference <url> | --baseline <audit.json>)',
        baseline: 'baseline <url> --name <name> [--update]',
        framework: 'framework',
        auth: 'auth <login-url> --out <storage-state.json>',
        doctor: 'doctor',
      },
      options: {
        '--config': 'JSON configuration file',
        '--viewports': 'Comma-separated configured names or WIDTHxHEIGHT values',
        '--themes': 'light,dark,no-preference',
        '--storage-state': 'Playwright authentication state file',
        '--header': 'Repeatable request header in "Name: value" form',
        '--mask': 'Repeatable CSS selector masked in screenshots',
        '--ignore': 'Repeatable CSS selector excluded from inspection',
        '--insecure': 'Accept an invalid TLS certificate',
        '--headed': 'Show Chromium while auditing',
        '--label': 'Optional safe page-folder label for dynamic or opaque URL paths',
        '--out': 'Explicit output directory; otherwise use output/YYYY-MM-DD/site/page/run',
        '--fail-on': 'CI gate: critical|major|minor|info|fail|review|none',
        '--full': 'Return every complete finding in stdout; default returns at most 25 compact findings',
        '--pretty': 'Indent JSON stdout',
      },
    });
  },

  async doctor() {
    const requiredNodeMajor = 20;
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    const nodeSupported = Number.isFinite(nodeMajor) && nodeMajor >= requiredNodeMajor;
    const dependencyNames = ['axe-core', 'cspell-lib', 'exceljs', 'playwright'];
    const packages = {};
    for (const dependency of dependencyNames) {
      try {
        await import(dependency);
        packages[dependency] = true;
      } catch {
        packages[dependency] = false;
      }
    }
    const allDependenciesInstalled = Object.values(packages).every(Boolean);

    let configOk = true;
    let configError = null;
    try { loadConfig({ configPath: flags.config || DEFAULT_CONFIG_PATH }); } catch (error) {
      configOk = false;
      configError = error.message;
    }

    let packageRootWritable = true;
    let filesystemError = null;
    try {
      fs.accessSync(PACKAGE_ROOT, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      packageRootWritable = false;
      filesystemError = error.message;
    }

    const requiredBrowserNames = ['chromium', 'firefox', 'webkit'];
    const browserStatus = {};
    if (packages.playwright) {
      const { chromium, firefox, webkit } = await import('playwright');
      for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
        let executable = null;
        try { executable = browserType.executablePath(); } catch { /* represented as unavailable */ }
        const status = {
          executable,
          installed: !!executable && fs.existsSync(executable),
          required: true,
          launchable: false,
          launchError: null,
        };
        if (status.installed) {
          let browser = null;
          try {
            browser = await browserType.launch({ headless: true });
            await browser.close();
            browser = null;
            status.launchable = true;
          } catch (error) {
            status.launchError = String(error.message || error);
          } finally {
            if (browser) await browser.close().catch(() => {});
          }
        }
        browserStatus[name] = status;
      }
    }

    const chromium = browserStatus.chromium || { executable: null, installed: false, required: true };
    const requiredBrowsersReady = requiredBrowserNames.every((name) => (
      browserStatus[name]?.installed && browserStatus[name]?.launchable
    ));
    const ok = nodeSupported
      && allDependenciesInstalled
      && configOk
      && packageRootWritable
      && requiredBrowsersReady;
    print({
      ok,
      node: process.version,
      packageRoot: PACKAGE_ROOT,
      requirements: {
        node: { required: '>=20.0.0', supported: nodeSupported },
      },
      dependencies: {
        allInstalled: allDependenciesInstalled,
        packages,
      },
      filesystem: {
        packageRootWritable,
        error: filesystemError,
      },
      playwright: {
        chromiumExecutable: chromium.executable,
        browserInstalled: chromium.installed,
        browserLaunchable: !!chromium.launchable,
        browserLaunchError: chromium.launchError || null,
        crossBrowserReady: requiredBrowsersReady,
        requiredBrowsers: requiredBrowserNames,
        browsers: browserStatus,
      },
      config: {
        file: path.resolve(flags.config || DEFAULT_CONFIG_PATH),
        valid: configOk,
        error: configError,
      },
      independentFromQaProjects: true,
    });
    if (!ok) process.exitCode = 1;
  },

  async framework() {
    const checks = frameworkChecks();
    print({
      ok: true,
      version: FRAMEWORK_VERSION,
      approach: 'Evidence-first; objective automation, passive security posture, human judgement, and authorized active testing are reported separately.',
      references: Object.values(REFERENCES),
      counts: {
        checks: checks.length,
        automated: checks.filter((check) => check.method === 'automated').length,
        hybrid: checks.filter((check) => check.method === 'hybrid').length,
        manual: checks.filter((check) => check.method === 'manual').length,
      },
      checks,
    });
  },

  async audit() { await executeAudit(); },
  async compare() { await executeAudit({ requireComparison: true }); },
  async baseline() {
    if (!flags.name) throw new Error('The baseline command needs --name <name>.');
    await executeAudit({ saveAsBaseline: true });
  },

  async auth() {
    const { captureAuthState } = await import('./src/auth.mjs');
    const rawUrl = positional[0];
    if (!rawUrl) throw new Error('The auth command needs a login URL.');
    const url = ensureHttpUrl(rawUrl, 'Login URL');
    const out = flags.out || path.join(PACKAGE_ROOT, '.auth', `${new URL(url).hostname}.json`);
    progress('A browser will open. Complete sign-in, then return to this terminal and press Enter.');
    const result = await captureAuthState({ url, out, insecure: !!flags.insecure });
    print({ ok: true, file: result.file, finalUrl: sanitizeUrl(result.finalUrl) });
  },
};

try {
  const handler = commands[command];
  if (!handler) throw new Error(`Unknown command "${command}". Run "node uiux-audit/cli.mjs help".`);
  await handler();
} catch (error) {
  progress(`UI/UX audit error: ${error.message}`);
  print({
    ok: false,
    executionStatus: 'failed',
    error: {
      name: error.name || 'Error',
      message: String(error.message || error),
    },
  });
  process.exitCode = 1;
}
