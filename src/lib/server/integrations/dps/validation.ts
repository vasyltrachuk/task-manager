import { DPS_REGISTRY_CODES, type DpsRegistryCode } from './contracts';
import type { ClientTaxIdType } from '@/lib/types';

const registrySet = new Set<string>(DPS_REGISTRY_CODES);
const taxIdTypeSet = new Set<string>(['rnokpp', 'edrpou']);

export type DpsTaxIdType = ClientTaxIdType;

export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${fieldName}" must be a non-empty string`);
  }

  return value.trim();
}

export function parseOptionalRegistryList(value: unknown): DpsRegistryCode[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('Field "registries" must be an array');
  }

  const normalized = value.map((item) => {
    if (typeof item !== 'string' || !registrySet.has(item)) {
      throw new Error(`Unsupported registry code: ${String(item)}`);
    }
    return item as DpsRegistryCode;
  });

  return normalized;
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error('Field "force" must be a boolean');
  }

  return value;
}

export function parseOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Field "${fieldName}" must be an array`);
  }

  const normalized = value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`Field "${fieldName}" must contain only non-empty strings`);
    }
    return item.trim();
  });

  return Array.from(new Set(normalized));
}

export function normalizeTaxId(rawValue: string): string {
  return rawValue.replace(/\D/g, '');
}

export function assertTaxIdType(value: unknown): DpsTaxIdType {
  if (typeof value !== 'string' || !taxIdTypeSet.has(value)) {
    throw new Error('Field "taxIdType" must be one of: rnokpp, edrpou');
  }

  return value as DpsTaxIdType;
}

export function assertTaxIdByType(rawTaxId: string, taxIdType: DpsTaxIdType): string {
  const normalizedTaxId = normalizeTaxId(rawTaxId);
  const expectedLength = taxIdType === 'rnokpp' ? 10 : 8;

  if (!/^\d+$/.test(normalizedTaxId) || normalizedTaxId.length !== expectedLength) {
    throw new Error(`Field "taxId" must contain exactly ${expectedLength} digits for ${taxIdType}`);
  }

  return normalizedTaxId;
}
