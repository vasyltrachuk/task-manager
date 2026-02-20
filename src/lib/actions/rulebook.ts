'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import type { RulebookDatabase } from '@/lib/server/rulebook/db.types';
import { initRulebookForTenant, type InitRulebookSummary } from '@/lib/server/rulebook/init.use-case';
import {
  buildRulebookPersistPayload,
  type RulebookRuleFormInput,
} from '@/lib/rulebook-ui';

type DbClient = SupabaseClient<Database>;
type RulebookDbClient = SupabaseClient<RulebookDatabase>;

interface ActiveVersionLite {
  id: string;
  code: string;
  name: string;
  effective_from: string;
}

function asRulebookClient(db: DbClient): RulebookDbClient {
  return db as unknown as RulebookDbClient;
}

function assertAdmin(userRole?: string): void {
  if (userRole !== 'admin') {
    throw new Error('Лише адміністратор може керувати rulebook.');
  }
}

function buildRuleCodeFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ\s_-]/gi, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 36);

  const suffix = Date.now().toString(36).slice(-6);
  const base = slug.length > 0 ? `manual_${slug}` : 'manual_rule';
  return `${base}_${suffix}`;
}

async function requireActiveVersion(
  db: RulebookDbClient,
  tenantId: string
): Promise<ActiveVersionLite> {
  const { data, error } = await db
    .from('rulebook_versions')
    .select('id, code, name, effective_from')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(`[rulebook_actions_active_version] ${error.message}`);
  }

  if (!data) {
    throw new Error('Активна версія rulebook відсутня. Спочатку виконайте init.');
  }

  return data as ActiveVersionLite;
}

export interface InitCurrentTenantRulebookInput {
  versionCode?: string;
  versionName?: string;
  versionDescription?: string;
  effectiveFrom?: string;
  activateVersion?: boolean;
  replaceRules?: boolean;
}

export async function initCurrentTenantRulebook(
  input?: InitCurrentTenantRulebookInput
): Promise<InitRulebookSummary> {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);
  assertAdmin(ctx.userRole);

  return initRulebookForTenant(supabase, {
    tenantId: ctx.tenantId,
    actorProfileId: ctx.userId,
    versionCode: input?.versionCode,
    versionName: input?.versionName,
    versionDescription: input?.versionDescription,
    effectiveFrom: input?.effectiveFrom,
    activateVersion: input?.activateVersion,
    replaceRules: input?.replaceRules,
  });
}

export async function upsertRulebookRule(
  input: RulebookRuleFormInput
): Promise<{ id: string; mode: 'created' | 'updated' }> {
  if (!input.title.trim()) {
    throw new Error('Назва правила обов’язкова.');
  }

  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);
  assertAdmin(ctx.userRole);

  const db = asRulebookClient(supabase);
  const activeVersion = await requireActiveVersion(db, ctx.tenantId);
  const payload = buildRulebookPersistPayload(input);

  if (input.id) {
    const { data, error } = await db
      .from('rulebook_rules')
      .update({
        code: payload.code ?? buildRuleCodeFromTitle(payload.title),
        title: payload.title,
        is_active: payload.is_active,
        sort_order: payload.sort_order,
        legal_basis: payload.legal_basis,
        match_condition:
          payload.match_condition as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Update']['match_condition'],
        recurrence:
          payload.recurrence as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Update']['recurrence'],
        due_rule:
          payload.due_rule as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Update']['due_rule'],
        task_template:
          payload.task_template as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Update']['task_template'],
      })
      .eq('tenant_id', ctx.tenantId)
      .eq('version_id', activeVersion.id)
      .eq('id', input.id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new Error(`[rulebook_actions_update_rule] ${error.message}`);
    }

    if (!data?.id) {
      throw new Error('Правило не знайдено в активній версії.');
    }

    return {
      id: data.id,
      mode: 'updated',
    };
  }

  const { data, error } = await db
    .from('rulebook_rules')
    .insert({
      tenant_id: ctx.tenantId,
      version_id: activeVersion.id,
      code: payload.code ?? buildRuleCodeFromTitle(payload.title),
      title: payload.title,
      is_active: payload.is_active,
      sort_order: payload.sort_order,
      legal_basis: payload.legal_basis,
      match_condition:
        payload.match_condition as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['match_condition'],
      recurrence:
        payload.recurrence as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['recurrence'],
      due_rule:
        payload.due_rule as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['due_rule'],
      task_template:
        payload.task_template as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['task_template'],
      created_by: ctx.userId ?? null,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`[rulebook_actions_create_rule] ${error?.message ?? 'Insert failed'}`);
  }

  return {
    id: data.id,
    mode: 'created',
  };
}

export async function setRulebookRuleActive(input: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);
  assertAdmin(ctx.userRole);

  const db = asRulebookClient(supabase);
  const activeVersion = await requireActiveVersion(db, ctx.tenantId);

  const { error } = await db
    .from('rulebook_rules')
    .update({
      is_active: input.isActive,
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('version_id', activeVersion.id)
    .eq('id', input.id);

  if (error) {
    throw new Error(`[rulebook_actions_toggle_rule] ${error.message}`);
  }
}

export async function deleteRulebookRule(input: {
  id: string;
  hardDelete?: boolean;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);
  assertAdmin(ctx.userRole);

  const db = asRulebookClient(supabase);
  const activeVersion = await requireActiveVersion(db, ctx.tenantId);

  if (input.hardDelete) {
    const { error } = await db
      .from('rulebook_rules')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('version_id', activeVersion.id)
      .eq('id', input.id);

    if (error) {
      throw new Error(`[rulebook_actions_delete_rule] ${error.message}`);
    }

    return;
  }

  const { error } = await db
    .from('rulebook_rules')
    .update({
      is_active: false,
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('version_id', activeVersion.id)
    .eq('id', input.id);

  if (error) {
    throw new Error(`[rulebook_actions_soft_delete_rule] ${error.message}`);
  }
}
