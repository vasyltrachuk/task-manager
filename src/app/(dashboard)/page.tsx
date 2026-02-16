'use client';

import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    Clock,
    TrendingUp,
    Users,
    ArrowRight,
    FileWarning,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { TASK_TYPE_LABELS, TASK_TYPE_COLORS } from '@/lib/types';
import { cn, isOverdue, formatDate, getInitials } from '@/lib/utils';
import { getClientDisplayName } from '@/lib/client-name';
import Link from 'next/link';
import { getVisibleClientsForUser, getVisibleTasksForUser, isAdmin } from '@/lib/rbac';
import { calculateBillingSnapshot, formatMinorMoneyUAH, normalizeInvoiceStatus } from '@/lib/billing';

export default function DashboardPage() {
    const { state } = useApp();
    const isAdminUser = isAdmin(state.currentUser);
    const tasks = getVisibleTasksForUser(state.tasks, state.currentUser);
    const clients = getVisibleClientsForUser(state.clients, state.currentUser);
    const visibleClientIds = new Set(clients.map((client) => client.id));
    const invoices = state.invoices
        .filter((invoice) => visibleClientIds.has(invoice.client_id))
        .map((invoice) => normalizeInvoiceStatus(invoice));
    const payments = state.payments.filter((payment) => visibleClientIds.has(payment.client_id));
    const billingSnapshot = calculateBillingSnapshot(invoices, payments);
    const licenses = isAdminUser ? state.licenses : [];
    const accountants = isAdminUser
        ? state.profiles.filter(p => p.role === 'accountant')
        : state.profiles.filter(p => p.id === state.currentUser.id && p.role === 'accountant');
    const overdueTasks = tasks.filter(t => t.status !== 'done' && isOverdue(t.due_date));
    const activeTasks = tasks.filter(t => t.status !== 'done');
    const completedTasks = tasks.filter(t => t.status === 'done');
    const reviewTasks = tasks.filter(t => t.status === 'review');
    const totalClients = clients.length;
    const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

    const daysUntil = (date?: string) => {
        if (!date) return undefined;
        const now = new Date();
        const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date);
        const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        return Math.floor((startTarget.getTime() - startNow.getTime()) / 86400000);
    };

    const criticalLicenses = licenses.filter((license) => {
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
    }).length;

    const dueSoonLicenses = licenses.filter((license) => {
        const dates = [license.valid_to, license.next_payment_due, license.next_check_due]
            .filter(Boolean)
            .map((date) => daysUntil(date))
            .filter((value): value is number => value !== undefined);
        return dates.some((value) => value >= 0 && value <= 30);
    }).length;

    const registryAttentionLicenses = licenses.filter((license) =>
        license.last_check_result === 'warning' || license.last_check_result === 'mismatch'
    ).length;

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Огляд</h1>
                    <p className="text-sm text-text-muted mt-1">Огляд поточного стану завдань та клієнтів</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-secondary">
                        <Calendar size={16} />
                        <span>{formatDate(new Date().toISOString())}</span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <div className="stat-card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <AlertTriangle size={20} className="text-status-overdue" />
                        </div>
                        <span className="text-xs font-medium text-status-overdue bg-red-50 px-2 py-0.5 rounded-full">
                            Потребує уваги
                        </span>
                    </div>
                    <div className="stat-value text-status-overdue">{overdueTasks.length}</div>
                    <div className="stat-label">Прострочених завдань</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Clock size={20} className="text-status-progress" />
                        </div>
                    </div>
                    <div className="stat-value text-status-progress">{activeTasks.length}</div>
                    <div className="stat-label">Активних завдань</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <TrendingUp size={20} className="text-status-done" />
                        </div>
                    </div>
                    <div className="stat-value text-status-done">{completionRate}%</div>
                    <div className="stat-label">Виконання цього місяця</div>
                </div>

                <div className="stat-card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <Users size={20} className="text-brand-600" />
                        </div>
                    </div>
                    <div className="stat-value text-brand-600">{totalClients}</div>
                    <div className="stat-label">Клієнтів</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Overdue Tasks */}
                <div className="lg:col-span-2 card p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                            <AlertTriangle size={18} className="text-status-overdue" />
                            Прострочені завдання
                        </h2>
                        <Link href="/tasks" className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                            Усі завдання <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {overdueTasks.length > 0 ? overdueTasks.map(task => (
                            <div key={task.id} className="flex items-center gap-4 p-4 bg-red-50/50 border border-red-100 rounded-xl">
                                <div className="flex-shrink-0">
                                    <div
                                        className="w-2 h-10 rounded-full"
                                        style={{ backgroundColor: TASK_TYPE_COLORS[task.type] }}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-semibold uppercase" style={{ color: TASK_TYPE_COLORS[task.type] }}>
                                            {task.client ? getClientDisplayName(task.client) : 'Клієнт'}
                                        </span>
                                        <span className="text-xs text-text-muted">{task.id}</span>
                                    </div>
                                    <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-status-overdue flex items-center gap-1">
                                            <Calendar size={12} />
                                            {formatDate(task.due_date)}
                                        </span>
                                        <span className="text-xs text-text-muted">{TASK_TYPE_LABELS[task.type]}</span>
                                    </div>
                                </div>
                                <div className="flex-shrink-0">
                                    {task.assignee && (
                                        <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-xs font-semibold text-text-secondary">
                                            {getInitials(task.assignee.full_name)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center py-8 text-text-muted">
                                <CheckCircle2 size={40} className="mb-2 text-status-done" />
                                <p className="text-sm">Немає прострочених завдань!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                            <Wallet size={18} className="text-brand-600" />
                            Контроль оплат
                        </h2>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-secondary">Дебіторка</span>
                                <span className="font-bold text-text-primary">{formatMinorMoneyUAH(billingSnapshot.outstanding_minor)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-secondary">Прострочено</span>
                                <span className="font-bold text-red-600">{formatMinorMoneyUAH(billingSnapshot.overdue_minor)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-secondary">Оплачено за місяць</span>
                                <span className="font-bold text-status-done">{formatMinorMoneyUAH(billingSnapshot.paid_this_month_minor)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-secondary">Рахунки до оплати</span>
                                <span className="font-bold text-amber-600">{billingSnapshot.open_invoices}</span>
                            </div>
                        </div>
                        <Link href="/billing" className="mt-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium">
                            Відкрити розділ <ArrowRight size={14} />
                        </Link>
                    </div>

                    {isAdminUser && (
                        <div className="card p-6">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                                <ShieldCheck size={18} className="text-amber-500" />
                                Контроль ліцензій
                            </h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-text-secondary">Критичні</span>
                                    <span className="font-bold text-red-600">{criticalLicenses}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-text-secondary">Події до 30 днів</span>
                                    <span className="font-bold text-amber-600">{dueSoonLicenses}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-text-secondary">Потрібна звірка</span>
                                    <span className="font-bold text-purple-600">{registryAttentionLicenses}</span>
                                </div>
                            </div>
                            <Link href="/licenses" className="mt-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium">
                                Відкрити розділ <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}

                    {/* Waiting for Review */}
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                            <FileWarning size={18} className="text-status-review" />
                            На перевірці
                        </h2>
                        <div className="space-y-3">
                            {reviewTasks.map(task => (
                                <div key={task.id} className="p-3 bg-purple-50/50 border border-purple-100 rounded-lg">
                                    <p className="text-sm font-medium text-text-primary">{task.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-text-muted">
                                            {task.client ? getClientDisplayName(task.client) : 'Клієнт'}
                                        </span>
                                        <span className="text-xs text-text-muted">•</span>
                                        <span className="text-xs text-text-muted">{task.assignee?.full_name}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {isAdminUser && (
                        <div className="card p-6">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                                <Users size={18} className="text-brand-600" />
                                Команда
                            </h2>
                            <div className="space-y-3">
                                {accountants.map(acc => {
                                    const accTasks = tasks.filter(t => t.assignee_id === acc.id && t.status !== 'done');
                                    const load = accTasks.length;
                                    const loadColor = load <= 3 ? 'text-status-done' : load <= 6 ? 'text-status-clarification' : 'text-status-overdue';
                                    return (
                                        <div key={acc.id} className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-xs font-semibold text-text-secondary">
                                                {getInitials(acc.full_name)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-text-primary truncate">{acc.full_name}</p>
                                            </div>
                                            <span className={cn('text-sm font-bold tabular-nums', loadColor)}>
                                                {load}
                                            </span>
                                            <span className="text-xs text-text-muted">завдань</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
