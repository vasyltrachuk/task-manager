'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ClipboardList, Calendar, User, AlertTriangle, Plus, Trash2, Check, Search, ChevronsUpDown } from 'lucide-react';
import {
    Task,
    TaskType,
    TaskStatus,
    TaskPriority,
    RecurrenceType,
    TASK_TYPE_LABELS,
    PRIORITY_LABELS,
    CLIENT_TYPE_LABELS,
    CLIENT_TAX_ID_TYPE_LABELS,
    RECURRENCE_LABELS,
    USER_ROLE_LABELS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import { getVisibleClientsForUser, isAccountant, isAdmin } from '@/lib/rbac';

interface TaskFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editTask?: Task | null;
    defaultClientId?: string;
}

interface TaskFormData {
    title: string;
    description: string;
    client_id: string;
    assignee_id: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string;
    recurrence: RecurrenceType;
    recurrence_days: number[];
    period: string;
    proof_required: boolean;
    subtasks: string[];
}

const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, idx) => idx + 1);
const MAX_CLIENT_RESULTS = 200;
const MAX_ASSIGNEE_RESULTS = 200;

function getInitialFormData(
    editTask?: Task | null,
    defaultClientId?: string,
    defaultAssigneeId?: string
): TaskFormData {
    if (editTask) {
        return {
            title: editTask.title,
            description: editTask.description || '',
            client_id: editTask.client_id,
            assignee_id: editTask.assignee_id,
            type: editTask.type,
            status: editTask.status,
            priority: editTask.priority,
            due_date: editTask.due_date ? editTask.due_date.slice(0, 16) : '',
            recurrence: editTask.recurrence,
            recurrence_days: editTask.recurrence === 'semi_monthly'
                ? (editTask.recurrence_days?.length === 2 ? editTask.recurrence_days : [1, 15])
                : [],
            period: editTask.period || '',
            proof_required: editTask.proof_required,
            subtasks: editTask.subtasks?.map(s => s.title) || [],
        };
    }

    return {
        title: '',
        description: '',
        client_id: defaultClientId || '',
        assignee_id: defaultAssigneeId || '',
        type: 'tax_report',
        status: 'todo',
        priority: 2,
        due_date: '',
        recurrence: 'none',
        recurrence_days: [],
        period: '',
        proof_required: false,
        subtasks: [],
    };
}

