import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientType, TaxSystem } from '@/lib/types';
import type {
  DpsClientPrefillResult,
  DpsClientPrefillSuggestion,
} from '@/lib/dps-prefill';
import type { TenantContext } from '@/lib/server/tenant-context';
import { DpsPublicApiClient } from './dps-client';
import {
  DPS_PREFILL_REGISTRY_CODES,
  type DpsRegistryCode,
  type DpsRegistryFetchResult,
} from './contracts';
import { resolveTokenForProfiles } from './resolve-token';
import { DpsTokenRepo } from './token.repo';
import type { DpsTaxIdType } from './validation';

interface RegistryFetchItem {
  registryCode: DpsRegistryCode;
  result: DpsRegistryFetchResult;
}

interface RegistryFetchMap {
  registration?: RegistryFetchItem;
  ev?: RegistryFetchItem;
  pdv_act?: RegistryFetchItem;
  'non-profit'?: RegistryFetchItem;
}

export interface BuildClientPrefillFromDpsInput {
  tenantId: string;
  actorProfileId?: string;
  taxIdType: DpsTaxIdType;
  taxId: string;
  accountantIds?: string[];
  registries?: DpsRegistryCode[];
}

export type BuildClientPrefillFromDpsResult = DpsClientPrefillResult;

// Тимчасові помилки ДПС — не пов'язані з токеном
const DPS_TRANSIENT_PATTERNS = [
  'технічні роботи',   // "Ведуться технічні роботи"
  'воєнного стану',    // "На період дії воєнного стану обмежено доступ..."
  'обмежено доступ',
  'тимчасово',
  'недоступн',
  'maintenance',
  'service unavailable',
];

// Помилки, що вказують саме на проблему токена
const DPS_TOKEN_FAILURE_PATTERNS = [
  'токен', 'token',
  'unauthor', 'forbidden', 'invalid', 'denied',
  'відхилено', 'скасовано',
  '401', '403',
];

function looksLikeTransientDpsError(message: string): boolean {
  const n = message.toLowerCase();
  return DPS_TRANSIENT_PATTERNS.some((p) => n.includes(p));
}

function looksLikeTokenAuthFailure(message: string): boolean {
  const n = message.toLowerCase();
  // Тимчасова недоступність — не проблема токена
  if (looksLikeTransientDpsError(n)) return false;
  return DPS_TOKEN_FAILURE_PATTERNS.some((p) => n.includes(p));
}

function buildPrefillFailureMessage(registryItems: RegistryFetchItem[]): string {
  const chunks = registryItems.map((item) => {
    const details = item.result.statusMessage?.trim() || 'Unknown DPS error';
    return `${item.registryCode}: ${details}`;
  });

  return chunks.join(' | ').slice(0, 1200);
}

function shouldLogDpsPrefillDebug(): boolean {
  const flag = process.env.DPS_PREFILL_DEBUG_LOG?.trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

function buildDpsPrefillDebugPayload(input: {
  tenantId: string;
  taxIdType: DpsTaxIdType;
  taxId: string;
  tokenOwnerProfileId: string;
  tokenMasked: string;
  registryItems: RegistryFetchItem[];
  suggestion: DpsClientPrefillSuggestion;
}): NonNullable<DpsClientPrefillResult['debug']> {
  return {
    at: new Date().toISOString(),
    tenantId: input.tenantId,
    taxIdType: input.taxIdType,
    taxId: input.taxId,
    tokenOwnerProfileId: input.tokenOwnerProfileId,
    tokenMasked: input.tokenMasked,
    suggestion: input.suggestion,
    registries: input.registryItems.map((item) => ({
      registryCode: item.registryCode,
      status: item.result.status,
      statusMessage: item.result.statusMessage ?? null,
      normalizedPayload: item.result.normalizedPayload,
      rawPayload: item.result.rawPayload,
    })),
  };
}

function logDpsPrefillDebug(payload: NonNullable<DpsClientPrefillResult['debug']>): void {
  if (!shouldLogDpsPrefillDebug()) return;

  try {
    console.info(`[dps_prefill_debug] ${JSON.stringify(payload)}`);
  } catch {
    console.info('[dps_prefill_debug]', payload);
  }
}

function parseSingleTaxGroupFromText(value: string | undefined): 1 | 2 | 3 | 4 | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();

  // RCLASS з реєстру ev повертає просто цифру: "1", "2", "3", "4"
  if (normalized === '1' || normalized === '2' || normalized === '3' || normalized === '4') {
    return Number(normalized) as 1 | 2 | 3 | 4;
  }

  // Варіант "3 група", "3-я група", "3 group"
  const leadingMatch = normalized.match(/(?:^|[^0-9])([1-4])\s*(?:-|—)?\s*(?:груп|group)/u);
  if (leadingMatch) {
    return Number(leadingMatch[1]) as 1 | 2 | 3 | 4;
  }

  // Варіант "група 3", "group 3"
  const trailingMatch = normalized.match(/(?:груп|group)\s*(?:-|—)?\s*([1-4])/u);
  if (trailingMatch) {
    return Number(trailingMatch[1]) as 1 | 2 | 3 | 4;
  }

  return undefined;
}

