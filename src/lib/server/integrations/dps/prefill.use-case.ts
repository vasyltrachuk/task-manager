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
  DPS_REGISTRY_CODES,
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

function parseSingleTaxGroupFromText(value: string | undefined): 1 | 2 | 3 | 4 | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  const leadingMatch = normalized.match(/(?:^|[^0-9])([1-4])\s*(?:-|—)?\s*(?:груп|group)/u);
  if (leadingMatch) {
    return Number(leadingMatch[1]) as 1 | 2 | 3 | 4;
  }

  const trailingMatch = normalized.match(/(?:груп|group)\s*(?:-|—)?\s*([1-4])/u);
  if (trailingMatch) {
    return Number(trailingMatch[1]) as 1 | 2 | 3 | 4;
  }

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
  }

  if (vatPayer === true) {
    return 'general_vat';
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

  if (taxIdType === 'rnokpp') {
    return 'FOP';
  }

  return undefined;
}

function pickPrimarySubjectName(registryMap: RegistryFetchMap): string | undefined {
  return (
    registryMap.ev?.result.normalizedPayload.subjectName
    ?? registryMap.pdv_act?.result.normalizedPayload.subjectName
    ?? registryMap['non-profit']?.result.normalizedPayload.subjectName
  );
}

function buildAutofillNotes(registryMap: RegistryFetchMap): string | undefined {
  const notes: string[] = [];

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

  const vat = registryMap.pdv_act?.result.normalizedPayload;
  if (vat?.isFound && vat.registrationDate) {
    notes.push(`Реєстрація ПДВ: ${vat.registrationDate}.`);
  }

  const nonProfit = registryMap['non-profit']?.result.normalizedPayload;
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
    notes: buildAutofillNotes(registryMap),
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

  const registries = input.registries?.length ? input.registries : [...DPS_REGISTRY_CODES];
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

  if (registryItems.every((item) => item.result.status === 'error')) {
    throw new Error('DPS_PREFILL_FETCH_FAILED');
  }

  const tokenRepo = new DpsTokenRepo(db, { tenantId: input.tenantId } as TenantContext);
  await tokenRepo.touchLastUsed(resolvedToken.tokenRecordId);

  return {
    taxIdType: input.taxIdType,
    taxId: input.taxId,
    tokenMasked: resolvedToken.maskedToken,
    tokenOwnerProfileId: resolvedToken.profileId,
    suggestion: buildClientPrefillSuggestion(input.taxIdType, registryItems),
    sources: registryItems.map((item) => ({
      registry_code: item.registryCode,
      status: item.result.status,
      is_found: item.result.normalizedPayload.isFound,
      subject_name: item.result.normalizedPayload.subjectName,
      checked_at: item.result.normalizedPayload.checkedAt,
    })),
  };
}
