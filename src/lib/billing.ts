import { Invoice, InvoiceStatus, Payment } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingSnapshot {
  outstanding_minor: number;
  overdue_minor: number;
  open_invoices: number;
  overdue_invoices: number;
  paid_this_month_minor: number;
}

export function formatMinorMoneyUAH(valueMinor?: number): string {
  if (!valueMinor || valueMinor <= 0) return '—';

  const value = valueMinor / 100;
  const formatter = new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return `${formatter.format(value)} грн`;
}

export function isInvoiceClosedStatus(status: InvoiceStatus): boolean {
  return status === 'paid' || status === 'cancelled';
}

export function isInvoiceOverdueDate(dueDate: string, now = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return dueStart.getTime() < today.getTime();
}

export function getDaysUntil(date: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date);
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((targetStart.getTime() - today.getTime()) / DAY_MS);
}

export function getInvoiceOutstandingMinor(invoice: Invoice): number {
  return Math.max(invoice.amount_due_minor - invoice.amount_paid_minor, 0);
}

export function deriveInvoiceStatus(invoice: Invoice, now = new Date()): InvoiceStatus {
  if (invoice.status === 'draft' || invoice.status === 'cancelled') {
    return invoice.status;
  }

  const due = Math.max(invoice.amount_due_minor, 0);
  const paid = Math.max(invoice.amount_paid_minor, 0);

  if (due === 0 || paid >= due) {
    return 'paid';
  }

  if (isInvoiceOverdueDate(invoice.due_date, now)) {
    return 'overdue';
  }

  if (paid > 0) {
    return 'partially_paid';
  }

  return 'sent';
}

export function normalizeInvoiceStatus(invoice: Invoice, now = new Date()): Invoice {
  const derivedStatus = deriveInvoiceStatus(invoice, now);
  if (invoice.status === derivedStatus) return invoice;
  return { ...invoice, status: derivedStatus };
}

export function calculateBillingSnapshot(
  invoices: Invoice[],
  payments: Payment[],
  now = new Date()
): BillingSnapshot {
  const normalizedInvoices = invoices.map((invoice) => normalizeInvoiceStatus(invoice, now));

  const openInvoices = normalizedInvoices.filter((invoice) =>
    invoice.status === 'sent' || invoice.status === 'partially_paid' || invoice.status === 'overdue'
  );
  const overdueInvoices = openInvoices.filter((invoice) => invoice.status === 'overdue');

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  const paidThisMonthMinor = payments
    .filter((payment) => payment.status === 'received')
    .filter((payment) => {
      const paidAt = new Date(payment.paid_at).getTime();
      return paidAt >= monthStart && paidAt < nextMonthStart;
    })
    .reduce((sum, payment) => sum + payment.amount_minor, 0);

  return {
    outstanding_minor: openInvoices.reduce((sum, invoice) => sum + getInvoiceOutstandingMinor(invoice), 0),
    overdue_minor: overdueInvoices.reduce((sum, invoice) => sum + getInvoiceOutstandingMinor(invoice), 0),
    open_invoices: openInvoices.length,
    overdue_invoices: overdueInvoices.length,
    paid_this_month_minor: paidThisMonthMinor,
  };
}

export function calculateClientBillingSnapshot(
  clientId: string,
  invoices: Invoice[],
  payments: Payment[],
  now = new Date()
): BillingSnapshot {
  const clientInvoices = invoices.filter((invoice) => invoice.client_id === clientId);
  const clientPayments = payments.filter((payment) => payment.client_id === clientId);
  return calculateBillingSnapshot(clientInvoices, clientPayments, now);
}