function hasNgoMarker(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name.toUpperCase();
  return (
    normalized.includes('ГРОМАДСЬК')
    || normalized.includes('БЛАГОД')
    || normalized.includes('ФОНД')
    || normalized.includes('ОБ`ЄДНАН')
    || normalized.includes('ОБʼЄДНАН')
    || normalized.includes('ГО ')
    || normalized.startsWith('ГО«')
    || normalized.startsWith('ГО "')
  );
}

function hasLlcMarker(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name.toUpperCase();
  return (
    normalized.includes('ТОВ')
    || normalized.includes('ПП')
    || normalized.includes('АТ')
    || normalized.includes('ПРАТ')
    || normalized.includes('КП')
  );
}

function formatActivity(activityCode?: string, activityName?: string): string | undefined {
  const code = activityCode?.trim();
  const name = activityName?.trim();
  if (code && name) return `${name} (КВЕД ${code})`;
  if (name) return name;
  if (code) return `КВЕД ${code}`;
  return undefined;
}

function makeRegistryMap(items: RegistryFetchItem[]): RegistryFetchMap {
  const map: RegistryFetchMap = {};
  items.forEach((item) => {
    map[item.registryCode] = item;
  });
  return map;
}

function inferVatPayer(registryMap: RegistryFetchMap): boolean | undefined {
  const vatResult = registryMap.pdv_act?.result.normalizedPayload;
  if (vatResult?.isFound) {
    return vatResult.isVatPayer;
  }

  const evResult = registryMap.ev?.result.normalizedPayload;
  if (evResult?.isFound) {
    return evResult.isVatPayer;
  }

  return undefined;
}

function inferTaxSystem(registryMap: RegistryFetchMap, vatPayer: boolean | undefined): TaxSystem | undefined {
  const nonProfit = registryMap['non-profit']?.result.normalizedPayload;
  if (nonProfit?.isFound) {
    return 'non_profit';
  }

  const ev = registryMap.ev?.result.normalizedPayload;
  if (ev?.isFound) {
    const group = parseSingleTaxGroupFromText(ev.taxSystem);
    if (group === 1) return 'single_tax_group1';
    if (group === 2) return 'single_tax_group2';
    if (group === 3) return vatPayer ? 'single_tax_group3_vat' : 'single_tax_group3';
    if (group === 4) return 'single_tax_group4';

    const normalizedSystem = ev.taxSystem?.toLowerCase();
    if (normalizedSystem?.includes('загаль')) {
      return vatPayer ? 'general_vat' : 'general_no_vat';
    }
  }

  if (vatPayer === true) {
    return 'general_vat';
  }

  if (vatPayer === false && (ev?.isFound || registryMap.pdv_act?.result.normalizedPayload.isFound)) {
    return 'general_no_vat';
  }

  return undefined;
}

