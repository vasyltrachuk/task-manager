-- ============================================================================
-- Phase 0: Initial Schema
-- Multi-tenant SaaS for accounting companies with white-label Telegram bots
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. Tables (FK-safe order)
-- ----------------------------------------------------------------------------

-- 2.1 Tenants
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.2 Profiles (linked to Supabase Auth)
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  full_name   text NOT NULL,
  role        text NOT NULL DEFAULT 'accountant',
  phone       text,
  email       text,
  avatar_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.3 Tenant members (profile ↔ tenant + role)
CREATE TABLE tenant_members (
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  role        text NOT NULL DEFAULT 'accountant',
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id)
);

-- 2.4 Telegram bots per tenant
CREATE TABLE tenant_bots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  bot_username    text,
  display_name    text,
  token_encrypted bytea NOT NULL,
  webhook_secret  text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2.5 Clients
CREATE TABLE clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  name                text NOT NULL,
  type                text NOT NULL,
  tax_id_type         text NOT NULL DEFAULT 'rnokpp',
  tax_id              text NOT NULL,
  status              text NOT NULL DEFAULT 'onboarding',
  tax_system          text,
  is_vat_payer        boolean NOT NULL DEFAULT false,
  income_limit        integer,
  income_limit_source text,
  contact_phone       text,
  contact_email       text,
  employee_count      integer,
  industry            text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tax_id)
);

-- 2.6 Client ↔ Accountant assignment
CREATE TABLE client_accountants (
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  client_id       uuid NOT NULL REFERENCES clients(id),
  accountant_id   uuid NOT NULL REFERENCES profiles(id),
  is_primary      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, client_id, accountant_id)
);

-- 2.7 Tasks
CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  client_id       uuid NOT NULL REFERENCES clients(id),
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'todo',
  type            text NOT NULL DEFAULT 'other',
  due_date        date NOT NULL,
  priority        smallint NOT NULL DEFAULT 2,
  assignee_id     uuid NOT NULL REFERENCES profiles(id),
  created_by      uuid NOT NULL REFERENCES profiles(id),
  recurrence      text NOT NULL DEFAULT 'none',
  recurrence_days integer[],
  period          text,
  proof_required  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2.8 Subtasks
CREATE TABLE subtasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title        text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0
);

-- 2.9 Task comments
CREATE TABLE task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.10 Task files
CREATE TABLE task_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL REFERENCES profiles(id),
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime         text NOT NULL,
  size_bytes   bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2.11 Licenses
CREATE TABLE licenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  client_id           uuid NOT NULL REFERENCES clients(id),
  responsible_id      uuid NOT NULL REFERENCES profiles(id),
  type                text NOT NULL,
  number              text NOT NULL,
  issuing_authority   text NOT NULL,
  place_of_activity   text,
  status              text NOT NULL DEFAULT 'draft',
  issued_at           date NOT NULL,
  valid_from          date NOT NULL,
  valid_to            date,
  payment_frequency   text NOT NULL DEFAULT 'none',
  next_payment_due    date,
  next_check_due      date,
  last_checked_at     timestamptz,
  last_check_result   text NOT NULL DEFAULT 'not_checked',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2.12 Billing plans
CREATE TABLE billing_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  cadence     text NOT NULL DEFAULT 'monthly',
  fee_minor   integer NOT NULL,
  currency    text NOT NULL DEFAULT 'UAH',
  due_day     smallint NOT NULL DEFAULT 1,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.13 Invoices
CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  client_id         uuid NOT NULL REFERENCES clients(id),
  billing_plan_id   uuid REFERENCES billing_plans(id),
  period            text NOT NULL,
  amount_due_minor  integer NOT NULL,
  amount_paid_minor integer NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'UAH',
  issued_at         timestamptz NOT NULL DEFAULT now(),
  due_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2.14 Payments
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  client_id     uuid NOT NULL REFERENCES clients(id),
  amount_minor  integer NOT NULL,
  currency      text NOT NULL DEFAULT 'UAH',
  paid_at       timestamptz NOT NULL,
  method        text NOT NULL DEFAULT 'bank_transfer',
  status        text NOT NULL DEFAULT 'received',
  external_ref  text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2.15 Payment allocations
