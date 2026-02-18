'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbAuditEntry } from '../mappers';
import type { ActivityLogEntry } from '../types';

export function useActivityLogByTask(taskId: string) {
  const supabase = getSupabaseBrowserClient();
  return useQuery<ActivityLogEntry[]>({
    queryKey: queryKeys.activityLog.byTask(taskId),
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*, actor:profiles(*)')
        .eq('entity', 'task')
        .eq('entity_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbAuditEntry(row));
    },
    enabled: !!taskId,
  });
}

export function useActivityLogByTasks(taskIds: readonly string[]) {
  const supabase = getSupabaseBrowserClient();
  return useQuery<ActivityLogEntry[]>({
    queryKey: queryKeys.activityLog.byTasks(taskIds),
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      if (taskIds.length === 0) return [];

      const { data, error } = await supabase
        .from('audit_log')
        .select('*, actor:profiles(*)')
        .eq('entity', 'task')
        .in('entity_id', [...taskIds])
        .order('created_at', { ascending: false });

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbAuditEntry(row));
    },
    enabled: taskIds.length > 0,
  });
}
