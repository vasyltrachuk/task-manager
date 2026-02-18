import 'server-only';

import { randomUUID } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export type SaasSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'grace'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface ProvisionFromCheckoutInput {
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  planCode: string;
  tenantName: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerPassword?: string;
  subscriptionStatus?: SaasSubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

interface CheckoutProvisionResult {
  tenantId: string;
  userId: string;
  subscriptionId: string;
}

function normalizeText(value: string): string {
  return value.trim();
}

function transliterateUk(input: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e',
    є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
    ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ё: 'yo', э: 'e',
    ы: 'y', ъ: '',
  };

  return input
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

function slugifyTenantName(name: string): string {
  const normalized = transliterateUk(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

  if (normalized.length > 0) return normalized;
  return `tenant-${randomUUID().slice(0, 8)}`;
}

function parseIso(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function generateStrongPassword(): string {
  return `${randomUUID()}Aa1!`;
}

async function findUserByEmail(email: string): Promise<User | null> {
  let page = 1;
  const perPage = 200;
  const target = email.toLowerCase();

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const found = data.users.find((item) => item.email?.toLowerCase() === target) ?? null;
    if (found) return found;

    if (!data.nextPage) return null;
    page = data.nextPage;
  }
}

async function ensureAuthUser(input: {
  email: string;
  fullName: string;
  password?: string;
}): Promise<User> {
  const existing = await findUserByEmail(input.email);
  if (existing) return existing;

  if (input.password) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
      },
    });

    if (error || !data.user) {
      throw new Error(`Failed to create auth user: ${error?.message ?? 'Unknown error'}`);
    }

    return data.user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
    data: {
      full_name: input.fullName,
    },
  });

  if (error || !data.user) {
    // Fallback for environments without configured SMTP.
    const fallback = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: generateStrongPassword(),
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
      },
    });

    if (fallback.error || !fallback.data.user) {
      throw new Error(
        `Failed to invite/create auth user: ${error?.message ?? fallback.error?.message ?? 'Unknown error'}`
      );
    }

    return fallback.data.user;
  }

  return data.user;
}

async function insertTenantWithUniqueSlug(tenantName: string): Promise<{ id: string }> {
  const baseSlug = slugifyTenantName(tenantName);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 4)}`;
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: tenantName,
        slug,
        settings: {
          timezone: 'Europe/Kyiv',
          locale: 'uk',
        },
      })
      .select('id')
      .single();

    if (!error && data) return data;
    if (error?.code !== '23505') {
      throw new Error(`Failed to create tenant: ${error?.message ?? 'Unknown error'}`);
    }
  }

  throw new Error('Failed to generate unique tenant slug');
}

async function resolvePlanId(planCode: string): Promise<string> {
  const normalizedCode = normalizeText(planCode).toLowerCase();

  const { data, error } = await supabaseAdmin
    .from('saas_plans')
    .select('id')
    .eq('code', normalizedCode)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve plan: ${error.message}`);
  if (data?.id) return data.id;

  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from('saas_plans')
    .select('id')
    .eq('code', 'starter')
    .maybeSingle();

  if (fallbackError || !fallback?.id) {
    throw new Error(fallbackError?.message ?? 'No plan found for provisioning');
  }

  return fallback.id;
}

