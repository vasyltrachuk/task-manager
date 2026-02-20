import 'server-only';

import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { FileDownloadUploadJob, InboundProcessJob } from '@/lib/server/queue/jobs';
import { sanitizeFileName } from './shared';
import { createTelegramBotClient } from './bot-factory';
import { lookupActiveBotToken } from './shared';
import {
  buildTelegramContactName,
  extractTelegramAttachments,
  extractTelegramBody,
  getPrimaryTelegramMessage,
  parseTelegramUpdate,
  type TelegramCallbackQuery,
} from './types';
import {
  handleStaffLink,
  handleStaffCallbackQuery,
  handleStaffReply,
  notifyStaff,
} from './staff.use-case';

interface TelegramContactRow {
  id: string;
  client_id: string | null;
}

interface ConversationRow {
  id: string;
  client_id: string | null;
}

interface ProcessInboundResult {
  skipped: boolean;
  conversationId?: string;
  messageId?: string;
  fileJobs: FileDownloadUploadJob[];
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

async function incrementConversationUnreadSafely(input: {
  tenantId: string;
  conversationId: string;
  lastMessageAt: string;
  fallbackClientId: string | null;
}): Promise<void> {
  // Cast through `unknown` because generated DB types may lag behind migrations.
  // Keep method call attached to the client instance (`supabaseAdmin.rpc(...)`) to preserve `this`.
  const typedSupabase = supabaseAdmin as unknown as {
    rpc: (
      fn: 'increment_conversation_unread',
      args: {
        p_tenant_id: string;
        p_conversation_id: string;
        p_last_message_at: string;
        p_client_id: string | null;
      },
    ) => Promise<{ error: { message: string } | null }>;
  };

  let incrementResult: { error: { message: string } | null };
  try {
    incrementResult = await typedSupabase.rpc('increment_conversation_unread', {
      p_tenant_id: input.tenantId,
      p_conversation_id: input.conversationId,
      p_last_message_at: input.lastMessageAt,
      p_client_id: input.fallbackClientId,
    });
  } catch (err) {
    console.warn(
      '[telegram_inbound_conversation_update] rpc threw, falling back to select+update:',
      err instanceof Error ? err.message : err
    );
    incrementResult = { error: { message: 'rpc threw' } };
  }

  if (!incrementResult.error) return;

  console.warn(
    '[telegram_inbound_conversation_update] rpc failed, falling back to select+update:',
    incrementResult.error.message
  );

  const currentConversation = await supabaseAdmin
    .from('conversations')
    .select('unread_count, client_id')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.conversationId)
    .maybeSingle();

  if (currentConversation.error || !currentConversation.data) {
    console.warn(
      '[telegram_inbound_conversation_update] fallback read failed:',
      currentConversation.error?.message ?? 'Conversation not found'
    );
    return;
  }

