import 'server-only';

export const ACTIVE_SAAS_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active', 'grace']);

export function isActiveSaasSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_SAAS_SUBSCRIPTION_STATUSES.has(status);
}
