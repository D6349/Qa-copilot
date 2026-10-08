import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveEnvironmentAuthPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
const moduleName = (process.argv[2] || '').toLowerCase();
const modules = {
  account: {
    route: '/task',
    output: 'tests/account/recorded-switch-account-flow.recording.ts',
  },
  agents: {
    route: '/agents',
    output: 'tests/agents/recorded-agents-flow.recording.ts',
  },
  tools: {
    route: '/tools',
    output: 'tests/tools/recorded-tools-flow.recording.ts',
  },
  connectors: {
    route: '/connectors',
    output: 'tests/connectors/recorded-connectors-flow.recording.ts',
  },
  knowledge: {
    route: '/knowledge-base',
    output: 'test-results/{environment}/recordings/recorded-knowledge-flow.recording.ts',
  },
  guardrails: {
    route: '/guardrails',
    output: 'tests/guardrails/recorded-guardrails-flow.recording.ts',
  },
  'ui-components': {
    route: '/ui-components',
    output: 'tests/ui-components/recorded-ui-components-flow.recording.ts',
  },
  'product-tour': {
    route: '/task',
    output: 'test-results/{environment}/recordings/recorded-new-module-tour.recording.ts',
  },
};
const selectedModule = modules[moduleName];
if (!selectedModule) {
  throw new Error(
    'Recorder module must be account, agents, tools, connectors, knowledge, guardrails, ui-components, or product-tour.',
  );
}

const environment = resolveEnvironmentProfile();
const storagePath = resolveEnvironmentAuthPath(suiteRoot);
const recorderOutput = selectedModule.output.replaceAll('{environment}', environment.name);
const npmCli = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
const authResult = spawnSync(process.execPath, [npmCli, 'run', 'auth:ensure'], {
  cwd: suiteRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});
if (authResult.error) throw authResult.error;
if (authResult.status !== 0) process.exit(authResult.status ?? 1);
if (!fs.existsSync(storagePath)) {
  throw new Error(
    `No ${environment.name} session exists at ${storagePath}. `
    + `Run npm.cmd run auth:login:${environment.name} first.`,
  );
}

const cliPath = path.join(
  suiteRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);
fs.mkdirSync(
  path.dirname(path.resolve(suiteRoot, recorderOutput)),
  { recursive: true },
);
const result = spawnSync(process.execPath, [
  cliPath,
  'codegen',
  '--channel=chrome',
  `--load-storage=${storagePath}`,
  `--save-storage=${storagePath}`,
  '--target=playwright-test',
  `--output=${path.resolve(suiteRoot, recorderOutput)}`,
  new URL(selectedModule.route, environment.baseURL).toString(),
], {
  cwd: suiteRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
