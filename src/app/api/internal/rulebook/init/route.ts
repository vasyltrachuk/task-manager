import { NextResponse } from 'next/server';
import { initRulebookForTenant } from '@/lib/server/rulebook/init.use-case';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

interface InitPayload {
  tenantId?: string;
  versionCode?: string;
  versionName?: string;
  versionDescription?: string;
  effectiveFrom?: string;
  activateVersion?: boolean;
  replaceRules?: boolean;
}

function parsePayload(rawBody: unknown): InitPayload {
  if (!rawBody || typeof rawBody !== 'object') return {};
  const body = rawBody as Record<string, unknown>;

  return {
    tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
    versionCode: typeof body.versionCode === 'string' ? body.versionCode : undefined,
    versionName: typeof body.versionName === 'string' ? body.versionName : undefined,
    versionDescription:
      typeof body.versionDescription === 'string' ? body.versionDescription : undefined,
    effectiveFrom: typeof body.effectiveFrom === 'string' ? body.effectiveFrom : undefined,
    activateVersion:
      typeof body.activateVersion === 'boolean' ? body.activateVersion : undefined,
    replaceRules: typeof body.replaceRules === 'boolean' ? body.replaceRules : undefined,
  };
}

export async function POST(request: Request) {
  const providedSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized internal call' }, { status: 401 });
  }

  let payload: InitPayload = {};
  try {
    payload = parsePayload(await request.json());
  } catch {
    payload = {};
  }

  let tenantsQuery = supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (payload.tenantId) {
    tenantsQuery = tenantsQuery.eq('id', payload.tenantId);
  }

  const { data: tenants, error } = await tenantsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: Array<{ tenantId: string; status: 'ok' | 'error'; detail: unknown }> = [];

  for (const tenant of tenants ?? []) {
    try {
      const result = await initRulebookForTenant(supabaseAdmin, {
        tenantId: tenant.id,
        versionCode: payload.versionCode,
        versionName: payload.versionName,
        versionDescription: payload.versionDescription,
        effectiveFrom: payload.effectiveFrom,
        activateVersion: payload.activateVersion,
        replaceRules: payload.replaceRules,
      });

      summary.push({
        tenantId: tenant.id,
        status: 'ok',
        detail: result,
      });
    } catch (initError) {
      summary.push({
        tenantId: tenant.id,
        status: 'error',
        detail: initError instanceof Error ? initError.message : 'Unknown init error',
      });
    }
  }

  return NextResponse.json({
    processedTenants: summary.length,
    summary,
  });
}
