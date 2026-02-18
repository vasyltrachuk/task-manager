'use client';

import { useMemo, useState } from 'react';
import {
    Search,
    Plus,
    AlertTriangle,
    CalendarClock,
    FileSearch,
    ShieldCheck,
    Pencil,
    Trash2,
    ClipboardCheck,
} from 'lucide-react';
import {
    License,
    LicenseType,
    TaskPriority,
    LICENSE_TYPE_LABELS,
    LICENSE_STATUS_LABELS,
    LICENSE_STATUS_COLORS,
    LICENSE_CHECK_RESULT_LABELS,
} from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useLicenses, useDeleteLicense } from '@/lib/hooks/use-licenses';
import { useClients } from '@/lib/hooks/use-clients';
import { useProfiles } from '@/lib/hooks/use-profiles';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import ViewModeToggle from '@/components/ui/view-mode-toggle';
import LicenseFormModal from '@/components/licenses/license-form-modal';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import { canManageLicenses } from '@/lib/rbac';

const DAY_MS = 24 * 60 * 60 * 1000;

type FilterTab = 'all' | 'critical' | 'expiring' | 'registry' | 'alcohol' | 'transport';

type NextAction = {
    label: string;
    date?: string;
    daysLeft?: number;
};

const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Усі ліцензії' },
    { key: 'critical', label: 'Критичні' },
    { key: 'expiring', label: 'До завершення дії' },
    { key: 'registry', label: 'Потрібна звірка' },
    { key: 'alcohol', label: 'Алкоголь' },
    { key: 'transport', label: 'Перевезення' },
];

function daysUntil(date?: string): number | undefined {
    if (!date) return undefined;

    const now = new Date();
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const target = new Date(date);
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());

    return Math.floor((targetStart.getTime() - nowStart.getTime()) / DAY_MS);
}