async function syncTenantEntitlementsFromPlan(tenantId: string, planId: string): Promise<void> {
  const { data: features, error: featuresError } = await supabaseAdmin
    .from('saas_plan_features')
    .select('feature_key,limit_value,is_enabled')
    .eq('plan_id', planId);

  if (featuresError) {
    throw new Error(`Failed to load plan features: ${featuresError.message}`);
  }

  const rows: Array<{
    tenant_id: string;
    feature_key: string;
    limit_value: number | null;
    is_enabled: boolean;
    source: string;
  }> = (features ?? []).map((row) => ({
    tenant_id: tenantId,
    feature_key: row.feature_key,
    limit_value: row.limit_value,
    is_enabled: row.is_enabled,
    source: 'plan',
  }));

  if (rows.length === 0) {
    await supabaseAdmin
      .from('saas_entitlements')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('source', 'plan');
    return;
  }

  const { error: upsertError } = await supabaseAdmin
    .from('saas_entitlements')
    .upsert(rows, { onConflict: 'tenant_id,feature_key' });

  if (upsertError) {
    throw new Error(`Failed to upsert tenant entitlements: ${upsertError.message}`);
  }

  const { data: currentRows, error: currentRowsError } = await supabaseAdmin
    .from('saas_entitlements')
    .select('feature_key')
    .eq('tenant_id', tenantId)
    .eq('source', 'plan');

  if (currentRowsError) {
    throw new Error(`Failed to list existing entitlements: ${currentRowsError.message}`);
  }

  const nextKeys = new Set(rows.map((row) => row.feature_key));
  const staleKeys = (currentRows ?? [])
    .map((row: { feature_key: string }) => row.feature_key)
    .filter((key: string) => !nextKeys.has(key));

  if (staleKeys.length > 0) {
    const { error: cleanupError } = await supabaseAdmin
      .from('saas_entitlements')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('source', 'plan')
      .in('feature_key', staleKeys);

    if (cleanupError) {
      throw new Error(`Failed to cleanup old entitlements: ${cleanupError.message}`);
    }
  }
}

async function ensureProfileAndMembership(input: {
  userId: string;
  tenantId: string;
  ownerFullName: string;
  ownerEmail: string;
}): Promise<void> {
  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id,tenant_id')
    .eq('id', input.userId)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(`Failed to check profile: ${profileLookupError.message}`);
  }

  if (existingProfile && existingProfile.tenant_id !== input.tenantId) {
    throw new Error('Auth user already belongs to another tenant.');
  }

  if (!existingProfile) {
    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      id: input.userId,
      tenant_id: input.tenantId,
      full_name: input.ownerFullName,
      role: 'admin',
      email: input.ownerEmail,
      is_active: true,
    });

    if (insertProfileError) {
      throw new Error(`Failed to insert profile: ${insertProfileError.message}`);
    }
  } else {
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: input.ownerFullName,
        email: input.ownerEmail,
        role: 'admin',
        is_active: true,
      })
      .eq('id', input.userId);

    if (updateProfileError) {
      throw new Error(`Failed to update profile: ${updateProfileError.message}`);
    }
  }

  const { error: membershipError } = await supabaseAdmin.from('tenant_members').upsert(
    {
      tenant_id: input.tenantId,
      profile_id: input.userId,
      role: 'admin',
      is_active: true,
    },
    { onConflict: 'tenant_id,profile_id' }
  );

  if (membershipError) {
    throw new Error(`Failed to ensure tenant membership: ${membershipError.message}`);
  }
}

