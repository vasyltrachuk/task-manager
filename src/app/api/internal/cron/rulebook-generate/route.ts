import { NextResponse } from 'next/server';
import { runRulebookTaskGeneration } from '@/lib/server/rulebook/generation.use-case';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

interface CronPayload {
  tenantId?: string;
  fromDate?: string;
  toDate?: string;
  holidays?: string[];
  dryRun?: boolean;
  forceRetryWithoutLinkedTask?: boolean;
}

function normalizeTenantIdList(rawValue: string | undefined): string[] {
  if (!rawValue) return [];
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanQuery(value: string | null): boolean | undefined {
  if (!value) return undefined;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  return undefined;
}

function parseCronPayload(rawBody: unknown): CronPayload {
  if (!rawBody || typeof rawBody !== 'object') return {};
  const body = rawBody as Record<string, unknown>;

  return {
    tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
    fromDate: typeof body.fromDate === 'string' ? body.fromDate : undefined,
    toDate: typeof body.toDate === 'string' ? body.toDate : undefined,
    holidays: Array.isArray(body.holidays)
      ? body.holidays.filter((item): item is string => typeof item === 'string')
      : undefined,
    dryRun: typeof body.dryRun === 'boolean' ? body.dryRun : undefined,
    forceRetryWithoutLinkedTask:
      typeof body.forceRetryWithoutLinkedTask === 'boolean'
        ? body.forceRetryWithoutLinkedTask
        : undefined,
  };
}

function parseCronPayloadFromSearchParams(url: URL): CronPayload {
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const fromDate = url.searchParams.get('fromDate') ?? undefined;
  const toDate = url.searchParams.get('toDate') ?? undefined;
  const dryRun = parseBooleanQuery(url.searchParams.get('dryRun'));
  const forceRetryWithoutLinkedTask = parseBooleanQuery(
    url.searchParams.get('forceRetryWithoutLinkedTask')
  );
  const holidays = url.searchParams.getAll('holiday').filter(Boolean);

  return {
    tenantId,
    fromDate,
    toDate,
    dryRun,
    forceRetryWithoutLinkedTask,
    holidays: holidays.length > 0 ? holidays : undefined,
  };
}

function isAuthorizedInternalCall(request: Request): boolean {
  const providedSecret = request.headers.get('x-cron-secret');
  const authorization = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  if (!expectedSecret) return false;
  if (providedSecret === expectedSecret) return true;
  if (bearerToken === expectedSecret) return true;
  return false;
}

async function runCron(payload: CronPayload, requestType: 'POST' | 'GET') {
  if (!payload.tenantId && requestType === 'GET') {
    const defaultCronTenantIds = normalizeTenantIdList(
      process.env.RULEBOOK_CRON_TENANT_IDS
    );

    if (defaultCronTenantIds.length > 0) {
      const summary: Array<{ tenantId: string; status: 'ok' | 'error'; detail: unknown }> = [];

      for (const tenantId of defaultCronTenantIds) {
        try {
          const result = await runRulebookTaskGeneration(supabaseAdmin, {
            tenantId,
            fromDate: payload.fromDate,
            toDate: payload.toDate,
            holidays: payload.holidays,
            dryRun: payload.dryRun,
            forceRetryWithoutLinkedTask: payload.forceRetryWithoutLinkedTask,
          });

          summary.push({
            tenantId,
            status: 'ok',
            detail: result,
          });
        } catch (generationError) {
          summary.push({
            tenantId,
            status: 'error',
            detail:
              generationError instanceof Error
                ? generationError.message
                : 'Unknown generation error',
          });
        }
      }

      return NextResponse.json({
        processedTenants: summary.length,
        source: 'RULEBOOK_CRON_TENANT_IDS',
        summary,
      });
    }
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
      const result = await runRulebookTaskGeneration(supabaseAdmin, {
        tenantId: tenant.id as string,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        holidays: payload.holidays,
        dryRun: payload.dryRun,
        forceRetryWithoutLinkedTask: payload.forceRetryWithoutLinkedTask,
      });

      summary.push({
        tenantId: tenant.id as string,
        status: 'ok',
        detail: result,
      });
    } catch (generationError) {
      summary.push({
        tenantId: tenant.id as string,
        status: 'error',
        detail: generationError instanceof Error ? generationError.message : 'Unknown generation error',
      });
    }
  }

  return NextResponse.json({
    processedTenants: summary.length,
    source: payload.tenantId ? 'explicit_tenant' : 'all_active_tenants',
    summary,
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedInternalCall(request)) {
    return NextResponse.json({ error: 'Unauthorized cron call' }, { status: 401 });
  }

  let payload: CronPayload = {};
  try {
    payload = parseCronPayload(await request.json());
  } catch {
    payload = {};
  }

  return runCron(payload, 'POST');
}

export async function GET(request: Request) {
  if (!isAuthorizedInternalCall(request)) {
    return NextResponse.json({ error: 'Unauthorized cron call' }, { status: 401 });
  }

  const payload = parseCronPayloadFromSearchParams(new URL(request.url));
  return runCron(payload, 'GET');
}
