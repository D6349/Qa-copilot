import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveEnvironmentProfile } from './environment-profile.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDirectory, '..');
const environment = resolveEnvironmentProfile();
const resultsDirectory = path.join(
  suiteRoot,
  'allure-results',
  environment.name,
);
const reportDirectory = path.join(
  suiteRoot,
  'allure-report',
  environment.name,
);

if (!fs.existsSync(resultsDirectory)) {
  throw new Error(
    `No ${environment.name} Allure results exist at ${resultsDirectory}. Run a normal test command first.`,
  );
}

const launcher = path.join(
  suiteRoot,
  'node_modules',
  'allure-commandline',
  'bin',
  'allure',
);
if (!fs.existsSync(launcher)) {
  throw new Error(
    'The local Allure CLI is missing. Run npm.cmd install before generating the report.',
  );
}

const generate = spawnSync(
  process.execPath,
  [launcher, 'generate', resultsDirectory, '--clean', '-o', reportDirectory],
  { cwd: suiteRoot, env: process.env, stdio: 'inherit', shell: false },
);
if (generate.error) throw generate.error;
if (generate.status !== 0) process.exit(generate.status ?? 1);

console.log(`[allure] ${environment.name} report -> ${reportDirectory}`);
if (!process.argv.includes('--open')) process.exit(0);

const open = spawnSync(
  process.execPath,
  [launcher, 'open', reportDirectory],
  { cwd: suiteRoot, env: process.env, stdio: 'inherit', shell: false },
);
if (open.error) throw open.error;
process.exit(open.status ?? 1);
