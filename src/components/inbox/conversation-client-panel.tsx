'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, CreditCard, Mail, MessageSquare, Phone, User } from 'lucide-react';
import { calculateClientBillingSnapshot, formatMinorMoneyUAH, normalizeInvoiceStatus } from '@/lib/billing';
import { getClientDisplayName } from '@/lib/client-name';
import { useInvoicesByClient, usePaymentsByClient } from '@/lib/hooks/use-billing';
import type { ConversationListItem } from '@/lib/types';
import { CLIENT_TYPE_LABELS, CONVERSATION_STATUS_COLORS, CONVERSATION_STATUS_LABELS } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { getConversationChannelIdentity } from './conversation-list-item';

interface ConversationClientPanelProps {
  conversation: ConversationListItem | null;
}

const CLIENT_STATUS_LABELS = {
  active: 'Активний',
  onboarding: 'Онбординг',
  archived: 'Архів',
} as const;

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'brand';
}) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
      <p className={cn(
        'text-sm font-bold leading-tight',
        tone === 'brand' && 'text-brand-700',
        tone === 'success' && 'text-status-done',
        tone === 'danger' && 'text-status-overdue',
        tone === 'default' && 'text-text-primary'
      )}>
        {value}
      </p>
      <p className="text-[11px] text-text-muted mt-1">{label}</p>
    </div>
  );
}

export default function ConversationClientPanel({ conversation }: ConversationClientPanelProps) {
  const client = conversation?.client ?? null;
  const clientId = client?.id ?? null;

  const { data: invoices, isLoading: isInvoicesLoading } = useInvoicesByClient(clientId);
  const { data: payments, isLoading: isPaymentsLoading } = usePaymentsByClient(clientId);

  const billingSnapshot = useMemo(() => {
    if (!clientId) return null;
    const normalizedInvoices = (invoices ?? []).map((invoice) => normalizeInvoiceStatus(invoice));
    return calculateClientBillingSnapshot(clientId, normalizedInvoices, payments ?? []);
  }, [clientId, invoices, payments]);

  if (!conversation) {
    return (
      <aside className="card h-full min-h-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
          <h2 className="text-sm font-semibold text-text-primary">Клієнт</h2>
        </div>
        <div className="flex-1 p-5 text-center text-text-muted flex flex-col items-center justify-center gap-2">
          <MessageSquare size={22} className="opacity-40" />
          <p className="text-sm">Оберіть бесіду, щоб побачити KPI і швидкі дії по клієнту.</p>
        </div>
      </aside>
    );
  }

  const contactIdentity = getConversationChannelIdentity(conversation) || 'Контакт Telegram';
  const statusColor = CONVERSATION_STATUS_COLORS[conversation.status];
  const assigneeName = conversation.assigned_accountant?.full_name
    ?? conversation.client?.accountants?.[0]?.full_name;

  if (!client) {
    return (
      <aside className="card h-full min-h-0 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-surface-200 bg-surface-50">
          <p className="text-sm font-semibold text-text-primary">Клієнт не привʼязаний</p>
          <p className="text-xs text-text-muted mt-1">
            Привʼяжіть клієнта в заголовку чату, щоб бачити фінансові KPI та переходи.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Непрочитані" value={String(conversation.unread_count)} tone="brand" />
            <StatCard label="Статус чату" value={CONVERSATION_STATUS_LABELS[conversation.status]} />
          </div>

          <div className="rounded-lg border border-surface-200 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <CircleAlert size={13} />
              <span>{contactIdentity}</span>
            </div>
            {conversation.assigned_accountant && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <User size={13} />
                <span>{conversation.assigned_accountant.full_name}</span>
              </div>
            )}
            {conversation.last_message_at && (
              <p className="text-xs text-text-muted">
                Остання активність: {formatDate(conversation.last_message_at, 'relative')}
              </p>
            )}
          </div>
        </div>
      </aside>
    );
  }

  const isBillingLoading = isInvoicesLoading || isPaymentsLoading;
  const openInvoices = billingSnapshot?.open_invoices ?? 0;
  const outstandingMinor = billingSnapshot?.outstanding_minor ?? 0;
  const overdueMinor = billingSnapshot?.overdue_minor ?? 0;

  return (
    <aside className="card h-full min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-surface-200 bg-surface-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{getClientDisplayName(client)}</p>
            <p className="text-xs text-text-muted mt-1">
              {CLIENT_TYPE_LABELS[client.type]} · {CLIENT_STATUS_LABELS[client.status]}
            </p>
          </div>
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            aria-label={CONVERSATION_STATUS_LABELS[conversation.status]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Непрочитані" value={String(conversation.unread_count)} tone="brand" />
          <StatCard label="Рахунки до оплати" value={isBillingLoading ? '...' : String(openInvoices)} />
          <StatCard
            label="Дебіторка"
            value={isBillingLoading ? '...' : formatMinorMoneyUAH(outstandingMinor)}
            tone={outstandingMinor > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Прострочено"
            value={isBillingLoading ? '...' : formatMinorMoneyUAH(overdueMinor)}
            tone={overdueMinor > 0 ? 'danger' : 'default'}
          />
        </div>

        <div className="rounded-lg border border-surface-200 p-3 space-y-2">
          <p className="text-xs text-text-secondary">Канал: {contactIdentity}</p>
          {assigneeName && (
            <p className="text-xs text-text-secondary">Відповідальний: {assigneeName}</p>
          )}
          {conversation.last_message_at && (
            <p className="text-xs text-text-secondary">Остання активність: {formatDate(conversation.last_message_at, 'relative')}</p>
          )}
          {client.contact_phone && (
            <p className="text-xs text-text-secondary flex items-center gap-1.5">
              <Phone size={12} />
              {client.contact_phone}
            </p>
          )}
          {client.contact_email && (
            <p className="text-xs text-text-secondary flex items-center gap-1.5">
              <Mail size={12} />
              {client.contact_email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Дії</p>
          <Link
            href={`/clients/${client.id}`}
            className="w-full inline-flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-text-primary hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            Картка клієнта
            <ArrowUpRight size={14} />
          </Link>
          <Link
            href={`/clients/${client.id}?tab=billing`}
            className="w-full inline-flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-text-primary hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            Оплати
            <CreditCard size={14} />
          </Link>
          <Link
            href={`/clients/${client.id}?tab=tasks`}
            className="w-full inline-flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-text-primary hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            Задачі клієнта
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
