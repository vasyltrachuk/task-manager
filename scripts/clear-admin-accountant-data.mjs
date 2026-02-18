import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function deleteByIds(table, column, ids) {
  if (ids.length === 0) return 0;
  if (dryRun) return 0;

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .in(column, ids);

  if (error) {
    throw new Error(`${table}.${column}: ${error.message}`);
  }
  return count ?? 0;
}

async function updateNullByIds(table, column, ids) {
  if (ids.length === 0) return 0;
  if (dryRun) return 0;

  const { error, count } = await supabase
    .from(table)
    .update({ [column]: null }, { count: 'exact' })
    .in(column, ids);

  if (error) {
    throw new Error(`${table}.${column} -> null: ${error.message}`);
  }
  return count ?? 0;
}

async function deleteTasksBy(column, ids) {
  if (ids.length === 0) return 0;
  if (dryRun) return 0;

  const { error, count } = await supabase
    .from('tasks')
    .delete({ count: 'exact' })
    .in(column, ids);

  if (error) {
    throw new Error(`tasks.${column}: ${error.message}`);
  }
  return count ?? 0;
}

async function main() {
  console.log(
    dryRun
      ? 'DRY RUN: checking what would be deleted for admin/accountant data...'
      : 'Clearing admin/accountant data...'
  );

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, role, email')
    .in('role', ['admin', 'accountant']);

  if (profilesError) {
    throw new Error(`profiles read: ${profilesError.message}`);
  }

  const rows = profiles ?? [];
  const profileIds = rows.map((p) => p.id);

  if (profileIds.length === 0) {
    console.log('No admin/accountant profiles found. Nothing to delete.');
    return;
  }

  console.log(`Found ${profileIds.length} profile(s) with roles admin/accountant.`);

  const summary = [];
  const push = (table, count) => summary.push({ table, count });

  // Remove dependent rows first to satisfy FK constraints.
  push('conversation_participants', await deleteByIds('conversation_participants', 'profile_id', profileIds));
  push('messages', await deleteByIds('messages', 'sender_profile_id', profileIds));
  push('task_documents', await deleteByIds('task_documents', 'linked_by', profileIds));
  push('documents', await deleteByIds('documents', 'created_by', profileIds));
  push('notifications', await deleteByIds('notifications', 'user_id', profileIds));
  push('audit_log', await deleteByIds('audit_log', 'actor_id', profileIds));
  push('dps_accountant_tokens', await deleteByIds('dps_accountant_tokens', 'profile_id', profileIds));

  // Clear task/license ownership references.
  push('tasks_by_assignee', await deleteTasksBy('assignee_id', profileIds));
  push('tasks_by_creator', await deleteTasksBy('created_by', profileIds));
  push('licenses', await deleteByIds('licenses', 'responsible_id', profileIds));

  // Other direct references.
  push('client_accountants', await deleteByIds('client_accountants', 'accountant_id', profileIds));
  push('tenant_members', await deleteByIds('tenant_members', 'profile_id', profileIds));
  push('conversations_assigned_accountant_null', await updateNullByIds('conversations', 'assigned_accountant_id', profileIds));

  // Remove profiles.
  push('profiles', await deleteByIds('profiles', 'id', profileIds));

  // Remove auth users.
  let deletedAuthUsers = 0;
  if (!dryRun) {
    for (const id of profileIds) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) {
        // Ignore already-deleted users.
        if (!error.message.toLowerCase().includes('user not found')) {
          throw new Error(`auth.users(${id}): ${error.message}`);
        }
      } else {
        deletedAuthUsers += 1;
      }
    }
  }
  summary.push({ table: 'auth.users', count: deletedAuthUsers });

  console.log('\nDone. Deleted rows:');
  for (const item of summary) {
    console.log(`- ${item.table}: ${item.count}`);
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});

