import { NextResponse } from 'next/server';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { PrivatbankApiClient } from '@/lib/server/integrations/privatbank/client';
import { mapPrivatbankErrorToResponse } from '@/lib/server/integrations/privatbank/error';
import { PrivatbankTokenRepo } from '@/lib/server/integrations/privatbank/token.repo';
import { normalizeStatementDate } from '@/lib/server/integrations/privatbank/validation';

export async function GET(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const startDate = normalizeStatementDate(url.searchParams.get('startDate'), 'startDate');
    const endDate = normalizeStatementDate(url.searchParams.get('endDate'), 'endDate');

    const tokenRepo = new PrivatbankTokenRepo(supabase, ctx);
    const tokenRecord = await tokenRepo.getActiveToken(ctx.userId);

    if (!tokenRecord) {
      throw new Error('PRIVATBANK_TOKEN_NOT_FOUND');
    }

    const client = new PrivatbankApiClient();
    const result = await client.fetchBalance(tokenRecord.clientId, tokenRecord.token, startDate, endDate);

    await tokenRepo.touchLastUsed(tokenRecord.tokenId);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'privatbank_balance',
      entity_id: ctx.userId,
      action: 'balance_fetched',
      meta: {
        provider: 'privatbank',
        clientId: tokenRecord.clientId,
        startDate,
        endDate,
        itemCount: result.payload.balances.length,
      },
    });

    return NextResponse.json({
      status: result.status,
      startDate,
      endDate,
      balances: result.payload.balances,
      itemCount: result.payload.balances.length,
    });
  } catch (error) {
    return mapPrivatbankErrorToResponse(error);
  }
}
