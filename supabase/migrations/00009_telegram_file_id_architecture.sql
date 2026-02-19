-- ============================================================================
-- Migration 00009: Telegram file_id-first architecture
--
-- Strategy: Never store Telegram media binaries in Supabase Storage.
--   - All Telegram files (voice, photo, sticker, video_note, audio, document)
--     are identified by telegram_file_id and streamed on-demand via proxy.
--   - storage_path for Telegram files is a logical key only:
--       tenantId/tg/<attachmentId>_filename   (after processing)
--       tenantId/pending/<uuid>_filename       (before processing)
--   - Supabase Storage is used ONLY for files uploaded directly by dashboard
--     users (e.g. future document upload feature). Currently nothing is stored.
--   - outbound voice messages: telegram_file_id is captured from the sendVoice
--     response and stored — no binary upload to Supabase Storage.
--
-- file_id lifetime:
--   - file_id is permanent per Telegram official docs ("can be treated as persistent").
--   - Only file_path returned by getFile() is temporary (1 hour TTL) — always call
--     getFile() fresh when you need a download URL; never cache file_path.
--   - file_id can become invalid only if: original message deleted by user, bot loses
--     chat access, or (rarely) a Telegram server-side migration.
--   - Resilience: TELEGRAM_ARCHIVE_CHAT_ID env var — every inbound AND outbound
--     message with media is copied (copyMessage) to a private archive channel.
--     This creates an independent backup copy with its own file_id.
--
-- ============================================================================

-- Ensure duration_seconds column exists (added in 00008, safe to repeat)
ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- Index for fast lookup by telegram_file_unique_id (deduplication queries)
CREATE INDEX IF NOT EXISTS idx_message_attachments_tg_unique_id
  ON message_attachments (tenant_id, telegram_file_unique_id)
  WHERE telegram_file_unique_id IS NOT NULL;

-- Index for fast lookup by telegram_file_id (download proxy route)
CREATE INDEX IF NOT EXISTS idx_message_attachments_tg_file_id
  ON message_attachments (tenant_id, telegram_file_id)
  WHERE telegram_file_id IS NOT NULL;
