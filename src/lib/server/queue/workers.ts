import 'server-only';

import { importExternalModule } from '@/lib/server/dynamic-import';
import { enqueueFileDownloadUploadJob } from '@/lib/server/queue/client';
import {
  QUEUE_NAMES,
  type FileDownloadUploadJob,
  type InboundProcessJob,
  type OutboundSendJob,
  type QueueName,
  type QueuePayload,
} from '@/lib/server/queue/jobs';
import type { BullMqModuleLike, RedisConstructorLike } from '@/lib/server/queue/types';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { processFileDownloadUpload } from '@/lib/server/telegram/file-download-upload.use-case';
import { processInboundUpdate } from '@/lib/server/telegram/inbound.use-case';
import { processOutboundSend } from '@/lib/server/telegram/outbound.use-case';

// ── Inbound orchestration ───────────────────────────────────────────────

async function markRawInboundResult(input: {
  botId: string;
  updateId: number;
  error?: string;
}): Promise<void> {
  await supabaseAdmin
    .from('telegram_updates_raw')
    .update({
      processed_at: new Date().toISOString(),
      error: input.error ?? null,
    })
    .eq('bot_id', input.botId)
    .eq('update_id', input.updateId);
}

async function handleInboundProcess(payload: InboundProcessJob): Promise<void> {
  try {
    const result = await processInboundUpdate(payload);
    await markRawInboundResult({
      botId: payload.botId,
      updateId: payload.updateId,
    });

    if (result.skipped) {
      return;
    }

    for (const fileJob of result.fileJobs) {
      await enqueueFileDownloadUploadJob(fileJob);
    }
  } catch (error) {
    try {
      await markRawInboundResult({
        botId: payload.botId,
        updateId: payload.updateId,
        error: error instanceof Error ? error.message : 'Unknown inbound processing error',
      });
    } catch {
      // Don't mask the original error if DB write also fails
    }
    throw error;
  }
}

// ── Outbound orchestration ──────────────────────────────────────────────

async function markOutboundFailed(job: OutboundSendJob, reason: string): Promise<void> {
  await supabaseAdmin
    .from('messages')
    .update({ status: 'failed' })
    .eq('tenant_id', job.tenantId)
    .eq('id', job.messageId);

  await supabaseAdmin.from('audit_log').insert({
    tenant_id: job.tenantId,
    actor_id: null,
    entity: 'messages',
    entity_id: job.messageId,
    action: 'telegram_outbound_failed',
    meta: { reason },
  });
}

async function handleOutboundSend(payload: OutboundSendJob): Promise<void> {
  try {
    await processOutboundSend(payload);
  } catch (error) {
    await markOutboundFailed(
      payload,
      error instanceof Error ? error.message : 'Unknown outbound processing error'
    );
    throw error;
  }
}

// ── File download/upload orchestration ──────────────────────────────────

async function handleFileDownloadUpload(payload: FileDownloadUploadJob): Promise<void> {
  await processFileDownloadUpload(payload);
}

// ── Inline dispatcher (used when BullMQ is not available) ───────────────

export async function handleQueueJobInline(queueName: QueueName, payload: QueuePayload): Promise<void> {
  switch (queueName) {
    case QUEUE_NAMES.inboundProcess:
      await handleInboundProcess(payload as InboundProcessJob);
      return;
    case QUEUE_NAMES.outboundSend:
      await handleOutboundSend(payload as OutboundSendJob);
      return;
    case QUEUE_NAMES.fileDownloadUpload:
      await handleFileDownloadUpload(payload as FileDownloadUploadJob);
      return;
    default:
      throw new Error(`Unsupported queue "${queueName}"`);
  }
}

// ── BullMQ worker bootstrap ─────────────────────────────────────────────

interface QueueWorkerHandle {
  close: () => Promise<void>;
}

export async function startQueueWorkers(): Promise<QueueWorkerHandle> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to run BullMQ workers.');
  }

  const bullmq = await importExternalModule<BullMqModuleLike>('bullmq');
  const redisModule = await importExternalModule<{ default: RedisConstructorLike }>('ioredis');
  const Redis = redisModule.default;
  const connection = new Redis(redisUrl);

  const workerInbound = new bullmq.Worker(
    QUEUE_NAMES.inboundProcess,
    async (job) => handleInboundProcess(job.data as InboundProcessJob),
    { connection }
  );

  const workerOutbound = new bullmq.Worker(
    QUEUE_NAMES.outboundSend,
    async (job) => handleOutboundSend(job.data as OutboundSendJob),
    { connection }
  );

  const workerFiles = new bullmq.Worker(
    QUEUE_NAMES.fileDownloadUpload,
    async (job) => handleFileDownloadUpload(job.data as FileDownloadUploadJob),
    { connection }
  );

  return {
    async close() {
      await workerInbound.close();
      await workerOutbound.close();
      await workerFiles.close();
      await connection.quit();
    },
  };
}
