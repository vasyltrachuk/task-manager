import 'server-only';

import { NextResponse } from 'next/server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';

export async function getSessionContext() {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);
  return { supabase, ctx };
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function isPrivilegedRole(role?: string): boolean {
  return role === 'admin' || role === 'accountant';
}
