import 'server-only';

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function asPostgrestError(error: unknown): PostgrestLikeError {
  if (!error || typeof error !== 'object') return {};
  return error as PostgrestLikeError;
}

export function isNoRowsError(error: unknown): boolean {
  return asPostgrestError(error).code === 'PGRST116';
}

export function isMissingTableError(error: unknown): boolean {
  const { code, message } = asPostgrestError(error);
  return code === 'PGRST205' || Boolean(message?.includes('Could not find the table'));
}
