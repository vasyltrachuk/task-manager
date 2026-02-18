import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderAccountantCandidates } from './resolve-token';

describe('token candidate ordering', () => {
  it('prefers primary accountant and skips inactive candidates', () => {
    const ordered = orderAccountantCandidates(
      [
        { accountant_id: 'acc-2', is_primary: false },
        { accountant_id: 'acc-1', is_primary: true },
        { accountant_id: 'acc-3', is_primary: false },
      ],
      new Set(['acc-1', 'acc-3'])
    );

    assert.deepEqual(ordered.map((row) => row.accountant_id), ['acc-1', 'acc-3']);
  });
});
