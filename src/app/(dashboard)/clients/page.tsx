'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, Users, Pencil, Archive, ShieldCheck } from 'lucide-react';
import { Client, CLIENT_TAX_ID_TYPE_LABELS } from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn, getInitials, formatMoneyUAH } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import { getTaxSystemLabel, isSingleTaxSystem, isVatPayerByTaxSystem } from '@/lib/tax';
import { calculateClientBillingSnapshot, formatMinorMoneyUAH, normalizeInvoiceStatus } from '@/lib/billing';
import ClientFormModal from '@/components/clients/client-form-modal';
import TaskFormModal from '@/components/tasks/task-form-modal';
import ViewModeToggle from '@/components/ui/view-mode-toggle';
import { canCreateTask, canManageClients, canViewClient, getVisibleClientsForUser } from '@/lib/rbac';

type FilterTab = 'all' | 'fop' | 'llc' | 'vat' | 'onboarding';
type ClientViewMode = 'board' | 'list';

const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Усі клієнти' },
    { key: 'fop', label: 'ФОП на ЄП' },
    { key: 'llc', label: 'ТОВ' },
    { key: 'vat', label: 'Платники ПДВ' },
    { key: 'onboarding', label: '● Онбординг' },
];

type ClientLicenseStats = {
    total: number;
    critical: number;
};

type ClientBillingStats = {
    outstanding_minor: number;
    overdue_minor: number;
    open_invoices: number;
    overdue_invoices: number;
    paid_this_month_minor: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENTS_SCROLL_Y_SESSION_KEY = 'clients:list:scroll-y';

function daysUntil(date?: string): number | undefined {
    if (!date) return undefined;
    const now = new Date();
    const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date);
    const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    return Math.floor((startTarget.getTime() - startNow.getTime()) / DAY_MS);
}

function isLicenseCritical(license: { status: string; valid_to?: string; next_payment_due?: string; last_check_result: string }) {
    const validToLeft = daysUntil(license.valid_to);
    const paymentLeft = daysUntil(license.next_payment_due);

    return (
        license.status === 'expired' ||
        license.status === 'revoked' ||
        license.status === 'suspended' ||
        (validToLeft !== undefined && validToLeft < 0) ||
        (paymentLeft !== undefined && paymentLeft < 0) ||
        license.last_check_result === 'mismatch'
    );
}

function parseFilterTab(value: string | null): FilterTab {
    return filterTabs.some((tab) => tab.key === value) ? (value as FilterTab) : 'all';
}

function parseViewMode(value: string | null): ClientViewMode {
    return value === 'list' ? 'list' : 'board';
}

function buildClientsListQuery({
    filter,
    viewMode,
    searchQuery,
}: {
    filter: FilterTab;
    viewMode: ClientViewMode;
    searchQuery: string;
}): string {
    const params = new URLSearchParams();
    const normalizedQuery = searchQuery.trim();

    if (filter !== 'all') {
        params.set('filter', filter);
    }
    if (viewMode !== 'board') {
        params.set('view', viewMode);
    }
    if (normalizedQuery) {
        params.set('q', normalizedQuery);
    }

    return params.toString();
}

