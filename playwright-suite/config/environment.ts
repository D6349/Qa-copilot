import path from 'node:path';
import registry from './environments.json';

export const SUITE_ROOT = path.resolve(__dirname, '..');
export type EnvironmentName = keyof typeof registry.environments;
export type AuthIdentity = 'owner' | 'user-access' | 'company-access';

export interface EnvironmentConfig {
  name: EnvironmentName;
  baseURL: string;
  loginUrl: string;
}

export const DEFAULT_ENVIRONMENT = registry.defaultEnvironment as EnvironmentName;
export const DEFAULT_APP_BASE_URL = registry.environments[DEFAULT_ENVIRONMENT].baseURL;

export interface AuthConfig {
  identity: AuthIdentity;
  environment: EnvironmentName;
  baseURL: string;
  loginUrl: string;
  validationUrl: string;
  storagePath: string;
  timeoutMs: number;
  manualTimeoutMs: number;
  forceLogin: boolean;
  usernameKey: string;
  passwordKey: string;
  username: string;
  password: string;
}

export function resolveEnvironmentConfig(
  environment: NodeJS.ProcessEnv = process.env,
): EnvironmentConfig {
  const target = normalizeEnvironmentName(environment.TARGET_ENV, 'TARGET_ENV');
  const legacy = normalizeEnvironmentName(environment.ENV_NAME, 'ENV_NAME');
  if (target && legacy && target !== legacy) {
    throw new Error(
      `TARGET_ENV=${target} conflicts with ENV_NAME=${legacy}. `
      + 'Set only TARGET_ENV, or make both values identical.',
    );
  }

  const name = target || legacy || DEFAULT_ENVIRONMENT;
  const registered = registry.environments[name];
  const expectedBaseURL = normalizeBaseURL(registered.baseURL);
  const loginUrl = buildLoginUrl(registered.authEntryURL, expectedBaseURL);
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
  return { name, baseURL: expectedBaseURL, loginUrl };
}

export function loadAuthConfig(
  baseURL?: string,
  identityOverride?: AuthIdentity,
): AuthConfig {
  const selected = resolveEnvironmentConfig();
  const identity = identityOverride || resolveAuthIdentity(process.env.AUTH_IDENTITY);
  const resolvedBaseURL = baseURL?.trim()
    ? validateEnvironmentBaseURL(baseURL, selected)
    : selected.baseURL;
  const { usernameKey: scopedUsernameKey, passwordKey: scopedPasswordKey } =
    credentialKeys(selected.name, identity);
  const hasScopedCredentials = Boolean(
    process.env[scopedUsernameKey] || process.env[scopedPasswordKey],
  );
  const sharedFallbackAllowed = identity === 'owner';
  const username = hasScopedCredentials || !sharedFallbackAllowed
    ? process.env[scopedUsernameKey]?.trim() || ''
    : process.env.TEST_USERNAME?.trim() || '';
  const password = hasScopedCredentials || !sharedFallbackAllowed
    ? process.env[scopedPasswordKey] || ''
    : process.env.TEST_PASSWORD || '';

  if (Boolean(username) !== Boolean(password)) {
    throw new Error(
      hasScopedCredentials
        ? `Set both ${scopedUsernameKey} and ${scopedPasswordKey} in `
          + 'playwright-suite/.env, or leave both empty.'
        : !sharedFallbackAllowed
          ? `Set both ${scopedUsernameKey} and ${scopedPasswordKey} in `
            + 'playwright-suite/.env, or leave both empty when a valid saved '
            + `${identity} session already exists.`
        : 'Set both TEST_USERNAME and TEST_PASSWORD in playwright-suite/.env, '
          + 'or leave both empty to use manual login.',
    );
  }

  return {
    identity,
    environment: selected.name,
    baseURL: resolvedBaseURL,
    loginUrl: selected.loginUrl,
    validationUrl: resolveUrl(
      process.env.AUTH_VALIDATE_PATH?.trim() || '/task',
      resolvedBaseURL,
    ),
    storagePath: resolveAuthStoragePath(identity),
    timeoutMs: readDuration('AUTH_TIMEOUT_MS', 60_000),
    manualTimeoutMs: readDuration('AUTH_MANUAL_TIMEOUT_MS', 600_000),
    forceLogin: process.env.AUTH_FORCE_LOGIN === '1',
    usernameKey: hasScopedCredentials || !sharedFallbackAllowed
      ? scopedUsernameKey
      : 'TEST_USERNAME',
    passwordKey: hasScopedCredentials || !sharedFallbackAllowed
      ? scopedPasswordKey
      : 'TEST_PASSWORD',
    username,
    password,
  };
}

