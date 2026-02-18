'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbClient } from '../mappers';
import { createClient, updateClient, archiveClient } from '../actions/clients';
import type { Client } from '../types';
import type { DpsClientPrefillInput, DpsClientPrefillResult } from '../dps-prefill';

export type {
  DpsClientPrefillInput,
  DpsClientPrefillResult,
  DpsClientPrefillSuggestion,
  DpsClientPrefillSource,
} from '../dps-prefill';

export function useClients() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Client[]>({
    queryKey: queryKeys.clients.all,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_accountants (
            accountant_id,
            is_primary,
            profile:profiles (*)
          )
        `)
        .order('created_at');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbClient(row, row.client_accountants));
    },
  });
}

export function useClient(id: string) {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Client>({
    queryKey: queryKeys.clients.detail(id),
    queryFn: async (): Promise<Client> => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_accountants (
            accountant_id,
            is_primary,
            profile:profiles (*)
          )
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapDbClient(data, (data as any).client_accountants);
    },
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateClient,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all });
      if (variables.id) {
        qc.invalidateQueries({ queryKey: queryKeys.clients.detail(variables.id) });
      }
    },
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => archiveClient(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

export function useDpsClientPrefill() {
  return useMutation({
    mutationFn: async (input: DpsClientPrefillInput): Promise<DpsClientPrefillResult> => {
      const response = await fetch('/api/integrations/dps/prefill', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || 'Не вдалося отримати дані ДПС для автозаповнення.');
      }

      return payload as DpsClientPrefillResult;
    },
  });
}
