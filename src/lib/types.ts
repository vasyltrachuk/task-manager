// ========== Enums ==========
export type UserRole = 'admin' | 'accountant' | 'lawyer' | 'hr' | 'auditor' | 'manager';

export type ClientType = 'FOP' | 'LLC' | 'OSBB' | 'NGO' | 'GRANT';

export type ClientStatus = 'active' | 'onboarding' | 'archived';
export type ClientTaxIdType = 'ipn' | 'edrpou';

export type TaxSystem =
  | 'single_tax_group1'
  | 'single_tax_group2'
  | 'single_tax_group3'
  | 'single_tax_group3_vat'
  | 'single_tax_group4'
  | 'general_no_vat'
  | 'general_vat'
  | 'non_profit';
export type SingleTaxSystem = Extract<TaxSystem, 'single_tax_group1' | 'single_tax_group2' | 'single_tax_group3' | 'single_tax_group3_vat' | 'single_tax_group4'>;
export type SingleTaxRulebookGroup = Extract<TaxSystem, 'single_tax_group1' | 'single_tax_group2' | 'single_tax_group3' | 'single_tax_group4'>;
export type IncomeLimitSource = 'rulebook';

export type TaskType =
  | 'tax_report'
  | 'payroll'
  | 'reconciliation'
  | 'audit'
  | 'license'
  | 'onboarding'
  | 'kik_report'
  | 'registration'
  | 'liquidation'
  | 'management_reporting'
  | 'due_diligence'
  | 'other';

export type TaskStatus = 'todo' | 'in_progress' | 'clarification' | 'review' | 'done' | 'overdue';

export type TaskPriority = 1 | 2 | 3; // 1=high, 2=medium, 3=low

export type RecurrenceType = 'none' | 'monthly' | 'semi_monthly' | 'quarterly' | 'yearly';

export type LicenseType =
  | 'alcohol_retail'
  | 'alcohol_wholesale'
  | 'transport_passenger'
  | 'transport_cargo'
  | 'fuel_storage'
  | 'medical_practice'
  | 'security_services'
  | 'other';

export type LicenseStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'revoked' | 'draft';

export type LicensePaymentFrequency = 'none' | 'monthly' | 'quarterly' | 'yearly';

export type LicenseCheckResult = 'ok' | 'warning' | 'mismatch' | 'not_checked';

export type BillingCurrency = 'UAH';
export type BillingPlanCadence = 'monthly';
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentStatus = 'received' | 'pending' | 'failed' | 'refunded';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card';

// ========== Models ==========
export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string;
  email?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  // Auto-generated credentials (admin creates, shares with accountant)
  generated_password?: string;
  password_changed?: boolean;
}

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  tax_id_type: ClientTaxIdType;
  tax_id: string;
  status: ClientStatus;
  tax_system?: TaxSystem;
  is_vat_payer: boolean;
  income_limit?: number; // Annual or period income cap for accountant control
  income_limit_source?: IncomeLimitSource;
  contact_phone?: string;
  contact_email?: string;
  employee_count?: number;
  industry?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  accountants?: Profile[];
}

export interface ClientAccountant {
  client_id: string;
  accountant_id: string;
  is_primary: boolean;
}

export interface License {
  id: string;
  client_id: string;
  responsible_id: string;
  type: LicenseType;
  number: string;
  issuing_authority: string;
  place_of_activity?: string;
  status: LicenseStatus;
  issued_at: string;
  valid_from: string;
  valid_to?: string;
  payment_frequency: LicensePaymentFrequency;
  next_payment_due?: string;
  next_check_due?: string;
  last_checked_at?: string;
  last_check_result: LicenseCheckResult;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  client?: Client;
  responsible?: Profile;
}

export interface BillingPlan {
  id: string;
  client_id: string;
  cadence: BillingPlanCadence;
  fee_minor: number; // Stored in kopecks
  currency: BillingCurrency;
  due_day: number; // 1..28 for stable month rollovers
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  client?: Client;
}

