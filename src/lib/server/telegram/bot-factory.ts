import 'server-only';

import { importExternalModule } from '@/lib/server/dynamic-import';

interface TelegramApiSuccess<T> {
  ok: true;
  result: T;
}

interface TelegramApiFailure {
  ok: false;
  description?: string;
}

type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiFailure;

interface TelegramFileResult {
  file_id: string;
  file_path?: string;
}

interface TelegramMessageResult {
  message_id: number;
}

// Sent voice/audio objects embedded in Message response
interface TelegramVoiceResult {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

interface TelegramSendVoiceResult {
  message_id: number;
  voice?: TelegramVoiceResult;
}

export interface TelegramBotClient {
  sendMessage(input: { chatId: number; text: string }): Promise<{ messageId: number }>;
  sendDocument(input: { chatId: number; document: string; caption?: string }): Promise<{ messageId: number }>;
  /** Returns messageId + the voice file_id/file_unique_id from the sent message — use these instead of re-uploading to Storage */
  sendVoice(input: { chatId: number; voice: Blob | Buffer; mimeType?: string; duration?: number; caption?: string }): Promise<{
    messageId: number;
    fileId?: string;
    fileUniqueId?: string;
  }>;
  copyMessage(input: { fromChatId: number; toChatId: number; messageId: number }): Promise<{ messageId: number }>;
  getFile(input: { fileId: string }): Promise<{ filePath: string }>;
  downloadFile(input: { filePath: string }): Promise<ArrayBuffer>;
}

interface GrammyBotApiLike {
  sendMessage(chatId: number, text: string): Promise<unknown>;
  sendDocument(chatId: number, document: string, extra?: { caption?: string }): Promise<unknown>;
  getFile(fileId: string): Promise<unknown>;
}

interface GrammyBotLike {
  api: GrammyBotApiLike;
}

interface GrammyModuleLike {
  Bot: new (token: string) => GrammyBotLike;
}

// TTL cache: evict entries after 10 minutes to bound memory in multi-tenant environments.
const BOT_CLIENT_TTL_MS = 10 * 60 * 1000;
const BOT_CLIENT_MAX_SIZE = 100;
// Process start time ensures cache is invalidated on server restart (hot-reload safe).
const PROCESS_START = Date.now();

interface CacheEntry {
  promise: Promise<TelegramBotClient>;
  expiresAt: number;
}

const botClientCache = new Map<string, CacheEntry>();

function evictExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of botClientCache) {
    if (entry.expiresAt <= now) {
      botClientCache.delete(key);
    }
  }
}

function apiBaseUrl(): string {
  return process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org';
}

function buildBotMethodUrl(token: string, method: string): string {
  return `${apiBaseUrl()}/bot${token}/${method}`;
}

function buildFileDownloadUrl(token: string, filePath: string): string {
  return `${apiBaseUrl()}/file/bot${token}/${filePath}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractMessageId(result: unknown): number {
  if (!isObjectRecord(result)) {
    throw new Error('Telegram API returned malformed message response.');
  }
  const messageId = result.message_id;
  if (typeof messageId !== 'number') {
    throw new Error('Telegram API response does not contain message_id.');
  }
  return messageId;
}

function extractFilePath(result: unknown): string {
  if (!isObjectRecord(result)) {
    throw new Error('Telegram API returned malformed getFile response.');
  }
  const filePath = result.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Telegram API response does not contain file_path.');
  }
  return filePath;
}

async function callTelegramApiJson<T>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(buildBotMethodUrl(token, method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${response.status}: ${body || 'Unknown error'}`);
  }

  const parsed = (await response.json()) as TelegramApiResponse<T>;
  if (!parsed.ok) {
    throw new Error(parsed.description || `Telegram API ${method} failed`);
  }
  return parsed.result;
}

