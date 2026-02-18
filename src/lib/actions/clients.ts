'use server';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { mapDbClient } from '@/lib/mappers';
import type { Client } from '@/lib/types';

export async function createClient(input: {
  name: string;
  type: string;
  tax_id_type: string;
  tax_id: string;
  status?: string;
  tax_system?: string;
  is_vat_payer?: boolean;
  income_limit?: number;
  income_limit_source?: string;
  contact_phone?: string;
  contact_email?: string;
  employee_count?: number;
  industry?: string;
  notes?: string;
  accountant_ids?: string[];
}) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { data, error } = await supabase
    .from('clients')
    .insert({
      tenant_id: ctx.tenantId,
      name: input.name.trim(),
      type: input.type,
      tax_id_type: input.tax_id_type,
      tax_id: input.tax_id.trim(),
      status: input.status || 'active',
      tax_system: input.tax_system || null,
      is_vat_payer: input.is_vat_payer ?? false,
      income_limit: input.income_limit ?? null,
      income_limit_source: input.income_limit_source ?? null,
      contact_phone: input.contact_phone || null,
      contact_email: input.contact_email || null,
      employee_count: input.employee_count ?? null,
      industry: input.industry || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert accountant assignments
  if (input.accountant_ids?.length) {
    await supabase.from('client_accountants').insert(
      input.accountant_ids.map((id, idx) => ({
        tenant_id: ctx.tenantId,
        client_id: data.id,
        accountant_id: id,
        is_primary: idx === 0,
      }))
    );
  }

  return mapDbClient(data);
}

export async function updateClient(input: Partial<Client> & { id: string; accountant_ids?: string[] }) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { data, error } = await supabase
    .from('clients')
    .update({
      name: input.name?.trim(),
      type: input.type,
      tax_id_type: input.tax_id_type,
      tax_id: input.tax_id?.trim(),
      status: input.status,
      tax_system: input.tax_system || null,
      is_vat_payer: input.is_vat_payer,
      income_limit: input.income_limit ?? null,
      income_limit_source: input.income_limit_source ?? null,
      contact_phone: input.contact_phone || null,
      contact_email: input.contact_email || null,
      employee_count: input.employee_count ?? null,
      industry: input.industry || null,
      notes: input.notes || null,
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Sync accountant assignments if provided
  if (input.accountant_ids !== undefined) {
    // Delete existing
    await supabase
      .from('client_accountants')
      .delete()
      .eq('client_id', input.id)
      .eq('tenant_id', ctx.tenantId);

    // Insert new
    if (input.accountant_ids.length) {
      await supabase.from('client_accountants').insert(
        input.accountant_ids.map((id, idx) => ({
          tenant_id: ctx.tenantId,
          client_id: input.id,
          accountant_id: id,
          is_primary: idx === 0,
        }))
      );
    }
  }

  return mapDbClient(data);
}

export async function archiveClient(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може архівувати клієнтів.');
  }

  const { error } = await supabase
    .from('clients')
    .update({ status: 'archived' })
    .eq('id', clientId);

  if (error) throw new Error(error.message);
}
