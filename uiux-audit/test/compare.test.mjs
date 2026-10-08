import test from 'node:test';
import assert from 'node:assert/strict';

import { compareAuditFiles, compareScans } from '../src/compare.mjs';

const BASE_STYLES = Object.freeze({
  fontFamily: 'Inter, sans-serif',
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 24,
  letterSpacing: 0,
  color: 'rgb(17, 17, 17)',
  backgroundColor: 'rgb(255, 255, 255)',
  backgroundImage: 'none',
  borderColor: 'rgb(220, 220, 220)',
  borderRadius: 4,
});

function element(stableKey, overrides = {}) {
  return {
    stableKey,
    selector: overrides.selector || `#${stableKey.replace(/^.*=/, '')}`,
    tag: overrides.tag || 'div',
    role: overrides.role || '',
    accessibleName: overrides.accessibleName || '',
    text: overrides.text || '',
    box: {
      x: 10,
      y: 10,
      width: 200,
      height: 40,
      ...(overrides.box || {}),
    },
    styles: {
      ...BASE_STYLES,
      ...(overrides.styles || {}),
    },
  };
}

function tokens(overrides = {}) {
  return {
    fontFamilies: [{ value: 'Inter, sans-serif', count: 8 }],
    fontSizes: [{ value: 16, count: 8 }],
    colors: [
      { value: 'rgb(17, 17, 17)', count: 8 },
      { value: 'rgb(255, 255, 255)', count: 8 },
    ],
    spacing: [{ value: 8, count: 8 }],
    radii: [{ value: 4, count: 8 }],
    shadows: [{ value: '0 1px 2px rgba(0, 0, 0, 0.1)', count: 4 }],
    ...overrides,
  };
}

function capture({
  name = 'desktop',
  width = 1440,
  height = 900,
  theme = 'light',
  checkpoint = 'page',
  url = 'https://example.test/products',
  elements = [],
  tokenValues = tokens(),
} = {}) {
  return {
    captureId: `unstable-${name}-${theme}-${checkpoint}`,
    viewport: { name, width, height, isMobile: width < 768 },
    theme,
    checkpoint,
    url,
    elements,
    tokens: tokenValues,
    screenshot: 'C:\\private\\artifacts\\capture.png',
    capturedAt: '2026-09-24T10:30:00.000Z',
  };
}

function scan(captures, url = 'https://example.test/products') {
  return {
    url,
    finalUrl: url,
    browserVersion: 'unstable-version',
    scannedAt: '2026-09-24T10:30:00.000Z',
    artifactPath: 'C:\\private\\artifacts',
    captures,
  };
}

test('compares related captures by stableKey and applies geometry and style tolerances', () => {
  const reference = scan([capture({
    elements: [
      element('id=hero'),
      element('id=steady', { box: { x: 20, width: 300 } }),
      element('id=old'),
      element('id=action', { role: 'button', tag: 'button' }),
    ],
  })]);
  const target = scan([capture({
    elements: [
      element('id=new'),
      element('id=hero', {
        box: { x: 15, width: 211 },
        styles: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 18,
          color: 'rgb(35, 35, 35)',
          backgroundColor: 'rgb(248, 248, 248)',
          backgroundImage: 'url("C:/private/assets/hero.png")',
          borderRadius: 10,
        },
      }),
      element('id=action', { role: 'button', tag: 'button' }),
      element('id=steady', {
        box: { x: 22, width: 302 },
        styles: {
          fontSize: 16.5,
          lineHeight: 24.5,
          letterSpacing: 0.25,
          color: 'rgb(18, 17, 17)',
          borderRadius: 4.5,
        },
      }),
    ],
  })]);

  const result = compareScans(target, reference);

  assert.equal(result.mode, 'reference');
  assert.equal(result.reliability.semanticMatching, true);
  assert.equal(result.reliability.level, 'high');
  assert.deepEqual(result.summary.differences.byType, {
    added: 1,
    removed: 1,
    moved: 1,
    resized: 1,
    restyled: 1,
  });
  assert.equal(result.captures[0].dom.matchedStableKeys, 3);

  const heroDifferences = result.differences.filter((item) => item.stableKey === 'id=hero');
  assert.deepEqual(heroDifferences.map((item) => item.type), ['moved', 'resized', 'restyled']);
  const restyled = heroDifferences.find((item) => item.type === 'restyled');
  assert.deepEqual(
    restyled.changes.map((change) => `${change.group}:${change.property}`),
    [
      'font:fontFamily',
      'font:fontSize',
      'color:color',
      'background:backgroundColor',
      'background:backgroundImage',
      'radius:borderRadius',
    ],
  );
  assert.match(
    restyled.changes.find((change) => change.property === 'backgroundImage').target,
    /^asset:[a-f0-9]{12}$/,
  );
  assert.equal(result.differences.some((item) => item.stableKey === 'id=steady'), false);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private|artifact|screenshot|2026-09-24/i);
});

test('comparison output is deterministic when capture, element and token input order changes', () => {
  const reference = scan([
    capture({
      name: 'mobile',
      width: 390,
      height: 844,
      elements: [element('id=one'), element('id=two'), element('id=three')],
    }),
    capture({
      elements: [element('id=one'), element('id=two'), element('id=three')],
    }),
  ]);
  const target = structuredClone(reference);
  target.captures[0].elements[0].box.x = 20;
  target.captures[1].elements[2].styles.color = 'rgb(80, 80, 80)';

  const shuffledTarget = structuredClone(target);
  const shuffledReference = structuredClone(reference);
  shuffledTarget.captures.reverse();
  shuffledReference.captures.reverse();
  for (const value of [...shuffledTarget.captures, ...shuffledReference.captures]) {
    value.elements.reverse();
    for (const tokenList of Object.values(value.tokens)) tokenList.reverse();
  }

  assert.deepEqual(
    compareScans(shuffledTarget, shuffledReference),
    compareScans(target, reference),
  );
});

