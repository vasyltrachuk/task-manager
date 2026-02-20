import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { lookupActiveBotToken } from '@/lib/server/telegram/shared';

export const runtime = 'nodejs';

interface TelegramProfilePhotoSize {
  file_id?: string;
  width?: number;
  height?: number;
}

interface TelegramProfilePhotosResult {
  total_count?: number;
  photos?: TelegramProfilePhotoSize[][];
}

interface TelegramProfilePhotosResponse {
  ok?: boolean;
  description?: string;
  result?: TelegramProfilePhotosResult;
}

function mapContextError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (message === 'PROFILE_NOT_FOUND') {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  if (message === 'SUBSCRIPTION_INACTIVE') {
    return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
  }

  if (message === 'SUBSCRIPTION_LOOKUP_FAILED') {
    return NextResponse.json({ error: 'Subscription lookup failed' }, { status: 500 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

function telegramApiBaseUrl(): string {
  return process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org';
}

function pickLargestPhotoFileId(photos: TelegramProfilePhotoSize[][] | undefined): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const firstSet = photos[0];
  if (!Array.isArray(firstSet) || firstSet.length === 0) return null;

  let best: TelegramProfilePhotoSize | null = null;
  let bestScore = -1;

  for (const item of firstSet) {
    if (!item?.file_id) continue;
    const width = typeof item.width === 'number' ? item.width : 0;
    const height = typeof item.height === 'number' ? item.height : 0;
    const score = width * height;

    if (!best || score >= bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return best?.file_id ?? null;
}

async function fetchProfilePhotoFileId(input: {
  botToken: string;
  telegramUserId: number;
}): Promise<string | null> {
  const response = await fetch(
    `${telegramApiBaseUrl()}/bot${input.botToken}/getUserProfilePhotos`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user_id: input.telegramUserId,
        limit: 1,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${response.status}: ${body || 'Unknown error'}`);
  }

  const payload = (await response.json()) as TelegramProfilePhotosResponse;
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram API getUserProfilePhotos failed');
  }

  return pickLargestPhotoFileId(payload.result?.photos);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createSupabaseServerClient();
    const ctx = await buildTenantContextFromSession(supabase);

    if (!ctx.userId || (ctx.userRole !== 'admin' && ctx.userRole !== 'accountant')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clientResult = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', clientId)
      .maybeSingle();

    if (clientResult.error) {
      return NextResponse.json({ error: clientResult.error.message }, { status: 500 });
    }

    if (!clientResult.data?.id) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    if (ctx.userRole === 'accountant') {
      const accessResult = await supabaseAdmin
        .from('client_accountants')
        .select('client_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('client_id', clientId)
        .eq('accountant_id', ctx.userId)
        .maybeSingle();

      if (accessResult.error) {
        return NextResponse.json({ error: accessResult.error.message }, { status: 500 });
      }

      if (!accessResult.data?.client_id) {
        return NextResponse.json({ error: 'Немає доступу до цього клієнта.' }, { status: 403 });
      }
    }

    const conversationResult = await supabaseAdmin
      .from('conversations')
      .select('bot_id, telegram_contact_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (conversationResult.error) {
      return NextResponse.json({ error: conversationResult.error.message }, { status: 500 });
    }

    let botId = conversationResult.data?.[0]?.bot_id ?? null;
    let telegramUserId: number | null = null;

    const latestConversation = conversationResult.data?.[0];
    if (latestConversation?.telegram_contact_id) {
      const conversationContactResult = await supabaseAdmin
        .from('telegram_contacts')
        .select('telegram_user_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('id', latestConversation.telegram_contact_id)
        .maybeSingle();

      if (conversationContactResult.error) {
        return NextResponse.json({ error: conversationContactResult.error.message }, { status: 500 });
      }

      telegramUserId = conversationContactResult.data?.telegram_user_id ?? null;
    }

    if (!botId || !telegramUserId) {
      const contactResult = await supabaseAdmin
        .from('telegram_contacts')
        .select('bot_id, telegram_user_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (contactResult.error) {
        return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
      }

      const latestContact = contactResult.data?.[0];
      botId = latestContact?.bot_id ?? botId;
      telegramUserId = latestContact?.telegram_user_id ?? telegramUserId;
    }

    if (!botId || !telegramUserId) {
      return NextResponse.json(
        { error: 'Немає привʼязаного каналу для оновлення фото.' },
        { status: 409 }
      );
    }

    const botToken = await lookupActiveBotToken({
      tenantId: ctx.tenantId,
      botId,
    });

    const fileId = await fetchProfilePhotoFileId({
      botToken,
      telegramUserId,
    });

    if (!fileId) {
      return NextResponse.json(
        { error: 'У контакту немає фото профілю в Telegram.' },
        { status: 404 }
      );
    }

    const avatarUpdatedAt = new Date().toISOString();
    const avatarUrl = `/api/clients/${clientId}/avatar`;

    const updateResult = await supabaseAdmin
      .from('clients')
      .update({
        avatar_source: 'telegram',
        avatar_telegram_file_id: fileId,
        avatar_url: avatarUrl,
        avatar_updated_at: avatarUpdatedAt,
      })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', clientId);

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      avatarUrl,
      avatarSource: 'telegram',
      avatarUpdatedAt,
    });
  } catch (error) {
    return mapContextError(error);
  }
}
