import { NextResponse } from 'next/server';
import { DpsTokenRepo } from '@/lib/server/integrations/dps/token.repo';
import { DpsSyncRunRepo } from '@/lib/server/integrations/dps/sync.repo';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';

export async function GET() {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tokenRepo = new DpsTokenRepo(supabase, ctx);
    const syncRepo = new DpsSyncRunRepo(supabase, ctx);

    const [tokenStatus, recentRuns] = await Promise.all([
      tokenRepo.getTokenStatus(ctx.userId),
      syncRepo.getRecentRuns(ctx.userId, 10),
    ]);

    return NextResponse.json({
      tokenStatus,
      recentRuns,
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
