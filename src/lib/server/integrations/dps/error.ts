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

  if (message === 'RATE_LIMITED_PRIVATE_ACTION') {
    return NextResponse.json({ error: 'Too many private action attempts. Try again later.' }, { status: 429 });
  }

  if (message.startsWith('Field "')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
