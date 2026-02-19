'use client';

import { cn, formatDate, getInitials } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types';
import { CONVERSATION_STATUS_COLORS } from '@/lib/types';

interface ConversationListItemProps {
  conversation: ConversationListItem;
  isSelected: boolean;
  onClick: () => void;
}

function getContactName(conversation: ConversationListItem): string {
  const contact = conversation.telegram_contact;
  if (!contact) return 'Невідомий контакт';

  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (contact.username) return `@${contact.username}`;
  return 'Невідомий контакт';
}

export default function ConversationListItemComponent({
  conversation,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  const contactName = getContactName(conversation);
  const hasUnread = conversation.unread_count > 0;

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
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
          hasUnread ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-text-secondary'
        )}>
          {getInitials(contactName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-sm truncate',
              hasUnread ? 'font-bold text-text-primary' : 'font-medium text-text-primary'
            )}>
              {contactName}
            </span>
            {conversation.last_message_at && (
              <span className="text-[11px] text-text-muted whitespace-nowrap flex-shrink-0">
                {formatDate(conversation.last_message_at, 'relative')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            {conversation.client && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-100 text-text-muted truncate max-w-[120px]">
                {conversation.client.name}
              </span>
            )}
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: CONVERSATION_STATUS_COLORS[conversation.status] }}
            />
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-text-muted truncate">
              {conversation.assigned_accountant?.full_name ?? 'Не призначено'}
            </span>
            {hasUnread && (
              <span className="text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
                {conversation.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export { getContactName };
