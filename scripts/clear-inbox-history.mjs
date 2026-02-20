import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DELETE_ORDER = [
  { table: 'message_attachments', column: 'id' },
  { table: 'messages', column: 'id' },
  { table: 'conversation_participants', column: 'conversation_id' },
  { table: 'conversations', column: 'id' },
  { table: 'telegram_updates_raw', column: 'id' },
  { table: 'telegram_contacts', column: 'id' },
];

const AUDIT_ENTITIES = ['conversation', 'messages'];
const CHUNK_SIZE = 500;

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

function toChunks(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
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

async function listTelegramDocumentIds(supabase) {
  const ids = [];
  let from = 0;

  while (true) {
    const to = from + 999;
    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .not('origin_attachment_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw new Error(`documents list: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) break;

    ids.push(...rows.map((row) => row.id));
    if (rows.length < 1000) break;

    from += 1000;
  }

  return ids;
}

async function countTaskDocumentLinks(supabase, documentIds) {
  if (documentIds.length === 0) return 0;

  let total = 0;
  for (const chunk of toChunks(documentIds, CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from('task_documents')
      .select('*', { count: 'exact', head: true })
      .in('document_id', chunk);
    if (error) throw new Error(`task_documents count: ${error.message}`);
    total += count ?? 0;
  }

  return total;
}

async function deleteTaskDocumentLinks(supabase, documentIds) {
  if (documentIds.length === 0) return 0;

  let total = 0;
  for (const chunk of toChunks(documentIds, CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from('task_documents')
      .delete({ count: 'exact' })
      .in('document_id', chunk);
    if (error) throw new Error(`task_documents delete: ${error.message}`);
    total += count ?? 0;
  }

  return total;
}

async function deleteTelegramDocuments(supabase, documentIds) {
  if (documentIds.length === 0) return 0;

  let total = 0;
  for (const chunk of toChunks(documentIds, CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from('documents')
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (error) throw new Error(`documents delete: ${error.message}`);
    total += count ?? 0;
  }

  return total;
}

async function countChatAuditRows(supabase) {
  const { count, error } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .in('entity', AUDIT_ENTITIES);
  if (error) throw new Error(`audit_log count: ${error.message}`);
  return count ?? 0;
}

async function deleteChatAuditRows(supabase) {
  const { count, error } = await supabase
    .from('audit_log')
    .delete({ count: 'exact' })
    .in('entity', AUDIT_ENTITIES);
  if (error) throw new Error(`audit_log delete: ${error.message}`);
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
      ? 'DRY RUN: checking what would be deleted from inbox history tables...'
      : 'Deleting inbox history data...'
  );

  const results = [];
  const telegramDocumentIds = await listTelegramDocumentIds(supabase);

  if (dryRun) {
    const taskDocumentLinks = await countTaskDocumentLinks(supabase, telegramDocumentIds);
    results.push({ table: 'task_documents (telegram docs links)', affected: taskDocumentLinks });
    results.push({ table: 'documents (origin_attachment_id IS NOT NULL)', affected: telegramDocumentIds.length });
  } else {
    const deletedLinks = await deleteTaskDocumentLinks(supabase, telegramDocumentIds);
    const deletedDocs = await deleteTelegramDocuments(supabase, telegramDocumentIds);
    results.push({ table: 'task_documents (telegram docs links)', affected: deletedLinks });
    results.push({ table: 'documents (origin_attachment_id IS NOT NULL)', affected: deletedDocs });
  }

  for (const item of DELETE_ORDER) {
    const affected = dryRun
      ? await countRows(supabase, item.table)
      : await deleteAllRows(supabase, item.table, item.column);
    results.push({ table: item.table, affected });
  }

  const auditAffected = dryRun
    ? await countChatAuditRows(supabase)
    : await deleteChatAuditRows(supabase);
  results.push({ table: "audit_log (entity IN ['conversation','messages'])", affected: auditAffected });

  console.log('\nSummary:');
  for (const row of results) {
    console.log(`- ${row.table}: ${row.affected}`);
  }

  const hasData = results.some((row) => row.affected > 0);
  if (dryRun) {
    console.log(hasData ? '\nSome inbox history rows are not empty.' : '\nInbox history tables are already empty.');
  } else {
    console.log('\nDone.');
  }
}

main().catch((err) => {
  console.error('Inbox cleanup failed:', err.message);
  process.exit(1);
});
