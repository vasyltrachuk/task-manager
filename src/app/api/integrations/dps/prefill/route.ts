import { NextResponse } from 'next/server';
import { buildClientPrefillFromDps } from '@/lib/server/integrations/dps/prefill.use-case';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import {
  assertNonEmptyString,
  assertTaxIdByType,
  assertTaxIdType,
  parseOptionalRegistryList,
  parseOptionalStringArray,
  type DpsTaxIdType,
} from '@/lib/server/integrations/dps/validation';

async function logPrefillAudit(
  supabase: Awaited<ReturnType<typeof getSessionContext>>['supabase'],
  input: {
    tenantId: string;
    actorId: string;
    taxIdType: DpsTaxIdType;
    taxId: string;
    sourceStatuses: Array<{ registry_code: string; status: string; is_found: boolean }>;
  }
): Promise<void> {
  await supabase.from('audit_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    entity: 'clients',
    entity_id: input.taxId,
    action: 'dps_prefill_fetched',
    meta: {
      provider: 'dps',
      tax_id_type: input.taxIdType,
      source_statuses: input.sourceStatuses,
    },
  });
}

export async function POST(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const taxIdType = assertTaxIdType(body.taxIdType);
    const taxId = assertTaxIdByType(assertNonEmptyString(body.taxId, 'taxId'), taxIdType);
    const registries = parseOptionalRegistryList(body.registries);
    const accountantIds = parseOptionalStringArray(body.accountantIds, 'accountantIds');

    const result = await buildClientPrefillFromDps(supabase, {
      tenantId: ctx.tenantId,
      actorProfileId: ctx.userId,
      taxIdType,
      taxId,
      accountantIds,
      registries,
    });

    try {
      await logPrefillAudit(supabase, {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        taxIdType,
        taxId,
        sourceStatuses: result.sources.map((source) => ({
          registry_code: source.registry_code,
          status: source.status,
          is_found: source.is_found,
        })),
      });
    } catch {
      // Audit must not block autofill response.
    }

    return NextResponse.json(result);
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
