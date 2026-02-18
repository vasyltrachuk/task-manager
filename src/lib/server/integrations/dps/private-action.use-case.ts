import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DpsPrivateActionResult } from './contracts';
import { DpsPrivateApiClient } from './dps-private-client';

const PRIVATE_ACTION_WINDOW_MS = 30_000;
const privateActionWindow = new Map<string, number>();

interface RunPrivateActionInput {
  tenantId: string;
  clientId: string;
  actorProfileId?: string;
  action: string;
  payload: Record<string, unknown>;
  keyPassword: string;
  keyFile: Buffer;
}

export function checkPrivateActionRateLimit(
  tenantId: string,
  clientId: string,
  action: string,
  now = Date.now()
): void {
  const key = `${tenantId}:${clientId}:${action}`;
  const prev = privateActionWindow.get(key);

  if (prev && now - prev < PRIVATE_ACTION_WINDOW_MS) {
    throw new Error('RATE_LIMITED_PRIVATE_ACTION');
  }

  privateActionWindow.set(key, now);
}

export function resetPrivateActionRateLimitState(): void {
  privateActionWindow.clear();
}

async function resolveClientTaxId(db: SupabaseClient, tenantId: string, clientId: string): Promise<string> {
  const { data, error } = await db
    .from('clients')
    .select('tax_id')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .single();

  if (error || !data) {
    throw new Error(`[dps_private_client_lookup] ${error?.message ?? 'Client not found'}`);
  }

  return data.tax_id as string;
}

async function logAudit(
  db: SupabaseClient,
  tenantId: string,
  actorId: string | undefined,
  action: string,
  entityId: string,
  meta: Record<string, unknown>
): Promise<void> {
  await db.from('audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId ?? null,
    entity: 'clients',
    entity_id: entityId,
    action,
    meta,
  });
}

export async function runPrivateDpsAction(
  db: SupabaseClient,
  input: RunPrivateActionInput
): Promise<DpsPrivateActionResult> {
  checkPrivateActionRateLimit(input.tenantId, input.clientId, input.action);

  const dpsPrivateClient = new DpsPrivateApiClient();
  const taxId = await resolveClientTaxId(db, input.tenantId, input.clientId);

  await logAudit(db, input.tenantId, input.actorProfileId, 'private_action_started', input.clientId, {
    provider: 'dps',
    action: input.action,
  });

  try {
    const result = await dpsPrivateClient.performPrivateAction({
      action: input.action,
      payload: input.payload,
      keyFile: input.keyFile,
      keyPassword: input.keyPassword,
      taxId,
    });

    await logAudit(db, input.tenantId, input.actorProfileId, 'private_action_executed', input.clientId, {
      provider: 'dps',
      action: input.action,
      success: true,
    });

    return result;
  } catch (error) {
    await logAudit(db, input.tenantId, input.actorProfileId, 'private_action_failed', input.clientId, {
      provider: 'dps',
      action: input.action,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown private action error',
    });

    throw error;
  } finally {
    input.keyFile.fill(0);
  }
}
