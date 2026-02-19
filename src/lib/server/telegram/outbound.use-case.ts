import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { OutboundSendJob } from '@/lib/server/queue/jobs';
import { createTelegramBotClient } from './bot-factory';
import { lookupActiveBotToken, storageBucketName } from './shared';

interface OutboundMessageRow {
  id: string;
  conversation_id: string;
  status: string;
  body: string | null;
}

async function createSignedUrlForAttachment(path: string): Promise<string> {
  const result = await supabaseAdmin.storage.from(storageBucketName()).createSignedUrl(path, 60 * 5);
  if (result.error || !result.data?.signedUrl) {
    throw new Error(`[telegram_outbound_signed_url] ${result.error?.message ?? 'Unable to sign URL'}`);
  }
  return result.data.signedUrl;
}

async function resolveSendableDocument(input: {
  telegramFileId: string | null;
  storagePath: string;
}): Promise<string> {
  if (input.telegramFileId && input.telegramFileId.length > 0) {
    return input.telegramFileId;
  }
  return createSignedUrlForAttachment(input.storagePath);
}

export async function processOutboundSend(job: OutboundSendJob): Promise<{ telegramMessageId?: number }> {
  // Step 1: Fetch message (needed to get conversation_id and status check)
  const messageResult = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, status, body')
    .eq('tenant_id', job.tenantId)
    .eq('id', job.messageId)
    .single();

  if (messageResult.error || !messageResult.data?.id) {
    throw new Error(`[telegram_outbound_message_lookup] ${messageResult.error?.message ?? 'Message not found'}`);
  }

  const message = messageResult.data as OutboundMessageRow;
  if (message.status !== 'queued') {
    return {};
  }

  // Step 2: Fetch conversation + attachments in parallel (both depend only on step 1)
  const [conversationResult, attachmentsResult] = await Promise.all([
    supabaseAdmin
      .from('conversations')
      .select('id, bot_id, telegram_contact_id')
      .eq('tenant_id', job.tenantId)
      .eq('id', message.conversation_id)
      .single(),
    supabaseAdmin
      .from('message_attachments')
      .select('id, telegram_file_id, storage_path')
      .eq('tenant_id', job.tenantId)
      .eq('message_id', message.id),
  ]);

  if (conversationResult.error || !conversationResult.data?.id) {
    throw new Error(
      `[telegram_outbound_conversation_lookup] ${conversationResult.error?.message ?? 'Conversation not found'}`
    );
  }

  if (attachmentsResult.error) {
    throw new Error(`[telegram_outbound_attachments_lookup] ${attachmentsResult.error.message}`);
  }

  // Step 3: Fetch contact + bot in parallel (both depend only on conversation)
  const [contactResult, token] = await Promise.all([
    supabaseAdmin
      .from('telegram_contacts')
      .select('id, chat_id')
      .eq('tenant_id', job.tenantId)
      .eq('id', conversationResult.data.telegram_contact_id)
      .single(),
    lookupActiveBotToken({
      tenantId: job.tenantId,
      botId: conversationResult.data.bot_id,
    }),
  ]);

  if (contactResult.error || !contactResult.data?.id) {
    throw new Error(`[telegram_outbound_contact_lookup] ${contactResult.error?.message ?? 'Contact not found'}`);
  }

  // Step 4: Send via Telegram
  const bot = await createTelegramBotClient(token);
  const attachments = attachmentsResult.data ?? [];
  let telegramMessageId: number | undefined;

  if (attachments.length > 0) {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const document = await resolveSendableDocument({
        telegramFileId: attachment.telegram_file_id,
        storagePath: attachment.storage_path,
      });

      const sent = await bot.sendDocument({
        chatId: contactResult.data.chat_id,
        document,
        caption: index === 0 ? message.body ?? undefined : undefined,
      });

      if (telegramMessageId === undefined) {
        telegramMessageId = sent.messageId;
      }
    }
  } else {
    const text = message.body?.trim();
    if (!text) {
      throw new Error('[telegram_outbound_validation] Message body is required when there is no attachment');
    }

    const sent = await bot.sendMessage({
      chatId: contactResult.data.chat_id,
      text,
    });
    telegramMessageId = sent.messageId;
  }

  // Step 5: Update message status + conversation in parallel
  const [messageUpdate, conversationUpdate] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId ?? null,
      })
      .eq('tenant_id', job.tenantId)
      .eq('id', message.id),
    supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq('tenant_id', job.tenantId)
      .eq('id', conversationResult.data.id),
  ]);

  if (messageUpdate.error) {
    throw new Error(`[telegram_outbound_message_update] ${messageUpdate.error.message}`);
  }

  if (conversationUpdate.error) {
    throw new Error(`[telegram_outbound_conversation_update] ${conversationUpdate.error.message}`);
  }

  return { telegramMessageId };
}
