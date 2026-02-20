const DD_MM_YYYY_DATE = /^\d{2}-\d{2}-\d{4}$/;
const YYYY_MM_DD_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${fieldName}" must be a non-empty string`);
  }

  return value.trim();
}

export function normalizeStatementDate(value: unknown, fieldName: string): string {
  const raw = assertNonEmptyString(value, fieldName);

  if (DD_MM_YYYY_DATE.test(raw)) {
    return raw;
  }

  if (YYYY_MM_DD_DATE.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}-${month}-${year}`;
  }

  throw new Error(`Field "${fieldName}" must be in DD-MM-YYYY or YYYY-MM-DD format`);
}

export function parseOptionalPositiveInt(value: string | null, fieldName: string, min: number, max: number): number | undefined {
  if (value === null || value.trim() === '') return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Field "${fieldName}" must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

export function parseOptionalBoolean(value: string | null, fieldName: string): boolean | undefined {
  if (value === null || value.trim() === '') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  throw new Error(`Field "${fieldName}" must be one of: true, false, 1, 0`);
}
