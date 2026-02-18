import { NextResponse } from 'next/server';
import { DpsSnapshotRepo } from '@/lib/server/integrations/dps/snapshot.repo';
import { DpsSyncRunRepo } from '@/lib/server/integrations/dps/sync.repo';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { resolveClientByIdOrTaxId } from '@/lib/server/integrations/dps/client-resolution';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const { supabase, ctx } = await getSessionContext();
    const taxId = new URL(request.url).searchParams.get('taxId') ?? undefined;

    if (!isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = await resolveClientByIdOrTaxId({
      db: supabase,
      tenantId: ctx.tenantId,
      clientId,
      taxId,
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const snapshotRepo = new DpsSnapshotRepo(supabase, ctx);
    const syncRepo = new DpsSyncRunRepo(supabase, ctx);

    const [snapshots, kepProfile, latestRun] = await Promise.all([
      snapshotRepo.getClientSnapshots(client.id),
      snapshotRepo.getKepProfile(client.id),
      syncRepo.getLatestClientRun(client.id),
    ]);

    return NextResponse.json({
      clientId: client.id,
      taxId: client.tax_id,
      snapshots,
      kepProfile,
      latestRun,
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
