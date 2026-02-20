'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/server/supabase-browser';
import type { Database } from '@/lib/database.types';
import type { RulebookDatabase } from '@/lib/server/rulebook/db.types';
import {
  deleteRulebookRule,
  initCurrentTenantRulebook,
  setRulebookRuleActive,
  upsertRulebookRule,
  type InitCurrentTenantRulebookInput,
} from '@/lib/actions/rulebook';
import {
  mapRuleRowToFormInput,
  type RulebookRuleFormInput,
  type RulebookVersionSummary,
} from '@/lib/rulebook-ui';
import { queryKeys } from '@/lib/query-keys';

type DbClient = SupabaseClient<Database>;
type RulebookDbClient = SupabaseClient<RulebookDatabase>;

interface RulebookRuleRow {
  id: string;
  code: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  legal_basis: string[] | null;
  match_condition: Record<string, unknown>;
  recurrence: Record<string, unknown>;
  due_rule: Record<string, unknown>;
  task_template: Record<string, unknown>;
  updated_at: string;
}

export interface RulebookQueryData {
  activeVersion: RulebookVersionSummary | null;
  rules: RulebookRuleFormInput[];
}

function asRulebookClient(db: DbClient): RulebookDbClient {
  return db as unknown as RulebookDbClient;
}

function invalidateRulebookQueries(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: queryKeys.rulebook.activeVersion });
  qc.invalidateQueries({ queryKey: queryKeys.rulebook.rules });
}

export function useRulebookRules() {
  const supabase = getSupabaseBrowserClient();

  return useQuery<RulebookQueryData>({
    queryKey: queryKeys.rulebook.rules,
    queryFn: async (): Promise<RulebookQueryData> => {
      const db = asRulebookClient(supabase);

      const { data: activeVersionData, error: versionError } = await db
        .from('rulebook_versions')
        .select('id, code, name, effective_from, is_active')
        .eq('is_active', true)
        .maybeSingle();

      if (versionError && versionError.code !== 'PGRST116') {
        throw versionError;
      }

      if (!activeVersionData) {
        return {
          activeVersion: null,
          rules: [],
        };
      }

      const activeVersion = activeVersionData as RulebookVersionSummary;

      const { data: rulesData, error: rulesError } = await db
        .from('rulebook_rules')
        .select(
          'id, code, title, is_active, sort_order, legal_basis, match_condition, recurrence, due_rule, task_template, updated_at, created_at'
        )
        .eq('version_id', activeVersion.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (rulesError) {
        throw rulesError;
      }

      return {
        activeVersion,
        rules: ((rulesData ?? []) as RulebookRuleRow[]).map((row) => mapRuleRowToFormInput(row)),
      };
    },
  });
}

export function useInitRulebook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input?: InitCurrentTenantRulebookInput) => initCurrentTenantRulebook(input),
    onSuccess: () => {
      invalidateRulebookQueries(qc);
    },
  });
}

export function useUpsertRulebookRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: RulebookRuleFormInput) => upsertRulebookRule(input),
    onSuccess: () => {
      invalidateRulebookQueries(qc);
    },
  });
}

export function useSetRulebookRuleActive() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => setRulebookRuleActive(input),
    onSuccess: () => {
      invalidateRulebookQueries(qc);
    },
  });
}

export function useDeleteRulebookRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; hardDelete?: boolean }) => deleteRulebookRule(input),
    onSuccess: () => {
      invalidateRulebookQueries(qc);
    },
  });
}
