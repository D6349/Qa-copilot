/**
 * fields.js - everything derivable from a single form field's attributes.
 *
 * Each exported rule takes (ctx, field) and returns TestCase[]. ctx carries
 * { project, page, module, limits }.
 */
import { makeCase, suggestLocator, fieldLabel, short } from './builder.js';
import { formats, detectFormat, stressStrings, filler } from '../testData.js';

const TEXTUAL = ['text', 'textarea', 'email', 'tel', 'url', 'password', 'search', 'number'];

/* --------------------------------------------------------------- required */

export function requiredRules(ctx, field) {
  if (!field.required || field.disabled || field.readonly) return [];
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };

  return [
    makeCase({
      ...base,
      ruleId: 'field.required.blank',
      title: `Submit with "${name}" left blank`,
      description: `"${name}" is marked required in the DOM. Submitting without it must be blocked with a clear, field-level message.`,
      category: 'Validation',
      priority: 'P1',
      severity: 'High',
      type: 'Automation',
      isSmoke: true,
      testData: { [field.key]: '(empty)' },
      steps: [
        'Open the page',
        `Fill every field except "${name}" with valid data`,
        `Leave "${name}" empty`,
        'Submit the form',
      ],
      expectedResult: `Submission is blocked. An error message appears next to "${name}" naming the field. Focus moves to "${name}". No record is created.`,
      tags: ['required', 'negative'],
    }),
    makeCase({
      ...base,
      ruleId: 'field.required.whitespace',
      title: `Submit with "${name}" containing only spaces`,
      description: 'Whitespace-only input often slips past a naive required check.',
      category: 'Validation',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: { [field.key]: '"   " (three spaces)' },
      steps: [
        'Open the page',
        `Type three spaces into "${name}"`,
        'Fill all other fields with valid data',
        'Submit the form',
      ],
      expectedResult: 'Treated as empty. Submission is blocked with the same required-field error.',
      tags: ['required', 'negative', 'trim'],
    }),
    makeCase({
      ...base,
      ruleId: 'field.required.clearAfterFill',
      title: `Clear "${name}" after filling it and re-submit`,
      description: 'Checks that validation re-runs on change, not only on first load.',
      category: 'Validation',
      priority: 'P3',
      severity: 'Low',
      type: 'Automation',
      steps: [
        `Fill "${name}" with valid data`,
        'Move focus away so the field validates green',
        `Return to "${name}" and delete the value`,
        'Submit the form',
      ],
      expectedResult: 'The required-field error re-appears and submission is blocked.',
      tags: ['required', 'negative'],
    }),
  ];
}

/* ------------------------------------------------------ length boundaries */

export function lengthRules(ctx, field) {
  const cases = [];
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };

  if (field.maxlength && field.maxlength > 1) {
    const n = field.maxlength;
    cases.push(makeCase({
      ...base,
      ruleId: 'field.maxlength.boundary',
      title: `Boundary check on "${name}" at maxlength ${n}`,
      description: `The field declares maxlength=${n}. Test the three values either side of the limit in one pass.`,
      category: 'Validation',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: {
        [`${field.key} (n-1)`]: short(filler(n - 1)),
        [`${field.key} (n)`]: short(filler(n)),
        [`${field.key} (n+1)`]: short(filler(n + 1)),
      },
      steps: [
        `Type ${n - 1} characters into "${name}" and submit`,
        `Clear the field, type exactly ${n} characters and submit`,
        `Clear the field, attempt to type ${n + 1} characters and submit`,
      ],
      expectedResult: `${n - 1} and ${n} characters are accepted and saved in full. The ${n + 1}th character is either rejected on keypress or produces a validation error — it must never be silently truncated on save.`,
      tags: ['boundary', 'maxlength'],
    }));
    cases.push(makeCase({
      ...base,
      ruleId: 'field.maxlength.paste',
      title: `Paste more than ${n} characters into "${name}"`,
      description: 'Keypress limits are often bypassed by paste, autofill or programmatic set.',
      category: 'Validation',
      priority: 'P2',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      testData: { [field.key]: short(filler(n + 50)) },
      steps: [
        `Copy a ${n + 50} character string to the clipboard`,
        `Paste it into "${name}"`,
        'Submit the form',
        'Re-open the saved record and inspect the stored value',
      ],
      expectedResult: `Either the paste is truncated to ${n} visibly, or a validation error appears. The database must not store more than ${n} characters, and the user must not be told it saved successfully if it was truncated.`,
      tags: ['boundary', 'maxlength', 'paste'],
    }));
  }

  if (field.minlength && field.minlength > 1) {
    const m = field.minlength;
    cases.push(makeCase({
      ...base,
      ruleId: 'field.minlength.boundary',
      title: `Boundary check on "${name}" at minlength ${m}`,
      category: 'Validation',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: {
        [`${field.key} (m-1)`]: short(filler(m - 1)),
        [`${field.key} (m)`]: short(filler(m)),
      },
      steps: [
        `Enter ${m - 1} characters into "${name}" and submit`,
        `Enter exactly ${m} characters and submit`,
      ],
      expectedResult: `${m - 1} characters is rejected with a message stating the minimum. ${m} characters is accepted.`,
      tags: ['boundary', 'minlength'],
    }));
  }

  return cases;
}

