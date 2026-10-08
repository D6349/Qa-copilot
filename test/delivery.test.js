import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectHtml } from '../src/inspector.js';
import { generate } from '../src/rules/index.js';
import {
  normalizeUrls, classifyPageModel, surfaceInventory, compareDeliveryPages,
  summarizeDelivery, renderSimpleDeliveryHtml, deliveryLayout, caseExecutionMatrix,
} from '../src/delivery.js';

const project = {
  id: 'project-delivery',
  name: 'Delivery test',
  defaults: {},
  pages: [],
  environments: {},
};

const page = {
  id: 'page-delivery',
  name: 'Observed page',
  url: 'https://example.test/observed',
  module: 'OBSERVED',
};

test('URL normalization deduplicates valid HTTP URLs and reports invalid input', () => {
  const result = normalizeUrls([
    'https://example.test/a',
    'https://example.test/a',
    'ftp://example.test/file',
    'not a URL',
  ]);
  assert.deepEqual(result.urls, ['https://example.test/a']);
  assert.equal(result.errors.length, 2);
});

test('page classification excludes login and empty captures from coverage', () => {
  const login = inspectHtml('<html><body><input type="password" name="password"></body></html>', page.url);
  assert.equal(classifyPageModel(login).code, 'login-page');
  assert.equal(classifyPageModel(login).coverageValid, false);

  const empty = inspectHtml('<html><body></body></html>', page.url);
  assert.equal(classifyPageModel(empty).code, 'empty');
  assert.equal(classifyPageModel(empty).coverageValid, false);

  const table = inspectHtml('<html><body><h1>Records</h1><table><tr><th>Name</th></tr></table></body></html>', page.url);
  assert.equal(classifyPageModel(table).code, 'list-table');
  assert.equal(classifyPageModel(table).coverageValid, true);
});

test('public read-only pages do not receive invented IDOR, session, form-error, or duplicate-submit cases', () => {
  const model = inspectHtml(`
    <html><body><h1>Public information</h1>
    <button>Get Started</button><a href="/details">Details</a></body></html>
  `, page.url);
  const { cases } = generate({ project, page, model });
  const rules = new Set(cases.map((item) => item.ruleId));
  assert.ok(rules.has('sec.exposure.public'));
  assert.ok(rules.has('sec.transport.headers'));
  assert.ok(!rules.has('sec.authz.idor'));
  assert.ok(!rules.has('sec.session.timeout'));
  assert.ok(!rules.has('a11y.errors'));
  assert.ok(!rules.has('ui.buttons.doubleClick'));
  assert.ok(rules.has('ui.navigation.history'));
});

test('record mutation surfaces receive authorization, session, CSRF, and duplicate-submit coverage', () => {
  const model = inspectHtml(`
    <html><body><h1>Edit record</h1><form>
    <label for="id">Record ID</label><input id="id" name="record_id">
    <label for="name">Name</label><input id="name" name="name">
    <button type="submit">Save</button></form></body></html>
  `, page.url);
  const { cases } = generate({ project, page, model });
  const rules = new Set(cases.map((item) => item.ruleId));
  assert.ok(rules.has('sec.authz.directUrl'));
  assert.ok(rules.has('sec.authz.idor'));
  assert.ok(rules.has('sec.session.timeout'));
  assert.ok(rules.has('sec.csrf'));
  assert.ok(rules.has('sec.data.browserExposure'));
  assert.ok(rules.has('ui.buttons.doubleClick'));
});

test('telemetry is excluded from API coverage while observed business APIs are retained', () => {
  const model = inspectHtml('<html><body><h1>Page</h1></body></html>', page.url);
  model.network = [{
    resourceType: 'fetch', method: 'POST', url: 'https://google-analytics.com/collect',
  }];
  assert.equal(generate({ project, page, model, families: ['api'] }).cases.length, 0);
  model.network.push({
    resourceType: 'fetch', method: 'POST', url: 'https://example.test/api/v1/documents',
  });
  const apiCases = generate({ project, page, model, families: ['api'] }).cases;
  assert.equal(apiCases.length, 3);
  assert.ok(apiCases.every((item) => item.testData.endpoints.includes('/api/v1/documents')));
});

test('observed date columns receive source, timezone, format, and sorting coverage', () => {
  const model = inspectHtml(`
    <html><body><h1>Documents</h1><table>
    <thead><tr><th>Name</th><th>Date modified</th></tr></thead>
    <tbody><tr><td>A</td><td>24-09-2026 12:15</td></tr></tbody>
    </table></body></html>
  `, page.url);
  const { cases } = generate({ project, page, model, families: ['interaction'] });
  assert.ok(cases.some((item) => item.ruleId === 'data.table.dateTime'));
});

