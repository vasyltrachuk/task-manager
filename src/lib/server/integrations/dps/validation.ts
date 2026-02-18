import { DPS_REGISTRY_CODES, type DpsRegistryCode } from './contracts';

const registrySet = new Set<string>(DPS_REGISTRY_CODES);

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
