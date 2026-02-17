# План реалізації: Multi-tenant SaaS + White-label Telegram боти

Оновлено: 2026-02-17

## 1. Концепція і вхідні умови

- **Продукт**: SaaS для бухгалтерських компаній.
- **Модель**: кожна бухгалтерська компанія (tenant) отримує свій white-label Telegram-бот, створений по шаблону.
- **Ключові сценарії**:
  - Клієнт пише в Telegram-бот своєї бухгалтерської компанії.
  - Бухгалтер та адмін бачать чат з клієнтами у веб-дашборді.
  - Клієнт надсилає документи через бот — бухгалтер прикріпляє їх до задач.
- **Поточний стан**: Next.js App Router з готовими UI-екранами (clients/tasks/team/billing/licenses/settings), дані — mock-store. Supabase залежності є, але не інтегровані.

## 2. Архітектурний патерн: Tenant-first

### 2.1 Принцип

Кожен запис у БД належить конкретному `tenant_id`. Це єдине джерело ізоляції даних між компаніями.

```
Tenant (бухгалтерська фірма)
  ├── 1..N Bots (white-label Telegram боти)
  ├── 1..N Members (admin, accountant, lawyer...)
  ├── 1..N Clients (ФОП, ТОВ, ...)
  ├── Conversations, Messages, Documents
  ├── Tasks, Licenses, Billing
  └── Settings, Branding
```

### 2.2 TenantContext як SSOT

Кожен запит (webhook, API, UI) починається з побудови `TenantContext`:

```typescript
interface TenantContext {
  tenantId: string;
  botId?: string;      // null для UI-запитів
  botToken?: string;   // decrypted, тільки in-memory
  userId?: string;     // auth.uid() для UI-запитів
}
```

- **Webhook**: `bot_public_id` → lookup `tenant_bots` → `tenant_id` + decrypt token.
- **UI API**: `auth.uid()` → lookup `tenant_members` → `tenant_id`.
- **Repos і use-cases**: завжди приймають `TenantContext` — неможливо випадково зробити cross-tenant запит.

### 2.3 Чому саме цей патерн

- **Shared DB, logical isolation** — одна БД з `tenant_id` + RLS. Найдешевше для SaaS на старті.
- **Сьогодні**: один tenant, один бот — працює з коробки.
- **Завтра**: N tenants, N ботів — без зміни архітектури.
- **DB-per-tenant** надмірний для бухгалтерського SaaS (десятки-сотні tenants, не тисячі).

## 3. Стек технологій

### 3.1 Core

| Категорія | Технологія | Пояснення |
|-----------|-----------|-----------|
| Framework | Next.js 16 (App Router) | Вже в проєкті |
| DB + Auth + Storage + Realtime | Supabase | Залежності є, мінімізує інтеграцію |
| Telegram Bot | `grammy` | TypeScript-first, webhook-модель |
| File handling | `@grammyjs/files` | Зручне завантаження файлів |
| Валідація | `zod` | Типобезпека API + форми |
| Черги | `bullmq` + `ioredis` | Retry, backoff, дедуп, DLQ |
| Client data-layer | `@tanstack/react-query` | Серверний стан у UI |
| Форми | `react-hook-form` + `@hookform/resolvers/zod` | |
| Логи | `pino` | Structured logs |
| Monitoring | `@sentry/nextjs` | Error tracking |

### 3.2 Альтернативи

- **Без Redis**: `pgmq` або `graphile-worker` (Postgres-based queue). Гірше під пікові медіа-завантаження.
- **High throughput**: винести bot-worker в окремий сервіс і масштабувати горизонтально.

## 4. Архітектура потоку даних

### 4.1 Inbound (клієнт → бухгалтер)

