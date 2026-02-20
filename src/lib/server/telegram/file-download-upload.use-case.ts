import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { FileDownloadUploadJob } from '@/lib/server/queue/jobs';
import { sanitizeFileName } from './shared';

/**
 * MIME types that are "media" (voice, photo, sticker, video_note, audio clips).
 * These are NOT added to the client's document library — they're part of the
 * conversation flow and accessible via the Telegram proxy on demand.
 *
 * Only actual documents (PDF, DOCX, spreadsheets, etc.) get a documents record.
 */
const MEDIA_MIME_PREFIXES = ['audio/', 'image/', 'video/'];
const MEDIA_FILENAMES = ['voice_', 'audio_', 'video_note_', 'sticker_'];

function isMediaAttachment(mimeType: string | null, fileName: string): boolean {
  if (mimeType) {
    return MEDIA_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
  }
  return MEDIA_FILENAMES.some((p) => fileName.startsWith(p));
}

/**
 * Registers a Telegram inbound attachment in our DB.
 *
 * Strategy:
 * - Never downloads binary to Supabase Storage — wastes money and duplicates Telegram's storage.
 * - Sets storage_path to a logical key (`tenantId/tg/<attachmentId>_filename`) used only
 *   for the access-control prefix check in /api/documents/download.
 * - telegram_file_id is already stored during inbound processing; this job only
 *   updates storage_path (and mime/size if they were missing).
 * - Creates a `documents` record ONLY for real documents (PDF, DOCX, ZIP, etc.)
 *   and only when attachment is linked to an existing client.
 * - Does NOT create a `documents` row for voice messages, photos, stickers,
 *   video notes, or unknown contacts without linked client.
 */
export async function processFileDownloadUpload(payload: FileDownloadUploadJob): Promise<void> {
  const attachmentLookup = await supabaseAdmin
    .from('message_attachments')
    .select('id, message_id')
    .eq('tenant_id', payload.tenantId)
    .eq('id', payload.attachmentId)
    .single();

  if (attachmentLookup.error || !attachmentLookup.data?.id) {
    throw new Error(
      `[telegram_file_attachment_lookup] ${attachmentLookup.error?.message ?? 'Attachment not found'}`
    );
  }

  const safeName = sanitizeFileName(payload.fileName) || 'file';
  // Logical key — no actual upload. tenantId prefix for access-control check.
  const storagePath = `${payload.tenantId}/tg/${payload.attachmentId}_${safeName}`;

  const attachmentUpdate = await supabaseAdmin
    .from('message_attachments')
    .update({
      storage_path: storagePath,
      mime: payload.mimeType ?? 'application/octet-stream',
      size_bytes: payload.sizeBytes ?? null,
    })
    .eq('tenant_id', payload.tenantId)
    .eq('id', payload.attachmentId);

  if (attachmentUpdate.error) {
    throw new Error(`[telegram_file_attachment_update] ${attachmentUpdate.error.message}`);
  }

  // Only create a documents record for actual document files, not media.
  if (isMediaAttachment(payload.mimeType ?? null, safeName)) {
    return; // voice, photo, sticker, video_note — skip documents table
  }

  if (!payload.clientId) {
    return; // Keep attachment in chat history, but skip documents library when contact has no linked client
  }

  const existingDocument = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('tenant_id', payload.tenantId)
    .eq('origin_attachment_id', payload.attachmentId)
    .maybeSingle();

  if (existingDocument.error) {
    throw new Error(`[telegram_file_document_lookup] ${existingDocument.error.message}`);
  }

  if (!existingDocument.data?.id) {
    const documentInsert = await supabaseAdmin
      .from('documents')
      .insert({
        tenant_id: payload.tenantId,
        client_id: payload.clientId,
        origin_attachment_id: payload.attachmentId,
        storage_path: storagePath,
        file_name: safeName,
        mime: payload.mimeType ?? 'application/octet-stream',
        size_bytes: payload.sizeBytes ?? null,
      })
      .select('id')
      .single();

    if (documentInsert.error || !documentInsert.data?.id) {
      throw new Error(`[telegram_file_document_insert] ${documentInsert.error?.message ?? 'No data returned'}`);
    }
  }
}
