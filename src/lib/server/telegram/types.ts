import type { Json } from '@/lib/database.types';

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  width?: number;
  height?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id?: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id?: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  title?: string;
  performer?: string;
}

export interface TelegramVideoNote {
  file_id: string;
  file_unique_id?: string;
  length: number;
  duration: number;
  file_size?: number;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  emoji?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  video_note?: TelegramVideoNote;
  sticker?: TelegramSticker;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface ParsedTelegramAttachment {
  kind: 'document' | 'photo' | 'voice' | 'audio' | 'video_note' | 'sticker';
  telegramFileId: string;
  telegramFileUniqueId?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parsePhotoList(values: unknown[]): TelegramPhotoSize[] {
  const parsed: TelegramPhotoSize[] = [];

  for (const item of values) {
    const photoRecord = asRecord(item);
    if (!photoRecord) continue;

    const fileId = asString(photoRecord.file_id);
    if (!fileId) continue;

    parsed.push({
      file_id: fileId,
      file_unique_id: asString(photoRecord.file_unique_id) ?? undefined,
      file_size: asNumber(photoRecord.file_size) ?? undefined,
      width: asNumber(photoRecord.width) ?? undefined,
      height: asNumber(photoRecord.height) ?? undefined,
    });
  }

  return parsed;
}

function parseMessage(value: unknown): TelegramMessage | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const messageId = asNumber(record.message_id);
  const date = asNumber(record.date);
  const chatRecord = asRecord(record.chat);
  const chatId = chatRecord ? asNumber(chatRecord.id) : null;

  if (messageId === null || date === null || !chatRecord || chatId === null) {
    return undefined;
  }

  const fromRecord = asRecord(record.from);
  const fromId = fromRecord ? asNumber(fromRecord.id) : null;
  const documentRecord = asRecord(record.document);
  const voiceRecord = asRecord(record.voice);
  const audioRecord = asRecord(record.audio);
  const videoNoteRecord = asRecord(record.video_note);
  const stickerRecord = asRecord(record.sticker);
  const photoList = Array.isArray(record.photo) ? record.photo : [];

  return {
    message_id: messageId,
    date,
    chat: {
      id: chatId,
      type: asString(chatRecord.type) ?? undefined,
      first_name: asString(chatRecord.first_name) ?? undefined,
      last_name: asString(chatRecord.last_name) ?? undefined,
      username: asString(chatRecord.username) ?? undefined,
    },
    from: fromRecord && fromId !== null
      ? {
          id: fromId,
          is_bot: Boolean(fromRecord.is_bot),
          first_name: asString(fromRecord.first_name) ?? undefined,
          last_name: asString(fromRecord.last_name) ?? undefined,
          username: asString(fromRecord.username) ?? undefined,
        }
      : undefined,
    text: asString(record.text) ?? undefined,
    caption: asString(record.caption) ?? undefined,
    document: documentRecord
      ? {
          file_id: asString(documentRecord.file_id) ?? '',
          file_unique_id: asString(documentRecord.file_unique_id) ?? undefined,
          file_name: asString(documentRecord.file_name) ?? undefined,
          mime_type: asString(documentRecord.mime_type) ?? undefined,
          file_size: asNumber(documentRecord.file_size) ?? undefined,
        }
      : undefined,
    photo: parsePhotoList(photoList),
    voice: voiceRecord && asString(voiceRecord.file_id)
      ? {
          file_id: asString(voiceRecord.file_id)!,
          file_unique_id: asString(voiceRecord.file_unique_id) ?? undefined,
          duration: asNumber(voiceRecord.duration) ?? 0,
          mime_type: asString(voiceRecord.mime_type) ?? undefined,
          file_size: asNumber(voiceRecord.file_size) ?? undefined,
        }
      : undefined,
    audio: audioRecord && asString(audioRecord.file_id)
      ? {
          file_id: asString(audioRecord.file_id)!,
          file_unique_id: asString(audioRecord.file_unique_id) ?? undefined,
          duration: asNumber(audioRecord.duration) ?? 0,
          mime_type: asString(audioRecord.mime_type) ?? undefined,
          file_size: asNumber(audioRecord.file_size) ?? undefined,
          file_name: asString(audioRecord.file_name) ?? undefined,
          title: asString(audioRecord.title) ?? undefined,
          performer: asString(audioRecord.performer) ?? undefined,
        }
      : undefined,
    video_note: videoNoteRecord && asString(videoNoteRecord.file_id)
      ? {
          file_id: asString(videoNoteRecord.file_id)!,
          file_unique_id: asString(videoNoteRecord.file_unique_id) ?? undefined,
          length: asNumber(videoNoteRecord.length) ?? 0,
          duration: asNumber(videoNoteRecord.duration) ?? 0,
          file_size: asNumber(videoNoteRecord.file_size) ?? undefined,
        }
      : undefined,
    sticker: stickerRecord && asString(stickerRecord.file_id)
      ? {
          file_id: asString(stickerRecord.file_id)!,
          file_unique_id: asString(stickerRecord.file_unique_id) ?? undefined,
          file_size: asNumber(stickerRecord.file_size) ?? undefined,
          emoji: asString(stickerRecord.emoji) ?? undefined,
        }
      : undefined,
  };
}

export function parseTelegramUpdate(payload: unknown): TelegramUpdate | null {
  const record = asRecord(payload);
  if (!record) return null;

  const updateId = asNumber(record.update_id);
  if (updateId === null) return null;

  return {
    update_id: updateId,
    message: parseMessage(record.message),
    edited_message: parseMessage(record.edited_message),
    channel_post: parseMessage(record.channel_post),
  };
}

export function getPrimaryTelegramMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? update.channel_post ?? null;
}

