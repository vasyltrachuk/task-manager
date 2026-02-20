import type { DueRuleConfig, RuleConditionNode, RuleRecurrenceConfig, RuleTaskTemplateConfig } from './types';

export interface DefaultRuleDefinition {
  code: string;
  title: string;
  sort_order: number;
  legal_basis: string[];
  match_condition: RuleConditionNode;
  recurrence: RuleRecurrenceConfig;
  due_rule: DueRuleConfig;
  task_template: RuleTaskTemplateConfig;
}

export interface DefaultRulebookVersionDefinition {
  code: string;
  name: string;
  description: string;
  effective_from: string;
}

export const DEFAULT_RULEBOOK_VERSION: DefaultRulebookVersionDefinition = {
  code: 'ua-core-2026',
  name: 'UA Core Rulebook 2026',
  description: 'Базовий набір правил для податкового календаря (Україна, 2026).',
  effective_from: '2026-01-01',
};

export const DEFAULT_RULEBOOK_RULES: DefaultRuleDefinition[] = [
  {
    code: 'single_tax_monthly_payment_fop12',
    title: 'ЄП: щомісячна сплата (ФОП 1-2)',
    sort_order: 10,
    legal_basis: ['ПКУ ст. 295.1'],
    match_condition: {
      all: [
        { field: 'client_type', op: 'eq', value: 'FOP' },
        {
          field: 'tax_system',
          op: 'in',
          value: ['single_tax_group1', 'single_tax_group2'],
        },
      ],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'day_of_month',
      day: 20,
      shift_if_non_business_day: 'prev_business_day',
    },
    task_template: {
      title: 'Сплата єдиного податку (ФОП 1-2)',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'fop12_annual_declaration',
    title: 'ФОП 1-2: річна декларація ЄП',
    sort_order: 20,
    legal_basis: ['ПКУ ст. 296.2', 'ПКУ ст. 49.18.3'],
    match_condition: {
      all: [
        { field: 'client_type', op: 'eq', value: 'FOP' },
        {
          field: 'tax_system',
          op: 'in',
          value: ['single_tax_group1', 'single_tax_group2'],
        },
      ],
    },
    recurrence: { kind: 'annual' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 60,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати річну декларацію ЄП (ФОП 1-2)',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'fop3_quarterly_declaration',
    title: 'ФОП 3: квартальна декларація ЄП',
    sort_order: 30,
    legal_basis: ['ПКУ ст. 296.3', 'ПКУ ст. 49.18.2'],
    match_condition: {
      all: [
        { field: 'client_type', op: 'eq', value: 'FOP' },
        {
          field: 'tax_system',
          op: 'in',
          value: ['single_tax_group3', 'single_tax_group3_vat'],
        },
      ],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 40,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати квартальну декларацію ЄП (ФОП 3)',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'fop_self_esv_quarterly',
    title: 'ФОП: ЄСВ за себе',
    sort_order: 40,
    legal_basis: ['Закон №2464-VI ст. 9 ч. 8'],
    match_condition: {
      all: [{ field: 'client_type', op: 'eq', value: 'FOP' }],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'day_of_month',
      day: 20,
      month_offset: 3,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплата ЄСВ за себе (ФОП)',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'vat_declaration_monthly',
    title: 'ПДВ: щомісячна декларація',
    sort_order: 50,
    legal_basis: ['ПКУ ст. 202.1', 'ПКУ ст. 203.1'],
    match_condition: {
      all: [{ field: 'is_vat_payer', op: 'eq', value: true }],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 20,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати декларацію ПДВ',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'vat_payment_monthly',
    title: 'ПДВ: сплата податкового зобовʼязання',
    sort_order: 60,
    legal_basis: ['ПКУ ст. 203.2'],
    match_condition: {
      all: [{ field: 'is_vat_payer', op: 'eq', value: true }],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 30,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплатити ПДВ',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'payroll_advance_twice_monthly',
    title: 'Зарплата: аванс (2 рази/місяць)',
    sort_order: 70,
    legal_basis: ['КЗпП ст. 115'],
    match_condition: {
      all: [{ field: 'has_employees', op: 'eq', value: true }],
    },
    recurrence: { kind: 'semi_monthly', event: 'advance' },
    due_rule: {
      kind: 'profile_day_of_month',
      profile_field: 'payroll_advance_day',
      shift_if_non_business_day: 'prev_business_day',
    },
    task_template: {
      title: 'Виплата авансу по зарплаті',
      task_type: 'payroll',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'payroll_final_twice_monthly',
    title: 'Зарплата: фінальна виплата (2 рази/місяць)',
    sort_order: 80,
    legal_basis: ['КЗпП ст. 115'],
    match_condition: {
      all: [{ field: 'has_employees', op: 'eq', value: true }],
    },
    recurrence: { kind: 'semi_monthly', event: 'salary' },
    due_rule: {
      kind: 'profile_day_of_month',
      profile_field: 'payroll_final_day',
      shift_if_non_business_day: 'prev_business_day',
    },
    task_template: {
      title: 'Виплата основної зарплати',
      task_type: 'payroll',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'payroll_headcount_over_10',
    title: 'Кадри: контроль документів при штаті > 10',
    sort_order: 90,
    legal_basis: ['Внутрішній регламент бюро'],
    match_condition: {
      all: [
        { field: 'has_employees', op: 'eq', value: true },
        { field: 'employee_count', op: 'gt', value: 10 },
      ],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'day_of_month',
      day: 5,
      month_offset: 1,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Перевірити кадровий пакет для компаній зі штатом > 10',
      task_type: 'payroll',
      priority: 2,
      proof_required: false,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'payroll_unified_report_monthly_non_fop',
    title: 'Зарплатна звітність: податковий розрахунок (місячний)',
    sort_order: 100,
    legal_basis: ['ПКУ ст. 51.1', 'ПКУ ст. 176.2'],
    match_condition: {
      all: [
        { field: 'has_employees', op: 'eq', value: true },
        { field: 'client_type', op: 'neq', value: 'FOP' },
      ],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 20,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати податковий розрахунок ПДФО/ВЗ/ЄСВ (місячний)',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'payroll_unified_report_quarterly_fop',
    title: 'Зарплатна звітність ФОП: податковий розрахунок (квартальний)',
    sort_order: 110,
    legal_basis: ['ПКУ ст. 51.1', 'ПКУ ст. 176.2', 'ПКУ ст. 49.18.2'],
    match_condition: {
      all: [
        { field: 'has_employees', op: 'eq', value: true },
        { field: 'client_type', op: 'eq', value: 'FOP' },
      ],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 40,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати податковий розрахунок ПДФО/ВЗ/ЄСВ (квартальний ФОП)',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'excise_declaration_monthly',
    title: 'Акциз: щомісячна декларація',
    sort_order: 120,
    legal_basis: ['ПКУ ст. 223.2'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'excise' }],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 20,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати декларацію акцизного податку',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'excise_payment_monthly',
    title: 'Акциз: сплата податку',
    sort_order: 130,
    legal_basis: ['ПКУ ст. 222.3.1'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'excise' }],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 30,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплатити акцизний податок',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'land_tax_declaration_annual',
    title: 'Плата за землю: річна декларація',
    sort_order: 140,
    legal_basis: ['ПКУ ст. 286.2'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'land_tax' }],
    },
    recurrence: { kind: 'annual' },
    due_rule: {
      kind: 'fixed_date',
      month: 2,
      day: 20,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати річну декларацію з плати за землю',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'land_tax_payment_monthly',
    title: 'Плата за землю: щомісячна сплата',
    sort_order: 150,
    legal_basis: ['ПКУ ст. 287.3'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'land_tax' }],
    },
    recurrence: { kind: 'monthly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 30,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплатити плату за землю',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'real_estate_tax_declaration_annual',
    title: 'Нерухомість: річна декларація (ЮО)',
    sort_order: 160,
    legal_basis: ['ПКУ ст. 266.7.5'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'real_estate_tax' }],
    },
    recurrence: { kind: 'annual' },
    due_rule: {
      kind: 'fixed_date',
      month: 2,
      day: 20,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати річну декларацію з податку на нерухомість',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'real_estate_tax_payment_quarterly',
    title: 'Нерухомість: авансові внески поквартально',
    sort_order: 170,
    legal_basis: ['ПКУ ст. 266.10.1'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'real_estate_tax' }],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'day_of_month',
      day: 30,
      month_offset: 3,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплатити авансовий внесок з податку на нерухомість',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'ecological_tax_declaration_quarterly',
    title: 'Екоподаток: квартальна декларація',
    sort_order: 180,
    legal_basis: ['ПКУ ст. 250.2'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'ecological_tax' }],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 40,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати декларацію з екологічного податку',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'ecological_tax_payment_quarterly',
    title: 'Екоподаток: сплата',
    sort_order: 190,
    legal_basis: ['ПКУ ст. 250.2'],
    match_condition: {
      all: [{ field: 'tax_tags', op: 'contains', value: 'ecological_tax' }],
    },
    recurrence: { kind: 'quarterly' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 50,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Сплатити екологічний податок',
      task_type: 'payment',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
  {
    code: 'non_profit_report_annual',
    title: 'Неприбуткова організація: річний звіт',
    sort_order: 200,
    legal_basis: ['ПКУ ст. 133.4', 'ПКУ ст. 46.2', 'ПКУ ст. 49.18.3'],
    match_condition: {
      any: [
        { field: 'tax_system', op: 'eq', value: 'non_profit' },
        { field: 'tax_tags', op: 'contains', value: 'non_profit_reporting' },
      ],
    },
    recurrence: { kind: 'annual' },
    due_rule: {
      kind: 'days_after_period_end',
      days: 60,
      shift_if_non_business_day: 'next_business_day',
    },
    task_template: {
      title: 'Подати річний звіт неприбуткової організації',
      task_type: 'tax_report',
      priority: 1,
      proof_required: true,
      assignee_policy: 'client_primary_or_any',
    },
  },
];
