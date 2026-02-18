import 'server-only';

import type { DpsRegistryCode, DpsRegistryFetchResult } from './contracts';
import { normalizeRegistryPayload } from './normalizers';

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [300, 900];

interface FetchRegistryInput {
  registryCode: DpsRegistryCode;
  token: string;
  taxId: string;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createUrl(registryCode: DpsRegistryCode): string {
  const baseUrl = process.env.DPS_PUBLIC_API_BASE_URL ?? 'https://cabinet.tax.gov.ua';
  return `${baseUrl.replace(/\/$/, '')}/ws/api/public/registers/${registryCode}`;
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

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export class DpsPublicApiClient {
  async fetchRegistryByTaxId(input: FetchRegistryInput): Promise<DpsRegistryFetchResult> {
    const { registryCode, token, taxId, timeoutMs = DEFAULT_TIMEOUT_MS } = input;
    const url = createUrl(registryCode);

    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token,
        tin: taxId,
      }),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, requestInit, timeoutMs);
        const payload = await parseResponsePayload(response);

        if (response.status === 404) {
          return {
            status: 'not_found',
            rawPayload: payload,
            normalizedPayload: normalizeRegistryPayload(registryCode, payload, taxId),
            statusMessage: 'Record not found',
          };
        }

        if (!response.ok) {
          throw new Error(`DPS public API ${registryCode} failed: ${response.status}`);
        }

        return {
          status: 'ok',
          rawPayload: payload,
          normalizedPayload: normalizeRegistryPayload(registryCode, payload, taxId),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown DPS fetch error');
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    return {
      status: 'error',
      rawPayload: { message: lastError?.message ?? 'Unknown DPS error' },
      normalizedPayload: normalizeRegistryPayload(registryCode, null, taxId),
      statusMessage: lastError?.message ?? 'Unknown DPS error',
    };
  }
}
