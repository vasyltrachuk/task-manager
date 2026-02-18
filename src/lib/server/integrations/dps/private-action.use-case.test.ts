import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  checkPrivateActionRateLimit,
  resetPrivateActionRateLimitState,
} from './private-action.use-case';

describe('private action rate limit', () => {
  beforeEach(() => {
    resetPrivateActionRateLimitState();
  });

  it('throws when repeated action is within rate-limit window', () => {
    checkPrivateActionRateLimit('tenant-1', 'client-1', 'payer_card', 1_000);

    assert.throws(
      () => checkPrivateActionRateLimit('tenant-1', 'client-1', 'payer_card', 1_100),
      /RATE_LIMITED_PRIVATE_ACTION/
    );
  });

  it('allows same action after rate-limit window has passed', () => {
    checkPrivateActionRateLimit('tenant-1', 'client-1', 'payer_card', 1_000);
    checkPrivateActionRateLimit('tenant-1', 'client-1', 'payer_card', 32_000);
  });
});
