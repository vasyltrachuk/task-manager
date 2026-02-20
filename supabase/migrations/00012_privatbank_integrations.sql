-- ============================================================================
-- PrivatBank Integrations (accountant tokens)
-- ============================================================================

CREATE TABLE privatbank_accountant_tokens (
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

CREATE TRIGGER trg_privatbank_accountant_tokens_updated_at
  BEFORE UPDATE ON privatbank_accountant_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE privatbank_accountant_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE privatbank_accountant_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY "privatbank_accountant_tokens_select_self" ON privatbank_accountant_tokens
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "privatbank_accountant_tokens_insert_self" ON privatbank_accountant_tokens
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "privatbank_accountant_tokens_update_self" ON privatbank_accountant_tokens
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "privatbank_accountant_tokens_delete_self" ON privatbank_accountant_tokens
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE INDEX idx_privatbank_accountant_tokens_profile
  ON privatbank_accountant_tokens(tenant_id, profile_id)
  WHERE is_active = true;
