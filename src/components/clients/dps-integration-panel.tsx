'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface SnapshotItem {
    registry_code: string;
    status: string;
    normalized_payload: Record<string, unknown>;
    fetched_at: string;
    expires_at: string;
}

interface KepProfileForm {
    keyOwnerName: string;
    keyOwnerTaxId: string;
    certSubject: string;
    certIssuer: string;
    certSerial: string;
    certValidTo: string;
    notes: string;
}

const EMPTY_KEP_FORM: KepProfileForm = {
    keyOwnerName: '',
    keyOwnerTaxId: '',
    certSubject: '',
    certIssuer: '',
    certSerial: '',
    certValidTo: '',
    notes: '',
};

interface Props {
    clientId: string;
    clientTaxId: string;
}

function normalizeKepProfile(input: Record<string, unknown> | null): KepProfileForm {
    if (!input) return EMPTY_KEP_FORM;

    return {
        keyOwnerName: (input.key_owner_name as string) || '',
        keyOwnerTaxId: (input.key_owner_tax_id as string) || '',
        certSubject: (input.cert_subject as string) || '',
        certIssuer: (input.cert_issuer as string) || '',
        certSerial: (input.cert_serial as string) || '',
        certValidTo: typeof input.cert_valid_to === 'string' ? input.cert_valid_to.slice(0, 10) : '',
        notes: (input.notes as string) || '',
    };
}

function formatSnapshotMainInfo(payload: Record<string, unknown>): string {
    const pieces = [
        payload.subjectName,
        payload.taxSystem,
        payload.note,
    ].filter((part) => typeof part === 'string' && part.trim()) as string[];

    if (pieces.length === 0) return 'Дані отримано без додаткових полів.';
    return pieces.join(' • ');
}

