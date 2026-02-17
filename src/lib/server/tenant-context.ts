import type { SupabaseClient } from '@supabase/supabase-js';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  botId?: string;
  userRole?: string;
}

/**
 * Builds TenantContext for UI requests (dashboard, API routes).
 * Flow: auth.uid() → profiles → tenant_id
 */
export async function buildTenantContextFromSession(
  supabase: SupabaseClient
): Promise<TenantContext> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('UNAUTHENTICATED');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('PROFILE_NOT_FOUND');
  }

  return {
    tenantId: profile.tenant_id,
    userId: user.id,
    userRole: profile.role,
  };
}

/**
 * Builds TenantContext for Telegram webhook requests.
 * Flow: bot_public_id → tenant_bots → tenant_id
 * Uses admin client (service role) since webhooks have no session.
 */
export async function buildTenantContextFromBotPublicId(
  adminClient: SupabaseClient,
  botPublicId: string
): Promise<TenantContext & { botId: string }> {
  const { data: bot, error } = await adminClient
    .from('tenant_bots')
    .select('id, tenant_id, is_active, webhook_secret')
    .eq('public_id', botPublicId)
    .single();

  if (error || !bot) {
    throw new Error('BOT_NOT_FOUND');
  }

  if (!bot.is_active) {
    throw new Error('BOT_INACTIVE');
  }

  return {
    tenantId: bot.tenant_id,
    botId: bot.id,
  };
}
