import 'server-only';

import { importExternalModule } from '@/lib/server/dynamic-import';
import {
  QUEUE_NAMES,
  type FileDownloadUploadJob,
  type InboundProcessJob,
  type OutboundSendJob,
  type QueueName,
  type QueuePayload,
} from './jobs';
import type { BullMqModuleLike, BullMqQueueLike, RedisConstructorLike, RedisLike } from './types';

// ── Lazy singleton for Redis + BullMQ queues ────────────────────────────
let sharedConnection: RedisLike | null = null;
const queueInstances = new Map<string, BullMqQueueLike>();

async function getSharedConnection(): Promise<RedisLike> {
  if (sharedConnection) return sharedConnection;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for BullMQ queue mode.');
  }

  const redisModule = await importExternalModule<{ default: RedisConstructorLike }>('ioredis');
  const Redis = redisModule.default;
  sharedConnection = new Redis(redisUrl);
  return sharedConnection;
}

async function getQueue(queueName: string): Promise<BullMqQueueLike> {
  const existing = queueInstances.get(queueName);
  if (existing) return existing;

  const connection = await getSharedConnection();
  const bullmq = await importExternalModule<BullMqModuleLike>('bullmq');
  const queue = new bullmq.Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      removeOnComplete: 500,
      removeOnFail: 1000,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  queueInstances.set(queueName, queue);
  return queue;
}

// ── Mode detection ──────────────────────────────────────────────────────
function isBullMqEnabled(): boolean {
  const mode = process.env.QUEUE_MODE?.trim().toLowerCase();
  if (mode === 'inline') return false;
  return Boolean(process.env.REDIS_URL?.trim());
}

// ── Enqueue strategies ──────────────────────────────────────────────────
async function enqueueInline(queueName: QueueName, payload: QueuePayload): Promise<void> {
  const workers = await import('./workers');
  await workers.handleQueueJobInline(queueName, payload);
}

async function enqueueWithBullMq(queueName: QueueName, payload: QueuePayload): Promise<void> {
  const queue = await getQueue(queueName);
  await queue.add('process', payload);
}

async function enqueue(queueName: QueueName, payload: QueuePayload): Promise<void> {
  if (!isBullMqEnabled()) {
    await enqueueInline(queueName, payload);
    return;
  }

  try {
    await enqueueWithBullMq(queueName, payload);
  } catch (error) {
    const fallbackToInline = process.env.QUEUE_BULLMQ_FALLBACK_TO_INLINE !== 'false';
    if (!fallbackToInline) {
      throw error;
    }
    await enqueueInline(queueName, payload);
  }
}

// ── Public API ──────────────────────────────────────────────────────────
export async function enqueueInboundProcessJob(payload: InboundProcessJob): Promise<void> {
  await enqueue(QUEUE_NAMES.inboundProcess, payload);
}

export async function enqueueOutboundSendJob(payload: OutboundSendJob): Promise<void> {
  await enqueue(QUEUE_NAMES.outboundSend, payload);
}

export async function enqueueFileDownloadUploadJob(payload: FileDownloadUploadJob): Promise<void> {
  await enqueue(QUEUE_NAMES.fileDownloadUpload, payload);
}

// ── Graceful shutdown (call from process signal handlers) ───────────────
export async function closeQueueConnections(): Promise<void> {
  for (const queue of queueInstances.values()) {
    await queue.close();
  }
  queueInstances.clear();

  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
