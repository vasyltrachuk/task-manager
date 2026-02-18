import type { Client, Profile } from './types';

type AccountantsCollection = ReadonlyArray<Profile> | null | undefined;

export function getFirstActiveAccountantId(accountants: AccountantsCollection): string {
  const accountant = accountants?.find((row) => row.role === 'accountant' && row.is_active);
  return accountant?.id ?? '';
}

export function getDefaultClientAccountantId(
  client: Pick<Client, 'accountants'> | null | undefined
): string {
  return getFirstActiveAccountantId(client?.accountants);
}