function ClientCard({
    client,
    licenseStats,
    onOpen,
    onEdit,
    onArchive,
    onCreateTask,
    canQuickCreateTask,
    canManageClient,
}: {
    client: Client;
    licenseStats: ClientLicenseStats;
    onOpen: (client: Client) => void;
    onEdit: (client: Client) => void;
    onArchive: (clientId: string) => void;
    onCreateTask: (client: Client) => void;
    canQuickCreateTask: boolean;
    canManageClient: boolean;
}) {
    const displayName = getClientDisplayName(client);
    const initials = getInitials(displayName);

    const colors = [
        'bg-blue-100 text-blue-700',
        'bg-emerald-100 text-emerald-700',
        'bg-amber-100 text-amber-700',
        'bg-purple-100 text-purple-700',
        'bg-rose-100 text-rose-700',
        'bg-indigo-100 text-indigo-700',
        'bg-teal-100 text-teal-700',
    ];
    const colorIndex = displayName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    const avatarColor = colors[colorIndex];

    return (
        <div
            className="card p-6 group hover:translate-y-[-2px] transition-all duration-200 relative cursor-pointer"
            onClick={() => onOpen(client)}
        >
            {/* Action buttons (visible on hover) */}
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canQuickCreateTask && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onCreateTask(client); }}
                        className="h-7 inline-flex items-center gap-1 px-2 rounded-md bg-brand-50 hover:bg-brand-100 text-brand-700 transition-colors text-[11px] font-semibold"
                        title="+ Нове завдання"
                    >
                        <Plus size={12} />
                        <span className="hidden lg:inline">Завдання</span>
                    </button>
                )}
                {canManageClient && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(client); }}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-100 hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                        title="Редагувати"
                    >
                        <Pencil size={13} />
                    </button>
                )}
                {canManageClient && client.status !== 'archived' && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(client.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-100 hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                        title="Архівувати"
                    >
                        <Archive size={13} />
                    </button>
                )}
            </div>

            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
                <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0',
                    avatarColor
                )}>
                    {initials}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary truncate">{displayName}</h3>
                    <p className="text-xs text-text-muted">
                        {CLIENT_TAX_ID_TYPE_LABELS[client.tax_id_type]}: {client.tax_id}
                    </p>
                </div>
            </div>

            {/* Operational quick signals */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
                <span className={cn(
                    'badge',
                    licenseStats.critical > 0 ? 'badge-overdue' : 'bg-surface-100 text-text-secondary'
                )}>
                    <ShieldCheck size={12} />
                    {licenseStats.total > 0
                        ? `Ліцензії: ${licenseStats.total}${licenseStats.critical > 0 ? ` (${licenseStats.critical} крит.)` : ''}`
                        : 'Ліцензій немає'}
                </span>
                {client.status === 'onboarding' && (
                    <span className="badge badge-onboarding">
                        <span className="badge-dot bg-status-progress" />
                        Онбординг
                    </span>
                )}
            </div>

            {/* Details */}
            <div className="details space-y-3 text-xs">
                <div className="flex flex-wrap gap-x-8 gap-y-3 justify-between">
                    <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
                        <span className="text-text-muted">Система</span>
                        <span className="text-text-primary font-medium">{getTaxSystemLabel(client.tax_system)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
                        <span className="text-text-muted">ПДВ</span>
                        <span className={cn('font-medium', isVatPayerByTaxSystem(client.tax_system) ? 'text-status-done' : 'text-text-muted')}>
                            {isVatPayerByTaxSystem(client.tax_system) ? 'Платник' : 'Без ПДВ'}
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
                        <span className="text-text-muted">Ліміт доходу</span>
                        <span className={cn(
                            'font-medium',
                            client.income_limit ? 'text-brand-700' : 'text-text-muted'
                        )}>
                            {client.income_limit ? formatMoneyUAH(client.income_limit) : 'Немає'}
                        </span>
                    </div>

                </div>
                {client.accountants && client.accountants.length > 0 && (
                    <div className="workers">
                        <span className="text-text-muted flex items-center gap-1.5">
                            Бухгалтери ({client.accountants.length})
                        </span>
                        <div className="flex items-center gap-1.5">
                            {/* Stacked avatars */}
                            <div className="flex -space-x-2">
                                {client.accountants.slice(0, 4).map((acc, i) => {
                                    const accColors = [
                                        'bg-blue-100 text-blue-700 border-blue-200',
                                        'bg-emerald-100 text-emerald-700 border-emerald-200',
                                        'bg-purple-100 text-purple-700 border-purple-200',
                                        'bg-amber-100 text-amber-700 border-amber-200',
                                        'bg-rose-100 text-rose-700 border-rose-200',
                                    ];
                                    const cIdx = acc.full_name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % accColors.length;
                                    return (
                                        <div
                                            key={acc.id}
                                            title={acc.full_name}
                                            className={cn(
                                                'w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-white',
                                                accColors[cIdx]
                                            )}
                                            style={{ zIndex: 10 - i }}
                                        >
                                            {getInitials(acc.full_name)}
                                        </div>
                                    );
                                })}
                                {client.accountants.length > 4 && (
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-white bg-surface-200 text-text-secondary"
                                        style={{ zIndex: 5 }}
                                    >
                                        +{client.accountants.length - 4}
                                    </div>
                                )}
                            </div>
                            {/* Names list */}
                            <div className="flex-1 min-w-0">
                                <span className="text-text-primary font-medium truncate block">
                                    {client.accountants.length <= 2
                                        ? client.accountants.map(a => a.full_name).join(', ')
                                        : `${client.accountants[0].full_name} +${client.accountants.length - 1}`
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ClientsPageContent() {
    const { state, archiveClient } = useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeFilter, setActiveFilter] = useState<FilterTab>(() => parseFilterTab(searchParams.get('filter')));
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    const [viewMode, setViewMode] = useState<ClientViewMode>(() => parseViewMode(searchParams.get('view')));
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
    const [taskClientId, setTaskClientId] = useState<string | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const canQuickCreateTask = canCreateTask(state.currentUser);
    const canManageClient = canManageClients(state.currentUser);

    const licenseStatsByClient = useMemo<Record<string, ClientLicenseStats>>(() => {
        return state.licenses.reduce<Record<string, ClientLicenseStats>>((acc, license) => {
            const existing = acc[license.client_id] || { total: 0, critical: 0 };
            existing.total += 1;
            if (isLicenseCritical(license)) {
                existing.critical += 1;
            }
            acc[license.client_id] = existing;
            return acc;
        }, {});
    }, [state.licenses]);

    const visibleClients = useMemo(
        () => getVisibleClientsForUser(state.clients, state.currentUser),
        [state.clients, state.currentUser]
    );

    const normalizedInvoices = useMemo(
        () => state.invoices.map((invoice) => normalizeInvoiceStatus(invoice)),
        [state.invoices]
    );

    const billingStatsByClient = useMemo<Record<string, ClientBillingStats>>(() => {
        return visibleClients.reduce<Record<string, ClientBillingStats>>((acc, client) => {
            acc[client.id] = calculateClientBillingSnapshot(
                client.id,
                normalizedInvoices,
                state.payments
            );
            return acc;
        }, {});
    }, [normalizedInvoices, state.payments, visibleClients]);

    const allClients = visibleClients.filter(c => c.status !== 'archived');

    const filteredClients = allClients.filter(client => {
        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const displayName = getClientDisplayName(client).toLowerCase();
            if (
                !client.name.toLowerCase().includes(q)
                && !displayName.includes(q)
                && !client.tax_id.toLowerCase().includes(q)
            ) {
                return false;
            }
        }

        // Filter
        switch (activeFilter) {
            case 'fop':
                return client.type === 'FOP' && isSingleTaxSystem(client.tax_system);
            case 'llc':
                return client.type === 'LLC';
            case 'vat':
                return isVatPayerByTaxSystem(client.tax_system);
            case 'onboarding':
                return client.status === 'onboarding';
            default:
                return true;
        }
    });

    useEffect(() => {
        const savedScrollY = window.sessionStorage.getItem(CLIENTS_SCROLL_Y_SESSION_KEY);
        if (!savedScrollY) return;

        const scrollY = Number(savedScrollY);
        if (Number.isFinite(scrollY)) {
            requestAnimationFrame(() => {
                window.scrollTo({ top: scrollY, behavior: 'auto' });
            });
        }

        window.sessionStorage.removeItem(CLIENTS_SCROLL_Y_SESSION_KEY);
    }, []);

    const updateListRoute = (next: {
        filter?: FilterTab;
        viewMode?: ClientViewMode;
        searchQuery?: string;
    }) => {
        const query = buildClientsListQuery({
            filter: next.filter ?? activeFilter,
            viewMode: next.viewMode ?? viewMode,
            searchQuery: next.searchQuery ?? searchQuery,
        });
        router.replace(query ? `/clients?${query}` : '/clients', { scroll: false });
    };

    const handleEdit = (client: Client) => {
        if (!canManageClient) return;
        setEditingClient(client);
        setIsFormOpen(true);
    };

    const handleOpenDetails = (client: Client) => {
        if (!canViewClient(state.currentUser, client)) return;

        window.sessionStorage.setItem(CLIENTS_SCROLL_Y_SESSION_KEY, String(window.scrollY));

        const query = buildClientsListQuery({
            filter: activeFilter,
            viewMode,
            searchQuery,
        });
        router.push(query ? `/clients/${client.id}?${query}` : `/clients/${client.id}`);
    };

    const handleCreate = () => {
        if (!canManageClient) return;
        setEditingClient(null);
        setIsFormOpen(true);
    };

    const handleArchive = (clientId: string) => {
        if (!canManageClient) return;
        if (confirm('Архівувати цього клієнта?')) {
            archiveClient(clientId);
        }
    };

    const handleQuickCreateTask = (client: Client) => {
        setTaskClientId(client.id);
        setIsTaskFormOpen(true);
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-text-primary">Клієнти</h1>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Пошук за назвою, ІПН або ЄДРПОУ..."
                            value={searchQuery}
                            onChange={(e) => {
                                const nextSearchQuery = e.target.value;
                                setSearchQuery(nextSearchQuery);
                                updateListRoute({ searchQuery: nextSearchQuery });
                            }}
                            className="pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 w-72 transition-all"
                        />
                    </div>
                </div>

                {canManageClient && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCreate}
                            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                        >
                            <Plus size={16} />
                            Новий клієнт
                        </button>
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <ViewModeToggle
                    value={viewMode}
                    onChange={(nextViewMode) => {
                        setViewMode(nextViewMode);
                        updateListRoute({ viewMode: nextViewMode });
                    }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveFilter(tab.key);
                                updateListRoute({ filter: tab.key });
                            }}
                            className={cn('filter-pill', activeFilter === tab.key && 'active')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Client Grid / List */}
            {viewMode === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredClients.map((client) => (
                        <ClientCard
                            key={client.id}
                            client={client}
                            licenseStats={licenseStatsByClient[client.id] || { total: 0, critical: 0 }}
                            onOpen={handleOpenDetails}
                            onEdit={handleEdit}
                            onArchive={handleArchive}
                            onCreateTask={handleQuickCreateTask}
                            canQuickCreateTask={canQuickCreateTask}
                            canManageClient={canManageClient}
                        />
                    ))}
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-surface-200 bg-surface-50">
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Клієнт</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Система оподаткування</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Ліміт доходу</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Бухгалтери</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Ліцензії</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Оплати</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Дії</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(client => (
                                <tr
                                    key={client.id}
                                    onClick={() => handleOpenDetails(client)}
                                    className="border-b border-surface-100 hover:bg-surface-50 transition-colors cursor-pointer"
                                >
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-medium text-text-primary">{getClientDisplayName(client)}</div>
                                        <div className="text-xs text-text-muted">
                                            {CLIENT_TAX_ID_TYPE_LABELS[client.tax_id_type]}: {client.tax_id}
                                        </div>
                                        {client.status === 'onboarding' && (
                                            <div className="text-[11px] text-status-progress font-medium mt-0.5">
                                                Онбординг
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <div className="font-medium text-text-primary">
                                            {getTaxSystemLabel(client.tax_system)}
                                        </div>
                                        <div className={cn(
                                            'text-xs',
                                            isVatPayerByTaxSystem(client.tax_system) ? 'text-status-done' : 'text-text-muted'
                                        )}>
                                            {isVatPayerByTaxSystem(client.tax_system) ? 'Платник ПДВ' : 'Без ПДВ'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <span className={cn(
                                            'font-medium',
                                            client.income_limit ? 'text-brand-700' : 'text-text-muted'
                                        )}>
                                            {client.income_limit ? formatMoneyUAH(client.income_limit) : 'Немає'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {client.accountants && client.accountants.length > 0 ? (
                                            <div className="flex items-center gap-2">
                                                <div className="flex -space-x-1.5">
                                                    {client.accountants.slice(0, 3).map((acc) => (
                                                        <div
                                                            key={acc.id}
                                                            title={acc.full_name}
                                                            className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center text-[9px] font-bold text-text-secondary border-2 border-white"
                                                        >
                                                            {getInitials(acc.full_name)}
                                                        </div>
                                                    ))}
                                                    {client.accountants.length > 3 && (
                                                        <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center text-[9px] font-bold text-text-secondary border-2 border-white">
                                                            +{client.accountants.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-text-secondary truncate max-w-[120px]">
                                                    {client.accountants.length <= 2
                                                        ? client.accountants.map(a => a.full_name).join(', ')
                                                        : `${client.accountants[0].full_name} +${client.accountants.length - 1}`
                                                    }
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-text-muted">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {(licenseStatsByClient[client.id]?.total || 0) > 0 ? (
                                            <div className="text-xs">
                                                <div className="font-medium text-text-primary">
                                                    {licenseStatsByClient[client.id]?.total || 0} активних записів
                                                </div>
                                                {(licenseStatsByClient[client.id]?.critical || 0) > 0 && (
                                                    <div className="text-red-600 font-medium">
                                                        {licenseStatsByClient[client.id]?.critical || 0} критичних
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-text-muted">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {billingStatsByClient[client.id]?.outstanding_minor ? (
                                            <div className="text-xs">
                                                <div className={cn(
                                                    'font-medium',
                                                    (billingStatsByClient[client.id]?.overdue_invoices || 0) > 0
                                                        ? 'text-red-600'
                                                        : 'text-amber-700'
                                                )}>
                                                    {formatMinorMoneyUAH(billingStatsByClient[client.id]?.outstanding_minor || 0)}
                                                </div>
                                                {(billingStatsByClient[client.id]?.overdue_invoices || 0) > 0 ? (
                                                    <div className="text-red-600 font-medium">
                                                        {(billingStatsByClient[client.id]?.overdue_invoices || 0)} простроч.
                                                    </div>
                                                ) : (
                                                    <div className="text-text-muted">
                                                        До оплати: {(billingStatsByClient[client.id]?.open_invoices || 0)}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-status-done font-medium">Немає боргу</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            {canQuickCreateTask && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleQuickCreateTask(client); }}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                                                    title="+ Нове завдання"
                                                >
                                                    <Plus size={13} />
                                                </button>
                                            )}
                                            {canManageClient && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-brand-50 text-text-muted hover:text-brand-600 transition-colors"
                                                    title="Редагувати"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                            )}
                                            {canManageClient && client.status !== 'archived' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleArchive(client.id); }}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                                                    title="Архівувати"
                                                >
                                                    <Archive size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty State */}
            {filteredClients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <Users size={48} className="mb-3 opacity-40" />
                    <p className="text-lg font-medium">Клієнтів не знайдено</p>
                    <p className="text-sm mt-1">Спробуйте змінити фільтри або пошуковий запит</p>
                </div>
            )}

            {/* Client Form Modal */}
            {isFormOpen && canManageClient && (
                <ClientFormModal
                    key={editingClient?.id || 'new-client'}
                    isOpen={isFormOpen}
                    onClose={() => { setIsFormOpen(false); setEditingClient(null); }}
                    editClient={editingClient}
                />
            )}

            {isTaskFormOpen && (
                <TaskFormModal
                    key={taskClientId || 'quick-task'}
                    isOpen={isTaskFormOpen}
                    onClose={() => {
                        setIsTaskFormOpen(false);
                        setTaskClientId(null);
                    }}
                    defaultClientId={taskClientId || undefined}
                />
            )}
        </div>
    );
}

export default function ClientsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-sm text-text-muted">Завантаження клієнтів...</div>}>
            <ClientsPageContent />
        </Suspense>
    );
}
