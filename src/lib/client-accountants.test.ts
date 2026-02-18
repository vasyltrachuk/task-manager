import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDefaultClientAccountantId, getFirstActiveAccountantId } from './client-accountants';
import type { Client, Profile } from './types';

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'acc-1',
    full_name: 'Test Accountant',
    role: 'accountant',
    phone: '+380000000000',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Test Client',
    type: 'FOP',
    tax_id_type: 'rnokpp',
    tax_id: '1234567890',
    status: 'active',
    is_vat_payer: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('client accountants helper', () => {
  it('returns the first active accountant id', () => {
    const accountantId = getFirstActiveAccountantId([
      createProfile({ id: 'lawyer-1', role: 'lawyer', is_active: true }),
      createProfile({ id: 'acc-2', is_active: false }),
      createProfile({ id: 'acc-3', is_active: true }),
    ]);

    assert.equal(accountantId, 'acc-3');
  });

  it('returns default accountant for onboarding client', () => {
    const client = createClient({
      status: 'onboarding',
      accountants: [
        createProfile({ id: 'acc-2', is_active: false }),
        createProfile({ id: 'acc-3', is_active: true }),
      ],
    });

    assert.equal(getDefaultClientAccountantId(client), 'acc-3');
  });

  it('returns empty string when no active accountant exists', () => {
    const client = createClient({
      accountants: [
        createProfile({ id: 'acc-2', is_active: false }),
        createProfile({ id: 'lawyer-1', role: 'lawyer', is_active: true }),
      ],
    });

    assert.equal(getDefaultClientAccountantId(client), '');
    assert.equal(getFirstActiveAccountantId(undefined), '');
  });
});
