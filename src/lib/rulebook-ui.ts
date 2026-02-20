import type {
  ClientType,
  RecurrenceType,
  TaskPriority,
  TaskType,
  TaxSystem,
} from './types';
import type {
  DueRuleConfig,
  RuleConditionNode,
  RuleRecurrenceConfig,
  RuleTaskTemplateConfig,
} from '@/lib/server/rulebook/types';

export type RulebookRecurrenceForm = Exclude<RecurrenceType, 'none'>;

export type RulebookDueRulePreset =
  | '20th_current_month'
  | '20th_of_next_month'
  | '20th_after_quarter'
  | '5th_of_next_month'
  | 'last_day_of_month'
  | '30th_after_quarter'
  | '40_days_after_quarter'
  | '50_days_after_quarter'
  | '30_days_after_month_end'
  | '60_days_after_year_end'
  | 'february_20'
  | 'payroll_advance_day'
  | 'payroll_final_day'
  | 'custom';

export const RULEBOOK_DUE_RULE_LABELS: Record<RulebookDueRulePreset, string> = {
  '20th_current_month': 'До 20 числа поточного місяця',
  '20th_of_next_month': 'До 20 числа наступного місяця',
  '20th_after_quarter': 'До 20 числа 3-го місяця після кварталу',
  '5th_of_next_month': '5 число наступного місяця',
  'last_day_of_month': 'Останній день місяця',
  '30th_after_quarter': '30 число 3-го місяця після кварталу',
  '40_days_after_quarter': '40 днів після кварталу',
  '50_days_after_quarter': '50 днів після кварталу',
  '30_days_after_month_end': '30 днів після кінця місяця',
  '60_days_after_year_end': '60 днів після кінця року',
  'february_20': '20 лютого',
  'payroll_advance_day': 'День авансу із профілю клієнта',
  'payroll_final_day': 'День зарплати із профілю клієнта',
  custom: 'Кастомне правило (зберегти як є)',
};

export interface RulebookVersionSummary {
  id: string;
  code: string;
  name: string;
  effective_from: string;
  is_active: boolean;
}

export interface RulebookRuleRowLike {
  id: string;
  code: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  legal_basis: string[] | null;
  match_condition: RuleConditionNode | Record<string, unknown> | null;
  recurrence: RuleRecurrenceConfig | Record<string, unknown> | null;
  due_rule: DueRuleConfig | Record<string, unknown> | null;
  task_template: RuleTaskTemplateConfig | Record<string, unknown> | null;
  updated_at?: string;
}

export interface RulebookRuleFormInput {
  id?: string;
  code?: string;
  title: string;
  description?: string;
  task_type: TaskType;
  priority: TaskPriority;
  target_legal_forms: ClientType[] | null;
  target_tax_systems: TaxSystem[] | null;
  require_vat: boolean | null;
  require_employees: boolean | null;
  recurrence: RulebookRecurrenceForm;
  due_date_rule: RulebookDueRulePreset;
  due_rule_custom?: DueRuleConfig | null;
  legal_basis_text: string;
  sort_order: number;
  is_active: boolean;
}

export interface RulebookRulePersistPayload {
  code?: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  legal_basis: string[];
  match_condition: RuleConditionNode | Record<string, unknown>;
  recurrence: RuleRecurrenceConfig;
  due_rule: DueRuleConfig;
  task_template: RuleTaskTemplateConfig;
}

