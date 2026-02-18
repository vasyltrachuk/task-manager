import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRegistryPayload } from './normalizers';

describe('dps normalizers', () => {
  it('normalizes EV payload with tax system fields', () => {
    const result = normalizeRegistryPayload('ev', {
      fio: 'Іваненко Іван Іванович',
      group: '2 група',
      is_pdv: '0',
      dps_name: 'ГУ ДПС у Києві',
      dps_code: '2654',
    }, '3012456789');

    assert.equal(result.registryCode, 'ev');
    assert.equal(result.isFound, true);
    assert.equal(result.subjectName, 'Іваненко Іван Іванович');
    assert.equal(result.taxSystem, '2 група');
    assert.equal(result.isVatPayer, false);
    assert.equal(result.dpsOfficeCode, '2654');
  });

  it('returns not found defaults for empty non-profit payload', () => {
    const result = normalizeRegistryPayload('non-profit', null, '37300216');

    assert.equal(result.registryCode, 'non-profit');
    assert.equal(result.isFound, false);
    assert.ok(result.note);
  });
});
