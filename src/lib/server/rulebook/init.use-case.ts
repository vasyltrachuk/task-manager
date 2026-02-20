import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { DEFAULT_RULEBOOK_RULES, DEFAULT_RULEBOOK_VERSION } from './default-rules';
import type { RulebookDatabase } from './db.types';

type DbClient = SupabaseClient<Database>;
type RulebookDbClient = SupabaseClient<RulebookDatabase>;

interface RulebookVersionRowLite {
  id: string;
  tenant_id: string;
  code: string;
  is_active: boolean;
}

export interface InitRulebookInput {
  tenantId: string;
  actorProfileId?: string;
  versionCode?: string;
  versionName?: string;
  versionDescription?: string;
  effectiveFrom?: string;
  activateVersion?: boolean;
  replaceRules?: boolean;
}

export interface InitRulebookSummary {
  tenantId: string;
  versionId: string;
  versionCode: string;
  createdVersion: boolean;
  activatedVersion: boolean;
  replaceRules: boolean;
  upsertedRules: number;
}

function asRulebookClient(db: DbClient): RulebookDbClient {
  return db as unknown as RulebookDbClient;
}

async function fetchVersionByCode(
  db: RulebookDbClient,
  tenantId: string,
  code: string
): Promise<RulebookVersionRowLite | null> {
  const { data, error } = await db
    .from('rulebook_versions')
    .select('id, tenant_id, code, is_active')
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw new Error(`[rulebook_init_fetch_version] ${error.message}`);
  }

  return (data ?? null) as RulebookVersionRowLite | null;
}

async function createVersion(
  db: RulebookDbClient,
  input: Required<Pick<
    InitRulebookInput,
    'tenantId' | 'versionCode' | 'versionName' | 'versionDescription' | 'effectiveFrom'
  >> & {
    actorProfileId?: string;
  }
): Promise<RulebookVersionRowLite> {
  const { data, error } = await db
    .from('rulebook_versions')
    .insert({
      tenant_id: input.tenantId,
      code: input.versionCode,
      name: input.versionName,
      description: input.versionDescription,
      effective_from: input.effectiveFrom,
      is_active: false,
      created_by: input.actorProfileId ?? null,
    })
    .select('id, tenant_id, code, is_active')
    .single();

  if (error || !data) {
    throw new Error(`[rulebook_init_create_version] ${error?.message ?? 'Insert failed'}`);
  }

  return data as RulebookVersionRowLite;
}

async function activateVersion(db: RulebookDbClient, tenantId: string, versionId: string): Promise<void> {
  const { error: disableError } = await db
    .from('rulebook_versions')
    .update({ is_active: false })
    .eq('tenant_id', tenantId)
    .neq('id', versionId)
    .eq('is_active', true);

  if (disableError) {
    throw new Error(`[rulebook_init_deactivate_others] ${disableError.message}`);
  }

  const { error: activateError } = await db
    .from('rulebook_versions')
    .update({ is_active: true })
    .eq('tenant_id', tenantId)
    .eq('id', versionId);

  if (activateError) {
    throw new Error(`[rulebook_init_activate_version] ${activateError.message}`);
  }
}

async function replaceRules(db: RulebookDbClient, tenantId: string, versionId: string): Promise<void> {
  const { error } = await db
    .from('rulebook_rules')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('version_id', versionId);

  if (error) {
    throw new Error(`[rulebook_init_replace_rules] ${error.message}`);
  }
}

async function upsertDefaultRules(
  db: RulebookDbClient,
  input: {
    tenantId: string;
    versionId: string;
    actorProfileId?: string;
  }
): Promise<number> {
  const rows = DEFAULT_RULEBOOK_RULES.map((rule) => ({
    tenant_id: input.tenantId,
    version_id: input.versionId,
    code: rule.code,
    title: rule.title,
    is_active: true,
    sort_order: rule.sort_order,
    legal_basis: rule.legal_basis,
    match_condition: rule.match_condition as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['match_condition'],
    recurrence: rule.recurrence as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['recurrence'],
    due_rule: rule.due_rule as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['due_rule'],
    task_template: rule.task_template as unknown as RulebookDatabase['public']['Tables']['rulebook_rules']['Insert']['task_template'],
    created_by: input.actorProfileId ?? null,
  }));

  const { error } = await db
    .from('rulebook_rules')
    .upsert(rows, { onConflict: 'tenant_id,version_id,code' });

  if (error) {
    throw new Error(`[rulebook_init_upsert_rules] ${error.message}`);
  }

  return rows.length;
}

export async function initRulebookForTenant(
  db: DbClient,
  input: InitRulebookInput
): Promise<InitRulebookSummary> {
  const rulebookDb = asRulebookClient(db);

  const versionCode = input.versionCode ?? DEFAULT_RULEBOOK_VERSION.code;
  const versionName = input.versionName ?? DEFAULT_RULEBOOK_VERSION.name;
  const versionDescription = input.versionDescription ?? DEFAULT_RULEBOOK_VERSION.description;
  const effectiveFrom = input.effectiveFrom ?? DEFAULT_RULEBOOK_VERSION.effective_from;
  const activate = input.activateVersion ?? true;
  const shouldReplaceRules = input.replaceRules ?? false;

  let version = await fetchVersionByCode(rulebookDb, input.tenantId, versionCode);
  const createdVersion = !version;

  if (!version) {
    version = await createVersion(rulebookDb, {
      tenantId: input.tenantId,
      actorProfileId: input.actorProfileId,
      versionCode,
      versionName,
      versionDescription,
      effectiveFrom,
    });
  }

  if (shouldReplaceRules) {
    await replaceRules(rulebookDb, input.tenantId, version.id);
  }

  const upsertedRules = await upsertDefaultRules(rulebookDb, {
    tenantId: input.tenantId,
    versionId: version.id,
    actorProfileId: input.actorProfileId,
  });

  if (activate) {
    await activateVersion(rulebookDb, input.tenantId, version.id);
  }

  return {
    tenantId: input.tenantId,
    versionId: version.id,
    versionCode,
    createdVersion,
    activatedVersion: activate,
    replaceRules: shouldReplaceRules,
    upsertedRules,
  };
}
