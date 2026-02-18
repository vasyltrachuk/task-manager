import { NextResponse } from 'next/server';
import { DpsTokenRepo } from '@/lib/server/integrations/dps/token.repo';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { assertNonEmptyString } from '@/lib/server/integrations/dps/validation';

export async function PUT(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const token = assertNonEmptyString(body.token, 'token');

    const repo = new DpsTokenRepo(supabase, ctx);
    const tokenStatus = await repo.upsertToken(ctx.userId, token);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'dps_accountant_tokens',
      entity_id: ctx.userId,
      action: 'token_updated',
      meta: {
        provider: 'dps',
      },
    });

    return NextResponse.json({ tokenStatus });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function DELETE() {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const repo = new DpsTokenRepo(supabase, ctx);
    await repo.deactivateToken(ctx.userId);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'dps_accountant_tokens',
      entity_id: ctx.userId,
      action: 'token_deleted',
      meta: {
        provider: 'dps',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