CREATE TABLE payment_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  payment_id    uuid NOT NULL REFERENCES payments(id),
  invoice_id    uuid NOT NULL REFERENCES invoices(id),
  amount_minor  integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2.16 Telegram contacts
CREATE TABLE telegram_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  bot_id            uuid NOT NULL REFERENCES tenant_bots(id),
  telegram_user_id  bigint NOT NULL,
  chat_id           bigint NOT NULL,
  username          text,
  first_name        text,
  last_name         text,
  phone             text,
  client_id         uuid REFERENCES clients(id),
  is_blocked        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, telegram_user_id)
);

-- 2.17 Conversations
CREATE TABLE conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  bot_id                  uuid NOT NULL REFERENCES tenant_bots(id),
  client_id               uuid REFERENCES clients(id),
  telegram_contact_id     uuid NOT NULL REFERENCES telegram_contacts(id),
  status                  text NOT NULL DEFAULT 'open',
  assigned_accountant_id  uuid REFERENCES profiles(id),
  last_message_at         timestamptz,
  unread_count            integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, telegram_contact_id)
);

-- 2.18 Conversation participants
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  role            text NOT NULL DEFAULT 'member',
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

-- 2.19 Messages
CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  conversation_id       uuid NOT NULL REFERENCES conversations(id),
  direction             text NOT NULL,
  source                text NOT NULL DEFAULT 'telegram',
  sender_profile_id     uuid REFERENCES profiles(id),
  telegram_message_id   bigint,
  body                  text,
  status                text NOT NULL DEFAULT 'received',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 2.20 Message attachments
CREATE TABLE message_attachments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id),
  message_id                uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  telegram_file_id          text,
  telegram_file_unique_id   text,
  storage_path              text NOT NULL,
  file_name                 text NOT NULL,
  mime                      text,
  size_bytes                bigint,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- 2.21 Documents
CREATE TABLE documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  client_id            uuid NOT NULL REFERENCES clients(id),
  origin_attachment_id uuid REFERENCES message_attachments(id),
  storage_path         text NOT NULL,
  file_name            text NOT NULL,
  mime                 text,
  size_bytes           bigint,
  doc_type             text,
  tags                 text[] DEFAULT '{}',
  created_by           uuid REFERENCES profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- 2.22 Task ↔ Document (many-to-many)
CREATE TABLE task_documents (
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  linked_by   uuid NOT NULL REFERENCES profiles(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, document_id)
);

-- 2.23 Raw Telegram updates (idempotency)
CREATE TABLE telegram_updates_raw (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id        uuid NOT NULL REFERENCES tenant_bots(id),
  update_id     bigint NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  error         text,
  UNIQUE (bot_id, update_id)
);

-- 2.24 Audit log
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  actor_id    uuid REFERENCES profiles(id),
  entity      text NOT NULL,
  entity_id   uuid NOT NULL,
  action      text NOT NULL,
  meta        jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.25 Notifications
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES profiles(id),
  title       text NOT NULL,
  body        text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.26 Tax rulebook config
CREATE TABLE tax_rulebook_configs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  year                        smallint NOT NULL,
  minimum_wage_on_january_1   integer NOT NULL,
  single_tax_multipliers      jsonb NOT NULL,
  vat_registration_threshold  integer NOT NULL,
  UNIQUE (tenant_id, year)
);

-- ----------------------------------------------------------------------------
-- 3. Helper functions
-- ----------------------------------------------------------------------------

-- Returns tenant_id for the currently authenticated user.
-- Used in all RLS policies as the single source of truth.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Auto-update updated_at on row modification.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. updated_at triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenant_bots_updated_at
  BEFORE UPDATE ON tenant_bots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON licenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_billing_plans_updated_at
  BEFORE UPDATE ON billing_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_telegram_contacts_updated_at
  BEFORE UPDATE ON telegram_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Row-Level Security
-- ----------------------------------------------------------------------------

-- 5.1 Tenants — members can read their own tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (id = public.current_tenant_id());

