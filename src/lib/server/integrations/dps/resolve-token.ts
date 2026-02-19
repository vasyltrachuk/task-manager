import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import { DpsTokenRepo } from './token.repo';

interface ResolveInput {
  db: SupabaseClient;
  tenantId: string;
  clientId: string;
}

interface ResolveByProfilesInput {
  db: SupabaseClient;
  tenantId: string;
  profileIds: string[];
  fallbackToAnyAccountant?: boolean;
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

interface AccountantCandidate {
  accountant_id: string;
  is_primary: boolean;
}

export const DPS_TOKEN_OWNER_ROLES = ['accountant', 'admin'] as const;
const dpsTokenOwnerRoleSet = new Set<string>(DPS_TOKEN_OWNER_ROLES);

export function isEligibleDpsTokenOwnerRole(role: string): boolean {
  return dpsTokenOwnerRoleSet.has(role);
}

function uniqueTrimmedValues(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

async function getActiveTokenOwnerIds(
  db: SupabaseClient,
  tenantId: string,
  profileIds?: string[]
): Promise<Set<string>> {
  const normalizedIds = profileIds ? uniqueTrimmedValues(profileIds) : undefined;
  if (normalizedIds && normalizedIds.length === 0) {
    return new Set();
  }

  let query = db
    .from('profiles')
    .select('id, is_active, role')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role', [...DPS_TOKEN_OWNER_ROLES]);

  if (normalizedIds) {
    query = query.in('id', normalizedIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[dps_resolve_profiles] ${error.message}`);
  }

  return new Set(
    ((data ?? []) as ProfileRow[]).map((profile) => profile.id)
  );
}

async function resolveTokenFromOrderedCandidates(
  db: SupabaseClient,
  tenantId: string,
  candidates: AccountantCandidate[]
): Promise<ResolvedClientToken | null> {
  if (candidates.length === 0) return null;

  const repo = new DpsTokenRepo(db, { tenantId } as TenantContext);
  const tokens = await repo.getActiveTokensByProfiles(candidates.map((candidate) => candidate.accountant_id));

  for (const candidate of candidates) {
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

export function orderAccountantCandidates(
  assignments: Array<{ accountant_id: string; is_primary: boolean }>,
  activeAccountantIds: Set<string>
): Array<{ accountant_id: string; is_primary: boolean }> {
  return assignments
    .filter((assignment) => activeAccountantIds.has(assignment.accountant_id))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

export async function resolveTokenForProfiles(input: ResolveByProfilesInput): Promise<ResolvedClientToken | null> {
  const profileIds = uniqueTrimmedValues(input.profileIds);
  const activeTokenOwners = await getActiveTokenOwnerIds(input.db, input.tenantId, profileIds);

  const prioritizedCandidates = orderAccountantCandidates(
    profileIds.map((profileId, index) => ({
      accountant_id: profileId,
      is_primary: index === 0,
    })),
    activeTokenOwners
  );

  const tokenFromSelected = await resolveTokenFromOrderedCandidates(
    input.db,
    input.tenantId,
    prioritizedCandidates
  );

  if (tokenFromSelected || !input.fallbackToAnyAccountant) {
    return tokenFromSelected;
  }

  const fallbackCandidates = Array.from(await getActiveTokenOwnerIds(input.db, input.tenantId)).map((profileId) => ({
    accountant_id: profileId,
    is_primary: false,
  }));

  return resolveTokenFromOrderedCandidates(input.db, input.tenantId, fallbackCandidates);
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

  const activeTokenOwners = await getActiveTokenOwnerIds(db, tenantId, typedAssignments.map((row) => row.accountant_id));
  const sortedCandidates = orderAccountantCandidates(typedAssignments, activeTokenOwners);
  return resolveTokenFromOrderedCandidates(db, tenantId, sortedCandidates);
}
