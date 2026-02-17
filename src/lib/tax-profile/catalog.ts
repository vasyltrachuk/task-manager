import { ObligationDefinition, TaxProfile } from './types';

const FOP12_TAX_SYSTEMS = new Set(['single_tax_group1', 'single_tax_group2']);
const FOP3_TAX_SYSTEMS = new Set(['single_tax_group3', 'single_tax_group3_vat']);

function isFop12(profile: TaxProfile): boolean {
    return profile.subject === 'fop' && Boolean(profile.tax_system && FOP12_TAX_SYSTEMS.has(profile.tax_system));
}

function isFop3(profile: TaxProfile): boolean {
    return profile.subject === 'fop' && Boolean(profile.tax_system && FOP3_TAX_SYSTEMS.has(profile.tax_system));
}

export const OBLIGATION_CATALOG: ObligationDefinition[] = [
    {
        code: 'single_tax_monthly_payment_fop12',
        title: 'ЄП: щомісячна сплата (ФОП 1-2)',
        cadence: 'monthly',
        description: 'Сплата єдиного податку для ФОП 1-2 групи до 20 числа.',
        isApplicable: (profile) => isFop12(profile),
    },
    {
        code: 'vat_declaration_monthly',
        title: 'ПДВ: декларація та контроль оплати',
        cadence: 'monthly',
        description: 'Подання декларації з ПДВ та контроль наступної оплати податку.',
        isApplicable: (profile) => profile.is_vat_payer,
    },
    {
        code: 'payroll_advance',
        title: 'Payroll: аванс',
        cadence: 'monthly',
        description: 'Перевірка нарахувань і підготовка виплати авансу.',
        isApplicable: (profile) => profile.has_employees,
    },
    {
        code: 'payroll_final_and_taxes',
        title: 'Payroll: фінальна виплата і податки',
        cadence: 'monthly',
        description: 'Фінальний payroll та розрахунок ПДФО, ВЗ, ЄСВ.',
        isApplicable: (profile) => profile.has_employees,
    },
    {
        code: 'fop3_quarterly_declaration',
        title: 'ФОП 3: квартальна декларація',
        cadence: 'quarterly',
        description: 'Подання декларації ФОП 3 групи та контроль строків оплати.',
        isApplicable: (profile) => isFop3(profile),
    },
    {
        code: 'fop_self_esv_quarterly',
        title: 'ФОП: ЄСВ за себе',
        cadence: 'quarterly',
        description: 'Контроль поквартальної сплати ЄСВ за себе.',
        isApplicable: (profile) => profile.subject === 'fop',
    },
    {
        code: 'unified_reporting_quarterly',
        title: 'Об’єднана звітність по працівниках',
        cadence: 'quarterly',
        description: 'Подання об’єднаної звітності по зарплатному блоку.',
        isApplicable: (profile) => profile.has_employees,
    },
    {
        code: 'fop12_annual_declaration',
        title: 'ФОП 1-2: річна декларація',
        cadence: 'annual',
        description: 'Річна декларація для ФОП 1-2 групи.',
        isApplicable: (profile) => isFop12(profile),
    },
    {
        code: 'license_registry_check',
        title: 'Ліцензії: звірка реєстру',
        cadence: 'event',
        description: 'Контроль актуальності записів у державному реєстрі ліцензій.',
        isApplicable: (profile) => profile.has_licenses,
    },
];