interface RulePredicate {
  field: string;
  op: string;
  value?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toRulePredicates(condition: RuleConditionNode | Record<string, unknown> | null): RulePredicate[] {
  if (!isObject(condition)) return [];

  const predicates: RulePredicate[] = [];
  const pushNode = (node: unknown) => {
    if (!isObject(node)) return;
    if (typeof node.field !== 'string' || typeof node.op !== 'string') return;
    predicates.push({
      field: node.field,
      op: node.op,
      value: node.value,
    });
  };

  if (Array.isArray(condition.all)) {
    condition.all.forEach(pushNode);
  }

  if (predicates.length === 0) {
    pushNode(condition);
  }

  return predicates;
}

function parseRecurrence(value: unknown): RuleRecurrenceConfig | null {
  if (!isObject(value) || typeof value.kind !== 'string') return null;
  if (!['monthly', 'quarterly', 'annual', 'semi_monthly'].includes(value.kind)) return null;

  return {
    kind: value.kind as RuleRecurrenceConfig['kind'],
    event: typeof value.event === 'string' ? value.event : undefined,
  };
}

function parseDueRule(value: unknown): DueRuleConfig | null {
  if (!isObject(value) || typeof value.kind !== 'string') return null;
  const shift =
    value.shift_if_non_business_day === 'none' ||
    value.shift_if_non_business_day === 'next_business_day' ||
    value.shift_if_non_business_day === 'prev_business_day'
      ? value.shift_if_non_business_day
      : undefined;

  if (value.kind === 'day_of_month' || value.kind === 'business_day_of_month') {
    if (typeof value.day !== 'number') return null;
    return {
      kind: value.kind,
      day: value.day,
      month_offset: typeof value.month_offset === 'number' ? value.month_offset : undefined,
      shift_if_non_business_day: shift,
    };
  }

  if (value.kind === 'profile_day_of_month') {
    if (value.profile_field !== 'payroll_advance_day' && value.profile_field !== 'payroll_final_day') {
      return null;
    }
    return {
      kind: 'profile_day_of_month',
      profile_field: value.profile_field,
      month_offset: typeof value.month_offset === 'number' ? value.month_offset : undefined,
      shift_if_non_business_day: shift,
    };
  }

  if (value.kind === 'days_after_period_end') {
    if (typeof value.days !== 'number') return null;
    return {
      kind: 'days_after_period_end',
      days: value.days,
      shift_if_non_business_day: shift,
    };
  }

  if (value.kind === 'fixed_date') {
    if (typeof value.month !== 'number' || typeof value.day !== 'number') return null;
    return {
      kind: 'fixed_date',
      month: value.month,
      day: value.day,
      shift_if_non_business_day: shift,
    };
  }

  return null;
}

function parseTaskTemplate(value: unknown): RuleTaskTemplateConfig | null {
  if (!isObject(value) || typeof value.title !== 'string') return null;

  const rawPriority = value.priority;
  const priority: TaskPriority = rawPriority === 1 || rawPriority === 3 ? rawPriority : 2;

  return {
    title: value.title,
    description: typeof value.description === 'string' ? value.description : undefined,
    task_type: typeof value.task_type === 'string' ? (value.task_type as TaskType) : undefined,
    priority,
    proof_required: typeof value.proof_required === 'boolean' ? value.proof_required : undefined,
    assignee_policy:
      value.assignee_policy === 'primary_accountant' ||
      value.assignee_policy === 'explicit_assignee' ||
      value.assignee_policy === 'client_primary_or_any'
        ? value.assignee_policy
        : undefined,
    assignee_id: typeof value.assignee_id === 'string' ? value.assignee_id : undefined,
  };
}

function toDueRulePreset(dueRule: DueRuleConfig | null): RulebookDueRulePreset {
  if (!dueRule) return '20th_of_next_month';

  if (dueRule.kind === 'profile_day_of_month') {
    return dueRule.profile_field === 'payroll_advance_day'
      ? 'payroll_advance_day'
      : 'payroll_final_day';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 20 &&
    (dueRule.month_offset ?? 0) === 0
  ) {
    return '20th_current_month';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 20 &&
    (dueRule.month_offset ?? 0) === 1
  ) {
    return '20th_of_next_month';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 20 &&
    (dueRule.month_offset ?? 0) === 3
  ) {
    return '20th_after_quarter';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 5 &&
    (dueRule.month_offset ?? 0) === 1
  ) {
    return '5th_of_next_month';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 31 &&
    (dueRule.month_offset ?? 0) === 0
  ) {
    return 'last_day_of_month';
  }

  if (
    dueRule.kind === 'day_of_month' &&
    dueRule.day === 30 &&
    (dueRule.month_offset ?? 0) === 3
  ) {
    return '30th_after_quarter';
  }

  if (dueRule.kind === 'days_after_period_end' && dueRule.days === 40) {
    return '40_days_after_quarter';
  }

  if (dueRule.kind === 'days_after_period_end' && dueRule.days === 50) {
    return '50_days_after_quarter';
  }

  if (dueRule.kind === 'days_after_period_end' && dueRule.days === 30) {
    return '30_days_after_month_end';
  }

  if (dueRule.kind === 'days_after_period_end' && dueRule.days === 60) {
    return '60_days_after_year_end';
  }

  if (dueRule.kind === 'fixed_date' && dueRule.month === 2 && dueRule.day === 20) {
    return 'february_20';
  }

  return 'custom';
}

function fromDueRulePreset(
  preset: RulebookDueRulePreset,
  customDueRule: DueRuleConfig | null | undefined
): DueRuleConfig {
  switch (preset) {
    case '20th_current_month':
      return {
        kind: 'day_of_month',
        day: 20,
        month_offset: 0,
        shift_if_non_business_day: 'next_business_day',
      };
    case '20th_of_next_month':
      return {
        kind: 'day_of_month',
        day: 20,
        month_offset: 1,
        shift_if_non_business_day: 'next_business_day',
      };
    case '20th_after_quarter':
      return {
        kind: 'day_of_month',
        day: 20,
        month_offset: 3,
        shift_if_non_business_day: 'next_business_day',
      };
    case '5th_of_next_month':
      return {
        kind: 'day_of_month',
        day: 5,
        month_offset: 1,
        shift_if_non_business_day: 'next_business_day',
      };
    case 'last_day_of_month':
      return {
        kind: 'day_of_month',
        day: 31,
        month_offset: 0,
        shift_if_non_business_day: 'prev_business_day',
      };
    case '30th_after_quarter':
      return {
        kind: 'day_of_month',
        day: 30,
        month_offset: 3,
        shift_if_non_business_day: 'next_business_day',
      };
    case '40_days_after_quarter':
      return {
        kind: 'days_after_period_end',
        days: 40,
        shift_if_non_business_day: 'next_business_day',
      };
    case '50_days_after_quarter':
      return {
        kind: 'days_after_period_end',
        days: 50,
        shift_if_non_business_day: 'next_business_day',
      };
    case '30_days_after_month_end':
      return {
        kind: 'days_after_period_end',
        days: 30,
        shift_if_non_business_day: 'next_business_day',
      };
    case '60_days_after_year_end':
      return {
        kind: 'days_after_period_end',
        days: 60,
        shift_if_non_business_day: 'next_business_day',
      };
    case 'february_20':
      return {
        kind: 'fixed_date',
        month: 2,
        day: 20,
        shift_if_non_business_day: 'next_business_day',
      };
    case 'payroll_advance_day':
      return {
        kind: 'profile_day_of_month',
        profile_field: 'payroll_advance_day',
        shift_if_non_business_day: 'prev_business_day',
      };
    case 'payroll_final_day':
      return {
        kind: 'profile_day_of_month',
        profile_field: 'payroll_final_day',
        shift_if_non_business_day: 'prev_business_day',
      };
    case 'custom':
      if (customDueRule) return customDueRule;
      return {
        kind: 'day_of_month',
        day: 20,
        month_offset: 1,
        shift_if_non_business_day: 'next_business_day',
      };
  }
}

function toRuleRecurrence(formRecurrence: RulebookRecurrenceForm): RuleRecurrenceConfig {
  if (formRecurrence === 'yearly') {
    return { kind: 'annual' };
  }

  return {
    kind: formRecurrence as RuleRecurrenceConfig['kind'],
  };
}

function toFormRecurrence(config: RuleRecurrenceConfig | null): RulebookRecurrenceForm {
  if (!config) return 'monthly';
  if (config.kind === 'annual') return 'yearly';
  return config.kind;
}

export function mapRuleRowToFormInput(row: RulebookRuleRowLike): RulebookRuleFormInput {
  const taskTemplate = parseTaskTemplate(row.task_template) ?? {
    title: row.title,
    task_type: 'other',
    priority: 2,
  };
  const recurrence = parseRecurrence(row.recurrence);
  const dueRule = parseDueRule(row.due_rule);
  const duePreset = toDueRulePreset(dueRule);

  const predicates = toRulePredicates(row.match_condition);
  const targetLegalForms = predicates.find(
    (predicate) => predicate.field === 'client_type' && predicate.op === 'in'
  );
  const targetTaxSystems = predicates.find(
    (predicate) => predicate.field === 'tax_system' && predicate.op === 'in'
  );
  const requireVat = predicates.find(
    (predicate) => predicate.field === 'is_vat_payer' && predicate.op === 'eq'
  );
  const requireEmployees = predicates.find(
    (predicate) => predicate.field === 'has_employees' && predicate.op === 'eq'
  );

  const rawPriority = taskTemplate.priority;
  const priority: TaskPriority = rawPriority === 1 || rawPriority === 3 ? rawPriority : 2;

  return {
    id: row.id,
    code: row.code,
    title: taskTemplate.title,
    description: taskTemplate.description,
    task_type: taskTemplate.task_type ?? 'other',
    priority,
    target_legal_forms: toStringArray(targetLegalForms?.value) as ClientType[],
    target_tax_systems: toStringArray(targetTaxSystems?.value) as TaxSystem[],
    require_vat:
      typeof requireVat?.value === 'boolean' ? (requireVat.value as boolean) : null,
    require_employees:
      typeof requireEmployees?.value === 'boolean'
        ? (requireEmployees.value as boolean)
        : null,
    recurrence: toFormRecurrence(recurrence),
    due_date_rule: duePreset,
    due_rule_custom: duePreset === 'custom' ? dueRule : null,
    legal_basis_text: (row.legal_basis ?? []).join('\n'),
    sort_order: Number.isFinite(row.sort_order) ? row.sort_order : 100,
    is_active: row.is_active,
  };
}

export function buildRulebookPersistPayload(
  input: RulebookRuleFormInput
): RulebookRulePersistPayload {
  const all: RulePredicate[] = [];

  if (input.target_legal_forms && input.target_legal_forms.length > 0) {
    all.push({
      field: 'client_type',
      op: 'in',
      value: input.target_legal_forms,
    });
  }

  if (input.target_tax_systems && input.target_tax_systems.length > 0) {
    all.push({
      field: 'tax_system',
      op: 'in',
      value: input.target_tax_systems,
    });
  }

  if (input.require_vat !== null) {
    all.push({
      field: 'is_vat_payer',
      op: 'eq',
      value: input.require_vat,
    });
  }

  if (input.require_employees !== null) {
    all.push({
      field: 'has_employees',
      op: 'eq',
      value: input.require_employees,
    });
  }

  const legalBasis = input.legal_basis_text
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    code: input.code,
    title: input.title,
    is_active: input.is_active,
    sort_order: input.sort_order,
    legal_basis: legalBasis,
    match_condition: all.length > 0 ? ({ all } as RuleConditionNode) : {},
    recurrence: toRuleRecurrence(input.recurrence),
    due_rule: fromDueRulePreset(input.due_date_rule, input.due_rule_custom),
    task_template: {
      title: input.title,
      description: input.description,
      task_type: input.task_type,
      priority: input.priority,
      proof_required: false,
      assignee_policy: 'client_primary_or_any',
    },
  };
}
