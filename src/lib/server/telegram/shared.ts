import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabase-admin';

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'file';
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export function storageBucketName(): string {
  return process.env.TELEGRAM_STORAGE_BUCKET?.trim() || 'documents';
}

// TODO: Implement real decryption when token encryption is added to tenant_bots.
// Currently tokens are stored as plaintext — rename DB column or add pgcrypto.
export function resolveBotToken(tokenEncrypted: string): string {
  return tokenEncrypted.trim();
}

export async function lookupActiveBotToken(input: {
  tenantId: string;
  botId: string;
}): Promise<string> {
  const result = await supabaseAdmin
    .from('tenant_bots')
    .select('id, is_active, token_encrypted')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.botId)
    .single();

  if (result.error || !result.data?.id) {
    throw new Error(`[telegram_bot_lookup] ${result.error?.message ?? 'Bot not found'}`);
  }

  if (!result.data.is_active) {
    throw new Error('[telegram_bot_lookup] Bot is inactive');
  }

  const token = resolveBotToken(result.data.token_encrypted);
  if (!token) {
    throw new Error('[telegram_bot_lookup] Bot token is empty');
  }

  return token;
}
