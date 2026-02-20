/**
 * Dev seed script — populates remote Supabase with baseline demo data
 *
 * Usage:  npx tsx supabase/seed-dev.ts
 *
 * Prerequisites:
 *   .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load env from .env.local ──────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constants ─────────────────────────────────────────────
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function daysFromNow(days: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

// ── Helper: unwrap Supabase result ────────────────────────
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data as T;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('Seeding dev data...\n');

  // ====================================================================
  // 1. Create 5 auth users + profiles + tenant_members
  // ====================================================================
  console.log('1. Creating auth users, profiles, and tenant members...');

  const usersInput = [
    { email: 'liudmyla@taskcontrol.ua', full_name: 'Людмила', role: 'admin', phone: '+380958646908' },
    { email: 'maria@taskcontrol.ua', full_name: 'Марія Коваленко', role: 'accountant', phone: '+380671112233' },
    { email: 'alex@taskcontrol.ua', full_name: 'Олексій Дорошенко', role: 'accountant', phone: '+380931234567' },
    { email: 'sarah@taskcontrol.ua', full_name: 'Сара Яценко', role: 'accountant', phone: '+380951234567' },
    { email: 'dmytro@taskcontrol.ua', full_name: 'Дмитро Василенко', role: 'accountant', phone: '+380661234567' },
  ];

  const userIds: string[] = [];

  for (const u of usersInput) {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((eu) => eu.email === u.email);

    if (existing) {
      console.log(`  User ${u.email} already exists (${existing.id}), skipping auth creation.`);
      userIds.push(existing.id);
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'Demo1234!',
        email_confirm: true,
      });
      if (authError) throw new Error(`Auth create ${u.email}: ${authError.message}`);
      userIds.push(authData.user.id);
      console.log(`  Created auth user ${u.email} → ${authData.user.id}`);
    }
  }

  // Upsert profiles (in case some already exist from seed.sql)
  for (let i = 0; i < usersInput.length; i++) {
    const u = usersInput[i];
    const uid = userIds[i];

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: uid,
        tenant_id: TENANT_ID,
        full_name: u.full_name,
        role: u.role,
        phone: u.phone,
        email: u.email,
        is_active: true,
      },
      { onConflict: 'id' }
    );
    if (profileError) throw new Error(`Profile upsert ${u.email}: ${profileError.message}`);
  }
  console.log(`  Upserted ${usersInput.length} profiles.`);

  // Upsert tenant_members
  for (let i = 0; i < usersInput.length; i++) {
    const { error: tmError } = await supabase.from('tenant_members').upsert(
      {
        tenant_id: TENANT_ID,
        profile_id: userIds[i],
        role: usersInput[i].role,
      },
      { onConflict: 'tenant_id,profile_id' }
    );
    if (tmError) throw new Error(`Tenant member upsert: ${tmError.message}`);
  }
  console.log(`  Upserted ${usersInput.length} tenant_members.\n`);

  const [adminId, acc1Id, acc2Id, acc3Id, acc4Id] = userIds;

  // ====================================================================
  // 2. Clients
  // ====================================================================
  console.log('2. Inserting clients...');

  const clientsData = [
    { name: 'Забіяка', type: 'LLC', tax_id_type: 'edrpou', tax_id: '37300216', status: 'active', tax_system: 'general_vat', is_vat_payer: true, contact_phone: '+380441234567', contact_email: 'info@techflow.ua', employee_count: 15, industry: "Виробництво м'ясних продуктів" },
    { name: 'Трачук В.Л', type: 'FOP', tax_id_type: 'rnokpp', tax_id: '3012456789', status: 'onboarding', tax_system: 'single_tax_group3_vat', is_vat_payer: true, income_limit: 8300000, income_limit_source: 'rulebook', contact_email: 'studio@design-a.ua', industry: 'Програміст' },
    { name: 'Бащук Олег Ярославович', type: 'FOP', tax_id_type: 'rnokpp', tax_id: '2876501943', status: 'active', tax_system: 'single_tax_group2', is_vat_payer: false, income_limit: 6200000, income_limit_source: 'rulebook', contact_phone: '+380671234567', industry: 'Роздрібна торгівля', employee_count: 5 },
    { name: 'Green Earth NGO', type: 'NGO', tax_id_type: 'edrpou', tax_id: '22018827', status: 'active', tax_system: 'non_profit', is_vat_payer: false, contact_email: 'info@greenearth.ua', industry: 'Некомерційна' },
    { name: 'Nordic Objects', type: 'LLC', tax_id_type: 'edrpou', tax_id: '55410233', status: 'active', tax_system: 'general_vat', is_vat_payer: true, contact_email: 'hello@nordic.ua', industry: 'E-commerce', employee_count: 8 },
    { name: 'Alpha Stream', type: 'FOP', tax_id_type: 'rnokpp', tax_id: '2992001456', status: 'active', tax_system: 'single_tax_group3', is_vat_payer: false, income_limit: 7900000, income_limit_source: 'rulebook', contact_email: 'alpha@stream.ua', industry: 'SaaS' },
    { name: 'Bright Roof', type: 'FOP', tax_id_type: 'rnokpp', tax_id: '3157789342', status: 'onboarding', tax_system: 'single_tax_group3', is_vat_payer: false, income_limit: 7800000, income_limit_source: 'rulebook', industry: 'Будівництво' },
    { name: 'Cafe Aroma', type: 'FOP', tax_id_type: 'rnokpp', tax_id: '3314456621', status: 'active', tax_system: 'single_tax_group2', is_vat_payer: false, income_limit: 6100000, income_limit_source: 'rulebook', contact_phone: '+380951112233', industry: 'HoReCa', employee_count: 3 },
    { name: 'Velvet Inc.', type: 'LLC', tax_id_type: 'edrpou', tax_id: '66789944', status: 'active', tax_system: 'general_vat', is_vat_payer: true, contact_email: 'office@velvet.ua', industry: 'Виробництво', employee_count: 22 },
  ];

  // Delete existing clients first (cascade will handle related data)
  await supabase.from('client_accountants').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('clients').delete().eq('tenant_id', TENANT_ID);

  const clientIds: string[] = [];
  for (const c of clientsData) {
    const result = await supabase
      .from('clients')
      .insert({ tenant_id: TENANT_ID, ...c })
      .select('id')
      .single();
    const data = unwrap(result, `Client ${c.name}`);
    clientIds.push(data.id);
  }
  console.log(`  Inserted ${clientIds.length} clients.`);

  // Client-accountant assignments: [clientIndex] → [profileIndex]
  //   c-001 → acc1, c-002 → acc2, c-003 → acc1, c-004 → acc2, c-005 → acc3
  //   c-006 → acc2, c-007 → acc1, c-008 → acc1, c-009 → acc4
  const clientAccountantMap: [number, string][] = [
    [0, acc1Id], [1, acc2Id], [2, acc1Id], [3, acc2Id], [4, acc3Id],
    [5, acc2Id], [6, acc1Id], [7, acc1Id], [8, acc4Id],
  ];

  const { error: caError } = await supabase.from('client_accountants').insert(
    clientAccountantMap.map(([ci, accId]) => ({
      tenant_id: TENANT_ID,
      client_id: clientIds[ci],
      accountant_id: accId,
      is_primary: true,
    }))
  );
  if (caError) throw new Error(`Client accountants: ${caError.message}`);
  console.log(`  Inserted ${clientAccountantMap.length} client_accountant assignments.\n`);

  // ====================================================================
  // 3. Licenses
  // ====================================================================
  console.log('3. Inserting licenses...');

  // Delete existing
  await supabase.from('licenses').delete().eq('tenant_id', TENANT_ID);

  const licensesData = [
    {
      client_id: clientIds[2], responsible_id: acc1Id, type: 'alcohol_retail',
      number: 'ALC-RT-23-1189', issuing_authority: 'ГУ ДПС у м. Києві',
      place_of_activity: 'м. Київ, вул. Антоновича, 12', status: 'expiring',
      issued_at: daysFromNow(-370), valid_from: daysFromNow(-370), valid_to: daysFromNow(6),
      payment_frequency: 'quarterly', next_payment_due: daysFromNow(4), next_check_due: daysFromNow(2),
      last_checked_at: daysFromNow(-28), last_check_result: 'warning',
      notes: 'Підготувати пакет документів на продовження до завершення строку дії.',
    },
    {
      client_id: clientIds[0], responsible_id: acc1Id, type: 'transport_cargo',
      number: 'TR-C-44512', issuing_authority: 'Укртрансбезпека',
      place_of_activity: 'Київська обл., с. Проліски, логістичний хаб 3', status: 'active',
      issued_at: daysFromNow(-520), valid_from: daysFromNow(-520), valid_to: daysFromNow(24),
      payment_frequency: 'yearly', next_payment_due: daysFromNow(24), next_check_due: daysFromNow(40),
      last_checked_at: daysFromNow(-14), last_check_result: 'ok',
      notes: 'Контроль техоглядів автопарку ведеться окремо.',
    },
    {
      client_id: clientIds[8], responsible_id: acc4Id, type: 'fuel_storage',
      number: 'FUEL-88911', issuing_authority: 'ГУ ДПС у Львівській обл.',
      place_of_activity: 'м. Львів, вул. Промислова, 24', status: 'expired',
      issued_at: daysFromNow(-430), valid_from: daysFromNow(-430), valid_to: daysFromNow(-2),
      payment_frequency: 'quarterly', next_payment_due: daysFromNow(-6), next_check_due: daysFromNow(-1),
      last_checked_at: daysFromNow(-95), last_check_result: 'mismatch',
      notes: 'Строк дії завершився. Потрібно негайно подати пакет на поновлення.',
    },
    {
      client_id: clientIds[3], responsible_id: acc2Id, type: 'medical_practice',
      number: 'MED-10221', issuing_authority: 'МОЗ України',
      place_of_activity: 'м. Київ, вул. Ділова, 9', status: 'active',
      issued_at: daysFromNow(-620), valid_from: daysFromNow(-620),
      payment_frequency: 'quarterly', next_payment_due: daysFromNow(-1), next_check_due: daysFromNow(12),
      last_checked_at: daysFromNow(-20), last_check_result: 'ok',
      notes: 'Ліцензія безстрокова, контроль фокусується на поквартальних платежах.',
    },
    {
      client_id: clientIds[4], responsible_id: acc3Id, type: 'transport_passenger',
      number: 'TR-P-33910', issuing_authority: 'Укртрансбезпека',
      place_of_activity: 'м. Київ, вул. Межигірська, 15', status: 'suspended',
      issued_at: daysFromNow(-300), valid_from: daysFromNow(-300), valid_to: daysFromNow(180),
      payment_frequency: 'yearly', next_payment_due: daysFromNow(175), next_check_due: daysFromNow(8),
      last_checked_at: daysFromNow(-45), last_check_result: 'warning',
      notes: 'Дія призупинена до усунення зауважень регулятора.',
    },
    {
      client_id: clientIds[7], responsible_id: acc1Id, type: 'alcohol_wholesale',
      number: 'ALC-WS-77801', issuing_authority: 'ГУ ДПС у м. Києві',
      place_of_activity: 'м. Київ, вул. Лугова, 28', status: 'draft',
      issued_at: daysFromNow(-20), valid_from: daysFromNow(5), valid_to: daysFromNow(370),
      payment_frequency: 'quarterly', next_check_due: daysFromNow(16),
      last_check_result: 'not_checked',
      notes: 'Чернетка: очікуємо оригінал підтвердження від клієнта.',
    },
  ];

  const licenseIds: string[] = [];
  for (const l of licensesData) {
    const result = await supabase
      .from('licenses')
      .insert({ tenant_id: TENANT_ID, ...l })
      .select('id')
      .single();
    const data = unwrap(result, `License ${l.number}`);
    licenseIds.push(data.id);
  }
  console.log(`  Inserted ${licenseIds.length} licenses.\n`);

  // ====================================================================
  // 4. Tasks + subtasks + comments
  // ====================================================================
  console.log('4. Inserting tasks, subtasks, and comments...');

  // Delete existing
  await supabase.from('task_comments').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('subtasks').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('task_files').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('tasks').delete().eq('tenant_id', TENANT_ID);

  const tasksData = [
    // TODO
    { client_id: clientIds[0], title: 'Q3 VAT Declaration', description: 'Підготувати та подати декларацію з ПДВ за Q3 2023.', status: 'todo', type: 'tax_report', due_date: '2023-10-19T23:59:00Z', priority: 1, assignee_id: acc1Id, created_by: adminId, recurrence: 'quarterly', period: 'Q3 2023', proof_required: true },
    { client_id: clientIds[7], title: 'Monthly Payroll Calculation', description: 'Розрахувати зарплату за жовтень, подати звіт до ДПС.', status: 'todo', type: 'payroll', due_date: '2023-10-20T23:59:00Z', priority: 2, assignee_id: acc1Id, created_by: adminId, recurrence: 'monthly', period: 'Жовтень 2023', proof_required: false },
    { client_id: clientIds[1], title: 'Initial Setup & Access', description: 'Отримати доступи до банк-клієнта, ДПС кабінету.', status: 'todo', type: 'onboarding', due_date: '2023-10-24T23:59:00Z', priority: 2, assignee_id: acc2Id, created_by: adminId, recurrence: 'none', proof_required: false },
    { client_id: clientIds[4], title: 'Q3 Tax Filing 2023', description: 'Подати декларацію з прибутку за Q3.', status: 'todo', type: 'tax_report', due_date: '2023-10-22T23:59:00Z', priority: 1, assignee_id: acc3Id, created_by: adminId, recurrence: 'quarterly', period: 'Q3 2023', proof_required: true },
    // IN PROGRESS
    { client_id: clientIds[3], title: 'Q3 Grant Reporting', description: 'Підготувати звіт по грантовим коштам за Q3.', status: 'in_progress', type: 'tax_report', due_date: '2023-10-22T23:59:00Z', priority: 2, assignee_id: acc2Id, created_by: adminId, recurrence: 'quarterly', period: 'Q3 2023', proof_required: true },
    { client_id: clientIds[8], title: 'VAT Correction Review', description: 'Перевірити коригування по ПДВ.', status: 'in_progress', type: 'tax_report', due_date: '2023-10-21T23:59:00Z', priority: 2, assignee_id: acc4Id, created_by: adminId, recurrence: 'none', proof_required: false },
    // CLARIFICATION
    { client_id: clientIds[1], title: 'Missing Invoice #402', description: 'Клієнт не надав рахунок #402, потрібно уточнити.', status: 'clarification', type: 'reconciliation', due_date: '2023-10-23T23:59:00Z', priority: 1, assignee_id: acc2Id, created_by: adminId, recurrence: 'none', proof_required: true },
    // REVIEW — the big task with subtasks + comments
    { client_id: clientIds[0], title: 'Q3 Tax Report: Acme Corp LLC', description: 'Please prepare the quarterly tax filing for Acme Corp LLC. This client is on the 3rd Group FOP tax scheme (5%).\n\nEnsure all contractor invoices from September are fully reconciled before generating the declaration PDF. Double-check the currency exchange rates for the USD account transfers on Sept 12th and Sept 28th.', status: 'review', type: 'tax_report', due_date: '2023-10-20T23:59:00Z', priority: 2, assignee_id: acc1Id, created_by: adminId, recurrence: 'quarterly', period: 'Q3 2023', proof_required: true },
    // DONE
    { client_id: clientIds[2], title: 'September Payroll', description: 'Зарплата за вересень подана.', status: 'done', type: 'payroll', due_date: '2023-10-05T23:59:00Z', priority: 3, assignee_id: acc1Id, created_by: adminId, recurrence: 'monthly', period: 'Вересень 2023', proof_required: false },
    { client_id: clientIds[4], title: 'Monthly Audit Check', description: 'Щомісячна звірка документів.', status: 'done', type: 'audit', due_date: '2023-10-30T23:59:00Z', priority: 3, assignee_id: acc4Id, created_by: adminId, recurrence: 'monthly', period: 'Жовтень 2023', proof_required: false },
    // Additional tasks for capacity view
    { client_id: clientIds[8], title: 'Invoice Reconciliation', description: 'Звірка рахунків за жовтень.', status: 'todo', type: 'reconciliation', due_date: '2023-10-28T23:59:00Z', priority: 2, assignee_id: acc4Id, created_by: adminId, recurrence: 'monthly', period: 'Жовтень 2023', proof_required: false },
    { client_id: clientIds[0], title: 'Payroll Verification', description: 'Верифікація зарплатної відомості.', status: 'review', type: 'payroll', due_date: '2023-10-27T23:59:00Z', priority: 2, assignee_id: acc3Id, created_by: adminId, recurrence: 'none', proof_required: true },
  ];

  const taskIds: string[] = [];
  for (const t of tasksData) {
    const result = await supabase
      .from('tasks')
      .insert({ tenant_id: TENANT_ID, ...t })
      .select('id')
      .single();
    const data = unwrap(result, `Task ${t.title}`);
    taskIds.push(data.id);
  }
  console.log(`  Inserted ${taskIds.length} tasks.`);

  // Subtasks for task index 7 (Q3 Tax Report: Acme Corp LLC)
  const bigTaskId = taskIds[7];
  const { error: stError } = await supabase.from('subtasks').insert([
    { tenant_id: TENANT_ID, task_id: bigTaskId, title: 'Reconcile Bank Statement (Monobank)', is_completed: true, sort_order: 1 },
    { tenant_id: TENANT_ID, task_id: bigTaskId, title: 'Verify 3rd Group Income Limits', is_completed: false, sort_order: 2 },
    { tenant_id: TENANT_ID, task_id: bigTaskId, title: 'Generate Declaration PDF & Sign', is_completed: false, sort_order: 3 },
  ]);
  if (stError) throw new Error(`Subtasks: ${stError.message}`);
  console.log('  Inserted 3 subtasks for "Q3 Tax Report".');

  // Comment on the big task
  const { error: cmError } = await supabase.from('task_comments').insert({
    tenant_id: TENANT_ID,
    task_id: bigTaskId,
    author_id: acc1Id,
    body: "Missing invoice for Sept 20th ($450). I've messaged the client on Telegram to request it.",
  });
  if (cmError) throw new Error(`Comment: ${cmError.message}`);
  console.log('  Inserted 1 comment.\n');

  // ====================================================================
  // 5. Audit log entries
  // ====================================================================
  console.log('5. Inserting audit log entries...');

  await supabase.from('audit_log').delete().eq('tenant_id', TENANT_ID);

  const auditEntries = [
    { entity: 'task', entity_id: bigTaskId, actor_id: adminId, action: 'created', meta: { title: 'Q3 Tax Report: Acme Corp LLC', details: 'Автоматично згенеровано з шаблону.' } },
    { entity: 'task', entity_id: bigTaskId, actor_id: acc1Id, action: 'status_changed', meta: { details: 'Взято в роботу' } },
  ];

  const { error: auditError } = await supabase.from('audit_log').insert(
    auditEntries.map((e) => ({ tenant_id: TENANT_ID, ...e }))
  );
  if (auditError) throw new Error(`Audit log: ${auditError.message}`);
  console.log(`  Inserted ${auditEntries.length} audit log entries.\n`);

  // ====================================================================
  // 6. Billing plans
  // ====================================================================
  console.log('6. Inserting billing plans...');

  await supabase.from('payment_allocations').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('payments').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('invoices').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('billing_plans').delete().eq('tenant_id', TENANT_ID);

  const billingPlansData = [
    { client_id: clientIds[0], cadence: 'monthly', fee_minor: 480_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[2], cadence: 'monthly', fee_minor: 320_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[3], cadence: 'monthly', fee_minor: 450_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[4], cadence: 'monthly', fee_minor: 390_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[7], cadence: 'monthly', fee_minor: 280_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[8], cadence: 'monthly', fee_minor: 720_000, currency: 'UAH', due_day: 10, is_active: true },
    { client_id: clientIds[1], cadence: 'monthly', fee_minor: 250_000, currency: 'UAH', due_day: 10, is_active: true },
  ];

  const billingPlanIds: string[] = [];
  for (const bp of billingPlansData) {
    const result = await supabase
      .from('billing_plans')
      .insert({ tenant_id: TENANT_ID, ...bp })
      .select('id')
      .single();
    const data = unwrap(result, `BillingPlan for client ${bp.client_id}`);
    billingPlanIds.push(data.id);
  }
  console.log(`  Inserted ${billingPlanIds.length} billing plans.\n`);

  // ====================================================================
  // 7. Invoices
  // ====================================================================
  console.log('7. Inserting invoices...');

  const invoicesData = [
    { client_id: clientIds[0], billing_plan_id: billingPlanIds[0], period: '2026-01', amount_due_minor: 480_000, amount_paid_minor: 480_000, currency: 'UAH', issued_at: daysFromNow(-34), due_date: daysFromNow(-20), status: 'paid' },
    { client_id: clientIds[0], billing_plan_id: billingPlanIds[0], period: '2026-02', amount_due_minor: 480_000, amount_paid_minor: 240_000, currency: 'UAH', issued_at: daysFromNow(-18), due_date: daysFromNow(-5), status: 'overdue' },
    { client_id: clientIds[2], billing_plan_id: billingPlanIds[1], period: '2026-02', amount_due_minor: 320_000, amount_paid_minor: 0, currency: 'UAH', issued_at: daysFromNow(-11), due_date: daysFromNow(6), status: 'sent' },
    { client_id: clientIds[3], billing_plan_id: billingPlanIds[2], period: '2026-02', amount_due_minor: 450_000, amount_paid_minor: 450_000, currency: 'UAH', issued_at: daysFromNow(-13), due_date: daysFromNow(-2), status: 'paid' },
    { client_id: clientIds[4], billing_plan_id: billingPlanIds[3], period: '2026-02', amount_due_minor: 390_000, amount_paid_minor: 100_000, currency: 'UAH', issued_at: daysFromNow(-16), due_date: daysFromNow(-1), status: 'overdue' },
    { client_id: clientIds[7], billing_plan_id: billingPlanIds[4], period: '2026-02', amount_due_minor: 280_000, amount_paid_minor: 150_000, currency: 'UAH', issued_at: daysFromNow(-12), due_date: daysFromNow(10), status: 'partially_paid' },
    { client_id: clientIds[8], billing_plan_id: billingPlanIds[5], period: '2026-02', amount_due_minor: 720_000, amount_paid_minor: 0, currency: 'UAH', issued_at: daysFromNow(-24), due_date: daysFromNow(-14), status: 'overdue' },
    { client_id: clientIds[1], billing_plan_id: billingPlanIds[6], period: '2026-02', amount_due_minor: 250_000, amount_paid_minor: 0, currency: 'UAH', issued_at: daysFromNow(-3), due_date: daysFromNow(15), status: 'draft' },
  ];

  const invoiceIds: string[] = [];
  for (const inv of invoicesData) {
    const result = await supabase
      .from('invoices')
      .insert({ tenant_id: TENANT_ID, ...inv })
      .select('id')
      .single();
    const data = unwrap(result, `Invoice ${inv.period} for client`);
    invoiceIds.push(data.id);
  }
  console.log(`  Inserted ${invoiceIds.length} invoices.\n`);

  // ====================================================================
  // 8. Payments
  // ====================================================================
  console.log('8. Inserting payments...');

  const paymentsData = [
    { client_id: clientIds[0], amount_minor: 480_000, currency: 'UAH', paid_at: daysFromNow(-18), method: 'bank_transfer', status: 'received', external_ref: 'MTB-2026-01-1120' },
    { client_id: clientIds[0], amount_minor: 240_000, currency: 'UAH', paid_at: daysFromNow(-3), method: 'card', status: 'received', external_ref: 'MONO-2026-02-1804' },
    { client_id: clientIds[3], amount_minor: 450_000, currency: 'UAH', paid_at: daysFromNow(-1), method: 'bank_transfer', status: 'received', external_ref: 'PRIVAT-2026-02-0901' },
    { client_id: clientIds[4], amount_minor: 100_000, currency: 'UAH', paid_at: daysFromNow(-4), method: 'bank_transfer', status: 'received', external_ref: 'MTB-2026-02-2104' },
    { client_id: clientIds[7], amount_minor: 150_000, currency: 'UAH', paid_at: daysFromNow(-2), method: 'card', status: 'received', external_ref: 'MONO-2026-02-1177' },
    { client_id: clientIds[8], amount_minor: 720_000, currency: 'UAH', paid_at: daysFromNow(2), method: 'bank_transfer', status: 'pending', external_ref: 'PUMB-2026-02-5561' },
  ];

  const paymentIds: string[] = [];
  for (const p of paymentsData) {
    const result = await supabase
      .from('payments')
      .insert({ tenant_id: TENANT_ID, ...p })
      .select('id')
      .single();
    const data = unwrap(result, `Payment ${p.external_ref}`);
    paymentIds.push(data.id);
  }
  console.log(`  Inserted ${paymentIds.length} payments.\n`);

  // ====================================================================
  // 9. Payment allocations
  // ====================================================================
  console.log('9. Inserting payment allocations...');

  const allocationsData = [
    { payment_id: paymentIds[0], invoice_id: invoiceIds[0], amount_minor: 480_000 },
    { payment_id: paymentIds[1], invoice_id: invoiceIds[1], amount_minor: 240_000 },
    { payment_id: paymentIds[2], invoice_id: invoiceIds[3], amount_minor: 450_000 },
    { payment_id: paymentIds[3], invoice_id: invoiceIds[4], amount_minor: 100_000 },
    { payment_id: paymentIds[4], invoice_id: invoiceIds[5], amount_minor: 150_000 },
  ];

  const { error: allocError } = await supabase.from('payment_allocations').insert(
    allocationsData.map((a) => ({ tenant_id: TENANT_ID, ...a }))
  );
  if (allocError) throw new Error(`Payment allocations: ${allocError.message}`);
  console.log(`  Inserted ${allocationsData.length} payment allocations.\n`);

  // ====================================================================
  // Done!
  // ====================================================================
  console.log('='.repeat(60));
  console.log('Dev seed completed successfully!');
  console.log(`  Tenant:   ${TENANT_ID}`);
  console.log(`  Users:    ${userIds.length} (login with Demo1234!)`);
  console.log(`  Clients:  ${clientIds.length}`);
  console.log(`  Licenses: ${licenseIds.length}`);
  console.log(`  Tasks:    ${taskIds.length}`);
  console.log(`  Billing:  ${billingPlanIds.length} plans, ${invoiceIds.length} invoices, ${paymentIds.length} payments`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