/* ---------------------------------------------------- numeric boundaries */

export function numericRules(ctx, field) {
  if (field.type !== 'number' && field.min === null && field.max === null) return [];
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };
  const cases = [];

  const min = field.min !== null ? Number(field.min) : null;
  const max = field.max !== null ? Number(field.max) : null;

  if (min !== null || max !== null) {
    const data = {};
    const steps = [];
    if (min !== null) {
      data[`${field.key} (min-1)`] = String(min - 1);
      data[`${field.key} (min)`] = String(min);
      steps.push(`Enter ${min - 1} and submit`, `Enter ${min} and submit`);
    }
    if (max !== null) {
      data[`${field.key} (max)`] = String(max);
      data[`${field.key} (max+1)`] = String(max + 1);
      steps.push(`Enter ${max} and submit`, `Enter ${max + 1} and submit`);
    }
    cases.push(makeCase({
      ...base,
      ruleId: 'field.numeric.range',
      title: `Range boundary check on "${name}"`,
      description: `Declared range: min=${field.min ?? 'none'}, max=${field.max ?? 'none'}.`,
      category: 'Validation',
      priority: 'P2',
      severity: 'High',
      type: 'Automation',
      testData: data,
      steps,
      expectedResult: 'Values inside the range are accepted; values outside are rejected with a message that states the allowed range. The boundary values themselves are accepted.',
      tags: ['boundary', 'numeric'],
    }));
  }

  cases.push(makeCase({
    ...base,
    ruleId: 'field.numeric.malformed',
    title: `Non-numeric and malformed input in "${name}"`,
    category: 'Validation',
    priority: 'P2',
    severity: 'Medium',
    type: 'Automation',
    testData: {
      letters: 'abc',
      negative: '-1',
      decimal: '1.5',
      exponent: '1e5',
      leadingZeros: '000123',
      plusSign: '+10',
      spaced: '1 0',
    },
    steps: [
      `Enter each of the test data values into "${name}" in turn`,
      'Submit after each one',
      'Record which are accepted and what is stored',
    ],
    expectedResult: 'Only well-formed numbers within the allowed range are accepted. Exponent notation and spaced digits are rejected. Confirm with the business owner whether negatives and decimals are valid for this field — this case fails if the behaviour is undefined rather than deliberate.',
    tags: ['negative', 'numeric'],
  }));

  return cases;
}

/* ------------------------------------------------------ format detection */

