import { NextResponse } from 'next/server';
import { enqueueOutboundSendJob } from '@/lib/server/queue/client';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';

interface PostBody {
  body?: unknown;
  documentId?: unknown;
}

export const runtime = 'nodejs';

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

function parseBody(input: PostBody): { text: string | null; documentId: string | null } {
  const text = typeof input.body === 'string' ? input.body.trim() : '';
  const documentId = typeof input.documentId === 'string' ? input.documentId.trim() : '';

  return {
    text: text.length > 0 ? text : null,
    documentId: documentId.length > 0 ? documentId : null,
  };
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

    const input = parseBody(body);

    if (!input.text && !input.documentId) {
      return NextResponse.json(
        { error: 'Either message body or documentId must be provided.' },
        { status: 400 }
      );
    }

    const conversationResult = await supabase
      .from('conversations')
      .select('id, client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversationId)
      .single();

    if (conversationResult.error || !conversationResult.data?.id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messageInsert = await supabase
      .from('messages')
      .insert({
        tenant_id: ctx.tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        source: 'dashboard',
        sender_profile_id: ctx.userId,
        body: input.text,
        status: 'queued',
      })
      .select('id')
      .single();

    if (messageInsert.error || !messageInsert.data?.id) {
      return NextResponse.json(
        { error: messageInsert.error?.message ?? 'Unable to create message' },
        { status: 500 }
      );
    }

    if (input.documentId) {
      const documentResult = await supabase
        .from('documents')
        .select('id, client_id, storage_path, file_name, mime, size_bytes')
        .eq('tenant_id', ctx.tenantId)
        .eq('id', input.documentId)
        .single();

      if (documentResult.error || !documentResult.data?.id) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      if (
        conversationResult.data.client_id &&
        documentResult.data.client_id !== conversationResult.data.client_id
      ) {
        return NextResponse.json(
          { error: 'Document belongs to a different client' },
          { status: 400 }
        );
      }

      const attachmentInsert = await supabase.from('message_attachments').insert({
        tenant_id: ctx.tenantId,
        message_id: messageInsert.data.id,
        storage_path: documentResult.data.storage_path,
        file_name: documentResult.data.file_name,
        mime: documentResult.data.mime,
        size_bytes: documentResult.data.size_bytes,
      });

      if (attachmentInsert.error) {
        return NextResponse.json({ error: attachmentInsert.error.message }, { status: 500 });
      }
    }

    await enqueueOutboundSendJob({
      tenantId: ctx.tenantId,
      conversationId,
      messageId: messageInsert.data.id,
    });

    return NextResponse.json({
      ok: true,
      messageId: messageInsert.data.id,
      status: 'queued',
    });
  } catch (error) {
    return mapContextError(error);
  }
}
