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

  it('infers LLC, general_no_vat and industry from EV payload for EDRPOU', () => {
    const suggestion = buildClientPrefillSuggestion('edrpou', [
      {
        registryCode: 'ev',
        result: {
          status: 'ok',
          rawPayload: {},
          normalizedPayload: {
            registryCode: 'ev',
            taxId: '22018827',
            checkedAt: new Date().toISOString(),
            isFound: true,
            subjectName: 'ТОВ Розробка',
            taxSystem: 'загальна',
            isVatPayer: false,
            activityCode: '62.01',
            activityName: 'Комп`ютерне програмування',
          },
        },
      },
    ]);

    assert.equal(suggestion.type, 'LLC');
    assert.equal(suggestion.tax_system, 'general_no_vat');
    assert.equal(suggestion.industry, 'Комп`ютерне програмування (КВЕД 62.01)');
  });

  it('prefers registration registry as primary source for legal entity profile', () => {
    const suggestion = buildClientPrefillSuggestion('edrpou', [
      {
        registryCode: 'registration',
        result: {
          status: 'ok',
          rawPayload: {},
          normalizedPayload: {
            registryCode: 'registration',
            taxId: '22018827',
            checkedAt: new Date().toISOString(),
            isFound: true,
            subjectName: 'ТОВ Приклад',
            activityCode: '47.19',
            activityName: 'Інші види роздрібної торгівлі',
            registrationDate: '2020-05-01',
            dpsOfficeName: 'ГУ ДПС у м. Києві',
            registrationState: 'Основне місце обліку',
            note: 'ЮО',
          },
        },
      },
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
            isVatPayer: false,
          },
        },
      },
    ]);

    assert.equal(suggestion.name, 'ТОВ Приклад');
    assert.equal(suggestion.type, 'LLC');
    assert.equal(suggestion.industry, 'Інші види роздрібної торгівлі (КВЕД 47.19)');
    assert.equal(suggestion.tax_system, 'general_no_vat');
    assert.ok(suggestion.notes?.includes('Дата взяття на облік'));
  });
});
