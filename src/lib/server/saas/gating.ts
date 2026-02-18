import 'server-only';

function normalizeBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Subscription enforcement toggle.
 *
 * Default: disabled (safe for pre-billing development stage).
 * Set SAAS_ENFORCE_SUBSCRIPTIONS=true when billing flows are ready for production rollout.
 */
export function isSaasSubscriptionEnforced(): boolean {
  return normalizeBooleanEnv(process.env.SAAS_ENFORCE_SUBSCRIPTIONS);
}
