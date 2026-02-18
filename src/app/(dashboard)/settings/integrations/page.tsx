'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { canAccessIntegrations } from '@/lib/rbac';
import { cn, formatDate } from '@/lib/utils';

interface DpsTokenStatus {
    hasToken: boolean;
    maskedToken: string | null;
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

export default function IntegrationsSettingsPage() {
    const { state } = useApp();
    const [tokenInput, setTokenInput] = useState('');
    const [tokenStatus, setTokenStatus] = useState<DpsTokenStatus | null>(null);
    const [recentRuns, setRecentRuns] = useState<DpsRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const canAccess = canAccessIntegrations(state.currentUser);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const response = await fetch('/api/integrations/dps/me', {
                method: 'GET',
                cache: 'no-store',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося завантажити інтеграцію ДПС.');
            }

            setTokenStatus(payload.tokenStatus as DpsTokenStatus);
            setRecentRuns(payload.recentRuns as DpsRun[]);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!canAccess) return;
        void loadData();
    }, [canAccess, loadData]);

    const hasToken = Boolean(tokenStatus?.hasToken);
    const tokenUpdatedAt = tokenStatus?.updatedAt;

    const lastRun = useMemo(() => recentRuns[0], [recentRuns]);

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

    if (!canAccess) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Немає доступу</h1>
                    <p className="text-sm text-text-muted">Розділ інтеграцій доступний адміністратору або бухгалтеру.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">Інтеграції</h1>
                <p className="text-sm text-text-muted">
                    Підключення ДПС для вашого профілю. Токен керується персонально для кожного бухгалтера.
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
