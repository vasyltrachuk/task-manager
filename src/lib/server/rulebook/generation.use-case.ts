import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { TaskPriority, TaskType } from '@/lib/types';
import { evaluateRuleCondition } from './condition-evaluator';
import { enumeratePeriodsInRange, resolveDueDateForPeriod } from './deadline-resolver';
import type { RulebookDatabase } from './db.types';
import type {
  DueRuleConfig,
  RulebookRuleOverrideRuntime,
  RulebookRuleRuntime,
  RulebookVersionRuntime,
  RuleRecurrenceConfig,
  RuleRuntimeClientProfile,
  RuleTaskTemplateConfig,
} from './types';

type DbClient = SupabaseClient<Database>;
type RulebookDbClient = SupabaseClient<RulebookDatabase>;

interface ClientRow {
  id: string;
  type: string;
  status: string;
  tax_system: string | null;
  is_vat_payer: boolean;
  employee_count: number | null;
  additional_tax_tags: string[] | null;
  timezone: string | null;
  payroll_frequency: string | null;
  payroll_advance_day: number | null;
  payroll_final_day: number | null;
}

interface ClientAccountantRow {
  client_id: string;
  accountant_id: string;
  is_primary: boolean;
}

interface ProfileLiteRow {
  id: string;
  role: string;
  is_active: boolean;
}

interface GenerationRowLite {
  id: string;
  generated_task_id: string | null;
  status: string;
}

interface RulebookGenerationCandidate {
  clientId: string;
  ruleId: string;
  ruleCode: string;
  periodKey: string;
  dueDateIso: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  priority: TaskPriority;
  proofRequired: boolean;
  recurrence: 'none' | 'monthly' | 'semi_monthly' | 'quarterly' | 'yearly';
  recurrenceDays: number[] | null;
  assigneeId: string;
  legalBasis: string[];
}

function asRulebookClient(db: DbClient): RulebookDbClient {
  return db as unknown as RulebookDbClient;
}

export interface RunRulebookTaskGenerationInput {
  tenantId: string;
  actorProfileId?: string;
  fromDate?: string;
  toDate?: string;
  holidays?: string[];
  dryRun?: boolean;
  forceRetryWithoutLinkedTask?: boolean;
}

export interface RulebookTaskGenerationSummary {
  tenantId: string;
  dryRun: boolean;
  fromDate: string;
  toDate: string;
  activeVersion: { id: string; code: string } | null;
  processedClients: number;
  evaluatedRules: number;
  matchedCandidates: number;
  createdTasks: number;
  linkedExistingTasks: number;
  skippedAlreadyGenerated: number;
  skippedByCondition: number;
  skippedNoAssignee: number;
  errors: Array<{ clientId: string; ruleCode: string; periodKey: string; message: string }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

  const shift = typeof value.shift_if_non_business_day === 'string'
    ? value.shift_if_non_business_day
    : undefined;

  if (value.kind === 'day_of_month' || value.kind === 'business_day_of_month') {
    if (typeof value.day !== 'number') return null;
    return {
      kind: value.kind,
      day: value.day,
      month_offset: typeof value.month_offset === 'number' ? value.month_offset : undefined,
      shift_if_non_business_day:
        shift === 'next_business_day' || shift === 'prev_business_day' || shift === 'none'
          ? shift
          : undefined,
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
      shift_if_non_business_day:
        shift === 'next_business_day' || shift === 'prev_business_day' || shift === 'none'
          ? shift
          : undefined,
    };
  }

  if (value.kind === 'days_after_period_end') {
    if (typeof value.days !== 'number') return null;
    return {
      kind: 'days_after_period_end',
      days: value.days,
      shift_if_non_business_day:
        shift === 'next_business_day' || shift === 'prev_business_day' || shift === 'none'
          ? shift
          : undefined,
    };
  }

  if (value.kind === 'fixed_date') {
    if (typeof value.month !== 'number' || typeof value.day !== 'number') return null;
    return {
      kind: 'fixed_date',
      month: value.month,
      day: value.day,
      shift_if_non_business_day:
        shift === 'next_business_day' || shift === 'prev_business_day' || shift === 'none'
          ? shift
          : undefined,
    };
  }

