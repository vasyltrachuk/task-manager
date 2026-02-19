import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { lookupActiveBotToken, storageBucketName } from '@/lib/server/telegram/shared';
import { createTelegramBotClient } from '@/lib/server/telegram/bot-factory';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await buildTenantContextFromSession(supabase);

    const { searchParams } = new URL(request.url);
    const storagePath = searchParams.get('path');
    const attachmentId = searchParams.get('attachmentId');

    if (!storagePath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    // Ensure the path belongs to the tenant
    if (!storagePath.startsWith(`${ctx.tenantId}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If attachmentId is provided, try to stream via Telegram API (token never leaves server)
    if (attachmentId) {
      const attachmentResult = await supabaseAdmin
        .from('message_attachments')
        .select('telegram_file_id, file_name, mime, messages!inner(conversations!inner(bot_id))')
        .eq('tenant_id', ctx.tenantId)
        .eq('id', attachmentId)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = attachmentResult.data as any;
      const telegramFileId: string | null = row?.telegram_file_id ?? null;
      // Supabase nested joins return arrays — unwrap with [0]
      const msgRow = Array.isArray(row?.messages) ? row.messages[0] : row?.messages;
      const convRow = Array.isArray(msgRow?.conversations) ? msgRow.conversations[0] : msgRow?.conversations;
      const botId: string | null = convRow?.bot_id ?? null;
      const fileName: string = row?.file_name ?? 'file';
      const mime: string = row?.mime ?? 'application/octet-stream';

      if (telegramFileId && botId) {
        try {
          const token = await lookupActiveBotToken({ tenantId: ctx.tenantId, botId });
          const bot = await createTelegramBotClient(token);
          const { filePath } = await bot.getFile({ fileId: telegramFileId });

          // Proxy the file through our server — token never exposed to browser
          const telegramUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
          const upstream = await fetch(telegramUrl);

          if (!upstream.ok) {
            throw new Error(`Telegram returned ${upstream.status}`);
          }

          const contentType = upstream.headers.get('content-type') ?? mime;
          // Use inline disposition so <audio>/<video> can stream in-browser.
          // For non-media types fall back to attachment.
          const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/') || contentType.startsWith('image/');
          const disposition = isMedia
            ? `inline; filename="${encodeURIComponent(fileName)}"`
            : `attachment; filename="${encodeURIComponent(fileName)}"`;

          const headers = new Headers({
            'Content-Type': contentType,
            'Content-Disposition': disposition,
            'Cache-Control': 'private, max-age=300',
            'Accept-Ranges': 'bytes',
          });
          const contentLength = upstream.headers.get('content-length');
          if (contentLength) headers.set('Content-Length', contentLength);

          return new Response(upstream.body, { status: 200, headers });
        } catch (err) {
          // Telegram file may have expired — fall through to storage check
          console.warn('[documents/download] Telegram proxy failed:', err instanceof Error ? err.message : err);
        }
      }
    }

    // Logical Telegram paths (tenantId/tg/...) have no binary in Supabase Storage.
    // If we reach here it means: no attachmentId was provided, OR telegram_file_id
    // lookup failed (file_id expired). For tg/ paths there is nothing to fall back to.
    if (storagePath.includes('/tg/') || storagePath.includes('/pending/')) {
      console.warn('[documents/download] Telegram file unavailable — file_id may have expired. path:', storagePath);
      return NextResponse.json(
        { error: 'File temporarily unavailable. The Telegram file link may have expired.' },
        { status: 410 }
      );
    }

    // For real Supabase Storage files (e.g. uploaded documents): proxy through server.
    const { data, error } = await supabaseAdmin.storage
      .from(storageBucketName())
      .createSignedUrl(storagePath, 300);

    if (error || !data?.signedUrl) {
      console.error('[documents/download] storage error:', error?.message, 'path:', storagePath);
      return NextResponse.json(
        { error: error?.message ?? 'Unable to generate download URL' },
        { status: 500 }
      );
    }

    // Proxy storage file through server — avoids cross-origin issues for <audio>/<video>
    const upstream = await fetch(data.signedUrl);
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Storage fetch failed' }, { status: 502 });
    }

    const fileName = storagePath.split('/').pop() ?? 'file';
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/') || contentType.startsWith('image/');
    const disposition = isMedia
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : `attachment; filename="${encodeURIComponent(fileName)}"`;

    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
    });
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
