import { SingleTaxSystem, TaxSystem, TAX_SYSTEM_LABELS } from './types';

const VAT_TAX_SYSTEMS: TaxSystem[] = ['single_tax_group3_vat', 'general_vat'];

export const TAX_SYSTEM_UI_GROUPS: Array<{ label: string; options: TaxSystem[] }> = [
    {
        label: 'Спрощена система',
        options: [
            'single_tax_group1',
            'single_tax_group2',
            'single_tax_group3',
            'single_tax_group3_vat',
            'single_tax_group4',
        ],
    },
    {
        label: 'Загальна система',
        options: ['general_no_vat', 'general_vat'],
    },
    {
        label: 'Спеціальні режими',
        options: ['non_profit'],
    },
];

export function getTaxSystemLabel(taxSystem?: TaxSystem): string {
    return taxSystem ? TAX_SYSTEM_LABELS[taxSystem] : '—';
}

export function isVatPayerByTaxSystem(taxSystem?: TaxSystem): boolean {
    return Boolean(taxSystem && VAT_TAX_SYSTEMS.includes(taxSystem));
}

export function isSingleTaxSystem(taxSystem?: TaxSystem): taxSystem is SingleTaxSystem {
    return Boolean(taxSystem?.startsWith('single_tax_group'));
}