function inferClientType(
  taxIdType: DpsTaxIdType,
  subjectName: string | undefined,
  registryMap: RegistryFetchMap
): ClientType | undefined {
  const normalizedName = subjectName?.toUpperCase();
  if (registryMap['non-profit']?.result.normalizedPayload.isFound) {
    return 'NGO';
  }

  if (normalizedName?.includes('ОСББ')) {
    return 'OSBB';
  }

  if (hasNgoMarker(subjectName)) {
    return 'NGO';
  }

  if (taxIdType === 'rnokpp') {
    return 'FOP';
  }

  if (hasLlcMarker(subjectName) || taxIdType === 'edrpou') {
    return 'LLC';
  }

  return undefined;
}

function inferIndustry(registryMap: RegistryFetchMap): string | undefined {
  const registration = registryMap.registration?.result.normalizedPayload;
  const ev = registryMap.ev?.result.normalizedPayload;
  const vat = registryMap.pdv_act?.result.normalizedPayload;
  const nonProfit = registryMap['non-profit']?.result.normalizedPayload;

  return (
    formatActivity(registration?.activityCode, registration?.activityName)
    ?? formatActivity(registration?.activityCode, undefined)
    ?? formatActivity(ev?.activityCode, ev?.activityName)
    ?? formatActivity(vat?.activityCode, vat?.activityName)
    ?? formatActivity(nonProfit?.activityCode, nonProfit?.activityName)
  );
}

function inferDpsOfficeName(registryMap: RegistryFetchMap): string | undefined {
  return (
    registryMap.registration?.result.normalizedPayload.dpsOfficeName
    ?? registryMap.ev?.result.normalizedPayload.dpsOfficeName
  );
}

function inferDpsOfficeCode(registryMap: RegistryFetchMap): string | undefined {
  return (
    registryMap.registration?.result.normalizedPayload.dpsOfficeCode
    ?? registryMap.ev?.result.normalizedPayload.dpsOfficeCode
  );
}

function inferTaxRegistrationDate(registryMap: RegistryFetchMap): string | undefined {
  // D_REG_STI — дата взяття на облік (registration реєстр — головний)
  return (
    registryMap.registration?.result.normalizedPayload.registrationDate
    ?? registryMap.ev?.result.normalizedPayload.registrationDate
  );
}

function inferSimplifiedSystemDate(registryMap: RegistryFetchMap): string | undefined {
  // DATE_ACC_ERS — дата включення до реєстру ЄП / переходу на спрощену
  return registryMap.ev?.result.normalizedPayload.simplifiedSystemDate;
}

function inferSingleTaxGroup(registryMap: RegistryFetchMap): 1 | 2 | 3 | 4 | undefined {
  const taxSystemRaw = registryMap.ev?.result.normalizedPayload.taxSystem;
  return parseSingleTaxGroupFromText(taxSystemRaw);
}

function inferTaxAddress(registryMap: RegistryFetchMap): string | undefined {
  return (
    registryMap.registration?.result.normalizedPayload.address
    ?? registryMap.ev?.result.normalizedPayload.address
  );
}

function inferVedLic(registryMap: RegistryFetchMap): string | undefined {
  return registryMap.registration?.result.normalizedPayload.vedLic;
}

function pickPrimarySubjectName(registryMap: RegistryFetchMap): string | undefined {
  return (
    registryMap.registration?.result.normalizedPayload.subjectName
    ?? registryMap.ev?.result.normalizedPayload.subjectName
    ?? registryMap.pdv_act?.result.normalizedPayload.subjectName
    ?? registryMap['non-profit']?.result.normalizedPayload.subjectName
  );
}

