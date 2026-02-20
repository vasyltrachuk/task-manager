import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { enqueueOutboundSendJob } from '@/lib/server/queue/client';
import { createTelegramBotClient } from './bot-factory';
import { lookupActiveBotToken } from './shared';
import { sanitizeFileName } from './shared';
import { setActiveReply, getActiveReply, clearActiveReply } from './staff-reply-state';
import { extractTelegramAttachments, type TelegramMessage } from './types';
import { formatShortName } from '@/lib/utils';

// ── Staff linking via /start CODE ────────────────────────────────────────

export async function handleStaffLink(input: {
  tenantId: string;
  botId: string;
  chatId: number;
  code: string;
}): Promise<{ linked: boolean; message: string }> {
  const normalizedCode = input.code.trim().toUpperCase();
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, tenant_id')
    .eq('telegram_link_code', normalizedCode)
    .gt('telegram_link_code_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`[staff_link_lookup] ${error.message}`);
  }

  if (!profile?.id) {
    return {
      linked: false,
      message: 'Код недійсний або прострочений. Попросіть адміністратора згенерувати новий код.',
    };
  }

  // Verify same tenant
  if (profile.tenant_id !== input.tenantId) {
    return {
      linked: false,
      message: 'Цей код належить іншій компанії. Попросіть адміністратора вашого акаунта створити новий код.',
    };
  }

  // If this Telegram chat is already linked, provide explicit feedback.
  const existingByChat = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('telegram_chat_id', input.chatId)
    .maybeSingle();

  if (existingByChat.error) {
    throw new Error(`[staff_link_chat_lookup] ${existingByChat.error.message}`);
  }

  if (existingByChat.data?.id && existingByChat.data.id !== profile.id) {
    return {
      linked: false,
      message: 'Цей Telegram уже підключено до іншого співробітника. Попросіть адміністратора спочатку відв’язати його.',
    };
  }

  if (existingByChat.data?.id === profile.id) {
    // Consume one-time code if accountant sent it again.
    const consumeResult = await supabaseAdmin
      .from('profiles')
      .update({
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', profile.id);

    if (consumeResult.error) {
      throw new Error(`[staff_link_consume_code] ${consumeResult.error.message}`);
    }

    const shortName = formatShortName(profile.full_name);
    return {
      linked: true,
      message: `Telegram вже підключено для ${shortName}. Ви можете працювати з повідомленнями клієнтів у цьому чаті.`,
    };
  }

  const updateResult = await supabaseAdmin
    .from('profiles')
    .update({
      telegram_chat_id: input.chatId,
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
    })
    .eq('id', profile.id);

  if (updateResult.error) {
    if (updateResult.error.code === '23505') {
      return {
        linked: false,
        message: 'Цей Telegram уже підключено до іншого співробітника. Попросіть адміністратора спочатку відв’язати його.',
      };
    }
    throw new Error(`[staff_link_update] ${updateResult.error.message}`);
  }

  const shortName = formatShortName(profile.full_name);
  return {
    linked: true,
    message: `Telegram підключено для ${shortName}. Ви будете отримувати сповіщення про нові повідомлення клієнтів.`,
  };
}

// ── Callback query handling (Reply button) ────────────────────────────────

export async function handleStaffCallbackQuery(input: {
  tenantId: string;
  botId: string;
  chatId: number;
  profileId: string;
  callbackQueryId: string;
  data: string;
}): Promise<void> {
  const token = await lookupActiveBotToken({ tenantId: input.tenantId, botId: input.botId });
  const bot = await createTelegramBotClient(token);

  const replyMatch = input.data.match(/^reply:(.+)$/);
  if (!replyMatch) {
    await bot.answerCallbackQuery({ callbackQueryId: input.callbackQueryId });
    return;
  }

  const conversationId = replyMatch[1];

  // Verify access: accountant is assigned or primary for the client
  const convResult = await supabaseAdmin
    .from('conversations')
    .select('id, client_id, assigned_accountant_id')
    .eq('tenant_id', input.tenantId)
    .eq('id', conversationId)
    .maybeSingle();

  if (!convResult.data?.id) {
    await bot.answerCallbackQuery({ callbackQueryId: input.callbackQueryId, text: 'Розмову не знайдено.' });
    return;
  }

  const hasAccess =
    convResult.data.assigned_accountant_id === input.profileId ||
    (await isAccountantForClient(input.tenantId, convResult.data.client_id, input.profileId));

  if (!hasAccess) {
    await bot.answerCallbackQuery({ callbackQueryId: input.callbackQueryId, text: 'Немає доступу.' });
    return;
  }

  // Resolve client name for prompt
  const clientName = await resolveClientName(input.tenantId, convResult.data.client_id);

  setActiveReply(input.chatId, conversationId);
  await bot.answerCallbackQuery({ callbackQueryId: input.callbackQueryId });
  await bot.sendMessage({
    chatId: input.chatId,
    text: `Введіть відповідь для ${clientName}:`,
    reply_markup: { force_reply: true, selective: true },
  });
}

// ── Staff text reply ────────────────────────────────────────────────────

export async function handleStaffReply(input: {
  tenantId: string;
  botId: string;
  chatId: number;
  profileId: string;
  message: TelegramMessage;
}): Promise<void> {
  const conversationId = getActiveReply(input.chatId);
  const token = await lookupActiveBotToken({ tenantId: input.tenantId, botId: input.botId });
  const bot = await createTelegramBotClient(token);

  if (!conversationId) {
    await bot.sendMessage({
      chatId: input.chatId,
      text: 'Натисніть "Відповісти" на сповіщенні щоб розпочати відповідь.',
    });
    return;
  }

  const text = input.message.text?.trim() ?? input.message.caption?.trim() ?? null;
  const attachments = extractTelegramAttachments(input.message);
  const hasDocument = attachments.some((a) => a.kind === 'document');

  if (!text && !hasDocument) {
    await bot.sendMessage({
      chatId: input.chatId,
      text: 'Підтримуються тільки текстові повідомлення та документи.',
    });
    return;
  }

  // Insert outbound message
  const messageInsert = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: input.tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      source: 'telegram',
      sender_profile_id: input.profileId,
      body: text,
      status: 'queued',
    })
    .select('id')
    .single();

  if (messageInsert.error || !messageInsert.data?.id) {
    throw new Error(`[staff_reply_message_insert] ${messageInsert.error?.message ?? 'No data returned'}`);
  }

  // Insert document attachment if present (reuse telegram_file_id — no binary upload)
  if (hasDocument) {
    const doc = attachments.find((a) => a.kind === 'document')!;
    await supabaseAdmin.from('message_attachments').insert({
      tenant_id: input.tenantId,
      message_id: messageInsert.data.id,
      telegram_file_id: doc.telegramFileId,
      telegram_file_unique_id: doc.telegramFileUniqueId ?? null,
      storage_path: `${input.tenantId}/tg/staff_${messageInsert.data.id}_${sanitizeFileName(doc.fileName)}`,
      file_name: sanitizeFileName(doc.fileName),
      mime: doc.mimeType ?? null,
      size_bytes: doc.sizeBytes ?? null,
    });
  }

  await enqueueOutboundSendJob({
    tenantId: input.tenantId,
    conversationId,
    messageId: messageInsert.data.id,
  });

  clearActiveReply(input.chatId);

  const clientName = await resolveClientNameForConversation(input.tenantId, conversationId);
  await bot.sendMessage({
    chatId: input.chatId,
    text: `Відповідь надіслано ${clientName}.`,
  });
}