```text
Telegram User
  → Telegram Bot API
    → POST /api/telegram/webhook/{botPublicId}
      → Verify X-Telegram-Bot-Api-Secret-Token
      → Lookup: tenant_bots WHERE public_id = botPublicId
      → Build TenantContext { tenantId, botId, botToken }
      → Idempotency: INSERT telegram_updates_raw (bot_id, update_id) UNIQUE
      → Enqueue: BullMQ "inbound_process" { tenant_id, bot_id, payload }
        → Worker:
          → Upsert telegram_contact → resolve/create client
          → Create/update conversation
          → Persist message
          → If file: download via getFile → upload to Supabase Storage → create document
          → Supabase Realtime → Dashboard (бухгалтер бачить нове повідомлення)
```

### 4.2 Outbound (бухгалтер → клієнт)

```text
Dashboard (бухгалтер)
  → POST /api/conversations/:id/messages
    → Build TenantContext from auth session
    → Validate: user belongs to tenant + assigned to client
    → Persist outbound message (status: queued)
    → Enqueue: BullMQ "outbound_send" { tenant_id, bot_id, conversation_id, message_id }
      → Worker:
        → Decrypt bot token from tenant_bots
        → grammy: sendMessage / sendDocument
        → Update message status: sent / failed
        → Supabase Realtime → Dashboard update
```

### 4.3 Файли і документи

```text
File in Telegram message
  → Worker downloads via grammy getFile (до 20 MB)
  → Upload to Supabase Storage: /{tenant_id}/documents/{uuid}/{filename}
  → Create document record (tenant_id, client_id, origin_message_id)
  → Бухгалтер може:
    → Переглянути (signed URL, TTL 5 хв)
    → Прив'язати до задачі (task_documents)
    → Прив'язати до клієнта (вже через client_id)
```

## 5. Обмеження Telegram, враховані в дизайні

- Webhook (не getUpdates) — єдиний варіант для multi-bot SaaS.
- `getFile`: до ~20 MB через hosted Bot API.
- `sendDocument`: до ~50 MB.
- Великі файли: або Local Bot API Server, або зовнішнє завантаження через лінк.
- Rate limits: 30 msg/sec per bot, 20 msg/min per chat.

## 6. Схема даних (Supabase Postgres) — з нуля

### 6.1 Tenant-рівень

```sql
-- Компанія-орендар (бухгалтерська фірма)
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,           -- для URL: app.domain.com/{slug}
  is_active   boolean NOT NULL DEFAULT true,
  settings    jsonb NOT NULL DEFAULT '{}',     -- branding, timezone, locale
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Telegram-боти компанії (1..N per tenant)
CREATE TABLE tenant_bots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  public_id       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),  -- для webhook URL
  bot_username    text,                         -- @CompanyBot
  display_name    text,                         -- видиме ім'я бота
  token_encrypted bytea NOT NULL,               -- pgcrypto / Vault
  webhook_secret  text NOT NULL,                -- X-Telegram-Bot-Api-Secret-Token
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Зв'язок profile ↔ tenant + роль в рамках tenant
CREATE TABLE tenant_members (
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  role        text NOT NULL DEFAULT 'accountant',  -- admin | accountant | ...
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, profile_id)
);
```

### 6.2 Користувачі

```sql
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  full_name       text NOT NULL,
  role            text NOT NULL DEFAULT 'accountant',
  phone           text,
  email           text,
  avatar_url      text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 6.3 Клієнти

```sql
CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  name            text NOT NULL,
  type            text NOT NULL,                -- FOP | LLC | OSBB | NGO | GRANT
  tax_id_type     text NOT NULL DEFAULT 'ipn',  -- ipn | edrpou
  tax_id          text NOT NULL,
  status          text NOT NULL DEFAULT 'onboarding',
  tax_system      text,
  is_vat_payer    boolean NOT NULL DEFAULT false,
  income_limit    integer,
  income_limit_source text,
  contact_phone   text,
  contact_email   text,
  employee_count  integer,
  industry        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tax_id)
);

CREATE TABLE client_accountants (
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  client_id       uuid NOT NULL REFERENCES clients(id),
  accountant_id   uuid NOT NULL REFERENCES profiles(id),
  is_primary      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, client_id, accountant_id)
);
```

### 6.4 Задачі

```sql
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

