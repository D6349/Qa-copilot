import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveEnvironmentProfile } from './environment-profile.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDirectory, '..');
const environment = resolveEnvironmentProfile();
const reportDirectory = path.join(
  suiteRoot,
  'playwright-report',
  environment.name,
);
const cliPath = path.join(
  suiteRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);

console.log(`[report] ${environment.name} HTML -> ${reportDirectory}`);
const result = spawnSync(
  process.execPath,
  [cliPath, 'show-report', reportDirectory],
  {
    cwd: suiteRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