  return null;
}

function parseTaskTemplate(value: unknown): RuleTaskTemplateConfig | null {
  if (!isObject(value) || typeof value.title !== 'string') return null;

  return {
    title: value.title,
    description: typeof value.description === 'string' ? value.description : undefined,
    task_type: typeof value.task_type === 'string' ? (value.task_type as TaskType) : undefined,
    priority: typeof value.priority === 'number' ? (value.priority as TaskPriority) : undefined,
    proof_required: typeof value.proof_required === 'boolean' ? value.proof_required : undefined,
    assignee_policy: typeof value.assignee_policy === 'string'
      ? (value.assignee_policy as RuleTaskTemplateConfig['assignee_policy'])
      : undefined,
    assignee_id: typeof value.assignee_id === 'string' ? value.assignee_id : undefined,
  };
}

function normalizeClientProfile(client: ClientRow): RuleRuntimeClientProfile {
  const employeeCount = Math.max(0, client.employee_count ?? 0);
  const rawTags = Array.isArray(client.additional_tax_tags) ? client.additional_tax_tags : [];
  const normalizedTags = [...new Set(rawTags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean))];

  if (client.is_vat_payer) normalizedTags.push('vat');
  if (employeeCount > 0) normalizedTags.push('employees');

  return {
    client_id: client.id,
    client_type: client.type,
    status: client.status,
    tax_system: client.tax_system,
    is_vat_payer: client.is_vat_payer,
    employee_count: employeeCount,
    has_employees: employeeCount > 0,
    tax_tags: [...new Set(normalizedTags)],
    timezone: client.timezone || 'Europe/Kyiv',
    payroll_frequency: client.payroll_frequency || 'semi_monthly',
    payroll_advance_day: client.payroll_advance_day ?? 15,
    payroll_final_day: client.payroll_final_day ?? 30,
  };
}

function mapRuleRecurrenceToTaskRecurrence(
  recurrence: RuleRecurrenceConfig
): 'none' | 'monthly' | 'semi_monthly' | 'quarterly' | 'yearly' {
  if (recurrence.kind === 'monthly') return 'monthly';
  if (recurrence.kind === 'semi_monthly') return 'semi_monthly';
  if (recurrence.kind === 'quarterly') return 'quarterly';
  if (recurrence.kind === 'annual') return 'yearly';
  return 'none';
}

function buildRecurrenceDays(
  recurrence: RuleRecurrenceConfig,
  profile: RuleRuntimeClientProfile,
  dueRule: DueRuleConfig
): number[] | null {
  if (recurrence.kind !== 'semi_monthly') return null;

  const days = new Set<number>();
  if (profile.payroll_advance_day >= 1 && profile.payroll_advance_day <= 31) days.add(profile.payroll_advance_day);
  if (profile.payroll_final_day >= 1 && profile.payroll_final_day <= 31) days.add(profile.payroll_final_day);
  if (dueRule.kind === 'profile_day_of_month') {
    const profileDay =
      dueRule.profile_field === 'payroll_advance_day'
        ? profile.payroll_advance_day
        : profile.payroll_final_day;
    if (profileDay >= 1 && profileDay <= 31) {
      days.add(profileDay);
    }
  }
  if (
    (dueRule.kind === 'day_of_month' || dueRule.kind === 'business_day_of_month') &&
    dueRule.day >= 1 &&
    dueRule.day <= 31
  ) {
    days.add(dueRule.day);
  }

  if (days.size === 0) return null;
  return [...days].sort((a, b) => a - b);
}

function buildTaskDescription(
  template: RuleTaskTemplateConfig,
  legalBasis: string[]
): string | null {
  const legalSuffix = legalBasis.length
    ? `Нормативна підстава: ${legalBasis.join('; ')}`
    : null;

  if (template.description && legalSuffix) {
    return `${template.description}\n\n${legalSuffix}`;
  }
  return template.description ?? legalSuffix;
}

