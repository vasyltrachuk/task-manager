import { Client, ClientType } from './types';
import { formatShortName } from './utils';

const CLIENT_TYPE_TITLE_PREFIXES: Record<ClientType, string> = {
    FOP: 'ФОП',
    LLC: 'ТОВ',
    OSBB: 'ОСББ',
    NGO: 'ГО',
    GRANT: 'Гр.Пр',
};

// Longest/more specific variants first so partial matches do not leave leftovers.
const CLIENT_PREFIX_PATTERNS: RegExp[] = [
    /^грантов(?:ий|ого)?\s+про(?:є|е)кт\b\.?/iu,
    /^гр\.?\s*пр\.?/iu,
    /^grant(?:\s+project)?\b\.?/i,
    /^го\s*\/\s*нго\b\.?/iu,
    /^нго\b\.?/iu,
    /^го\b\.?/iu,
    /^ngo\b\.?/i,
    /^осбб\b\.?/iu,
    /^тов\b\.?/iu,
    /^llc\b\.?/i,
    /^фоп\b\.?/iu,
    /^fop\b\.?/i,
];

const LEADING_DELIMITERS_RE = /^[\s:.,;()\\/\-–—]+/u;

function stripLeadingClientTypePrefix(name: string): string {
    let result = name.trim();

    while (result) {
        const previous = result;

        for (const pattern of CLIENT_PREFIX_PATTERNS) {
            if (!pattern.test(result)) continue;

            result = result.replace(pattern, '').replace(LEADING_DELIMITERS_RE, '').trimStart();
            break;
        }

        if (result === previous) {
            break;
        }
    }

    return result.trim();
}

export function normalizeClientName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';

    return stripLeadingClientTypePrefix(trimmed);
}

export function getClientTypeTitlePrefix(type: ClientType): string {
    return CLIENT_TYPE_TITLE_PREFIXES[type];
}

export function getClientDisplayName(client: Pick<Client, 'name' | 'type'>): string {
    const normalizedName = normalizeClientName(client.name);
    const prefix = getClientTypeTitlePrefix(client.type);

    return normalizedName ? `${prefix} ${normalizedName}` : prefix;
}

/** Скорочена назва: для ФОП скорочує ПІБ до «Прізвище І.Б.», для решти — повна назва. */
export function getClientShortDisplayName(client: Pick<Client, 'name' | 'type'>): string {
    const normalizedName = normalizeClientName(client.name);
    const prefix = getClientTypeTitlePrefix(client.type);
    const displayName = client.type === 'FOP' ? formatShortName(normalizedName) : normalizedName;

    return displayName ? `${prefix} ${displayName}` : prefix;
}
