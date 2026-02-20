import type { Client } from '@/lib/types';

function appendVersionQuery(url: string, version: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

export function getClientAvatarUrl(
  client: Pick<Client, 'avatar_url' | 'avatar_updated_at'> | null | undefined
): string | null {
  const avatarUrl = client?.avatar_url?.trim();
  if (!avatarUrl) return null;

  const version = client?.avatar_updated_at?.trim();
  if (!version) return avatarUrl;

  return appendVersionQuery(avatarUrl, version);
}
