import { Client, ClientType, License } from '../types';
import { isVatPayerByTaxSystem } from '../tax';
import { OBLIGATION_CATALOG } from './catalog';
import {
    ResolvedObligation,
    TaxProfile,
    TaxProfileRiskFlag,
    TaxProfileSnapshot,
    TaxProfileSubject,
} from './types';

const OBLIGATION_CADENCE_ORDER: Record<ResolvedObligation['cadence'], number> = {
    monthly: 1,
    quarterly: 2,
    annual: 3,
    event: 4,
};

function mapClientTypeToSubject(type: ClientType): TaxProfileSubject {
    switch (type) {
        case 'FOP':
            return 'fop';
        case 'LLC':
            return 'llc';
        case 'NGO':
            return 'ngo';
        case 'OSBB':
            return 'osbb';
        case 'GRANT':
            return 'grant';
        default:
            return 'llc';
    }
}

function collectRiskFlags(client: Client): TaxProfileRiskFlag[] {
    const riskFlags: TaxProfileRiskFlag[] = [];

    if (!client.tax_system) {
        riskFlags.push('missing_tax_system');
    }

    if (!client.tax_id?.trim()) {
        riskFlags.push('missing_tax_id');
    }

    return riskFlags;
}

export function buildTaxProfile(input: { client: Client; licenses: License[] }): TaxProfile {
    const { client, licenses } = input;
    const employeeCount = Math.max(0, client.employee_count || 0);
    const uniqueLicenseTypes = [...new Set(licenses.map((license) => license.type))];

    return {
        client_id: client.id,
        subject: mapClientTypeToSubject(client.type),
        tax_system: client.tax_system,
        is_vat_payer: isVatPayerByTaxSystem(client.tax_system),
        employee_count: employeeCount,
        has_employees: employeeCount > 0,
        has_licenses: licenses.length > 0,
        license_types: uniqueLicenseTypes,
        risk_flags: collectRiskFlags(client),
    };
}

export function resolveObligations(profile: TaxProfile): ResolvedObligation[] {
    return OBLIGATION_CATALOG
        .filter((obligation) => obligation.isApplicable(profile))
        .map((obligation) => ({
            code: obligation.code,
            title: obligation.title,
            cadence: obligation.cadence,
            description: obligation.description,
        }))
        .sort((a, b) => {
            const cadenceDiff = OBLIGATION_CADENCE_ORDER[a.cadence] - OBLIGATION_CADENCE_ORDER[b.cadence];
            if (cadenceDiff !== 0) return cadenceDiff;
            return a.title.localeCompare(b.title, 'uk', { sensitivity: 'base' });
        });
}

export function resolveClientTaxSnapshot(input: { client: Client; licenses: License[] }): TaxProfileSnapshot {
    const profile = buildTaxProfile(input);
    const obligations = resolveObligations(profile);

    return { profile, obligations };
}
