import { NextResponse } from 'next/server';
import { runPrivateDpsAction } from '@/lib/server/integrations/dps/private-action.use-case';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { assertNonEmptyString } from '@/lib/server/integrations/dps/validation';
import { resolveClientByIdOrTaxId } from '@/lib/server/integrations/dps/client-resolution';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const action = assertNonEmptyString(formData.get('action'), 'action');
    const keyPassword = assertNonEmptyString(formData.get('keyPassword'), 'keyPassword');
    const taxId = typeof formData.get('taxId') === 'string'
      ? assertNonEmptyString(formData.get('taxId'), 'taxId')
      : undefined;

    const client = await resolveClientByIdOrTaxId({
      db: supabase,
      tenantId: ctx.tenantId,
      clientId,
      taxId,
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const keyFileValue = formData.get('keyFile');
    if (!(keyFileValue instanceof File)) {
      return NextResponse.json({ error: 'Field "keyFile" must be a file' }, { status: 400 });
    }

    const payloadRaw = formData.get('payload');
    let payload: Record<string, unknown> = {};

    if (typeof payloadRaw === 'string' && payloadRaw.trim()) {
      try {
        payload = JSON.parse(payloadRaw) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Field "payload" must contain valid JSON' }, { status: 400 });
      }
    }

    const keyBuffer = Buffer.from(await keyFileValue.arrayBuffer());

    const result = await runPrivateDpsAction(supabase, {
      tenantId: ctx.tenantId,
      clientId: client.id,
      actorProfileId: ctx.userId,
      action,
      payload,
      keyPassword,
      keyFile: keyBuffer,
    });

    return NextResponse.json(result);
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
