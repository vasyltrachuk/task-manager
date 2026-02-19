export const DPS_REGISTRY_CODES = ['ev', 'pdv_act', 'non-profit', 'registration'] as const;
export const DPS_SYNC_REGISTRY_CODES = ['ev', 'pdv_act', 'non-profit'] as const;
export const DPS_PREFILL_REGISTRY_CODES = ['registration', 'ev', 'pdv_act', 'non-profit'] as const;

export type DpsRegistryCode = (typeof DPS_REGISTRY_CODES)[number];
export type DpsSnapshotStatus = 'ok' | 'not_found' | 'error' | 'stale';
export type DpsSyncRunStatus = 'running' | 'completed' | 'partial' | 'failed' | 'skipped_no_token';
export type DpsSyncSource = 'manual' | 'daily' | 'cron';

export interface DpsNormalizedRegistryPayload {
  registryCode: DpsRegistryCode;
  taxId: string;
  checkedAt: string;
  isFound: boolean;
  subjectName?: string;
  isVatPayer?: boolean;
  taxSystem?: string;
  simplifiedSystemDate?: string;
  registrationDate?: string;
  dpsOfficeName?: string;
  dpsOfficeCode?: string;
  address?: string;
  activityCode?: string;
  activityName?: string;
  registrationState?: string;
  note?: string;
  // registration реєстр: КВЕД + ліцензійна діяльність (поле VED_LIC)
  vedLic?: string;
}

export interface DpsRegistryFetchResult {
  status: DpsSnapshotStatus;
  rawPayload: unknown;
  normalizedPayload: DpsNormalizedRegistryPayload;
  statusMessage?: string;
}

export interface DpsTokenStatus {
  hasToken: boolean;
  maskedToken: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
}

export interface DpsSyncSummary {
  runId: string;
  status: DpsSyncRunStatus;
  requestCount: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  startedAt: string;
  endedAt: string;
}

export interface DpsPrivateActionResult {
  action: string;
  success: boolean;
  response: unknown;
}

export interface DpsKepProfileInput {
  keyOwnerName: string;
  keyOwnerTaxId: string;
  certSubject?: string | null;
  certIssuer?: string | null;
  certSerial?: string | null;
  certValidTo?: string | null;
  notes?: string | null;
}