CREATE TABLE subtasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  storage_path text NOT NULL,
  file_name   text NOT NULL,
  mime        text NOT NULL,
  size_bytes  bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 6.5 Ліцензії

```sql
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
```

### 6.6 Білінг

```sql
CREATE TABLE billing_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  cadence     text NOT NULL DEFAULT 'monthly',
  fee_minor   integer NOT NULL,                 -- kopecks
  currency    text NOT NULL DEFAULT 'UAH',
  due_day     smallint NOT NULL DEFAULT 1,      -- 1..28
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE payment_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  payment_id    uuid NOT NULL REFERENCES payments(id),
  invoice_id    uuid NOT NULL REFERENCES invoices(id),
  amount_minor  integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 6.7 Telegram контакти і діалоги

```sql
-- Зв'язок Telegram-юзера з ботом і (опціонально) клієнтом
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
  client_id         uuid REFERENCES clients(id),    -- null = не прив'язаний до клієнта
  is_blocked        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, telegram_user_id)
);

-- Діалог (1 per client per bot)
CREATE TABLE conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  bot_id                uuid NOT NULL REFERENCES tenant_bots(id),
  client_id             uuid REFERENCES clients(id),
  telegram_contact_id   uuid NOT NULL REFERENCES telegram_contacts(id),
  status                text NOT NULL DEFAULT 'open',       -- open | closed | archived
  assigned_accountant_id uuid REFERENCES profiles(id),
  last_message_at       timestamptz,
  unread_count          integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, telegram_contact_id)
);

-- Учасники діалогу (бухгалтери які бачать/ведуть цей чат)
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  role            text NOT NULL DEFAULT 'member',  -- owner | member | observer
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);
```

### 6.8 Повідомлення

```sql
CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  conversation_id       uuid NOT NULL REFERENCES conversations(id),
  direction             text NOT NULL,              -- inbound | outbound
  source                text NOT NULL DEFAULT 'telegram',  -- telegram | dashboard | system
  sender_profile_id     uuid REFERENCES profiles(id),       -- null для inbound
  telegram_message_id   bigint,                     -- для дедупу і reply
  body                  text,
  status                text NOT NULL DEFAULT 'received',   -- received | queued | sent | failed
  created_at            timestamptz NOT NULL DEFAULT now()
);

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
```

### 6.9 Документи

```sql
-- Документ = файл, прив'язаний до клієнта, доступний для прив'язки до задач
CREATE TABLE documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  client_id           uuid NOT NULL REFERENCES clients(id),
  origin_attachment_id uuid REFERENCES message_attachments(id),  -- звідки прийшов
  storage_path        text NOT NULL,
  file_name           text NOT NULL,
  mime                text,
  size_bytes          bigint,
  doc_type            text,                       -- invoice | act | contract | report | other
  tags                text[] DEFAULT '{}',
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: документ ↔ задача
CREATE TABLE task_documents (
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  linked_by   uuid NOT NULL REFERENCES profiles(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, document_id)
);
```

### 6.10 Службові таблиці

```sql
-- Ідемпотентність webhook-ів (bot_id + update_id — НЕ просто update_id)
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

-- Аудит-лог
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  actor_id    uuid REFERENCES profiles(id),
  entity      text NOT NULL,           -- client | task | document | message | ...
  entity_id   uuid NOT NULL,
  action      text NOT NULL,           -- create | update | delete | view | download | link
  meta        jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Сповіщення
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

