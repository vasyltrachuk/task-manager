-- Client avatar support (manual or channel-backed).
ALTER TABLE clients
  ADD COLUMN avatar_source text,
  ADD COLUMN avatar_url text,
  ADD COLUMN avatar_telegram_file_id text,
  ADD COLUMN avatar_updated_at timestamptz;

ALTER TABLE clients
  ADD CONSTRAINT clients_avatar_source_check
  CHECK (
    avatar_source IS NULL
    OR avatar_source IN ('manual', 'telegram', 'instagram', 'viber')
  );
