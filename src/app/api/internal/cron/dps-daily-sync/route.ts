import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { runDpsSync } from '@/lib/server/integrations/dps/sync.use-case';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const providedSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized cron call' }, { status: 401 });
  }

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: Array<{ tenantId: string; status: 'ok' | 'error'; detail: unknown }> = [];

  for (const tenant of tenants ?? []) {
    try {
      const result = await runDpsSync(supabaseAdmin, {
        tenantId: tenant.id as string,
        source: 'daily',
      });

      summary.push({
        tenantId: tenant.id as string,
        status: 'ok',
        detail: result,
      });
    } catch (syncError) {
      summary.push({
        tenantId: tenant.id as string,
        status: 'error',
        detail: syncError instanceof Error ? syncError.message : 'Unknown sync error',
      });
    }
  }

  return NextResponse.json({
    processedTenants: summary.length,
    summary,
  });
}