-- Конфіг податкового довідника (per tenant)
CREATE TABLE tax_rulebook_configs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  year                        smallint NOT NULL,
  minimum_wage_on_january_1   integer NOT NULL,
  single_tax_multipliers      jsonb NOT NULL,
  vat_registration_threshold  integer NOT NULL,
  UNIQUE (tenant_id, year)
);
```

### 6.11 Критичні індекси

```sql
-- Tenant isolation (all main tables)
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
CREATE UNIQUE INDEX idx_telegram_contacts_bot_user ON telegram_contacts(bot_id, telegram_user_id);
CREATE UNIQUE INDEX idx_telegram_updates_bot_uid ON telegram_updates_raw(bot_id, update_id);
CREATE INDEX idx_audit_log_entity ON audit_log(tenant_id, entity, entity_id);
```

## 7. RLS (Row-Level Security)

```sql
-- Загальний принцип: user бачить тільки дані свого tenant_id
-- current_tenant_id() — helper function що бере tenant_id з auth.jwt()

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON clients
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Для бухгалтерів — додатково обмеження по призначенню
CREATE POLICY "accountant_sees_assigned_clients" ON clients
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (
        SELECT 1 FROM client_accountants
        WHERE client_id = clients.id AND accountant_id = auth.uid()
      )
    )
  );

-- Аналогічно для conversations, messages, documents
-- Бухгалтер бачить тільки діалоги призначених клієнтів
CREATE POLICY "accountant_sees_assigned_conversations" ON conversations
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR client_id IN (
        SELECT client_id FROM client_accountants WHERE accountant_id = auth.uid()
      )
    )
  );
