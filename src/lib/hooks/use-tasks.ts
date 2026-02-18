'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbTask } from '../mappers';
import type { Task } from '../types';
import {
  createTask, updateTask, deleteTask, moveTask,
  addSubtask, toggleSubtask, deleteSubtask, addComment,
} from '../actions/tasks';

const TASK_SELECT = `
  *,
  client:clients (*),
  assignee:profiles!tasks_assignee_id_fkey (*),
  subtasks (*),
  task_comments (*, author:profiles (*)),
  task_files (*)
`;

export function useTasks() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Task[]>({
    queryKey: queryKeys.tasks.all,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbTask(row));
    },
  });
}

export function useTasksByClient(clientId: string) {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Task[]>({
    queryKey: queryKeys.tasks.byClient(clientId),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbTask(row));
    },
    enabled: !!clientId,
  });
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: createTask, onSuccess: invalidate });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: updateTask, onSuccess: invalidate });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: (taskId: string) => deleteTask(taskId), onSuccess: invalidate });
}

export function useMoveTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      moveTask(taskId, status),
    onSuccess: invalidate,
  });
}

export function useAddSubtask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      addSubtask(taskId, title),
    onSuccess: invalidate,
  });
}

export function useToggleSubtask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, subtaskId }: { taskId: string; subtaskId: string }) =>
      toggleSubtask(taskId, subtaskId),
    onSuccess: invalidate,
  });
}

export function useDeleteSubtask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, subtaskId }: { taskId: string; subtaskId: string }) =>
      deleteSubtask(taskId, subtaskId),
    onSuccess: invalidate,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) =>
      addComment(taskId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
      qc.invalidateQueries({ queryKey: ['activityLog'] });
    },
  });
}
