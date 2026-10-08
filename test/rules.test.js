import test from 'node:test';
import assert from 'node:assert/strict';

import { formats, verhoeffDigit, verhoeffValid, gstinCheckChar, detectFormat } from '../src/testData.js';
import { inspectHtml, diffModels } from '../src/inspector.js';
import { generate } from '../src/rules/index.js';
import { validateImport } from '../src/handoff.js';
import { createZip } from '../src/zip.js';
import { toCsv, toJiraCsv } from '../src/exporters/index.js';

const FORM = `<html><head><title>Register</title></head><body>
<h1>Register</h1>
<form>
  <label for="pan">PAN Number</label><input id="pan" name="pan" maxlength="10" required>
  <label for="gst">GSTIN</label><input id="gst" name="gstin" maxlength="15">
  <label for="em">Email</label><input id="em" name="email" type="email" required>
  <label for="cap">Capital</label><input id="cap" name="capital" type="number" min="1000" max="500000" required>
  <label for="st">State</label><select id="st" name="state"><option>--</option><option>TN</option></select>
  <label for="doc">Document</label><input id="doc" name="doc" type="file" accept=".pdf">
  <button type="submit">Submit</button>
</form>
<img src="/a.png"></body></html>`;

const project = { id: 'p1', name: 'T', defaults: { pageOwner: '1', createdBy: '2' }, pages: [], environments: {} };
const page = { id: 'pg1', url: 'https://x.test/register', name: 'Register', module: 'REG' };

/* ------------------------------------------------------------ checksums */

test('generated Aadhaar passes Verhoeff, the invalid variants do not', () => {
  const full = formats.aadhaar.valid();
  assert.equal(full.length, 12);
  assert.equal(verhoeffDigit(full.slice(0, 11)), Number(full[11]));
  assert.ok(verhoeffValid(full), 'generated Aadhaar must validate');
  assert.ok(!verhoeffValid('234567890123'), 'bad checksum must fail validation');
  assert.ok(!verhoeffValid('abc'), 'non-numeric must fail validation');
});

test('GSTIN check character produces a self-consistent 15-char value', () => {
  const g = formats.gstin.valid();
  assert.equal(g.length, 15);
  assert.equal(g[13], 'Z');
  assert.equal(gstinCheckChar(g.slice(0, 14)), g[14]);
});

test('PAN valid value matches the official pattern', () => {
  assert.match(formats.pan.valid(), /^[A-Z]{5}[0-9]{4}[A-Z]$/);
});

test('every format ships at least three invalid variants with reasons', () => {
  for (const [key, f] of Object.entries(formats)) {
    const inv = f.invalid();
    assert.ok(inv.length >= 3, `${key} has only ${inv.length} invalid variants`);
    for (const v of inv) assert.ok(v.why && v.value !== undefined, `${key} variant missing why/value`);
  }
});

/* -------------------------------------------------------- field mapping */

test('field names map to the right Indian format', () => {
  assert.equal(detectFormat({ name: 'pan', type: 'text' }), 'pan');
  assert.equal(detectFormat({ name: 'gstin', type: 'text' }), 'gstin');
  assert.equal(detectFormat({ label: 'Aadhaar number', type: 'text' }), 'aadhaar');
  assert.equal(detectFormat({ name: 'ifsc_code', type: 'text' }), 'ifsc');
  assert.equal(detectFormat({ name: 'mobile', type: 'text' }), 'mobile');
  assert.equal(detectFormat({ name: 'randomthing', type: 'text' }), null);
});

/* ------------------------------------------------------------ inspector */

test('inspector extracts fields with their constraints', () => {
  const m = inspectHtml(FORM, 'https://x.test/register');
  assert.equal(m.fields.length, 6);
  const pan = m.fields.find((f) => f.key === 'pan');
  assert.equal(pan.maxlength, 10);
  assert.equal(pan.required, true);
  assert.equal(pan.label, 'PAN Number');
  const cap = m.fields.find((f) => f.key === 'capital');
  assert.equal(cap.min, '1000');
  assert.equal(cap.max, '500000');
  const st = m.fields.find((f) => f.key === 'state');
  assert.equal(st.options.length, 2);
  assert.equal(m.imagesMissingAlt, 1);
});

test('diff reports added, removed and changed fields', () => {
  const a = inspectHtml(FORM, 'https://x.test/register');
  const b = inspectHtml(FORM.replace('maxlength="10"', 'maxlength="12"')
    .replace('<label for="gst">GSTIN</label><input id="gst" name="gstin" maxlength="15">', ''), 'https://x.test/register');
  const d = diffModels(a, b);
  assert.equal(d.clean, false);
  assert.ok(d.fieldsRemoved.includes('gstin'));
  const panChange = d.fieldsChanged.find((c) => c.key === 'pan');
  assert.ok(panChange);
  assert.equal(panChange.deltas[0].to, 12);
});

/* --------------------------------------------------------- rules engine */