export default function DpsIntegrationPanel({ clientId, clientTaxId }: Props) {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [savingKep, setSavingKep] = useState(false);
    const [runningPrivateAction, setRunningPrivateAction] = useState(false);
    const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
    const [kepForm, setKepForm] = useState<KepProfileForm>(EMPTY_KEP_FORM);
    const [latestRun, setLatestRun] = useState<Record<string, unknown> | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [privateAction, setPrivateAction] = useState('payer_card');
    const [privatePayload, setPrivatePayload] = useState('{}');
    const [privatePassword, setPrivatePassword] = useState('');
    const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
    const [privateResponse, setPrivateResponse] = useState<string | null>(null);

    const hasSnapshotData = snapshots.length > 0;

    const loadSnapshotData = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const query = new URLSearchParams({ taxId: clientTaxId });
            const response = await fetch(`/api/integrations/dps/clients/${clientId}/snapshot?${query.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося завантажити дані ДПС.');
            }

            setSnapshots((payload.snapshots || []) as SnapshotItem[]);
            setKepForm(normalizeKepProfile((payload.kepProfile as Record<string, unknown>) || null));
            setLatestRun((payload.latestRun as Record<string, unknown>) || null);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setLoading(false);
        }
    }, [clientId, clientTaxId]);

    useEffect(() => {
        void loadSnapshotData();
    }, [loadSnapshotData]);

    const handleClientSync = async () => {
        try {
            setSyncing(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/integrations/dps/sync', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ clientId, clientTaxId, force: true }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося виконати sync.');
            }

            setSuccessMessage(`Синхронізацію завершено: ${payload.status}.`);
            await loadSnapshotData();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveKepProfile = async () => {
        try {
            setSavingKep(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch(`/api/integrations/dps/clients/${clientId}/kep-profile`, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ ...kepForm, taxId: clientTaxId }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося зберегти КЕП-профіль.');
            }

            setKepForm(normalizeKepProfile((payload.kepProfile as Record<string, unknown>) || null));
            setSuccessMessage('КЕП-профіль клієнта збережено.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setSavingKep(false);
        }
    };

    const handleRunPrivateAction = async () => {
        try {
            if (!privateKeyFile) {
                setErrorMessage('Оберіть файл ключа перед запуском приватної дії.');
                return;
            }

            setRunningPrivateAction(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            setPrivateResponse(null);

            const formData = new FormData();
            formData.append('action', privateAction);
            formData.append('payload', privatePayload || '{}');
            formData.append('keyPassword', privatePassword);
            formData.append('taxId', clientTaxId);
            formData.append('keyFile', privateKeyFile);

            const response = await fetch(`/api/integrations/dps/clients/${clientId}/private-action`, {
                method: 'POST',
                body: formData,
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Не вдалося виконати приватну дію ДПС.');
            }

            setSuccessMessage('Приватну дію виконано успішно.');
            setPrivateResponse(JSON.stringify(payload, null, 2));
            setPrivatePassword('');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Неочікувана помилка.');
        } finally {
            setRunningPrivateAction(false);
        }
    };

    const sortedSnapshots = useMemo(
        () => [...snapshots].sort((a, b) => a.registry_code.localeCompare(b.registry_code)),
        [snapshots]
    );

    return (
        <div className="space-y-5">
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
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
                            <RefreshCw size={15} className="text-brand-600" />
                            Стан реєстрів ДПС
                        </h3>
                        <p className="text-xs text-text-muted mt-1">
                            Останній запуск: {latestRun?.started_at ? formatDate(String(latestRun.started_at)) : 'немає даних'}
                        </p>
                    </div>
                    <button
                        onClick={handleClientSync}
                        disabled={syncing || loading}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                            syncing || loading
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <RefreshCw size={14} className={cn(syncing && 'animate-spin')} />
                        Sync клієнта
                    </button>
                </div>

                {loading ? (
                    <p className="text-sm text-text-muted">Завантаження даних ДПС…</p>
                ) : hasSnapshotData ? (
                    <div className="space-y-2">
                        {sortedSnapshots.map((snapshot) => (
                            <div key={snapshot.registry_code} className="rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-semibold text-text-primary">{snapshot.registry_code}</span>
                                    <span className={cn(
                                        'text-xs font-semibold',
                                        snapshot.status === 'ok' ? 'text-emerald-600' : snapshot.status === 'error' ? 'text-red-600' : 'text-text-muted'
                                    )}>
                                        {snapshot.status}
                                    </span>
                                </div>
                                <p className="text-xs text-text-secondary mt-1">
                                    {formatSnapshotMainInfo(snapshot.normalized_payload)}
                                </p>
                                <p className="text-[11px] text-text-muted mt-1">
                                    Оновлено: {formatDate(snapshot.fetched_at)} • TTL до {formatDate(snapshot.expires_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-surface-300 px-4 py-5 text-sm text-text-muted text-center">
                        Дані реєстрів ще не синхронізовано.
                    </div>
                )}
            </div>

            <div className="card p-5 space-y-4">
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
                    <KeyRound size={15} className="text-brand-600" />
                    КЕП-профіль клієнта
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        type="text"
                        value={kepForm.keyOwnerName}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, keyOwnerName: event.target.value }))}
                        placeholder="Власник ключа"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="text"
                        value={kepForm.keyOwnerTaxId}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, keyOwnerTaxId: event.target.value }))}
                        placeholder="РНОКПП/ЄДРПОУ власника"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="text"
                        value={kepForm.certSubject}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, certSubject: event.target.value }))}
                        placeholder="Subject сертифіката"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="text"
                        value={kepForm.certIssuer}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, certIssuer: event.target.value }))}
                        placeholder="Issuer сертифіката"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="text"
                        value={kepForm.certSerial}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, certSerial: event.target.value }))}
                        placeholder="Serial"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <input
                        type="date"
                        value={kepForm.certValidTo}
                        onChange={(event) => setKepForm((prev) => ({ ...prev, certValidTo: event.target.value }))}
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                </div>

                <textarea
                    value={kepForm.notes}
                    onChange={(event) => setKepForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Нотатки"
                    rows={3}
                    className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />

                <div>
                    <button
                        onClick={handleSaveKepProfile}
                        disabled={savingKep}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                            savingKep
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700 text-white'
                        )}
                    >
                        <Save size={14} />
                        Зберегти КЕП-профіль
                    </button>
                </div>
            </div>

            <div className="card p-5 space-y-4">
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
                    <ShieldCheck size={15} className="text-amber-600" />
                    Приватна дія (одноразовий КЕП)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                        value={privateAction}
                        onChange={(event) => setPrivateAction(event.target.value)}
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                        <option value="payer_card">payer_card</option>
                        <option value="tax_debt">tax_debt</option>
                        <option value="documents">documents</option>
                    </select>
                    <input
                        type="password"
                        value={privatePassword}
                        onChange={(event) => setPrivatePassword(event.target.value)}
                        placeholder="Пароль до ключа"
                        className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                </div>

                <textarea
                    rows={4}
                    value={privatePayload}
                    onChange={(event) => setPrivatePayload(event.target.value)}
                    className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder="JSON payload"
                />

                <input
                    type="file"
                    onChange={(event) => setPrivateKeyFile(event.target.files?.[0] || null)}
                    className="w-full text-sm text-text-secondary"
                />

                <div>
                    <button
                        onClick={handleRunPrivateAction}
                        disabled={runningPrivateAction}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                            runningPrivateAction
                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                        )}
                    >
                        <ShieldCheck size={14} />
                        Виконати приватну дію
                    </button>
                </div>

                {privateResponse && (
                    <pre className="rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs text-text-secondary overflow-auto">
                        {privateResponse}
                    </pre>
                )}
            </div>
        </div>
    );
}