CREATE POLICY "tenants_update" ON tenants
  FOR UPDATE USING (
    id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.2 Profiles — read all in tenant, update own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.3 Tenant members
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_select" ON tenant_members
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_members_write" ON tenant_members
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.4 Tenant bots
ALTER TABLE tenant_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_bots_select" ON tenant_bots
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_bots_write" ON tenant_bots
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.5 Clients — admin sees all, accountant sees assigned only
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_id = clients.id
          AND accountant_id = auth.uid()
          AND tenant_id = clients.tenant_id
      )
    )
  );

CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (tenant_id = public.current_tenant_id());

CREATE POLICY "clients_delete" ON clients
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.6 Client accountants
ALTER TABLE client_accountants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_accountants_select" ON client_accountants
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "client_accountants_write" ON client_accountants
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.7 Tasks — admin sees all, accountant sees assigned tasks for assigned clients
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR assignee_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_id = tasks.client_id
          AND accountant_id = auth.uid()
          AND tenant_id = tasks.tenant_id
      )
    )
  );

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR assignee_id = auth.uid()
    )
  );

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.8 Subtasks — follow parent task access
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subtasks_select" ON subtasks
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = subtasks.task_id
        AND t.tenant_id = subtasks.tenant_id
    )
  );

CREATE POLICY "subtasks_write" ON subtasks
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.9 Task comments
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_comments_select" ON task_comments
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "task_comments_insert" ON task_comments
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.10 Task files
ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_files_select" ON task_files
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "task_files_write" ON task_files
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.11 Licenses — admin sees all, accountant sees for assigned clients
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licenses_select" ON licenses
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR responsible_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_id = licenses.client_id
          AND accountant_id = auth.uid()
          AND tenant_id = licenses.tenant_id
      )
    )
  );

CREATE POLICY "licenses_write" ON licenses
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.12 Billing plans
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_plans_select" ON billing_plans
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "billing_plans_write" ON billing_plans
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5.13 Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "invoices_write" ON invoices
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.14 Payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "payments_write" ON payments
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.15 Payment allocations
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_allocations_select" ON payment_allocations
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "payment_allocations_write" ON payment_allocations
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.16 Telegram contacts
ALTER TABLE telegram_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_contacts_select" ON telegram_contacts
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- Write via service role only (webhook workers)

-- 5.17 Conversations — admin sees all, accountant sees assigned clients
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR assigned_accountant_id = auth.uid()
      OR client_id IN (
        SELECT client_id FROM client_accountants
        WHERE accountant_id = auth.uid()
          AND tenant_id = conversations.tenant_id
      )
    )
  );

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (tenant_id = public.current_tenant_id());

-- 5.18 Conversation participants
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_participants_select" ON conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_participants.conversation_id
        AND c.tenant_id = public.current_tenant_id()
    )
  );

-- 5.19 Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.20 Message attachments
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_attachments_select" ON message_attachments
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- 5.21 Documents — admin sees all, accountant sees for assigned clients
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_id = documents.client_id
          AND accountant_id = auth.uid()
          AND tenant_id = documents.tenant_id
      )
    )
  );

CREATE POLICY "documents_write" ON documents
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.22 Task documents
ALTER TABLE task_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_documents_select" ON task_documents
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "task_documents_write" ON task_documents
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.23 Telegram updates raw — service role only
ALTER TABLE telegram_updates_raw ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — accessed only via service role (webhook worker)

-- 5.24 Audit log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id());

-- 5.25 Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  );

-- 5.26 Tax rulebook configs
ALTER TABLE tax_rulebook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_rulebook_configs_select" ON tax_rulebook_configs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tax_rulebook_configs_write" ON tax_rulebook_configs
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 6. Indexes
-- ----------------------------------------------------------------------------

-- Tenant isolation
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_documents_tenant ON documents(tenant_id);

-- Query performance
CREATE INDEX idx_conversations_tenant_last_msg ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_documents_client ON documents(client_id, created_at DESC);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_audit_log_entity ON audit_log(tenant_id, entity, entity_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Telegram fast paths
CREATE UNIQUE INDEX idx_telegram_contacts_bot_user ON telegram_contacts(bot_id, telegram_user_id);
CREATE UNIQUE INDEX idx_telegram_updates_bot_uid ON telegram_updates_raw(bot_id, update_id);
CREATE INDEX idx_tenant_bots_public_id ON tenant_bots(public_id) WHERE is_active = true;
