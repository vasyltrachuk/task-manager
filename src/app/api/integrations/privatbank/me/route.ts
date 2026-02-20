import { NextResponse } from 'next/server';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';
import { mapPrivatbankErrorToResponse } from '@/lib/server/integrations/privatbank/error';
import { PrivatbankTokenRepo } from '@/lib/server/integrations/privatbank/token.repo';

export async function GET() {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tokenRepo = new PrivatbankTokenRepo(supabase, ctx);
    const tokenStatus = await tokenRepo.getTokenStatus(ctx.userId);

    return NextResponse.json({ tokenStatus });
  } catch (error) {
    return mapPrivatbankErrorToResponse(error);
  }
}
