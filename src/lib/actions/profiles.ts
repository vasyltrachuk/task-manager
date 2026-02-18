'use server';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { mapDbProfile } from '@/lib/mappers';
import type { Profile } from '@/lib/types';

export async function createProfile(input: {
  full_name: string;
  phone?: string;
  email: string;
  role?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може створювати профілі.');
  }

  const generatedPassword = Math.random().toString(36).slice(-10) + 'A1!';

  // Create auth user via admin API
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: generatedPassword,
    email_confirm: true,
  });

  if (authError) throw new Error(authError.message);

  // Insert profile
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      tenant_id: ctx.tenantId,
      full_name: input.full_name,
      role: input.role || 'accountant',
      phone: input.phone || null,
      email: input.email,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert tenant_member
  await supabase.from('tenant_members').insert({
    tenant_id: ctx.tenantId,
    profile_id: authData.user.id,
    role: input.role || 'accountant',
  });

  return {
    ...mapDbProfile(data),
    generated_password: generatedPassword,
    password_changed: false,
  };
}

export async function updateProfile(input: Partial<Profile> & { id: string }) {
  const supabase = await createSupabaseServerClient();
  await buildTenantContextFromSession(supabase);

  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name,
      phone: input.phone || null,
      email: input.email || null,
      avatar_url: input.avatar_url || null,
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbProfile(data);
}

export async function deactivateProfile(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може деактивувати профілі.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', profileId);

  if (error) throw new Error(error.message);
}
