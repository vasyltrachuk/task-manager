-- ============================================================================
-- DPS Integrations (tokens, KEP profiles, snapshots, sync runs)
-- ============================================================================

CREATE TABLE dps_accountant_tokens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_ciphertext  text NOT NULL,
  token_masked      text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz,
  UNIQUE (tenant_id, profile_id)
);

CREATE TABLE dps_client_kep_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key_owner_name    text NOT NULL,
  key_owner_tax_id  text NOT NULL,
  cert_subject      text,
  cert_issuer       text,
  cert_serial       text,
  cert_valid_to     timestamptz,
  notes             text,
  last_verified_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE TABLE dps_registry_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  registry_code         text NOT NULL,
  status                text NOT NULL,
  normalized_payload    jsonb NOT NULL DEFAULT '{}',
  raw_payload           jsonb NOT NULL DEFAULT '{}',
  source                text NOT NULL DEFAULT 'manual',
  fetched_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, registry_code)
);

CREATE TABLE dps_sync_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  triggered_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  scope                  text NOT NULL DEFAULT 'full',
  client_id              uuid REFERENCES clients(id) ON DELETE SET NULL,
  source                 text NOT NULL DEFAULT 'manual',
  status                 text NOT NULL DEFAULT 'running',
  request_count          integer NOT NULL DEFAULT 0,
  success_count          integer NOT NULL DEFAULT 0,
  skipped_count          integer NOT NULL DEFAULT 0,
  error_count            integer NOT NULL DEFAULT 0,
  started_at             timestamptz NOT NULL DEFAULT now(),
  ended_at               timestamptz,
  meta                   jsonb NOT NULL DEFAULT '{}'
);

CREATE TRIGGER trg_dps_accountant_tokens_updated_at
  BEFORE UPDATE ON dps_accountant_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dps_client_kep_profiles_updated_at
  BEFORE UPDATE ON dps_client_kep_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_dps_registry_snapshots_updated_at
  BEFORE UPDATE ON dps_registry_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dps_accountant_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE dps_client_kep_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dps_registry_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dps_sync_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE dps_accountant_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE dps_client_kep_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE dps_registry_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE dps_sync_runs FORCE ROW LEVEL SECURITY;

-- DPS tokens are self-managed by the token owner.
CREATE POLICY "dps_accountant_tokens_select_self" ON dps_accountant_tokens
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "dps_accountant_tokens_insert_self" ON dps_accountant_tokens
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "dps_accountant_tokens_update_self" ON dps_accountant_tokens
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "dps_accountant_tokens_delete_self" ON dps_accountant_tokens
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "dps_client_kep_profiles_select" ON dps_client_kep_profiles
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_client_kep_profiles.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_client_kep_profiles.tenant_id
      )
    )
  );

CREATE POLICY "dps_client_kep_profiles_write" ON dps_client_kep_profiles
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_client_kep_profiles.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_client_kep_profiles.tenant_id
      )
    )
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_client_kep_profiles.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_client_kep_profiles.tenant_id
      )
    )
  );

CREATE POLICY "dps_registry_snapshots_select" ON dps_registry_snapshots
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_registry_snapshots.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_registry_snapshots.tenant_id
      )
    )
  );

CREATE POLICY "dps_registry_snapshots_write" ON dps_registry_snapshots
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_registry_snapshots.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_registry_snapshots.tenant_id
      )
    )
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_accountants.client_id = dps_registry_snapshots.client_id
          AND client_accountants.accountant_id = auth.uid()
          AND client_accountants.tenant_id = dps_registry_snapshots.tenant_id
      )
    )
  );

CREATE POLICY "dps_sync_runs_select" ON dps_sync_runs
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR triggered_by_profile_id = auth.uid()
    )
  );

CREATE POLICY "dps_sync_runs_insert" ON dps_sync_runs
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR triggered_by_profile_id = auth.uid()
    )
  );

CREATE POLICY "dps_sync_runs_update" ON dps_sync_runs
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR triggered_by_profile_id = auth.uid()
    )
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR triggered_by_profile_id = auth.uid()
    )
  );

CREATE INDEX idx_dps_accountant_tokens_profile
  ON dps_accountant_tokens(tenant_id, profile_id)
  WHERE is_active = true;

CREATE INDEX idx_dps_registry_snapshots_client_registry
  ON dps_registry_snapshots(tenant_id, client_id, registry_code);

CREATE INDEX idx_dps_sync_runs_started_at
  ON dps_sync_runs(tenant_id, started_at DESC);
