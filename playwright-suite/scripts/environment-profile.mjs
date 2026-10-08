import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(scriptDir, '..');
dotenv.config({ path: path.join(suiteRoot, '.env') });
const registry = JSON.parse(
  fs.readFileSync(path.join(suiteRoot, 'config', 'environments.json'), 'utf8'),
);
const names = Object.freeze(Object.keys(registry.environments));

export function resolveEnvironmentProfile(environment = process.env) {
  const target = normalizeName(environment.TARGET_ENV, 'TARGET_ENV');
  const legacy = normalizeName(environment.ENV_NAME, 'ENV_NAME');
  if (target && legacy && target !== legacy) {
    throw new Error(
      `TARGET_ENV=${target} conflicts with ENV_NAME=${legacy}. `
      + 'Set only TARGET_ENV, or make both values identical.',
    );
  }

  const name = target || legacy || registry.defaultEnvironment;
  const registered = registry.environments[name];
  const expectedBaseURL = normalizeBaseURL(registered.baseURL);
  const loginURL = buildLoginURL(registered.authEntryURL, expectedBaseURL);
  const suppliedBaseURL = environment.BASE_URL?.trim();
  if (suppliedBaseURL) {
    const normalizedOverride = normalizeBaseURL(suppliedBaseURL);
    if (normalizedOverride !== expectedBaseURL) {
      throw new Error(
        `Environment mismatch: ${name} must use ${expectedBaseURL}, `
        + `but BASE_URL resolved to ${normalizedOverride}.`,
      );
    }
  }

  environment.TARGET_ENV = name;
  environment.ENV_NAME = name;
  environment.BASE_URL = expectedBaseURL;
  return Object.freeze({ name, baseURL: expectedBaseURL, loginURL });
}

export function resolveEnvironmentArtifactPath(
  suiteDirectory,
  ...segments
) {
  const { name } = resolveEnvironmentProfile();
  return path.resolve(suiteDirectory, 'test-results', name, ...segments);
}

export function resolveEnvironmentAuthPath(
  suiteDirectory,
  environment = process.env,
) {
  const { name } = resolveEnvironmentProfile(environment);
  const configured = environment.AUTH_STORAGE_PATH?.trim()
    || 'storage/{environment}/auth.json';
  const expanded = configured
    .replace(/\{\{ENV_NAME\}\}/g, name)
    .replace(/\{ENV_NAME\}/g, name)
    .replace(/\{environment\}/gi, name);
  const isolated = expanded === configured
    ? path.join(path.dirname(configured), name, path.basename(configured))
    : expanded;
  return path.isAbsolute(isolated)
    ? isolated
    : path.resolve(suiteDirectory, isolated);
}

export function environmentNames() {
  return [...names];
}

function normalizeName(raw, variableName) {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (!names.includes(value)) {
    throw new Error(
      `${variableName} must be ${names.join(', ')}; received "${raw}".`,
    );
  }
  return value;
}

function normalizeBaseURL(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`BASE_URL must be a valid absolute URL; received "${raw}".`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('BASE_URL must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('BASE_URL must not contain credentials.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('BASE_URL must be an origin only, without a path, query, or hash.');
  }
  return parsed.origin;
}

function buildLoginURL(authEntryURL, baseURL) {
  const entry = new URL(authEntryURL);
  if (entry.protocol !== 'https:' || entry.username || entry.password) {
    throw new Error('Authentication entry URLs must use HTTPS without credentials.');
  }
  entry.searchParams.set(
    'redir',
    Buffer.from(`${baseURL}/`, 'utf8').toString('base64'),
  );
  return entry.toString();
}
