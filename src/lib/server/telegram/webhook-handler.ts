import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import type { Json } from '@/lib/database.types';
import { enqueueInboundProcessJob } from '@/lib/server/queue/client';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { isJsonPayload, parseTelegramUpdate } from './types';

interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleTelegramWebhook(input: {
  botPublicId: string;
  secretToken: string | null;
  payload: unknown;
}): Promise<WebhookResult> {
  const botResult = await supabaseAdmin
    .from('tenant_bots')
    .select('id, tenant_id, is_active, webhook_secret')
    .eq('public_id', input.botPublicId)
    .maybeSingle();

  if (botResult.error) {
    return {
      status: 500,
      body: { error: botResult.error.message },
    };
  }

  if (!botResult.data || !botResult.data.is_active) {
    return {
      status: 404,
      body: { error: 'Bot not found' },
    };
  }

  const headerSecret = input.secretToken ?? '';
  const expectedSecret = botResult.data.webhook_secret;
  if (!headerSecret || !safeCompare(headerSecret, expectedSecret)) {
    return {
      status: 403,
      body: { error: 'Invalid webhook secret' },
    };
  }

  if (!isJsonPayload(input.payload)) {
    return {
      status: 400,
      body: { error: 'Webhook payload must be valid JSON object.' },
    };
  }

  const parsedUpdate = parseTelegramUpdate(input.payload);
  if (!parsedUpdate) {
    return {
      status: 400,
      body: { error: 'Webhook payload does not contain update_id.' },
    };
  }

  const rawInsert = await supabaseAdmin
    .from('telegram_updates_raw')
    .insert({
      bot_id: botResult.data.id,
      update_id: parsedUpdate.update_id,
      payload: input.payload as Json,
    })
    .select('id')
    .single();

  if (rawInsert.error?.code === '23505') {
    return {
      status: 200,
      body: { ok: true, duplicate: true },
    };
  }

  if (rawInsert.error || !rawInsert.data?.id) {
    return {
      status: 500,
      body: { error: rawInsert.error?.message ?? 'Failed to persist update' },
    };
  }

  await enqueueInboundProcessJob({
    tenantId: botResult.data.tenant_id,
    botId: botResult.data.id,
    updateId: parsedUpdate.update_id,
    payload: input.payload as Json,
  });

  return {
    status: 200,
    body: { ok: true },
  };
}
