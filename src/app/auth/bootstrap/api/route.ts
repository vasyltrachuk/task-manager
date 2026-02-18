import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

const DEFAULT_TENANT_SETTINGS = {
  timezone: 'Europe/Kyiv',
  locale: 'uk',
};

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || Boolean(error.message?.includes('Could not find the table'));
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function toSlug(name: string): string {
  const base = transliterateUk(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

  if (base) return base;
  return `tenant-${crypto.randomUUID().slice(0, 8)}`;
}

async function isBootstrapComplete(): Promise<boolean> {
  const [{ count: tenantsCount, error: tenantsError }, { count: profilesCount, error: profilesError }] = await Promise.all([
    supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
  ]);

  if (tenantsError || profilesError) {
    throw new Error(tenantsError?.message ?? profilesError?.message ?? 'Bootstrap status check failed');
  }

  return (tenantsCount ?? 0) > 0 || (profilesCount ?? 0) > 0;
}

async function insertTenantWithUniqueSlug(tenantName: string): Promise<{ id: string; slug: string }> {
  const baseSlug = toSlug(tenantName);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomUUID().slice(0, 4)}`;

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: tenantName,
        slug,
        settings: DEFAULT_TENANT_SETTINGS,
      })
      .select('id,slug')
      .single();

    if (!error && data) {
      return data;
    }

    if (error?.code !== '23505') {
      throw new Error(error?.message ?? 'Unable to create tenant');
    }
  }

  throw new Error('Unable to generate unique tenant slug');
}

export async function GET() {
  try {
    const initialized = await isBootstrapComplete();
    const requiresSecret = Boolean(process.env.BOOTSTRAP_SECRET?.trim());
    return NextResponse.json({ initialized, requiresSecret });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  let createdTenantId: string | null = null;

  try {
    if (await isBootstrapComplete()) {
      return NextResponse.json(
        { error: 'Система вже ініціалізована. Використайте сторінку входу.' },
        { status: 409 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const tenantName = toSafeString(body.tenantName);
    const fullName = toSafeString(body.fullName);
    const email = toSafeString(body.email).toLowerCase();
    const password = toSafeString(body.password);
    const bootstrapSecret = toSafeString(body.bootstrapSecret);
    const requiredSecret = process.env.BOOTSTRAP_SECRET?.trim();

    if (!tenantName) {
      return NextResponse.json({ error: 'Вкажіть назву компанії.' }, { status: 400 });
    }
    if (!fullName) {
      return NextResponse.json({ error: "Вкажіть ім'я адміністратора." }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Вкажіть коректний email.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Пароль має містити щонайменше 8 символів.' }, { status: 400 });
    }
    if (requiredSecret && bootstrapSecret !== requiredSecret) {
      return NextResponse.json({ error: 'Невірний bootstrap ключ.' }, { status: 401 });
    }

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message ?? 'Не вдалося створити користувача.' },
        { status: 400 }
      );
    }

    createdUserId = createdUser.user.id;

    const tenant = await insertTenantWithUniqueSlug(tenantName);
    createdTenantId = tenant.id;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: createdUserId,
        tenant_id: createdTenantId,
        full_name: fullName,
        role: 'admin',
        email,
        is_active: true,
      });

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { error: membershipError } = await supabaseAdmin
      .from('tenant_members')
      .insert({
        tenant_id: createdTenantId,
        profile_id: createdUserId,
        role: 'admin',
        is_active: true,
      });

    if (membershipError) {
      throw new Error(membershipError.message);
    }

    const tenantId = createdTenantId;
    if (!tenantId) {
      throw new Error('Tenant was not created.');
    }

    // Optional: initialize starter trial subscription if SaaS billing tables are present.
    const { data: starterPlan, error: starterPlanError } = await supabaseAdmin
      .from('saas_plans')
      .select('id,trial_days')
      .eq('code', 'starter')
      .maybeSingle();

    if (starterPlanError && !isMissingTableError(starterPlanError)) {
      throw new Error(starterPlanError.message);
    }

    if (starterPlan?.id) {
      const now = new Date();
      const trialDays =
        typeof starterPlan.trial_days === 'number' && starterPlan.trial_days > 0
          ? starterPlan.trial_days
          : 14;
      const periodEnd = new Date(now.getTime() + trialDays * 86400000);

      const { error: subscriptionError } = await supabaseAdmin.from('saas_subscriptions').upsert(
        {
          tenant_id: tenantId,
          plan_id: starterPlan.id,
          provider: 'internal',
          provider_subscription_id: `bootstrap-${tenantId}`,
          status: 'trialing',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        },
        { onConflict: 'tenant_id' }
      );

      if (subscriptionError && !isMissingTableError(subscriptionError)) {
        throw new Error(subscriptionError.message);
      }

      const { data: features, error: featuresError } = await supabaseAdmin
        .from('saas_plan_features')
        .select('feature_key,limit_value,is_enabled')
        .eq('plan_id', starterPlan.id);

      if (featuresError && !isMissingTableError(featuresError)) {
        throw new Error(featuresError.message);
      }

      if (features && features.length > 0) {
        const { error: entitlementsError } = await supabaseAdmin.from('saas_entitlements').upsert(
          features.map((feature: { feature_key: string; limit_value: number | null; is_enabled: boolean }) => ({
            tenant_id: tenantId,
            feature_key: feature.feature_key,
            limit_value: feature.limit_value,
            is_enabled: feature.is_enabled,
            source: 'plan',
          })),
          { onConflict: 'tenant_id,feature_key' }
        );

        if (entitlementsError && !isMissingTableError(entitlementsError)) {
          throw new Error(entitlementsError.message);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId: createdTenantId,
      tenantSlug: tenant.slug,
      userId: createdUserId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (createdTenantId && createdUserId) {
      await supabaseAdmin
        .from('tenant_members')
        .delete()
        .eq('tenant_id', createdTenantId)
        .eq('profile_id', createdUserId);
    }

    if (createdUserId) {
      await supabaseAdmin.from('profiles').delete().eq('id', createdUserId);
    }

    if (createdTenantId) {
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenantId);
    }

    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
