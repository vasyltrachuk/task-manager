export interface PrivatbankTokenStatus {
  hasToken: boolean;
  maskedToken: string | null;
  maskedClientId: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
}

export interface PrivatbankTokenRecord {
  tokenId: string;
  clientId: string;
  token: string;
  masked: string;
}

export type PrivatbankJsonRecord = Record<string, unknown>;

export interface PrivatbankApiResult<TPayload extends PrivatbankJsonRecord> {
  status: string;
  payload: TPayload;
}

export interface PrivatbankBalancePayload extends PrivatbankJsonRecord {
  balances: PrivatbankJsonRecord[];
}

export interface PrivatbankTransactionsPayload extends PrivatbankJsonRecord {
  transactions: PrivatbankJsonRecord[];
  pagination: {
    nextId: string | null;
    nextPageUrl: string | null;
    limit: number | null;
  };
}

export interface PrivatbankStatementPageInput {
  clientId: string;
  token: string;
  account: string;
  startDate: string;
  endDate: string;
  followId?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface PrivatbankStatementAllInput {
  clientId: string;
  token: string;
  account: string;
  startDate: string;
  endDate: string;
  limit?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export interface PrivatbankStatementAllResult {
  status: string;
  transactions: PrivatbankJsonRecord[];
  pagination: {
    nextId: string | null;
    nextPageUrl: string | null;
    limit: number | null;
  };
  pageCount: number;
  hasMore: boolean;
}