test('unrelated references suppress semantic element diffs and compare design-token profiles', () => {
  const reference = scan([capture({
    url: 'https://reference.test/home',
    elements: [element('id=reference-a'), element('id=reference-b'), element('id=reference-c')],
    tokenValues: tokens({
      fontFamilies: [
        { value: 'Inter, sans-serif', count: 10 },
        { value: 'Georgia, serif', count: 2 },
      ],
      fontSizes: [{ value: 16, count: 10 }],
      colors: [{ value: 'rgb(10, 10, 10)', count: 10 }],
      spacing: [{ value: 8, count: 10 }],
      radii: [{ value: 4, count: 10 }],
      shadows: [{ value: '0 1px 2px rgba(0, 0, 0, 0.1)', count: 10 }],
    }),
  })], 'https://reference.test/home');
  const target = scan([capture({
    url: 'https://target.test/dashboard',
    elements: [element('id=target-a'), element('id=target-b'), element('id=target-c')],
    tokenValues: tokens({
      fontFamilies: [
        { value: 'Inter, sans-serif', count: 9 },
        { value: 'Arial, sans-serif', count: 3 },
      ],
      fontSizes: [{ value: 16.4, count: 10 }],
      colors: [{ value: 'rgb(15, 10, 10)', count: 10 }],
      spacing: [{ value: 12, count: 10 }],
      radii: [{ value: 4.4, count: 10 }],
      shadows: [{ value: '0 4px 12px rgba(0, 0, 0, 0.2)', count: 10 }],
    }),
  })], 'https://target.test/dashboard');

  const result = compareScans(target, reference);

  assert.equal(result.reliability.semanticMatching, false);
  assert.equal(result.reliability.status, 'unreliable');
  assert.match(result.reliability.reason, /design-token profiles/i);
  assert.equal(result.summary.captures.tokenProfileCompared, 1);
  assert.equal(result.summary.elements.comparedSemantically, 0);
  assert.equal(result.differences.every((item) => item.type === 'token-profile'), true);
  assert.deepEqual(
    result.differences.map((item) => item.category),
    ['font-family', 'spacing', 'shadows'],
  );

  const profiles = Object.fromEntries(
    result.captures[0].tokenProfile.categories.map((profile) => [profile.category, profile]),
  );
  assert.equal(profiles['type-scale'].similarity, 1, 'near font sizes use the configured comparison tolerance');
  assert.equal(profiles.palette.similarity, 1, 'near colors are grouped for design-token comparison');
  assert.equal(profiles.radii.similarity, 1, 'near radii use the radius tolerance');
  assert.equal(profiles.spacing.similarity, 0);
  assert.ok(profiles['font-family'].similarity > 0 && profiles['font-family'].similarity < 1);
});

test('matches captures only by viewport name, theme and checkpoint and reports unmatched captures', () => {
  const sharedElements = [element('id=a'), element('id=b'), element('id=c')];
  const reference = scan([
    capture({ name: 'desktop', theme: 'light', checkpoint: 'page', elements: sharedElements }),
    capture({ name: 'mobile', width: 390, height: 844, theme: 'light', checkpoint: 'page', elements: sharedElements }),
  ]);
  const target = scan([
    capture({ name: 'desktop', theme: 'dark', checkpoint: 'page', elements: sharedElements }),
    capture({ name: 'desktop', theme: 'light', checkpoint: 'page', elements: sharedElements }),
  ]);

  const result = compareScans(target, reference);

  assert.deepEqual(result.captures.map((item) => [item.captureKey, item.status]), [
    ['desktop::dark::page', 'added'],
    ['desktop::light::page', 'matched'],
    ['mobile::light::page', 'removed'],
  ]);
  assert.deepEqual(result.summary.captures, {
    target: 2,
    reference: 2,
    matched: 1,
    added: 1,
    removed: 1,
    semanticCompared: 1,
    tokenProfileCompared: 0,
  });
  assert.deepEqual(result.differences.map((item) => item.type), [
    'capture-added',
    'capture-removed',
  ]);
});

test('compareAuditFiles accepts audit wrappers or JSON and selects baseline mode', () => {
  const elements = [element('id=a'), element('id=b'), element('id=c')];
  const currentScan = scan([capture({ elements })]);
  const baselineScan = scan([capture({ elements })]);
  const currentAudit = {
    generatedAt: '2026-09-24T10:30:00.000Z',
    audit: { scan: currentScan },
  };
  const baselineAudit = JSON.stringify({
    sourcePath: 'C:\\private\\baseline.json',
    scan: baselineScan,
  });

  const result = compareAuditFiles(currentAudit, baselineAudit);

  assert.equal(result.mode, 'baseline');
  assert.equal(result.reliability.semanticMatching, true);
  assert.equal(result.summary.differences.total, 0);
  assert.doesNotMatch(JSON.stringify(result), /generatedAt|sourcePath|baseline\.json/i);
});

test('rejects invalid scans and duplicate capture identities with readable errors', () => {
  assert.throws(
    () => compareScans({}, scan([])),
    /Target scan must contain a captures array/,
  );
  const duplicate = capture({ elements: [] });
  assert.throws(
    () => compareScans(scan([duplicate, structuredClone(duplicate)]), scan([])),
    /Duplicate target capture for desktop::light::page/,
  );
  assert.throws(
    () => compareAuditFiles('{not json}', { scan: scan([]) }),
    /Current audit is not valid JSON/,
  );
});
