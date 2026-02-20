import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { createTelegramBotClient } from '@/lib/server/telegram/bot-factory';
import { lookupActiveBotToken } from '@/lib/server/telegram/shared';

export const runtime = 'nodejs';

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

function contentTypeFromFilePath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

async function resolveClientBotId(input: {
  tenantId: string;
  clientId: string;
}): Promise<string | null> {
  const conversationResult = await supabaseAdmin
    .from('conversations')
    .select('bot_id')
    .eq('tenant_id', input.tenantId)
    .eq('client_id', input.clientId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (conversationResult.error) {
    throw new Error(conversationResult.error.message);
  }

  if (conversationResult.data?.[0]?.bot_id) {
    return conversationResult.data[0].bot_id;
  }

  const contactResult = await supabaseAdmin
    .from('telegram_contacts')
    .select('bot_id')
    .eq('tenant_id', input.tenantId)
    .eq('client_id', input.clientId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (contactResult.error) {
    throw new Error(contactResult.error.message);
  }

  return contactResult.data?.[0]?.bot_id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createSupabaseServerClient();
    const ctx = await buildTenantContextFromSession(supabase);

    if (!ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (ctx.userRole !== 'admin' && ctx.userRole !== 'accountant') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clientResult = await supabaseAdmin
      .from('clients')
      .select('id, avatar_telegram_file_id')
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
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const fileId = clientResult.data.avatar_telegram_file_id;
    if (!fileId) {
      return NextResponse.json({ error: 'Client avatar is not set.' }, { status: 404 });
    }

    const botId = await resolveClientBotId({
      tenantId: ctx.tenantId,
      clientId,
    });

    if (!botId) {
      return NextResponse.json({ error: 'Bot is not available for this avatar.' }, { status: 404 });
    }

    const token = await lookupActiveBotToken({
      tenantId: ctx.tenantId,
      botId,
    });
    const bot = await createTelegramBotClient(token);

    const { filePath } = await bot.getFile({ fileId });
    const binary = await bot.downloadFile({ filePath });

    return new Response(Buffer.from(binary), {
      status: 200,
      headers: {
        'Content-Type': contentTypeFromFilePath(filePath),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return mapContextError(error);
  }
}
