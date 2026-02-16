'use client';

import { useState } from 'react';
import {
    X,
    Calendar,
    Upload,
    Send,
    AlertTriangle,
    CheckCircle2,
    Circle,
    Users,
    Building2,
    HelpCircle,
    CheckSquare,
    Trash2,
    ArrowRight,
} from 'lucide-react';
import {
    Task,
    TaskStatus,
    TASK_STATUS_LABELS,
    TASK_STATUS_COLORS,
    TASK_TYPE_COLORS,
    PRIORITY_LABELS,
    RECURRENCE_LABELS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn, formatDate, formatTime, getInitials } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import { canOperateTask, isAdmin } from '@/lib/rbac';

interface TaskDetailModalProps {
    task: Task;
    onClose: () => void;
}

const STATUS_FLOW: Record<string, { next: TaskStatus; label: string }> = {
    todo: { next: 'in_progress', label: 'Почати роботу' },
    in_progress: { next: 'review', label: 'На перевірку' },
    clarification: { next: 'in_progress', label: 'Повернути в роботу' },
    review: { next: 'done', label: 'Затвердити' },
    done: { next: 'done', label: 'Виконано ✓' },
};

export default function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
    const { state, addComment, toggleSubtask, moveTask, deleteTask, logActivity } = useApp();
    const [noteText, setNoteText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const completedSubtasks = task.subtasks?.filter(s => s.is_completed).length ?? 0;
    const totalSubtasks = task.subtasks?.length ?? 0;

    const taskActivities = state.activityLog.filter(a => a.task_id === task.id);
    const statusColor = TASK_STATUS_COLORS[task.status];
    const typeColor = TASK_TYPE_COLORS[task.type];

    const priorityColor = task.priority === 1 ? 'text-status-overdue bg-red-50' :
        task.priority === 2 ? 'text-amber-600 bg-amber-50' :
            'text-text-muted bg-surface-100';

    const flow = STATUS_FLOW[task.status];
    const recurrenceDays = task.recurrence === 'semi_monthly' && task.recurrence_days?.length === 2
        ? ` (${task.recurrence_days[0]} і ${task.recurrence_days[1]} числа)`
        : '';
    const canOperate = canOperateTask(state.currentUser, task);
    const canDelete = isAdmin(state.currentUser);

    if (!canOperate) {
        return null;
    }

    const handleAddComment = () => {
        if (!noteText.trim()) return;
        addComment(task.id, noteText.trim());
        setNoteText('');
    };

    const handleToggleSubtask = (subtaskId: string) => {
        toggleSubtask(task.id, subtaskId);
    };

    const handleMoveStatus = (newStatus: TaskStatus) => {
        moveTask(task.id, newStatus);
        logActivity(task.id, `Статус змінено на ${TASK_STATUS_LABELS[newStatus]}`);
    };

    const handleRequestClarification = () => {
        moveTask(task.id, 'clarification');
        logActivity(task.id, 'Завдання переведено на уточнення');
    };

    const handleDelete = () => {
        deleteTask(task.id);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-[920px] max-h-[90vh] overflow-hidden flex flex-col mx-4 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between px-8 pt-7 pb-5">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span
                                className="badge text-xs"
                                style={{
                                    color: statusColor,
                                    backgroundColor: `${statusColor}15`,
                                }}
                            >
                                {TASK_STATUS_LABELS[task.status].toUpperCase()}
                            </span>
                            <span className="text-sm text-text-muted font-mono font-medium">#{task.id}</span>
                        </div>
                        <h2 className="text-xl font-bold text-text-primary">{task.title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {canDelete && !isDeleting && (
                            <button
                                onClick={() => setIsDeleting(true)}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                                title="Видалити завдання"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        {canDelete && isDeleting && (
                            <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg">
                                <span className="text-xs text-red-600 font-medium">Видалити?</span>
                                <button
                                    onClick={handleDelete}
                                    className="px-2 py-1 text-xs font-bold text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                                >
                                    Так
                                </button>
                                <button
                                    onClick={() => setIsDeleting(false)}
                                    className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded transition-colors"
                                >
                                    Ні
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="flex gap-0">
                        {/* Left Panel */}
                        <div className="flex-1 px-8 pb-8">
                            {/* Meta Row */}
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8">
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                                        <Calendar size={12} />
                                        Дедлайн
                                    </div>
                                    <p className="text-sm font-semibold text-text-primary">{formatDate(task.due_date, 'long')}</p>
                                    <p className="text-xs text-text-muted mt-1">
                                        {task.recurrence === 'none'
                                            ? 'Одноразове завдання'
                                            : `Повторюваність: ${RECURRENCE_LABELS[task.recurrence]}${recurrenceDays}`}
                                    </p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                                        <Building2 size={12} />
                                        Клієнт
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{ backgroundColor: typeColor }}
                                        />
                                        <p className="text-sm font-semibold text-text-primary">
                                            {task.client ? getClientDisplayName(task.client) : 'Клієнт'}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                                        <Users size={12} />
                                        Виконавець
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                                            {task.assignee ? getInitials(task.assignee.full_name) : '?'}
                                        </div>
                                        <p className="text-sm font-semibold text-text-primary">{task.assignee?.full_name}</p>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                                        <AlertTriangle size={12} />
                                        Пріоритет
                                    </div>
                                    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold px-2 py-0.5 rounded', priorityColor)}>
                                        {PRIORITY_LABELS[task.priority]}
                                    </span>
                                </div>
                            </div>

                            {/* Instructions */}
                            {task.description && (
                                <div className="mb-8">
                                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-3">Інструкції</h3>
                                    <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                                        {task.description}
                                    </div>
                                </div>
                            )}

                            {/* Sub-Tasks (Interactive) */}
                            {task.subtasks && task.subtasks.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">Підзавдання</h3>
                                        <span className="text-xs text-text-muted">
                                            {completedSubtasks}/{totalSubtasks} Виконано
                                        </span>
                                    </div>
                                    {/* Progress bar */}
                                    {totalSubtasks > 0 && (
                                        <div className="w-full h-1.5 bg-surface-100 rounded-full mb-3 overflow-hidden">
                                            <div
                                                className="h-full bg-status-done rounded-full transition-all duration-300"
                                                style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        {task.subtasks.map((sub) => (
                                            <div
                                                key={sub.id}
                                                onClick={() => handleToggleSubtask(sub.id)}
                                                className={cn(
                                                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer',
                                                    sub.is_completed ? 'bg-emerald-50/50' : 'hover:bg-surface-50'
                                                )}
                                            >
                                                {sub.is_completed ? (
                                                    <CheckCircle2 size={18} className="text-status-done flex-shrink-0" />
                                                ) : (
                                                    <Circle size={18} className="text-surface-300 flex-shrink-0" />
                                                )}
                                                <span className={cn(
                                                    'text-sm',
                                                    sub.is_completed ? 'text-text-muted line-through' : 'text-text-primary'
                                                )}>
                                                    {sub.title}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Panel */}
                        <div className="w-[300px] border-l border-surface-200 px-6 pb-6 flex-shrink-0">
                            {/* Quick Status Transitions */}
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-3">
                                    Змінити статус
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {(['todo', 'in_progress', 'clarification', 'review', 'done'] as TaskStatus[]).map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => handleMoveStatus(s)}
                                            disabled={task.status === s}
                                            className={cn(
                                                'text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all',
                                                task.status === s
                                                    ? 'border-brand-300 bg-brand-50 text-brand-700 cursor-default'
                                                    : 'border-surface-200 text-text-muted hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/50 cursor-pointer'
                                            )}
                                        >
                                            {TASK_STATUS_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Proof of Work */}
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-3">
                                    Підтвердження виконання
                                </h3>
                                <label className="upload-zone flex flex-col items-center gap-2 cursor-pointer">
                                    <Upload size={28} className="text-brand-400" />
                                    <span className="text-sm font-medium text-brand-600">Натисніть, щоб завантажити</span>
                                    <span className="text-xs text-text-muted">або перетягніть файл сюди</span>
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx" />
                                </label>
                            </div>

                            {/* Activity + Comments */}
                            <div>
                                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-3">
                                    Активність
                                </h3>
                                <div className="space-y-0">
                                    {/* Activity entries */}
                                    {taskActivities.map((activity) => (
                                        <div key={activity.id} className="activity-item">
                                            <div className="w-3 h-3 rounded-full bg-surface-300 flex-shrink-0 mt-1" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-text-primary">{activity.action}</span>
                                                    <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">
                                                        {formatDate(activity.created_at)}
                                                    </span>
                                                </div>
                                                {activity.details && (
                                                    <p className="text-xs text-text-muted mt-0.5">{activity.details}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Comments */}
                                    {task.comments?.map((comment) => (
                                        <div key={comment.id} className="activity-item">
                                            <div className="w-3 h-3 rounded-full bg-brand-400 flex-shrink-0 mt-1" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-semibold text-text-primary">
                                                        {comment.author?.full_name}
                                                    </span>
                                                    <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">
                                                        {formatTime(comment.created_at)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-text-secondary bg-surface-50 border border-surface-200 rounded-lg p-3 leading-relaxed">
                                                    {comment.body}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add note */}
                                <div className="flex items-center gap-2 mt-4">
                                    <input
                                        type="text"
                                        placeholder="Додати нотатку..."
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                        className="flex-1 px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200"
                                    />
                                    <button
                                        onClick={handleAddComment}
                                        disabled={!noteText.trim()}
                                        className={cn(
                                            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
                                            noteText.trim()
                                                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                                                : 'bg-surface-100 text-text-muted cursor-not-allowed'
                                        )}
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-8 py-4 border-t border-surface-200 bg-surface-50">
                    <button
                        onClick={handleRequestClarification}
                        disabled={task.status === 'clarification'}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2.5 border-2 rounded-xl text-sm font-semibold transition-colors',
                            task.status === 'clarification'
                                ? 'border-surface-200 text-text-muted cursor-not-allowed'
                                : 'border-amber-300 text-amber-600 hover:bg-amber-50'
                        )}
                    >
                        <HelpCircle size={16} />
                        Запросити інфо
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">
                            {task.subtasks && task.subtasks.length > 0
                                ? `${completedSubtasks}/${totalSubtasks} підзавдань`
                                : 'Збережено щойно'
                            }
                        </span>
                        {flow && task.status !== 'done' && (
                            <button
                                onClick={() => handleMoveStatus(flow.next)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors text-sm font-semibold shadow-sm"
                            >
                                <ArrowRight size={16} />
                                {flow.label}
                            </button>
                        )}
                        {task.status === 'done' && (
                            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold">
                                <CheckSquare size={16} />
                                Виконано ✓
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
