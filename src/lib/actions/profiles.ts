'use server';

import { randomUUID } from 'node:crypto';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { mapDbProfile } from '@/lib/mappers';
import type { Profile } from '@/lib/types';

function generateStrongPassword(): string {
  return `${randomUUID()}Aa1!`;
}

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

  const generatedPassword = generateStrongPassword();

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

export async function regenerateProfilePassword(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може перегенеровувати паролі.');
  }

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, tenant_id')
    .eq('id', profileId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (targetError) throw new Error(targetError.message);
  if (!targetProfile) throw new Error('Профіль не знайдено.');

  if (targetProfile.role !== 'accountant') {
    throw new Error('Можна перегенеровувати пароль лише для бухгалтера.');
  }

  if (!targetProfile.email) {
    throw new Error('У профілю немає email. Оновіть email перед перегенерацією пароля.');
  }

  const generatedPassword = generateStrongPassword();
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
    password: generatedPassword,
  });

  if (authError) throw new Error(authError.message);

  return {
    id: targetProfile.id,
    full_name: targetProfile.full_name,
    email: targetProfile.email,
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

  if (ctx.userId === profileId) {
    throw new Error('Неможливо деактивувати власний профіль.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', profileId)
    .eq('tenant_id', ctx.tenantId);

  if (error) throw new Error(error.message);

  const { error: memberError } = await supabase
    .from('tenant_members')
    .update({ is_active: false })
    .eq('tenant_id', ctx.tenantId)
    .eq('profile_id', profileId);

  if (memberError) throw new Error(memberError.message);
}

export async function reactivateProfile(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може активувати профілі.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('id', profileId)
    .eq('tenant_id', ctx.tenantId);

  if (error) throw new Error(error.message);

  const { error: memberError } = await supabase
    .from('tenant_members')
    .update({ is_active: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('profile_id', profileId);

  if (memberError) throw new Error(memberError.message);
}

async function countProfileReferences(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: {
    table: string;
    column: string;
    profileId: string;
    tenantId?: string;
  }
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from(params.table)
    .select('*', { count: 'exact', head: true })
    .eq(params.column, params.profileId);

  if (params.tenantId) {
    query = query.eq('tenant_id', params.tenantId);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteProfileSafely(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може видаляти профілі.');
  }

  if (ctx.userId === profileId) {
    throw new Error('Неможливо видалити власний профіль.');
  }

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('id', profileId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (targetError) throw new Error(targetError.message);
  if (!targetProfile) throw new Error('Профіль не знайдено.');
  if (targetProfile.role !== 'accountant') {
    throw new Error('Можна видаляти лише профілі бухгалтерів.');
  }

  const clientLinks = await countProfileReferences(supabase, {
    table: 'client_accountants',
    column: 'accountant_id',
    profileId,
    tenantId: ctx.tenantId,
  });

  if (clientLinks > 0) {
    throw new Error('Неможливо видалити бухгалтера: спочатку приберіть його з клієнтів.');
  }

  const historyChecks = [
    { table: 'audit_log', column: 'actor_id', withTenant: true },
    { table: 'conversation_participants', column: 'profile_id', withTenant: false },
    { table: 'conversations', column: 'assigned_accountant_id', withTenant: true },
    { table: 'documents', column: 'created_by', withTenant: true },
    { table: 'licenses', column: 'responsible_id', withTenant: true },
    { table: 'messages', column: 'sender_profile_id', withTenant: true },
    { table: 'notifications', column: 'user_id', withTenant: true },
    { table: 'task_comments', column: 'author_id', withTenant: true },
    { table: 'task_documents', column: 'linked_by', withTenant: true },
    { table: 'task_files', column: 'uploaded_by', withTenant: true },
    { table: 'tasks', column: 'assignee_id', withTenant: true },
    { table: 'tasks', column: 'created_by', withTenant: true },
  ] as const;

  const historyCounts = await Promise.all(
    historyChecks.map((check) =>
      countProfileReferences(supabase, {
        table: check.table,
        column: check.column,
        profileId,
        tenantId: check.withTenant ? ctx.tenantId : undefined,
      })
    )
  );

  const hasHistory = historyCounts.some((count) => count > 0);
  if (hasHistory) {
    throw new Error('Неможливо видалити бухгалтера: у профілі є історичні дані.');
  }

  const { error: memberError } = await supabaseAdmin
    .from('tenant_members')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('profile_id', profileId);

  if (memberError) throw new Error(memberError.message);

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', profileId)
    .eq('tenant_id', ctx.tenantId);

  if (profileError) throw new Error(profileError.message);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(profileId);
  if (authError) throw new Error(authError.message);
}