function resolveAssigneeId(
  clientId: string,
  template: RuleTaskTemplateConfig,
  assignmentsByClient: Map<string, ClientAccountantRow[]>,
  fallbackAdminId: string | null,
  fallbackAccountantId: string | null
): string | null {
  if (template.assignee_policy === 'explicit_assignee' && template.assignee_id) {
    return template.assignee_id;
  }

  const assignments = assignmentsByClient.get(clientId) ?? [];
  const primary = assignments.find((row) => row.is_primary)?.accountant_id;
  if (primary) return primary;
  if (assignments[0]?.accountant_id) return assignments[0].accountant_id;
  if (template.assignee_id) return template.assignee_id;
  if (fallbackAdminId) return fallbackAdminId;
  if (fallbackAccountantId) return fallbackAccountantId;
  return null;
}

async function fetchActiveVersion(db: RulebookDbClient, tenantId: string): Promise<RulebookVersionRuntime | null> {
  const { data, error } = await db
    .from('rulebook_versions')
    .select('id, tenant_id, code, name, is_active, effective_from, effective_to')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(`[rulebook_fetch_version] ${error.message}`);
  }

  return (data ?? null) as RulebookVersionRuntime | null;
}

async function fetchRules(
  db: RulebookDbClient,
  tenantId: string,
  versionId: string
): Promise<RulebookRuleRuntime[]> {
  const { data, error } = await db
    .from('rulebook_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('version_id', versionId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`[rulebook_fetch_rules] ${error.message}`);
  }

  return (data ?? []) as RulebookRuleRuntime[];
}

async function fetchClients(db: RulebookDbClient, tenantId: string): Promise<ClientRow[]> {
  const { data, error } = await db
    .from('clients')
    .select(
      'id,type,status,tax_system,is_vat_payer,employee_count,additional_tax_tags,timezone,payroll_frequency,payroll_advance_day,payroll_final_day'
    )
    .eq('tenant_id', tenantId)
    .neq('status', 'archived');

  if (error) {
    throw new Error(`[rulebook_fetch_clients] ${error.message}`);
  }

  return (data ?? []) as ClientRow[];
}

async function fetchOverrides(
  db: RulebookDbClient,
  tenantId: string
): Promise<RulebookRuleOverrideRuntime[]> {
  const { data, error } = await db
    .from('rulebook_rule_overrides')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`[rulebook_fetch_overrides] ${error.message}`);
  }

  return (data ?? []) as RulebookRuleOverrideRuntime[];
}

async function fetchAssignments(
  db: DbClient,
  tenantId: string
): Promise<Map<string, ClientAccountantRow[]>> {
  const { data, error } = await db
    .from('client_accountants')
    .select('client_id, accountant_id, is_primary')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`[rulebook_fetch_assignments] ${error.message}`);
  }

  const map = new Map<string, ClientAccountantRow[]>();
  (data ?? []).forEach((row) => {
    const bucket = map.get(row.client_id) ?? [];
    bucket.push({
      client_id: row.client_id,
      accountant_id: row.accountant_id,
      is_primary: row.is_primary,
    });
    map.set(row.client_id, bucket);
  });
  return map;
}

async function fetchActiveProfiles(db: DbClient, tenantId: string): Promise<ProfileLiteRow[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, role, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`[rulebook_fetch_profiles] ${error.message}`);
  }

  return ((data ?? []) as ProfileLiteRow[]).filter((row) => row.is_active);
}

function mergeRuleWithOverride(
  rule: RulebookRuleRuntime,
  override: RulebookRuleOverrideRuntime | undefined
): {
  enabled: boolean;
  recurrence: RuleRecurrenceConfig | null;
  dueRule: DueRuleConfig | null;
  taskTemplate: RuleTaskTemplateConfig | null;
} {
  const recurrence = parseRecurrence(rule.recurrence);
  const baseDueRule = parseDueRule(rule.due_rule);
  const baseTemplate = parseTaskTemplate(rule.task_template);

  if (!override) {
    return {
      enabled: true,
      recurrence,
      dueRule: baseDueRule,
      taskTemplate: baseTemplate,
    };
  }

  const overrideDueRule = parseDueRule(override.due_rule_override ?? undefined);
  const overrideTemplate = parseTaskTemplate(override.task_template_override ?? undefined);

  return {
    enabled: override.is_enabled,
    recurrence,
    dueRule: overrideDueRule ?? baseDueRule,
    taskTemplate: overrideTemplate ?? baseTemplate,
  };
}

