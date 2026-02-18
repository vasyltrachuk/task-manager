import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import {
  DPS_REGISTRY_CODES,
  type DpsRegistryCode,
  type DpsSyncSource,
  type DpsSyncSummary,
  type DpsSyncRunStatus,
} from './contracts';
import { DpsPublicApiClient } from './dps-client';
import { DpsSnapshotRepo } from './snapshot.repo';
import { DpsSyncRunRepo } from './sync.repo';
import { resolveTokenForClient } from './resolve-token';
import { DpsTokenRepo } from './token.repo';
import { isUuid } from './client-resolution';

const SNAPSHOT_TTL_HOURS = 24;

interface ClientLite {
  id: string;
  tax_id: string;
  status: string;
}

export interface RunDpsSyncInput {
  tenantId: string;
  actorProfileId?: string;
  source: DpsSyncSource;
  clientId?: string;
  clientTaxId?: string;
  registries?: DpsRegistryCode[];
  force?: boolean;
}

interface Counters {
  requestCount: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  skippedNoTokenClients: number;
}

function calculateRunStatus(counters: Counters): DpsSyncRunStatus {
  if (counters.requestCount === 0 && counters.skippedNoTokenClients > 0) return 'skipped_no_token';
  if (counters.errorCount === 0) return 'completed';
  if (counters.successCount > 0 || counters.skippedCount > 0) return 'partial';
  return 'failed';
}

async function logAudit(
  db: SupabaseClient,
  tenantId: string,
  actorId: string | undefined,
  action: string,
  entityId: string,
  meta: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId ?? null,
    entity: 'dps_sync_runs',
    entity_id: entityId,
    action,
    meta,
  });

  if (error) {
    // Audit failures should not break sync.
  }
}

async function getTargetClients(db: SupabaseClient, input: RunDpsSyncInput): Promise<ClientLite[]> {
  let query = db
    .from('clients')
    .select('id, tax_id, status')
    .eq('tenant_id', input.tenantId);

  if (input.clientId) {
    if (isUuid(input.clientId)) {
      query = query.eq('id', input.clientId);
    } else if (input.clientTaxId) {
      query = query.eq('tax_id', input.clientTaxId);
    } else {
      throw new Error('Field "clientId" must be UUID or provide "clientTaxId" fallback');
    }
  } else if (input.clientTaxId) {
    query = query.eq('tax_id', input.clientTaxId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[dps_sync_get_clients] ${error.message}`);
  }

  return ((data ?? []) as ClientLite[]).filter((client) => client.status !== 'archived');
}

export async function runDpsSync(db: SupabaseClient, input: RunDpsSyncInput): Promise<DpsSyncSummary> {
  const ctx = { tenantId: input.tenantId } as TenantContext;
  const registries = input.registries?.length ? input.registries : [...DPS_REGISTRY_CODES];
  const source = input.source;
  const force = Boolean(input.force);

  const syncRepo = new DpsSyncRunRepo(db, ctx);
  const snapshotRepo = new DpsSnapshotRepo(db, ctx);
  const tokenRepo = new DpsTokenRepo(db, ctx);
  const dpsClient = new DpsPublicApiClient();

  const run = await syncRepo.startRun({
    triggeredByProfileId: input.actorProfileId,
    scope: input.clientId ? 'client' : 'full',
    clientId: input.clientId,
    source,
    meta: {
      registries,
      force,
    },
  });

  const counters: Counters = {
    requestCount: 0,
    successCount: 0,
    skippedCount: 0,
    errorCount: 0,
    skippedNoTokenClients: 0,
  };

  try {
    const clients = await getTargetClients(db, input);

    for (const client of clients) {
      const resolvedToken = await resolveTokenForClient({
        db,
        tenantId: input.tenantId,
        clientId: client.id,
      });

      if (!resolvedToken) {
        counters.skippedNoTokenClients += 1;
        counters.skippedCount += registries.length;
        continue;
      }

      const freshSet = force
        ? new Set<DpsRegistryCode>()
        : await snapshotRepo.getFreshSnapshotRegistrySet(client.id, new Date().toISOString());

      for (const registryCode of registries) {
        if (!force && freshSet.has(registryCode)) {
          counters.skippedCount += 1;
          continue;
        }

        counters.requestCount += 1;

        const fetchedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_HOURS * 60 * 60 * 1000).toISOString();

        const result = await dpsClient.fetchRegistryByTaxId({
          registryCode,
          taxId: client.tax_id,
          token: resolvedToken.token,
        });

        await snapshotRepo.upsertSnapshot({
          clientId: client.id,
          registryCode,
          status: result.status,
          normalizedPayload: result.normalizedPayload,
          rawPayload: result.rawPayload,
          source,
          fetchedByProfileId: input.actorProfileId,
          fetchedAt,
          expiresAt,
        });

        if (result.status === 'error') {
          counters.errorCount += 1;
          continue;
        }

        counters.successCount += 1;
        await tokenRepo.touchLastUsed(resolvedToken.tokenRecordId);
      }
    }
  } catch (error) {
    counters.errorCount += 1;

    const failedStatus = calculateRunStatus(counters);
    await syncRepo.finishRun({
      runId: run.runId,
      status: failedStatus,
      requestCount: counters.requestCount,
      successCount: counters.successCount,
      skippedCount: counters.skippedCount,
      errorCount: counters.errorCount,
      meta: {
        ...(error instanceof Error ? { error: error.message } : { error: 'Unknown sync error' }),
      },
    });

    await logAudit(db, input.tenantId, input.actorProfileId, 'sync_failed', run.runId, {
      requestCount: counters.requestCount,
      successCount: counters.successCount,
      skippedCount: counters.skippedCount,
      errorCount: counters.errorCount,
      error: error instanceof Error ? error.message : 'Unknown sync error',
    });

    throw error;
  }

  const status = calculateRunStatus(counters);
  await syncRepo.finishRun({
    runId: run.runId,
    status,
    requestCount: counters.requestCount,
    successCount: counters.successCount,
    skippedCount: counters.skippedCount,
    errorCount: counters.errorCount,
    meta: {
      skippedNoTokenClients: counters.skippedNoTokenClients,
    },
  });

  await logAudit(db, input.tenantId, input.actorProfileId, 'sync_finished', run.runId, {
    status,
    requestCount: counters.requestCount,
    successCount: counters.successCount,
    skippedCount: counters.skippedCount,
    errorCount: counters.errorCount,
    skippedNoTokenClients: counters.skippedNoTokenClients,
  });

  return {
    runId: run.runId,
    status,
    requestCount: counters.requestCount,
    successCount: counters.successCount,
    skippedCount: counters.skippedCount,
    errorCount: counters.errorCount,
    startedAt: run.startedAt,
    endedAt: new Date().toISOString(),
  };
}
