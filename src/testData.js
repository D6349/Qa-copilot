/**
 * testData.js - domain-correct test data for Indian legal / compliance / fintech forms.
 *
 * Valid values use the real checksum algorithms (Verhoeff for Aadhaar, mod-36 for
 * GSTIN) so they pass server-side validation, not just the regex on the form.
 * Each generator also returns the invalid variants worth testing.
 */

/* ------------------------------------------------------- checksum helpers */

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Verhoeff check digit for a numeric string WITHOUT its check digit (Aadhaar). */
export function verhoeffDigit(digits) {
  let c = 0;
  const rev = digits.split('').reverse().map(Number);
  rev.forEach((d, i) => { c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][d]]; });
  return VERHOEFF_INV[c];
}

/** True when a full number (check digit included) passes Verhoeff. */
export function verhoeffValid(full) {
  if (!/^\d+$/.test(full)) return false;
  let c = 0;
  full.split('').reverse().map(Number).forEach((d, i) => { c = VERHOEFF_D[c][VERHOEFF_P[i % 8][d]]; });
  return c === 0;
}

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Mod-36 check character for the first 14 chars of a GSTIN. */
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < first14.length; i += 1) {
    const v = GST_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

/* ------------------------------------------------------------ generators */

const VALID_PAN = 'ABCPD1234E';

export const formats = {
  pan: {
    label: 'PAN',
    valid: () => VALID_PAN,
    invalid: () => [
      { value: 'ABCD1234E', why: 'only 4 leading letters (needs 5)' },
      { value: 'ABCPD12345', why: 'ends with digit instead of letter' },
      { value: 'ABCPD123E', why: 'only 3 digits (needs 4)' },
      { value: 'abcpd1234e', why: 'lowercase' },
      { value: 'ABCPD 1234E', why: 'embedded space' },
      { value: 'ABCPD1234EX', why: '11 chars (max is 10)' },
      { value: 'AB#PD1234E', why: 'special character' },
    ],
  },
  gstin: {
    label: 'GSTIN',
    valid: () => { const b = `27${VALID_PAN}1Z`; return b + gstinCheckChar(b); },
    invalid: () => [
      { value: `99${VALID_PAN}1Z5`, why: 'state code 99 does not exist' },
      { value: `27${VALID_PAN}1ZZ`, why: 'wrong mod-36 checksum' },
      { value: `27${VALID_PAN}1A5`, why: '14th char must be Z' },
      { value: `27${VALID_PAN}1Z`, why: '14 chars (needs 15)' },
      { value: `27${VALID_PAN}1Z5X`, why: '16 chars' },
      { value: '27ABCD1234E1Z5', why: 'embedded PAN is malformed' },
    ],
  },
  cin: {
    label: 'CIN',
    valid: () => 'U72200KA2013PTC097389',
    invalid: () => [
      { value: 'X72200KA2013PTC097389', why: 'must start with L or U' },
      { value: 'U72200XX2013PTC097389', why: 'invalid state code' },
      { value: 'U72200KA1799PTC097389', why: 'incorporation year before 1857' },
      { value: 'U72200KA2013PTC09738', why: '20 chars (needs 21)' },
      { value: 'U72200KA2013ZZZ097389', why: 'invalid ownership code' },
    ],
  },
  din: {
    label: 'DIN',
    valid: () => '02345678',
    invalid: () => [
      { value: '1234567', why: '7 digits (needs 8)' },
      { value: '123456789', why: '9 digits' },
      { value: '00000000', why: 'all zeros' },
      { value: 'ABCDEFGH', why: 'letters' },
    ],
  },
  aadhaar: {
    label: 'Aadhaar',
    valid: () => { const b = '23456789012'; return b + verhoeffDigit(b); },
    invalid: () => [
      { value: '234567890123', why: 'fails Verhoeff checksum' },
      { value: '023456789012', why: 'cannot start with 0' },
      { value: '123456789012', why: 'cannot start with 1' },
      { value: '23456789012', why: '11 digits (needs 12)' },
      { value: '2345 6789 0128', why: 'spaces - check if the form strips them' },
    ],
  },
  tan: {
    label: 'TAN',
    valid: () => 'MUMA12345B',
    invalid: () => [
      { value: 'MUM12345B', why: 'only 3 leading letters (needs 4)' },
      { value: 'MUMA1234B', why: 'only 4 digits (needs 5)' },
      { value: 'MUMA123456', why: 'missing trailing letter' },
      { value: 'muma12345b', why: 'lowercase' },
    ],
  },
  ifsc: {
    label: 'IFSC',
    valid: () => 'HDFC0001234',
    invalid: () => [
      { value: 'HDFC1001234', why: '5th char must be 0' },
      { value: 'HDF0001234', why: '10 chars (needs 11)' },
      { value: 'HDFC000123', why: 'branch code too short' },
      { value: 'hdfc0001234', why: 'lowercase' },
    ],
  },
  upi: {
    label: 'UPI ID',
    valid: () => 'testuser@okhdfcbank',
    invalid: () => [
      { value: 'testuser', why: 'missing @handle' },
      { value: '@okhdfcbank', why: 'missing username' },
      { value: 'test user@okhdfcbank', why: 'space in username' },
      { value: 'testuser@@okhdfcbank', why: 'double @' },
    ],
  },
  pincode: {
    label: 'PIN code',
    valid: () => '600001',
    invalid: () => [
      { value: '000001', why: 'cannot start with 0' },
      { value: '60000', why: '5 digits (needs 6)' },
      { value: '6000011', why: '7 digits' },
      { value: '6000A1', why: 'contains a letter' },
    ],
  },
  mobile: {
    label: 'Mobile number',
    valid: () => '9876543210',
    invalid: () => [
      { value: '1234567890', why: 'must start 6-9' },
      { value: '987654321', why: '9 digits (needs 10)' },
      { value: '98765432101', why: '11 digits' },
      { value: '+919876543210', why: 'with country code - check if accepted' },
      { value: '98765 43210', why: 'with space' },
    ],
  },
  email: {
    label: 'Email',
    valid: () => 'qa.tester@example.com',
    invalid: () => [
      { value: 'qa.tester', why: 'missing @ and domain' },
      { value: 'qa.tester@', why: 'missing domain' },
      { value: '@example.com', why: 'missing local part' },
      { value: 'qa..tester@example.com', why: 'consecutive dots' },
      { value: '.qa@example.com', why: 'leading dot' },
      { value: 'qa tester@example.com', why: 'space in local part' },
      { value: `${'a'.repeat(310)}@example.com`, why: 'exceeds 320 char RFC limit' },
    ],
  },
  amount: {
    label: 'INR amount',
    valid: () => '25000',
    invalid: () => [
      { value: '-100', why: 'negative amount' },
      { value: '0', why: 'zero amount' },
      { value: '25000.999', why: 'three decimal places' },
      { value: '25,000', why: 'comma separator' },
      { value: '1e5', why: 'exponent notation' },
      { value: '99999999999999', why: 'overflow value' },
    ],
  },
  date: {
    label: 'Date (DD/MM/YYYY)',
    valid: () => '15/06/2024',
    invalid: () => [
      { value: '31/02/2024', why: 'February has no 31st' },
      { value: '29/02/2023', why: '2023 is not a leap year' },
      { value: '06/15/2024', why: 'MM/DD/YYYY - confirm which format is expected' },
      { value: '15/06/1799', why: 'implausibly old' },
      { value: '15/06/2099', why: 'far future date' },
      { value: '15-06-2024', why: 'dash separator' },
    ],
  },
  companyName: {
    label: 'Company name',
    valid: () => 'Bluestone Analytics Private Limited',
    invalid: () => [
      { value: 'A', why: 'single character' },
      { value: 'Bluestone & Co. (India) Pvt. Ltd.', why: 'ampersand, dots and brackets' },
      { value: 'ब्लूस्टोन प्राइवेट लिमिटेड', why: 'Devanagari script' },
      { value: `${'A'.repeat(300)} Pvt Ltd`, why: 'very long name' },
    ],
  },
};

/** Field-name keywords -> format key. Order matters: first match wins. */
const KEYWORD_MAP = [
  [/\b(pan)\b|pannumber|pan_no|pancard/i, 'pan'],
  [/gstin|gst_no|gstnumber|\bgst\b/i, 'gstin'],
  [/\bcin\b|corporateidentity/i, 'cin'],
  [/\bdin\b|directoridentification/i, 'din'],
  [/aadhaar|aadhar|\buid\b/i, 'aadhaar'],
  [/\btan\b|taxdeduction/i, 'tan'],
  [/ifsc|ifsccode/i, 'ifsc'],
  [/\bupi\b|vpa\b/i, 'upi'],
  [/pincode|pin_code|zipcode|postal/i, 'pincode'],
  [/mobile|phone|contactno|whatsapp/i, 'mobile'],
  [/email|mail/i, 'email'],
  [/amount|price|fee|salary|capital|turnover|paidup/i, 'amount'],
  [/date|dob|incorporat|expiry|valid(from|till)/i, 'date'],
  [/company(name)?|entityname|firmname|businessname/i, 'companyName'],
];

/** Best-guess format for a field, from its name, id, label and placeholder. */
export function detectFormat(field) {
  const hay = [field.name, field.id, field.label, field.placeholder]
    .filter(Boolean).join(' ');
  if (!hay) return null;
  for (const [re, key] of KEYWORD_MAP) if (re.test(hay)) return key;
  if (field.type === 'email') return 'email';
  if (field.type === 'tel') return 'mobile';
  if (field.type === 'date') return 'date';
  return null;
}

/* ---------------------------------------------------- generic attack data */

export const xssPayloads = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(document.domain)",
  '<svg/onload=alert(1)>',
  '{{7*7}}',
];

export const sqliPayloads = [
  "' OR '1'='1",
  "'; DROP TABLE users;--",
  "1 UNION SELECT null,version()--",
  "admin'--",
];

export const stressStrings = [
  { value: 'A'.repeat(10000), why: '10,000 character string' },
  { value: '  padded  ', why: 'leading and trailing spaces' },
  { value: '😀🇮🇳✅', why: 'emoji and flag sequences' },
  { value: 'مرحبا שלום', why: 'right-to-left script' },
  { value: 'Ωμέγα Ünïcödé', why: 'accented and Greek characters' },
  { value: '\u0000null', why: 'null byte' },
  { value: '&lt;b&gt;bold&lt;/b&gt;', why: 'HTML entities' },
  { value: '../../etc/passwd', why: 'path traversal string' },
];

/** N chars of filler, used for boundary cases. */
export const filler = (n) => (n > 0 ? 'A'.repeat(Math.min(n, 20000)) : '');
