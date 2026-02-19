import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function ensureValue(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function isoFromNow(offsetMinutes) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

async function ensureDemoBot(supabase, tenantId) {
  const existing = await supabase
    .from('tenant_bots')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Failed to load tenant bot: ${existing.error.message}`);
  }

  if (existing.data?.id) return existing.data.id;

  const insert = await supabase
    .from('tenant_bots')
    .insert({
      tenant_id: tenantId,
      bot_username: 'taskcontrol_demo_bot',
      display_name: 'Task Control Demo Bot',
      token_encrypted: '\\x7461736b636f6e74726f6c5f64656d6f5f746f6b656e',
      webhook_secret: 'seed-demo-webhook-secret',
      is_active: true,
    })
    .select('id')
    .single();

  if (insert.error) {
    throw new Error(`Failed to create demo bot: ${insert.error.message}`);
  }

  return insert.data.id;
}

async function upsertTelegramContact(supabase, payload) {
  const result = await supabase
    .from('telegram_contacts')
    .upsert(payload, { onConflict: 'bot_id,telegram_user_id' })
    .select('id,client_id')
    .single();

  if (result.error) {
    throw new Error(`Failed to upsert telegram contact ${payload.telegram_user_id}: ${result.error.message}`);
  }

  return result.data;
}

async function upsertConversation(supabase, payload) {
  const result = await supabase
    .from('conversations')
    .upsert(payload, { onConflict: 'bot_id,telegram_contact_id' })
    .select('id')
    .single();

  if (result.error) {
    throw new Error(`Failed to upsert conversation: ${result.error.message}`);
  }

  return result.data.id;
}

async function insertMessage(supabase, payload) {
  const result = await supabase
    .from('messages')
    .insert(payload)
    .select('id,created_at')
    .single();

  if (result.error) {
    throw new Error(`Failed to insert message: ${result.error.message}`);
  }

  return result.data;
}

async function uploadDemoFile(supabase, bucket, storagePath, body) {
  const upload = await supabase.storage
    .from(bucket)
    .upload(storagePath, body, {
      upsert: true,
      contentType: 'text/plain; charset=utf-8',
    });

  if (upload.error) {
    console.warn(`  [warn] Storage upload failed for ${storagePath}: ${upload.error.message}`);
  }
}

async function ensureStorageBucket(supabase, bucket) {
  const bucketLookup = await supabase.storage.getBucket(bucket);

  if (!bucketLookup.error && bucketLookup.data) return;

  const createBucket = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: '50MB',
  });

  if (
    createBucket.error &&
    !/already exists/i.test(createBucket.error.message)
  ) {
    throw new Error(`Failed to create storage bucket "${bucket}": ${createBucket.error.message}`);
  }
}

async function cleanupSeedDocuments(supabase, tenantId) {
  const docsResult = await supabase
    .from('documents')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('storage_path', `${tenantId}/seed-demo/%`);

  if (docsResult.error) {
    throw new Error(`Failed to query seeded documents: ${docsResult.error.message}`);
  }

  const docIds = (docsResult.data ?? []).map((row) => row.id);
  if (docIds.length === 0) return;

  const unlink = await supabase.from('task_documents').delete().in('document_id', docIds);
  if (unlink.error) {
    throw new Error(`Failed to delete task_documents for seeded docs: ${unlink.error.message}`);
  }

  const delDocs = await supabase.from('documents').delete().in('id', docIds);
  if (delDocs.error) {
    throw new Error(`Failed to delete seeded documents: ${delDocs.error.message}`);
  }
}

async function main() {
  const env = loadEnvFromDotLocal();
  const supabaseUrl = ensureValue(env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = ensureValue(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const bucket = env.TELEGRAM_STORAGE_BUCKET || 'documents';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureStorageBucket(supabase, bucket);

  const tenantQuery = await supabase
    .from('tenants')
    .select('id,name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (tenantQuery.error) throw new Error(`Failed to load tenant: ${tenantQuery.error.message}`);
  if (!tenantQuery.data) throw new Error('No tenant found. Run bootstrap/seed first.');

  const tenantId = tenantQuery.data.id;
  console.log(`Seeding inbox demo for tenant: ${tenantQuery.data.name} (${tenantId})`);

  const profileQuery = await supabase
    .from('profiles')
    .select('id,role,full_name,is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (profileQuery.error) throw new Error(`Failed to load profiles: ${profileQuery.error.message}`);
  const profiles = profileQuery.data ?? [];
  if (profiles.length === 0) throw new Error('No active profiles found for tenant.');

  const accountant = profiles.find((p) => p.role === 'accountant') || profiles.find((p) => p.role === 'admin') || profiles[0];
  const admin = profiles.find((p) => p.role === 'admin') || accountant;

  const clientsQuery = await supabase
    .from('clients')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (clientsQuery.error) throw new Error(`Failed to load clients: ${clientsQuery.error.message}`);
  const clients = clientsQuery.data ?? [];
  if (clients.length === 0) throw new Error('No clients found. Create at least one client first.');

  const botId = await ensureDemoBot(supabase, tenantId);

  await cleanupSeedDocuments(supabase, tenantId);

  const contactSeeds = [
    {
      key: 'client-1',
      client_id: clients[0].id,
      telegram_user_id: 900000001,
      chat_id: 900000001,
      username: 'inbox_demo_one',
      first_name: 'Олег',
      last_name: 'Клієнт',
    },
    {
      key: 'client-2',
      client_id: (clients[1] ?? clients[0]).id,
      telegram_user_id: 900000002,
      chat_id: 900000002,
      username: 'inbox_demo_two',
      first_name: 'Ірина',
      last_name: 'Підприємець',
    },
  ];

  let seededConversations = 0;

  for (const seed of contactSeeds) {
    const contact = await upsertTelegramContact(supabase, {
      tenant_id: tenantId,
      bot_id: botId,
      client_id: seed.client_id,
      telegram_user_id: seed.telegram_user_id,
      chat_id: seed.chat_id,
      username: seed.username,
      first_name: seed.first_name,
      last_name: seed.last_name,
      is_blocked: false,
    });

    const conversationId = await upsertConversation(supabase, {
      tenant_id: tenantId,
      bot_id: botId,
      client_id: seed.client_id,
      telegram_contact_id: contact.id,
      status: 'open',
      assigned_accountant_id: accountant.id,
      unread_count: 0,
      last_message_at: null,
    });

    const removeOldMessages = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId);
    if (removeOldMessages.error) {
      throw new Error(`Failed to cleanup old messages: ${removeOldMessages.error.message}`);
    }

    const participants = [accountant.id, admin.id].filter((id, idx, arr) => arr.indexOf(id) === idx);
    for (const profileId of participants) {
      const participantInsert = await supabase
        .from('conversation_participants')
        .upsert(
          {
            conversation_id: conversationId,
            profile_id: profileId,
            role: profileId === accountant.id ? 'owner' : 'member',
          },
          { onConflict: 'conversation_id,profile_id' }
        );
      if (participantInsert.error) {
        throw new Error(`Failed to upsert participant: ${participantInsert.error.message}`);
      }
    }

    const inbound1 = await insertMessage(supabase, {
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      source: 'telegram',
      body: `[SEED DEMO] Доброго дня, надіслав документи по ${seed.key}.`,
      status: 'received',
      created_at: isoFromNow(-45),
    });

    await insertMessage(supabase, {
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      source: 'dashboard',
      sender_profile_id: accountant.id,
      body: '[SEED DEMO] Дякую, перевіряю.',
      status: 'sent',
      created_at: isoFromNow(-40),
    });

    const inboundWithAttachment = await insertMessage(supabase, {
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      source: 'telegram',
      body: '[SEED DEMO] Підвантажую договір та рахунок.',
      status: 'received',
      created_at: isoFromNow(-35),
    });

    const inboundStoragePath = `${tenantId}/seed-demo/${seed.key}/contract.txt`;
    await uploadDemoFile(
      supabase,
      bucket,
      inboundStoragePath,
      `Seed demo file for ${seed.key}\nGenerated at ${new Date().toISOString()}\n`
    );

    const attachmentInsert = await supabase
      .from('message_attachments')
      .insert({
        tenant_id: tenantId,
        message_id: inboundWithAttachment.id,
        telegram_file_id: `seed-file-${seed.telegram_user_id}`,
        telegram_file_unique_id: `seed-unique-${seed.telegram_user_id}`,
        storage_path: inboundStoragePath,
        file_name: `dogovir-${seed.key}.txt`,
        mime: 'text/plain',
        size_bytes: 1200,
      })
      .select('id')
      .single();

    if (attachmentInsert.error) {
      throw new Error(`Failed to insert message attachment: ${attachmentInsert.error.message}`);
    }

    const docInsert = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId,
        client_id: seed.client_id,
        origin_attachment_id: attachmentInsert.data.id,
        storage_path: inboundStoragePath,
        file_name: `dogovir-${seed.key}.txt`,
        mime: 'text/plain',
        size_bytes: 1200,
        doc_type: 'contract',
        tags: ['telegram', 'seed-demo'],
        created_by: accountant.id,
      })
      .select('id')
      .single();

    if (docInsert.error) {
      throw new Error(`Failed to insert document: ${docInsert.error.message}`);
    }

    const taskQuery = await supabase
      .from('tasks')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('client_id', seed.client_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taskQuery.error) {
      throw new Error(`Failed to load task for document link: ${taskQuery.error.message}`);
    }

    if (taskQuery.data?.id) {
      const taskDocUpsert = await supabase
        .from('task_documents')
        .upsert(
          {
            task_id: taskQuery.data.id,
            document_id: docInsert.data.id,
            tenant_id: tenantId,
            linked_by: accountant.id,
          },
          { onConflict: 'task_id,document_id' }
        );

      if (taskDocUpsert.error) {
        throw new Error(`Failed to link document to task: ${taskDocUpsert.error.message}`);
      }
    }

    const outboundStoragePath = `${tenantId}/seed-demo/${seed.key}/checklist.txt`;
    await uploadDemoFile(
      supabase,
      bucket,
      outboundStoragePath,
      `Checklist from accountant for ${seed.key}\n`
    );

    const outboundWithAttachment = await insertMessage(supabase, {
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      source: 'dashboard',
      sender_profile_id: accountant.id,
      body: '[SEED DEMO] Надсилаю чеклист, подивіться, будь ласка.',
      status: 'queued',
      created_at: isoFromNow(-30),
    });

    const outboundAttachmentInsert = await supabase.from('message_attachments').insert({
      tenant_id: tenantId,
      message_id: outboundWithAttachment.id,
      storage_path: outboundStoragePath,
      file_name: `checklist-${seed.key}.txt`,
      mime: 'text/plain',
      size_bytes: 600,
    });

    if (outboundAttachmentInsert.error) {
      throw new Error(`Failed to insert outbound attachment: ${outboundAttachmentInsert.error.message}`);
    }

    const conversationUpdate = await supabase
      .from('conversations')
      .update({
        last_message_at: outboundWithAttachment.created_at,
        unread_count: 2,
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    if (conversationUpdate.error) {
      throw new Error(`Failed to update conversation counters: ${conversationUpdate.error.message}`);
    }

    const inboxAudit = await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: accountant.id,
      entity: 'conversation',
      entity_id: conversationId,
      action: 'seeded_demo_chat',
      meta: {
        seeded_by_script: 'seed-inbox-demo',
        seed_key: seed.key,
        first_message_id: inbound1.id,
      },
    });

    if (inboxAudit.error) {
      throw new Error(`Failed to insert audit entry: ${inboxAudit.error.message}`);
    }

    seededConversations += 1;
  }

  console.log(`Done. Seeded ${seededConversations} demo conversations.`);
  console.log('Open /inbox and /clients/[id] tabs "Чат" + "Документи" to verify UI.');
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
});
