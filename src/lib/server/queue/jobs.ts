import type { Json } from '@/lib/database.types';

export const QUEUE_NAMES = {
  inboundProcess: 'inbound_process',
  outboundSend: 'outbound_send',
  fileDownloadUpload: 'file_download_upload',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface InboundProcessJob {
  tenantId: string;
  botId: string;
  updateId: number;
  payload: Json;
}

export interface OutboundSendJob {
  tenantId: string;
  conversationId: string;
  messageId: string;
}

export interface FileDownloadUploadJob {
  tenantId: string;
  botId: string;
  clientId: string | null;
  attachmentId: string;
  telegramFileId: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export type QueuePayloadByName = {
  [QUEUE_NAMES.inboundProcess]: InboundProcessJob;
  [QUEUE_NAMES.outboundSend]: OutboundSendJob;
  [QUEUE_NAMES.fileDownloadUpload]: FileDownloadUploadJob;
};

export type QueuePayload = QueuePayloadByName[QueueName];
