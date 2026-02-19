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
  industry?: string;
  notes?: string;
  // Structured DPS fields — for display and extended autofill
  dps_office_name?: string;         // Найменування ДПІ за основним місцем обліку
  dps_office_code?: string;         // Код органу ДПС
  registration_date?: string;       // Дата реєстрації ФОП/ЮО (з registration або ev реєстру)
  tax_registration_date?: string;   // Дата взяття на облік платника податків (D_REG_STI)
  simplified_system_date?: string;  // Дата переходу на спрощену систему (DATE_ACC_ERS з ev)
  single_tax_group?: 1 | 2 | 3 | 4; // Група єдиного податку (з RCLASS)
  tax_address?: string;             // Податкова адреса (ADRESS з registration)
  ved_lic?: string;                 // КВЕД + ліцензії (VED_LIC з registration)
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
  /** Попередження про часткові збої реєстрів (наприклад, pdv_act заблоковано воєнним станом) */
  warnings?: string[];
  debug?: {
    at: string;
    tenantId: string;
    taxIdType: ClientTaxIdType;
    taxId: string;
    tokenOwnerProfileId: string;
    tokenMasked: string;
    suggestion: DpsClientPrefillSuggestion;
    registries: Array<{
      registryCode: DpsRegistryCode;
      status: DpsSnapshotStatus;
      statusMessage: string | null;
      normalizedPayload: unknown;
      rawPayload: unknown;
    }>;
  };
}
