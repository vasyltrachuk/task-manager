import type { Database } from './database.types';
import type {
  Profile, Client, Task, SubTask, TaskComment, TaskFile,
  License, BillingPlan, Invoice, Payment, PaymentAllocation,
  ActivityLogEntry, TaxRulebookConfig,
  UserRole, ClientType, ClientTaxIdType, ClientStatus, TaxSystem,
  IncomeLimitSource, TaskStatus, TaskType, TaskPriority, RecurrenceType,
  LicenseType, LicenseStatus, LicensePaymentFrequency, LicenseCheckResult,
  BillingPlanCadence, BillingCurrency, InvoiceStatus, PaymentStatus, PaymentMethod,
  SingleTaxRulebookGroup,
} from './types';

// Shorthand aliases for DB row types
type DbProfile = Database['public']['Tables']['profiles']['Row'];
type DbClient = Database['public']['Tables']['clients']['Row'];
type DbTask = Database['public']['Tables']['tasks']['Row'];
type DbSubtask = Database['public']['Tables']['subtasks']['Row'];
type DbTaskComment = Database['public']['Tables']['task_comments']['Row'];
type DbTaskFile = Database['public']['Tables']['task_files']['Row'];
type DbLicense = Database['public']['Tables']['licenses']['Row'];
type DbBillingPlan = Database['public']['Tables']['billing_plans']['Row'];
type DbInvoice = Database['public']['Tables']['invoices']['Row'];
type DbPayment = Database['public']['Tables']['payments']['Row'];
type DbPaymentAllocation = Database['public']['Tables']['payment_allocations']['Row'];
type DbAuditLog = Database['public']['Tables']['audit_log']['Row'];
type DbTaxRulebook = Database['public']['Tables']['tax_rulebook_configs']['Row'];

// ── Profiles ──────────────────────────────────────────────

export function mapDbProfile(row: DbProfile): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role as UserRole,
    phone: row.phone ?? '',
    email: row.email ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

// ── Clients ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbClient(row: DbClient, joinedAccountants?: any[]): Client {
  const accountants: Profile[] | undefined = joinedAccountants
    ? joinedAccountants
        .filter((ca: { profile: DbProfile | null }) => ca.profile)
        .map((ca: { profile: DbProfile }) => mapDbProfile(ca.profile))
    : undefined;

  return {
    id: row.id,
    name: row.name,
    type: row.type as ClientType,
    tax_id_type: row.tax_id_type as ClientTaxIdType,
    tax_id: row.tax_id,
    status: row.status as ClientStatus,
    tax_system: (row.tax_system as TaxSystem) ?? undefined,
    is_vat_payer: row.is_vat_payer,
    income_limit: row.income_limit ?? undefined,
    income_limit_source: (row.income_limit_source as IncomeLimitSource) ?? undefined,
    contact_phone: row.contact_phone ?? undefined,
    contact_email: row.contact_email ?? undefined,
    employee_count: row.employee_count ?? undefined,
    industry: row.industry ?? undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accountants,
  };
}

// ── Tasks ─────────────────────────────────────────────────

export function mapDbSubtask(row: DbSubtask): SubTask {
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    is_completed: row.is_completed,
    sort_order: row.sort_order,
  };
}

export function mapDbTaskComment(row: DbTaskComment & { author?: DbProfile | null }): TaskComment {
  return {
    id: row.id,
    task_id: row.task_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at,
    author: row.author ? mapDbProfile(row.author) : undefined,
  };
}

export function mapDbTaskFile(row: DbTaskFile): TaskFile {
  return {
    id: row.id,
    task_id: row.task_id,
    uploaded_by: row.uploaded_by,
    path: row.storage_path,
    file_name: row.file_name,
    mime: row.mime,
    created_at: row.created_at,
  };
}

export function mapDbTask(
  row: DbTask & {
    client?: DbClient | null;
    assignee?: DbProfile | null;
    subtasks?: DbSubtask[];
    task_comments?: (DbTaskComment & { author?: DbProfile | null })[];
    task_files?: DbTaskFile[];
  }
): Task {
  return {
    id: row.id,
    client_id: row.client_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as TaskStatus,
    type: row.type as TaskType,
    due_date: row.due_date,
    priority: row.priority as TaskPriority,
    assignee_id: row.assignee_id,
    created_by: row.created_by,
    recurrence: row.recurrence as RecurrenceType,
    recurrence_days: row.recurrence_days ?? undefined,
    period: row.period ?? undefined,
    proof_required: row.proof_required,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client ? mapDbClient(row.client) : undefined,
    assignee: row.assignee ? mapDbProfile(row.assignee) : undefined,
    subtasks: row.subtasks?.map(mapDbSubtask),
    comments: row.task_comments?.map(mapDbTaskComment),
    files: row.task_files?.map(mapDbTaskFile),
  };
}

