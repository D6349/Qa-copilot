import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  environmentNames,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const [requestedEnvironment, requestedTarget = 'all', ...options] = process.argv.slice(2);
const headed = options.includes('--headed');
const listOnly = options.includes('--list');
const unsupportedOptions = options.filter(
  (option) => option !== '--headed' && option !== '--list',
);

if (!requestedEnvironment || !environmentNames().includes(requestedEnvironment.toLowerCase())) {
  fail(
    'Usage: npm.cmd run env:run -- <dev|uat|live> '
    + '<all|flow|account|agents|tools|connectors|knowledge|guardrails|ui-components|product-tour|auth-login|auth-refresh|record-account|record-agents|record-tools|record-connectors|record-knowledge|record-guardrails|record-ui-components|record-product-tour> [--headed] [--list]',
  );
}

const targetScripts = {
  all: 'test:all',
  flow: 'test:flow',
  account: 'test:account',
  agents: 'test:agents',
  tools: 'test:tools',
  connectors: 'test:connectors',
  knowledge: 'test:knowledge',
  guardrails: 'test:guardrails',
  'ui-components': 'test:ui-components',
  'product-tour': 'test:product-tour',
  'auth-login': 'auth:login',
  'auth-refresh': 'auth:refresh',
  'record-account': 'record:account',
  'record-agents': 'record:agents',
  'record-tools': 'record:tools',
  'record-connectors': 'record:connectors',
  'record-knowledge': 'record:knowledge',
  'record-guardrails': 'record:guardrails',
  'record-ui-components': 'record:ui-components',
  'record-product-tour': 'record:product-tour',
};
const target = requestedTarget.toLowerCase();
const npmScript = targetScripts[target];
if (!npmScript) fail(`Unsupported environment target: ${requestedTarget}`);
if (unsupportedOptions.length > 0) {
  fail(`Unsupported option(s): ${unsupportedOptions.join(', ')}`);
}
if (headed && (target.startsWith('auth-') || target.startsWith('record-'))) {
  fail(`${target} already opens visible Chrome; remove --headed.`);
}
if (listOnly && (target.startsWith('auth-') || target.startsWith('record-'))) {
  fail(`${target} cannot be used with --list.`);
}

const childEnvironment = { ...process.env };
delete childEnvironment.BASE_URL;
delete childEnvironment.ENV_NAME;
childEnvironment.TARGET_ENV = requestedEnvironment.toLowerCase();
const selected = resolveEnvironmentProfile(childEnvironment);
childEnvironment.BASE_URL = selected.baseURL;

console.log(
  `[environment] ${selected.name} -> ${selected.baseURL} | target=${target}`,
);
const args = ['run', npmScript];
const forwarded = [
  ...(headed ? ['--headed'] : []),
  ...(listOnly ? ['--list'] : []),
];
if (forwarded.length > 0) args.push('--', ...forwarded);
const npmCli = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
const result = spawnSync(process.execPath, [npmCli, ...args], {
  cwd: suiteRoot,
  env: childEnvironment,
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

function fail(message) {
  console.error(message);
  process.exit(1);
}