function buildAutofillNotes(registryMap: RegistryFetchMap): string | undefined {
  const notes: string[] = [];

  const registration = registryMap.registration?.result.normalizedPayload;
  if (registration?.isFound && registration.registrationDate) {
    notes.push(`Дата взяття на облік: ${registration.registrationDate}.`);
  }
  if (registration?.isFound && registration.dpsOfficeName) {
    notes.push(
      registration.dpsOfficeCode
        ? `Основний орган ДПС: ${registration.dpsOfficeName} (${registration.dpsOfficeCode}).`
        : `Основний орган ДПС: ${registration.dpsOfficeName}.`
    );
  }
  if (registration?.isFound && registration.address) {
    notes.push(`Податкова адреса: ${registration.address}.`);
  }
  if (registration?.isFound && registration.registrationState) {
    notes.push(`Стан обліку: ${registration.registrationState}.`);
  }
  if (registration?.isFound && registration.note) {
    notes.push(`Коментар реєстру обліку: ${registration.note}.`);
  }

  const ev = registryMap.ev?.result.normalizedPayload;
  if (ev?.isFound && ev.dpsOfficeName) {
    notes.push(
      ev.dpsOfficeCode
        ? `Податкова: ${ev.dpsOfficeName} (${ev.dpsOfficeCode}).`
        : `Податкова: ${ev.dpsOfficeName}.`
    );
  }
  if (ev?.isFound && ev.simplifiedSystemDate) {
    notes.push(`Дата переходу на спрощену систему: ${ev.simplifiedSystemDate}.`);
  }
  if (ev?.isFound && ev.registrationDate) {
    notes.push(`Дата реєстрації: ${ev.registrationDate}.`);
  }
  if (ev?.isFound && ev.address) {
    notes.push(`Адреса: ${ev.address}.`);
  }
  if (ev?.isFound) {
    const activity = formatActivity(ev.activityCode, ev.activityName);
    if (activity) {
      notes.push(`Вид діяльності: ${activity}.`);
    }
  }
  if (ev?.isFound && ev.registrationState) {
    notes.push(`Статус запису ЄП: ${ev.registrationState}.`);
  }
  if (ev?.isFound && ev.note) {
    notes.push(`Коментар ЄП: ${ev.note}.`);
  }

  const vat = registryMap.pdv_act?.result.normalizedPayload;
  if (vat?.isFound && vat.registrationDate) {
    notes.push(`Реєстрація ПДВ: ${vat.registrationDate}.`);
  }
  if (vat?.isFound && vat.registrationState) {
    notes.push(`Статус ПДВ: ${vat.registrationState}.`);
  }
  if (vat?.isFound && vat.note) {
    notes.push(`Коментар ПДВ: ${vat.note}.`);
  }

  const nonProfit = registryMap['non-profit']?.result.normalizedPayload;
  if (nonProfit?.isFound && nonProfit.registrationDate) {
    notes.push(`Дата включення до реєстру неприбуткових: ${nonProfit.registrationDate}.`);
  }
  if (nonProfit?.isFound && nonProfit.registrationState) {
    notes.push(`Ознака неприбутковості: ${nonProfit.registrationState}.`);
  }
  if (nonProfit?.isFound && nonProfit.note) {
    notes.push(`Неприбутковий статус: ${nonProfit.note}.`);
  }

  if (notes.length === 0) return undefined;
  return `Автозаповнення з ДПС (${new Date().toISOString().slice(0, 10)}): ${notes.join(' ')}`;
}

export function buildClientPrefillSuggestion(
  taxIdType: DpsTaxIdType,
  registryItems: RegistryFetchItem[]
): DpsClientPrefillSuggestion {
  const registryMap = makeRegistryMap(registryItems);
  const name = pickPrimarySubjectName(registryMap);
  const isVatPayer = inferVatPayer(registryMap);

  return {
    name,
    type: inferClientType(taxIdType, name, registryMap),
    tax_system: inferTaxSystem(registryMap, isVatPayer),
    is_vat_payer: isVatPayer,
    industry: inferIndustry(registryMap),
    notes: buildAutofillNotes(registryMap),
    // Structured DPS fields
    dps_office_name: inferDpsOfficeName(registryMap),
    dps_office_code: inferDpsOfficeCode(registryMap),
    tax_registration_date: inferTaxRegistrationDate(registryMap),
    simplified_system_date: inferSimplifiedSystemDate(registryMap),
    single_tax_group: inferSingleTaxGroup(registryMap),
    tax_address: inferTaxAddress(registryMap),
    ved_lic: inferVedLic(registryMap),
  };
}

