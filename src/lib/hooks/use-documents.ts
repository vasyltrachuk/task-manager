'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbClientDocument } from '../mappers';
import type { ClientDocument } from '../types';

export function useClientDocuments(clientId: string) {
  const supabase = getSupabaseBrowserClient();

  return useQuery<ClientDocument[]>({
    queryKey: queryKeys.documents.byClient(clientId),
    queryFn: async (): Promise<ClientDocument[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbClientDocument(row));
    },
    enabled: !!clientId,
  });
}

export function useLinkDocumentToTask() {
  const qc = useQueryClient();
  const supabase = getSupabaseBrowserClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      documentId,
      linkedBy,
    }: {
      taskId: string;
      documentId: string;
      linkedBy: string;
    }) => {
      // First get tenant_id from the task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('tenant_id')
        .eq('id', taskId)
        .single();

      if (taskError || !task) throw new Error('Task not found');

      const { error } = await supabase.from('task_documents').insert({
        task_id: taskId,
        document_id: documentId,
        tenant_id: task.tenant_id,
        linked_by: linkedBy,
      });

      if (error) {
        if (error.code === '23505') {
          // Unique violation — already linked
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useDocumentDownloadUrl() {
  return useMutation({
    mutationFn: async ({
      storagePath,
      attachmentId,
    }: {
      storagePath: string;
      attachmentId?: string;
    }): Promise<string> => {
      let url = `/api/documents/download?path=${encodeURIComponent(storagePath)}`;
      if (attachmentId) {
        url += `&attachmentId=${encodeURIComponent(attachmentId)}`;
      }
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || 'Не вдалося отримати посилання.');
      }
      return (payload as { url: string }).url;
    },
  });
}
