import {
    Client,
    TaxRulebookConfig,
    SingleTaxRulebookGroup,
    SingleTaxSystem,
    TaxSystem,
    TAX_SYSTEM_LABELS,
} from './types';
import { formatMoneyUAH } from './utils';

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

export const DEFAULT_TAX_RULEBOOK: TaxRulebookConfig = {
    year: 2026,
    minimum_wage_on_january_1: 8647,
    single_tax_multipliers: {
        single_tax_group1: 167,
        single_tax_group2: 834,
        single_tax_group3: 1167,
        single_tax_group4: 1167,
    },
    vat_registration_threshold: 1_000_000,
};

export function getTaxSystemLabel(taxSystem?: TaxSystem): string {
    return taxSystem ? TAX_SYSTEM_LABELS[taxSystem] : '—';
}

export function isVatPayerByTaxSystem(taxSystem?: TaxSystem): boolean {
    return Boolean(taxSystem && VAT_TAX_SYSTEMS.includes(taxSystem));
}

export function isSingleTaxSystem(taxSystem?: TaxSystem): taxSystem is SingleTaxSystem {
    return Boolean(taxSystem?.startsWith('single_tax_group'));
}

function getRulebookGroupByTaxSystem(
    taxSystem: TaxSystem | '' | undefined
): SingleTaxRulebookGroup | undefined {
    switch (taxSystem) {
        case 'single_tax_group1':
        case 'single_tax_group2':
        case 'single_tax_group3':
        case 'single_tax_group4':
            return taxSystem;
        case 'single_tax_group3_vat':
            return 'single_tax_group3';
        default:
            return undefined;
    }
}

export function calculateIncomeLimitByTaxSystem(
    taxSystem: TaxSystem | '' | undefined,
    rulebook: TaxRulebookConfig
): number | undefined {
    const rulebookGroup = getRulebookGroupByTaxSystem(taxSystem);
    if (!rulebookGroup) return undefined;

    return Math.round(
        rulebook.minimum_wage_on_january_1 * rulebook.single_tax_multipliers[rulebookGroup]
    );
}

export function normalizeClientIncomeLimit(client: Client, rulebook: TaxRulebookConfig): Client {
    if (isSingleTaxSystem(client.tax_system)) {
        return {
            ...client,
            is_vat_payer: isVatPayerByTaxSystem(client.tax_system),
            income_limit_source: 'rulebook',
            income_limit: calculateIncomeLimitByTaxSystem(client.tax_system, rulebook),
        };
    }

    return {
        ...client,
        is_vat_payer: isVatPayerByTaxSystem(client.tax_system),
        income_limit: undefined,
        income_limit_source: undefined,
    };
}

export function applyIncomeLimitRulebook(clients: Client[], rulebook: TaxRulebookConfig): Client[] {
    return clients.map((client) => normalizeClientIncomeLimit(client, rulebook));
}

export function getIncomeLimitControlMessage(client: Pick<Client, 'income_limit' | 'tax_system'>): string {
    if (client.income_limit) {
        return `Ліміт доходу для контролю: ${formatMoneyUAH(client.income_limit)}.`;
    }

    if (client.tax_system && !isSingleTaxSystem(client.tax_system)) {
        return `Для режиму "${getTaxSystemLabel(client.tax_system)}" ліміт доходу не застосовується.`;
    }

    if (isSingleTaxSystem(client.tax_system)) {
        return `Для режиму "${getTaxSystemLabel(client.tax_system)}" ліміт доходу ще не розраховано.`;
    }

    return 'Ліміт доходу: Немає.';
}

export function getTaxComplianceNotes(
    client: Pick<Client, 'type' | 'tax_system'>,
    rulebook: TaxRulebookConfig
): string[] {
    const notes: string[] = [];

    if (client.tax_system === 'general_no_vat' || client.tax_system === 'general_vat') {
        notes.push('На загальній системі оподаткування ліміт доходу не є кваліфікаційним критерієм.');
    }

    if (client.tax_system && !isVatPayerByTaxSystem(client.tax_system)) {
        notes.push(
            `Контроль ПДВ-порогу: ${formatMoneyUAH(rulebook.vat_registration_threshold)} оподатковуваних операцій за 12 місяців.`
        );
    }

    if (client.tax_system === 'non_profit' || client.type === 'NGO') {
        notes.push('Для неприбуткових ГО ключовий контроль: цільове використання коштів та дотримання умов неприбутковості.');
    }

    return notes;
}