export interface Invoice {
  id: string;
  client_id: string;
  billing_plan_id?: string;
  period: string; // e.g. "2026-01"
  amount_due_minor: number; // Stored in kopecks
  amount_paid_minor: number; // Stored in kopecks
  currency: BillingCurrency;
  issued_at: string;
  due_date: string;
  status: InvoiceStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  client?: Client;
  billing_plan?: BillingPlan;
  allocations?: PaymentAllocation[];
}

export interface Payment {
  id: string;
  client_id: string;
  amount_minor: number; // Stored in kopecks
  currency: BillingCurrency;
  paid_at: string;
  method: PaymentMethod;
  status: PaymentStatus;
  external_ref?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  client?: Client;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount_minor: number; // Stored in kopecks
  created_at: string;
  // Virtual / joined
  payment?: Payment;
  invoice?: Invoice;
}

export interface Task {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  type: TaskType;
  due_date: string;
  priority: TaskPriority;
  assignee_id: string;
  created_by: string;
  recurrence: RecurrenceType;
  recurrence_days?: number[]; // e.g. [1, 15] for twice-a-month tasks
  period?: string; // e.g. "Q3 2023", "Oct 2023"
  proof_required: boolean;
  created_at: string;
  updated_at: string;
  // Virtual / joined
  client?: Client;
  assignee?: Profile;
  subtasks?: SubTask[];
  comments?: TaskComment[];
  files?: TaskFile[];
}

export interface SubTask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  // Virtual
  author?: Profile;
}

export interface TaskFile {
  id: string;
  task_id: string;
  uploaded_by: string;
  path: string;
  file_name: string;
  mime: string;
  created_at: string;
  // Virtual
  uploader?: Profile;
}

export interface ActivityLogEntry {
  id: string;
  task_id: string;
  actor_id: string;
  action: string;
  details?: string;
  created_at: string;
  // Virtual
  actor?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface TaxRulebookConfig {
  year: number;
  minimum_wage_on_january_1: number;
  single_tax_multipliers: Record<SingleTaxRulebookGroup, number>;
  vat_registration_threshold: number;
}

export type DpsRegistryCode = 'ev' | 'pdv_act' | 'non-profit';
export type DpsSnapshotStatus = 'ok' | 'not_found' | 'error' | 'stale';
export type DpsSyncRunStatus = 'running' | 'completed' | 'partial' | 'failed' | 'skipped_no_token';

export interface DpsTokenStatus {
  hasToken: boolean;
  maskedToken: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
}

export interface DpsRegistrySnapshot {
  registry_code: DpsRegistryCode;
  status: DpsSnapshotStatus;
  normalized_payload: Record<string, unknown>;
  raw_payload: unknown;
  source: 'manual' | 'daily' | 'cron';
  fetched_at: string;
  expires_at: string;
}

export interface DpsKepProfile {
  key_owner_name: string;
  key_owner_tax_id: string;
  cert_subject?: string | null;
  cert_issuer?: string | null;
  cert_serial?: string | null;
  cert_valid_to?: string | null;
  notes?: string | null;
}

// ========== UI Helpers ==========
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Нова',
  in_progress: 'В роботі',
  clarification: 'Уточнення',
  review: 'На перевірці',
  done: 'Виконано',
  overdue: 'Прострочено',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#6B7280',
  in_progress: '#3B82F6',
  clarification: '#F59E0B',
  review: '#8B5CF6',
  done: '#10B981',
  overdue: '#EF4444',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  tax_report: 'Звітність',
  payroll: 'Зарплата',
  reconciliation: 'Звірка',
  audit: 'Аудит',
  license: 'Ліцензія',
  onboarding: 'Онбординг',
  kik_report: 'КІК',
  registration: 'Реєстрація',
  liquidation: 'Ліквідація',
  management_reporting: 'Управлінська звітність',
  due_diligence: 'Due diligence',
  other: 'Інше',
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  tax_report: '#3B82F6',
  payroll: '#8B5CF6',
  reconciliation: '#10B981',
  audit: '#6366F1',
  license: '#F59E0B',
  onboarding: '#EC4899',
  kik_report: '#0EA5E9',
  registration: '#14B8A6',
  liquidation: '#EF4444',
  management_reporting: '#334155',
  due_diligence: '#7C3AED',
  other: '#6B7280',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: 'Високий',
  2: 'Середній',
  3: 'Низький',
};

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  none: 'Одноразова',
  monthly: 'Щомісяця',
  semi_monthly: '2 рази на місяць',
  quarterly: 'Щоквартально',
  yearly: 'Щорічно',
};

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  FOP: 'ФОП',
  LLC: 'ТОВ',
  OSBB: 'ОСББ',
  NGO: 'ГО / НГО',
  GRANT: 'Грантовий проєкт',
};

