import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';

export const runtime = 'nodejs';

interface PostBody {
  clientId?: unknown;
}

function mapContextError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (message === 'PROFILE_NOT_FOUND') {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  if (message === 'SUBSCRIPTION_INACTIVE') {
    return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
  }

  if (message === 'SUBSCRIPTION_LOOKUP_FAILED') {
    return NextResponse.json({ error: 'Subscription lookup failed' }, { status: 500 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createSupabaseServerClient();
    const ctx = await buildTenantContextFromSession(supabase);

    if (!ctx.userId || (ctx.userRole !== 'admin' && ctx.userRole !== 'accountant')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
    }

    const conversationResult = await supabaseAdmin
      .from('conversations')
      .select('id, client_id, telegram_contact_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationResult.error) {
      return NextResponse.json({ error: conversationResult.error.message }, { status: 500 });
    }

    if (!conversationResult.data?.id) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    if (conversationResult.data.client_id && conversationResult.data.client_id !== clientId) {
      return NextResponse.json(
        { error: 'Conversation is already linked to another client.' },
        { status: 409 }
      );
    }

    const clientResult = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', clientId)
      .maybeSingle();

    if (clientResult.error) {
      return NextResponse.json({ error: clientResult.error.message }, { status: 500 });
    }

    if (!clientResult.data?.id) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    if (ctx.userRole === 'accountant') {
      const accessResult = await supabaseAdmin
        .from('client_accountants')
        .select('client_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('client_id', clientId)
        .eq('accountant_id', ctx.userId)
        .maybeSingle();

      if (accessResult.error) {
        return NextResponse.json({ error: accessResult.error.message }, { status: 500 });
      }

      if (!accessResult.data?.client_id) {
        return NextResponse.json({ error: 'Немає доступу до цього клієнта.' }, { status: 403 });
      }
    }

    const contactResult = await supabaseAdmin
      .from('telegram_contacts')
      .select('id, client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversationResult.data.telegram_contact_id)
      .maybeSingle();

    if (contactResult.error) {
      return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
    }

    if (!contactResult.data?.id) {
      return NextResponse.json({ error: 'Telegram contact not found.' }, { status: 404 });
    }

    if (contactResult.data.client_id && contactResult.data.client_id !== clientId) {
      return NextResponse.json(
        { error: 'Telegram contact is already linked to another client.' },
        { status: 409 }
      );
    }

    const alreadyLinked =
      conversationResult.data.client_id === clientId &&
      contactResult.data.client_id === clientId;

    if (alreadyLinked) {
      return NextResponse.json({ ok: true, alreadyLinked: true });
    }

    if (contactResult.data.client_id !== clientId) {
      const contactUpdate = await supabaseAdmin
        .from('telegram_contacts')
        .update({ client_id: clientId })
        .eq('tenant_id', ctx.tenantId)
        .eq('id', contactResult.data.id);

      if (contactUpdate.error) {
        return NextResponse.json({ error: contactUpdate.error.message }, { status: 500 });
      }
    }

    if (conversationResult.data.client_id !== clientId) {
      const conversationUpdate = await supabaseAdmin
        .from('conversations')
        .update({ client_id: clientId })
        .eq('tenant_id', ctx.tenantId)
        .eq('id', conversationResult.data.id);

      if (conversationUpdate.error) {
        return NextResponse.json({ error: conversationUpdate.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, alreadyLinked: false });
  } catch (error) {
    return mapContextError(error);
  }
}
