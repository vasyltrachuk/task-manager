import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface PrivateProxyRequest {
  action?: unknown;
  payload?: unknown;
  taxId?: unknown;
  keyPassword?: unknown;
  keyFileBase64?: unknown;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${fieldName}" must be a non-empty string`);
  }

  return value.trim();
}

function maskTaxId(value: string): string {
  if (value.length <= 4) return value;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function detectKeyFormat(raw: Buffer): 'jks' | 'pfx' | 'pem' | 'dat' | 'unknown' {
  const asText = raw.subarray(0, 64).toString('utf8');

  if (asText.includes('BEGIN')) return 'pem';
  if (raw.length >= 2 && raw[0] === 0x30 && raw[1] === 0x82) return 'pfx';
  if (raw.length >= 4 && raw[0] === 0xfe && raw[1] === 0xed) return 'jks';
  if (raw.length > 0) return 'dat';
  return 'unknown';
}

async function forwardToUpstream(url: string, body: Record<string, unknown>): Promise<NextResponse> {
  const upstreamSecret = process.env.DPS_PRIVATE_UPSTREAM_SECRET;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(upstreamSecret ? { 'x-internal-secret': upstreamSecret } : {}),
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function POST(request: Request) {
  const proxySecret = process.env.DPS_PRIVATE_PROXY_SECRET ?? process.env.CRON_SECRET;

  if (!proxySecret) {
    return NextResponse.json(
      { error: 'DPS_PRIVATE_PROXY_SECRET or CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  const providedSecret = request.headers.get('x-internal-secret');
  if (providedSecret !== proxySecret) {
    return NextResponse.json({ error: 'Unauthorized private proxy call' }, { status: 401 });
  }

  let keyBuffer: Buffer | null = null;

  try {
    const body = (await request.json()) as PrivateProxyRequest;
    const action = assertNonEmptyString(body.action, 'action');
    const taxId = assertNonEmptyString(body.taxId, 'taxId');
    const keyPassword = assertNonEmptyString(body.keyPassword, 'keyPassword');
    const keyFileBase64 = assertNonEmptyString(body.keyFileBase64, 'keyFileBase64');

    keyBuffer = Buffer.from(keyFileBase64, 'base64');
    if (keyBuffer.length === 0) {
      return NextResponse.json({ error: 'Provided key file is empty' }, { status: 400 });
    }

    const payload = typeof body.payload === 'object' && body.payload !== null
      ? (body.payload as Record<string, unknown>)
      : {};

    const upstreamUrl = process.env.DPS_PRIVATE_UPSTREAM_URL;
    if (upstreamUrl) {
      return await forwardToUpstream(upstreamUrl, {
        action,
        taxId,
        keyPassword,
        keyFileBase64,
        payload,
      });
    }

    return NextResponse.json({
      action,
      success: true,
      mode: 'starter_stub',
      warning: 'DPS_PRIVATE_UPSTREAM_URL is not configured. Returned stub response.',
      taxId: maskTaxId(taxId),
      keyMeta: {
        sizeBytes: keyBuffer.length,
        format: detectKeyFormat(keyBuffer),
        passwordLength: keyPassword.length,
      },
      payload,
      nextStep: 'Set DPS_PRIVATE_UPSTREAM_URL to your signer service endpoint.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid private proxy request' },
      { status: 400 }
    );
  } finally {
    if (keyBuffer) keyBuffer.fill(0);
  }
}
