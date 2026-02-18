import type { DpsNormalizedRegistryPayload, DpsRegistryCode } from './contracts';

function asObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  return input as Record<string, unknown>;
}

function firstObject(input: unknown): Record<string, unknown> | null {
  if (Array.isArray(input)) {
    return asObject(input[0]);
  }

  const obj = asObject(input);
  if (!obj) return null;

  if (Array.isArray(obj.rows)) {
    return asObject(obj.rows[0]);
  }

  if (Array.isArray(obj.data)) {
    return asObject(obj.data[0]);
  }

  return obj;
}

function pickField(source: Record<string, unknown>, keys: string[]): string | undefined {
  const lookup = new Map<string, unknown>();
  Object.entries(source).forEach(([key, value]) => {
    lookup.set(key.toLowerCase(), value);
  });

  for (const key of keys) {
    const value = lookup.get(key.toLowerCase());
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }

  return undefined;
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'так', 'y', 'є'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'ні', 'n', 'нема'].includes(normalized)) return false;
  return undefined;
}

function normalizeEvPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const row = firstObject(raw);
  if (!row) {
    return {
      registryCode: 'ev',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Запис не знайдено у відповіді реєстру ЄП.',
    };
  }

  const vatRaw = pickField(row, ['is_pdv', 'vat', 'pdv', 'pdv_payer', 'vat_payer']);

  return {
    registryCode: 'ev',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName: pickField(row, ['fio', 'full_name', 'name', 'pib']),
    isVatPayer: parseBoolean(vatRaw),
    taxSystem: pickField(row, ['group', 'tax_system', 'system', 'tax_group']),
    simplifiedSystemDate: pickField(row, ['sp_date', 'simplified_date', 'edpod_date']),
    registrationDate: pickField(row, ['fop_date', 'registration_date', 'reg_date']),
    dpsOfficeName: pickField(row, ['dps_name', 'tax_office', 'office_name']),
    dpsOfficeCode: pickField(row, ['dps_code', 'office_code', 'tax_office_code']),
  };
}

function normalizeVatPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const row = firstObject(raw);
  if (!row) {
    return {
      registryCode: 'pdv_act',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Платник не знайдений у реєстрі ПДВ.',
    };
  }

  const stateRaw = pickField(row, ['status', 'state', 'is_active', 'active']);

  return {
    registryCode: 'pdv_act',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName: pickField(row, ['name', 'full_name']),
    isVatPayer: parseBoolean(stateRaw) ?? true,
    registrationDate: pickField(row, ['reg_date', 'registration_date', 'start_date']),
    note: pickField(row, ['status_text', 'state_text']),
  };
}

function normalizeNonProfitPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const row = firstObject(raw);
  if (!row) {
    return {
      registryCode: 'non-profit',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Організація не знайдена у реєстрі неприбуткових.',
    };
  }

  return {
    registryCode: 'non-profit',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName: pickField(row, ['name', 'full_name']),
    registrationDate: pickField(row, ['reg_date', 'inclusion_date']),
    note: pickField(row, ['status', 'feature']),
  };
}

export function normalizeRegistryPayload(
  registryCode: DpsRegistryCode,
  rawPayload: unknown,
  taxId: string
): DpsNormalizedRegistryPayload {
  if (registryCode === 'ev') return normalizeEvPayload(rawPayload, taxId);
  if (registryCode === 'pdv_act') return normalizeVatPayload(rawPayload, taxId);
  return normalizeNonProfitPayload(rawPayload, taxId);
}
