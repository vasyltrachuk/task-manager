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

interface DpsRequestSpec {
  endpointPath: string;
  body: Record<string, unknown>;
  label: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createUrl(endpointPath: string): string {
  const baseUrl = process.env.DPS_PUBLIC_API_BASE_URL ?? 'https://cabinet.tax.gov.ua';
  return `${baseUrl.replace(/\/$/, '')}/ws/api/public/registers/${endpointPath.replace(/^\//, '')}`;
}

function buildRequestSpecs(registryCode: DpsRegistryCode, taxId: string, token: string): DpsRequestSpec[] {
  if (registryCode === 'registration') {
    return [
      {
        endpointPath: 'registration',
        body: {
          tins: taxId,
          name: null,
          token,
        },
        label: 'registration:tins',
      },
    ];
  }

  if (registryCode === 'pdv_act') {
    return [
      {
        endpointPath: 'pdv_act/list',
        body: {
          kodPdvList: null,
          tinList: taxId,
          name: null,
          token,
        },
        label: 'pdv_act/list:tinList',
      },
    ];
  }

  if (registryCode === 'ev') {
    return [
      {
        endpointPath: 'ev',
        body: {
          tin: taxId,
          name: null,
          token,
        },
        label: 'ev:tin',
      },
    ];
  }

  return [
    {
      endpointPath: 'non-profit',
      body: {
        tin: taxId,
        name: null,
        token,
      },
      label: 'non-profit:tin',
    },
  ];
}

function pickPayloadError(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload.trim() || undefined;
  }

  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  // ДПС повертає { error: "Помилка", error_description: "деталі" }
  // Пріоритет: error_description (деталі) > message > error (загальне) > detail/description
  for (const key of ['error_description', 'message', 'error', 'detail', 'description']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
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
    const specs = buildRequestSpecs(registryCode, taxId, token);
    let lastError: Error | null = null;
    let lastClientPayload: unknown = null;
    const clientFailureMessages: string[] = [];

    for (const spec of specs) {
      const url = createUrl(spec.endpointPath);
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(spec.body),
      };

      let shouldTryNextSpec = false;

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
            const payloadError = pickPayloadError(payload);
            const context = payloadError ? ` (${payloadError})` : '';
            const statusMessage = `DPS public API ${registryCode} failed: ${response.status}${context} [${spec.label}]`;

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              clientFailureMessages.push(statusMessage);
              lastClientPayload = payload;
              shouldTryNextSpec = true;
              break;
            }

            throw new Error(statusMessage);
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

      if (!shouldTryNextSpec) {
        break;
      }
    }

    if (clientFailureMessages.length > 0) {
      return {
        status: 'error',
        rawPayload: lastClientPayload,
        normalizedPayload: normalizeRegistryPayload(registryCode, lastClientPayload, taxId),
        statusMessage: clientFailureMessages.join(' || ').slice(0, 1200),
      };
    }

    return {
      status: 'error',
      rawPayload: { message: lastError?.message ?? 'Unknown DPS error' },
      normalizedPayload: normalizeRegistryPayload(registryCode, null, taxId),
      statusMessage: lastError?.message ?? 'Unknown DPS error',
    };
  }
}
