'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    ShieldCheck,
    FileSearch,
    Users,
    ClipboardList,
    Building2,
    Clock3,
    FileText,
    History,
    CheckCircle2,
    Wallet,
} from 'lucide-react';
import {
    License,
    TASK_STATUS_LABELS,
    TASK_TYPE_LABELS,
    TASK_TYPE_COLORS,
    LICENSE_TYPE_LABELS,
    LICENSE_STATUS_LABELS,
    LICENSE_STATUS_COLORS,
    LICENSE_CHECK_RESULT_LABELS,
    CLIENT_TYPE_LABELS,
    CLIENT_TAX_ID_TYPE_LABELS,
    INVOICE_STATUS_LABELS,
    INVOICE_STATUS_COLORS,
    PAYMENT_STATUS_LABELS,
    PAYMENT_METHOD_LABELS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn, formatDate, getInitials, isOverdue, formatMoneyUAH } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import {
    calculateClientBillingSnapshot,
    formatMinorMoneyUAH,
    getInvoiceOutstandingMinor,
    normalizeInvoiceStatus,
} from '@/lib/billing';
import {
    getIncomeLimitControlMessage,
    isSingleTaxSystem,
    isVatPayerByTaxSystem,
    getTaxComplianceNotes,
    getTaxSystemLabel,
} from '@/lib/tax';
import TaskFormModal from '@/components/tasks/task-form-modal';
import LicenseFormModal from '@/components/licenses/license-form-modal';
import {
    canCreateTask,
    canManageLicenses,
    canViewClient,
    getVisibleTasksForUser,
    isAccountant,
} from '@/lib/rbac';

type TabKey = 'overview' | 'licenses' | 'billing' | 'tasks' | 'documents' | 'history';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(date?: string): number | undefined {
    if (!date) return undefined;

    const now = new Date();
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const target = new Date(date);
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());

    return Math.floor((targetStart.getTime() - nowStart.getTime()) / DAY_MS);
}

function getNextLicenseAction(license: License) {
    const candidates: { label: string; date?: string; daysLeft?: number }[] = [];

    if (license.valid_to) {
        candidates.push({
            label: 'Строк дії',
            date: license.valid_to,
            daysLeft: daysUntil(license.valid_to),
        });
    }

    if (license.payment_frequency !== 'none' && license.next_payment_due) {
        candidates.push({
            label: 'Платіж',
            date: license.next_payment_due,
            daysLeft: daysUntil(license.next_payment_due),
        });
    }

    if (license.next_check_due) {
        candidates.push({
            label: 'Звірка реєстру',
            date: license.next_check_due,
            daysLeft: daysUntil(license.next_check_due),
        });
    }

    if (candidates.length === 0) {
        return { label: 'Немає подій', date: undefined, daysLeft: undefined };
    }

    return candidates.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))[0];
}

function formatDaysLeft(daysLeft?: number): string {
    if (daysLeft === undefined) return '—';
    if (daysLeft < 0) return `Прострочено ${Math.abs(daysLeft)} дн`;
    if (daysLeft === 0) return 'Сьогодні';
    if (daysLeft <= 7) return `${daysLeft} дн`;
    return `через ${daysLeft} дн`;
}