export const CLIENT_TAX_ID_TYPE_LABELS: Record<ClientTaxIdType, string> = {
  ipn: 'РНОКПП',
  edrpou: 'ЄДРПОУ',
};

export const CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE: Record<ClientType, ClientTaxIdType> = {
  FOP: 'ipn',
  LLC: 'edrpou',
  OSBB: 'edrpou',
  NGO: 'edrpou',
  GRANT: 'edrpou',
};

export const TAX_SYSTEM_LABELS: Record<TaxSystem, string> = {
  single_tax_group1: 'ЄП 1 група',
  single_tax_group2: 'ЄП 2 група',
  single_tax_group3: 'ЄП 3 група (без ПДВ)',
  single_tax_group3_vat: 'ЄП 3 група (з ПДВ)',
  single_tax_group4: 'ЄП 4 група',
  general_no_vat: 'Загальна система (без ПДВ)',
  general_vat: 'Загальна система (з ПДВ)',
  non_profit: 'Неприбуткова організація',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Адміністратор',
  accountant: 'Бухгалтер',
  lawyer: 'Юрист',
  hr: 'HR',
  auditor: 'Аудитор',
  manager: 'Менеджер',
};

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  alcohol_retail: 'Роздріб алкоголю',
  alcohol_wholesale: 'Опт алкоголю',
  transport_passenger: 'Перевезення пасажирів',
  transport_cargo: 'Перевезення вантажів',
  fuel_storage: 'Зберігання пального',
  medical_practice: 'Медична практика',
  security_services: 'Охоронна діяльність',
  other: 'Інша ліцензія',
};

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  active: 'Активна',
  expiring: 'Потребує продовження',
  expired: 'Прострочена',
  suspended: 'Призупинена',
  revoked: 'Анулювана',
  draft: 'Чернетка',
};

export const LICENSE_STATUS_COLORS: Record<LicenseStatus, string> = {
  active: '#10B981',
  expiring: '#F59E0B',
  expired: '#EF4444',
  suspended: '#F97316',
  revoked: '#475569',
  draft: '#6B7280',
};

export const LICENSE_PAYMENT_FREQUENCY_LABELS: Record<LicensePaymentFrequency, string> = {
  none: 'Без регулярних платежів',
  monthly: 'Щомісячно',
  quarterly: 'Щоквартально',
  yearly: 'Щорічно',
};

export const LICENSE_CHECK_RESULT_LABELS: Record<LicenseCheckResult, string> = {
  ok: 'Дані співпадають',
  warning: 'Потрібна увага',
  mismatch: 'Розбіжність',
  not_checked: 'Не перевірялось',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Чернетка',
  sent: 'Надіслано',
  partially_paid: 'Частково сплачено',
  paid: 'Сплачено',
  overdue: 'Прострочено',
  cancelled: 'Скасовано',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: '#6B7280',
  sent: '#3B82F6',
  partially_paid: '#F59E0B',
  paid: '#10B981',
  overdue: '#EF4444',
  cancelled: '#475569',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  received: 'Отримано',
  pending: 'Очікується',
  failed: 'Неуспішно',
  refunded: 'Повернено',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Банківський переказ',
  cash: 'Готівка',
  card: 'Картка',
};
