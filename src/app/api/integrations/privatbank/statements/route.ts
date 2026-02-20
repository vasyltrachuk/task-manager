import { NextResponse } from 'next/server';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { PrivatbankApiClient } from '@/lib/server/integrations/privatbank/client';
import { mapPrivatbankErrorToResponse } from '@/lib/server/integrations/privatbank/error';
import { PrivatbankTokenRepo } from '@/lib/server/integrations/privatbank/token.repo';
import {
  assertNonEmptyString,
  normalizeStatementDate,
  parseOptionalBoolean,
  parseOptionalPositiveInt,
} from '@/lib/server/integrations/privatbank/validation';

function parseStatementDateToTime(value: string): number {
  const [day, month, year] = value.split('-').map((part) => Number(part));
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
}

export async function GET(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const account = assertNonEmptyString(url.searchParams.get('acc') ?? url.searchParams.get('account'), 'acc');
    const startDate = normalizeStatementDate(url.searchParams.get('startDate'), 'startDate');
    const endDate = normalizeStatementDate(url.searchParams.get('endDate'), 'endDate');
    const fetchAll = parseOptionalBoolean(url.searchParams.get('fetchAll'), 'fetchAll') ?? true;
    const limit = parseOptionalPositiveInt(url.searchParams.get('limit'), 'limit', 1, 500);
    const maxPages = parseOptionalPositiveInt(url.searchParams.get('maxPages'), 'maxPages', 1, 100);
    const followIdRaw = url.searchParams.get('followId');
    const followId = followIdRaw && followIdRaw.trim() ? followIdRaw.trim() : undefined;

    if (parseStatementDateToTime(startDate) > parseStatementDateToTime(endDate)) {
      return NextResponse.json({
        error: 'Дата startDate має бути меншою або рівною endDate.',
      }, { status: 400 });
    }

    const tokenRepo = new PrivatbankTokenRepo(supabase, ctx);
    const tokenRecord = await tokenRepo.getActiveToken(ctx.userId);

    if (!tokenRecord) {
      throw new Error('PRIVATBANK_TOKEN_NOT_FOUND');
    }

    const client = new PrivatbankApiClient();

    if (!fetchAll) {
      const page = await client.fetchTransactionsPage({
        clientId: tokenRecord.clientId,
        token: tokenRecord.token,
        account,
        startDate,
        endDate,
        followId,
        limit,
      });

      await tokenRepo.touchLastUsed(tokenRecord.tokenId);

      await supabase.from('audit_log').insert({
        tenant_id: ctx.tenantId,
        actor_id: ctx.userId,
        entity: 'privatbank_statements',
        entity_id: account,
        action: 'statement_page_fetched',
        meta: {
          provider: 'privatbank',
          clientId: tokenRecord.clientId,
          account,
          startDate,
          endDate,
          followId: followId ?? null,
          transactionCount: page.payload.transactions.length,
          hasMore: Boolean(page.payload.pagination.nextId),
        },
      });

      return NextResponse.json({
        status: page.status,
        account,
        startDate,
        endDate,
        transactions: page.payload.transactions,
        transactionCount: page.payload.transactions.length,
        pagination: page.payload.pagination,
        hasMore: Boolean(page.payload.pagination.nextId),
      });
    }

    const result = await client.fetchAllTransactions({
      clientId: tokenRecord.clientId,
      token: tokenRecord.token,
      account,
      startDate,
      endDate,
      limit,
      maxPages,
    });

    await tokenRepo.touchLastUsed(tokenRecord.tokenId);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'privatbank_statements',
      entity_id: account,
      action: 'statement_fetched',
      meta: {
        provider: 'privatbank',
        clientId: tokenRecord.clientId,
        account,
        startDate,
        endDate,
        pageCount: result.pageCount,
        transactionCount: result.transactions.length,
        hasMore: result.hasMore,
      },
    });

    return NextResponse.json({
      status: result.status,
      account,
      startDate,
      endDate,
      transactions: result.transactions,
      transactionCount: result.transactions.length,
      pageCount: result.pageCount,
      pagination: result.pagination,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return mapPrivatbankErrorToResponse(error);
  }
}