```

## 8. Серверна архітектура (шари коду)

### 8.1 Структура директорій

```
src/
├── app/
│   ├── api/
│   │   └── telegram/
│   │       └── webhook/
│   │           └── [botPublicId]/
│   │               └── route.ts          ← Dynamic webhook endpoint
│   ├── (dashboard)/
│   │   ├── inbox/page.tsx                ← Чат-список
│   │   ├── clients/[id]/page.tsx         ← + вкладки Chat, Documents
│   │   └── settings/bots/page.tsx        ← Управління ботами tenant-а
│   └── ...
├── lib/
│   ├── server/
│   │   ├── tenant-context.ts             ← TenantContext builder
│   │   ├── supabase-admin.ts             ← Service-role client
│   │   ├── supabase-server.ts            ← Per-request client (SSR)
│   │   ├── tenant/
│   │   │   ├── tenant.repo.ts
│   │   │   └── tenant-bot.repo.ts
│   │   ├── telegram/
│   │   │   ├── webhook-handler.ts        ← Route → validate → enqueue
│   │   │   ├── inbound.use-case.ts       ← Process inbound message
│   │   │   ├── outbound.use-case.ts      ← Send outbound message
│   │   │   ├── grammy-adapter.ts         ← Port/Adapter for Telegram API
│   │   │   └── bot-factory.ts            ← Creates grammy Bot per tenant
│   │   ├── conversation/
│   │   │   ├── conversation.repo.ts
│   │   │   └── message.repo.ts
│   │   ├── document/
│   │   │   ├── document.repo.ts
│   │   │   └── storage.gateway.ts        ← Supabase Storage wrapper
│   │   ├── client/
│   │   │   └── client.repo.ts
│   │   ├── task/
│   │   │   └── task.repo.ts
│   │   └── queue/
│   │       ├── workers.ts                ← BullMQ worker definitions
│   │       └── jobs.ts                   ← Job type definitions
│   ├── types.ts                          ← Domain types (оновлені)
│   ├── rbac.ts                           ← RBAC (оновлений під tenant)
│   └── ...
```

### 8.2 Правила написання коду

1. **Route handler** — тільки валідація + передача в use-case. Жодної бізнес-логіки.
2. **Use-case** — отримує `TenantContext`, оркеструє repos і gateways.
3. **Repo** — завжди приймає `tenantId` параметром. Прямий SQL або Supabase client.
4. **Gateway** (Storage, Telegram) — абстракція зовнішнього сервісу з конкретною реалізацією.
5. **BullMQ job payload** — завжди містить `tenant_id`, `bot_id`. Worker відтворює TenantContext.

### 8.3 Webhook flow (детально)

```typescript
// app/api/telegram/webhook/[botPublicId]/route.ts
export async function POST(req: Request, { params }: { params: { botPublicId: string } }) {
  // 1. Lookup bot
  const bot = await tenantBotRepo.findByPublicId(params.botPublicId);
  if (!bot || !bot.is_active) return Response.json({}, { status: 404 });

  // 2. Verify secret
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== bot.webhook_secret) return Response.json({}, { status: 403 });

  // 3. Parse & idempotency
  const update = await req.json();
  const inserted = await rawUpdateRepo.tryInsert(bot.id, update.update_id, update);
  if (!inserted) return Response.json({ ok: true }); // duplicate, skip

  // 4. Enqueue
  await inboundQueue.add('process', {
    tenantId: bot.tenant_id,
    botId: bot.id,
    updateId: update.update_id,
  });

  return Response.json({ ok: true });
}
```

## 9. API контракти

### 9.1 Telegram

| Method | Endpoint | Опис |
|--------|----------|------|
| POST | `/api/telegram/webhook/{botPublicId}` | Webhook endpoint per bot |

### 9.2 Conversations & Messages

| Method | Endpoint | Опис |
|--------|----------|------|
| GET | `/api/conversations` | Список діалогів (filters: client_id, unread, assigned_to_me) |
| GET | `/api/conversations/:id/messages?cursor=` | Повідомлення з пагінацією |
| POST | `/api/conversations/:id/messages` | Надіслати повідомлення (текст + вкладення) |
| PATCH | `/api/conversations/:id` | Змінити assigned_accountant, status |

### 9.3 Documents

| Method | Endpoint | Опис |
|--------|----------|------|
| GET | `/api/documents?client_id=` | Список документів клієнта |
| POST | `/api/documents/:id/link-task` | Прив'язати документ до задачі |
| GET | `/api/documents/:id/signed-url` | Signed URL (TTL 5 хв) |

### 9.4 Tenant Bot Management

| Method | Endpoint | Опис |
|--------|----------|------|
| GET | `/api/tenant/bots` | Список ботів tenant-а |
| POST | `/api/tenant/bots` | Додати бот (token → encrypt + set webhook) |
| PATCH | `/api/tenant/bots/:id` | Оновити налаштування бота |
| DELETE | `/api/tenant/bots/:id` | Деактивувати бот |

## 10. Інтеграція в UI

### 10.1 Нові сторінки

- **`/inbox`**: список всіх діалогів tenant-а (для admin) або призначених (для accountant). Фільтри: unread, client, accountant.
- **`/clients/[id]` → вкладка "Чат"**: діалог з конкретним клієнтом.
- **`/clients/[id]` → вкладка "Документи"**: всі документи клієнта + кнопка "Прив'язати до задачі".
- **`/settings/bots`**: управління ботами tenant-а (додати, налаштувати, деактивувати).

### 10.2 Зміни в існуючих екранах

- **Tasks → detail modal**: блок "Документи" (linked docs + preview/download).
- **Clients → list**: badge кількості unread повідомлень.
- **Sidebar**: новий пункт "Inbox" з unread counter.

## 11. Безпека

### 11.1 Tenant isolation

- `tenant_id` на кожній таблиці + RLS — захист на рівні БД.
- TenantContext в коді — захист на рівні application.
- Storage bucket path: `/{tenant_id}/...` — файли ізольовані.

### 11.2 Bot token security

- Токени зашифровані в БД (`pgcrypto` або Supabase Vault).
- Дешифровка тільки в рантаймі, тільки для конкретного запиту.
- `webhook_secret` — окреме значення для верифікації Telegram webhooks.

### 11.3 Audit

- `audit_log` з `tenant_id`, `actor_id`, `entity`, `action`.
- Обов'язковий для: перегляд документа, скачування, прив'язка, відправка повідомлення.

### 11.4 Webhook security

- Перевірка `X-Telegram-Bot-Api-Secret-Token` per bot.
- Ідемпотентність: `UNIQUE(bot_id, update_id)`.
- Rate limiting на рівні middleware.

## 12. План реалізації по фазах

### Фаза 0: Foundation

- Supabase проєкт (dev/staging).
- Повна SQL-схема з нуля (всі таблиці з секції 6).
- RLS політики.
- Supabase Auth integration (email + password).
- Env secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`.
- `TenantContext` builder.
- Base repos pattern.

