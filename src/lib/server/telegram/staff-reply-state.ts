import 'server-only';

/**
 * Tracks which conversation a staff member is replying to.
 * In-memory Map with TTL — no Redis dependency, works in inline queue mode.
 */

const REPLY_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface ReplyEntry {
  conversationId: string;
  expiresAt: number;
}

const activeReplies = new Map<number, ReplyEntry>();

export function setActiveReply(chatId: number, conversationId: string): void {
  activeReplies.set(chatId, {
    conversationId,
    expiresAt: Date.now() + REPLY_TTL_MS,
  });
}

export function getActiveReply(chatId: number): string | null {
  const entry = activeReplies.get(chatId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    activeReplies.delete(chatId);
    return null;
  }

  return entry.conversationId;
}

export function clearActiveReply(chatId: number): void {
  activeReplies.delete(chatId);
}
