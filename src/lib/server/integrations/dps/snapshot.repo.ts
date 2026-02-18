import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import type { DpsKepProfileInput, DpsRegistryCode, DpsSnapshotStatus, DpsSyncSource } from './contracts';
import { isMissingTableError } from './supabase-errors';

interface SnapshotRow {
  registry_code: DpsRegistryCode;
  status: DpsSnapshotStatus;
  normalized_payload: unknown;
  raw_payload: unknown;
  fetched_at: string;
  expires_at: string;
  source: DpsSyncSource;
}

export class DpsSnapshotRepo {
  private readonly db: SupabaseClient;
  private readonly tenantId: string;

  constructor(db: SupabaseClient, ctx: TenantContext) {
    this.db = db;
    this.tenantId = ctx.tenantId;
  }

  async getClientSnapshots(clientId: string): Promise<SnapshotRow[]> {
    const { data, error } = await this.db
      .from('dps_registry_snapshots')
      .select('registry_code, status, normalized_payload, raw_payload, fetched_at, expires_at, source')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .order('registry_code', { ascending: true });

    if (error && isMissingTableError(error)) {
      return [];
    }

    if (error) {
      throw new Error(`[dps_get_snapshots] ${error.message}`);
    }

    return (data ?? []) as SnapshotRow[];
  }

  async getFreshSnapshotRegistrySet(clientId: string, nowIso: string): Promise<Set<DpsRegistryCode>> {
    const { data, error } = await this.db
      .from('dps_registry_snapshots')
      .select('registry_code, expires_at')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .gt('expires_at', nowIso);

    if (error && isMissingTableError(error)) {
      return new Set();
    }

    if (error) {
      throw new Error(`[dps_get_fresh_snapshot_set] ${error.message}`);
    }

    return new Set(
      (data ?? []).map((row) => row.registry_code as DpsRegistryCode)
    );
  }

  async upsertSnapshot(input: {
    clientId: string;
    registryCode: DpsRegistryCode;
    status: DpsSnapshotStatus;
    normalizedPayload: unknown;
    rawPayload: unknown;
    source: DpsSyncSource;
    fetchedByProfileId?: string;
    fetchedAt: string;
    expiresAt: string;
  }): Promise<void> {
    const { error } = await this.db
      .from('dps_registry_snapshots')
      .upsert(
        {
          tenant_id: this.tenantId,
          client_id: input.clientId,
          registry_code: input.registryCode,
          status: input.status,
          normalized_payload: input.normalizedPayload,
          raw_payload: input.rawPayload,
          source: input.source,
          fetched_by_profile_id: input.fetchedByProfileId ?? null,
          fetched_at: input.fetchedAt,
          expires_at: input.expiresAt,
        },
        {
          onConflict: 'tenant_id,client_id,registry_code',
        }
      );

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_upsert_snapshot] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error) {
      throw new Error(`[dps_upsert_snapshot] ${error.message}`);
    }
  }

  async getKepProfile(clientId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.db
      .from('dps_client_kep_profiles')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return null;
    }

    if (error) {
      throw new Error(`[dps_get_kep_profile] ${error.message}`);
    }

    return data;
  }

  async upsertKepProfile(clientId: string, input: DpsKepProfileInput): Promise<Record<string, unknown>> {
    const certValidTo = input.certValidTo ? new Date(input.certValidTo).toISOString() : null;

    const { data, error } = await this.db
      .from('dps_client_kep_profiles')
      .upsert(
        {
          tenant_id: this.tenantId,
          client_id: clientId,
          key_owner_name: input.keyOwnerName,
          key_owner_tax_id: input.keyOwnerTaxId,
          cert_subject: input.certSubject ?? null,
          cert_issuer: input.certIssuer ?? null,
          cert_serial: input.certSerial ?? null,
          cert_valid_to: certValidTo,
          notes: input.notes ?? null,
          last_verified_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id,client_id',
        }
      )
      .select('*')
      .single();

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_upsert_kep_profile] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error || !data) {
      throw new Error(`[dps_upsert_kep_profile] ${error?.message ?? 'No data returned'}`);
    }

    return data;
  }
}
