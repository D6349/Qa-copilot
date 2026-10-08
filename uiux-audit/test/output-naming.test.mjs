import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { PACKAGE_ROOT } from '../src/config.mjs';
import { defaultOutputDirectory, resultFolderParts } from '../src/run.mjs';

const fixed = new Date('2026-09-28T12:09:27.123Z');

function posix(value) {
  return value.split(path.sep).join('/');
}

test('default output directories are organized by UTC date, site, page, and unique run', () => {
  const directory = defaultOutputDirectory(
    'https://Example.COM/products/eSign/?tenant=alpha#details',
    fixed,
  );
  const relative = posix(path.relative(PACKAGE_ROOT, directory));

  assert.match(relative, /^output\/2026-09-28\/example-com\/products-esign\/12-09-27-123Z-[a-f0-9]{8}$/);
});

test('URL-derived folders handle home pages, ports, queries, fragments, and secrets safely', () => {
  const home = resultFolderParts('https://example.com/', fixed);
  const port = resultFolderParts('http://localhost:4100/dashboard', fixed);
  const firstQuery = resultFolderParts('https://user:password@example.com/search?q=one&token=secret', fixed);
  const secondQuery = resultFolderParts('https://user:password@example.com/search?q=two&token=secret', fixed);
  const fragmentOnly = resultFolderParts('https://user:password@example.com/search?q=one&token=secret#result', fixed);

  assert.equal(home.page, 'home');
  assert.equal(port.site, 'localhost-4100');
  assert.equal(port.page, 'dashboard');
  assert.notEqual(firstQuery.run, secondQuery.run);
  assert.equal(firstQuery.run, fragmentOnly.run);
  assert.doesNotMatch(JSON.stringify(firstQuery), /password|secret|token/);
});

test('opaque international paths get stable hashed names and --label supplies a readable override', () => {
  const international = resultFolderParts('https://example.com/%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87', fixed);
  const labelled = resultFolderParts('https://example.com/items/8429137', fixed, 'Checkout Release 7');

  assert.match(international.page, /^page-[a-f0-9]{8}$/);
  assert.equal(labelled.page, 'checkout-release-7');
  assert.throws(() => resultFolderParts('https://example.com/', 'not-a-date'), /Invalid audit result date/);
});
