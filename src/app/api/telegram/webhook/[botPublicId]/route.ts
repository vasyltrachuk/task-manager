import { NextResponse } from 'next/server';
import { handleTelegramWebhook } from '@/lib/server/telegram/webhook-handler';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ botPublicId: string }> }
) {
  const { botPublicId } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const result = await handleTelegramWebhook({
    botPublicId,
    secretToken: request.headers.get('x-telegram-bot-api-secret-token'),
    payload,
  });

  return NextResponse.json(result.body, { status: result.status });
}
