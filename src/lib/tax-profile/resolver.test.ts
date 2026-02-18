import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client, License } from '../types';
import { buildTaxProfile, resolveClientTaxSnapshot } from './resolver';

function createClient(overrides: Partial<Client> = {}): Client {
    return {
        id: 'c-test',
        name: 'Test Client',
        type: 'FOP',
        tax_id_type: 'rnokpp',
        tax_id: '1234567890',
        status: 'active',
        tax_system: 'single_tax_group2',
        is_vat_payer: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function createLicense(overrides: Partial<License> = {}): License {
    return {
        id: 'lic-test',
        client_id: 'c-test',
        responsible_id: 'u-acc-001',
        type: 'medical_practice',
        number: 'MED-1000',
        issuing_authority: 'МОЗ України',
        status: 'active',
        issued_at: '2025-01-01T00:00:00.000Z',
        valid_from: '2025-01-01T00:00:00.000Z',
        payment_frequency: 'quarterly',
        last_check_result: 'ok',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('tax-profile resolver', () => {
    it('FOP 2 без ПДВ без працівників -> тільки обовʼязки ФОП 1-2 (без payroll/VAT)', () => {
        const client = createClient({
            type: 'FOP',
            tax_system: 'single_tax_group2',
            employee_count: 0,
        });

        const snapshot = resolveClientTaxSnapshot({ client, licenses: [] });
        const codes = new Set(snapshot.obligations.map((obligation) => obligation.code));

        assert.ok(codes.has('single_tax_monthly_payment_fop12'));
        assert.ok(codes.has('fop12_annual_declaration'));
        assert.ok(codes.has('fop_self_esv_quarterly'));
        assert.ok(!codes.has('vat_declaration_monthly'));
        assert.ok(!codes.has('payroll_advance'));
        assert.ok(!codes.has('payroll_final_and_taxes'));
    });

    it('FOP 3 з ПДВ без працівників -> ПДВ + квартальна декларація ФОП 3', () => {
        const client = createClient({
            type: 'FOP',
            tax_system: 'single_tax_group3_vat',
            employee_count: 0,
        });

        const snapshot = resolveClientTaxSnapshot({ client, licenses: [] });
        const codes = new Set(snapshot.obligations.map((obligation) => obligation.code));

        assert.ok(codes.has('vat_declaration_monthly'));
        assert.ok(codes.has('fop3_quarterly_declaration'));
        assert.ok(!codes.has('payroll_advance'));
    });

    it('ТОВ з ПДВ і працівниками -> ПДВ + payroll + unified reporting', () => {
        const client = createClient({
            type: 'LLC',
            tax_id_type: 'edrpou',
            tax_system: 'general_vat',
            employee_count: 8,
        });

        const snapshot = resolveClientTaxSnapshot({ client, licenses: [] });
        const codes = new Set(snapshot.obligations.map((obligation) => obligation.code));

        assert.ok(codes.has('vat_declaration_monthly'));
        assert.ok(codes.has('payroll_advance'));
        assert.ok(codes.has('payroll_final_and_taxes'));
        assert.ok(codes.has('unified_reporting_quarterly'));
    });

    it('ГО без ПДВ без працівників -> без payroll/VAT обовʼязків', () => {
        const client = createClient({
            type: 'NGO',
            tax_id_type: 'edrpou',
            tax_system: 'non_profit',
            employee_count: 0,
        });

        const snapshot = resolveClientTaxSnapshot({ client, licenses: [] });
        const codes = new Set(snapshot.obligations.map((obligation) => obligation.code));

        assert.ok(!codes.has('vat_declaration_monthly'));
        assert.ok(!codes.has('payroll_advance'));
        assert.ok(!codes.has('payroll_final_and_taxes'));
    });

    it('клієнт з ліцензіями -> включає license_registry_check', () => {
        const client = createClient({
            id: 'c-licensed',
            tax_system: 'general_no_vat',
        });
        const license = createLicense({
            client_id: 'c-licensed',
        });

        const snapshot = resolveClientTaxSnapshot({ client, licenses: [license] });
        const codes = new Set(snapshot.obligations.map((obligation) => obligation.code));

        assert.ok(codes.has('license_registry_check'));
    });

    it('невизначена система оподаткування -> повертає risk_flags і не падає', () => {
        const client = createClient({
            tax_system: undefined,
        });

        const profile = buildTaxProfile({ client, licenses: [] });

        assert.ok(profile.risk_flags.includes('missing_tax_system'));
        assert.equal(profile.subject, 'fop');
    });
});