// ── Licenses ──────────────────────────────────────────────

export function mapDbLicense(
  row: DbLicense & {
    client?: DbClient | null;
    responsible?: DbProfile | null;
  }
): License {
  return {
    id: row.id,
    client_id: row.client_id,
    responsible_id: row.responsible_id,
    type: row.type as LicenseType,
    number: row.number,
    issuing_authority: row.issuing_authority,
    place_of_activity: row.place_of_activity ?? undefined,
    status: row.status as LicenseStatus,
    issued_at: row.issued_at,
    valid_from: row.valid_from,
    valid_to: row.valid_to ?? undefined,
    payment_frequency: row.payment_frequency as LicensePaymentFrequency,
    next_payment_due: row.next_payment_due ?? undefined,
    next_check_due: row.next_check_due ?? undefined,
    last_checked_at: row.last_checked_at ?? undefined,
    last_check_result: row.last_check_result as LicenseCheckResult,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client ? mapDbClient(row.client) : undefined,
    responsible: row.responsible ? mapDbProfile(row.responsible) : undefined,
  };
}

// ── Billing ───────────────────────────────────────────────

export function mapDbBillingPlan(
  row: DbBillingPlan & { client?: DbClient | null }
): BillingPlan {
  return {
    id: row.id,
    client_id: row.client_id,
    cadence: row.cadence as BillingPlanCadence,
    fee_minor: row.fee_minor,
    currency: row.currency as BillingCurrency,
    due_day: row.due_day,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client ? mapDbClient(row.client) : undefined,
  };
}

export function mapDbInvoice(
  row: DbInvoice & {
    client?: DbClient | null;
    billing_plan?: DbBillingPlan | null;
    payment_allocations?: DbPaymentAllocation[];
  }
): Invoice {
  return {
    id: row.id,
    client_id: row.client_id,
    billing_plan_id: row.billing_plan_id ?? undefined,
    period: row.period,
    amount_due_minor: row.amount_due_minor,
    amount_paid_minor: row.amount_paid_minor,
    currency: row.currency as BillingCurrency,
    issued_at: row.issued_at,
    due_date: row.due_date,
    status: row.status as InvoiceStatus,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client ? mapDbClient(row.client) : undefined,
    billing_plan: row.billing_plan ? mapDbBillingPlan(row.billing_plan) : undefined,
    allocations: row.payment_allocations?.map(mapDbPaymentAllocation),
  };
}

export function mapDbPayment(
  row: DbPayment & { client?: DbClient | null }
): Payment {
  return {
    id: row.id,
    client_id: row.client_id,
    amount_minor: row.amount_minor,
    currency: row.currency as BillingCurrency,
    paid_at: row.paid_at,
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    external_ref: row.external_ref ?? undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client ? mapDbClient(row.client) : undefined,
  };
}

export function mapDbPaymentAllocation(row: DbPaymentAllocation): PaymentAllocation {
  return {
    id: row.id,
    payment_id: row.payment_id,
    invoice_id: row.invoice_id,
    amount_minor: row.amount_minor,
    created_at: row.created_at,
  };
}

// ── Activity Log ──────────────────────────────────────────

export function mapDbAuditEntry(
  row: DbAuditLog & { actor?: DbProfile | null }
): ActivityLogEntry {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    task_id: row.entity_id,
    actor_id: row.actor_id ?? '',
    action: row.action,
    details: (meta.details as string) ?? undefined,
    created_at: row.created_at,
    actor: row.actor ? mapDbProfile(row.actor) : undefined,
  };
}

// ── Tax Rulebook ──────────────────────────────────────────

export function mapDbTaxRulebook(row: DbTaxRulebook): TaxRulebookConfig {
  return {
    year: row.year,
    minimum_wage_on_january_1: row.minimum_wage_on_january_1,
    single_tax_multipliers: row.single_tax_multipliers as unknown as Record<SingleTaxRulebookGroup, number>,
    vat_registration_threshold: row.vat_registration_threshold,
  };
}
