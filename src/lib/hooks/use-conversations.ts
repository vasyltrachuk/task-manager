'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbConversationListItem, mapDbConversationMessage } from '../mappers';
import type {
  ConversationListItem,
  ConversationMessageWithAttachments,
  ConversationStatus,
} from '../types';

const CONVERSATION_LIST_SELECT = `
  *,
  client:clients (
    *,
    client_accountants (
      is_primary,
      profile:profiles (*)
    )
  ),
  telegram_contact:telegram_contacts (id, first_name, last_name, username),
  assigned_accountant:profiles!conversations_assigned_accountant_id_fkey (*),
  last_message:messages!messages_conversation_id_fkey (
    id,
    body,
    direction,
    created_at,
    message_attachments (file_name, mime)
  )
`;

export function useConversations(filters?: {
  status?: ConversationStatus;
  unreadOnly?: boolean;
  clientId?: string;
}) {
  const supabase = getSupabaseBrowserClient();

  return useQuery<ConversationListItem[]>({
    queryKey: [...queryKeys.conversations.all, filters],
    queryFn: async (): Promise<ConversationListItem[]> => {
      let query = supabase
        .from('conversations')
        .select(CONVERSATION_LIST_SELECT)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.unreadOnly) {
        query = query.gt('unread_count', 0);
      }
      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbConversationListItem(row));
    },
    refetchInterval: 10_000,
  });
}

export function useConversation(id: string | null) {
  const supabase = getSupabaseBrowserClient();

  return useQuery<ConversationListItem | null>({
    queryKey: queryKeys.conversations.detail(id ?? ''),
    queryFn: async (): Promise<ConversationListItem | null> => {
      if (!id) return null;

      const query = supabase
        .from('conversations')
        .select(CONVERSATION_LIST_SELECT)
        .eq('id', id)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' });

      const { data, error } = await query.single();

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapDbConversationListItem(data as any);
    },
    enabled: !!id,
  });
}

export function useConversationMessages(conversationId: string | null) {
  const supabase = getSupabaseBrowserClient();

  return useQuery<ConversationMessageWithAttachments[]>({
    queryKey: queryKeys.conversations.messages(conversationId ?? ''),
    queryFn: async (): Promise<ConversationMessageWithAttachments[]> => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          message_attachments (*),
          sender:profiles (*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbConversationMessage(row));
    },
    enabled: !!conversationId,
    refetchInterval: 5_000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      body,
      documentId,
    }: {
      conversationId: string;
      body?: string;
      documentId?: string;
    }) => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, documentId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || 'Не вдалося надіслати повідомлення.');
      }
      return payload as { ok: boolean; messageId: string; status: string };
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.messages(variables.conversationId) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  const supabase = getSupabaseBrowserClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal });
    },
  });
}

export function useLinkConversationClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      clientId,
    }: {
      conversationId: string;
      clientId: string;
    }) => {
      const response = await fetch(`/api/conversations/${conversationId}/link-client`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage =
          typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : 'Не вдалося привʼязати клієнта до бесіди.';
        throw new Error(errorMessage);
      }

      return payload as { ok: boolean; alreadyLinked: boolean };
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(variables.conversationId) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal });
    },
  });
}

export function useUnreadTotal(enabled = true) {
  const supabase = getSupabaseBrowserClient();

  return useQuery<number>({
    queryKey: queryKeys.conversations.unreadTotal,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('status', 'open');

      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
    },
    enabled,
    refetchInterval: 15_000,
  });
}
