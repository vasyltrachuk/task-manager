import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import { DpsTokenRepo } from './token.repo';

interface ResolveInput {
  db: SupabaseClient;
  tenantId: string;
  clientId: string;
}

export interface ResolvedClientToken {
  profileId: string;
  token: string;
  maskedToken: string;
  tokenRecordId: string;
  isPrimary: boolean;
}

interface ClientAccountantRow {
  accountant_id: string;
  is_primary: boolean;
}

interface ProfileRow {
  id: string;
  is_active: boolean;
  role: string;
}

export function orderAccountantCandidates(
  assignments: Array<{ accountant_id: string; is_primary: boolean }>,
  activeAccountantIds: Set<string>
): Array<{ accountant_id: string; is_primary: boolean }> {
  return assignments
    .filter((assignment) => activeAccountantIds.has(assignment.accountant_id))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

export async function resolveTokenForClient(input: ResolveInput): Promise<ResolvedClientToken | null> {
  const { db, tenantId, clientId } = input;

  const { data: assignments, error: assignmentsError } = await db
    .from('client_accountants')
    .select('accountant_id, is_primary')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId);

  if (assignmentsError) {
    throw new Error(`[dps_resolve_assignments] ${assignmentsError.message}`);
  }

  const typedAssignments = (assignments ?? []) as ClientAccountantRow[];
  if (typedAssignments.length === 0) return null;

  const accountantIds = typedAssignments.map((row) => row.accountant_id);
  const { data: profiles, error: profilesError } = await db
    .from('profiles')
    .select('id, is_active, role')
    .eq('tenant_id', tenantId)
    .in('id', accountantIds);

  if (profilesError) {
    throw new Error(`[dps_resolve_profiles] ${profilesError.message}`);
  }

  const activeAccountants = new Set(
    ((profiles ?? []) as ProfileRow[])
      .filter((profile) => profile.is_active && profile.role === 'accountant')
      .map((profile) => profile.id)
  );

  const sortedCandidates = orderAccountantCandidates(typedAssignments, activeAccountants);

  if (sortedCandidates.length === 0) return null;

  const repo = new DpsTokenRepo(db, { tenantId } as TenantContext);
  const tokens = await repo.getActiveTokensByProfiles(sortedCandidates.map((candidate) => candidate.accountant_id));

  for (const candidate of sortedCandidates) {
    const token = tokens.get(candidate.accountant_id);
    if (!token) continue;

    return {
      profileId: candidate.accountant_id,
      token: token.token,
      maskedToken: token.masked,
      tokenRecordId: token.tokenId,
      isPrimary: candidate.is_primary,
    };
  }

  return null;
}