export function resolveAuthStoragePath(
  identityOverride?: AuthIdentity,
): string {
  const { name } = resolveEnvironmentConfig();
  const identity = identityOverride || resolveAuthIdentity(process.env.AUTH_IDENTITY);
  if (identity !== 'owner') {
    return path.resolve(
      SUITE_ROOT,
      'storage',
      name,
      'identities',
      `${identity}.json`,
    );
  }
  const configured = process.env.AUTH_STORAGE_PATH?.trim()
    || 'storage/{environment}/auth.json';
  const expanded = expandEnvironmentToken(configured, name);
  const isolated = expanded === configured
    ? path.join(path.dirname(configured), name, path.basename(configured))
    : expanded;
  return path.isAbsolute(isolated)
    ? isolated
    : path.resolve(SUITE_ROOT, isolated);
}

export function resolveAuthIdentity(raw?: string): AuthIdentity {
  const identity = raw?.trim().toLowerCase() || 'owner';
  if (!['owner', 'user-access', 'company-access'].includes(identity)) {
    throw new Error(
      'AUTH_IDENTITY must be owner, user-access, or company-access.',
    );
  }
  return identity as AuthIdentity;
}

export function resolveSuitePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(SUITE_ROOT, value);
}

export function resolveEnvironmentArtifactPath(...segments: string[]): string {
  const { name } = resolveEnvironmentConfig();
  return path.resolve(SUITE_ROOT, 'test-results', name, ...segments);
}

function resolveUrl(value: string, baseURL: string): string {
  return new URL(value, baseURL).toString();
}

function buildLoginUrl(authEntryURL: string, baseURL: string): string {
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

function readDuration(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000) {
    throw new Error(`${name} must be an integer of at least 1000 milliseconds.`);
  }
  return value;
}

function normalizeEnvironmentName(
  raw: string | undefined,
  variableName: string,
): EnvironmentName | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (!(value in registry.environments)) {
    throw new Error(
      `${variableName} must be dev, uat, or live; received "${raw}".`,
    );
  }
  return value as EnvironmentName;
}

function normalizeBaseURL(raw: string): string {
  let parsed: URL;
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

function validateEnvironmentBaseURL(
  raw: string,
  selected: EnvironmentConfig,
): string {
  const normalized = normalizeBaseURL(raw);
  if (normalized !== selected.baseURL) {
    throw new Error(
      `Authentication URL mismatch: ${selected.name} must use `
      + `${selected.baseURL}, but received ${normalized}.`,
    );
  }
  return normalized;
}

function expandEnvironmentToken(value: string, name: EnvironmentName): string {
  return value
    .replace(/\{\{ENV_NAME\}\}/g, name)
    .replace(/\{ENV_NAME\}/g, name)
    .replace(/\{environment\}/gi, name);
}

function credentialKeys(
  environment: EnvironmentName,
  identity: AuthIdentity,
): { usernameKey: string; passwordKey: string } {
  const prefix = environment.toUpperCase();
  if (identity === 'user-access') {
    return {
      usernameKey: `${prefix}_USER_ACCESS_TEST_USERNAME`,
      passwordKey: `${prefix}_USER_ACCESS_TEST_PASSWORD`,
    };
  }
  if (identity === 'company-access') {
    return {
      usernameKey: `${prefix}_COMPANY_ACCESS_TEST_USERNAME`,
      passwordKey: `${prefix}_COMPANY_ACCESS_TEST_PASSWORD`,
    };
  }
  return {
    usernameKey: `${prefix}_TEST_USERNAME`,
    passwordKey: `${prefix}_TEST_PASSWORD`,
  };
}
