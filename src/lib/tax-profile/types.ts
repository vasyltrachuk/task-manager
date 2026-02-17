import { LicenseType, TaxSystem } from '../types';

export type TaxProfileSubject = 'fop' | 'llc' | 'ngo' | 'osbb' | 'grant';

export type TaxProfileCadence = 'monthly' | 'quarterly' | 'annual' | 'event';

export type TaxProfileRiskFlag =
    | 'missing_tax_system'
    | 'missing_tax_id';

export type ObligationCode =
    | 'single_tax_monthly_payment_fop12'
    | 'vat_declaration_monthly'
    | 'payroll_advance'
    | 'payroll_final_and_taxes'
    | 'fop3_quarterly_declaration'
    | 'fop_self_esv_quarterly'
    | 'unified_reporting_quarterly'
    | 'fop12_annual_declaration'
    | 'license_registry_check';

export interface TaxProfile {
    client_id: string;
    subject: TaxProfileSubject;
    tax_system?: TaxSystem;
    is_vat_payer: boolean;
    employee_count: number;
    has_employees: boolean;
    has_licenses: boolean;
    license_types: LicenseType[];
    risk_flags: TaxProfileRiskFlag[];
}

export interface ObligationDefinition {
    code: ObligationCode;
    title: string;
    cadence: TaxProfileCadence;
    description: string;
    isApplicable: (profile: TaxProfile) => boolean;
}

export interface ResolvedObligation {
    code: ObligationCode;
    title: string;
    cadence: TaxProfileCadence;
    description: string;
}

export interface TaxProfileSnapshot {
    profile: TaxProfile;
    obligations: ResolvedObligation[];
}

export const TAX_PROFILE_SUBJECT_LABELS: Record<TaxProfileSubject, string> = {
    fop: 'ФОП',
    llc: 'ТОВ',
    ngo: 'ГО',
    osbb: 'ОСББ',
    grant: 'Грантовий проєкт',
};

export const TAX_PROFILE_CADENCE_LABELS: Record<TaxProfileCadence, string> = {
    monthly: 'Щомісячно',
    quarterly: 'Щоквартально',
    annual: 'Щорічно',
    event: 'Подієво',
};

export const TAX_PROFILE_RISK_FLAG_LABELS: Record<TaxProfileRiskFlag, string> = {
    missing_tax_system: 'Не вказано систему оподаткування.',
    missing_tax_id: 'Не вказано податковий ідентифікатор.',
};
