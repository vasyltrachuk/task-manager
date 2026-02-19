-- Fix token_encrypted column type: bytea → text.
-- The column was originally defined as bytea which caused Supabase PostgREST
-- to return tokens as hex-escaped strings (e.g. \x383532...) instead of plain text.
ALTER TABLE tenant_bots
  ALTER COLUMN token_encrypted TYPE text
  USING convert_from(token_encrypted, 'UTF8');