export default function TaskFormModal({ isOpen, onClose, editTask, defaultClientId }: TaskFormModalProps) {
    const { state, addTask, updateTask } = useApp();
    const isAdminUser = isAdmin(state.currentUser);
    const isAccountantUser = isAccountant(state.currentUser);

    const resolveDefaultAssigneeForClient = (clientId: string): string => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client?.accountants?.length) return '';

        const responsible = client.accountants.find((accountant) =>
            state.profiles.some((profile) =>
                profile.id === accountant.id && profile.role === 'accountant' && profile.is_active
            )
        );

        return responsible?.id || '';
    };

    const initialAssigneeId = editTask?.assignee_id
        || (isAccountantUser
            ? state.currentUser.id
            : (isAdminUser && defaultClientId ? resolveDefaultAssigneeForClient(defaultClientId) : ''));

    const [formData, setFormData] = useState<TaskFormData>(() =>
        getInitialFormData(editTask, defaultClientId, initialAssigneeId)
    );

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [newSubtask, setNewSubtask] = useState('');
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
    const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
    const clientDropdownRef = useRef<HTMLDivElement | null>(null);
    const clientSearchInputRef = useRef<HTMLInputElement | null>(null);
    const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);
    const assigneeSearchInputRef = useRef<HTMLInputElement | null>(null);
    const isRecurring = formData.recurrence !== 'none';
    const normalizedClientQuery = clientSearchQuery.trim().toLowerCase();
    const normalizedAssigneeQuery = assigneeSearchQuery.trim().toLowerCase();

    const activeClients = useMemo(() => {
        return getVisibleClientsForUser(state.clients, state.currentUser)
            .filter(c => c.status !== 'archived')
            .sort((a, b) => getClientDisplayName(a).localeCompare(getClientDisplayName(b), 'uk', { sensitivity: 'base' }));
    }, [state.clients, state.currentUser]);

    const assignees = useMemo(() => {
        if (isAdminUser) {
            return state.profiles
                .filter(profile => profile.role === 'accountant' && profile.is_active)
                .sort((a, b) => a.full_name.localeCompare(b.full_name, 'uk', { sensitivity: 'base' }));
        }

        if (isAccountantUser) {
            return state.profiles
                .filter(profile => profile.id === state.currentUser.id && profile.is_active)
                .sort((a, b) => a.full_name.localeCompare(b.full_name, 'uk', { sensitivity: 'base' }));
        }

        return state.profiles
            .filter(() => false)
            .sort((a, b) => a.full_name.localeCompare(b.full_name, 'uk', { sensitivity: 'base' }));
    }, [isAccountantUser, isAdminUser, state.currentUser.id, state.profiles]);

    const selectedClient = useMemo(
        () => activeClients.find(c => c.id === formData.client_id),
        [activeClients, formData.client_id]
    );
    const selectedAssignee = useMemo(
        () => assignees.find(a => a.id === formData.assignee_id),
        [assignees, formData.assignee_id]
    );

    const matchedClients = useMemo(() => {
        if (!normalizedClientQuery) return activeClients;

        return activeClients.filter((client) => {
            const displayName = getClientDisplayName(client);
            const searchIndex = `${displayName} ${client.name} ${CLIENT_TYPE_LABELS[client.type]} ${CLIENT_TAX_ID_TYPE_LABELS[client.tax_id_type]} ${client.tax_id}`.toLowerCase();
            return searchIndex.includes(normalizedClientQuery);
        });
    }, [activeClients, normalizedClientQuery]);

    const visibleClients = useMemo(
        () => matchedClients.slice(0, MAX_CLIENT_RESULTS),
        [matchedClients]
    );
    const hasHiddenMatchedClients = matchedClients.length > visibleClients.length;

    const matchedAssignees = useMemo(() => {
        if (!normalizedAssigneeQuery) return assignees;

        return assignees.filter((assignee) => {
            const searchIndex = `${assignee.full_name} ${USER_ROLE_LABELS[assignee.role]} ${assignee.phone} ${assignee.email || ''}`.toLowerCase();
            return searchIndex.includes(normalizedAssigneeQuery);
        });
    }, [assignees, normalizedAssigneeQuery]);

    const visibleAssignees = useMemo(
        () => matchedAssignees.slice(0, MAX_ASSIGNEE_RESULTS),
        [matchedAssignees]
    );
    const hasHiddenMatchedAssignees = matchedAssignees.length > visibleAssignees.length;
    const isAdminCreatingTask = !editTask && isAdminUser;

    const getDefaultAssigneeForClient = useCallback((clientId: string): string => {
        const client = state.clients.find((c) => c.id === clientId);
        if (!client?.accountants?.length) return '';

        const firstResponsible = client.accountants.find((accountant) =>
            state.profiles.some((profile) =>
                profile.id === accountant.id && profile.role === 'accountant' && profile.is_active
            )
        );

        return firstResponsible?.id || '';
    }, [state.clients, state.profiles]);

    useEffect(() => {
        if (!isClientDropdownOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!clientDropdownRef.current?.contains(event.target as Node)) {
                setIsClientDropdownOpen(false);
                setClientSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isClientDropdownOpen]);

    useEffect(() => {
        if (isClientDropdownOpen) {
            clientSearchInputRef.current?.focus();
        }
    }, [isClientDropdownOpen]);

    useEffect(() => {
        if (!isAssigneeDropdownOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!assigneeDropdownRef.current?.contains(event.target as Node)) {
                setIsAssigneeDropdownOpen(false);
                setAssigneeSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAssigneeDropdownOpen]);

    useEffect(() => {
        if (isAssigneeDropdownOpen) {
            assigneeSearchInputRef.current?.focus();
        }
    }, [isAssigneeDropdownOpen]);

    const handleClientSelect = (clientId: string) => {
        const nextAssigneeId = isAdminCreatingTask
            ? getDefaultAssigneeForClient(clientId)
            : isAccountantUser
                ? state.currentUser.id
                : undefined;

        setFormData((prev) => ({
            ...prev,
            client_id: clientId,
            assignee_id: nextAssigneeId !== undefined ? nextAssigneeId : prev.assignee_id,
        }));
        setErrors((prev) => {
            const next = { ...prev };
            delete next.client_id;
            if (nextAssigneeId !== undefined) {
                delete next.assignee_id;
            }
            return next;
        });
        setIsClientDropdownOpen(false);
        setClientSearchQuery('');
    };

    const handleAssigneeSelect = (assigneeId: string) => {
        if (isAccountantUser) return;

        setFormData((prev) => ({ ...prev, assignee_id: assigneeId }));
        setErrors((prev) => {
            if (!prev.assignee_id) return prev;
            const next = { ...prev };
            delete next.assignee_id;
            return next;
        });
        setIsAssigneeDropdownOpen(false);
        setAssigneeSearchQuery('');
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (!formData.title.trim()) e.title = "Обов'язкове поле";
        if (!formData.client_id) e.client_id = "Оберіть клієнта";
        if (!isAccountantUser && !formData.assignee_id) e.assignee_id = "Оберіть виконавця";
        if (!formData.due_date) e.due_date = "Встановіть дату найближчого виконання";
        if (formData.recurrence === 'semi_monthly') {
            if (formData.recurrence_days.length !== 2) {
                e.recurrence_days = 'Оберіть 2 дні місяця';
            } else if (formData.recurrence_days[0] === formData.recurrence_days[1]) {
                e.recurrence_days = 'Дні повторення мають бути різними';
            }
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleRecurrenceChange = (recurrence: RecurrenceType) => {
        setFormData(prev => ({
            ...prev,
            recurrence,
            recurrence_days: recurrence === 'semi_monthly'
                ? (prev.recurrence_days.length === 2 ? prev.recurrence_days : [1, 15])
                : [],
        }));
        setErrors(prev => {
            const next = { ...prev };
            delete next.recurrence_days;
            return next;
        });
    };

    const handleSemiMonthlyDayChange = (index: 0 | 1, value: string) => {
        const day = Number(value);
        setFormData(prev => {
            const baseDays = prev.recurrence_days.length === 2 ? [...prev.recurrence_days] : [1, 15];
            baseDays[index] = day;
            return { ...prev, recurrence_days: baseDays };
        });
    };

    const handleAddSubtask = () => {
        if (newSubtask.trim()) {
            setFormData(prev => ({
                ...prev,
                subtasks: [...prev.subtasks, newSubtask.trim()],
            }));
            setNewSubtask('');
        }
    };

    const handleRemoveSubtask = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            subtasks: prev.subtasks.filter((_, i) => i !== idx),
        }));
    };

    const handleSubmit = () => {
        if (!validate()) return;

        const resolvedAssigneeId = isAccountantUser ? state.currentUser.id : formData.assignee_id;

        const taskData = {
            title: formData.title.trim(),
            description: formData.description.trim() || undefined,
            client_id: formData.client_id,
            assignee_id: resolvedAssigneeId,
            type: formData.type,
            status: formData.status,
            priority: formData.priority,
            due_date: new Date(formData.due_date).toISOString(),
            recurrence: formData.recurrence,
            recurrence_days: formData.recurrence === 'semi_monthly' ? formData.recurrence_days : undefined,
            period: formData.period || undefined,
            proof_required: formData.proof_required,
            subtasks: formData.subtasks.map((title, i) => ({
                id: `st-new-${i}`,
                task_id: '',
                title,
                is_completed: false,
                sort_order: i,
            })),
            comments: editTask?.comments || [],
            files: editTask?.files || [],
        };

        if (editTask) {
            updateTask({
                ...editTask,
                ...taskData,
                updated_at: new Date().toISOString(),
            } as Task);
        } else {
            addTask(taskData as Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="sticky top-0 bg-white z-10 px-8 pt-6 pb-4 border-b border-surface-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                                <ClipboardList size={20} className="text-brand-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-text-primary">
                                    {editTask ? 'Редагувати завдання' : 'Нове завдання'}
                                </h2>
                                <p className="text-xs text-text-muted">
                                    {editTask ? 'Оновити параметри завдання' : 'Створіть нове завдання для клієнта'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="px-8 py-6 space-y-6">
                    {/* Title */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Назва завдання *
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Декларація з ПДВ за Q3 2023"
                            className={cn(
                                'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                errors.title ? 'border-red-400' : 'border-surface-200'
                            )}
                        />
                        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
                    </div>

                    {/* Client + Assignee */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Клієнт *
                            </label>
                            <div className="relative" ref={clientDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isClientDropdownOpen) {
                                            setIsClientDropdownOpen(false);
                                            setClientSearchQuery('');
                                        } else {
                                            setIsAssigneeDropdownOpen(false);
                                            setAssigneeSearchQuery('');
                                            setClientSearchQuery('');
                                            setIsClientDropdownOpen(true);
                                        }
                                    }}
                                    className={cn(
                                        'w-full px-3 py-3 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all flex items-center justify-between gap-2',
                                        errors.client_id ? 'border-red-400' : 'border-surface-200'
                                    )}
                                >
                                    <span className={cn(
                                        'truncate text-left',
                                        selectedClient ? 'text-text-primary' : 'text-text-muted'
                                    )}>
                                        {selectedClient
                                            ? getClientDisplayName(selectedClient)
                                            : 'Оберіть клієнта'}
                                    </span>
                                    <ChevronsUpDown size={16} className="text-text-muted flex-shrink-0" />
                                </button>

                                {isClientDropdownOpen && (
                                    <div className="absolute z-30 mt-2 w-full rounded-lg border border-surface-200 bg-white shadow-lg p-2">
                                        <div className="relative mb-2">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                            <input
                                                ref={clientSearchInputRef}
                                                type="text"
                                                value={clientSearchQuery}
                                                onChange={(e) => setClientSearchQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        setIsClientDropdownOpen(false);
                                                        setClientSearchQuery('');
                                                    }
                                                }}
                                                placeholder="Пошук за назвою, типом, РНОКПП або ЄДРПОУ..."
                                                className="w-full pl-8 pr-3 py-2 bg-white border border-surface-200 rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200"
                                            />
                                        </div>

                                        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                                            {visibleClients.length > 0 ? visibleClients.map((client) => (
                                                <button
                                                    key={client.id}
                                                    type="button"
                                                    onClick={() => handleClientSelect(client.id)}
                                                    className={cn(
                                                        'w-full text-left px-3 py-2 rounded-md border transition-colors',
                                                        formData.client_id === client.id
                                                            ? 'border-brand-200 bg-brand-50/70'
                                                            : 'border-transparent hover:border-surface-200 hover:bg-surface-50'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-medium text-text-primary truncate">{getClientDisplayName(client)}</span>
                                                        {formData.client_id === client.id && (
                                                            <Check size={14} className="text-brand-600 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-text-muted truncate mt-0.5">
                                                        {CLIENT_TYPE_LABELS[client.type]}
                                                        {` • ${CLIENT_TAX_ID_TYPE_LABELS[client.tax_id_type]}: ${client.tax_id}`}
                                                    </p>
                                                </button>
                                            )) : (
                                                <p className="px-2 py-6 text-center text-xs text-text-muted">
                                                    Клієнтів за цим запитом не знайдено
                                                </p>
                                            )}
                                        </div>

                                        {hasHiddenMatchedClients && (
                                            <p className="pt-2 px-2 text-[11px] text-text-muted">
                                                Показано {visibleClients.length} з {matchedClients.length}. Уточніть запит, щоб звузити список.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                            {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <User size={12} className="inline mr-1" />
                                Виконавець *
                            </label>
                            <div className="relative" ref={assigneeDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isAccountantUser) return;
                                        if (isAssigneeDropdownOpen) {
                                            setIsAssigneeDropdownOpen(false);
                                            setAssigneeSearchQuery('');
                                        } else {
                                            setIsClientDropdownOpen(false);
                                            setClientSearchQuery('');
                                            setAssigneeSearchQuery('');
                                            setIsAssigneeDropdownOpen(true);
                                        }
                                    }}
                                    className={cn(
                                        'w-full px-3 py-3 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all flex items-center justify-between gap-2',
                                        errors.assignee_id ? 'border-red-400' : 'border-surface-200',
                                        isAccountantUser && 'bg-surface-50 cursor-not-allowed'
                                    )}
                                >
                                    <span className={cn(
                                        'truncate text-left',
                                        selectedAssignee ? 'text-text-primary' : 'text-text-muted'
                                    )}>
                                        {selectedAssignee ? selectedAssignee.full_name : 'Оберіть виконавця'}
                                    </span>
                                    <ChevronsUpDown size={16} className="text-text-muted flex-shrink-0" />
                                </button>

                                {isAssigneeDropdownOpen && !isAccountantUser && (
                                    <div className="absolute z-30 mt-2 w-full rounded-lg border border-surface-200 bg-white shadow-lg p-2">
                                        <div className="relative mb-2">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                            <input
                                                ref={assigneeSearchInputRef}
                                                type="text"
                                                value={assigneeSearchQuery}
                                                onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        setIsAssigneeDropdownOpen(false);
                                                        setAssigneeSearchQuery('');
                                                    }
                                                }}
                                                placeholder="Пошук за ім'ям, роллю, телефоном..."
                                                className="w-full pl-8 pr-3 py-2 bg-white border border-surface-200 rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200"
                                            />
                                        </div>

                                        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                                            {visibleAssignees.length > 0 ? visibleAssignees.map((assignee) => (
                                                <button
                                                    key={assignee.id}
                                                    type="button"
                                                    onClick={() => handleAssigneeSelect(assignee.id)}
                                                    className={cn(
                                                        'w-full text-left px-3 py-2 rounded-md border transition-colors',
                                                        formData.assignee_id === assignee.id
                                                            ? 'border-brand-200 bg-brand-50/70'
                                                            : 'border-transparent hover:border-surface-200 hover:bg-surface-50'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-medium text-text-primary truncate">{assignee.full_name}</span>
                                                        {formData.assignee_id === assignee.id && (
                                                            <Check size={14} className="text-brand-600 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-text-muted truncate mt-0.5">
                                                        {USER_ROLE_LABELS[assignee.role]} • {assignee.phone}
                                                    </p>
                                                </button>
                                            )) : (
                                                <p className="px-2 py-6 text-center text-xs text-text-muted">
                                                    Виконавців за цим запитом не знайдено
                                                </p>
                                            )}
                                        </div>

                                        {hasHiddenMatchedAssignees && (
                                            <p className="pt-2 px-2 text-[11px] text-text-muted">
                                                Показано {visibleAssignees.length} з {matchedAssignees.length}. Уточніть запит, щоб звузити список.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                            {errors.assignee_id && <p className="text-xs text-red-500 mt-1">{errors.assignee_id}</p>}
                        </div>
                    </div>

                    {/* Type + Priority */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Тип завдання
                            </label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as TaskType }))}
                                className="w-full px-3 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            >
                                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <AlertTriangle size={12} className="inline mr-1" />
                                Пріоритет
                            </label>
                            <div className="flex gap-2">
                                {([1, 2, 3] as TaskPriority[]).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                                        className={cn(
                                            'flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all border',
                                            formData.priority === p
                                                ? p === 1 ? 'bg-red-500 text-white border-red-500'
                                                    : p === 2 ? 'bg-amber-500 text-white border-amber-500'
                                                        : 'bg-slate-400 text-white border-slate-400'
                                                : 'bg-white text-text-secondary border-surface-200 hover:border-surface-300'
                                        )}
                                    >
                                        {PRIORITY_LABELS[p]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-bold text-text-primary">Графік виконання</h3>
                            <p className="text-xs text-text-muted mt-1">
                                {isRecurring
                                    ? 'Для періодичних задач дедлайн означає найближчу дату цього циклу.'
                                    : 'Для одноразових задач дедлайн означає крайній термін виконання.'}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Повторюваність
                                </label>
                                <select
                                    value={formData.recurrence}
                                    onChange={(e) => handleRecurrenceChange(e.target.value as RecurrenceType)}
                                    className="w-full px-3 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                >
                                    {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    <Calendar size={12} className="inline mr-1" />
                                    {isRecurring ? 'Найближчий дедлайн *' : 'Дедлайн *'}
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.due_date}
                                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                                    className={cn(
                                        'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.due_date ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.due_date && <p className="text-xs text-red-500 mt-1">{errors.due_date}</p>}
                            </div>
                        </div>

                        {formData.recurrence === 'semi_monthly' && (
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Дні повторення у місяці
                                </label>
                                <div className="grid grid-cols-2 gap-3 max-w-sm">
                                    <select
                                        value={formData.recurrence_days[0] || 1}
                                        onChange={(e) => handleSemiMonthlyDayChange(0, e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                    >
                                        {MONTH_DAY_OPTIONS.map(day => (
                                            <option key={`day-1-${day}`} value={day}>{day} число</option>
                                        ))}
                                    </select>

                                    <select
                                        value={formData.recurrence_days[1] || 15}
                                        onChange={(e) => handleSemiMonthlyDayChange(1, e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                    >
                                        {MONTH_DAY_OPTIONS.map(day => (
                                            <option key={`day-2-${day}`} value={day}>{day} число</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-xs text-text-muted mt-2">
                                    Наприклад: зарплатний цикл на 5 та 20 число кожного місяця.
                                </p>
                                {errors.recurrence_days && <p className="text-xs text-red-500 mt-1">{errors.recurrence_days}</p>}
                            </div>
                        )}
                    </div>

                    {/* Period */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Період
                        </label>
                        <input
                            type="text"
                            value={formData.period}
                            onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value }))}
                            placeholder="Q3 2023, Жовтень 2023..."
                            className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Опис / інструкції
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Детальний опис завдання..."
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all resize-none"
                        />
                    </div>

                    {/* Subtasks */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Чек-лист (підзавдання)
                        </label>
                        <div className="space-y-2 mb-3">
                            {formData.subtasks.map((st, i) => (
                                <div key={i} className="flex items-center gap-2 bg-surface-50 rounded-lg px-4 py-2.5">
                                    <div className="w-4 h-4 rounded border border-surface-300 flex-shrink-0" />
                                    <span className="text-sm text-text-primary flex-1">{st}</span>
                                    <button
                                        onClick={() => handleRemoveSubtask(i)}
                                        className="text-text-muted hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newSubtask}
                                onChange={(e) => setNewSubtask(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubtask())}
                                placeholder="Нове підзавдання..."
                                className="flex-1 px-4 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            />
                            <button
                                onClick={handleAddSubtask}
                                className="px-3 py-2.5 bg-surface-100 hover:bg-surface-200 rounded-lg text-text-secondary transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Proof required toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div
                            onClick={() => setFormData(prev => ({ ...prev, proof_required: !prev.proof_required }))}
                            className={cn(
                                'w-10 h-6 rounded-full transition-colors relative',
                                formData.proof_required ? 'bg-brand-600' : 'bg-surface-300'
                            )}
                        >
                            <div className={cn(
                                'w-4 h-4 rounded-full bg-white shadow absolute top-1 transition-transform',
                                formData.proof_required ? 'translate-x-5' : 'translate-x-1'
                            )} />
                        </div>
                        <span className="text-sm text-text-primary font-medium">Потребує доказу виконання (файл/посилання)</span>
                    </label>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-surface-200 px-8 py-4 flex items-center justify-between rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-100 rounded-lg transition-colors"
                    >
                        Скасувати
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                    >
                        {editTask ? 'Зберегти зміни' : 'Створити завдання'}
                    </button>
                </div>
            </div>
        </div>
    );
}
