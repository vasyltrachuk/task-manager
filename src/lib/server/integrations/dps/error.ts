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
      error: 'Не знайдено активний токен ДПС. Додайте токен у Налаштуваннях інтеграцій.',
    }, { status: 409 });
  }

  if (message.startsWith('DPS_PREFILL_TOKEN_INVALID:') || message === 'DPS_PREFILL_TOKEN_INVALID') {
    const details = message.startsWith('DPS_PREFILL_TOKEN_INVALID:')
      ? message.slice('DPS_PREFILL_TOKEN_INVALID:'.length).trim()
      : '';
    return NextResponse.json({
      error: details
        ? `Токен ДПС відхилено або скасовано. Оновіть токен у Налаштуваннях інтеграцій. Деталі: ${details}`
        : 'Токен ДПС відхилено або скасовано. Оновіть токен у Налаштуваннях інтеграцій.',
    }, { status: 409 });
  }

  if (message.startsWith('DPS_PREFILL_UNAVAILABLE:') || message === 'DPS_PREFILL_UNAVAILABLE') {
    const details = message.startsWith('DPS_PREFILL_UNAVAILABLE:')
      ? message.slice('DPS_PREFILL_UNAVAILABLE:'.length).trim()
      : '';
    // "технічні роботи" має пріоритет — якщо хоча б один реєстр повернув це,
    // то показуємо техроботи (не воєнний стан), бо це найімовірніша причина збою
    const dpsReason = details.includes('технічні роботи')
      ? 'На сервері ДПС ведуться технічні роботи. Спробуйте пізніше.'
      : details.includes('воєнного стану')
        ? 'На період дії воєнного стану доступ до деяких реєстрів ДПС обмежено.'
        : 'Реєстри ДПС тимчасово недоступні. Спробуйте пізніше.';
    return NextResponse.json({ error: dpsReason }, { status: 503 });
  }

  if (message.startsWith('DPS_PREFILL_FETCH_FAILED:') || message === 'DPS_PREFILL_FETCH_FAILED') {
    const details = message.startsWith('DPS_PREFILL_FETCH_FAILED:')
      ? message.slice('DPS_PREFILL_FETCH_FAILED:'.length).trim()
      : '';
    return NextResponse.json({
      error: details
        ? `ДПС повернула помилку для всіх реєстрів. Деталі: ${details}`
        : 'ДПС тимчасово недоступна для автозаповнення. Спробуйте пізніше.',
    }, { status: 502 });
  }

  if (message.startsWith('Field "')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