test('cross-page comparison separates common and unique finding families', () => {
  const makePage = (name, issues, model) => ({
    page: { name },
    classification: { coverageValid: true },
    inventory: surfaceInventory(model),
    model,
    audit: { issues },
  });
  const issue = (ruleId, title) => ({
    ruleId, title, category: 'Accessibility', severity: 'major', status: 'fail', recommendation: 'Fix it',
  });
  const pages = [
    makePage('A', [issue('a11y.name', 'Name controls'), issue('layout.clip', 'Clipped content')], {
      fields: [{}], buttons: [{ text: 'Shared action' }, { text: 'Only A' }],
    }),
    makePage('B', [issue('a11y.name', 'Name controls')], {
      tables: [{}], buttons: [{ text: 'Shared action' }],
    }),
  ];
  const comparison = compareDeliveryPages(pages);
  assert.equal(comparison.commonIssues[0].ruleId, 'a11y.name');
  assert.equal(comparison.uniqueIssues[0].ruleId, 'layout.clip');
  assert.ok(comparison.surfaces.some((entry) => entry.key === 'fields' && entry.status === 'unique'));
  assert.ok(comparison.surfaces.some((entry) => entry.key === 'buttons' && entry.status === 'count-mismatch'));
  assert.ok(comparison.clickables.some((entry) => entry.label === 'Shared action' && entry.scope === 'common'));
  assert.ok(comparison.clickables.some((entry) => entry.label === 'Only A' && entry.scope === 'unique'));
});

test('single report leads with one clear decision and hides technical report links', () => {
  const pages = [{
    page: { name: 'Page A' },
    url: 'https://example.test/a',
    classification: { coverageValid: true },
    inventory: { buttons: 1 },
    model: { buttons: [{ text: 'Continue' }] },
    caseCount: 2,
    audit: {
      verdict: 'not-ready',
      actionPlan: { decision: 'NOT READY' },
      coverage: { captures: { valid: 4 } },
      issues: [{
        ruleId: 'contrast.text', title: 'Text contrast is too low', category: 'Accessibility',
        severity: 'major', status: 'fail', recommendation: 'Increase text contrast.',
      }],
    },
  }];
  const cases = [{ category: 'Accessibility', priority: 'P1' }, { category: 'UI/UX', priority: 'P2' }];
  const comparison = compareDeliveryPages(pages);
  const summary = summarizeDelivery(pages, cases, comparison);
  assert.equal(summary.overallStatus, 'NOT READY');
  assert.equal(summary.screenshots, 4);
  assert.equal(summary.fixFamilies.length, 1);

  const html = renderSimpleDeliveryHtml({
    project, pages, cases, comparison, reportDirectory: process.cwd(),
    run: { generatedLocal: '1 October 2026 at 15:38', timezone: 'Asia/Calcutta' },
  });
  assert.match(html, /single clear report/);
  assert.match(html, /Overall result: NOT READY/);
  assert.match(html, /What is different or missing\?/);
  assert.doesNotMatch(html, /Open the complete per-page evidence report/);
  assert.doesNotMatch(html, /<h3>Artifacts<\/h3>/);
});

test('delivery layout keeps the run root limited to one report and one evidence folder', () => {
  const layout = deliveryLayout('workspace/example-run');
  assert.match(layout.primaryPdf, /QA-Report\.pdf$/);
  assert.match(layout.supporting, /supporting-evidence$/);
  assert.match(layout.audits, /supporting-evidence[\\/]audits$/);
  assert.match(layout.cases, /supporting-evidence[\\/]test-cases$/);
  assert.match(layout.caseReference, /supporting-evidence[\\/]test-cases[\\/]reference$/);
  assert.match(layout.analysis, /supporting-evidence[\\/]analysis$/);
  assert.match(layout.planning, /supporting-evidence[\\/]planning$/);
  assert.match(layout.automation, /supporting-evidence[\\/]automation$/);
  assert.match(layout.allureResults, /supporting-evidence[\\/]allure-results$/);
  assert.match(layout.allureReport, /supporting-evidence[\\/]allure-report$/);
  assert.match(layout.allureIndex, /supporting-evidence[\\/]allure-report[\\/]index\.html$/);
});

test('case execution matrix makes P1 and P2 work clear for every page', () => {
  const pages = [
    { page: { id: 'a', name: 'Page A' }, url: 'https://example.test/a' },
    { page: { id: 'b', name: 'Page B' }, url: 'https://example.test/b' },
  ];
  const cases = [
    { pageId: 'a', priority: 'P1' },
    { pageId: 'a', priority: 'P2' },
    { pageId: 'a', priority: 'P3' },
    { pageId: 'b', priority: 'P2' },
  ];
  const matrix = caseExecutionMatrix(pages, cases);
  assert.deepEqual(matrix.map((entry) => [entry.name, entry.executeFirst, entry.total]), [
    ['Page A', 2, 3],
    ['Page B', 1, 1],
  ]);
});
