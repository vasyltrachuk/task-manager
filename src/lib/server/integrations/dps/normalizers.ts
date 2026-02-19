import type { DpsNormalizedRegistryPayload, DpsRegistryCode } from './contracts';

const MAX_TRAVERSE_DEPTH = 6;

function asObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  return input as Record<string, unknown>;
}

function scalarToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function firstObject(input: unknown): Record<string, unknown> | null {
  if (Array.isArray(input)) {
    for (const item of input) {
      const row = firstObject(item);
      if (row) return row;
    }
    return null;
  }

  const obj = asObject(input);
  if (!obj) return null;

  for (const key of ['rows', 'data', 'items', 'records', 'list', 'result', 'results', 'payload']) {
    const candidate = obj[key];
    if (candidate === undefined || candidate === null) continue;

    const row = firstObject(candidate);
    if (row) return row;
  }

  if (Object.keys(obj).length === 0) {
    return null;
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

function pickFieldDeep(source: unknown, keys: string[]): string | undefined {
  const targetKeys = new Set(keys.map((key) => key.toLowerCase()));
  const visited = new Set<unknown>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: source, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > MAX_TRAVERSE_DEPTH) continue;
    if (visited.has(current.value)) continue;
    visited.add(current.value);

    if (Array.isArray(current.value)) {
      current.value.forEach((item) => {
        queue.push({ value: item, depth: current.depth + 1 });
      });
      continue;
    }

    const obj = asObject(current.value);
    if (!obj) continue;

    for (const [key, value] of Object.entries(obj)) {
      if (targetKeys.has(key.toLowerCase())) {
        const text = scalarToString(value);
        if (text) return text;
      }
    }

    Object.values(obj).forEach((value) => {
      if (value && typeof value === 'object') {
        queue.push({ value, depth: current.depth + 1 });
      }
    });
  }

  return undefined;
}

function pickFieldFromPayload(raw: unknown, keys: string[]): string | undefined {
  const row = firstObject(raw);
  if (row) {
    const direct = pickField(row, keys);
    if (direct) return direct;
  }

  return pickFieldDeep(raw, keys);
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  const truthyExact = ['1', 'true', 'yes', 'так', 'y', 'є', 'active', 'registered', 'зареєстровано', 'зареєстрований', 'діючий', 'чинний'];
  const falsyExact = ['0', 'false', 'no', 'ні', 'n', 'нема', 'inactive', 'annulled', 'cancelled', 'revoked', 'анульовано', 'скасовано', 'ліквідовано'];
  const truthyContains = ['active', 'registered', 'зареєстр', 'діюч', 'чинн'];
  const falsyContains = ['inactive', 'annul', 'cancel', 'revoked', 'скас', 'ануль', 'ліквід', 'не зареєстр'];

  if (falsyExact.includes(normalized)) return false;
  if (truthyExact.includes(normalized)) return true;
  if (falsyContains.some((token) => normalized.includes(token))) return false;
  if (truthyContains.some((token) => normalized.includes(token))) return true;
  return undefined;
}

function normalizeEvPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const subjectName = pickFieldFromPayload(raw, ['fio', 'full_name', 'name', 'pib', 'payer_name', 'taxpayer_name', 'subject_name', 'nazva']);
  // is_pdv / vat_payer — ознака платника ПДВ (окремо від is_payer = платник ЄП)
  const vatRaw = pickFieldFromPayload(raw, ['is_pdv', 'vat', 'pdv', 'pdv_payer', 'vat_payer', 'is_vat_payer']);
  // rclass — номер групи ЄП ("1".."4"); is_payer — чинний платник ЄП ("0"/"1")
  const taxSystem = pickFieldFromPayload(raw, ['rclass', 'group', 'tax_system', 'system', 'tax_group', 'group_name', 'taxation_system']);
  const isPayerRaw = pickFieldFromPayload(raw, ['is_payer']);
  const simplifiedSystemDate = pickFieldFromPayload(raw, ['date_acc_ers', 'sp_date', 'simplified_date', 'edpod_date', 'single_tax_date']);
  const registrationDate = pickFieldFromPayload(raw, ['date_acc_ers', 'fop_date', 'registration_date', 'reg_date', 'date_reg']);
  const dpsOfficeName = pickFieldFromPayload(raw, ['c_sti_main_name', 'dps_name', 'tax_office', 'office_name', 'organ_dps', 'organ_name']);
  const dpsOfficeCode = pickFieldFromPayload(raw, ['c_sti_main', 'dps_code', 'office_code', 'tax_office_code', 'organ_code']);
  const address = pickFieldFromPayload(raw, ['adress', 'address', 'addr', 'location', 'tax_address', 'juridical_address', 'registration_address']);
  // kved (без суфікса) — реальне поле з ev реєстру
  const activityCode = pickFieldFromPayload(raw, ['kved', 'kved_code', 'activity_code', 'main_kved', 'ved_code', 'kvd']);
  const activityName = pickFieldFromPayload(raw, ['kved_name', 'activity_name', 'main_activity', 'activity', 'ved_name']);
  const registrationState = pickFieldFromPayload(raw, ['status', 'state', 'record_status', 'registration_state']);
  const note = pickFieldFromPayload(raw, ['note', 'comment', 'status_text', 'state_text', 'description']);

  // Якщо is_payer = "0" — суб'єкт виключений з реєстру ЄП: не вважається знайденим
  const isActivePayer = isPayerRaw !== undefined ? parseBoolean(isPayerRaw) : undefined;
  if (isActivePayer === false) {
    return {
      registryCode: 'ev',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Платник виключений з реєстру платників єдиного податку.',
    };
  }

  const hasSignal = Boolean(
    subjectName
      || taxSystem
      || simplifiedSystemDate
      || registrationDate
      || dpsOfficeName
      || dpsOfficeCode
      || address
      || activityCode
      || activityName
      || registrationState
      || note
      || (isActivePayer === true)
  );

  if (!hasSignal) {
    return {
      registryCode: 'ev',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Запис не знайдено у відповіді реєстру ЄП.',
    };
  }

  return {
    registryCode: 'ev',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName,
    isVatPayer: parseBoolean(vatRaw),
    taxSystem,
    simplifiedSystemDate,
    registrationDate,
    dpsOfficeName,
    dpsOfficeCode,
    address,
    activityCode,
    activityName,
    registrationState,
    note,
  };
}

function normalizeVatPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const subjectName = pickFieldFromPayload(raw, ['name', 'full_name', 'payer_name', 'taxpayer_name', 'subject_name', 'nazva']);
  // datReestr — дата реєстрації платником ПДВ (реальне поле ДПС pdv_act)
  const registrationDate = pickFieldFromPayload(raw, ['datreestr', 'dat_reestr', 'reg_date', 'registration_date', 'start_date', 'date_reg']);
  // datAnul — дата анулювання: якщо є — платник не активний
  const datAnul = pickFieldFromPayload(raw, ['datanul', 'dat_anul', 'annul_date', 'cancel_date']);
  const stateRaw = pickFieldFromPayload(raw, ['dreestrsg', 'status', 'state', 'is_active', 'active', 'pdv_state', 'vat_state', 'vat_active']);
  const address = pickFieldFromPayload(raw, ['adress', 'address', 'addr', 'location', 'tax_address', 'juridical_address', 'registration_address']);
  const activityCode = pickFieldFromPayload(raw, ['kved', 'kved_code', 'activity_code', 'main_kved', 'ved_code', 'kvd']);
  const activityName = pickFieldFromPayload(raw, ['kved_name', 'activity_name', 'main_activity', 'activity', 'ved_name']);
  const registrationState = pickFieldFromPayload(raw, ['status_text', 'state_text', 'status', 'state', 'registration_state']);
  const note = pickFieldFromPayload(raw, ['status_text', 'state_text', 'cancel_reason', 'annul_reason', 'comment']);
  const hasSignal = Boolean(subjectName || registrationDate || registrationState || note || address || activityCode || activityName);

  if (!hasSignal) {
    return {
      registryCode: 'pdv_act',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Платник не знайдений у реєстрі ПДВ.',
    };
  }

  // Якщо datAnul заповнений — реєстрація анульована (не активний платник ПДВ)
  // Якщо datAnul порожній і запис знайдений — активний платник ПДВ
  const isVatPayer = datAnul
    ? false
    : (parseBoolean(stateRaw) ?? true);

  return {
    registryCode: 'pdv_act',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName,
    isVatPayer,
    registrationDate,
    address,
    activityCode,
    activityName,
    registrationState,
    note,
  };
}

function normalizeNonProfitPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const subjectName = pickFieldFromPayload(raw, ['name', 'full_name', 'payer_name', 'taxpayer_name', 'subject_name', 'nazva']);
  const registrationDate = pickFieldFromPayload(raw, ['reg_date', 'inclusion_date', 'inclusion_dt', 'start_date', 'date_reg']);
  const address = pickFieldFromPayload(raw, ['address', 'adress', 'addr', 'location', 'tax_address', 'juridical_address', 'registration_address']);
  const activityCode = pickFieldFromPayload(raw, ['kved', 'kved_code', 'activity_code', 'main_kved', 'ved_code', 'kvd']);
  const activityName = pickFieldFromPayload(raw, ['kved_name', 'activity_name', 'main_activity', 'activity', 'ved_name']);
  const registrationState = pickFieldFromPayload(raw, ['status', 'state', 'feature', 'registry_sign', 'sign']);
  const note = pickFieldFromPayload(raw, ['status_text', 'feature_text', 'status', 'feature', 'note']);
  const hasSignal = Boolean(subjectName || registrationDate || registrationState || note || address || activityCode || activityName);

  if (!hasSignal) {
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
    subjectName,
    registrationDate,
    address,
    activityCode,
    activityName,
    registrationState,
    note,
  };
}

function normalizeRegistrationPayload(raw: unknown, taxId: string): DpsNormalizedRegistryPayload {
  const subjectName = pickFieldFromPayload(raw, ['full_name', 'name', 'fio', 'pib', 'nazva', 'subject_name']);
  // D_REG_STI — дата взяття на облік (реальне поле ДПС registration)
  const registrationDate = pickFieldFromPayload(raw, ['d_reg_sti', 'registration_date', 'reg_date', 'date_reg']);
  const dpsOfficeName = pickFieldFromPayload(raw, ['c_sti_main_name', 'dps_name', 'tax_office', 'office_name']);
  const dpsOfficeCode = pickFieldFromPayload(raw, ['c_sti_main', 'dps_code', 'office_code', 'tax_office_code']);
  const address = pickFieldFromPayload(raw, ['adress', 'address', 'addr', 'location', 'tax_address', 'juridical_address', 'registration_address']);
  const registrationState = pickFieldFromPayload(raw, ['c_stan', 'state', 'status', 'face_mode']);
  const activityCode = pickFieldFromPayload(raw, ['kved', 'kved_code', 'activity_code', 'main_kved', 'ved_code', 'kvd']);
  const activityName = pickFieldFromPayload(raw, ['kved_name', 'activity_name', 'main_activity', 'activity', 'ved_name']);
  // VED_LIC — КВЕД та ліцензована діяльність (реальне поле ДПС registration)
  const vedLic = pickFieldFromPayload(raw, ['ved_lic', 'lic', 'licenses', 'license_text']);
  const note = pickFieldFromPayload(raw, ['face_mode', 'status_text', 'state_text', 'note', 'comment']);
  const hasSignal = Boolean(
    subjectName
    || registrationDate
    || dpsOfficeName
    || dpsOfficeCode
    || address
    || registrationState
    || activityCode
    || activityName
    || vedLic
    || note
  );

  if (!hasSignal) {
    return {
      registryCode: 'registration',
      taxId,
      checkedAt: new Date().toISOString(),
      isFound: false,
      note: 'Запис не знайдено у реєстрі взяття на облік.',
    };
  }

  return {
    registryCode: 'registration',
    taxId,
    checkedAt: new Date().toISOString(),
    isFound: true,
    subjectName,
    registrationDate,
    dpsOfficeName,
    dpsOfficeCode,
    address,
    registrationState,
    activityCode,
    activityName,
    vedLic,
    note,
  };
}

export function normalizeRegistryPayload(
  registryCode: DpsRegistryCode,
  rawPayload: unknown,
  taxId: string
): DpsNormalizedRegistryPayload {
  if (registryCode === 'registration') return normalizeRegistrationPayload(rawPayload, taxId);
  if (registryCode === 'ev') return normalizeEvPayload(rawPayload, taxId);
  if (registryCode === 'pdv_act') return normalizeVatPayload(rawPayload, taxId);
  return normalizeNonProfitPayload(rawPayload, taxId);
}