  const nextUnreadCount = Number(currentConversation.data.unread_count ?? 0) + 1;
  const fallbackUpdate = await supabaseAdmin
    .from('conversations')
    .update({
      unread_count: Number.isFinite(nextUnreadCount) ? nextUnreadCount : 1,
      last_message_at: input.lastMessageAt,
      client_id: currentConversation.data.client_id ?? input.fallbackClientId,
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.conversationId);

  if (fallbackUpdate.error) {
    console.warn('[telegram_inbound_conversation_update] fallback update failed:', fallbackUpdate.error.message);
  }
}

async function resolveOrCreateContact(input: {
  tenantId: string;
  botId: string;
  telegramUserId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<TelegramContactRow> {
  const existing = await supabaseAdmin
    .from('telegram_contacts')
    .select('id, client_id')
    .eq('tenant_id', input.tenantId)
    .eq('bot_id', input.botId)
    .eq('telegram_user_id', input.telegramUserId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`[telegram_inbound_contact_lookup] ${existing.error.message}`);
  }

  if (existing.data?.id) {
    const updateResult = await supabaseAdmin
      .from('telegram_contacts')
      .update({
        chat_id: input.chatId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', existing.data.id);

    if (updateResult.error) {
      throw new Error(`[telegram_inbound_contact_update] ${updateResult.error.message}`);
    }

    return existing.data;
  }

  const insertResult = await supabaseAdmin
    .from('telegram_contacts')
    .insert({
      tenant_id: input.tenantId,
      bot_id: input.botId,
      telegram_user_id: input.telegramUserId,
      chat_id: input.chatId,
      username: input.username ?? null,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
    })
    .select('id, client_id')
    .single();

  if (insertResult.error || !insertResult.data?.id) {
    throw new Error(`[telegram_inbound_contact_create] ${insertResult.error?.message ?? 'No data returned'}`);
  }

  return insertResult.data;
}

async function resolveOrCreateConversation(input: {
  tenantId: string;
  botId: string;
  contactId: string;
  clientId: string | null;
}): Promise<ConversationRow> {
  const existing = await supabaseAdmin
    .from('conversations')
    .select('id, client_id')
    .eq('tenant_id', input.tenantId)
    .eq('bot_id', input.botId)
    .eq('telegram_contact_id', input.contactId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`[telegram_inbound_conversation_lookup] ${existing.error.message}`);
  }

  if (existing.data?.id) {
    if (!existing.data.client_id && input.clientId) {
      const updateResult = await supabaseAdmin
        .from('conversations')
        .update({
          client_id: input.clientId,
        })
        .eq('tenant_id', input.tenantId)
        .eq('id', existing.data.id);

      if (updateResult.error) {
        throw new Error(`[telegram_inbound_conversation_link_client] ${updateResult.error.message}`);
      }
    }

    return {
      ...existing.data,
      client_id: existing.data.client_id ?? input.clientId ?? null,
    };
  }

  const insertResult = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: input.tenantId,
      bot_id: input.botId,
      telegram_contact_id: input.contactId,
      client_id: input.clientId ?? null,
      status: 'open',
      unread_count: 0,
    })
    .select('id, client_id')
    .single();

  if (insertResult.error || !insertResult.data?.id) {
    throw new Error(
      `[telegram_inbound_conversation_create] ${insertResult.error?.message ?? 'No data returned'}`
    );
  }

  return insertResult.data;
}

export async function processInboundUpdate(job: InboundProcessJob): Promise<ProcessInboundResult> {
  const parsedUpdate = parseTelegramUpdate(job.payload);
  if (!parsedUpdate) {
    return { skipped: true, fileJobs: [] };
  }

  // ── Handle callback_query (e.g. "Reply" button press from staff) ─────
  if (parsedUpdate.callback_query) {
    await handleCallbackQueryIfStaff(job, parsedUpdate.callback_query);
    return { skipped: true, fileJobs: [] };
  }

  const message = getPrimaryTelegramMessage(parsedUpdate);
  if (!message) {
    return { skipped: true, fileJobs: [] };
  }

  // ── Handle /start CODE for staff linking ──────────────────────────────
  const messageText = message.text?.trim() ?? '';
  const startMatch = messageText.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9]{6})\s*$/i);
  if (startMatch) {
    const linkResult = await handleStaffLink({
      tenantId: job.tenantId,
      botId: job.botId,
      chatId: message.chat.id,
      code: startMatch[1].toUpperCase(),
    });
    const token = await lookupActiveBotToken({ tenantId: job.tenantId, botId: job.botId });
    const bot = await createTelegramBotClient(token);
    await bot.sendMessage({ chatId: message.chat.id, text: linkResult.message });
    return { skipped: true, fileJobs: [] };
  }

  const telegramUserId = message.from?.id ?? message.chat.id;
  if (!Number.isFinite(telegramUserId)) {
    throw new Error('[telegram_inbound_message] Missing telegram user id');
  }

  // ── Check if sender is a staff member ─────────────────────────────────
  const staffProfile = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id')
    .eq('telegram_chat_id', message.chat.id)
    .maybeSingle();

  if (staffProfile.data?.id && staffProfile.data.tenant_id === job.tenantId) {
    await handleStaffReply({
      tenantId: job.tenantId,
      botId: job.botId,
      chatId: message.chat.id,
      profileId: staffProfile.data.id,
      message,
    });
    return { skipped: true, fileJobs: [] };
  }

  const contact = await resolveOrCreateContact({
    tenantId: job.tenantId,
    botId: job.botId,
    telegramUserId,
    chatId: message.chat.id,
    username: message.from?.username,
    firstName: message.from?.first_name ?? message.chat.first_name,
    lastName: message.from?.last_name ?? message.chat.last_name,
  });

  const suggestedName = buildTelegramContactName(message);
  const clientId = contact.client_id;

  const conversation = await resolveOrCreateConversation({
    tenantId: job.tenantId,
    botId: job.botId,
    contactId: contact.id,
    clientId,
  });

  const body = extractTelegramBody(message);
  const messageInsert = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: job.tenantId,
      conversation_id: conversation.id,
      direction: 'inbound',
      source: 'telegram',
      telegram_message_id: message.message_id,
      body,
      status: 'received',
    })
    .select('id')
    .single();

  if (messageInsert.error || !messageInsert.data?.id) {
    throw new Error(`[telegram_inbound_message_insert] ${messageInsert.error?.message ?? 'No data returned'}`);
  }

  const nowIso = new Date(message.date * 1000).toISOString();
  const attachments = extractTelegramAttachments(message);
  const fileJobs: FileDownloadUploadJob[] = [];

  // Archive message to private channel if configured — backup in case original message is deleted or bot loses chat access
  const archiveChatId = process.env.TELEGRAM_ARCHIVE_CHAT_ID
    ? Number(process.env.TELEGRAM_ARCHIVE_CHAT_ID)
    : null;
  if (archiveChatId && attachments.length > 0) {
    try {
      const token = await lookupActiveBotToken({ tenantId: job.tenantId, botId: job.botId });
      const bot = await createTelegramBotClient(token);
      await bot.copyMessage({
        fromChatId: message.chat.id,
        toChatId: archiveChatId,
        messageId: message.message_id,
      });
    } catch (err) {
      // Archive is best-effort — don't fail the whole inbound flow
      console.warn('[telegram_inbound_archive] copyMessage failed:', err instanceof Error ? err.message : err);
    }
  }

  for (const attachment of attachments) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachmentPayload: any = {
      tenant_id: job.tenantId,
      message_id: messageInsert.data.id,
      telegram_file_id: attachment.telegramFileId,
      telegram_file_unique_id: attachment.telegramFileUniqueId ?? null,
      storage_path: `${job.tenantId}/pending/${randomUUID()}_${sanitizeFileName(attachment.fileName)}`,
      file_name: sanitizeFileName(attachment.fileName),
      mime: attachment.mimeType ?? null,
      size_bytes: attachment.sizeBytes ?? null,
    };
    if (attachment.durationSeconds != null) {
      attachmentPayload.duration_seconds = attachment.durationSeconds;
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
      throw new Error(
        `[telegram_inbound_attachment_insert] ${attachmentInsert.error?.message ?? 'No data returned'}`
      );
    }

    fileJobs.push({
      tenantId: job.tenantId,
      botId: job.botId,
      clientId,
      attachmentId: attachmentInsert.data.id,
      telegramFileId: attachment.telegramFileId,
      fileName: sanitizeFileName(attachment.fileName),
      mimeType: attachment.mimeType ?? null,
      sizeBytes: attachment.sizeBytes ?? null,
    });
  }

  // Keep unread_count updates resilient across environments where RPC migration may lag behind code deploy.
  await incrementConversationUnreadSafely({
    tenantId: job.tenantId,
    conversationId: conversation.id,
    lastMessageAt: nowIso,
    fallbackClientId: conversation.client_id ? null : clientId,
  });

  // ── Best-effort staff notification ──────────────────────────────────
  try {
    await notifyStaff({
      tenantId: job.tenantId,
      botId: job.botId,
      conversationId: conversation.id,
      messageBody: body,
      clientName: suggestedName,
    });
  } catch (err) {
    console.warn('[telegram_inbound_notify_staff] failed:', err instanceof Error ? err.message : err);
  }

  return {
    skipped: false,
    conversationId: conversation.id,
    messageId: messageInsert.data.id,
    fileJobs,
  };
}

async function handleCallbackQueryIfStaff(
  job: InboundProcessJob,
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const chatId = callbackQuery.from.id;
  const profile = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (!profile.data?.id || profile.data.tenant_id !== job.tenantId) {
    // Not staff or wrong tenant — ignore
    return;
  }

  await handleStaffCallbackQuery({
    tenantId: job.tenantId,
    botId: job.botId,
    chatId,
    profileId: profile.data.id,
    callbackQueryId: callbackQuery.id,
    data: callbackQuery.data ?? '',
  });
}
