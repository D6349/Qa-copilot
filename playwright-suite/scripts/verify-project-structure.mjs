import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDirectory, '..');
const registry = readJson('config/modules.json');
const packageJson = readJson('package.json');
const modules = registry.modules;

assert.equal(registry.schemaVersion, 1, 'Unsupported module registry schema');
assert.equal(modules.length, 8, 'The framework must register exactly eight modules');
assert.equal(
  modules.reduce((total, module) => total + module.caseCount, 0),
  registry.expectedAutomatedCases,
  'Registered module case counts do not match expectedAutomatedCases',
);

assertUnique(modules.map((module) => module.slug), 'module slug');
assertUnique(modules.map((module) => module.casePrefix), 'case prefix');

for (const module of modules) {
  for (const key of [
    'spec',
    'pageObject',
    'caseCatalog',
    'dataWorkbook',
    'uiUxWorkbook',
  ]) {
    const relativePath = module[key];
    assert(
      typeof relativePath === 'string' && !path.isAbsolute(relativePath),
      `${module.slug}.${key} must be a repository-relative path`,
    );
    assert(
      fs.existsSync(path.resolve(suiteRoot, relativePath)),
      `${module.slug}.${key} is missing: ${relativePath}`,
    );
  }

  for (const command of [
    `prepare:${module.slug}:data`,
    `data:${module.slug}:check`,
    `test:${module.slug}`,
    `test:${module.slug}:headed`,
    `report:verify:${module.slug}`,
    `report:verify:${module.slug}:partial`,
    `record:${module.slug}`,
  ]) {
    assert(
      packageJson.scripts[command],
      `${module.slug} is missing package command ${command}`,
    );
  }
}

for (const directory of [
  'config',
  'docs',
  'fixtures',
  'pages',
  'reporters',
  'scripts',
  'test-cases',
  'test-data',
  'test-data/Workbook',
  'tests',
  'utils',
]) {
  assert(
    fs.statSync(path.resolve(suiteRoot, directory)).isDirectory(),
    `Required project directory is missing: ${directory}`,
  );
}

assert(packageJson.scripts['test:all'], 'Missing true all-module command test:all');
assert(packageJson.scripts['test:cross-browser'], 'Missing cross-browser compatibility command');
assert(packageJson.scripts['report:verify:all'], 'Missing strict all-module report verification');
assert(packageJson.scripts['report:verify:tagged'], 'Missing partial/tagged report verification');

console.log(JSON.stringify({
  ok: true,
  modules: modules.map((module) => ({
    slug: module.slug,
    cases: module.caseCount,
    spec: module.spec,
  })),
  automatedCases: registry.expectedAutomatedCases,
  requiredModuleCommands: modules.length * 7,
}, null, 2));

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(suiteRoot, relativePath), 'utf8'),
  );
}

function assertUnique(values, label) {
  assert.equal(
    new Set(values).size,
    values.length,
    `Duplicate ${label} detected`,
  );
}
