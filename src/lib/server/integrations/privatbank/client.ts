import 'server-only';

import type {
  PrivatbankApiResult,
  PrivatbankBalancePayload,
  PrivatbankJsonRecord,
  PrivatbankStatementAllInput,
  PrivatbankStatementAllResult,
  PrivatbankStatementPageInput,
  PrivatbankTransactionsPayload,
} from './contracts';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PAGES = 30;

function createBaseUrl(): string {
  const baseUrl = process.env.PRIVATBANK_API_BASE_URL ?? 'https://acp.privatbank.ua';
  return baseUrl.trim().replace(/\/$/, '');
}

function asRecord(payload: unknown): PrivatbankJsonRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('PrivatBank API returned invalid payload');
  }

  return payload as PrivatbankJsonRecord;
}

function pickApiMessage(record: PrivatbankJsonRecord): string {
  for (const key of ['message', 'error', 'description', 'details']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return 'No message provided';
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parsePagination(payload: PrivatbankJsonRecord): PrivatbankTransactionsPayload['pagination'] {
  const rawPagination = payload.pagination;

  if (!rawPagination || typeof rawPagination !== 'object' || Array.isArray(rawPagination)) {
    return {
      nextId: null,
      nextPageUrl: null,
      limit: null,
    };
  }

  const record = rawPagination as PrivatbankJsonRecord;
  const rawLimit = record.limit;
  const normalizedLimit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit)
      ? rawLimit
      : typeof rawLimit === 'string' && rawLimit.trim() && Number.isFinite(Number(rawLimit))
        ? Number(rawLimit)
        : null;

  return {
    nextId: normalizeString(record.nextId),
    nextPageUrl: normalizeString(record.nextPageUrl),
    limit: normalizedLimit,
  };
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

async function parsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function buildHeaders(clientId: string, token: string): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    id: clientId,
    token,
  };
}

function ensureSuccess(payload: unknown, context: string): PrivatbankApiResult<PrivatbankJsonRecord> {
  const record = asRecord(payload);
  const status = typeof record.status === 'string' ? record.status : 'UNKNOWN';

  if (status !== 'SUCCESS') {
    throw new Error(`PRIVATBANK_API_ERROR:${context}:${status}:${pickApiMessage(record)}`);
  }

  return {
    status,
    payload: record,
  };
}

function castArrayOfObjects(value: unknown): PrivatbankJsonRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as PrivatbankJsonRecord[];
}

export class PrivatbankApiClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = createBaseUrl();
  }

  async fetchBalance(
    clientId: string,
    token: string,
    startDate: string,
    endDate: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<PrivatbankApiResult<PrivatbankBalancePayload>> {
    const query = new URLSearchParams({
      startDate,
      endDate,
    });

    const url = `${this.baseUrl}/api/statements/balance?${query.toString()}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: buildHeaders(clientId, token),
      body: '',
    }, timeoutMs);

    const payload = await parsePayload(response);

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : pickApiMessage(asRecord(payload));
      throw new Error(`PRIVATBANK_API_HTTP_ERROR:balance:${response.status}:${message}`);
    }

    const parsed = ensureSuccess(payload, 'balance');

    return {
      status: parsed.status,
      payload: {
        ...parsed.payload,
        balances: castArrayOfObjects(parsed.payload.balances),
      },
    };
  }

  async fetchTransactionsPage(input: PrivatbankStatementPageInput): Promise<PrivatbankApiResult<PrivatbankTransactionsPayload>> {
    const { clientId, token, account, startDate, endDate, followId, limit, timeoutMs = DEFAULT_TIMEOUT_MS } = input;

    const query = new URLSearchParams({
      acc: account,
      startDate,
      endDate,
    });

    if (followId) {
      query.set('followId', followId);
    }

    if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
      query.set('limit', String(limit));
    }

    const url = `${this.baseUrl}/api/statements/transactions?${query.toString()}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: buildHeaders(clientId, token),
      body: '',
    }, timeoutMs);

    const payload = await parsePayload(response);

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : pickApiMessage(asRecord(payload));
      throw new Error(`PRIVATBANK_API_HTTP_ERROR:transactions:${response.status}:${message}`);
    }

    const parsed = ensureSuccess(payload, 'transactions');

    return {
      status: parsed.status,
      payload: {
        ...parsed.payload,
        transactions: castArrayOfObjects(parsed.payload.transactions),
        pagination: parsePagination(parsed.payload),
      },
    };
  }

  async fetchAllTransactions(input: PrivatbankStatementAllInput): Promise<PrivatbankStatementAllResult> {
    const {
      token,
      clientId,
      account,
      startDate,
      endDate,
      limit,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxPages = DEFAULT_MAX_PAGES,
    } = input;

    const transactions: PrivatbankJsonRecord[] = [];
    let pageCount = 0;
    let followId: string | undefined;
    let hasMore = false;
    const visitedFollowIds = new Set<string>();
    let pagination: PrivatbankTransactionsPayload['pagination'] = {
      nextId: null,
      nextPageUrl: null,
      limit: null,
    };

    while (pageCount < maxPages) {
      if (followId) {
        if (visitedFollowIds.has(followId)) {
          hasMore = true;
          break;
        }

        visitedFollowIds.add(followId);
      }

      const page = await this.fetchTransactionsPage({
        clientId,
        token,
        account,
        startDate,
        endDate,
        followId,
        limit,
        timeoutMs,
      });

      pageCount += 1;
      transactions.push(...page.payload.transactions);
      pagination = page.payload.pagination;

      const nextId = normalizeString(page.payload.pagination.nextId);
      if (!nextId) {
        hasMore = false;
        break;
      }

      followId = nextId;
      hasMore = true;
    }

    return {
      status: 'SUCCESS',
      transactions,
      pagination,
      pageCount,
      hasMore,
    };
  }
}
