'use server';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import type { TaxRulebookConfig } from '@/lib/types';
import type { Json } from '@/lib/database.types';

export async function updateTaxRulebook(input: TaxRulebookConfig) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може змінювати довідник.');
  }

  // Upsert the rulebook config
  const { error } = await supabase
    .from('tax_rulebook_configs')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        year: input.year,
        minimum_wage_on_january_1: input.minimum_wage_on_january_1,
        single_tax_multipliers: input.single_tax_multipliers as unknown as Json,
        vat_registration_threshold: input.vat_registration_threshold,
      },
      { onConflict: 'tenant_id,year' }
    );

  if (error) throw new Error(error.message);
}
