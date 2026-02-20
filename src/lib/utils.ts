import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
    return clsx(inputs);
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    if (format === 'relative') {
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Щойно';
        if (diffMins < 60) return `${diffMins} хв тому`;
        if (diffHours < 24) return `${diffHours} год тому`;
        if (diffDays < 7) return `${diffDays} дн тому`;
        return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    }

    if (format === 'long') {
        return d.toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date();
}

export function isDueToday(dueDate: string): boolean {
    const d = new Date(dueDate);
    const now = new Date();
    return d.toDateString() === now.toDateString();
}

export function isDueSoon(dueDate: string, days: number = 3): boolean {
    const d = new Date(dueDate);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return diff > 0 && diff < days * 86400000;
}

/**
 * Скорочує ПІБ до формату «Прізвище І.Б.»
 * Приклад: «Шевченко Тарас Григорович» → «Шевченко Т.Г.»
 * Якщо передано лише прізвище — повертає як є.
 */
export function formatShortName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const [last, ...rest] = parts;
    const initials = rest
        .map((p) => (p.match(/[\p{L}]/u)?.[0] ?? '').toUpperCase())
        .filter(Boolean)
        .map((c) => `${c}.`)
        .join('');
    return initials ? `${last} ${initials}` : last;
}

export function getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);

    const initials = words
        .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
        .filter(Boolean)
        .join('');

    return initials.toUpperCase().slice(0, 2);
}

export function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

export function generatePassword(length = 12): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + digits + special;
    // Ensure at least one from each class
    const password = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        special[Math.floor(Math.random() * special.length)],
    ];
    for (let i = password.length; i < length; i++) {
        password.push(all[Math.floor(Math.random() * all.length)]);
    }
    // Shuffle
    for (let i = password.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [password[i], password[j]] = [password[j], password[i]];
    }
    return password.join('');
}

export function generateLogin(fullName: string): string {
    const parts = fullName.trim().toLowerCase().split(/\s+/);
    if (parts.length >= 2) {
        // Transliterate basic Ukrainian
        const transliterate = (str: string) => {
            const map: Record<string, string> = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e',
                'є': 'ye', 'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y',
                'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
                'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
                'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya', 'ё': 'yo', 'э': 'e',
                'ы': 'y', 'ъ': '',
            };
            return str.split('').map(c => map[c] || c).join('');
        };
        const first = transliterate(parts[0]);
        const last = transliterate(parts[parts.length - 1]);
        return `${first[0]}.${last}`;
    }
    return parts[0].replace(/[^a-z]/g, '') || 'user';
}

export function formatMoneyUAH(value?: number): string {
    if (!value || value <= 0) return '—';
    const rounded = Math.round(value);
    const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${grouped} грн`;
}
