'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbTaxRulebook } from '../mappers';
import { updateTaxRulebook } from '../actions/settings';
import type { TaxRulebookConfig } from '../types';

export function useTaxRulebook() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<TaxRulebookConfig | null>({
    queryKey: queryKeys.taxRulebook,
    queryFn: async (): Promise<TaxRulebookConfig | null> => {
      const { data, error } = await supabase
        .from('tax_rulebook_configs')
        .select('*')
        .order('year', { ascending: false })
        .limit(1)
        .single();
      if (error) {
        // No rulebook configured yet for tenant.
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return mapDbTaxRulebook(data);
    },
  });
}

export function useUpdateTaxRulebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTaxRulebook,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.taxRulebook });
      qc.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}
