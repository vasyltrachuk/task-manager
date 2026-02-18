import { NextResponse } from 'next/server';
import { DpsSnapshotRepo } from '@/lib/server/integrations/dps/snapshot.repo';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { assertNonEmptyString } from '@/lib/server/integrations/dps/validation';
import type { DpsKepProfileInput } from '@/lib/server/integrations/dps/contracts';
import { resolveClientByIdOrTaxId } from '@/lib/server/integrations/dps/client-resolution';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const taxId = typeof body.taxId === 'string' && body.taxId.trim() ? body.taxId.trim() : undefined;

    const client = await resolveClientByIdOrTaxId({
      db: supabase,
      tenantId: ctx.tenantId,
      clientId,
      taxId,
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const payload: DpsKepProfileInput = {
      keyOwnerName: assertNonEmptyString(body.keyOwnerName, 'keyOwnerName'),
      keyOwnerTaxId: assertNonEmptyString(body.keyOwnerTaxId, 'keyOwnerTaxId'),
      certSubject: typeof body.certSubject === 'string' ? body.certSubject : null,
      certIssuer: typeof body.certIssuer === 'string' ? body.certIssuer : null,
      certSerial: typeof body.certSerial === 'string' ? body.certSerial : null,
      certValidTo: typeof body.certValidTo === 'string' ? body.certValidTo : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    };

    const snapshotRepo = new DpsSnapshotRepo(supabase, ctx);
    const kepProfile = await snapshotRepo.upsertKepProfile(client.id, payload);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'clients',
      entity_id: client.id,
      action: 'kep_profile_updated',
      meta: {
        provider: 'dps',
      },
    });

    return NextResponse.json({ kepProfile });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