// ── Notify staff about new client message ────────────────────────────────

export async function notifyStaff(input: {
  tenantId: string;
  botId: string;
  conversationId: string;
  messageBody: string | null;
  clientName: string;
}): Promise<void> {
  const staffChatId = await resolveStaffChatId(input.tenantId, input.conversationId);
  if (!staffChatId) return;

  const token = await lookupActiveBotToken({ tenantId: input.tenantId, botId: input.botId });
  const bot = await createTelegramBotClient(token);

  const preview = input.messageBody
    ? input.messageBody.length > 200
      ? `${input.messageBody.slice(0, 200)}...`
      : input.messageBody
    : '(вкладення)';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? '';

  await bot.sendMessage({
    chatId: staffChatId,
    text: `Нове повідомлення від ${input.clientName}:\n\n${preview}`,
    reply_markup: {
      inline_keyboard: [[
        { text: 'Відповісти', callback_data: `reply:${input.conversationId}` },
        { text: 'Відкрити', url: `${appUrl}/inbox?id=${input.conversationId}` },
      ]],
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function resolveStaffChatId(
  tenantId: string,
  conversationId: string,
): Promise<number | null> {
  // Try assigned accountant first
  const conv = await supabaseAdmin
    .from('conversations')
    .select('assigned_accountant_id, client_id')
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .single();

  if (conv.error || !conv.data) return null;

  let accountantId = conv.data.assigned_accountant_id;

  // Fallback: primary accountant for the client
  if (!accountantId && conv.data.client_id) {
    const primary = await supabaseAdmin
      .from('client_accountants')
      .select('accountant_id')
      .eq('tenant_id', tenantId)
      .eq('client_id', conv.data.client_id)
      .eq('is_primary', true)
      .maybeSingle();

    accountantId = primary.data?.accountant_id ?? null;
  }

  if (!accountantId) return null;

  const profile = await supabaseAdmin
    .from('profiles')
    .select('telegram_chat_id')
    .eq('tenant_id', tenantId)
    .eq('id', accountantId)
    .maybeSingle();

  return profile.data?.telegram_chat_id ?? null;
}

async function isAccountantForClient(
  tenantId: string,
  clientId: string | null,
  profileId: string,
): Promise<boolean> {
  if (!clientId) return false;

  const result = await supabaseAdmin
    .from('client_accountants')
    .select('accountant_id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('accountant_id', profileId)
    .maybeSingle();

  return Boolean(result.data?.accountant_id);
}

async function resolveClientName(tenantId: string, clientId: string | null): Promise<string> {
  if (!clientId) return 'клієнта';
  const result = await supabaseAdmin
    .from('clients')
    .select('name')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .maybeSingle();

  return result.data?.name ?? 'клієнта';
}

async function resolveClientNameForConversation(tenantId: string, conversationId: string): Promise<string> {
  const conv = await supabaseAdmin
    .from('conversations')
    .select('client_id')
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .maybeSingle();

  return resolveClientName(tenantId, conv.data?.client_id ?? null);
}
