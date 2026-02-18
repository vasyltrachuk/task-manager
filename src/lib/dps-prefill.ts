import type {
  ClientTaxIdType,
  ClientType,
  DpsRegistryCode,
  DpsSnapshotStatus,
  TaxSystem,
} from './types';

export interface DpsClientPrefillInput {
  taxIdType: ClientTaxIdType;
  taxId: string;
  accountantIds?: string[];
  registries?: DpsRegistryCode[];
}

export interface DpsClientPrefillSuggestion {
  name?: string;
  type?: ClientType;
  tax_system?: TaxSystem;
  is_vat_payer?: boolean;
  notes?: string;
}

export interface DpsClientPrefillSource {
  registry_code: DpsRegistryCode;
  status: DpsSnapshotStatus;
  is_found: boolean;
  subject_name?: string;
  checked_at: string;
}

export interface DpsClientPrefillResult {
  taxIdType: ClientTaxIdType;
  taxId: string;
  tokenMasked: string;
  tokenOwnerProfileId: string;
  suggestion: DpsClientPrefillSuggestion;
  sources: DpsClientPrefillSource[];
}
