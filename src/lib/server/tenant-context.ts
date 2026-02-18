import type { SupabaseClient } from '@supabase/supabase-js';
import { isSaasSubscriptionEnforced } from '@/lib/server/saas/gating';
import { isActiveSaasSubscriptionStatus } from '@/lib/server/saas/subscription';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  botId?: string;
  userRole?: string;
  subscriptionStatus?: string;
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

  if (!isSaasSubscriptionEnforced()) {
    return {
      tenantId: profile.tenant_id,
      userId: user.id,
      userRole: profile.role,
    };
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('saas_subscriptions')
    .select('status')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const missingSaasTable =
    subscriptionError?.code === 'PGRST205' ||
    Boolean(subscriptionError?.message?.includes('Could not find the table'));

  if (subscriptionError && !missingSaasTable) {
    throw new Error('SUBSCRIPTION_LOOKUP_FAILED');
  }

  if (subscription && !isActiveSaasSubscriptionStatus(subscription.status)) {
    throw new Error('SUBSCRIPTION_INACTIVE');
  }

  return {
    tenantId: profile.tenant_id,
    userId: user.id,
    userRole: profile.role,
    subscriptionStatus: subscription?.status,
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
