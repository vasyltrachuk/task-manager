import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClientPrefillSuggestion } from './prefill.use-case';

describe('dps client prefill suggestion', () => {
  it('infers single tax group 3 with VAT from EV registry', () => {
    const suggestion = buildClientPrefillSuggestion('rnokpp', [
      {
        registryCode: 'ev',
        result: {
          status: 'ok',
          rawPayload: {},
          normalizedPayload: {
            registryCode: 'ev',
            taxId: '3012456789',
            checkedAt: new Date().toISOString(),
            isFound: true,
            subjectName: 'Іваненко Іван Іванович',
            taxSystem: '3 група',
            isVatPayer: true,
          },
        },
      },
    ]);

    assert.equal(suggestion.name, 'Іваненко Іван Іванович');
    assert.equal(suggestion.type, 'FOP');
    assert.equal(suggestion.tax_system, 'single_tax_group3_vat');
    assert.equal(suggestion.is_vat_payer, true);
  });

  it('prefers NGO profile when non-profit registry has a match', () => {
    const suggestion = buildClientPrefillSuggestion('edrpou', [
      {
        registryCode: 'non-profit',
        result: {
          status: 'ok',
          rawPayload: {},
          normalizedPayload: {
            registryCode: 'non-profit',
            taxId: '37300216',
            checkedAt: new Date().toISOString(),
            isFound: true,
            subjectName: 'Благодійний фонд Розвиток',
            note: 'Оз.0032',
          },
        },
      },
    ]);

    assert.equal(suggestion.type, 'NGO');
    assert.equal(suggestion.tax_system, 'non_profit');
  });

  it('falls back to general VAT when only VAT registry confirms payer status', () => {
    const suggestion = buildClientPrefillSuggestion('edrpou', [
      {
        registryCode: 'pdv_act',
        result: {
          status: 'ok',
          rawPayload: {},
          normalizedPayload: {
            registryCode: 'pdv_act',
            taxId: '22018827',
            checkedAt: new Date().toISOString(),
            isFound: true,
            subjectName: 'ТОВ Приклад',
            isVatPayer: true,
          },
        },
      },
    ]);

    assert.equal(suggestion.tax_system, 'general_vat');
    assert.equal(suggestion.is_vat_payer, true);
  });
});