export async function provisionTenantFromCheckout(
  input: ProvisionFromCheckoutInput
): Promise<CheckoutProvisionResult> {
  const normalizedEmail = normalizeText(input.ownerEmail).toLowerCase();
  const normalizedTenantName = normalizeText(input.tenantName);
  const normalizedOwnerName = normalizeText(input.ownerFullName);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Invalid owner email for provisioning.');
  }
  if (!normalizedTenantName) {
    throw new Error('Tenant name is required for provisioning.');
  }
  if (!normalizeText(input.provider)) {
    throw new Error('Billing provider is required for provisioning.');
  }
  if (!normalizeText(input.providerCustomerId)) {
    throw new Error('providerCustomerId is required for provisioning.');
  }
  if (!normalizeText(input.providerSubscriptionId)) {
    throw new Error('providerSubscriptionId is required for provisioning.');
  }

  const { data: existingCustomer, error: customerLookupError } = await supabaseAdmin
    .from('saas_customers')
    .select('tenant_id')
    .eq('provider', input.provider)
    .eq('provider_customer_id', input.providerCustomerId)
    .maybeSingle();

  if (customerLookupError) {
    throw new Error(`Failed to lookup billing customer: ${customerLookupError.message}`);
  }

  let tenantId = existingCustomer?.tenant_id as string | undefined;
  if (!tenantId) {
    const tenant = await insertTenantWithUniqueSlug(normalizedTenantName);
    tenantId = tenant.id;

    const { error: createCustomerError } = await supabaseAdmin.from('saas_customers').insert({
      tenant_id: tenantId,
      provider: input.provider,
      provider_customer_id: input.providerCustomerId,
    });

    if (createCustomerError) {
      throw new Error(`Failed to insert billing customer: ${createCustomerError.message}`);
    }
  }

  const authUser = await ensureAuthUser({
    email: normalizedEmail,
    fullName: normalizedOwnerName,
    password: input.ownerPassword,
  });

  await ensureProfileAndMembership({
    userId: authUser.id,
    tenantId,
    ownerFullName: normalizedOwnerName,
    ownerEmail: normalizedEmail,
  });

  const planId = await resolvePlanId(input.planCode);
  const status = input.subscriptionStatus ?? 'active';

  const { data: upsertedSubscription, error: subscriptionError } = await supabaseAdmin
    .from('saas_subscriptions')
    .upsert(
      {
        tenant_id: tenantId,
        plan_id: planId,
        provider: input.provider,
        provider_subscription_id: input.providerSubscriptionId,
        status,
        current_period_start: parseIso(input.currentPeriodStart),
        current_period_end: parseIso(input.currentPeriodEnd),
        cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
        canceled_at: status === 'canceled' ? new Date().toISOString() : null,
      },
      { onConflict: 'tenant_id' }
    )
    .select('id')
    .single();

  if (subscriptionError || !upsertedSubscription?.id) {
    throw new Error(subscriptionError?.message ?? 'Failed to upsert subscription');
  }

  await syncTenantEntitlementsFromPlan(tenantId, planId);

  return {
    tenantId,
    userId: authUser.id,
    subscriptionId: upsertedSubscription.id,
  };
}

export async function updateSubscriptionFromWebhook(input: {
  provider: string;
  providerSubscriptionId: string;
  planCode?: string;
  status?: SaasSubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<{ tenantId: string }> {
  const { data: subscriptionRow, error: subscriptionLookupError } = await supabaseAdmin
    .from('saas_subscriptions')
    .select('tenant_id,plan_id,status')
    .eq('provider', normalizeText(input.provider))
    .eq('provider_subscription_id', normalizeText(input.providerSubscriptionId))
    .maybeSingle();

  if (subscriptionLookupError) {
    throw new Error(`Failed to load subscription: ${subscriptionLookupError.message}`);
  }
  if (!subscriptionRow?.tenant_id) {
    throw new Error('Subscription not found for provider_subscription_id.');
  }

  const nextPlanId = input.planCode ? await resolvePlanId(input.planCode) : subscriptionRow.plan_id;
  const nextStatus = input.status ?? subscriptionRow.status;

  const { error: updateError } = await supabaseAdmin
    .from('saas_subscriptions')
    .update({
      plan_id: nextPlanId,
      status: nextStatus,
      current_period_start: parseIso(input.currentPeriodStart),
      current_period_end: parseIso(input.currentPeriodEnd),
      cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
      canceled_at: nextStatus === 'canceled' ? new Date().toISOString() : null,
    })
    .eq('provider', normalizeText(input.provider))
    .eq('provider_subscription_id', normalizeText(input.providerSubscriptionId));

  if (updateError) {
    throw new Error(`Failed to update subscription: ${updateError.message}`);
  }

  if (nextPlanId !== subscriptionRow.plan_id) {
    await syncTenantEntitlementsFromPlan(subscriptionRow.tenant_id, nextPlanId);
  }

  return { tenantId: subscriptionRow.tenant_id };
}
