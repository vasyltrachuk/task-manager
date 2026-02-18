'use server';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';

export async function createLicense(input: {
  client_id: string;
  responsible_id: string;
  type: string;
  number: string;
  issuing_authority: string;
  place_of_activity?: string;
  status?: string;
  issued_at: string;
  valid_from: string;
  valid_to?: string;
  payment_frequency?: string;
  next_payment_due?: string;
  next_check_due?: string;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      tenant_id: ctx.tenantId,
      client_id: input.client_id,
      responsible_id: input.responsible_id,
      type: input.type,
      number: input.number.trim(),
      issuing_authority: input.issuing_authority.trim(),
      place_of_activity: input.place_of_activity || null,
      status: input.status || 'draft',
      issued_at: input.issued_at,
      valid_from: input.valid_from,
      valid_to: input.valid_to || null,
      payment_frequency: input.payment_frequency || 'none',
      next_payment_due: input.next_payment_due || null,
      next_check_due: input.next_check_due || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateLicense(input: {
  id: string;
  client_id?: string;
  responsible_id?: string;
  type?: string;
  number?: string;
  issuing_authority?: string;
  place_of_activity?: string;
  status?: string;
  issued_at?: string;
  valid_from?: string;
  valid_to?: string;
  payment_frequency?: string;
  next_payment_due?: string;
  next_check_due?: string;
  last_check_result?: string;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  await buildTenantContextFromSession(supabase);

  const { id, ...fields } = input;

  const { error } = await supabase
    .from('licenses')
    .update(fields)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteLicense(licenseId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може видаляти ліцензії.');
  }

  const { error } = await supabase.from('licenses').delete().eq('id', licenseId);
  if (error) throw new Error(error.message);
}
