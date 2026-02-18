import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TABLES = [
  'audit_log',
  'billing_plans',
  'client_accountants',
  'clients',
  'conversation_participants',
  'conversations',
  'documents',
  'dps_accountant_tokens',
  'dps_client_kep_profiles',
  'dps_registry_snapshots',
  'dps_sync_runs',
  'invoices',
  'licenses',
  'message_attachments',
  'messages',
  'notifications',
  'payment_allocations',
  'payments',
  'profiles',
  'subtasks',
  'task_comments',
  'task_documents',
  'task_files',
  'tasks',
  'tax_rulebook_configs',
  'telegram_contacts',
  'telegram_updates_raw',
  'tenant_bots',
  'tenant_members',
  'tenants',
];

function loadEnvFromDotLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }

  return env;
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.users: ${error.message}`);

    users.push(...(data?.users ?? []));

    if (!data?.nextPage) break;
    page = data.nextPage;
  }

  return users;
}

async function main() {
  const env = loadEnvFromDotLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Checking Supabase table cleanliness...\n');

  const tableResults = [];

  for (const table of TABLES) {
    const { count, error } = await supabase.from(table).select('*', {
      count: 'exact',
      head: true,
    });

    if (error) {
      const isMissing = error.code === 'PGRST205' || error.message.toLowerCase().includes('does not exist');
      tableResults.push({
        table,
        status: isMissing ? 'missing' : 'error',
        count: null,
        detail: error.message,
      });
      continue;
    }

    tableResults.push({
      table,
      status: 'ok',
      count: count ?? 0,
      detail: null,
    });
  }

  const authUsers = await listAllAuthUsers(supabase);

  for (const row of tableResults) {
    if (row.status === 'ok') {
      console.log(`- ${row.table}: ${row.count}`);
    } else {
      console.log(`- ${row.table}: [${row.status}] ${row.detail}`);
    }
  }

  console.log(`- auth.users: ${authUsers.length}`);

  const nonEmpty = tableResults.filter((r) => r.status === 'ok' && (r.count ?? 0) > 0);
  const hasErrors = tableResults.some((r) => r.status === 'error');
  const hasAuthUsers = authUsers.length > 0;

  console.log('\nSummary:');
  if (nonEmpty.length === 0 && !hasErrors && !hasAuthUsers) {
    console.log('Database looks clean: all checked tables are empty and auth.users is empty.');
    return;
  }

  if (nonEmpty.length > 0) {
    console.log('Non-empty tables:');
    for (const row of nonEmpty) {
      console.log(`  - ${row.table}: ${row.count}`);
    }
  } else {
    console.log('All checked tables are empty.');
  }

  if (hasAuthUsers) {
    console.log(`auth.users is not empty: ${authUsers.length}`);
  }

  if (hasErrors) {
    console.log('Some tables returned errors (see list above).');
  }

  process.exitCode = 2;
}

main().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});

