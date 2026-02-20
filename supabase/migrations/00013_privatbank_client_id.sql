-- ============================================================================
-- PrivatBank integrations: require client id (header "id")
-- ============================================================================

ALTER TABLE privatbank_accountant_tokens
  ADD COLUMN IF NOT EXISTS client_id text;

-- Backfill with empty string for legacy rows if any (UI/API will force re-save with valid value)
UPDATE privatbank_accountant_tokens
SET client_id = ''
WHERE client_id IS NULL;

ALTER TABLE privatbank_accountant_tokens
  ALTER COLUMN client_id SET DEFAULT '',
  ALTER COLUMN client_id SET NOT NULL;
