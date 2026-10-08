import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEnvironmentAuthPath,
  resolveEnvironmentProfile,
} from './environment-profile.mjs';

const suiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = {
  dev: {
    baseURL: 'https://junedev.ledgers.cloud',
    authOrigin: 'https://dev-v4.ledgers.cloud',
  },
  uat: {
    baseURL: 'https://juneuat.ledgers.cloud',
    authOrigin: 'https://uat-v4.ledgers.cloud',
  },
  live: {
    baseURL: 'https://june.ledgers.cloud',
    authOrigin: 'https://ledgers.cloud',
  },
};
const results = [];

for (const [name, expectedEnvironment] of Object.entries(expected)) {
  const { baseURL, authOrigin } = expectedEnvironment;
  const environment = { TARGET_ENV: name };
  const profile = resolveEnvironmentProfile(environment);
  const authPath = resolveEnvironmentAuthPath(suiteRoot, environment);
  const loginURL = new URL(profile.loginURL);
  const redirect = Buffer.from(
    loginURL.searchParams.get('redir') || '',
    'base64',
  ).toString('utf8');
  assert.equal(profile.name, name);
  assert.equal(profile.baseURL, baseURL);
  assert.equal(loginURL.origin, authOrigin);
  assert.equal(loginURL.pathname, '/in/ai-agents');
  assert.equal(redirect, `${baseURL}/`);
  assert(authPath.endsWith(path.join('storage', name, 'auth.json')));
  results.push({ name, baseURL, loginURL: profile.loginURL, authPath });
}

assert.throws(
  () => resolveEnvironmentProfile({
    TARGET_ENV: 'dev',
    BASE_URL: expected.live.baseURL,
  }),
  /Environment mismatch/,
);
assert.throws(
  () => resolveEnvironmentProfile({ TARGET_ENV: 'production' }),
  /must be dev, uat, live/,
);

console.log(JSON.stringify({ ok: true, environments: results }, null, 2));
