import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionContext, jsonError } from '@/lib/server/integrations/dps/http';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

function generateLinkCode(): string {
  // 6-char alphanumeric (uppercase + digits) — easy to dictate verbally
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** POST — generate a one-time linking code for a staff profile */
export async function POST(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (ctx.userRole !== 'admin') {
      return jsonError('Тільки адмін може генерувати код підключення.', 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
    if (!profileId) {
      return jsonError('profileId is required.', 400);
    }

    // Verify profile belongs to same tenant
    const profileResult = await supabase
      .from('profiles')
      .select('id, telegram_chat_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', profileId)
      .maybeSingle();

    if (!profileResult.data?.id) {
      return jsonError('Профіль не знайдено.', 404);
    }

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min TTL

    const updateResult = await supabaseAdmin
      .from('profiles')
      .update({
        telegram_link_code: code,
        telegram_link_code_expires_at: expiresAt,
      })
      .eq('id', profileId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    // Fetch bot username for the instruction text
    const botResult = await supabase
      .from('tenant_bots')
      .select('bot_username')
      .eq('tenant_id', ctx.tenantId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      code,
      expiresAt,
      botUsername: botResult.data?.bot_username ?? null,
      alreadyLinked: Boolean(profileResult.data.telegram_chat_id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}

/** DELETE — unlink Telegram from a staff profile */
export async function DELETE(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (ctx.userRole !== 'admin') {
      return jsonError('Тільки адмін може відключити Telegram.', 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
    if (!profileId) {
      return jsonError('profileId is required.', 400);
    }

    // Verify profile belongs to same tenant
    const profileResult = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', profileId)
      .maybeSingle();

    if (!profileResult.data?.id) {
      return jsonError('Профіль не знайдено.', 404);
    }

    const updateResult = await supabaseAdmin
      .from('profiles')
      .update({
        telegram_chat_id: null,
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', profileId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
