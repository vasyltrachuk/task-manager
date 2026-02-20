import { NextResponse } from 'next/server';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { mapPrivatbankErrorToResponse } from '@/lib/server/integrations/privatbank/error';
import { PrivatbankTokenRepo } from '@/lib/server/integrations/privatbank/token.repo';
import { assertNonEmptyString } from '@/lib/server/integrations/privatbank/validation';

export async function PUT(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const clientId = assertNonEmptyString(body.clientId, 'clientId');
    const token = assertNonEmptyString(body.token, 'token');

    const repo = new PrivatbankTokenRepo(supabase, ctx);
    const tokenStatus = await repo.upsertToken(ctx.userId, clientId, token);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'privatbank_accountant_tokens',
      entity_id: ctx.userId,
      action: 'token_updated',
      meta: {
        provider: 'privatbank',
        clientId,
      },
    });

    return NextResponse.json({ tokenStatus });
  } catch (error) {
    return mapPrivatbankErrorToResponse(error);
  }
}

export async function DELETE() {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const repo = new PrivatbankTokenRepo(supabase, ctx);
    await repo.deactivateToken(ctx.userId);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'privatbank_accountant_tokens',
      entity_id: ctx.userId,
      action: 'token_deleted',
      meta: {
        provider: 'privatbank',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mapPrivatbankErrorToResponse(error);
  }
}
