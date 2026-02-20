-- Staff Telegram linking: allow accountants to receive notifications
-- and reply to clients directly from the same Telegram bot.

ALTER TABLE profiles
  ADD COLUMN telegram_chat_id bigint,
  ADD COLUMN telegram_link_code text,
  ADD COLUMN telegram_link_code_expires_at timestamptz;

-- Fast staff detection during inbound webhook (unique per person)
CREATE UNIQUE INDEX idx_profiles_telegram_chat_id
  ON profiles(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Code lookup during /start linking
CREATE INDEX idx_profiles_telegram_link_code
  ON profiles(telegram_link_code)
  WHERE telegram_link_code IS NOT NULL;
