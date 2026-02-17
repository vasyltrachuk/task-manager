import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from './tenant-context';

export type DbClient = SupabaseClient;

/**
 * Base repository class. Every concrete repo extends this to get
 * automatic tenant scoping on all queries.
 *
 * RLS is the PRIMARY safety layer. The withTenant() filter is a
 * SECONDARY defense-in-depth layer at the application level.
 */
export abstract class BaseRepo {
  protected readonly db: DbClient;
  protected readonly tenantId: string;

  constructor(db: DbClient, ctx: TenantContext) {
    this.db = db;
    this.tenantId = ctx.tenantId;
  }

  protected withTenant<T extends { eq: (col: string, val: string) => T }>(
    query: T
  ): T {
    return query.eq('tenant_id', this.tenantId);
  }
}

/**
 * Functional alternative to class-based repos.
 * Use when a repo only needs 1-2 methods.
 */
export function createRepoContext(db: DbClient, ctx: TenantContext) {
  return {
    db,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: ctx.userRole,

    scoped<T extends { eq: (col: string, val: string) => T }>(query: T): T {
      return query.eq('tenant_id', ctx.tenantId);
    },
  };
}

/**
 * Unwraps Supabase {data, error} response. Throws on error or null data.
 */
export function unwrapOrThrow<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string
): T {
  if (result.error) {
    throw new Error(`[${context}] ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`[${context}] No data returned`);
  }
  return result.data;
}
