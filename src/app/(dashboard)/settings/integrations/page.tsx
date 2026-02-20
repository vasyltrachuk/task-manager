'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, KeyRound, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { canAccessIntegrations } from '@/lib/rbac';
import { cn, formatDate } from '@/lib/utils';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import type { UserRole } from '@/lib/types';

interface DpsTokenStatus {
    hasToken: boolean;
    maskedToken: string | null;
    lastUsedAt: string | null;
    updatedAt: string | null;
}

interface PrivatbankTokenStatus {
    hasToken: boolean;
    maskedToken: string | null;
    maskedClientId: string | null;
    lastUsedAt: string | null;
    updatedAt: string | null;
}

interface DpsRun {
    id: string;
    status: string;
    request_count: number;
    success_count: number;
    skipped_count: number;
    error_count: number;
    started_at: string;
    ended_at: string | null;
    source: string;
}

interface TelegramBotStatus {
    hasBot: boolean;
    botId: string | null;
    botUsername: string | null;
    displayName: string | null;
    publicId: string | null;
    webhookUrl: string | null;
    webhookSet: boolean;
    webhookUrlIsPublicHttps: boolean;
    updatedAt: string | null;
}

type IntegrationCardId = 'telegram' | 'privatbank' | 'dpsToken' | 'dpsSync';
type IntegrationCategory = 'state' | 'banking' | 'communication' | 'operations';
type IntegrationCategoryFilter = 'all' | IntegrationCategory;
type IntegrationSortMode = 'recommended' | 'status' | 'updated' | 'name';

interface IntegrationDescriptor {
    id: IntegrationCardId;
    title: string;
    category: IntegrationCategory;
    isConnected: boolean;
    updatedAt: string | null;
    priority: number;
}

const integrationCategoryOptions: { key: IntegrationCategoryFilter; label: string }[] = [
    { key: 'all', label: 'Усі інтеграції' },
    { key: 'state', label: 'Держреєстри' },
    { key: 'banking', label: 'Банкінг' },
    { key: 'communication', label: 'Комунікації' },
    { key: 'operations', label: 'Операції' },
];

const integrationSortOptions: { key: IntegrationSortMode; label: string }[] = [
    { key: 'recommended', label: 'За пріоритетом (рекомендовано)' },
    { key: 'status', label: 'За статусом підключення' },
    { key: 'updated', label: 'За останнім оновленням' },
    { key: 'name', label: 'За назвою (А-Я)' },
];

