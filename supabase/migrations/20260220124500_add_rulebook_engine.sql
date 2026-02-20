-- ============================================================================
-- Rulebook engine foundation: versioned rules + per-client overrides
-- + idempotent task generation log
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Client profile precision fields (for accurate rule matching)
-- ----------------------------------------------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Kyiv',
  ADD COLUMN IF NOT EXISTS payroll_frequency text NOT NULL DEFAULT 'semi_monthly',
  ADD COLUMN IF NOT EXISTS payroll_advance_day smallint NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS payroll_final_day smallint NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tax_system_effective_from date,
  ADD COLUMN IF NOT EXISTS vat_effective_from date,
  ADD COLUMN IF NOT EXISTS employee_count_effective_from date;

DO $$
BEGIN
  ALTER TABLE clients
    ADD CONSTRAINT clients_payroll_frequency_check
      CHECK (payroll_frequency IN ('semi_monthly', 'monthly', 'weekly', 'custom'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE clients
    ADD CONSTRAINT clients_payroll_advance_day_check
      CHECK (payroll_advance_day BETWEEN 1 AND 31);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE clients
    ADD CONSTRAINT clients_payroll_final_day_check
      CHECK (payroll_final_day BETWEEN 1 AND 31);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ----------------------------------------------------------------------------
-- 1. Versioned rulebooks
-- ----------------------------------------------------------------------------

CREATE TABLE rulebook_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT false,
  effective_from  date NOT NULL,
  effective_to    date,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rulebook_versions_effective_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (tenant_id, code)
);

-- At most one active rulebook per tenant.
CREATE UNIQUE INDEX uq_rulebook_versions_one_active_per_tenant
  ON rulebook_versions (tenant_id)
  WHERE is_active;

CREATE INDEX idx_rulebook_versions_tenant_effective
  ON rulebook_versions (tenant_id, effective_from DESC);

-- ----------------------------------------------------------------------------
-- 2. Rules (stored as JSON-config, evaluated by backend engine)
-- ----------------------------------------------------------------------------

CREATE TABLE rulebook_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_id         uuid NOT NULL REFERENCES rulebook_versions(id) ON DELETE CASCADE,
  code               text NOT NULL,
  title              text NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,

  -- Example shape:
  -- {"all":[{"field":"employee_count","op":"gt","value":10}]}
  match_condition    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Example shape:
  -- {"kind":"semi_monthly","event":"advance"}
  recurrence         jsonb NOT NULL,

  -- Example shape:
  -- {"kind":"day_of_month","day":15,"shift_if_non_business_day":"prev_business_day"}
  due_rule           jsonb NOT NULL,

  -- Example shape:
  -- {"title":"Payroll: аванс","task_type":"payroll","priority":2}
  task_template      jsonb NOT NULL,

  legal_basis        text[] NOT NULL DEFAULT '{}',
  sort_order         integer NOT NULL DEFAULT 100,
  created_by         uuid REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rulebook_rules_match_condition_object_check CHECK (jsonb_typeof(match_condition) = 'object'),
  CONSTRAINT rulebook_rules_recurrence_object_check CHECK (jsonb_typeof(recurrence) = 'object'),
  CONSTRAINT rulebook_rules_due_rule_object_check CHECK (jsonb_typeof(due_rule) = 'object'),
  CONSTRAINT rulebook_rules_task_template_object_check CHECK (jsonb_typeof(task_template) = 'object'),

  UNIQUE (tenant_id, version_id, code)
);

CREATE INDEX idx_rulebook_rules_tenant_version_active
  ON rulebook_rules (tenant_id, version_id, is_active, sort_order);

CREATE INDEX idx_rulebook_rules_tenant_code
  ON rulebook_rules (tenant_id, code);

-- ----------------------------------------------------------------------------
-- 3. Per-client overrides
-- ----------------------------------------------------------------------------

CREATE TABLE rulebook_rule_overrides (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rule_id                uuid NOT NULL REFERENCES rulebook_rules(id) ON DELETE CASCADE,

  -- true  => force-enabled
  -- false => force-disabled
  is_enabled             boolean NOT NULL DEFAULT true,

  -- Optional JSON object patches for rule runtime.
  due_rule_override      jsonb,
  task_template_override jsonb,

  reason                 text,
  created_by             uuid REFERENCES profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rulebook_rule_overrides_due_rule_object_check
    CHECK (due_rule_override IS NULL OR jsonb_typeof(due_rule_override) = 'object'),
  CONSTRAINT rulebook_rule_overrides_task_template_object_check
    CHECK (task_template_override IS NULL OR jsonb_typeof(task_template_override) = 'object'),

  UNIQUE (tenant_id, client_id, rule_id)
);

CREATE INDEX idx_rulebook_rule_overrides_tenant_client
  ON rulebook_rule_overrides (tenant_id, client_id);

-- ----------------------------------------------------------------------------
-- 4. Idempotent task generation log
-- ----------------------------------------------------------------------------

CREATE TABLE rulebook_task_generations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rule_id             uuid NOT NULL REFERENCES rulebook_rules(id) ON DELETE CASCADE,

  -- e.g. "2026-02", "2026-Q1", "2026"
  period_key          text NOT NULL,
  scheduled_due_date  date NOT NULL,

  generated_task_id   uuid REFERENCES tasks(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'created',
  error_message       text,
  generation_context  jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rulebook_task_generations_status_check
    CHECK (status IN ('created', 'linked', 'skipped', 'error', 'void')),
  CONSTRAINT rulebook_task_generations_context_object_check
    CHECK (jsonb_typeof(generation_context) = 'object'),

  -- Critical idempotency key: one generated item per client+rule+period.
  UNIQUE (tenant_id, client_id, rule_id, period_key)
);

CREATE INDEX idx_rulebook_task_generations_tenant_due
  ON rulebook_task_generations (tenant_id, scheduled_due_date, status);

CREATE INDEX idx_rulebook_task_generations_tenant_client
  ON rulebook_task_generations (tenant_id, client_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. updated_at triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_rulebook_versions_updated_at
  BEFORE UPDATE ON rulebook_versions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rulebook_rules_updated_at
  BEFORE UPDATE ON rulebook_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rulebook_rule_overrides_updated_at
  BEFORE UPDATE ON rulebook_rule_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rulebook_task_generations_updated_at
  BEFORE UPDATE ON rulebook_task_generations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Row-level security
-- ----------------------------------------------------------------------------

ALTER TABLE rulebook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebook_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebook_task_generations ENABLE ROW LEVEL SECURITY;

-- Everyone in tenant can read; only admin can mutate definitions/overrides.
CREATE POLICY "rulebook_versions_select" ON rulebook_versions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "rulebook_versions_write_admin" ON rulebook_versions
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "rulebook_rules_select" ON rulebook_rules
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "rulebook_rules_write_admin" ON rulebook_rules
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "rulebook_rule_overrides_select" ON rulebook_rule_overrides
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "rulebook_rule_overrides_write_admin" ON rulebook_rule_overrides
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Generation log is readable by tenant users; writes are admin-only in user context.
-- Service-role jobs bypass RLS and can always insert/update.
CREATE POLICY "rulebook_task_generations_select" ON rulebook_task_generations
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "rulebook_task_generations_write_admin" ON rulebook_task_generations
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
