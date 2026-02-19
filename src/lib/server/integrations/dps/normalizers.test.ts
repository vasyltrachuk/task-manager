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

  it('extracts nested EV payload fields for industry and address', () => {
    const result = normalizeRegistryPayload('ev', {
      result: {
        data: [
          {
            taxpayer_name: 'ТОВ Розробка',
            taxation_system: 'загальна',
            kved_code: '62.01',
            kved_name: 'Комп`ютерне програмування',
            registration_address: 'м. Київ',
          },
        ],
      },
    }, '22018827');

    assert.equal(result.isFound, true);
    assert.equal(result.subjectName, 'ТОВ Розробка');
    assert.equal(result.taxSystem, 'загальна');
    assert.equal(result.activityCode, '62.01');
    assert.equal(result.activityName, 'Комп`ютерне програмування');
    assert.equal(result.address, 'м. Київ');
  });

  it('parses inactive VAT status from status_text via registrationState', () => {
    // status_text входить до registrationState, але не до stateRaw.
    // Анулювання визначається через datAnul або через явні стани ('анульовано' у state).
    // Без datAnul та без явного state — isVatPayer за замовчуванням true (запис знайдений).
    // Для коректного визначення анулювання — використовуйте поле datAnul (реальна відповідь ДПС).
    const result = normalizeRegistryPayload('pdv_act', {
      state: 'анульовано',
      name: 'ТОВ Приклад',
      reg_date: '2025-01-01',
    }, '22018827');

    assert.equal(result.isFound, true);
    assert.equal(result.subjectName, 'ТОВ Приклад');
    assert.equal(result.isVatPayer, false);
  });

  it('detects cancelled VAT via datAnul field from real DPS response', () => {
    const result = normalizeRegistryPayload('pdv_act', {
      kodPdv: '123456789',
      tin: '22018827',
      name: 'ТОВ Тест',
      datReestr: '2020-01-15',
      datAnul: '2023-06-01',
      kodAnul: '1',
    }, '22018827');

    assert.equal(result.isFound, true);
    assert.equal(result.isVatPayer, false);
    assert.equal(result.registrationDate, '2020-01-15');
  });

  it('detects active VAT payer when datAnul is absent', () => {
    const result = normalizeRegistryPayload('pdv_act', {
      kodPdv: '123456789',
      tin: '22018827',
      name: 'ТОВ Активний',
      datReestr: '2020-01-15',
      datAnul: null,
    }, '22018827');

    assert.equal(result.isFound, true);
    assert.equal(result.isVatPayer, true);
  });

  it('extracts RCLASS as single tax group from real DPS ev response', () => {
    const result = normalizeRegistryPayload('ev', {
      TIN_S: '3012456789',
      FULL_NAME: 'Іваненко Іван Іванович',
      DATE_ACC_ERS: '2021-03-10',
      KVED: '62.01',
      RCLASS: '3',
      IS_PAYER: '1',
      C_STI_MAIN_NAME: 'ГУ ДПС у Київській обл.',
    }, '3012456789');

    assert.equal(result.isFound, true);
    assert.equal(result.subjectName, 'Іваненко Іван Іванович');
    assert.equal(result.taxSystem, '3');
    assert.equal(result.activityCode, '62.01');
    assert.equal(result.dpsOfficeName, 'ГУ ДПС у Київській обл.');
  });

  it('marks ev record as not found when IS_PAYER is 0', () => {
    const result = normalizeRegistryPayload('ev', {
      TIN_S: '3012456789',
      FULL_NAME: 'Іваненко Іван Іванович',
      RCLASS: '2',
      IS_PAYER: '0',
    }, '3012456789');

    assert.equal(result.isFound, false);
  });

  it('normalizes registration payload from DPS docs style fields', () => {
    const result = normalizeRegistryPayload('registration', {
      FULL_NAME: 'ТОВ Приклад',
      TIN_S: '22018827',
      ADRESS: 'м. Київ, вул. Хрещатик, 1',
      D_REG_STI: '2020-05-01',
      C_STI_MAIN_NAME: 'ГУ ДПС у м. Києві',
      C_STAN: 'Основне місце обліку',
      FACE_MODE: 'ЮО',
    }, '22018827');

    assert.equal(result.registryCode, 'registration');
    assert.equal(result.isFound, true);
    assert.equal(result.subjectName, 'ТОВ Приклад');
    assert.equal(result.registrationDate, '2020-05-01');
    assert.equal(result.address, 'м. Київ, вул. Хрещатик, 1');
    assert.equal(result.dpsOfficeName, 'ГУ ДПС у м. Києві');
    assert.equal(result.registrationState, 'Основне місце обліку');
    assert.equal(result.note, 'ЮО');
  });
});
