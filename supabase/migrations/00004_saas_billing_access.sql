-- ============================================================================
-- Phase 1: SaaS billing, provisioning, and entitlements foundation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SaaS billing tables
-- ----------------------------------------------------------------------------

CREATE TABLE saas_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,
  name                text NOT NULL,
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  monthly_price_minor integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'USD',
  trial_days          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saas_plan_features (
  plan_id      uuid NOT NULL REFERENCES saas_plans(id) ON DELETE CASCADE,
  feature_key  text NOT NULL,
  limit_value  integer,
  is_enabled   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE saas_customers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  provider             text NOT NULL,
  provider_customer_id text NOT NULL,
  provider_account_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id)
);

CREATE TABLE saas_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id                  uuid NOT NULL REFERENCES saas_plans(id),
  provider                 text NOT NULL,
  provider_subscription_id text NOT NULL,
  status                   text NOT NULL DEFAULT 'incomplete',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subscription_id),
  CONSTRAINT saas_subscriptions_status_check CHECK (
    status IN (
      'trialing',
      'active',
      'grace',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid'
    )
  )
);

CREATE TABLE saas_entitlements (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key  text NOT NULL,
  limit_value  integer,
  is_enabled   boolean NOT NULL DEFAULT true,
  source       text NOT NULL DEFAULT 'plan',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

CREATE TABLE saas_subscription_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  event_type        text NOT NULL,
  tenant_id         uuid REFERENCES tenants(id) ON DELETE SET NULL,
  payload           jsonb NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  processing_error  text,
  UNIQUE (provider, provider_event_id)
);

-- ----------------------------------------------------------------------------
-- 2. Helper functions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_subscription_status(status_text text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(status_text, '') IN ('trialing', 'active', 'grace')
$$;

CREATE OR REPLACE FUNCTION public.has_active_saas_subscription(target_tenant uuid DEFAULT public.current_tenant_id())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.saas_subscriptions s
    WHERE s.tenant_id = target_tenant
      AND public.is_active_subscription_status(s.status)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_saas_subscription_status(target_tenant uuid DEFAULT public.current_tenant_id())
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.status
  FROM public.saas_subscriptions s
  WHERE s.tenant_id = target_tenant
$$;

CREATE OR REPLACE FUNCTION public.is_saas_feature_enabled(feature text, target_tenant uuid DEFAULT public.current_tenant_id())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT e.is_enabled
    FROM public.saas_entitlements e
    WHERE e.tenant_id = target_tenant
      AND e.feature_key = feature
    LIMIT 1
  ), false)
$$;

-- ----------------------------------------------------------------------------
-- 3. updated_at triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_saas_plans_updated_at
  BEFORE UPDATE ON saas_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saas_plan_features_updated_at
  BEFORE UPDATE ON saas_plan_features FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saas_customers_updated_at
  BEFORE UPDATE ON saas_customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saas_subscriptions_updated_at
  BEFORE UPDATE ON saas_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saas_entitlements_updated_at
  BEFORE UPDATE ON saas_entitlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS policies
-- ----------------------------------------------------------------------------

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_plans_select" ON saas_plans
  FOR SELECT USING (true);

ALTER TABLE saas_plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_plan_features_select" ON saas_plan_features
  FOR SELECT USING (true);

ALTER TABLE saas_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_customers_select" ON saas_customers
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_subscriptions_select" ON saas_subscriptions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE saas_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_entitlements_select" ON saas_entitlements
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE saas_subscription_events ENABLE ROW LEVEL SECURITY;
-- Service-role only table: no user-facing policies.

-- ----------------------------------------------------------------------------
-- 5. Seed plans and default entitlements
-- ----------------------------------------------------------------------------

INSERT INTO saas_plans (code, name, description, is_active, monthly_price_minor, currency, trial_days)
VALUES
  ('starter', 'Starter', 'For solo accountants and micro teams', true, 4900, 'USD', 14),
  ('growth',  'Growth',  'For growing accounting teams', true, 9900, 'USD', 14),
  ('scale',   'Scale',   'For larger firms with advanced operations', true, 19900, 'USD', 14),
  ('legacy',  'Legacy',  'Compatibility plan for pre-billing tenants', true, 0, 'USD', 0)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  monthly_price_minor = EXCLUDED.monthly_price_minor,
  currency = EXCLUDED.currency,
  trial_days = EXCLUDED.trial_days,
  updated_at = now();

INSERT INTO saas_plan_features (plan_id, feature_key, limit_value, is_enabled)
SELECT
  p.id,
  f.feature_key,
  f.limit_value,
  f.is_enabled
FROM saas_plans p
JOIN (
  VALUES
    ('starter', 'clients.max', 100, true),
    ('starter', 'team.max_members', 3, true),
    ('starter', 'integrations.dps', NULL, true),
    ('starter', 'analytics.advanced', NULL, false),

    ('growth', 'clients.max', 500, true),
    ('growth', 'team.max_members', 10, true),
    ('growth', 'integrations.dps', NULL, true),
    ('growth', 'analytics.advanced', NULL, true),

    ('scale', 'clients.max', NULL, true),
    ('scale', 'team.max_members', NULL, true),
    ('scale', 'integrations.dps', NULL, true),
    ('scale', 'analytics.advanced', NULL, true),

    ('legacy', 'clients.max', NULL, true),
    ('legacy', 'team.max_members', NULL, true),
    ('legacy', 'integrations.dps', NULL, true),
    ('legacy', 'analytics.advanced', NULL, true)
) AS f(plan_code, feature_key, limit_value, is_enabled)
  ON p.code = f.plan_code
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  limit_value = EXCLUDED.limit_value,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

-- Backfill existing tenants with an active legacy subscription
INSERT INTO saas_subscriptions (
  tenant_id,
  plan_id,
  provider,
  provider_subscription_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end
)
SELECT
  t.id,
  p.id,
  'internal',
  CONCAT('legacy-', t.id::text),
  'active',
  now(),
  now() + INTERVAL '10 years',
  false
FROM tenants t
JOIN saas_plans p ON p.code = 'legacy'
LEFT JOIN saas_subscriptions s ON s.tenant_id = t.id
WHERE s.tenant_id IS NULL;

-- Materialize tenant entitlements from the assigned plan
INSERT INTO saas_entitlements (tenant_id, feature_key, limit_value, is_enabled, source)
SELECT
  s.tenant_id,
  f.feature_key,
  f.limit_value,
  f.is_enabled,
  'plan'
FROM saas_subscriptions s
JOIN saas_plan_features f ON f.plan_id = s.plan_id
ON CONFLICT (tenant_id, feature_key) DO UPDATE
SET
  limit_value = EXCLUDED.limit_value,
  is_enabled = EXCLUDED.is_enabled,
  source = EXCLUDED.source,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 6. Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX idx_saas_subscriptions_status ON saas_subscriptions(status);
CREATE INDEX idx_saas_entitlements_feature ON saas_entitlements(feature_key);
CREATE INDEX idx_saas_events_tenant ON saas_subscription_events(tenant_id, received_at DESC);
