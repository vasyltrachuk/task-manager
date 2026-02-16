'use client';

import { useState } from 'react';
import {
    Search,
    Plus,
    ChevronDown,
    User,
    AlertTriangle,
    Shield,
    MoreHorizontal,
    Calendar,
} from 'lucide-react';
import {
    Task, TaskStatus, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
    TASK_TYPE_LABELS, TASK_TYPE_COLORS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn, isOverdue, formatDate, getInitials } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import TaskDetailModal from '@/components/tasks/task-detail-modal';
import TaskFormModal from '@/components/tasks/task-form-modal';
import ViewModeToggle from '@/components/ui/view-mode-toggle';
import { canCreateTask, getVisibleTasksForUser } from '@/lib/rbac';

const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'clarification', 'review', 'done'];

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
    const overdue = task.status !== 'done' && isOverdue(task.due_date);
    const clientColor = TASK_TYPE_COLORS[task.type];

    return (
        <div
            onClick={onClick}
            className="card p-4 cursor-pointer group hover:translate-y-[-1px] transition-all duration-150"
        >
            {/* Top row: client name + task id */}
            <div className="flex items-center justify-between mb-2">
                <span
                    className="text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: clientColor }}
                >
                    {task.client ? getClientDisplayName(task.client) : 'Клієнт'}
                </span>
                <span className="text-[11px] text-text-muted font-medium">{task.id}</span>
            </div>

            {/* Title */}
            <h3 className="text-sm font-medium text-text-primary mb-3 leading-snug">
                {task.title}
            </h3>

            {/* Tags */}
            {(task.proof_required || task.status === 'clarification') && (
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {task.proof_required && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            <Shield size={10} />
                            Потребує доказу
                        </span>
                    )}
                    {task.status === 'clarification' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                            <AlertTriangle size={10} />
                            Заблоковано
                        </span>
                    )}
                </div>
            )}

            {/* Bottom row */}
            <div className="flex items-center justify-between">
                <span className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    overdue ? 'text-status-overdue' : 'text-text-muted'
                )}>
                    <Calendar size={12} />
                    {overdue ? (
                        <span className="flex items-center gap-1">
                            <AlertTriangle size={10} /> {formatDate(task.due_date)}
                        </span>
                    ) : (
                        formatDate(task.due_date)
                    )}
                </span>

                {task.assignee && (
                    <div className="w-7 h-7 rounded-full bg-surface-200 flex items-center justify-center text-[10px] font-bold text-text-secondary"
                        title={task.assignee.full_name}>
                        {getInitials(task.assignee.full_name)}
                    </div>
                )}
            </div>

            {/* Left accent border for overdue */}
            {overdue && (
                <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-status-overdue rounded-r-full" />
            )}
        </div>
    );
}

function KanbanColumn({ status, columnTasks, onTaskClick, onAddTask }: {
    status: TaskStatus;
    columnTasks: Task[];
    onTaskClick: (task: Task) => void;
    onAddTask: () => void;
}) {
    const { moveTask } = useApp();
    const statusColor = TASK_STATUS_COLORS[status];

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('bg-brand-50/50');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('bg-brand-50/50');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-brand-50/50');
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
            moveTask(taskId, status);
        }
    };

    return (
        <div
            className="kanban-column transition-colors rounded-lg"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: statusColor }}
                    />
                    <h3 className="text-sm font-semibold text-text-primary">
                        {TASK_STATUS_LABELS[status]}
                    </h3>
                    <span className="text-xs font-medium text-text-muted bg-surface-100 px-1.5 py-0.5 rounded-md">
                        {columnTasks.length}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {status === 'todo' && (
                        <button
                            onClick={onAddTask}
                            title="Додати завдання"
                            aria-label="Додати завдання"
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                        >
                            <Plus size={14} strokeWidth={2.5} />
                        </button>
                    )}
                    <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors">
                        <MoreHorizontal size={14} />
                    </button>
                </div>
            </div>

            {/* Cards */}
            <div className="space-y-3">
                {columnTasks.map(task => (
                    <div
                        key={task.id}
                        className="relative"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', task.id);
                            e.currentTarget.style.opacity = '0.5';
                        }}
                        onDragEnd={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        <TaskCard task={task} onClick={() => onTaskClick(task)} />
                    </div>
                ))}

                {/* Drop zone */}
                <div className="drop-zone text-sm py-4">
                    Перетягніть сюди
                </div>
            </div>
        </div>
    );
}