function getActionCandidates(license: License): NextAction[] {
    const actions: NextAction[] = [];

    if (license.valid_to) {
        actions.push({
            label: 'Строк дії',
            date: license.valid_to,
            daysLeft: daysUntil(license.valid_to),
        });
    }

    if (license.payment_frequency !== 'none' && license.next_payment_due) {
        actions.push({
            label: 'Платіж',
            date: license.next_payment_due,
            daysLeft: daysUntil(license.next_payment_due),
        });
    }

    if (license.next_check_due) {
        actions.push({
            label: 'Звірка реєстру',
            date: license.next_check_due,
            daysLeft: daysUntil(license.next_check_due),
        });
    }

    return actions.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

function getNextAction(license: License): NextAction {
    const actions = getActionCandidates(license);
    if (actions.length === 0) {
        return { label: 'Без запланованих подій' };
    }
    return actions[0];
}

function getIsExpiredByDate(license: License): boolean {
    const validDaysLeft = daysUntil(license.valid_to);
    return validDaysLeft !== undefined && validDaysLeft < 0;
}

function getAttentionLevel(license: License): 'critical' | 'warning' | 'normal' {
    const actionCandidates = getActionCandidates(license);
    const hasOverdueAction = actionCandidates.some(a => (a.daysLeft ?? 1) < 0);
    const hasWarningAction = actionCandidates.some(a => (a.daysLeft ?? 999) >= 0 && (a.daysLeft ?? 999) <= 30);

    if (
        license.status === 'expired' ||
        license.status === 'revoked' ||
        license.status === 'suspended' ||
        getIsExpiredByDate(license) ||
        license.last_check_result === 'mismatch' ||
        hasOverdueAction
    ) {
        return 'critical';
    }

    if (
        license.status === 'expiring' ||
        license.last_check_result === 'warning' ||
        hasWarningAction
    ) {
        return 'warning';
    }

    return 'normal';
}

function formatDeadline(daysLeft?: number): string {
    if (daysLeft === undefined) return '—';
    if (daysLeft < 0) return `Прострочено ${Math.abs(daysLeft)} дн`;
    if (daysLeft === 0) return 'Сьогодні';
    if (daysLeft <= 7) return `${daysLeft} дн`;
    return `через ${daysLeft} дн`;
}

function getTaskPriority(license: License): TaskPriority {
    const level = getAttentionLevel(license);
    if (level === 'critical') return 1;
    if (level === 'warning') return 2;
    return 3;
}

function LicenseCard({
    license,
    onEdit,
    onDelete,
    onCreateTask,
}: {
    license: License;
    onEdit: (license: License) => void;
    onDelete: (licenseId: string) => void;
    onCreateTask: (license: License) => void;
}) {
    const level = getAttentionLevel(license);
    const nextAction = getNextAction(license);

    return (
        <div className="card p-5 group hover:translate-y-[-2px] transition-all duration-200 relative">
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => onEdit(license)}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-100 hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                    title="Редагувати"
                >
                    <Pencil size={13} />
                </button>
                <button
                    onClick={() => onDelete(license.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-100 hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                    title="Видалити"
                >
                    <Trash2 size={13} />
                </button>
            </div>

            <div className="flex items-start gap-3 mb-4">
                <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0',
                    level === 'critical' ? 'bg-red-100 text-red-700'
                        : level === 'warning' ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                )}>
                    {license.client ? getInitials(getClientDisplayName(license.client)) : 'CL'}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary truncate">
                        {license.client ? getClientDisplayName(license.client) : 'Клієнт'}
                    </h3>
                    <p className="text-xs text-text-muted truncate">{license.number}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="badge" style={{ color: LICENSE_STATUS_COLORS[license.status], backgroundColor: `${LICENSE_STATUS_COLORS[license.status]}15` }}>
                    {LICENSE_STATUS_LABELS[license.status]}
                </span>
                <span className="text-xs text-text-muted">{LICENSE_TYPE_LABELS[license.type]}</span>
            </div>

            <div className="space-y-2 text-xs mb-4">
                <div className="flex items-center justify-between">
                    <span className="text-text-muted">Наступна дія</span>
                    <span className={cn(
                        'font-semibold',
                        (nextAction.daysLeft ?? 1) < 0 ? 'text-red-600'
                            : (nextAction.daysLeft ?? 999) <= 7 ? 'text-amber-600'
                                : 'text-text-primary'
                    )}>
                        {nextAction.label}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-text-muted">Дедлайн</span>
                    <span className={cn(
                        'font-medium',
                        (nextAction.daysLeft ?? 1) < 0 ? 'text-red-600'
                            : (nextAction.daysLeft ?? 999) <= 7 ? 'text-amber-600'
                                : 'text-text-secondary'
                    )}>
                        {nextAction.date ? `${formatDate(nextAction.date)} (${formatDeadline(nextAction.daysLeft)})` : '—'}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-text-muted">Звірка</span>
                    <span className={cn(
                        'font-medium',
                        license.last_check_result === 'mismatch' ? 'text-red-600'
                            : license.last_check_result === 'warning' ? 'text-amber-600'
                                : 'text-text-secondary'
                    )}>
                        {LICENSE_CHECK_RESULT_LABELS[license.last_check_result]}
                    </span>
                </div>
            </div>

            <button
                onClick={() => onCreateTask(license)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-semibold transition-colors"
            >
                <ClipboardCheck size={15} />
                Створити задачу контролю
            </button>
        </div>
    );
}

export default function LicensesPage() {
    const { profile } = useAuth();
    if (!profile) return null;

    if (!canManageLicenses(profile)) {
        return <AccessDeniedCard message="Контроль ліцензій доступний лише адміністратору." />;
    }

    return <LicensesPageContent />;
}

function LicensesPageContent() {
    const { data: licenses } = useLicenses();
    const { data: clients } = useClients();
    const { data: profiles } = useProfiles();
    const deleteLicenseMutation = useDeleteLicense();
    const createTaskMutation = useCreateTask();

    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingLicense, setEditingLicense] = useState<License | null>(null);

    const licenseRows = useMemo(() => {
        return (licenses ?? []).map((license) => ({
            ...license,
            client: (clients ?? []).find(c => c.id === license.client_id),
            responsible: (profiles ?? []).find(p => p.id === license.responsible_id),
        }));
    }, [clients, licenses, profiles]);

    const filteredLicenses = licenseRows.filter((license) => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const displayName = license.client ? getClientDisplayName(license.client).toLowerCase() : '';
            if (
                !license.number.toLowerCase().includes(q) &&
                !license.client?.name.toLowerCase().includes(q) &&
                !displayName.includes(q) &&
                !license.issuing_authority.toLowerCase().includes(q)
            ) {
                return false;
            }
        }

        const level = getAttentionLevel(license);

        switch (activeFilter) {
            case 'critical':
                return level === 'critical';
            case 'expiring':
                return Boolean(license.valid_to) || license.status === 'expiring';
            case 'registry':
                return license.last_check_result === 'warning' || license.last_check_result === 'mismatch';
            case 'alcohol':
                return license.type === 'alcohol_retail' || license.type === 'alcohol_wholesale';
            case 'transport':
                return license.type === 'transport_passenger' || license.type === 'transport_cargo';
            default:
                return true;
        }
    });

    const dashboardMetrics = useMemo(() => {
        const all = licenseRows;

        const overdue = all.filter((license) => {
            const level = getAttentionLevel(license);
            return level === 'critical';
        }).length;

        const dueIn7 = all.filter((license) => {
            const nextAction = getNextAction(license);
            return (nextAction.daysLeft ?? 999) >= 0 && (nextAction.daysLeft ?? 999) <= 7;
        }).length;

        const dueIn30 = all.filter((license) => {
            const nextAction = getNextAction(license);
            return (nextAction.daysLeft ?? 999) > 7 && (nextAction.daysLeft ?? 999) <= 30;
        }).length;

        const needsRegistry = all.filter((license) => {
            return license.last_check_result === 'warning' || license.last_check_result === 'mismatch';
        }).length;

        return { overdue, dueIn7, dueIn30, needsRegistry };
    }, [licenseRows]);

    const handleCreate = () => {
        setEditingLicense(null);
        setIsFormOpen(true);
    };

    const handleEdit = (license: License) => {
        setEditingLicense(license);
        setIsFormOpen(true);
    };

    const handleDelete = (licenseId: string) => {
        if (confirm('Видалити цю ліцензію?')) {
            deleteLicenseMutation.mutate(licenseId);
        }
    };

    const handleCreateTask = (license: License) => {
        const nextAction = getNextAction(license);

        const dueDate = nextAction.date || license.next_check_due || license.next_payment_due || license.valid_to || license.updated_at;
        const priority = getTaskPriority(license);

        createTaskMutation.mutateAsync({
            title: `Контроль ліцензії: ${LICENSE_TYPE_LABELS[license.type]}`,
            description: [
                `Клієнт: ${license.client ? getClientDisplayName(license.client) : '—'}`,
                `Номер: ${license.number}`,
                `Орган: ${license.issuing_authority}`,
                `Наступна дія: ${nextAction.label}`,
                nextAction.date ? `Термін: ${formatDate(nextAction.date)}` : undefined,
            ].filter(Boolean).join('\n'),
            client_id: license.client_id,
            assignee_id: license.responsible_id,
            type: 'license',
            status: 'todo',
            due_date: dueDate,
            priority,
            recurrence: 'none',
            period: undefined,
            proof_required: true,
            subtasks: [],
        });

        alert('Завдання контролю створено у розділі "Завдання".');
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-text-primary">Контроль ліцензій</h1>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Пошук за клієнтом, номером або органом..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 w-80 transition-all"
                        />
                    </div>
                </div>

                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                >
                    <Plus size={16} />
                    Додати ліцензію
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-muted uppercase">Прострочені</span>
                        <AlertTriangle size={16} className="text-red-500" />
                    </div>
                    <div className="text-2xl font-bold text-red-600">{dashboardMetrics.overdue}</div>
                    <div className="text-xs text-text-muted mt-1">Критичні ліцензії</div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-muted uppercase">До 7 днів</span>
                        <CalendarClock size={16} className="text-amber-500" />
                    </div>
                    <div className="text-2xl font-bold text-amber-600">{dashboardMetrics.dueIn7}</div>
                    <div className="text-xs text-text-muted mt-1">Термінові контрольні події</div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-muted uppercase">До 30 днів</span>
                        <ShieldCheck size={16} className="text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{dashboardMetrics.dueIn30}</div>
                    <div className="text-xs text-text-muted mt-1">Запланувати завчасно</div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-muted uppercase">Потрібна звірка</span>
                        <FileSearch size={16} className="text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-purple-600">{dashboardMetrics.needsRegistry}</div>
                    <div className="text-xs text-text-muted mt-1">Є зауваження в реєстрі</div>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
                <div className="h-6 w-px bg-surface-200 mx-1" />
                <div className="flex items-center gap-2 flex-wrap">
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            className={cn('filter-pill', activeFilter === tab.key && 'active')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {viewMode === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredLicenses.map((license) => (
                        <LicenseCard
                            key={license.id}
                            license={license}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onCreateTask={handleCreateTask}
                        />
                    ))}
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-surface-200 bg-surface-50">
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Клієнт</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Тип</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Статус</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Наступна дія</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Відповідальний</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Звірка</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Дії</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLicenses.map((license) => {
                                const nextAction = getNextAction(license);

                                return (
                                    <tr key={license.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-text-primary">
                                                {license.client ? getClientDisplayName(license.client) : 'Клієнт'}
                                            </div>
                                            <div className="text-xs text-text-muted">{license.number}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-secondary">
                                            {LICENSE_TYPE_LABELS[license.type as LicenseType]}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="badge" style={{ color: LICENSE_STATUS_COLORS[license.status], backgroundColor: `${LICENSE_STATUS_COLORS[license.status]}15` }}>
                                                {LICENSE_STATUS_LABELS[license.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm text-text-primary">{nextAction.label}</div>
                                            <div className={cn(
                                                'text-xs',
                                                (nextAction.daysLeft ?? 1) < 0 ? 'text-red-600'
                                                    : (nextAction.daysLeft ?? 999) <= 7 ? 'text-amber-600'
                                                        : 'text-text-muted'
                                            )}>
                                                {nextAction.date ? `${formatDate(nextAction.date)} · ${formatDeadline(nextAction.daysLeft)}` : '—'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-secondary">
                                            {license.responsible?.full_name || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={cn(
                                                license.last_check_result === 'mismatch' ? 'text-red-600 font-medium'
                                                    : license.last_check_result === 'warning' ? 'text-amber-600 font-medium'
                                                        : 'text-text-secondary'
                                            )}>
                                                {LICENSE_CHECK_RESULT_LABELS[license.last_check_result]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleCreateTask(license)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                                                    title="Створити задачу контролю"
                                                >
                                                    <ClipboardCheck size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(license)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                                                    title="Редагувати"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(license.id)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                                                    title="Видалити"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {filteredLicenses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <ShieldCheck size={48} className="mb-3 opacity-40" />
                    <p className="text-lg font-medium">Ліцензії не знайдено</p>
                    <p className="text-sm mt-1">Спробуйте змінити фільтри або пошуковий запит</p>
                </div>
            )}

            {isFormOpen && (
                <LicenseFormModal
                    key={editingLicense?.id || 'new-license'}
                    isOpen={isFormOpen}
                    onClose={() => {
                        setIsFormOpen(false);
                        setEditingLicense(null);
                    }}
                    editLicense={editingLicense}
                />
            )}
        </div>
    );
}
