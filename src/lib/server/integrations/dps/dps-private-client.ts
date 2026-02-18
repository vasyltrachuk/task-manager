import 'server-only';

import type { DpsPrivateActionResult } from './contracts';

const PRIVATE_TIMEOUT_MS = 30_000;

export interface PerformPrivateActionInput {
  action: string;
  payload: Record<string, unknown>;
  keyFile: Buffer;
  keyPassword: string;
  taxId: string;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export class DpsPrivateApiClient {
  async performPrivateAction(input: PerformPrivateActionInput): Promise<DpsPrivateActionResult> {
    const endpoint = process.env.DPS_PRIVATE_API_BASE_URL;
    const internalSecret = process.env.DPS_PRIVATE_PROXY_SECRET ?? process.env.CRON_SECRET;

    if (!endpoint) {
      throw new Error('DPS_PRIVATE_API_BASE_URL is not configured');
    }

    const body = {
      action: input.action,
      payload: input.payload,
      taxId: input.taxId,
      keyPassword: input.keyPassword,
      keyFileBase64: input.keyFile.toString('base64'),
    };

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
      },
      body: JSON.stringify(body),
    }, PRIVATE_TIMEOUT_MS);

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = await response.text();
    }

    if (!response.ok) {
      throw new Error(`Private DPS action failed (${response.status})`);
    }

    return {
      action: input.action,
      success: true,
      response: parsed,
    };
  }
}
