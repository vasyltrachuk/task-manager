'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, Search, Wallet } from 'lucide-react';
import {
    Invoice,
    INVOICE_STATUS_COLORS,
    INVOICE_STATUS_LABELS,
    PAYMENT_METHOD_LABELS,
    PAYMENT_STATUS_LABELS,
} from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import { calculateBillingSnapshot, formatMinorMoneyUAH, getInvoiceOutstandingMinor, normalizeInvoiceStatus } from '@/lib/billing';
import { canAccessBilling, getVisibleClientsForUser } from '@/lib/rbac';
import { useAuth } from '@/lib/auth-context';
import { useClients } from '@/lib/hooks/use-clients';
import { useInvoices, usePayments } from '@/lib/hooks/use-billing';

type InvoiceFilter = 'all' | 'open' | 'overdue' | 'paid';

const invoiceFilters: Array<{ key: InvoiceFilter; label: string }> = [
    { key: 'all', label: 'Усі рахунки' },
    { key: 'open', label: 'До оплати' },
    { key: 'overdue', label: 'Прострочені' },
    { key: 'paid', label: 'Сплачені' },
];

function filterInvoiceByTab(invoice: Invoice, tab: InvoiceFilter): boolean {
    switch (tab) {
        case 'open':
            return invoice.status === 'sent' || invoice.status === 'partially_paid' || invoice.status === 'overdue';
        case 'overdue':
            return invoice.status === 'overdue';
        case 'paid':
            return invoice.status === 'paid';
        default:
            return true;
    }
}

export default function BillingPage() {
    const { profile } = useAuth();
    const { data: clientsData } = useClients();
    const { data: invoicesData } = useInvoices();
    const { data: paymentsData } = usePayments();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<InvoiceFilter>('all');

    if (!profile) return null;

    const visibleClients = useMemo(
        () => getVisibleClientsForUser(clientsData ?? [], profile),
        [clientsData, profile]
    );
    const visibleClientIds = useMemo(
        () => new Set(visibleClients.map((client) => client.id)),
        [visibleClients]
    );

    const invoices = useMemo(() => {
        return (invoicesData ?? [])
            .filter((invoice) => visibleClientIds.has(invoice.client_id))
            .map((invoice) => normalizeInvoiceStatus({
                ...invoice,
                client: visibleClients.find((client) => client.id === invoice.client_id),
            }))
            .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    }, [invoicesData, visibleClientIds, visibleClients]);

    const payments = useMemo(() => {
        return (paymentsData ?? [])
            .filter((payment) => visibleClientIds.has(payment.client_id))
            .map((payment) => ({
                ...payment,
                client: visibleClients.find((client) => client.id === payment.client_id),
            }))
            .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
    }, [paymentsData, visibleClientIds, visibleClients]);

    const billingSnapshot = useMemo(
        () => calculateBillingSnapshot(invoices, payments),
        [invoices, payments]
    );

    const filteredInvoices = invoices.filter((invoice) => {
        if (!filterInvoiceByTab(invoice, activeFilter)) return false;

        if (!searchQuery) return true;

        const q = searchQuery.toLowerCase();
        const clientName = invoice.client ? getClientDisplayName(invoice.client).toLowerCase() : '';

        return (
            invoice.id.toLowerCase().includes(q)
            || invoice.period.toLowerCase().includes(q)
            || clientName.includes(q)
        );
    });

    if (!canAccessBilling(profile)) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Немає доступу</h1>
                    <p className="text-sm text-text-muted">Ви не маєте прав для перегляду оплат.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Оплати клієнтів</h1>
                    <p className="text-sm text-text-muted mt-1">Контроль рахунків, заборгованості та надходжень</p>
                </div>

                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Пошук по клієнту, періоду або ID рахунку..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 w-80 transition-all"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                <div className="stat-card">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                        <Wallet size={20} className="text-brand-600" />
                    </div>
                    <div className="stat-value text-brand-600">{formatMinorMoneyUAH(billingSnapshot.outstanding_minor)}</div>
                    <div className="stat-label">Поточна дебіторка</div>
                </div>

                <div className="stat-card">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3">
                        <AlertTriangle size={20} className="text-status-overdue" />
                    </div>
                    <div className="stat-value text-status-overdue">{formatMinorMoneyUAH(billingSnapshot.overdue_minor)}</div>
                    <div className="stat-label">Прострочений борг</div>
                </div>

                <div className="stat-card">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                        <ArrowDownCircle size={20} className="text-status-done" />
                    </div>
                    <div className="stat-value text-status-done">{formatMinorMoneyUAH(billingSnapshot.paid_this_month_minor)}</div>
                    <div className="stat-label">Надходження за місяць</div>
                </div>

                <div className="stat-card">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
                        <AlertTriangle size={20} className="text-status-clarification" />
                    </div>
                    <div className="stat-value text-status-clarification">{billingSnapshot.overdue_invoices}</div>
                    <div className="stat-label">Прострочені рахунки</div>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-5 flex-wrap">
                {invoiceFilters.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveFilter(tab.key)}
                        className={cn('filter-pill', activeFilter === tab.key && 'active')}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-surface-200 bg-surface-50">
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Рахунок</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Клієнт</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Дедлайн</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Сума</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Залишок</th>
                                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map((invoice) => {
                                const outstanding = getInvoiceOutstandingMinor(invoice);
                                const statusColor = INVOICE_STATUS_COLORS[invoice.status];

                                return (
                                    <tr key={invoice.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-text-primary">{invoice.id}</div>
                                            <div className="text-xs text-text-muted">Період: {invoice.period}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-primary">
                                            {invoice.client ? getClientDisplayName(invoice.client) : 'Клієнт'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(invoice.due_date)}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-text-primary">{formatMinorMoneyUAH(invoice.amount_due_minor)}</div>
                                            <div className="text-xs text-text-muted">Оплачено: {formatMinorMoneyUAH(invoice.amount_paid_minor)}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-semibold text-text-primary">{formatMinorMoneyUAH(outstanding)}</td>
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

                    {filteredInvoices.length === 0 && (
                        <div className="p-6 text-center text-sm text-text-muted">
                            Рахунків за поточними фільтрами не знайдено.
                        </div>
                    )}
                </div>

                <div className="card p-5">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-4">
                        Останні надходження
                    </h2>

                    <div className="space-y-3">
                        {payments.slice(0, 10).map((payment) => (
                            <div key={payment.id} className="p-3 rounded-lg border border-surface-200 bg-surface-50">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-sm font-semibold text-text-primary truncate">
                                        {payment.client ? getClientDisplayName(payment.client) : 'Клієнт'}
                                    </p>
                                    <span className={cn(
                                        'text-[11px] font-semibold',
                                        payment.status === 'received' ? 'text-status-done'
                                            : payment.status === 'pending' ? 'text-status-clarification'
                                                : 'text-status-overdue'
                                    )}>
                                        {PAYMENT_STATUS_LABELS[payment.status]}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-text-primary">{formatMinorMoneyUAH(payment.amount_minor)}</p>
                                <p className="text-xs text-text-muted mt-0.5">
                                    {formatDate(payment.paid_at)} • {PAYMENT_METHOD_LABELS[payment.method]}
                                </p>
                            </div>
                        ))}

                        {payments.length === 0 && (
                            <p className="text-sm text-text-muted">Оплат поки немає.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
