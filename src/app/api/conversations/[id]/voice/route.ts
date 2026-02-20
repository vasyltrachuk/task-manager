import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { lookupActiveBotToken, sanitizeFileName } from '@/lib/server/telegram/shared';
import { createTelegramBotClient } from '@/lib/server/telegram/bot-factory';

export const runtime = 'nodejs';

function normalizeAudioMimeType(value: string | null | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

function extensionFromAudioMimeType(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'ogg';
}

function isMissingDurationSecondsColumnError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;

  const message = (error.message ?? '').toLowerCase();
  const hasDurationRef = message.includes('duration_seconds');
  if (!hasDurationRef) return false;

  return error.code === '42703'
    || error.code === 'PGRST204'
    || message.includes('column')
    || message.includes('schema cache');
}

function mapContextError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data') && !contentType.startsWith('audio/')) {
      return NextResponse.json({ error: 'Expected audio data' }, { status: 400 });
    }

    // Parse audio blob from request
    let audioBuffer: Buffer;
    let mimeType: string;
    let durationSeconds: number | null = null;

    if (contentType.startsWith('audio/') || contentType.includes('application/octet-stream')) {
      audioBuffer = Buffer.from(await request.arrayBuffer());
      mimeType = normalizeAudioMimeType(contentType) || 'audio/ogg';
    } else {
      // multipart/form-data
      const formData = await request.formData();
      const audioFile = formData.get('audio');
      const durationRaw = formData.get('duration');
      if (!audioFile || !(audioFile instanceof Blob)) {
        return NextResponse.json({ error: 'Missing audio field' }, { status: 400 });
      }
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      mimeType = normalizeAudioMimeType(audioFile.type) || 'audio/ogg';
      durationSeconds = durationRaw ? Number(durationRaw) : null;
    }

    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty audio data' }, { status: 400 });
    }

    // Lookup conversation
    const conversationResult = await supabaseAdmin
      .from('conversations')
      .select('id, bot_id, telegram_contact_id, client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversationId)
      .single();

    if (conversationResult.error || !conversationResult.data?.id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const conversation = conversationResult.data;

    // Lookup contact chat_id
    const contactResult = await supabaseAdmin
      .from('telegram_contacts')
      .select('chat_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversation.telegram_contact_id)
      .single();

    if (contactResult.error || !contactResult.data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const chatId = contactResult.data.chat_id;
    const token = await lookupActiveBotToken({ tenantId: ctx.tenantId, botId: conversation.bot_id });
    const bot = await createTelegramBotClient(token);

    // ── Send voice via Telegram ──────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioBlob = new Blob([audioBuffer as any], { type: mimeType });
    const sent = await bot.sendVoice({
      chatId,
      voice: audioBlob,
      mimeType,
      duration: durationSeconds ?? undefined,
    });

    // Telegram returns voice.file_id in the Message response — store it.
    // No Supabase Storage upload needed: we proxy on-demand via Telegram API.
    const telegramFileId = sent.fileId ?? null;
    const telegramFileUniqueId = sent.fileUniqueId ?? null;

    // ── Archive to private channel (best-effort, backup in case original message is deleted) ──
    const archiveChatId = process.env.TELEGRAM_ARCHIVE_CHAT_ID
      ? Number(process.env.TELEGRAM_ARCHIVE_CHAT_ID)
      : null;
    if (archiveChatId) {
      bot.copyMessage({
        fromChatId: chatId,
        toChatId: archiveChatId,
        messageId: sent.messageId,
      }).catch((err) =>
        console.warn('[voice] archive copyMessage failed:', err instanceof Error ? err.message : err)
      );
    }

    // ── Logical storage_path (access-control key only, no actual file) ───────
    const ext = extensionFromAudioMimeType(mimeType);
    const fileName = sanitizeFileName(`voice_${Date.now()}.${ext}`);
    const storagePath = `${ctx.tenantId}/tg/${conversationId}_${fileName}`;

    // ── Persist message ──────────────────────────────────────────────────────
    const messageInsert = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: ctx.tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        source: 'dashboard',
        sender_profile_id: ctx.userId,
        body: null,
        status: 'sent',
        telegram_message_id: sent.messageId,
      })
      .select('id')
      .single();

    if (messageInsert.error || !messageInsert.data?.id) {
      return NextResponse.json({ error: messageInsert.error?.message ?? 'Failed to save message' }, { status: 500 });
    }

    // ── Persist attachment — file_id only, no binary upload ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachmentPayload: any = {
      tenant_id: ctx.tenantId,
      message_id: messageInsert.data.id,
      telegram_file_id: telegramFileId,
      telegram_file_unique_id: telegramFileUniqueId,
      storage_path: storagePath,
      file_name: fileName,
      mime: mimeType,
      size_bytes: audioBuffer.byteLength,
    };
    if (durationSeconds != null) {
      attachmentPayload.duration_seconds = durationSeconds;
    }
    let attachmentInsert = await supabaseAdmin
      .from('message_attachments')
      .insert(attachmentPayload)
      .select('id')
      .single();

    if (
      attachmentInsert.error
      && attachmentPayload.duration_seconds != null
      && isMissingDurationSecondsColumnError(attachmentInsert.error)
    ) {
      delete attachmentPayload.duration_seconds;
      attachmentInsert = await supabaseAdmin
        .from('message_attachments')
        .insert(attachmentPayload)
        .select('id')
        .single();
    }

    if (attachmentInsert.error || !attachmentInsert.data?.id) {
      return NextResponse.json(
        { error: attachmentInsert.error?.message ?? 'Failed to save voice attachment' },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', conversationId);

    return NextResponse.json({ ok: true, messageId: messageInsert.data.id });
  } catch (error) {
    return mapContextError(error);
  }
}
