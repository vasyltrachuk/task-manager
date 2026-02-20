'use client';

import { useMemo, useState } from 'react';
import { X, Link2, Search, Loader2, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTasksByClient } from '@/lib/hooks/use-tasks';
import { useLinkDocumentToTask } from '@/lib/hooks/use-documents';
import { getVisibleTasksForUser } from '@/lib/rbac';
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS } from '@/lib/types';
import type { ClientDocument, Task } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

interface LinkDocumentToTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  document: ClientDocument | null;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

export default function LinkDocumentToTaskModal({
  isOpen,
  onClose,
  clientId,
  document,
}: LinkDocumentToTaskModalProps) {
  const { profile } = useAuth();
  const { data: tasks, isLoading } = useTasksByClient(clientId);
  const linkDocumentMutation = useLinkDocumentToTask();
  const [search, setSearch] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const visibleTasks = useMemo(() => {
    if (!profile) return [];
    return getVisibleTasksForUser(tasks ?? [], profile);
  }, [profile, tasks]);

  const filteredTasks = useMemo(() => {
    const sorted = sortTasks(visibleTasks);
    if (!search.trim()) return sorted;

    const q = search.trim().toLowerCase();
    return sorted.filter(
      task =>
        task.title.toLowerCase().includes(q) ||
        task.id.toLowerCase().includes(q) ||
        TASK_TYPE_LABELS[task.type].toLowerCase().includes(q)
    );
  }, [search, visibleTasks]);

  if (!isOpen || !document) return null;

  const handleClose = () => {
    setSearch('');
    setPendingTaskId(null);
    onClose();
  };

  const handleLink = (taskId: string) => {
    if (!profile) return;

    setPendingTaskId(taskId);
    linkDocumentMutation.mutate(
      {
        taskId,
        documentId: document.id,
        linkedBy: profile.id,
      },
      {
        onSuccess: () => handleClose(),
        onSettled: () => setPendingTaskId(null),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-surface-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary">Прив&apos;язати документ до задачі</h3>
            <p className="text-xs text-text-muted mt-0.5 truncate">{document.file_name}</p>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-surface-200">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Пошук задачі..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-surface-200 focus:outline-none focus:border-brand-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="py-8 text-center text-sm text-text-muted">Завантаження задач...</div>
          )}

          {!isLoading && filteredTasks.length === 0 && (
            <div className="py-8 text-center text-sm text-text-muted">
              {search.trim() ? 'Задачі не знайдено' : 'Для цього клієнта поки немає задач'}
            </div>
          )}

          <div className="space-y-2">
            {filteredTasks.map(task => {
              const isPending = pendingTaskId === task.id && linkDocumentMutation.isPending;

              return (
                <button
                  key={task.id}
                  onClick={() => handleLink(task.id)}
                  disabled={linkDocumentMutation.isPending}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border border-surface-200 bg-white transition-colors',
                    linkDocumentMutation.isPending
                      ? 'opacity-70 cursor-not-allowed'
                      : 'hover:bg-surface-50'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-text-muted">{task.id}</span>
                        <span className={cn('badge', `badge-${task.status}`)}>
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {TASK_TYPE_LABELS[task.type]} • дедлайн {formatDate(task.due_date)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 flex-shrink-0">
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                      Прив&apos;язати
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {linkDocumentMutation.isError && (
          <div className="px-6 py-3 border-t border-red-100 bg-red-50 text-xs text-red-700">
            {linkDocumentMutation.error instanceof Error
              ? linkDocumentMutation.error.message
              : 'Не вдалося прив’язати документ. Спробуйте ще раз.'}
          </div>
        )}

        <div className="px-6 py-3 border-t border-surface-200 bg-surface-50 text-xs text-text-muted flex items-center gap-2">
          <ClipboardList size={13} />
          Клік по задачі одразу створює прив&apos;язку документа.
        </div>
      </div>
    </div>
  );
}