async function callTelegramApiFormData<T>(token: string, method: string, formData: FormData): Promise<T> {
  const response = await fetch(buildBotMethodUrl(token, method), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${response.status}: ${body || 'Unknown error'}`);
  }

  const parsed = (await response.json()) as TelegramApiResponse<T>;
  if (!parsed.ok) {
    throw new Error(parsed.description || `Telegram API ${method} failed`);
  }
  return parsed.result;
}

function createHttpBotClient(token: string): TelegramBotClient {
  return {
    async sendMessage(input) {
      const result = await callTelegramApiJson<TelegramMessageResult>(token, 'sendMessage', {
        chat_id: input.chatId,
        text: input.text,
      });
      return { messageId: result.message_id };
    },
    async sendDocument(input) {
      const form = new FormData();
      form.set('chat_id', String(input.chatId));
      form.set('document', input.document);
      if (input.caption) {
        form.set('caption', input.caption);
      }

      const result = await callTelegramApiFormData<TelegramMessageResult>(token, 'sendDocument', form);
      return { messageId: result.message_id };
    },
    async sendVoice(input) {
      const form = new FormData();
      form.set('chat_id', String(input.chatId));
      const blob = input.voice instanceof Blob
        ? input.voice
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : new Blob([input.voice as any], { type: input.mimeType ?? 'audio/ogg' });
      form.set('voice', blob, 'voice.ogg');
      if (input.duration !== undefined) {
        form.set('duration', String(Math.round(input.duration)));
      }
      if (input.caption) {
        form.set('caption', input.caption);
      }
      // Telegram returns the full Message object — extract voice.file_id so
      // callers can store it instead of uploading the binary to Supabase Storage.
      const result = await callTelegramApiFormData<TelegramSendVoiceResult>(token, 'sendVoice', form);
      return {
        messageId: result.message_id,
        fileId: result.voice?.file_id,
        fileUniqueId: result.voice?.file_unique_id,
      };
    },
    async copyMessage(input) {
      const result = await callTelegramApiJson<TelegramMessageResult>(token, 'copyMessage', {
        from_chat_id: input.fromChatId,
        chat_id: input.toChatId,
        message_id: input.messageId,
      });
      return { messageId: result.message_id };
    },
    async getFile(input) {
      const result = await callTelegramApiJson<TelegramFileResult>(token, 'getFile', {
        file_id: input.fileId,
      });
      return { filePath: extractFilePath(result) };
    },
    async downloadFile(input) {
      const response = await fetch(buildFileDownloadUrl(token, input.filePath), {
        method: 'GET',
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Telegram file download HTTP ${response.status}: ${body || 'Unknown error'}`);
      }

      return response.arrayBuffer();
    },
  };
}

async function tryCreateGrammyBotClient(token: string): Promise<TelegramBotClient | null> {
  if (process.env.TELEGRAM_TRANSPORT?.trim() === 'http') {
    return null;
  }

  try {
    const moduleName = 'grammy';
    const grammy = await importExternalModule<GrammyModuleLike>(moduleName);
    const bot = new grammy.Bot(token);

    return {
      async sendMessage(input) {
        const result = await bot.api.sendMessage(input.chatId, input.text);
        return { messageId: extractMessageId(result) };
      },
      async sendDocument(input) {
        const result = await bot.api.sendDocument(input.chatId, input.document, {
          caption: input.caption,
        });
        return { messageId: extractMessageId(result) };
      },
      async sendVoice(input) {
        // Grammy doesn't expose voice.file_id easily — delegate to HTTP client
        // which parses the full Message response and extracts the file_id.
        return createHttpBotClient(token).sendVoice(input);
      },
      async copyMessage(input) {
        return createHttpBotClient(token).copyMessage(input);
      },
      async getFile(input) {
        const result = await bot.api.getFile(input.fileId);
        return { filePath: extractFilePath(result) };
      },
      async downloadFile(input) {
        const response = await fetch(buildFileDownloadUrl(token, input.filePath), {
          method: 'GET',
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Telegram file download HTTP ${response.status}: ${body || 'Unknown error'}`);
        }
        return response.arrayBuffer();
      },
    };
  } catch {
    return null;
  }
}

async function createBotClient(token: string): Promise<TelegramBotClient> {
  const grammyClient = await tryCreateGrammyBotClient(token);
  if (grammyClient) return grammyClient;
  return createHttpBotClient(token);
}

export async function createTelegramBotClient(token: string): Promise<TelegramBotClient> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error('Telegram bot token is empty.');
  }

  const now = Date.now();
  const cacheKey = `${PROCESS_START}:${process.env.TELEGRAM_TRANSPORT ?? 'auto'}:${trimmedToken}`;

  const cached = botClientCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  // Periodic eviction to prevent unbounded growth
  if (botClientCache.size >= BOT_CLIENT_MAX_SIZE) {
    evictExpiredEntries();
  }

  const promise = createBotClient(trimmedToken);
  botClientCache.set(cacheKey, { promise, expiresAt: now + BOT_CLIENT_TTL_MS });
  return promise;
}
