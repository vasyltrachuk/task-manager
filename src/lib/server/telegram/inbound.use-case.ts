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
} from './types';

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

function buildSyntheticTaxId(botId: string, telegramUserId: number): string {
  const botPrefix = botId.replace(/-/g, '').slice(0, 8);
  return `tg_${botPrefix}_${telegramUserId}`;
}

async function resolveOrCreateClientForContact(input: {
  tenantId: string;
  botId: string;
  contactId: string;
  existingClientId: string | null;
  telegramUserId: number;
  suggestedName: string;
  username?: string;
}): Promise<string> {
  if (input.existingClientId) {
    return input.existingClientId;
  }

  const taxId = buildSyntheticTaxId(input.botId, input.telegramUserId);

  const insertResult = await supabaseAdmin
    .from('clients')
    .insert({
      tenant_id: input.tenantId,
      name: input.suggestedName,
      type: 'FOP',
      tax_id_type: 'rnokpp',
      tax_id: taxId,
      status: 'onboarding',
      contact_email: input.username ? `${input.username}@telegram.local` : null,
      notes: 'Auto-created from Telegram inbound message.',
    })
    .select('id')
    .single();

  let clientId: string;
  if (insertResult.error?.code === '23505') {
    const existing = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('tax_id', taxId)
      .single();

    if (existing.error || !existing.data?.id) {
      throw new Error(`[telegram_inbound_client_lookup] ${existing.error?.message ?? 'Client not found'}`);
    }

    clientId = existing.data.id;
  } else if (insertResult.error || !insertResult.data?.id) {
    throw new Error(`[telegram_inbound_client_create] ${insertResult.error?.message ?? 'No data returned'}`);
  } else {
    clientId = insertResult.data.id;
  }

  const updateContactResult = await supabaseAdmin
    .from('telegram_contacts')
    .update({
      client_id: clientId,
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.contactId);

  if (updateContactResult.error) {
    throw new Error(`[telegram_inbound_contact_link_client] ${updateContactResult.error.message}`);
  }

  return clientId;
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
  clientId: string;
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
    if (!existing.data.client_id) {
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
      client_id: existing.data.client_id ?? input.clientId,
    };
  }

  const insertResult = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: input.tenantId,
      bot_id: input.botId,
      telegram_contact_id: input.contactId,
      client_id: input.clientId,
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

  const message = getPrimaryTelegramMessage(parsedUpdate);
  if (!message) {
    return { skipped: true, fileJobs: [] };
  }

  const telegramUserId = message.from?.id ?? message.chat.id;
  if (!Number.isFinite(telegramUserId)) {
    throw new Error('[telegram_inbound_message] Missing telegram user id');
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
  const clientId = await resolveOrCreateClientForContact({
    tenantId: job.tenantId,
    botId: job.botId,
    contactId: contact.id,
    existingClientId: contact.client_id,
    telegramUserId,
    suggestedName,
    username: message.from?.username,
  });

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
  // Atomic increment — avoids read-then-write race on unread_count.
  // Uses `as any` because the RPC is added via migration 00006 and
  // won't appear in generated types until `supabase gen types` is re-run.
  const incrementResult = await (supabaseAdmin.rpc as any)('increment_conversation_unread', {
    p_tenant_id: job.tenantId,
    p_conversation_id: conversation.id,
    p_last_message_at: nowIso,
    p_client_id: conversation.client_id ? null : clientId,
  });

  if (incrementResult.error) {
    throw new Error(`[telegram_inbound_conversation_update] ${incrementResult.error.message}`);
  }

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

    const attachmentInsert = await supabaseAdmin
      .from('message_attachments')
      .insert(attachmentPayload)
      .select('id')
      .single();

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

  return {
    skipped: false,
    conversationId: conversation.id,
    messageId: messageInsert.data.id,
    fileJobs,
  };
}