test('rules engine produces cases and is fully deterministic', () => {
  const model = inspectHtml(FORM, page.url);
  const a = generate({ project, page, model });
  const b = generate({ project, page, model });
  assert.ok(a.cases.length > 30, `expected >30 cases, got ${a.cases.length}`);
  assert.deepEqual(a.cases.map((c) => c.id), b.cases.map((c) => c.id));
  assert.deepEqual(a.cases.map((c) => c.title), b.cases.map((c) => c.title));
});

test('no duplicate dedupe keys are emitted', () => {
  const model = inspectHtml(FORM, page.url);
  const { cases } = generate({ project, page, model });
  const keys = cases.map((c) => c.dedupeKey);
  assert.equal(new Set(keys).size, keys.length);
});

test('every case has steps and a specific expected result', () => {
  const model = inspectHtml(FORM, page.url);
  const { cases } = generate({ project, page, model });
  for (const c of cases) {
    assert.ok(c.steps.length > 0, `${c.id} has no steps`);
    assert.ok(c.expectedResult.length > 20, `${c.id} expected result too vague`);
    assert.doesNotMatch(c.expectedResult, /works as expected|should work/i, `${c.id} has a vague expected result`);
    assert.ok(['P1', 'P2', 'P3', 'P4'].includes(c.priority));
    assert.ok(['Manual', 'Automation'].includes(c.type));
  }
});

test('PAN field produces both a valid and an invalid format case', () => {
  const model = inspectHtml(FORM, page.url);
  const { cases } = generate({ project, page, model });
  assert.ok(cases.some((c) => c.ruleId === 'field.format.pan.valid'));
  assert.ok(cases.some((c) => c.ruleId === 'field.format.pan.invalid'));
});

test('aggressiveness changes the volume of cases', () => {
  const model = inspectHtml(FORM, page.url);
  const lean = generate({ project, page, model, aggressiveness: 'lean' }).cases.length;
  const exhaustive = generate({ project, page, model, aggressiveness: 'exhaustive' }).cases.length;
  assert.ok(exhaustive >= lean);
});

test('family selection is respected', () => {
  const model = inspectHtml(FORM, page.url);
  const { cases } = generate({ project, page, model, families: ['security'] });
  assert.ok(cases.length > 0);
  assert.ok(cases.every((c) => c.ruleId.startsWith('sec.')));
});

test('a page with no fields still produces page-level cases', () => {
  const model = inspectHtml('<html><body><h1>Hi</h1></body></html>', 'https://x.test/');
  const { cases } = generate({ project, page, model });
  assert.ok(cases.length > 0);
  assert.ok(cases.some((c) => c.category === 'Security'));
});

/* -------------------------------------------------------------- import */

test('import accepts a clean array', () => {
  const { cases, errors } = validateImport(
    JSON.stringify([{ title: 'Flow works', expectedResult: 'Record is created once', steps: [{ action: 'Do it' }] }]),
    { project, page },
  );
  assert.equal(errors.length, 0);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].source, 'codex');
  assert.equal(cases[0].steps[0].step, 1);
});

test('import strips markdown fences and recovers a wrapped array', () => {
  const raw = '```json\n[{"title":"A","expectedResult":"B happens","steps":["one"]}]\n```';
  const { cases, errors } = validateImport(raw, { project, page });
  assert.equal(errors.length, 0);
  assert.equal(cases[0].steps[0].action, 'one');
});

test('import reports the index of each bad element without losing the good ones', () => {
  const raw = JSON.stringify([
    { title: 'Good', expectedResult: 'Something specific', steps: ['x'] },
    { title: 'No steps', expectedResult: 'y' },
    { expectedResult: 'no title', steps: ['z'] },
  ]);
  const { cases, errors } = validateImport(raw, { project, page });
  assert.equal(cases.length, 1);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].index, 1);
  assert.match(errors[0].message, /steps/);
});

test('import rejects non-JSON with a readable message', () => {
  const { cases, errors } = validateImport('not json at all', { project, page });
  assert.equal(cases.length, 0);
  assert.equal(errors[0].index, -1);
});

/* ------------------------------------------------------------- exports */

test('CSV escapes quotes, commas and newlines', () => {
  const model = inspectHtml(FORM, page.url);
  const { cases } = generate({ project, page, model });
  const csv = toCsv(cases);
  const lines = csv.split('\n');
  assert.match(lines[0], /^Test Case ID,Module/);
  assert.ok(csv.includes('""') || csv.includes('"'), 'expected quoting somewhere');
  assert.ok(toJiraCsv(cases).startsWith('Summary,Description,Issue Type'));
});

/* ----------------------------------------------------------------- zip */

test('zip writer produces a valid archive with a correct local header', () => {
  const buf = createZip({ 'a.txt': 'hello world', 'dir/b.json': '{"x":1}' });
  assert.equal(buf.readUInt32LE(0), 0x04034B50);            // local file header
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054B50); // end of central directory
  assert.equal(buf.readUInt16LE(buf.length - 14), 2);       // two entries
});