export async function buildClientPrefillFromDps(
  db: SupabaseClient,
  input: BuildClientPrefillFromDpsInput
): Promise<BuildClientPrefillFromDpsResult> {
  const profileCandidates = [
    ...(input.accountantIds ?? []),
    ...(input.actorProfileId ? [input.actorProfileId] : []),
  ];

  const resolvedToken = await resolveTokenForProfiles({
    db,
    tenantId: input.tenantId,
    profileIds: profileCandidates,
    fallbackToAnyAccountant: true,
  });

  if (!resolvedToken) {
    throw new Error('DPS_TOKEN_NOT_FOUND_FOR_PREFILL');
  }

  const registries = input.registries?.length ? input.registries : [...DPS_PREFILL_REGISTRY_CODES];
  const dpsClient = new DpsPublicApiClient();

  const registryItems = await Promise.all(
    registries.map(async (registryCode): Promise<RegistryFetchItem> => ({
      registryCode,
      result: await dpsClient.fetchRegistryByTaxId({
        registryCode,
        taxId: input.taxId,
        token: resolvedToken.token,
      }),
    }))
  );

  const suggestion = buildClientPrefillSuggestion(input.taxIdType, registryItems);
  const debugPayload = buildDpsPrefillDebugPayload({
    tenantId: input.tenantId,
    taxIdType: input.taxIdType,
    taxId: input.taxId,
    tokenOwnerProfileId: resolvedToken.profileId,
    tokenMasked: resolvedToken.maskedToken,
    registryItems,
    suggestion,
  });
  logDpsPrefillDebug(debugPayload);

  const failedItems = registryItems.filter((item) => item.result.status === 'error');

  if (failedItems.length === registryItems.length) {
    // Всі реєстри з помилкою — аналізуємо причину
    const diagnostics = buildPrefillFailureMessage(failedItems);
    const allMessages = failedItems.map((item) => item.result.statusMessage ?? '');

    const isTokenLikelyInvalid = allMessages.every(looksLikeTokenAuthFailure);
    const isTransientError = allMessages.some(looksLikeTransientDpsError);

    if (isTokenLikelyInvalid) {
      throw new Error(`DPS_PREFILL_TOKEN_INVALID:${diagnostics}`);
    }

    if (isTransientError) {
      throw new Error(`DPS_PREFILL_UNAVAILABLE:${diagnostics}`);
    }

    throw new Error(`DPS_PREFILL_FETCH_FAILED:${diagnostics}`);
  }

  // Часткові збої — збираємо попередження для UI
  const warnings: string[] = [];
  for (const item of failedItems) {
    const msg = item.result.statusMessage ?? '';
    if (msg.includes('воєнного стану') || msg.includes('обмежено доступ')) {
      warnings.push(`Реєстр "${item.registryCode}" тимчасово обмежено на період воєнного стану.`);
    } else if (looksLikeTransientDpsError(msg)) {
      warnings.push(`Реєстр "${item.registryCode}" тимчасово недоступний. Деякі дані можуть бути неповними.`);
    }
  }

  const tokenRepo = new DpsTokenRepo(db, { tenantId: input.tenantId } as TenantContext);
  await tokenRepo.touchLastUsed(resolvedToken.tokenRecordId);

  return {
    taxIdType: input.taxIdType,
    taxId: input.taxId,
    tokenMasked: resolvedToken.maskedToken,
    tokenOwnerProfileId: resolvedToken.profileId,
    suggestion,
    sources: registryItems.map((item) => ({
      registry_code: item.registryCode,
      status: item.result.status,
      is_found: item.result.normalizedPayload.isFound,
      subject_name: item.result.normalizedPayload.subjectName,
      checked_at: item.result.normalizedPayload.checkedAt,
    })),
    warnings: warnings.length > 0 ? warnings : undefined,
    debug: shouldLogDpsPrefillDebug() ? debugPayload : undefined,
  };
}
