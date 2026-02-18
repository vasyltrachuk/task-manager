import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import type { DpsSyncRunStatus, DpsSyncSource } from './contracts';
import { isMissingTableError } from './supabase-errors';

interface StartSyncRunInput {
  triggeredByProfileId?: string;
  scope: 'full' | 'client';
  clientId?: string;
  source: DpsSyncSource;
  meta?: Record<string, unknown>;
}

interface FinishSyncRunInput {
  runId: string;
  status: DpsSyncRunStatus;
  requestCount: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  meta?: Record<string, unknown>;
}

export class DpsSyncRunRepo {
  private readonly db: SupabaseClient;
  private readonly tenantId: string;

  constructor(db: SupabaseClient, ctx: TenantContext) {
    this.db = db;
    this.tenantId = ctx.tenantId;
  }

  async startRun(input: StartSyncRunInput): Promise<{ runId: string; startedAt: string }> {
    const { data, error } = await this.db
      .from('dps_sync_runs')
      .insert({
        tenant_id: this.tenantId,
        triggered_by_profile_id: input.triggeredByProfileId ?? null,
        scope: input.scope,
        client_id: input.clientId ?? null,
        source: input.source,
        status: 'running',
        meta: input.meta ?? {},
      })
      .select('id, started_at')
      .single();

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_start_run] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error || !data) {
      throw new Error(`[dps_start_run] ${error?.message ?? 'No data returned'}`);
    }

    return {
      runId: data.id,
      startedAt: data.started_at,
    };
  }

  async finishRun(input: FinishSyncRunInput): Promise<void> {
    const { error } = await this.db
      .from('dps_sync_runs')
      .update({
        status: input.status,
        request_count: input.requestCount,
        success_count: input.successCount,
        skipped_count: input.skippedCount,
        error_count: input.errorCount,
        ended_at: new Date().toISOString(),
        meta: input.meta ?? {},
      })
      .eq('tenant_id', this.tenantId)
      .eq('id', input.runId);

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_finish_run] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error) {
      throw new Error(`[dps_finish_run] ${error.message}`);
    }
  }

  async getRecentRuns(triggeredByProfileId: string, limit = 10): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await this.db
      .from('dps_sync_runs')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('triggered_by_profile_id', triggeredByProfileId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error && isMissingTableError(error)) {
      return [];
    }

    if (error) {
      throw new Error(`[dps_recent_runs] ${error.message}`);
    }

    return data ?? [];
  }

  async getLatestClientRun(clientId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.db
      .from('dps_sync_runs')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return null;
    }

    if (error) {
      throw new Error(`[dps_latest_client_run] ${error.message}`);
    }

    return data;
  }
}
