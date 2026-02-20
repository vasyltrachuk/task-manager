'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { getClientAvatarUrl } from '@/lib/client-avatar';
import { getClientDisplayName, getClientShortDisplayName } from '@/lib/client-name';
import { cn, formatDate, getInitials } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types';
import { CONVERSATION_STATUS_COLORS } from '@/lib/types';

interface ConversationListItemProps {
  conversation: ConversationListItem;
  isSelected: boolean;
  onClick: () => void;
  showAssignedAccountant?: boolean;
}

function getContactName(conversation: ConversationListItem): string {
  const contact = conversation.telegram_contact;
  if (!contact) return 'Невідомий контакт';

  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (contact.username) return `@${contact.username}`;
  return 'Невідомий контакт';
}

function getConversationDisplayName(
  conversation: ConversationListItem,
  variant: 'short' | 'full' = 'short'
): string {
  if (!conversation.client) return getContactName(conversation);

  return variant === 'full'
    ? getClientDisplayName(conversation.client)
    : getClientShortDisplayName(conversation.client);
}

function getConversationChannelIdentity(conversation: ConversationListItem): string {
  const contact = conversation.telegram_contact;
  if (!contact) return '';

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
  const username = contact.username ? `@${contact.username}` : '';

  if (fullName && username) return `${fullName} (${username})`;
  if (fullName) return fullName;
  if (username) return username;
  return '';
}

function isImageAttachment(fileName: string, mime?: string | null): boolean {
  const normalizedMime = (mime ?? '').toLowerCase();
  if (normalizedMime.startsWith('image/')) return true;
  return /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(fileName);
}

function isVoiceAttachment(fileName: string, mime?: string | null): boolean {
  const normalizedMime = (mime ?? '').toLowerCase();
  if (fileName.toLowerCase().startsWith('voice_')) return true;
  return normalizedMime.startsWith('audio/') && (normalizedMime.includes('ogg') || normalizedMime.includes('opus'));
}

function isAudioAttachment(fileName: string, mime?: string | null): boolean {
  const normalizedMime = (mime ?? '').toLowerCase();
  if (isVoiceAttachment(fileName, mime)) return false;
  if (normalizedMime.startsWith('audio/')) return true;
  return /\.(mp3|m4a|wav|aac|flac)$/i.test(fileName);
}

function isVideoAttachment(fileName: string, mime?: string | null): boolean {
  const normalizedMime = (mime ?? '').toLowerCase();
  if (normalizedMime.startsWith('video/')) return true;
  return /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName);
}

function getAttachmentPreviewLabel(fileName: string, mime?: string | null): string {
  const normalizedFileName = fileName.trim() || 'attachment';

  if (isVoiceAttachment(normalizedFileName, mime)) return 'Голосове повідомлення';
  if (isImageAttachment(normalizedFileName, mime)) return `Фото: ${normalizedFileName}`;
  if (isVideoAttachment(normalizedFileName, mime)) return `Відео: ${normalizedFileName}`;
  if (isAudioAttachment(normalizedFileName, mime)) return `Аудіо: ${normalizedFileName}`;
  return `Файл: ${normalizedFileName}`;
}

function getConversationLastMessagePreview(conversation: ConversationListItem): string {
  const message = conversation.last_message;
  if (!message) return 'Немає повідомлень';

  const prefix = message.direction === 'outbound' ? 'Ви: ' : '';
  const body = message.body?.trim();
  if (body) return `${prefix}${body}`;

  const attachment = message.attachments[0];
  if (!attachment) return `${prefix}Повідомлення`;

  return `${prefix}${getAttachmentPreviewLabel(attachment.file_name, attachment.mime)}`;
}

export default function ConversationListItemComponent({
  conversation,
  isSelected,
  onClick,
  showAssignedAccountant = false,
}: ConversationListItemProps) {
  const displayName = getConversationDisplayName(conversation, 'short');
  const previewLabel = getConversationLastMessagePreview(conversation);
  const assigneeLabel = conversation.assigned_accountant?.full_name
    ?? conversation.client?.accountants?.[0]?.full_name
    ?? 'Не призначено';
  const clientAvatarUrl = getClientAvatarUrl(conversation.client);
  const hasUnread = conversation.unread_count > 0;
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);
  const canShowAvatar = Boolean(clientAvatarUrl) && brokenAvatarUrl !== clientAvatarUrl;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        isSelected
          ? 'border-brand-200 bg-brand-50/50'
          : 'border-surface-200 bg-white hover:bg-surface-50',
        hasUnread && !isSelected && 'border-brand-100'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-9 h-9 flex-shrink-0">
          <div className={cn(
            'w-full h-full rounded-full flex items-center justify-center text-xs font-semibold overflow-hidden',
            hasUnread ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-text-secondary'
          )}>
            {canShowAvatar && clientAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clientAvatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={() => setBrokenAvatarUrl(clientAvatarUrl)}
              />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <span
            className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-brand-600 border border-white flex items-center justify-center text-white"
            aria-label="Telegram"
          >
            <Send size={8} className="translate-x-[0.5px]" aria-hidden="true" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-sm truncate',
                hasUnread ? 'font-bold text-text-primary' : 'font-medium text-text-primary'
              )}>
                {displayName}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: CONVERSATION_STATUS_COLORS[conversation.status] }}
              />
            </div>
            {conversation.last_message_at && (
              <span className="text-[11px] text-text-muted whitespace-nowrap flex-shrink-0">
                {formatDate(conversation.last_message_at, 'relative')}
              </span>
            )}
          </div>

          <p className={cn(
            'text-xs mt-1 truncate',
            hasUnread ? 'text-text-primary font-medium' : 'text-text-secondary'
          )}>
            {previewLabel}
          </p>

          <div className="flex items-center justify-between mt-1">
            {showAssignedAccountant && (
              <span className="text-[11px] text-text-muted truncate pr-2">
                {assigneeLabel}
              </span>
            )}
            {hasUnread && (
              <span className={cn(
                'text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0',
                !showAssignedAccountant && 'ml-auto'
              )}>
                {conversation.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export {
  getContactName,
  getConversationDisplayName,
  getConversationChannelIdentity,
  getConversationLastMessagePreview,
};