**DoD**: авторизація працює, RLS ізолює дані, seed data створюється.

### Фаза 1: Перехід з mock-store на Supabase

- Замінити `src/lib/mock-data.ts` + `store.tsx` на Supabase repos.
- React Query для data fetching.
- Всі існуючі екрани працюють з реальною БД.
- RBAC через RLS замість клієнтських перевірок.

**DoD**: всі існуючі сторінки (clients, tasks, team, billing, licenses, settings) працюють з Supabase.

### Фаза 2: Telegram Bot + Inbound/Outbound

- `grammy` інтеграція + `bot-factory.ts`.
- Webhook endpoint: `/api/telegram/webhook/[botPublicId]`.
- BullMQ: `inbound_process`, `outbound_send`, `file_download_upload`.
- Inbound: текст + файли → conversations + messages + documents.
- Outbound: dashboard reply → Telegram sendMessage/sendDocument.
- Delivery status tracking (queued → sent → failed).

**DoD**: текст і файли з Telegram з'являються в БД; відповідь бухгалтера доходить у Telegram.

### Фаза 3: Chat UI + Documents

- `/inbox` — список діалогів з realtime.
- Chat view з Supabase Realtime підпискою.
- Document viewer + signed URL download.
- Прив'язка документів до задач (task_documents).
- Unread counters на sidebar і client cards.

**DoD**: бухгалтер веде діалог з веба, прикріпляє документ до задачі за 2-3 кліки.

### Фаза 4: Bot Management + White-label

- `/settings/bots` — CRUD ботів.
- Автоматичний setWebhook при створенні бота.
- Branding settings per tenant (bot name, welcome message).
- Multi-bot per tenant support.

**DoD**: адмін самостійно додає нового бота через UI.

### Фаза 5: Hardening

- Sentry + pino structured logs.
- BullMQ dead-letter queue + alerting.
- Rate limiting + abuse protection.
- Retention policy + archival.
- E2E тести (Playwright).

**DoD**: production-ready з моніторингом і алертами.

## 13. Тестова стратегія

- **Unit**: TenantContext builder, webhook parser, RBAC rules, use-cases.
- **Integration**: webhook route + idempotency, outbound send retries, RLS policies.
- **E2E (Playwright)**: бухгалтер відкрив inbox → відповів → побачив document у задачі.
- **Regression**: існуючі сторінки не зламались після переходу на Supabase.

## 14. Ризики та мітігація

| Ризик | Мітігація |
|-------|-----------|
| Файл > 20 MB через Telegram | Політика розміру + Local Bot API Server |
| Дублікати webhook updates | `UNIQUE(bot_id, update_id)` + idempotent processing |
| Витік документів між tenants | RLS + storage path isolation + signed URL TTL |
| Latency при багатьох realtime-підписках | Selective subscriptions, pagination, cursor-based |
| Bot token compromise | Encrypted storage + audit log + token rotation UI |
| Cross-tenant data leak в коді | TenantContext як обов'язковий параметр у всіх repos |

## 15. Масштабування

- **Горизонтальне**: BullMQ workers можна масштабувати окремо від Next.js.
- **Tenant sharding**: на старті не потрібно. При 1000+ tenants — partitioning по tenant_id.
- **Bot workers**: окремий процес/контейнер, один worker обслуговує всіх tenants.
- **Storage**: Supabase Storage (S3-backed) масштабується автоматично.

## 16. Документація, використана для рішень

- Telegram Bot API: https://core.telegram.org/bots/api
- grammY: https://grammy.dev/
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase Storage: https://supabase.com/docs/guides/storage
- BullMQ: https://docs.bullmq.io/
