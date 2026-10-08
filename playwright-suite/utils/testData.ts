/**
 * Indian compliance test data with real checksums.
 * Mirrors QA Copilot's own factory so generated specs stay self-contained.
 */
const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];
const VERHOEFF_INV = [0,4,3,2,1,5,6,7,8,9];
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function verhoeffDigit(digits: string): number {
  let c = 0;
  digits.split('').reverse().map(Number).forEach((d, i) => {
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][d]];
  });
  return VERHOEFF_INV[c];
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i += 1) {
    const p = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

export const validPan = (): string => 'ABCPD1234E';
export const validGstin = (state = '27'): string => {
  const base = `${state}${validPan()}1Z`;
  return base + gstinCheckChar(base);
};
export const validAadhaar = (): string => {
  const base = '23456789012';
  return base + verhoeffDigit(base);
};
export const validIfsc = (): string => 'HDFC0001234';
export const validCin = (): string => 'U72200KA2013PTC097389';
export const validDin = (): string => '02345678';
export const validTan = (): string => 'MUMA12345B';
export const validPincode = (): string => '600001';
export const validMobile = (): string => '9876543210';

/** A unique-per-run email so repeat runs do not collide on uniqueness rules. */
export const uniqueEmail = (prefix = 'qa'): string =>
  `${prefix}.${Date.now()}@example.com`;

export const invalidFor: Record<string, string[]> = {
  pan: ['ABCD1234E', 'ABCPD12345', 'abcpd1234e', 'ABCPD 1234E'],
  gstin: ['99ABCPD1234E1Z5', '27ABCPD1234E1ZZ', '27ABCPD1234E1A5'],
  aadhaar: ['234567890123', '023456789012', '23456789012'],
  ifsc: ['HDFC1001234', 'HDF0001234', 'hdfc0001234'],
  mobile: ['1234567890', '987654321', '98765432101'],
  pincode: ['000001', '60000', '6000A1'],
  email: ['qa.tester', 'qa@', '@example.com', 'qa..t@example.com'],
};

export const xssPayloads = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
];

export const sqliPayloads = [
  "' OR '1'='1",
  "'; DROP TABLE users;--",
  "admin'--",
];