export default function TaskBoardPage() {
    const { state } = useApp();
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [searchQuery, setSearchQuery] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    const allTasks = getVisibleTasksForUser(state.tasks, state.currentUser);
    const canCreate = canCreateTask(state.currentUser);
    const overdueTasks = allTasks.filter(t => t.status !== 'done' && isOverdue(t.due_date));

    const filteredTasks = allTasks.filter(task => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (
                !task.title.toLowerCase().includes(q) &&
                !task.client?.name.toLowerCase().includes(q) &&
                !(task.client && getClientDisplayName(task.client).toLowerCase().includes(q))
            ) {
                return false;
            }
        }
        return true;
    });

    const handleCreateTask = () => {
        setEditingTask(null);
        setIsFormOpen(true);
    };

    // When a task is selected, get a fresh version from the store
    const handleTaskClick = (task: Task) => {
        const freshTask = state.tasks.find(t => t.id === task.id);
        setSelectedTask(freshTask || task);
    };

    // Re-sync selected task if store changes (e.g. after comment added)
    const currentSelectedTask = selectedTask
        ? state.tasks.find(t => t.id === selectedTask.id) || null
        : null;

    return (
        <div className="p-8 h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-text-primary">Завдання</h1>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Пошук завдань або клієнтів..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 w-64 transition-all"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {canCreate && (
                        <button
                            onClick={handleCreateTask}
                            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                        >
                            <Plus size={16} />
                            Нове завдання
                        </button>
                    )}
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-5 flex-wrap flex-shrink-0">
                <ViewModeToggle value={viewMode} onChange={setViewMode} />

                <button className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg hover:bg-surface-100 transition-colors">
                    <User size={14} />
                    Мої завдання
                </button>
                <button className="flex items-center gap-1.5 text-xs font-medium text-status-overdue hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
                    <AlertTriangle size={14} />
                    Прострочені
                    <span className="bg-status-overdue text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {overdueTasks.length}
                    </span>
                </button>
                <button className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg hover:bg-surface-100 transition-colors">
                    <Shield size={14} />
                    Потребує доказу
                </button>

                {/* Group By */}
                <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>ГРУПУВАТИ ЗА:</span>
                    <button className="flex items-center gap-1 font-medium text-text-primary">
                        Статус <ChevronDown size={12} />
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            {viewMode === 'board' ? (
                <div className="flex gap-5 overflow-x-auto pb-4 flex-1 min-h-0">
                    {statusColumns.map(status => {
                        const columnTasks = filteredTasks.filter(t => t.status === status);
                        return (
                            <KanbanColumn
                                key={status}
                                status={status}
                                columnTasks={columnTasks}
                                onTaskClick={handleTaskClick}
                                onAddTask={handleCreateTask}
                            />
                        );
                    })}
                </div>
            ) : (
                /* List View */
                <div className="card overflow-hidden flex-1">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-surface-200 bg-surface-50">
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Завдання</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Клієнт</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Виконавець</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Дедлайн</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Статус</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Тип</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map(task => (
                                <tr
                                    key={task.id}
                                    onClick={() => handleTaskClick(task)}
                                    className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-medium text-text-primary">{task.title}</div>
                                        <div className="text-xs text-text-muted">{task.id}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-text-secondary">
                                        {task.client ? getClientDisplayName(task.client) : 'Клієнт'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center text-[9px] font-bold text-text-secondary">
                                                {task.assignee ? getInitials(task.assignee.full_name) : '?'}
                                            </div>
                                            <span className="text-sm text-text-secondary">{task.assignee?.full_name}</span>
                                        </div>
                                    </td>
                                    <td className={cn(
                                        'px-4 py-3 text-sm font-medium',
                                        isOverdue(task.due_date) && task.status !== 'done' ? 'text-status-overdue' : 'text-text-secondary'
                                    )}>
                                        {formatDate(task.due_date)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn('badge', `badge-${task.status}`)}>
                                            {TASK_STATUS_LABELS[task.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-medium" style={{ color: TASK_TYPE_COLORS[task.type] }}>
                                            {TASK_TYPE_LABELS[task.type]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Task Detail Modal */}
            {currentSelectedTask && (
                <TaskDetailModal
                    task={currentSelectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}

            {/* Task Form Modal */}
            {isFormOpen && (
                <TaskFormModal
                    key={editingTask?.id || 'new-task'}
                    isOpen={isFormOpen}
                    onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
                    editTask={editingTask}
                />
            )}
        </div>
    );
}
