'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, User, ExternalLink, Send } from 'lucide-react';
import { getClientAvatarUrl } from '@/lib/client-avatar';
import { getInitials } from '@/lib/utils';
import { useClients } from '@/lib/hooks/use-clients';
import {
  useConversation,
  useConversationMessages,
  useLinkConversationClient,
  useMarkConversationRead,
} from '@/lib/hooks/use-conversations';
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_COLORS } from '@/lib/types';
import type { ClientDocument } from '@/lib/types';
import MessageBubble from './message-bubble';
import MessageComposer from './message-composer';
import DocumentPickerModal from './document-picker-modal';
import {
  getConversationChannelIdentity,
  getConversationDisplayName,
} from './conversation-list-item';

interface ChatViewProps {
  conversationId: string;
}

export default function ChatView({ conversationId }: ChatViewProps) {
  const { data: conversation } = useConversation(conversationId);
  const { data: messages, isLoading: isMessagesLoading } = useConversationMessages(conversationId);
  const { data: clients } = useClients();
  const markRead = useMarkConversationRead();
  const linkClient = useLinkConversationClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ClientDocument | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [brokenHeaderAvatarUrl, setBrokenHeaderAvatarUrl] = useState<string | null>(null);

  const availableClients = useMemo(
    () =>
      [...(clients ?? [])]
        .filter((client) => client.status !== 'archived')
        .sort((left, right) => left.name.localeCompare(right.name, 'uk-UA')),
    [clients]
  );
  const headerAvatarUrl = useMemo(() => getClientAvatarUrl(conversation?.client), [conversation?.client]);
  const canShowHeaderAvatar = Boolean(headerAvatarUrl) && brokenHeaderAvatarUrl !== headerAvatarUrl;

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

  useEffect(() => {
    if (conversation?.client_id || availableClients.length === 0) {
      setSelectedClientId('');
      return;
    }

    setSelectedClientId((current) => {
      if (current && availableClients.some((client) => client.id === current)) {
        return current;
      }
      return availableClients[0].id;
    });
  }, [conversation?.client_id, availableClients]);

  const handlePickDocument = useCallback(() => {
    if (conversation?.client_id) {
      setIsDocPickerOpen(true);
    }
  }, [conversation?.client_id]);

  const handleLinkClient = useCallback(() => {
    if (!conversation || !selectedClientId) return;
    linkClient.mutate({
      conversationId: conversation.id,
      clientId: selectedClientId,
    });
  }, [conversation, linkClient, selectedClientId]);

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

  const headerTitle = getConversationDisplayName(conversation, 'full');
  const channelIdentity = getConversationChannelIdentity(conversation);
  const responsibleName = conversation.assigned_accountant?.full_name
    ?? conversation.client?.accountants?.[0]?.full_name;

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
          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold flex-shrink-0 overflow-hidden">
            {canShowHeaderAvatar && headerAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerAvatarUrl}
                alt={headerTitle}
                className="w-full h-full object-cover"
                onError={() => setBrokenHeaderAvatarUrl(headerAvatarUrl)}
              />
            ) : (
              getInitials(headerTitle)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{headerTitle}</p>
              {conversation.client && (
                <Link
                  href={`/clients/${conversation.client.id}`}
                  aria-label="Відкрити картку клієнта"
                  className="hover:text-brand-600 transition-colors flex-shrink-0 text-text-muted"
                >
                  <ExternalLink size={10} />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {conversation.client && (
                <div className="flex items-center gap-1 min-w-0">
                  <Send size={11} className="text-text-muted flex-shrink-0" aria-hidden="true" />
                  {channelIdentity && <span className="truncate">{channelIdentity}</span>}
                </div>
              )}
              {!conversation.client && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    className="h-7 rounded-md border border-surface-200 bg-white px-2 text-[11px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                    disabled={linkClient.isPending || availableClients.length === 0}
                  >
                    <option value="" disabled>
                      {availableClients.length === 0 ? 'Немає доступних клієнтів' : 'Оберіть клієнта'}
                    </option>
                    {availableClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLinkClient}
                    className="h-7 rounded-md border border-brand-200 bg-brand-50 px-2 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !selectedClientId ||
                      linkClient.isPending ||
                      availableClients.length === 0
                    }
                  >
                    {linkClient.isPending ? 'Привʼязуємо...' : 'Привʼязати'}
                  </button>
                </div>
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
            {!conversation.client && linkClient.isError && (
              <p className="mt-1 text-[11px] text-red-600">
                {linkClient.error instanceof Error
                  ? linkClient.error.message
                  : 'Не вдалося привʼязати клієнта.'}
              </p>
            )}
          </div>
        </div>

        {responsibleName && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted flex-shrink-0">
            <User size={12} />
            <span>{responsibleName}</span>
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
