import 'server-only';

import { NextResponse } from 'next/server';
import { mapErrorToResponse as mapCommonErrorToResponse } from '@/lib/server/integrations/dps/error';

function parsePrefixedMessage(message: string, prefix: string): { context: string; status: string; details: string } {
  const payload = message.startsWith(prefix) ? message.slice(prefix.length) : '';
  const [context = 'unknown', status = 'unknown', ...detailsParts] = payload.split(':');

  return {
    context: context.trim() || 'unknown',
    status: status.trim() || 'unknown',
    details: detailsParts.join(':').trim() || 'невідома помилка',
  };
}

export function mapPrivatbankErrorToResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message === 'PRIVATBANK_TOKEN_ENCRYPTION_KEY is missing') {
    return NextResponse.json({
      error: 'Відсутня змінна середовища PRIVATBANK_TOKEN_ENCRYPTION_KEY. Додайте її в .env.local та перезапустіть сервер.',
    }, { status: 500 });
  }

  if (message === 'PRIVATBANK_TOKEN_ENCRYPTION_KEY must resolve to 32 bytes') {
    return NextResponse.json({
      error: 'PRIVATBANK_TOKEN_ENCRYPTION_KEY має бути не менше 32 байтів (рекомендовано: openssl rand -base64 32).',
    }, { status: 500 });
  }

  if (message === 'PRIVATBANK_TOKEN_NOT_FOUND') {
    return NextResponse.json({
      error: 'Не знайдено активний токен PrivatBank. Додайте токен у Налаштуваннях інтеграцій.',
    }, { status: 409 });
  }

  if (message === 'PRIVATBANK_CLIENT_ID_NOT_FOUND') {
    return NextResponse.json({
      error: 'Не задано Client ID для PrivatBank. Оновіть налаштування інтеграції: Client ID + Token.',
    }, { status: 409 });
  }

  if (message.startsWith('PRIVATBANK_API_ERROR:')) {
    const parsed = parsePrefixedMessage(message, 'PRIVATBANK_API_ERROR:');

    return NextResponse.json({
      error: `PrivatBank API (${parsed.context}, ${parsed.status}) повернув помилку: ${parsed.details}`,
    }, { status: 502 });
  }

  if (message.startsWith('PRIVATBANK_API_HTTP_ERROR:')) {
    const parsed = parsePrefixedMessage(message, 'PRIVATBANK_API_HTTP_ERROR:');
    const idMissing = parsed.details.toLowerCase().includes('id is not be null');

    return NextResponse.json({
      error: idMissing
        ? 'PrivatBank API повернув помилку: відсутній Client ID (header "id"). Збережіть Client ID у налаштуваннях інтеграції.'
        : `HTTP помилка PrivatBank API (${parsed.context}, ${parsed.status}): ${parsed.details}`,
    }, { status: 502 });
  }

  return mapCommonErrorToResponse(error);
}