export function formatRules(ctx, field) {
  const key = detectFormat(field);
  if (!key) return [];
  const fmt = formats[key];
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };
  const limit = ctx.limits.invalidFormats;
  const invalids = fmt.invalid().slice(0, limit);

  return [
    makeCase({
      ...base,
      ruleId: `field.format.${key}.valid`,
      title: `Accept a valid ${fmt.label} in "${name}"`,
      description: `"${name}" looks like a ${fmt.label} field. This value satisfies the real checksum, not just the surface format.`,
      category: 'Functional',
      priority: 'P1',
      severity: 'High',
      type: 'Automation',
      isSmoke: true,
      testData: { [field.key]: fmt.valid() },
      steps: [
        `Enter ${fmt.valid()} into "${name}"`,
        'Complete the remaining fields with valid data',
        'Submit the form',
        'Re-open the saved record',
      ],
      expectedResult: `The value is accepted, saved exactly as entered (no case change, no stripped characters) and displayed identically on re-open.`,
      tags: ['format', key, 'positive'],
    }),
    makeCase({
      ...base,
      ruleId: `field.format.${key}.invalid`,
      title: `Reject malformed ${fmt.label} values in "${name}"`,
      description: `Each value below is invalid for a specific reason. Server-side validation must catch all of them, not just the ones the client-side regex catches.`,
      category: 'Validation',
      priority: 'P1',
      severity: 'High',
      type: 'Automation',
      testData: Object.fromEntries(invalids.map((v) => [v.why, v.value])),
      steps: [
        ...invalids.map((v) => ({ action: `Enter the value and submit — ${v.why}`, data: v.value })),
        'For at least one value, bypass the UI and send it straight to the API',
      ],
      expectedResult: `Every value is rejected with a message explaining what is wrong with the ${fmt.label}. The API rejects them too — client-side-only validation is a failure of this case.`,
      tags: ['format', key, 'negative'],
    }),
  ];
}

/* ------------------------------------------------------------- data type */