async function findExistingTask(
  db: DbClient,
  tenantId: string,
  candidate: RulebookGenerationCandidate
): Promise<string | null> {
  const { data, error } = await db
    .from('tasks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', candidate.clientId)
    .eq('title', candidate.title)
    .eq('due_date', candidate.dueDateIso)
    .eq('period', candidate.periodKey)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[rulebook_find_existing_task] ${error.message}`);
  }

  return data?.id ?? null;
}

async function getGenerationRecord(
  db: RulebookDbClient,
  tenantId: string,
  clientId: string,
  ruleId: string,
  periodKey: string
): Promise<GenerationRowLite | null> {
  const { data, error } = await db
    .from('rulebook_task_generations')
    .select('id, generated_task_id, status')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('rule_id', ruleId)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (error) {
    throw new Error(`[rulebook_get_generation] ${error.message}`);
  }

  return (data ?? null) as GenerationRowLite | null;
}

async function createGenerationRecord(
  db: RulebookDbClient,
  tenantId: string,
  candidate: RulebookGenerationCandidate
): Promise<GenerationRowLite> {
  const { data, error } = await db
    .from('rulebook_task_generations')
    .insert({
      tenant_id: tenantId,
      client_id: candidate.clientId,
      rule_id: candidate.ruleId,
      period_key: candidate.periodKey,
      scheduled_due_date: candidate.dueDateIso,
      status: 'created',
      generation_context: {
        rule_code: candidate.ruleCode,
        task_title: candidate.title,
        legal_basis: candidate.legalBasis,
      },
    })
    .select('id, generated_task_id, status')
    .single();

  if (error) {
    throw new Error(`[rulebook_insert_generation] ${error.message}`);
  }

  return data as GenerationRowLite;
}

async function linkGenerationToTask(
  db: RulebookDbClient,
  generationId: string,
  taskId: string
): Promise<void> {
  const { error } = await db
    .from('rulebook_task_generations')
    .update({
      generated_task_id: taskId,
      status: 'linked',
      error_message: null,
    })
    .eq('id', generationId);

  if (error) {
    throw new Error(`[rulebook_link_generation] ${error.message}`);
  }
}

async function setGenerationError(
  db: RulebookDbClient,
  generationId: string,
  message: string
): Promise<void> {
  await db
    .from('rulebook_task_generations')
    .update({
      status: 'error',
      error_message: message.slice(0, 1200),
    })
    .eq('id', generationId);
}

async function createTaskForCandidate(
  db: DbClient,
  tenantId: string,
  createdBy: string,
  candidate: RulebookGenerationCandidate
): Promise<string> {
  const { data, error } = await db
    .from('tasks')
    .insert({
      tenant_id: tenantId,
      client_id: candidate.clientId,
      title: candidate.title,
      description: candidate.description,
      status: 'todo',
      type: candidate.taskType,
      due_date: candidate.dueDateIso,
      priority: candidate.priority,
      assignee_id: candidate.assigneeId,
      created_by: createdBy,
      recurrence: candidate.recurrence,
      recurrence_days: candidate.recurrenceDays,
      period: candidate.periodKey,
      proof_required: candidate.proofRequired,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Task insert failed');
  }

  return data.id;
}

function pickRunWindow(input: RunRulebookTaskGenerationInput): { fromDate: Date; toDate: Date } {
  const fromDate = input.fromDate ? new Date(`${input.fromDate}T00:00:00.000Z`) : new Date();
  const toDate = input.toDate ? new Date(`${input.toDate}T00:00:00.000Z`) : addDays(fromDate, 45);

  const fromDay = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const toDay = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));

  if (toDay < fromDay) {
    throw new Error('Generation window is invalid: toDate must be >= fromDate');
  }

  return { fromDate: fromDay, toDate: toDay };
}

function shouldIncludeDueDate(dueDate: Date, fromDate: Date, toDate: Date): boolean {
  return dueDate >= fromDate && dueDate <= toDate;
}

function buildOverrideMap(overrides: RulebookRuleOverrideRuntime[]): Map<string, RulebookRuleOverrideRuntime> {
  const map = new Map<string, RulebookRuleOverrideRuntime>();
  overrides.forEach((row) => {
    map.set(`${row.client_id}::${row.rule_id}`, row);
  });
  return map;
}

function appendAuditMessage(base: string | null, legalBasis: string[]): string | null {
  if (legalBasis.length === 0) return base;
  const tail = `SSOT rulebook: ${legalBasis.join('; ')}`;
  if (!base) return tail;
  return `${base}\n\n${tail}`;
}

async function writeAuditSummary(
  db: DbClient,
  summary: RulebookTaskGenerationSummary,
  actorProfileId?: string
): Promise<void> {
  await db.from('audit_log').insert({
    tenant_id: summary.tenantId,
    actor_id: actorProfileId ?? null,
    entity: 'rulebook_generation',
    entity_id: summary.activeVersion?.id ?? crypto.randomUUID(),
    action: summary.dryRun ? 'rulebook_dry_run' : 'rulebook_generation_run',
    meta: {
      from_date: summary.fromDate,
      to_date: summary.toDate,
      active_version: summary.activeVersion,
      processed_clients: summary.processedClients,
      evaluated_rules: summary.evaluatedRules,
      matched_candidates: summary.matchedCandidates,
      created_tasks: summary.createdTasks,
      linked_existing_tasks: summary.linkedExistingTasks,
      skipped_already_generated: summary.skippedAlreadyGenerated,
      skipped_by_condition: summary.skippedByCondition,
      skipped_no_assignee: summary.skippedNoAssignee,
      errors_count: summary.errors.length,
    },
  });
}

export async function runRulebookTaskGeneration(
  db: DbClient,
  input: RunRulebookTaskGenerationInput
): Promise<RulebookTaskGenerationSummary> {
  const rulebookDb = asRulebookClient(db);
  const { fromDate, toDate } = pickRunWindow(input);
  const summary: RulebookTaskGenerationSummary = {
    tenantId: input.tenantId,
    dryRun: Boolean(input.dryRun),
    fromDate: toIsoDate(fromDate),
    toDate: toIsoDate(toDate),
    activeVersion: null,
    processedClients: 0,
    evaluatedRules: 0,
    matchedCandidates: 0,
    createdTasks: 0,
    linkedExistingTasks: 0,
    skippedAlreadyGenerated: 0,
    skippedByCondition: 0,
    skippedNoAssignee: 0,
    errors: [],
  };

  const activeVersion = await fetchActiveVersion(rulebookDb, input.tenantId);
  if (!activeVersion) {
    return summary;
  }

  summary.activeVersion = { id: activeVersion.id, code: activeVersion.code };

  const [rules, clients, overrides, assignmentsByClient, profiles] = await Promise.all([
    fetchRules(rulebookDb, input.tenantId, activeVersion.id),
    fetchClients(rulebookDb, input.tenantId),
    fetchOverrides(rulebookDb, input.tenantId),
    fetchAssignments(db, input.tenantId),
    fetchActiveProfiles(db, input.tenantId),
  ]);

  const overrideMap = buildOverrideMap(overrides);
  const fallbackAdminId = profiles.find((profile) => profile.role === 'admin')?.id ?? null;
  const fallbackAccountantId = profiles.find((profile) => profile.role === 'accountant')?.id ?? null;
  const createdBy = input.actorProfileId ?? fallbackAdminId ?? fallbackAccountantId ?? null;

  const scanStart = addDays(fromDate, -370);

  for (const client of clients) {
    const profile = normalizeClientProfile(client);
    summary.processedClients += 1;

    for (const rule of rules) {
      summary.evaluatedRules += 1;

      const override = overrideMap.get(`${client.id}::${rule.id}`);
      const merged = mergeRuleWithOverride(rule, override);

      if (!merged.enabled || !merged.recurrence || !merged.dueRule || !merged.taskTemplate) {
        continue;
      }

      if (!evaluateRuleCondition(rule.match_condition as Record<string, unknown>, profile)) {
        summary.skippedByCondition += 1;
        continue;
      }

      const assigneeId = resolveAssigneeId(
        client.id,
        merged.taskTemplate,
        assignmentsByClient,
        fallbackAdminId,
        fallbackAccountantId
      );

      if (!assigneeId) {
        summary.skippedNoAssignee += 1;
        continue;
      }

      const periods = enumeratePeriodsInRange(scanStart, toDate, merged.recurrence);

      for (const period of periods) {
        const resolved = resolveDueDateForPeriod(period, merged.dueRule, {
          holidays: input.holidays ?? [],
          profileDayValues: {
            payroll_advance_day: profile.payroll_advance_day,
            payroll_final_day: profile.payroll_final_day,
          },
        });

        if (!shouldIncludeDueDate(resolved.dueDate, fromDate, toDate)) {
          continue;
        }

        const recurrence = mapRuleRecurrenceToTaskRecurrence(merged.recurrence);
        const recurrenceDays = buildRecurrenceDays(merged.recurrence, profile, merged.dueRule);

        const description = appendAuditMessage(
          buildTaskDescription(merged.taskTemplate, rule.legal_basis ?? []),
          rule.legal_basis ?? []
        );

        const candidate: RulebookGenerationCandidate = {
          clientId: client.id,
          ruleId: rule.id,
          ruleCode: rule.code,
          periodKey: resolved.periodKey,
          dueDateIso: toIsoDate(resolved.dueDate),
          title: merged.taskTemplate.title,
          description,
          taskType: (merged.taskTemplate.task_type ?? 'other') as TaskType,
          priority: (merged.taskTemplate.priority ?? 2) as TaskPriority,
          proofRequired: Boolean(merged.taskTemplate.proof_required),
          recurrence,
          recurrenceDays,
          assigneeId,
          legalBasis: rule.legal_basis ?? [],
        };

        summary.matchedCandidates += 1;

        if (summary.dryRun) {
          continue;
        }

        let generation = await getGenerationRecord(
          rulebookDb,
          input.tenantId,
          candidate.clientId,
          candidate.ruleId,
          candidate.periodKey
        );

        if (generation?.generated_task_id) {
          summary.skippedAlreadyGenerated += 1;
          continue;
        }

        if (!generation) {
          try {
            generation = await createGenerationRecord(rulebookDb, input.tenantId, candidate);
          } catch (insertError) {
            // If another process inserted in parallel, re-read and continue.
            generation = await getGenerationRecord(
              rulebookDb,
              input.tenantId,
              candidate.clientId,
              candidate.ruleId,
              candidate.periodKey
            );

            if (!generation) {
              summary.errors.push({
                clientId: candidate.clientId,
                ruleCode: candidate.ruleCode,
                periodKey: candidate.periodKey,
                message: insertError instanceof Error ? insertError.message : 'Failed to create generation row',
              });
              continue;
            }
          }
        } else if (!input.forceRetryWithoutLinkedTask) {
          summary.skippedAlreadyGenerated += 1;
          continue;
        }

        try {
          const existingTaskId = await findExistingTask(db, input.tenantId, candidate);
          if (existingTaskId) {
            await linkGenerationToTask(rulebookDb, generation.id, existingTaskId);
            summary.linkedExistingTasks += 1;
            continue;
          }

          if (!createdBy) {
            throw new Error('No available created_by profile for generated tasks');
          }

          const taskId = await createTaskForCandidate(db, input.tenantId, createdBy, candidate);
          await linkGenerationToTask(rulebookDb, generation.id, taskId);
          summary.createdTasks += 1;
        } catch (taskError) {
          const message = taskError instanceof Error ? taskError.message : 'Unknown task generation error';
          await setGenerationError(rulebookDb, generation.id, message);
          summary.errors.push({
            clientId: candidate.clientId,
            ruleCode: candidate.ruleCode,
            periodKey: candidate.periodKey,
            message,
          });
        }
      }
    }
  }

  if (!summary.dryRun) {
    await writeAuditSummary(db, summary, input.actorProfileId);
  }

  return summary;
}