export function extractTelegramBody(message: TelegramMessage): string | null {
  const body = message.text?.trim() ?? message.caption?.trim() ?? '';
  return body.length > 0 ? body : null;
}

export function extractTelegramAttachments(message: TelegramMessage): ParsedTelegramAttachment[] {
  const attachments: ParsedTelegramAttachment[] = [];

  if (message.document?.file_id) {
    attachments.push({
      kind: 'document',
      telegramFileId: message.document.file_id,
      telegramFileUniqueId: message.document.file_unique_id,
      fileName: message.document.file_name?.trim() || 'document',
      mimeType: message.document.mime_type ?? undefined,
      sizeBytes: message.document.file_size,
    });
  }

  if (message.photo && message.photo.length > 0) {
    const photo = message.photo.reduce((largest, current) => {
      const largestSize = largest.file_size ?? 0;
      const currentSize = current.file_size ?? 0;
      return currentSize >= largestSize ? current : largest;
    }, message.photo[0]);

    attachments.push({
      kind: 'photo',
      telegramFileId: photo.file_id,
      telegramFileUniqueId: photo.file_unique_id,
      fileName: `photo_${message.message_id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: photo.file_size,
    });
  }

  if (message.voice?.file_id) {
    attachments.push({
      kind: 'voice',
      telegramFileId: message.voice.file_id,
      telegramFileUniqueId: message.voice.file_unique_id,
      fileName: `voice_${message.message_id}.ogg`,
      mimeType: message.voice.mime_type ?? 'audio/ogg',
      sizeBytes: message.voice.file_size,
      durationSeconds: message.voice.duration,
    });
  }

  if (message.audio?.file_id) {
    const name = message.audio.file_name?.trim()
      || [message.audio.performer, message.audio.title].filter(Boolean).join(' - ')
      || `audio_${message.message_id}.mp3`;
    attachments.push({
      kind: 'audio',
      telegramFileId: message.audio.file_id,
      telegramFileUniqueId: message.audio.file_unique_id,
      fileName: name,
      mimeType: message.audio.mime_type ?? 'audio/mpeg',
      sizeBytes: message.audio.file_size,
      durationSeconds: message.audio.duration,
    });
  }

  if (message.video_note?.file_id) {
    attachments.push({
      kind: 'video_note',
      telegramFileId: message.video_note.file_id,
      telegramFileUniqueId: message.video_note.file_unique_id,
      fileName: `video_note_${message.message_id}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: message.video_note.file_size,
      durationSeconds: message.video_note.duration,
    });
  }

  if (message.sticker?.file_id) {
    attachments.push({
      kind: 'sticker',
      telegramFileId: message.sticker.file_id,
      telegramFileUniqueId: message.sticker.file_unique_id,
      fileName: `sticker_${message.message_id}${message.sticker.emoji ? `_${message.sticker.emoji}` : ''}.webp`,
      mimeType: 'image/webp',
      sizeBytes: message.sticker.file_size,
    });
  }

  return attachments;
}

export function buildTelegramContactName(message: TelegramMessage): string {
  const from = message.from;
  const parts = [from?.first_name?.trim(), from?.last_name?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (from?.username?.trim()) return `@${from.username.trim()}`;
  return `Telegram ${message.chat.id}`;
}

/**
 * Lightweight check that the value is a JSON-compatible object.
 * Since the caller already parsed via `request.json()`, we only need to
 * verify it's a non-null object (not an array or primitive).
 */
export function isJsonPayload(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