export default function ClientProfilePage() {
    const { state, addTask } = useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const params = useParams<{ id: string }>();
    const clientId = Array.isArray(params.id) ? params.id[0] : params.id;

    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
    const [isLicenseFormOpen, setIsLicenseFormOpen] = useState(false);
    const canCreateTaskForUser = canCreateTask(state.currentUser);
    const canManageLicense = canManageLicenses(state.currentUser);

    const client = state.clients.find((c) => c.id === clientId);
    const backToClientsHref = useMemo(() => {
        const params = new URLSearchParams();
        const filter = searchParams.get('filter');
        const view = searchParams.get('view');
        const query = searchParams.get('q');

        if (filter) params.set('filter', filter);
        if (view) params.set('view', view);
        if (query) params.set('q', query);

        const serialized = params.toString();
        return serialized ? `/clients?${serialized}` : '/clients';
    }, [searchParams]);

    const licenses = useMemo(() => {
        if (!canManageLicense) return [];

        return state.licenses
            .filter((license) => license.client_id === clientId)
            .map((license) => ({
                ...license,
                responsible: state.profiles.find((profile) => profile.id === license.responsible_id),
            }))
            .sort((a, b) => (getNextLicenseAction(a).daysLeft ?? 9999) - (getNextLicenseAction(b).daysLeft ?? 9999));
    }, [canManageLicense, clientId, state.licenses, state.profiles]);

    const tasks = useMemo(() => {
        return getVisibleTasksForUser(state.tasks, state.currentUser)
            .filter((task) => task.client_id === clientId)
            .map((task) => ({
                ...task,
                assignee: state.profiles.find((profile) => profile.id === task.assignee_id),
            }))
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    }, [clientId, state.currentUser, state.profiles, state.tasks]);

    const clientInvoices = useMemo(() => {
        return state.invoices
            .filter((invoice) => invoice.client_id === clientId)
            .map((invoice) => normalizeInvoiceStatus({
                ...invoice,
                client: state.clients.find((item) => item.id === invoice.client_id),
            }))
            .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    }, [clientId, state.clients, state.invoices]);

    const clientPayments = useMemo(() => {
        return state.payments
            .filter((payment) => payment.client_id === clientId)
            .map((payment) => ({
                ...payment,
                client: state.clients.find((item) => item.id === payment.client_id),
            }))
            .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
    }, [clientId, state.clients, state.payments]);

    const billingSnapshot = useMemo(
        () => calculateClientBillingSnapshot(clientId, clientInvoices, clientPayments),
        [clientId, clientInvoices, clientPayments]
    );

    const activeTasks = tasks.filter((task) => task.status !== 'done');
    const completedTasks = tasks.filter((task) => task.status === 'done');
    const overdueTasks = activeTasks.filter((task) => isOverdue(task.due_date));

    const criticalLicenses = licenses.filter((license) => {
        const nextAction = getNextLicenseAction(license);
        return (
            license.status === 'expired' ||
            license.status === 'revoked' ||
            license.status === 'suspended' ||
            license.last_check_result === 'mismatch' ||
            (nextAction.daysLeft ?? 1) < 0
        );
    });

    const documents = tasks.flatMap((task) =>
        (task.files || []).map((file) => ({
            ...file,
            taskTitle: task.title,
            taskId: task.id,
        }))
    );

    const historyEvents = useMemo(() => {
        if (!client) return [] as { id: string; title: string; details?: string; created_at: string; tone?: 'normal' | 'warning' }[];

        const taskIds = new Set(tasks.map((task) => task.id));

        const activityEvents = state.activityLog
            .filter((entry) => taskIds.has(entry.task_id))
            .map((entry) => ({
                id: `act-${entry.id}`,
                title: entry.action,
                details: entry.details,
                created_at: entry.created_at,
                tone: 'normal' as const,
            }));

        const licenseEvents = licenses.flatMap((license) => {
            const created = {
                id: `lic-created-${license.id}`,
                title: `Додано ліцензію ${license.number}`,
                details: LICENSE_TYPE_LABELS[license.type],
                created_at: license.created_at,
                tone: license.status === 'expired' || license.last_check_result === 'mismatch' ? 'warning' as const : 'normal' as const,
            };

            const updated = {
                id: `lic-updated-${license.id}`,
                title: `Оновлено ліцензію ${license.number}`,
                details: `Статус: ${LICENSE_STATUS_LABELS[license.status]}`,
                created_at: license.updated_at,
                tone: license.status === 'expired' || license.last_check_result === 'mismatch' ? 'warning' as const : 'normal' as const,
            };

            return [created, updated];
        });

        const clientEvent = {
            id: `client-created-${client.id}`,
            title: `Створено клієнта ${getClientDisplayName(client)}`,
            details: `Тип: ${CLIENT_TYPE_LABELS[client.type]}`,
            created_at: client.created_at,
            tone: 'normal' as const,
        };

        return [clientEvent, ...activityEvents, ...licenseEvents]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [client, licenses, state.activityLog, tasks]);

    const defaultAssigneeId = isAccountant(state.currentUser)
        ? state.currentUser.id
        : client?.accountants?.[0]?.id
        || state.profiles.find((profile) => profile.role === 'accountant' && profile.is_active)?.id;

    const handlePlanRegistryCheck = () => {
        if (!canManageLicense) return;
        if (!client) return;

        if (!defaultAssigneeId) {
            alert('Немає доступного відповідального бухгалтера для задачі звірки.');
            return;
        }

        const targetLicense = [...licenses].sort((a, b) => {
            const aDays = daysUntil(a.next_check_due) ?? 9999;
            const bDays = daysUntil(b.next_check_due) ?? 9999;
            return aDays - bDays;
        })[0];

        const dueDate = targetLicense?.next_check_due || (() => {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() + 7);
            return fallback.toISOString();
        })();

        addTask({
            title: `Звірка ліцензійного реєстру: ${getClientDisplayName(client)}`,
            description: [
                `Клієнт: ${getClientDisplayName(client)}`,
                targetLicense ? `Ліцензія: ${targetLicense.number} (${LICENSE_TYPE_LABELS[targetLicense.type]})` : undefined,
                'Перевірити дані в державному реєстрі та зафіксувати результат.',
            ].filter(Boolean).join('\n'),
            client_id: client.id,
            assignee_id: defaultAssigneeId,
            type: 'license',
            status: 'todo',
            due_date: dueDate,
            priority: 1,
            recurrence: 'none',
            period: undefined,
            recurrence_days: undefined,
            proof_required: true,
            subtasks: [],
            comments: [],
            files: [],
        });

        alert('Задачу звірки створено у розділі "Завдання".');
    };

    if (!client) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Клієнта не знайдено</h1>
                    <p className="text-sm text-text-muted mb-5">
                        Можливо, запис було видалено або архівовано.
                    </p>
                    <button
                        onClick={() => router.push(backToClientsHref)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Повернутись до клієнтів
                    </button>
                </div>
            </div>
        );
    }

    if (!canViewClient(state.currentUser, client)) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Немає доступу</h1>
                    <p className="text-sm text-text-muted mb-5">
                        Ви не можете переглядати цього клієнта.
                    </p>
                    <button
                        onClick={() => router.push(backToClientsHref)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Повернутись до клієнтів
                    </button>
                </div>
            </div>
        );
    }

    const taxComplianceNotes = getTaxComplianceNotes(client, state.taxRulebook);
    const incomeLimitMessage = getIncomeLimitControlMessage(client);
    const isIncomeLimitNotApplicable = !client.income_limit && (!client.tax_system || !isSingleTaxSystem(client.tax_system));
    const isVatPayer = isVatPayerByTaxSystem(client.tax_system);
    const clientDisplayName = getClientDisplayName(client);

    const tabs: { key: TabKey; label: string; count?: number }[] = [
        { key: 'overview', label: 'Огляд' },
        ...(canManageLicense ? [{ key: 'licenses' as TabKey, label: 'Ліцензії', count: licenses.length }] : []),
        { key: 'billing', label: 'Оплати', count: billingSnapshot.open_invoices },
        { key: 'tasks', label: 'Завдання', count: activeTasks.length },
        { key: 'documents', label: 'Документи', count: documents.length },
        { key: 'history', label: 'Історія', count: historyEvents.length },
    ];

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="min-w-0">
                    <button
                        onClick={() => router.push(backToClientsHref)}
                        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-2"
                    >
                        <ArrowLeft size={14} />
                        До списку клієнтів
                    </button>
                    <h1 className="text-2xl font-bold text-text-primary truncate">{clientDisplayName}</h1>
                    <p className="text-sm text-text-muted mt-1">
                        {CLIENT_TYPE_LABELS[client.type]} • {CLIENT_TAX_ID_TYPE_LABELS[client.tax_id_type]}: {client.tax_id}
                    </p>
                    {client.industry && (
                        <p className="text-sm text-text-muted mt-1">
                            {client.industry}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {canCreateTaskForUser && (
                        <button
                            onClick={() => setIsTaskFormOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
                        >
                            <Plus size={15} />
                            Нове завдання
                        </button>
                    )}
                    {canManageLicense && (
                        <button
                            onClick={() => setIsLicenseFormOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold transition-colors"
                        >
                            <ShieldCheck size={15} />
                            Додати ліцензію
                        </button>
                    )}
                    {canManageLicense && (
                        <button
                            onClick={handlePlanRegistryCheck}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-semibold transition-colors"
                        >
                            <FileSearch size={15} />
                            Запланувати звірку
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 mb-6 flex-wrap">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn('filter-pill', activeTab === tab.key && 'active')}
                    >
                        {tab.label}
                        {typeof tab.count === 'number' && (
                            <span className={cn(
                                'text-[11px] px-1.5 py-0.5 rounded-full font-semibold',
                                activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-surface-100 text-text-muted'
                            )}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <div className={cn(
                        'rounded-xl border px-4 py-3 text-sm',
                        client.income_limit
                            ? 'border-brand-200 bg-brand-50/50 text-brand-700'
                            : isIncomeLimitNotApplicable
                                ? 'border-surface-200 bg-surface-50 text-text-secondary'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                    )}>
                        {incomeLimitMessage}
                    </div>

                    {taxComplianceNotes.length > 0 && (
                        <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Контрольні умови
                            </p>
                            <div className="space-y-1.5">
                                {taxComplianceNotes.slice(0, 2).map((note) => (
                                    <p key={note} className="text-sm text-text-secondary">{note}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="stat-card">
                            <div className="stat-value text-brand-600">{licenses.length}</div>
                            <div className="stat-label">Усі ліцензії</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value text-red-600">{criticalLicenses.length}</div>
                            <div className="stat-label">Критичні ліцензії</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value text-status-progress">{activeTasks.length}</div>
                            <div className="stat-label">Активні задачі</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value text-status-overdue">{overdueTasks.length}</div>
                            <div className="stat-label">Прострочені задачі</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value text-status-clarification">{billingSnapshot.open_invoices}</div>
                            <div className="stat-label">Рахунки до оплати</div>
                        </div>
                        <div className="stat-card">
                            <div className={cn(
                                'stat-value',
                                billingSnapshot.overdue_minor > 0 ? 'text-status-overdue' : 'text-status-done'
                            )}>
                                {formatMinorMoneyUAH(
                                    billingSnapshot.overdue_minor > 0
                                        ? billingSnapshot.overdue_minor
                                        : billingSnapshot.outstanding_minor
                                )}
                            </div>
                            <div className="stat-label">
                                {billingSnapshot.overdue_minor > 0 ? 'Прострочений борг' : 'Поточна дебіторка'}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <div className="card p-5">
                            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Building2 size={15} className="text-brand-600" />
                                Реквізити
                            </h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">Статус</span>
                                    <span className="font-medium text-text-primary">
                                        {client.status === 'active' ? 'Активний' : client.status === 'onboarding' ? 'Онбординг' : 'Архів'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">ПДВ</span>
                                    <span className={cn('font-medium', isVatPayer ? 'text-status-done' : 'text-text-muted')}>
                                        {isVatPayer ? 'Платник' : 'Без ПДВ'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">Ліміт доходу</span>
                                    <span className={cn(
                                        'font-medium',
                                        client.income_limit ? 'text-brand-700' : 'text-text-muted'
                                    )}>
                                        {client.income_limit ? formatMoneyUAH(client.income_limit) : 'Немає'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">Система</span>
                                    <span className="font-medium text-text-primary">{getTaxSystemLabel(client.tax_system)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">Телефон</span>
                                    <span className="font-medium text-text-primary">{client.contact_phone || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-text-muted">Email</span>
                                    <span className="font-medium text-text-primary">{client.contact_email || '—'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="card p-5">
                            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Users size={15} className="text-brand-600" />
                                Відповідальні
                            </h2>
                            {client.accountants && client.accountants.length > 0 ? (
                                <div className="space-y-2">
                                    {client.accountants.map((accountant) => (
                                        <div key={accountant.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-50 border border-surface-200">
                                            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                                                {getInitials(accountant.full_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-text-primary truncate">{accountant.full_name}</p>
                                                <p className="text-xs text-text-muted truncate">{accountant.phone}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">Відповідальних не призначено.</p>
                            )}
                        </div>

                        <div className="card p-5">
                            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Clock3 size={15} className="text-amber-600" />
                                Найближчі події
                            </h2>
                            {licenses.length > 0 ? (
                                <div className="space-y-2">
                                    {licenses.slice(0, 4).map((license) => {
                                        const action = getNextLicenseAction(license);
                                        return (
                                            <div key={license.id} className="p-2.5 rounded-lg bg-surface-50 border border-surface-200 text-xs">
                                                <p className="font-semibold text-text-primary truncate">{LICENSE_TYPE_LABELS[license.type]}</p>
                                                <p className="text-text-muted truncate">{license.number}</p>
                                                <p className={cn(
                                                    'mt-1 font-medium',
                                                    (action.daysLeft ?? 1) < 0 ? 'text-red-600' : (action.daysLeft ?? 999) <= 7 ? 'text-amber-600' : 'text-text-secondary'
                                                )}>
                                                    {action.label}{action.date ? ` • ${formatDate(action.date)} (${formatDaysLeft(action.daysLeft)})` : ''}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">Ліцензій поки немає.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'licenses' && canManageLicense && (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-surface-200 bg-surface-50">
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Тип</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Номер</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Статус</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Наступна дія</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Відповідальний</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Звірка</th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map((license) => {
                                const action = getNextLicenseAction(license);

                                return (
                                    <tr key={license.id} className="border-b border-surface-100 hover:bg-surface-50">
                                        <td className="px-4 py-3 text-sm text-text-primary">{LICENSE_TYPE_LABELS[license.type]}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm text-text-primary">{license.number}</div>
                                            <div className="text-xs text-text-muted">{license.issuing_authority}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="badge" style={{ color: LICENSE_STATUS_COLORS[license.status], backgroundColor: `${LICENSE_STATUS_COLORS[license.status]}15` }}>
                                                {LICENSE_STATUS_LABELS[license.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div className="text-text-primary font-medium">{action.label}</div>
                                            <div className={cn(
                                                (action.daysLeft ?? 1) < 0 ? 'text-red-600'
                                                    : (action.daysLeft ?? 999) <= 7 ? 'text-amber-600'
                                                        : 'text-text-muted'
                                            )}>
                                                {action.date ? `${formatDate(action.date)} • ${formatDaysLeft(action.daysLeft)}` : '—'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-secondary">{license.responsible?.full_name || '—'}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={cn(
                                                license.last_check_result === 'mismatch' ? 'text-red-600 font-medium'
                                                    : license.last_check_result === 'warning' ? 'text-amber-600 font-medium'
                                                        : 'text-text-secondary'
                                            )}>
                                                {LICENSE_CHECK_RESULT_LABELS[license.last_check_result]}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {licenses.length === 0 && (
                        <div className="p-6 text-center text-sm text-text-muted">
                            По цьому клієнту ще немає ліцензій.
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'billing' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="card p-4">
                            <div className="text-xs text-text-muted font-medium">Поточна дебіторка</div>
                            <div className="text-2xl font-bold text-text-primary mt-1">
                                {formatMinorMoneyUAH(billingSnapshot.outstanding_minor)}
                            </div>
                        </div>
                        <div className="card p-4">
                            <div className="text-xs text-text-muted font-medium">Прострочений борг</div>
                            <div className={cn(
                                'text-2xl font-bold mt-1',
                                billingSnapshot.overdue_minor > 0 ? 'text-red-600' : 'text-status-done'
                            )}>
                                {formatMinorMoneyUAH(billingSnapshot.overdue_minor)}
                            </div>
                        </div>
                        <div className="card p-4">
                            <div className="text-xs text-text-muted font-medium">Надходження за місяць</div>
                            <div className="text-2xl font-bold text-status-done mt-1">
                                {formatMinorMoneyUAH(billingSnapshot.paid_this_month_minor)}
                            </div>
                        </div>
                    </div>

                    <div className="card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-surface-200 bg-surface-50">
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Рахунок</th>
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Період</th>
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Дедлайн</th>
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Сума</th>
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Залишок</th>
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientInvoices.map((invoice) => {
                                    const statusColor = INVOICE_STATUS_COLORS[invoice.status];
                                    const outstanding = getInvoiceOutstandingMinor(invoice);

                                    return (
                                        <tr key={invoice.id} className="border-b border-surface-100 hover:bg-surface-50">
                                            <td className="px-4 py-3 text-sm font-medium text-text-primary">{invoice.id}</td>
                                            <td className="px-4 py-3 text-sm text-text-secondary">{invoice.period}</td>
                                            <td className={cn(
                                                'px-4 py-3 text-sm',
                                                invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-text-secondary'
                                            )}>
                                                {formatDate(invoice.due_date)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-text-primary">{formatMinorMoneyUAH(invoice.amount_due_minor)}</td>
                                            <td className={cn(
                                                'px-4 py-3 text-sm font-medium',
                                                invoice.status === 'overdue' ? 'text-red-600' : 'text-text-primary'
                                            )}>
                                                {formatMinorMoneyUAH(outstanding)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className="badge"
                                                    style={{ color: statusColor, backgroundColor: `${statusColor}15` }}
                                                >
                                                    {INVOICE_STATUS_LABELS[invoice.status]}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {clientInvoices.length === 0 && (
                            <div className="p-6 text-center text-sm text-text-muted">
                                Рахунків поки немає.
                            </div>
                        )}
                    </div>

                    <div className="card p-5">
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Wallet size={15} className="text-brand-600" />
                            Останні оплати
                        </h2>

                        {clientPayments.length > 0 ? (
                            <div className="space-y-2">
                                {clientPayments.slice(0, 10).map((payment) => (
                                    <div key={payment.id} className="p-3 rounded-lg border border-surface-200 bg-white flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-text-primary">{formatMinorMoneyUAH(payment.amount_minor)}</p>
                                            <p className="text-xs text-text-muted">
                                                {formatDate(payment.paid_at)} • {PAYMENT_METHOD_LABELS[payment.method]}
                                            </p>
                                        </div>
                                        <span className={cn(
                                            'text-xs font-semibold',
                                            payment.status === 'received' ? 'text-status-done'
                                                : payment.status === 'pending' ? 'text-status-clarification'
                                                    : 'text-status-overdue'
                                        )}>
                                            {PAYMENT_STATUS_LABELS[payment.status]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Оплат поки немає.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'tasks' && (
                <div className="space-y-5">
                    <div className="card p-5">
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                            <ClipboardList size={15} className="text-brand-600" />
                            Активні задачі ({activeTasks.length})
                        </h2>

                        {activeTasks.length > 0 ? (
                            <div className="space-y-2">
                                {activeTasks.map((task) => (
                                    <div key={task.id} className="p-3 rounded-lg border border-surface-200 bg-white flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs font-semibold" style={{ color: TASK_TYPE_COLORS[task.type] }}>
                                                    {task.id} • {TASK_TYPE_LABELS[task.type]}
                                                </span>
                                                <span className={cn('badge', `badge-${task.status}`)}>{TASK_STATUS_LABELS[task.status]}</span>
                                            </div>
                                            <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                                            <p className="text-xs text-text-muted mt-0.5">Виконавець: {task.assignee?.full_name || '—'}</p>
                                        </div>
                                        <div className={cn(
                                            'text-xs font-medium whitespace-nowrap',
                                            isOverdue(task.due_date) ? 'text-red-600' : 'text-text-muted'
                                        )}>
                                            {formatDate(task.due_date)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Активних задач немає.</p>
                        )}
                    </div>

                    <div className="card p-5">
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                            <CheckCircle2 size={15} className="text-status-done" />
                            Завершені задачі ({completedTasks.length})
                        </h2>

                        {completedTasks.length > 0 ? (
                            <div className="space-y-2">
                                {completedTasks.slice(0, 10).map((task) => (
                                    <div key={task.id} className="p-3 rounded-lg border border-surface-200 bg-surface-50">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                                                <p className="text-xs text-text-muted">{task.id} • {TASK_TYPE_LABELS[task.type]}</p>
                                            </div>
                                            <span className="text-xs text-text-muted whitespace-nowrap">{formatDate(task.updated_at)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Завершених задач ще немає.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'documents' && (
                <div className="card p-5">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                        <FileText size={15} className="text-brand-600" />
                        Документи клієнта
                    </h2>

                    {documents.length > 0 ? (
                        <div className="space-y-2">
                            {documents.map((doc) => (
                                <div key={doc.id} className="p-3 rounded-lg border border-surface-200 bg-white flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-text-primary truncate">{doc.file_name}</p>
                                        <p className="text-xs text-text-muted truncate">{doc.taskId} • {doc.taskTitle}</p>
                                    </div>
                                    <span className="text-xs text-text-muted whitespace-nowrap">{formatDate(doc.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 text-center text-sm text-text-muted">
                            Документів ще немає. Після завантаження у завданнях вони з&apos;являться тут.
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="card p-5">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
                        <History size={15} className="text-brand-600" />
                        Історія змін
                    </h2>

                    {historyEvents.length > 0 ? (
                        <div className="space-y-3">
                            {historyEvents.map((event) => (
                                <div key={event.id} className="activity-item">
                                    <div className={cn(
                                        'w-3 h-3 rounded-full mt-1 flex-shrink-0',
                                        event.tone === 'warning' ? 'bg-red-400' : 'bg-surface-300'
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-text-primary truncate">{event.title}</span>
                                            <span className="text-xs text-text-muted whitespace-nowrap">{formatDate(event.created_at)}</span>
                                        </div>
                                        {event.details && (
                                            <p className="text-xs text-text-muted mt-0.5">{event.details}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-text-muted">Історія поки порожня.</p>
                    )}
                </div>
            )}

            {isTaskFormOpen && canCreateTaskForUser && (
                <TaskFormModal
                    isOpen={isTaskFormOpen}
                    onClose={() => setIsTaskFormOpen(false)}
                    defaultClientId={client.id}
                />
            )}

            {isLicenseFormOpen && canManageLicense && (
                <LicenseFormModal
                    isOpen={isLicenseFormOpen}
                    onClose={() => setIsLicenseFormOpen(false)}
                    defaultClientId={client.id}
                    defaultResponsibleId={defaultAssigneeId}
                />
            )}
        </div>
    );
}
