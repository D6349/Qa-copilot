/**
 * seed.js - creates a demo project from a sample registration form so you can
 * see the whole flow before pointing it at anything real.
 *
 *   npm run seed
 */
import * as store from './src/store.js';
import { inspectHtml } from './src/inspector.js';
import { generate } from './src/rules/index.js';
import { buildPlan } from './src/testPlan.js';

const SAMPLE = `<html><head><title>Company registration</title></head><body>
<h1>Register a private limited company</h1>
<form>
  <label for="cname">Company name</label>
  <input id="cname" name="companyName" maxlength="120" minlength="3" required>

  <label for="pan">PAN Number</label>
  <input id="pan" name="pan" maxlength="10" required pattern="[A-Z]{5}[0-9]{4}[A-Z]">

  <label for="gstin">GSTIN</label>
  <input id="gstin" name="gstin" maxlength="15">

  <label for="din">Director DIN</label>
  <input id="din" name="din" maxlength="8" required>

  <label for="email">Email address</label>
  <input id="email" name="email" type="email" required>

  <label for="mobile">Mobile number</label>
  <input id="mobile" name="mobile" type="tel" maxlength="10" required>

  <label for="pin">PIN code</label>
  <input id="pin" name="pincode" maxlength="6" required>

  <label for="cap">Authorised capital (INR)</label>
  <input id="cap" name="capital" type="number" min="100000" max="100000000" required>

  <label for="doi">Date of incorporation</label>
  <input id="doi" name="incorporationDate" type="date" required>

  <label for="state">State</label>
  <select id="state" name="state" required>
    <option value="">-- Select state --</option>
    <option>Tamil Nadu</option><option>Karnataka</option><option>Maharashtra</option>
  </select>

  <label for="doc">Upload PAN card</label>
  <input id="doc" name="panDocument" type="file" accept=".pdf,.jpg,.png" required>

  <label for="pw">Create password</label>
  <input id="pw" name="password" type="password" minlength="8" required>

  <label for="ref">Referral code</label>
  <input id="ref" name="referral" maxlength="12" readonly>

  <button type="submit">Submit application</button>
  <button type="button">Save as draft</button>
  <button type="button" disabled>Download acknowledgement</button>
</form>

<table>
  <thead><tr><th>Application</th><th>Filed on</th><th>Status</th></tr></thead>
  <tbody><tr><td>APP-1</td><td>01/04/2024</td><td>Pending</td></tr></tbody>
</table>

<a href="/help">Help centre</a>
<a href="/dashboard">Back to dashboard</a>
<img src="/logo.png">
</body></html>`;

const project = store.createProject({
  name: 'Demo — Company Registration',
  product: 'Sample',
  description: 'Seeded demo so you can see the whole flow before pointing this at a real product.',
  environments: {
    dev: 'https://dev.example.com',
    uat: 'https://uat.example.com',
    prod: 'https://app.example.com',
  },
});

const page = store.addPage(project.id, {
  url: 'https://dev.example.com/register',
  module: 'REGISTRATION',
  name: 'Company registration',
});

store.updatePage(project.id, page.id, {
  requirements: [
    'A company name must be unique across all filed applications.',
    'Authorised capital below 100,000 INR is not permitted for a private limited company.',
    'A director may hold at most 20 directorships; the DIN must be validated against MCA before submission.',
    'Once submitted, an application cannot be edited — only withdrawn and re-filed.',
  ].join('\n'),
});

const model = inspectHtml(SAMPLE, page.url);
store.saveModel(page.id, model);
store.updatePage(project.id, page.id, { lastScannedAt: model.scannedAt });

const { cases, coverage } = generate({ project, page: store.getProject(project.id).pages[0], model });
store.saveCases(project.id, cases);
store.savePlan(project.id, buildPlan({
  project: store.getProject(project.id),
  cases,
  models: { [page.id]: model },
}));

console.log('');
console.log(`  Seeded "${project.name}"`);
console.log(`  ${model.fields.length} fields scanned → ${coverage.total} test cases`);
console.log(`  ${JSON.stringify(coverage.byFamily)}`);
console.log('');
console.log('  Run: npm start   then open http://localhost:4100');
console.log('');
