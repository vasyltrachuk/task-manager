-- ============================================================================
-- Seed: Dev environment — 1 tenant + 1 admin user
-- ============================================================================
--
-- IMPORTANT: Supabase does not allow direct INSERT into auth.users via SQL.
-- You must create the auth user first using ONE of these methods:
--
--   Option A (Supabase Dashboard):
--     1. Go to Authentication → Users → Add user
--     2. Email: admin@demo.com, Password: Admin1234!
--     3. Copy the generated UUID
--     4. Replace <AUTH_USER_UUID> below with that UUID
--
--   Option B (Supabase CLI local dev):
--     The seed runs automatically with `supabase db reset`.
--     Uncomment the auth.create_user block below.
--
--   Option C (Admin API):
--     curl -X POST 'https://<project>.supabase.co/auth/v1/admin/users' \
--       -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
--       -H 'Content-Type: application/json' \
--       -d '{"email":"admin@demo.com","password":"Admin1234!","email_confirm":true}'
--
-- ============================================================================

-- Uncomment for Supabase CLI local dev (supabase db reset):
-- SELECT auth.create_user('{
--   "email": "admin@demo.com",
--   "password": "Admin1234!",
--   "email_confirm": true
-- }'::jsonb);

-- 1. Tenant
INSERT INTO tenants (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Бухгалтерська Фірма',
  'demo',
  '{"timezone": "Europe/Kyiv", "locale": "uk"}'::jsonb
);

-- 2. Profile (replace <AUTH_USER_UUID> with actual auth.users.id)
-- When using Supabase CLI, you can get the UUID from the auth.create_user result.
INSERT INTO profiles (id, tenant_id, full_name, role, email, is_active)
VALUES (
  'e37da947-25e0-4cb2-852e-64ef61cc3cba',
  '00000000-0000-0000-0000-000000000001',
  'Адмін',
  'admin',
  'admin@demo.com',
  true
);

-- 3. Tenant member
INSERT INTO tenant_members (tenant_id, profile_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e37da947-25e0-4cb2-852e-64ef61cc3cba',
  'admin'
);

-- 4. Rulebook data is initialized through API:
-- POST /api/internal/rulebook/init
