import { NextResponse } from 'next/server';
import { runDpsSync } from '@/lib/server/integrations/dps/sync.use-case';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { parseOptionalBoolean, parseOptionalRegistryList } from '@/lib/server/integrations/dps/validation';

export async function POST(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const clientId = typeof body.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : undefined;
    const clientTaxId = typeof body.clientTaxId === 'string' && body.clientTaxId.trim()
      ? body.clientTaxId.trim()
      : undefined;
    const registries = parseOptionalRegistryList(body.registries);
    const force = parseOptionalBoolean(body.force);

    const summary = await runDpsSync(supabase, {
      tenantId: ctx.tenantId,
      actorProfileId: ctx.userId,
      source: 'manual',
      clientId,
      clientTaxId,
      registries,
      force,
    });

    return NextResponse.json(summary);
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
