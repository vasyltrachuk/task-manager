'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { canAccessInbox } from '@/lib/rbac';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import ConversationListItem from '@/components/inbox/conversation-list-item';
import ChatView from '@/components/inbox/chat-view';
import { useConversations } from '@/lib/hooks/use-conversations';
import { CONVERSATION_STATUS_LABELS } from '@/lib/types';
import type { ConversationStatus } from '@/lib/types';
import { getContactName } from '@/components/inbox/conversation-list-item';

type StatusFilter = 'all' | ConversationStatus;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Усі' },
  { value: 'open', label: CONVERSATION_STATUS_LABELS.open },
  { value: 'closed', label: CONVERSATION_STATUS_LABELS.closed },
  { value: 'archived', label: CONVERSATION_STATUS_LABELS.archived },
];

export default function InboxPage() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const queryFilters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      unreadOnly,
    }),
    [statusFilter, unreadOnly]
  );

  const { data: conversations, isLoading, isError, error } = useConversations(queryFilters);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (conversations ?? []).filter((conversation) => {
      if (myOnly && profile && conversation.assigned_accountant_id !== profile.id) {
        return false;
      }

      if (!query) return true;

      const contactName = getContactName(conversation).toLowerCase();
      const username = conversation.telegram_contact?.username?.toLowerCase() ?? '';
      const clientName = conversation.client?.name?.toLowerCase() ?? '';

      return contactName.includes(query) || username.includes(query) || clientName.includes(query);
    });
  }, [conversations, myOnly, profile, searchQuery]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }

    if (
      !selectedConversationId ||
      !filteredConversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConversationId]);

  if (!profile) return null;

  if (!canAccessInbox(profile)) {
    return <AccessDeniedCard message="У вас немає доступу до розділу повідомлень." />;
  }

  const unreadTotal = (conversations ?? []).reduce(
    (sum, conversation) => sum + (conversation.unread_count ?? 0),
    0
  );

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text-primary">Повідомлення</h1>
        <p className="text-sm text-text-muted mt-1">
          Діалоги з клієнтами в Telegram. Непрочитаних: {unreadTotal}
        </p>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Пошук за контактом або клієнтом..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={cn('filter-pill', statusFilter === filter.value && 'active')}
          >
            {filter.label}
          </button>
        ))}
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

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        <div className="card overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-surface-200 bg-surface-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Бесіди</h2>
            <span className="text-xs text-text-muted">{filteredConversations.length}</span>
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
              />
            ))}
          </div>
        </div>

        <div className="card overflow-hidden min-h-0 flex">
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
      </div>
    </div>
  );
}
