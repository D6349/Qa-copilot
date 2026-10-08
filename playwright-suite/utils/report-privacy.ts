import path from 'node:path';

const REDACTED_REPORT_VALUE = '[REDACTED]';
const SENSITIVE_REPORT_KEY_MARKERS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'credential',
  'authorization',
  'privatekey',
  'clientsecret',
  'accesskey',
  'connectionstring',
  'cookie',
  'sessionid',
  'otp',
  'mfacode',
] as const;

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

export function repositoryRelativePath(
  value: string,
  repositoryRoot = process.cwd(),
): string {
  const source = String(value || '').trim();
  if (!source) return '';

  const root = path.resolve(repositoryRoot);
  const absolute = path.isAbsolute(source)
    ? path.normalize(source)
    : path.resolve(root, source);
  const relative = path.relative(root, absolute);
  if (!relative) return '.';
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return path.basename(absolute);
  }
  return relative.split(path.sep).join('/');
}

export function redactReportText(
  value: unknown,
  exactValues: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  let output = String(value ?? '');
  const values = [...new Set(exactValues.filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (const sensitiveValue of values) {
    output = output.split(sensitiveValue).join('[REDACTED]');
  }

  const root = path.resolve(repositoryRoot);
  const rootVariants = [
    root,
    root.split(path.sep).join('/'),
    root.replace(/\\/g, '\\\\'),
  ];
  for (const rootVariant of [...new Set(rootVariants)]) {
    const separator = rootVariant.includes('\\\\')
      ? '\\\\'
      : rootVariant.includes('\\')
        ? '\\'
        : '/';
    output = replaceCaseInsensitive(output, `${rootVariant}${separator}`, '');
    output = replaceCaseInsensitive(output, rootVariant, '.');
  }
  return output;
}

export function redactSensitiveReportData(value: unknown): unknown {
  return redactSensitiveValue(value, new WeakSet<object>());
}

export function knowledgeProviderVerificationEnabled(
  environment: EnvironmentValues = process.env,
): boolean {
  return /^(?:1|true)$/i.test(
    environment.RUN_KNOWLEDGE_PROVIDER_VERIFY?.trim() || '',
  );
}

export function implicitExcelReportScope(
  environment: EnvironmentValues = process.env,
): 'knowledge' | 'e2e' {
  if (environment.REPORT_SCOPE?.trim()) return 'e2e';
  return knowledgeProviderVerificationEnabled(environment) ? 'knowledge' : 'e2e';
}

function redactSensitiveValue(
  value: unknown,
  ancestors: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return REDACTED_REPORT_VALUE;
    ancestors.add(value);
    const result = value.map((item) => redactSensitiveValue(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) return value;
  if (ancestors.has(value)) return REDACTED_REPORT_VALUE;

  ancestors.add(value);
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveReportKey(key)
        ? REDACTED_REPORT_VALUE
        : redactSensitiveValue(item, ancestors),
    ]),
  );
  ancestors.delete(value);
  return result;
}

function isSensitiveReportKey(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_REPORT_KEY_MARKERS.some((marker) => (
    normalized.includes(marker)
  ));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && Object.prototype.toString.call(value) === '[object Object]';
}

function replaceCaseInsensitive(
  value: string,
  search: string,
  replacement: string,
): string {
  if (!search) return value;
  return value.replace(
    new RegExp(escapeRegExp(search), 'gi'),
    () => replacement,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