function toTimestamp(value: string | null): number | null {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

function compareByUpdatedAtDesc(left: string | null, right: string | null): number {
    const leftTimestamp = toTimestamp(left);
    const rightTimestamp = toTimestamp(right);

    if (leftTimestamp === null && rightTimestamp === null) return 0;
    if (leftTimestamp === null) return 1;
    if (rightTimestamp === null) return -1;
    return rightTimestamp - leftTimestamp;
}

function sortIntegrationDescriptors(
    left: IntegrationDescriptor,
    right: IntegrationDescriptor,
    sortMode: IntegrationSortMode
): number {
    const compareByName = () => left.title.localeCompare(right.title, 'uk-UA', { sensitivity: 'base' });

    if (sortMode === 'name') {
        return compareByName();
    }

    if (sortMode === 'updated') {
        const updatedDiff = compareByUpdatedAtDesc(left.updatedAt, right.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;
        return compareByName();
    }

    if (sortMode === 'status') {
        const statusDiff = Number(right.isConnected) - Number(left.isConnected);
        if (statusDiff !== 0) return statusDiff;
        return compareByName();
    }

    // Recommended flow: integrations needing setup first, then business-critical priority.
    const attentionDiff = Number(left.isConnected) - Number(right.isConnected);
    if (attentionDiff !== 0) return attentionDiff;

    if (left.priority !== right.priority) {
        return left.priority - right.priority;
    }

    const updatedDiff = compareByUpdatedAtDesc(left.updatedAt, right.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;

    return compareByName();
}

function getRunStatusLabel(status: string): string {
    switch (status) {
        case 'completed':
            return 'Успішно';
        case 'partial':
            return 'Частково';
        case 'failed':
            return 'Помилка';
        case 'skipped_no_token':
            return 'Немає токена';
        default:
            return 'В процесі';
    }
}

function toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function dateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toDateInputValue(date);
}

export default function IntegrationsSettingsPage() {
    const { profile } = useAuth();
    if (!profile) {
        return null;
    }

    if (!canAccessIntegrations(profile)) {
        return <AccessDeniedCard message="Розділ інтеграцій доступний адміністратору або бухгалтеру." />;
    }

    return <IntegrationsSettingsContent userRole={profile.role} />;
}

function IntegrationsSettingsContent({ userRole }: { userRole: UserRole }) {
    const [tokenInput, setTokenInput] = useState('');
    const [tokenStatus, setTokenStatus] = useState<DpsTokenStatus | null>(null);
    const [privatbankClientIdInput, setPrivatbankClientIdInput] = useState('');
    const [privatbankTokenInput, setPrivatbankTokenInput] = useState('');
    const [privatbankTokenStatus, setPrivatbankTokenStatus] = useState<PrivatbankTokenStatus | null>(null);
    const [privatbankTestAccount, setPrivatbankTestAccount] = useState('');
    const [privatbankTestStartDate, setPrivatbankTestStartDate] = useState(() => dateDaysAgo(7));
    const [privatbankTestEndDate, setPrivatbankTestEndDate] = useState(() => dateDaysAgo(0));
    const [privatbankTestingStatement, setPrivatbankTestingStatement] = useState(false);
    const [privatbankTestResponse, setPrivatbankTestResponse] = useState<string | null>(null);
    const [recentRuns, setRecentRuns] = useState<DpsRun[]>([]);
    const [telegramTokenInput, setTelegramTokenInput] = useState('');
    const [telegramDisplayNameInput, setTelegramDisplayNameInput] = useState('');
    const [telegramStatus, setTelegramStatus] = useState<TelegramBotStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [privatbankSaving, setPrivatbankSaving] = useState(false);
    const [telegramSaving, setTelegramSaving] = useState(false);
    const [telegramRefreshingWebhook, setTelegramRefreshingWebhook] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<IntegrationCategoryFilter>('all');
    const [sortMode, setSortMode] = useState<IntegrationSortMode>('recommended');

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const [dpsResponse, telegramResponse, privatbankResponse] = await Promise.all([
                fetch('/api/integrations/dps/me', {
                    method: 'GET',
                    cache: 'no-store',
                }),
                fetch('/api/integrations/telegram/me', {
                    method: 'GET',
                    cache: 'no-store',
                }),
                fetch('/api/integrations/privatbank/me', {
                    method: 'GET',
                    cache: 'no-store',
                }),
            ]);

            const [dpsPayload, telegramPayload, privatbankPayload] = await Promise.all([
                dpsResponse.json(),
                telegramResponse.json(),
                privatbankResponse.json(),
            ]);

            if (!dpsResponse.ok) {
                throw new Error((dpsPayload as { error?: string }).error || 'Не вдалося завантажити інтеграцію ДПС.');
            }
            if (!telegramResponse.ok) {
                throw new Error((telegramPayload as { error?: string }).error || 'Не вдалося завантажити інтеграцію Telegram.');
            }
            if (!privatbankResponse.ok) {
                throw new Error((privatbankPayload as { error?: string }).error || 'Не вдалося завантажити інтеграцію PrivatBank.');
            }

            setTokenStatus((dpsPayload as { tokenStatus: DpsTokenStatus }).tokenStatus);
            setRecentRuns((dpsPayload as { recentRuns: DpsRun[] }).recentRuns);
            const nextTelegramStatus = (telegramPayload as { botStatus: TelegramBotStatus }).botStatus;
            setTelegramStatus(nextTelegramStatus);
            setTelegramDisplayNameInput(nextTelegramStatus.displayName ?? '');
            setPrivatbankTokenStatus((privatbankPayload as { tokenStatus: PrivatbankTokenStatus }).tokenStatus);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const hasToken = Boolean(tokenStatus?.hasToken);
    const hasPrivatbankToken = Boolean(privatbankTokenStatus?.hasToken);
    const isAdminUser = userRole === 'admin';
    const hasTelegramBot = Boolean(telegramStatus?.hasBot);
    const telegramWebhookSet = Boolean(telegramStatus?.webhookSet);
    const telegramNeedsPublicUrl = hasTelegramBot && !telegramStatus?.webhookUrlIsPublicHttps;
    const tokenUpdatedAt = tokenStatus?.updatedAt;
    const privatbankTokenUpdatedAt = privatbankTokenStatus?.updatedAt;

    const lastRun = useMemo(() => recentRuns[0], [recentRuns]);

    const integrationDescriptors = useMemo<IntegrationDescriptor[]>(
        () => [
            {
                id: 'dpsToken',
                title: 'Токен ДПС (відкрита частина API)',
                category: 'state',
                isConnected: hasToken,
                updatedAt: tokenUpdatedAt ?? null,
                priority: 1,
            },
            {
                id: 'dpsSync',
                title: 'Синхронізація реєстрів',
                category: 'operations',
                isConnected: recentRuns.length > 0,
                updatedAt: lastRun?.started_at ?? null,
                priority: 2,
            },
            {
                id: 'privatbank',
                title: 'Токен PrivatBank (Автоклієнт API)',
                category: 'banking',
                isConnected: hasPrivatbankToken,
                updatedAt: privatbankTokenUpdatedAt ?? null,
                priority: 3,
            },
            {
                id: 'telegram',
                title: 'Telegram bot компанії',
                category: 'communication',
                isConnected: hasTelegramBot,
                updatedAt: telegramStatus?.updatedAt ?? null,
                priority: 4,
            },
        ],
        [
            hasPrivatbankToken,
            hasTelegramBot,
            hasToken,
            lastRun?.started_at,
            privatbankTokenUpdatedAt,
            recentRuns.length,
            telegramStatus?.updatedAt,
            tokenUpdatedAt,
        ]
    );

    const categoryCounts = useMemo<Record<IntegrationCategoryFilter, number>>(() => {
        const counts: Record<IntegrationCategoryFilter, number> = {
            all: integrationDescriptors.length,
            state: 0,
            banking: 0,
            communication: 0,
            operations: 0,
        };

        integrationDescriptors.forEach((integration) => {
            counts[integration.category] += 1;
        });

        return counts;
    }, [integrationDescriptors]);

    const visibleIntegrations = useMemo(
        () =>
            integrationDescriptors
                .filter((integration) => activeCategory === 'all' || integration.category === activeCategory)
                .sort((left, right) => sortIntegrationDescriptors(left, right, sortMode)),
        [activeCategory, integrationDescriptors, sortMode]
    );

    const visibleIntegrationIdSet = useMemo(
        () => new Set(visibleIntegrations.map((integration) => integration.id)),
        [visibleIntegrations]
    );

    const integrationOrderMap = useMemo(() => {
        const orderMap: Partial<Record<IntegrationCardId, number>> = {};
        visibleIntegrations.forEach((integration, index) => {
            orderMap[integration.id] = index;
        });
        return orderMap;
    }, [visibleIntegrations]);

    const handleSaveToken = async () => {
        if (!tokenInput.trim()) {
            setErrorMessage('Вкажіть токен перед збереженням.');
            return;
        }

        try {
            setSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/dps/me/token', {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ token: tokenInput.trim() }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося зберегти токен.');
            }

            setTokenStatus(payload.tokenStatus as DpsTokenStatus);
            setTokenInput('');
            setSuccessMessage('Токен ДПС збережено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteToken = async () => {
        try {
            setSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/dps/me/token', {
                method: 'DELETE',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося видалити токен.');
            }

            setTokenStatus({
                hasToken: false,
                maskedToken: null,
                lastUsedAt: null,
                updatedAt: null,
            });
            setSuccessMessage('Токен ДПС деактивовано.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePrivatbankToken = async () => {
        if (!privatbankClientIdInput.trim()) {
            setErrorMessage('Вкажіть Client ID PrivatBank перед збереженням.');
            return;
        }

        if (!privatbankTokenInput.trim()) {
            setErrorMessage('Вкажіть токен PrivatBank перед збереженням.');
            return;
        }

        try {
            setPrivatbankSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/privatbank/me/token', {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    clientId: privatbankClientIdInput.trim(),
                    token: privatbankTokenInput.trim(),
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося зберегти токен PrivatBank.');
            }

            setPrivatbankTokenStatus(payload.tokenStatus as PrivatbankTokenStatus);
            setPrivatbankClientIdInput('');
            setPrivatbankTokenInput('');
            setSuccessMessage('Токен PrivatBank збережено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setPrivatbankSaving(false);
        }
    };

    const handleDeletePrivatbankToken = async () => {
        try {
            setPrivatbankSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/privatbank/me/token', {
                method: 'DELETE',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося видалити токен PrivatBank.');
            }

            setPrivatbankTokenStatus({
                hasToken: false,
                maskedToken: null,
                maskedClientId: null,
                lastUsedAt: null,
                updatedAt: null,
            });
            setSuccessMessage('Токен PrivatBank деактивовано.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setPrivatbankSaving(false);
        }
    };

    const handleTestPrivatbankStatement = async () => {
        if (!privatbankTestAccount.trim()) {
            setErrorMessage('Вкажіть рахунок для тесту виписки PrivatBank.');
            return;
        }

        if (!privatbankTestStartDate || !privatbankTestEndDate) {
            setErrorMessage('Вкажіть початкову і кінцеву дату для тесту виписки.');
            return;
        }

        try {
            setPrivatbankTestingStatement(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            setPrivatbankTestResponse(null);

            const params = new URLSearchParams({
                acc: privatbankTestAccount.trim(),
                startDate: privatbankTestStartDate,
                endDate: privatbankTestEndDate,
                fetchAll: 'false',
                limit: '200',
            });

            const response = await fetch(`/api/integrations/privatbank/statements?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося виконати тест виписки PrivatBank.');
            }

            setPrivatbankTestResponse(JSON.stringify(payload, null, 2));
            const transactionCount = typeof payload.transactionCount === 'number' ? payload.transactionCount : '—';
            setSuccessMessage(`Тест виписки виконано успішно. Транзакцій у відповіді: ${transactionCount}.`);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setPrivatbankTestingStatement(false);
        }
    };

    const handleManualSync = async () => {
        try {
            setSyncing(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/dps/sync', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ force: false }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося запустити синхронізацію.');
            }

            setSuccessMessage(`Синхронізацію завершено: ${payload.status}.`);
            await loadData();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveTelegramBot = async () => {
        if (!telegramTokenInput.trim()) {
            setErrorMessage('Вкажіть Telegram bot token перед збереженням.');
            return;
        }

        try {
            setTelegramSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/telegram/me', {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    token: telegramTokenInput.trim(),
                    displayName: telegramDisplayNameInput.trim() || undefined,
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error((payload as { error?: string }).error || 'Не вдалося зберегти Telegram bot.');
            }

            const nextStatus = (payload as { botStatus: TelegramBotStatus }).botStatus;
            setTelegramStatus(nextStatus);
            setTelegramTokenInput('');
            setTelegramDisplayNameInput(nextStatus.displayName ?? '');
            setSuccessMessage('Telegram bot збережено. Webhook встановлено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setTelegramSaving(false);
        }
    };

    const handleRefreshTelegramWebhook = async () => {
        try {
            setTelegramRefreshingWebhook(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/telegram/me', {
                method: 'POST',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error((payload as { error?: string }).error || 'Не вдалося оновити webhook.');
            }

            setTelegramStatus((payload as { botStatus: TelegramBotStatus }).botStatus);
            setSuccessMessage('Webhook Telegram оновлено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setTelegramRefreshingWebhook(false);
        }
    };

    const handleDisconnectTelegramBot = async () => {
        try {
            setTelegramSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/telegram/me', {
                method: 'DELETE',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error((payload as { error?: string }).error || 'Не вдалося відключити Telegram bot.');
            }

            setTelegramStatus((payload as { botStatus: TelegramBotStatus }).botStatus);
            setTelegramTokenInput('');
            setTelegramDisplayNameInput('');
            setSuccessMessage('Telegram bot відключено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setTelegramSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">Інтеграції</h1>
                <p className="text-sm text-text-muted">
                    Підключення Telegram-бота компанії, ДПС та PrivatBank для вашого профілю.
                </p>
            </div>

            {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                </div>
            )}

            <div className="card p-5 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h2 className="text-base font-bold text-text-primary">Категорії та сортування</h2>
                        <p className="text-xs text-text-muted mt-1">
                            Фільтруйте інтеграції за доменом і міняйте порядок відображення без втрати контексту налаштувань.
                        </p>
                    </div>
                    <div className="w-full lg:w-72">
                        <label htmlFor="integration-sort" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Сортування
                        </label>
                        <select
                            id="integration-sort"
                            value={sortMode}
                            onChange={(event) => setSortMode(event.target.value as IntegrationSortMode)}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
                        >
                            {integrationSortOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {integrationCategoryOptions.map((category) => (
                        <button
                            key={category.key}
                            onClick={() => setActiveCategory(category.key)}
                            className={cn('filter-pill', activeCategory === category.key && 'active')}
                        >
                            <span>{category.label}</span>
                            <span
                                className={cn(
                                    'inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold',
                                    activeCategory === category.key ? 'bg-white/20 text-white' : 'bg-surface-100 text-text-muted'
                                )}
                            >
                                {categoryCounts[category.key]}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-6">
                {visibleIntegrations.length === 0 && (
                    <div className="rounded-xl border border-dashed border-surface-300 px-4 py-5 text-sm text-text-muted text-center">
                        За вибраним фільтром інтеграції не знайдено.
                    </div>
                )}
                {visibleIntegrationIdSet.has('telegram') && (
                    <section style={{ order: integrationOrderMap.telegram ?? 0 }}>
                        <div className="card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <Bot size={16} className="text-brand-600" />
                            Telegram bot компанії
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            Один активний бот на tenant. Після збереження токена webhook встановлюється автоматично.
                        </p>
                    </div>
                    {hasTelegramBot && telegramStatus?.botUsername && (
                        <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-surface-100 text-text-secondary border border-surface-200">
                            @{telegramStatus.botUsername}
                        </span>
                    )}
                </div>

                {!isAdminUser && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                        Лише адміністратор може змінювати налаштування Telegram-бота. Для вас доступний перегляд статусу.
                    </div>
                )}

                {telegramNeedsPublicUrl && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        Поточний <code>NEXT_PUBLIC_APP_URL</code> не є публічним HTTPS, тому Telegram webhook не працюватиме.
                        Для локального тесту запустіть <code>npm run dev:public</code> і після цього натисніть «Оновити webhook».
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        type="text"
                        value={telegramDisplayNameInput}
                        onChange={(event) => setTelegramDisplayNameInput(event.target.value)}
                        disabled={!isAdminUser}
                        placeholder="Назва бота (опціонально)"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-surface-100 disabled:text-text-muted"
                    />
                    <input
                        type="password"
                        value={telegramTokenInput}
                        onChange={(event) => setTelegramTokenInput(event.target.value)}
                        disabled={!isAdminUser}
                        placeholder={hasTelegramBot ? 'Введіть новий token для оновлення' : 'Введіть Telegram bot token'}
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-surface-100 disabled:text-text-muted"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[auto_auto_auto] gap-3">
                    <button
                        onClick={handleSaveTelegramBot}
                        disabled={!isAdminUser || telegramSaving}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            !isAdminUser || telegramSaving
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <Save size={14} />
                        Зберегти бота
                    </button>
                    <button
                        onClick={handleRefreshTelegramWebhook}
                        disabled={!isAdminUser || !hasTelegramBot || telegramRefreshingWebhook}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            !isAdminUser || !hasTelegramBot || telegramRefreshingWebhook
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        )}
                    >
                        <RefreshCw size={14} className={cn(telegramRefreshingWebhook && 'animate-spin')} />
                        Оновити webhook
                    </button>
                    <button
                        onClick={handleDisconnectTelegramBot}
                        disabled={!isAdminUser || !hasTelegramBot || telegramSaving}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            !isAdminUser || !hasTelegramBot || telegramSaving
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                        )}
                    >
                        <Trash2 size={14} />
                        Відключити
                    </button>
                </div>

                <div className="text-xs text-text-muted space-y-1">
                    <p>Стан: {hasTelegramBot ? 'Бот підключено' : 'Бот не підключено'}</p>
                    <p>
                        Webhook: {hasTelegramBot ? (telegramWebhookSet ? 'налаштований' : 'не налаштований') : '—'}
                    </p>
                    <p>Public ID: {telegramStatus?.publicId ?? '—'}</p>
                    <p className="break-all">Webhook URL: {telegramStatus?.webhookUrl ?? '—'}</p>
                    <p>Оновлено: {telegramStatus?.updatedAt ? formatDate(telegramStatus.updatedAt) : '—'}</p>
                </div>
                        </div>
                    </section>
                )}

                {visibleIntegrationIdSet.has('privatbank') && (
                    <section style={{ order: integrationOrderMap.privatbank ?? 0 }}>
                        <div className="card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <KeyRound size={16} className="text-brand-600" />
                            Токен PrivatBank (Автоклієнт API)
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            Для роботи API потрібні Client ID та Token.
                        </p>
                    </div>
                    {hasPrivatbankToken && (
                        <div className="flex flex-col items-end gap-1">
                            {privatbankTokenStatus?.maskedClientId && (
                                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-surface-100 text-text-secondary border border-surface-200">
                                    ID: {privatbankTokenStatus.maskedClientId}
                                </span>
                            )}
                            {privatbankTokenStatus?.maskedToken && (
                                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-surface-100 text-text-secondary border border-surface-200">
                                    Token: {privatbankTokenStatus.maskedToken}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        type="text"
                        value={privatbankClientIdInput}
                        onChange={(event) => setPrivatbankClientIdInput(event.target.value)}
                        placeholder="Client ID (header id)"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="password"
                        value={privatbankTokenInput}
                        onChange={(event) => setPrivatbankTokenInput(event.target.value)}
                        placeholder={hasPrivatbankToken ? 'Введіть новий токен PrivatBank для оновлення' : 'Введіть токен PrivatBank'}
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[auto_auto] gap-3">
                    <button
                        onClick={handleSavePrivatbankToken}
                        disabled={privatbankSaving}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            privatbankSaving
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <Save size={14} />
                        Зберегти
                    </button>
                    <button
                        onClick={handleDeletePrivatbankToken}
                        disabled={privatbankSaving || !hasPrivatbankToken}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            privatbankSaving || !hasPrivatbankToken
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                        )}
                    >
                        <Trash2 size={14} />
                        Видалити
                    </button>
                </div>

                <div className="text-xs text-text-muted space-y-1">
                    <p>
                        Стан: {hasPrivatbankToken ? 'Токен активний' : 'Токен не задано'}
                    </p>
                    <p>
                        Оновлено: {privatbankTokenUpdatedAt ? formatDate(privatbankTokenUpdatedAt) : '—'}
                    </p>
                    <p>
                        Останнє використання: {privatbankTokenStatus?.lastUsedAt ? formatDate(privatbankTokenStatus.lastUsedAt) : '—'}
                    </p>
                    <p>
                        Client ID: {privatbankTokenStatus?.maskedClientId ?? '—'}
                    </p>
                    <p>
                        Де взяти токен: Приват24 для бізнесу → Інтеграція (Автоклієнт).
                    </p>
                </div>

                <div className="pt-3 border-t border-surface-200 space-y-3">
                    <h3 className="text-sm font-semibold text-text-primary">Тест виписки</h3>
                    <p className="text-xs text-text-muted">
                        Швидкий тест виклику <code>/api/integrations/privatbank/statements</code> (1 сторінка, limit=200).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            type="text"
                            value={privatbankTestAccount}
                            onChange={(event) => setPrivatbankTestAccount(event.target.value)}
                            placeholder="Рахунок (IBAN/acc)"
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                        <input
                            type="date"
                            value={privatbankTestStartDate}
                            onChange={(event) => setPrivatbankTestStartDate(event.target.value)}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                        <input
                            type="date"
                            value={privatbankTestEndDate}
                            onChange={(event) => setPrivatbankTestEndDate(event.target.value)}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>

                    <button
                        onClick={handleTestPrivatbankStatement}
                        disabled={privatbankTestingStatement || !hasPrivatbankToken}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            privatbankTestingStatement || !hasPrivatbankToken
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        )}
                    >
                        <RefreshCw size={14} className={cn(privatbankTestingStatement && 'animate-spin')} />
                        Тест виписки
                    </button>

                    {privatbankTestResponse && (
                        <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-surface-200 bg-surface-50 p-3 text-xs text-text-secondary whitespace-pre-wrap break-all">
                            {privatbankTestResponse}
                        </pre>
                    )}
                </div>
                        </div>
                    </section>
                )}

                {visibleIntegrationIdSet.has('dpsToken') && (
                    <section style={{ order: integrationOrderMap.dpsToken ?? 0 }}>
                        <div className="card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <KeyRound size={16} className="text-brand-600" />
                            Токен ДПС (відкрита частина API)
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            Токен потрібен для доступу до REST-методів публічних реєстрів.
                        </p>
                    </div>
                    {hasToken && tokenStatus?.maskedToken && (
                        <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-surface-100 text-text-secondary border border-surface-200">
                            {tokenStatus.maskedToken}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                    <input
                        type="password"
                        value={tokenInput}
                        onChange={(event) => setTokenInput(event.target.value)}
                        placeholder={hasToken ? 'Введіть новий токен для оновлення' : 'Введіть токен ДПС'}
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <button
                        onClick={handleSaveToken}
                        disabled={saving}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            saving
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <Save size={14} />
                        Зберегти
                    </button>
                    <button
                        onClick={handleDeleteToken}
                        disabled={saving || !hasToken}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            saving || !hasToken
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                        )}
                    >
                        <Trash2 size={14} />
                        Видалити
                    </button>
                </div>

                <div className="text-xs text-text-muted space-y-1">
                    <p>
                        Стан: {hasToken ? 'Токен активний' : 'Токен не задано'}
                    </p>
                    <p>
                        Оновлено: {tokenUpdatedAt ? formatDate(tokenUpdatedAt) : '—'}
                    </p>
                    <p>
                        Останнє використання: {tokenStatus?.lastUsedAt ? formatDate(tokenStatus.lastUsedAt) : '—'}
                    </p>
                </div>
                        </div>
                    </section>
                )}

                {visibleIntegrationIdSet.has('dpsSync') && (
                    <section style={{ order: integrationOrderMap.dpsSync ?? 0 }}>
                        <div className="card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <RefreshCw size={16} className="text-brand-600" />
                            Синхронізація реєстрів
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            Щоденний cron + ручний запуск по кнопці.
                        </p>
                    </div>
                    <button
                        onClick={handleManualSync}
                        disabled={syncing || loading}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                            syncing || loading
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <RefreshCw size={14} className={cn(syncing && 'animate-spin')} />
                        Запустити sync
                    </button>
                </div>

                {loading ? (
                    <p className="text-sm text-text-muted">Завантаження…</p>
                ) : (
                    <>
                        <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-text-secondary">
                            Останній запуск: {lastRun ? `${getRunStatusLabel(lastRun.status)} (${formatDate(lastRun.started_at)})` : 'немає даних'}
                        </div>

                        {recentRuns.length > 0 ? (
                            <div className="space-y-2">
                                {recentRuns.slice(0, 6).map((run) => (
                                    <div key={run.id} className="rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-xs text-text-secondary">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-semibold text-text-primary">{getRunStatusLabel(run.status)}</span>
                                            <span>{formatDate(run.started_at)}</span>
                                        </div>
                                        <p className="mt-1">
                                            Запитів: {run.request_count} • Успіх: {run.success_count} • Пропущено: {run.skipped_count} • Помилок: {run.error_count}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-surface-300 px-4 py-5 text-sm text-text-muted text-center">
                                Історія запусків поки порожня.
                            </div>
                        )}
                    </>
                )}
                        </div>
                    </section>
                )}
            </div>

            <div className="card p-5 flex items-start gap-3 border-amber-200 bg-amber-50">
                <ShieldAlert size={18} className="text-amber-700 mt-0.5" />
                <div>
                    <h3 className="text-sm font-semibold text-amber-800">КЕП ключі</h3>
                    <p className="text-xs text-amber-700 mt-1">
                        КЕП-файл не зберігається в системі. Для приватних дій він передається одноразово з картки клієнта.
                    </p>
                </div>
            </div>
        </div>
    );
}
