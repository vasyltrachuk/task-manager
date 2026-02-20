'use client';

import { useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { canAccessInbox } from '@/lib/rbac';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import ConversationListItem from '@/components/inbox/conversation-list-item';
import ChatView from '@/components/inbox/chat-view';
import ConversationClientPanel from '@/components/inbox/conversation-client-panel';
import { useConversations } from '@/lib/hooks/use-conversations';
import type { ConversationStatus } from '@/lib/types';
import {
  getContactName,
  getConversationLastMessagePreview,
} from '@/components/inbox/conversation-list-item';

type StatusFilter = 'all' | ConversationStatus;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Відкриті' },
  { value: 'closed', label: 'Закриті' },
  { value: 'all', label: 'Усі' },
  { value: 'archived', label: 'Архів' },
];

export default function InboxPage() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [selectedConversationIdState, setSelectedConversationId] = useState<string | null>(null);

  const { data: conversations, isLoading, isError, error } = useConversations();

  const scopedConversations = useMemo(() => {
    return (conversations ?? []).filter((conversation) => {
      if (!myOnly || !profile) return true;
      return conversation.assigned_accountant_id === profile.id;
    });
  }, [conversations, myOnly, profile]);

  const statusCounts = useMemo(() => {
    return scopedConversations.reduce(
      (acc, conversation) => {
        acc.all += 1;
        acc[conversation.status] += 1;
        return acc;
      },
      { all: 0, open: 0, closed: 0, archived: 0 }
    );
  }, [scopedConversations]);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return scopedConversations.filter((conversation) => {
      if (statusFilter !== 'all' && conversation.status !== statusFilter) {
        return false;
      }

      if (unreadOnly && conversation.unread_count <= 0) {
        return false;
      }

      if (!query) return true;

      const contactName = getContactName(conversation).toLowerCase();
      const username = conversation.telegram_contact?.username?.toLowerCase() ?? '';
      const clientName = conversation.client?.name?.toLowerCase() ?? '';
      const lastPreview = getConversationLastMessagePreview(conversation).toLowerCase();

      return (
        contactName.includes(query) ||
        username.includes(query) ||
        clientName.includes(query) ||
        lastPreview.includes(query)
      );
    });
  }, [scopedConversations, statusFilter, unreadOnly, searchQuery]);

  const selectedConversationId = useMemo(() => {
    if (filteredConversations.length === 0) return null;
    if (
      selectedConversationIdState &&
      filteredConversations.some((conversation) => conversation.id === selectedConversationIdState)
    ) {
      return selectedConversationIdState;
    }

    return filteredConversations[0].id;
  }, [filteredConversations, selectedConversationIdState]);

  const selectedConversation = useMemo(
    () =>
      selectedConversationId
        ? (conversations ?? []).find((conversation) => conversation.id === selectedConversationId) ?? null
        : null,
    [conversations, selectedConversationId]
  );

  if (!profile) return null;

  if (!canAccessInbox(profile)) {
    return <AccessDeniedCard message="У вас немає доступу до розділу повідомлень." />;
  }

  return (
    <div className="p-4 md:p-6 h-screen min-h-0">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_320px] gap-4 h-full min-h-0">
        <aside className="card overflow-hidden flex flex-col min-h-0 h-full">
          <div className="px-4 py-4 border-b border-surface-200 bg-surface-50">
            <h1 className="text-xl font-bold text-text-primary">Чати</h1>
          </div>

          <div className="p-4 border-b border-surface-200 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Пошук за контактом або клієнтом..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={cn('filter-pill', unreadOnly && 'active')}
              >
                Непрочитані
              </button>
              <button
                onClick={() => setMyOnly((prev) => !prev)}
                className={cn('filter-pill', myOnly && 'active')}
              >
                Мої
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {statusFilters.map((filter) => {
                const count = statusCounts[filter.value];
                const isActive = statusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                      isActive
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-text-secondary border-surface-200 hover:border-brand-300 hover:text-brand-700'
                    )}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        isActive ? 'bg-white/20 text-white' : 'bg-surface-100 text-text-muted'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading && (
              <p className="text-sm text-text-muted text-center py-8">Завантаження бесід...</p>
            )}

            {isError && (
              <p className="text-sm text-red-600 text-center py-8">
                {error instanceof Error ? error.message : 'Помилка завантаження бесід.'}
              </p>
            )}

            {!isLoading && !isError && filteredConversations.length === 0 && (
              <div className="py-10 text-center text-text-muted">
                <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {(conversations ?? []).length === 0
                    ? 'Ще немає жодної бесіди.'
                    : 'Немає бесід за поточними фільтрами.'}
                </p>
              </div>
            )}

            {!isLoading && !isError && filteredConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.id}
                onClick={() => setSelectedConversationId(conversation.id)}
                showAssignedAccountant={profile.role === 'admin'}
              />
            ))}
          </div>
        </aside>

        <div className="card overflow-hidden min-h-0 h-full flex">
          {selectedConversationId ? (
            <ChatView conversationId={selectedConversationId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted bg-surface-50">
              <div className="text-center px-6">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Оберіть бесіду зі списку ліворуч.</p>
              </div>
            </div>
          )}
        </div>

        <ConversationClientPanel conversation={selectedConversation} />
      </div>
    </div>
  );
}