export function typeRules(ctx, field) {
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };
  const cases = [];

  if (field.type === 'select' && field.options?.length) {
    const opts = field.options;
    cases.push(makeCase({
      ...base,
      ruleId: 'field.select.options',
      title: `Every option in "${name}" is selectable and saves`,
      description: `${opts.length} options found in the DOM.`,
      category: 'Functional',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: { options: opts.slice(0, 15).map((o) => o.text).join(' | ') },
      steps: [
        `Open the "${name}" dropdown`,
        'Select each option in turn and submit',
        'Re-open the record and confirm the selection persisted',
      ],
      expectedResult: 'Each option can be selected, saves correctly and is shown selected on re-open. No option produces a server error. Option labels match the business-approved list.',
      tags: ['dropdown'],
    }));
    if (field.required) {
      cases.push(makeCase({
        ...base,
        ruleId: 'field.select.noSelection',
        title: `Submit "${name}" with no option chosen`,
        category: 'Validation',
        priority: 'P2',
        severity: 'Medium',
        type: 'Automation',
        steps: [`Leave "${name}" on its default/placeholder option`, 'Submit the form'],
        expectedResult: 'Submission is blocked. The placeholder option (e.g. "-- Select --") is not accepted as a real value.',
        tags: ['dropdown', 'negative'],
      }));
    }
    cases.push(makeCase({
      ...base,
      ruleId: 'field.select.tamper',
      title: `Inject an unlisted value into "${name}" via devtools`,
      description: 'A dropdown is a client-side convenience, never a server-side guarantee.',
      category: 'Security',
      priority: 'P2',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      steps: [
        'Open browser devtools',
        `Add a new <option value="__INVALID__"> to the "${name}" select`,
        'Select it and submit the form',
      ],
      expectedResult: 'The server rejects the unlisted value. It is not saved, and no stack trace or internal error is shown to the user.',
      tags: ['security', 'tamper', 'dropdown'],
    }));
  }

  if (field.type === 'file') {
    const accept = field.accept || 'any';
    cases.push(makeCase({
      ...base,
      ruleId: 'field.file.types',
      title: `File type handling on "${name}"`,
      description: `accept="${accept}"`,
      category: 'Validation',
      priority: 'P1',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      testData: {
        allowed: `a file matching ${accept}`,
        disallowed: '.exe file',
        noExtension: 'file with no extension',
        doubleExtension: 'invoice.pdf.exe',
        renamed: '.exe renamed to .pdf',
        zeroByte: '0 KB file',
        oversized: 'file well above the documented limit',
      },
      steps: [
        'Upload each file in the test data in turn',
        'Observe the client-side response',
        'For the disallowed and renamed files, also check what the server stores',
      ],
      expectedResult: `Only files matching ${accept} are accepted. Double-extension and renamed files are rejected by content type, not just by filename. Zero-byte and oversized files are rejected with a message that states the limit. Nothing executable is ever stored in a web-reachable path.`,
      tags: ['upload', 'security'],
    }));
    cases.push(makeCase({
      ...base,
      ruleId: 'field.file.filename',
      title: `Malicious filenames on "${name}"`,
      category: 'Security',
      priority: 'P2',
      severity: 'High',
      type: 'Manual',
      automatable: false,
      testData: {
        traversal: '../../etc/passwd.pdf',
        xss: '<script>alert(1)</script>.pdf',
        longName: `${'a'.repeat(300)}.pdf`,
        unicode: 'फ़ाइल नाम.pdf',
      },
      steps: [
        'Rename a valid file to each of the test-data names',
        'Upload each one',
        'Check the stored path and how the filename renders in the file list',
      ],
      expectedResult: 'Filenames are sanitised or replaced with a generated name. Path traversal does not escape the upload directory. The filename renders as text, never as HTML.',
      tags: ['upload', 'security', 'xss'],
    }));
  }

  if (field.type === 'date') {
    cases.push(makeCase({
      ...base,
      ruleId: 'field.date.invalid',
      title: `Invalid and edge dates in "${name}"`,
      category: 'Validation',
      priority: 'P2',
      severity: 'Medium',
      type: 'Automation',
      testData: Object.fromEntries(formats.date.invalid().map((v) => [v.why, v.value])),
      steps: [
        'Enter each test-data value by typing, not by picking from the calendar',
        'Submit after each',
        'Repeat the two most important ones using the date picker',
      ],
      expectedResult: 'Impossible dates are rejected. The expected format is stated on screen. Typed entry and picker entry produce the same stored value. Check the stored value in the DB for timezone shift.',
      tags: ['date', 'negative'],
    }));
  }

  if (field.type === 'password') {
    cases.push(makeCase({
      ...base,
      ruleId: 'field.password.policy',
      title: `Password policy enforcement on "${name}"`,
      category: 'Security',
      priority: 'P1',
      severity: 'Critical',
      type: 'Automation',
      isSmoke: true,
      testData: {
        tooShort: 'Ab1!',
        noUpper: 'password1!',
        noDigit: 'Password!',
        noSpecial: 'Password1',
        common: 'Password@123',
        spaces: 'Pass word1!',
        veryLong: `${'A'.repeat(200)}a1!`,
      },
      steps: [
        'Enter each test-data value in turn',
        'Observe whether the policy is stated before or only after failure',
        'Check the network tab while submitting',
      ],
      expectedResult: 'Weak passwords are rejected and the policy is shown up front, not only after a failed attempt. The password is never sent in a URL or logged. The field has autocomplete set appropriately and masks input.',
      tags: ['security', 'password'],
    }));
  }

  if (field.readonly || field.disabled) {
    cases.push(makeCase({
      ...base,
      ruleId: 'field.locked.tamper',
      title: `Edit the ${field.disabled ? 'disabled' : 'read-only'} field "${name}" via devtools`,
      category: 'Security',
      priority: 'P2',
      severity: 'High',
      type: 'Manual',
      automatable: true,
      steps: [
        'Open devtools',
        `Remove the ${field.disabled ? 'disabled' : 'readonly'} attribute from "${name}"`,
        'Change the value and submit',
      ],
      expectedResult: 'The server ignores or rejects the tampered value. The original value is preserved in the database.',
      tags: ['security', 'tamper'],
    }));
  }

  return cases;
}

/* ---------------------------------------------- generic hostile payloads */

export function payloadRules(ctx, field) {
  if (!TEXTUAL.includes(field.type) || field.disabled || field.readonly) return [];
  const name = fieldLabel(field);
  const base = { page: ctx.page, project: ctx.project, module: ctx.module, subModule: name, selectors: suggestLocator(field) };
  const stress = stressStrings.slice(0, ctx.limits.stress);

  return [
    makeCase({
      ...base,
      ruleId: 'field.stress.strings',
      title: `Unicode, whitespace and oversized input in "${name}"`,
      description: 'Character-handling problems usually surface at save or on re-render, not at typing time.',
      category: 'Validation',
      priority: 'P3',
      severity: 'Medium',
      type: 'Automation',
      testData: Object.fromEntries(stress.map((s) => [s.why, short(s.value)])),
      steps: [
        `Enter each test-data value into "${name}" and submit`,
        'Re-open the saved record after each',
        'Check the value in the database directly',
      ],
      expectedResult: 'Values are stored and redisplayed unchanged, except that leading and trailing spaces are trimmed. No mojibake, no truncation mid-emoji, no 500 error. The column collation supports the full character set.',
      tags: ['unicode', 'stress'],
    }),
  ];
}
