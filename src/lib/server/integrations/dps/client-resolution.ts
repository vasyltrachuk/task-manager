import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

interface ResolveClientInput {
  db: SupabaseClient;
  tenantId: string;
  clientId?: string;
  taxId?: string;
}

export interface ResolvedClient {
  id: string;
  tax_id: string;
}

export async function resolveClientByIdOrTaxId(input: ResolveClientInput): Promise<ResolvedClient | null> {
  const taxId = input.taxId?.trim();
  const clientId = input.clientId?.trim();

  let query = input.db
    .from('clients')
    .select('id, tax_id')
    .eq('tenant_id', input.tenantId);

  if (clientId && isUuid(clientId)) {
    query = query.eq('id', clientId);
  } else if (taxId) {
    query = query.eq('tax_id', taxId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`[dps_client_lookup] ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id as string,
    tax_id: data.tax_id as string,
  };
}
