-- Add duration_seconds to message_attachments for voice/audio/video_note
ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
