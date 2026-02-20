import type { TaskPriority, TaskType } from '@/lib/types';

export type RuleConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'exists';

export interface RuleConditionPredicate {
  field: string;
  op: RuleConditionOperator;
  value?: unknown;
}

export interface RuleConditionGroup {
  all?: RuleConditionNode[];
  any?: RuleConditionNode[];
}

export type RuleConditionNode = RuleConditionGroup | RuleConditionPredicate;

export type RuleRecurrenceKind = 'monthly' | 'quarterly' | 'annual' | 'semi_monthly';

export interface RuleRecurrenceConfig {
  kind: RuleRecurrenceKind;
  event?: string;
}

export type BusinessDayShift = 'none' | 'next_business_day' | 'prev_business_day';

export type DueRuleConfig =
  | {
      kind: 'day_of_month';
      day: number;
      month_offset?: number;
      shift_if_non_business_day?: BusinessDayShift;
    }
  | {
      kind: 'profile_day_of_month';
      profile_field: 'payroll_advance_day' | 'payroll_final_day';
      month_offset?: number;
      shift_if_non_business_day?: BusinessDayShift;
    }
  | {
      kind: 'business_day_of_month';
      day: number;
      month_offset?: number;
      shift_if_non_business_day?: BusinessDayShift;
    }
  | {
      kind: 'days_after_period_end';
      days: number;
      shift_if_non_business_day?: BusinessDayShift;
    }
  | {
      kind: 'fixed_date';
      month: number;
      day: number;
      shift_if_non_business_day?: BusinessDayShift;
    };

export interface RuleTaskTemplateConfig {
  title: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  proof_required?: boolean;
  assignee_policy?: 'primary_accountant' | 'explicit_assignee' | 'client_primary_or_any';
  assignee_id?: string;
}

export interface RulebookRuleRuntime {
  id: string;
  tenant_id: string;
  code: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  legal_basis: string[];
  match_condition: RuleConditionNode | Record<string, unknown>;
  recurrence: RuleRecurrenceConfig | Record<string, unknown>;
  due_rule: DueRuleConfig | Record<string, unknown>;
  task_template: RuleTaskTemplateConfig | Record<string, unknown>;
}

export interface RulebookRuleOverrideRuntime {
  id: string;
  tenant_id: string;
  client_id: string;
  rule_id: string;
  is_enabled: boolean;
  due_rule_override: Record<string, unknown> | null;
  task_template_override: Record<string, unknown> | null;
}

export interface RulebookVersionRuntime {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
}

export interface RuleRuntimeClientProfile {
  client_id: string;
  client_type: string;
  status: string;
  tax_system: string | null;
  is_vat_payer: boolean;
  employee_count: number;
  has_employees: boolean;
  tax_tags: string[];
  timezone: string;
  payroll_frequency: string;
  payroll_advance_day: number;
  payroll_final_day: number;
  [key: string]: unknown;
}

export interface RulePeriodWindow {
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface RuleDueDateResolution {
  dueDate: Date;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface RuleGenerationItem {
  clientId: string;
  ruleId: string;
  periodKey: string;
  dueDateIso: string;
  taskTitle: string;
  taskType: TaskType;
  priority: TaskPriority;
  description?: string;
  proofRequired: boolean;
  recurrence: 'none' | 'monthly' | 'semi_monthly' | 'quarterly' | 'yearly';
  recurrenceDays: number[] | null;
  legalBasis: string[];
}
