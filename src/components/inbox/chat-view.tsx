'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, User, ExternalLink } from 'lucide-react';
import { cn, formatDate, getInitials } from '@/lib/utils';
import {
  useConversation,
  useConversationMessages,
  useMarkConversationRead,
} from '@/lib/hooks/use-conversations';
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_COLORS } from '@/lib/types';
import type { ClientDocument } from '@/lib/types';
import MessageBubble from './message-bubble';
import MessageComposer from './message-composer';
import DocumentPickerModal from './document-picker-modal';
import { getContactName } from './conversation-list-item';

interface ChatViewProps {
  conversationId: string;
}

export default function ChatView({ conversationId }: ChatViewProps) {
  const { data: conversation } = useConversation(conversationId);
  const { data: messages, isLoading: isMessagesLoading } = useConversationMessages(conversationId);
  const markRead = useMarkConversationRead();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ClientDocument | null>(null);

  // Mark conversation as read on mount / when switching
  useEffect(() => {
    if (conversationId && conversation && conversation.unread_count > 0) {
      markRead.mutate(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages?.length]);

const handlePickDocument = useCallback(() => {
    if (conversation?.client_id) {
      setIsDocPickerOpen(true);
    }
  }, [conversation?.client_id]);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Завантаження бесіди...</p>
        </div>
      </div>
    );
  }

  const contactName = getContactName(conversation);

  // Group messages by date
  const messagesByDate: { date: string; messages: typeof messages }[] = [];
  let currentDate = '';
  for (const msg of messages ?? []) {
    const msgDate = new Date(msg.created_at).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      messagesByDate.push({ date: msgDate, messages: [msg] });
    } else {
      messagesByDate[messagesByDate.length - 1].messages!.push(msg);
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold flex-shrink-0">
            {getInitials(contactName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">{contactName}</p>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {conversation.client && (
                <Link
                  href={`/clients/${conversation.client.id}`}
                  className="hover:text-brand-600 transition-colors flex items-center gap-0.5"
                >
                  {conversation.client.name}
                  <ExternalLink size={10} />
                </Link>
              )}
              <span
                className="badge text-[10px]"
                style={{
                  color: CONVERSATION_STATUS_COLORS[conversation.status],
                  backgroundColor: `${CONVERSATION_STATUS_COLORS[conversation.status]}15`,
                }}
              >
                {CONVERSATION_STATUS_LABELS[conversation.status]}
              </span>
            </div>
          </div>
        </div>

        {conversation.assigned_accountant && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted flex-shrink-0">
            <User size={12} />
            <span>{conversation.assigned_accountant.full_name}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 bg-surface-50">
        {isMessagesLoading && (
          <p className="text-sm text-text-muted text-center py-8">Завантаження повідомлень...</p>
        )}

        {!isMessagesLoading && (!messages || messages.length === 0) && (
          <div className="text-center py-8">
            <MessageSquare size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
            <p className="text-sm text-text-muted">Повідомлень поки немає</p>
          </div>
        )}

        {messagesByDate.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-surface-200" />
              <span className="text-[11px] text-text-muted font-medium">{group.date}</span>
              <div className="flex-1 h-px bg-surface-200" />
            </div>
            {group.messages!.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
              />
            ))}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversationId}
        clientId={conversation.client_id}
        onPickDocument={conversation.client_id ? handlePickDocument : undefined}
        selectedDocument={selectedDoc}
        onClearDocument={() => setSelectedDoc(null)}
      />

      {/* Document picker modal */}
      {conversation.client_id && (
        <DocumentPickerModal
          isOpen={isDocPickerOpen}
          onClose={() => setIsDocPickerOpen(false)}
          clientId={conversation.client_id}
          onSelect={(doc) => setSelectedDoc(doc)}
        />
      )}
    </div>
  );
}
