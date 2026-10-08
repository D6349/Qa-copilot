import crypto from 'node:crypto';
import path from 'node:path';

export function stableHash(value, length = 16) {
  const normalized = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, length);
}

export function slug(value, fallback = 'page') {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 64);
  return cleaned || fallback;
}

export function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export function ensureHttpUrl(raw, label = 'URL') {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL: ${raw}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https: ${raw}`);
  }
  return parsed.href;
}

const SECRET_QUERY_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|auth|session|jwt|code|signature|credential)/i;

export function sanitizeUrl(raw) {
  try {
    const parsed = new URL(raw);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    parsed.username = parsed.username ? '[REDACTED]' : '';
    parsed.password = parsed.password ? '[REDACTED]' : '';
    return parsed.href;
  } catch {
    return raw;
  }
}

export function sanitizeText(value) {
  return String(value || '').split(/\s+/).map((part) => (
    /^https?:\/\//i.test(part) ? sanitizeUrl(part) : part
  )).join(' ');
}

export function redact(value) {
  if (value === undefined || value === null) return value;
  return '[REDACTED]';
}
