-- Atomic increment for conversation unread_count to avoid read-then-write race conditions.
CREATE OR REPLACE FUNCTION increment_conversation_unread(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_last_message_at timestamptz,
  p_client_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET
    unread_count    = unread_count + 1,
    last_message_at = p_last_message_at,
    client_id       = COALESCE(client_id, p_client_id)
  WHERE tenant_id = p_tenant_id
    AND id = p_conversation_id;
END;
$$;
