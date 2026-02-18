import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DELETE_ORDER = [
  { table: 'task_documents', column: 'task_id' },
  { table: 'task_comments', column: 'id' },
  { table: 'subtasks', column: 'id' },
  { table: 'task_files', column: 'id' },
  { table: 'documents', column: 'id' },
  { table: 'message_attachments', column: 'id' },
  { table: 'messages', column: 'id' },
  { table: 'payment_allocations', column: 'id' },
  { table: 'invoices', column: 'id' },
  { table: 'payments', column: 'id' },
  { table: 'billing_plans', column: 'id' },
  { table: 'notifications', column: 'id' },
  { table: 'conversation_participants', column: 'conversation_id' },
  { table: 'audit_log', column: 'id' },
  { table: 'dps_registry_snapshots', column: 'id' },
  { table: 'dps_client_kep_profiles', column: 'id' },
  { table: 'dps_sync_runs', column: 'id' },
  { table: 'dps_accountant_tokens', column: 'id' },
  { table: 'licenses', column: 'id' },
  { table: 'tasks', column: 'id' },
  { table: 'conversations', column: 'id' },
  { table: 'telegram_updates_raw', column: 'id' },
  { table: 'telegram_contacts', column: 'id' },
  { table: 'client_accountants', column: 'client_id' },
  { table: 'tax_rulebook_configs', column: 'id' },
  { table: 'tenant_members', column: 'tenant_id' },
  { table: 'tenant_bots', column: 'id' },
  { table: 'clients', column: 'id' },
  { table: 'profiles', column: 'id' },
  { table: 'tenants', column: 'id' },
];

function loadEnv() {
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

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function deleteAllRows(supabase, table, column) {
  const { count, error } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .not(column, 'is', null);

  if (error) throw new Error(`${table} delete: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    dryRun
      ? 'DRY RUN: checking what would be deleted from all app tables...'
      : 'Deleting all data from app tables...'
  );

  const results = [];

  for (const item of DELETE_ORDER) {
    let affected = 0;
    if (dryRun) {
      affected = await countRows(supabase, item.table);
    } else {
      affected = await deleteAllRows(supabase, item.table, item.column);
    }
    results.push({ table: item.table, affected });
  }

  const authUsers = await listAllAuthUsers(supabase);
  let deletedAuthUsers = 0;

  if (!dryRun) {
    for (const user of authUsers) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error && !error.message.toLowerCase().includes('user not found')) {
        throw new Error(`auth.users(${user.id}) delete: ${error.message}`);
      }
      if (!error) deletedAuthUsers += 1;
    }
  }

  console.log('\nSummary:');
  for (const row of results) {
    console.log(`- ${row.table}: ${row.affected}`);
  }
  console.log(`- auth.users: ${dryRun ? authUsers.length : deletedAuthUsers}`);

  const hasData = results.some((r) => r.affected > 0) || authUsers.length > 0;
  if (dryRun) {
    console.log(
      hasData
        ? '\nSome tables are not empty.'
        : '\nAll checked tables are already empty.'
    );
  } else {
    console.log('\nDone.');
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});

