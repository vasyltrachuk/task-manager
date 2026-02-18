import 'server-only';

import { NextResponse } from 'next/server';

export function mapErrorToResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  if (message === 'PROFILE_NOT_FOUND') {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  if (message === 'SUBSCRIPTION_INACTIVE') {
    return NextResponse.json({ error: 'Subscription is inactive' }, { status: 402 });
  }

  if (message === 'SUBSCRIPTION_LOOKUP_FAILED') {
    return NextResponse.json({ error: 'Unable to verify subscription status' }, { status: 500 });
  }

  if (message === 'RATE_LIMITED_PRIVATE_ACTION') {
    return NextResponse.json({ error: 'Too many private action attempts. Try again later.' }, { status: 429 });
  }

  if (message === 'DPS_TOKEN_NOT_FOUND_FOR_PREFILL') {
    return NextResponse.json({
      error: 'Не знайдено активний токен ДПС у бухгалтерів. Додайте токен у Налаштуваннях інтеграцій.',
    }, { status: 409 });
  }

  if (message === 'DPS_PREFILL_FETCH_FAILED') {
    return NextResponse.json({
      error: 'ДПС тимчасово недоступна для автозаповнення. Спробуйте пізніше.',
    }, { status: 502 });
  }

  if (message.startsWith('Field "')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
