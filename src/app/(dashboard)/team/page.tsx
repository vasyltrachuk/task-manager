'use client';

import { useEffect, useState } from 'react';
import {
    Calendar,
    Search,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    MoreVertical,
    UserX,
    UserCheck,
    Pencil,
    Trash2,
    Users,
    MessageCircle,
    Loader2,
    Link2Off,
    Key,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import {
    useProfiles,
    useDeactivateProfile,
    useReactivateProfile,
    useDeleteProfileSafely,
    useRegenerateProfilePassword,
} from '@/lib/hooks/use-profiles';
import { useTasks } from '@/lib/hooks/use-tasks';
import { Profile } from '@/lib/types';
import { cn, getInitials, formatDate } from '@/lib/utils';
import AccountantFormModal, { AccountantCredentials } from '@/components/team/accountant-form-modal';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import { canManageTeam } from '@/lib/rbac';

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

interface TelegramLinkResponse {
    code: string;
    expiresAt: string;
    botUsername: string | null;
    alreadyLinked: boolean;
}

interface TelegramLinkUiState {
    code?: string;
    expiresAt?: string;
    botUsername?: string | null;
    error?: string;
    notice?: string;
}

function readErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const maybeError = (payload as { error?: unknown }).error;
    return typeof maybeError === 'string' ? maybeError : null;
}

function formatTelegramExpiry(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getTelegramExpiryMs(value?: string): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

function isTelegramCodeExpired(value?: string): boolean {
    const ms = getTelegramExpiryMs(value);
    return ms !== null && ms <= Date.now();
}

function getTelegramCodeMinutesLeft(value?: string): number | null {
    const ms = getTelegramExpiryMs(value);
    if (ms === null) return null;
    const leftMs = ms - Date.now();
    if (leftMs <= 0) return 0;
    return Math.ceil(leftMs / 60000);
}

function getWeekDays(baseDate: Date): Date[] {
    const monday = new Date(baseDate);
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);

    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });
}

function getLoadColor(count: number): string {
    if (count <= 5) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (count <= 10) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-red-100 text-red-700 border-red-200';
}

function getTaskCountForDay(accountantId: string, dayIndex: number, accountantsList: Profile[]): number {
    const counts = [
        [2, 8, 4, 5, 5, 0, 0],
        [3, 5, 7, 9, 2, 0, 0],
        [0, 14, 11, 8, 4, 0, 0],
        [2, 4, 3, 5, 1, 0, 0],
    ];
    const accIdx = accountantsList.findIndex((a: Profile) => a.id === accountantId);
    if (accIdx < 0 || accIdx >= counts.length) return 0;
    return counts[accIdx][dayIndex] ?? 0;
}

export default function TeamLoadPage() {
    const { profile } = useAuth();
    const { data: profiles, refetch: refetchProfiles } = useProfiles();
    const { data: tasks } = useTasks();
    const deactivateProfileMutation = useDeactivateProfile();
    const reactivateProfileMutation = useReactivateProfile();
    const deleteProfileMutation = useDeleteProfileSafely();
    const regeneratePasswordMutation = useRegenerateProfilePassword();

    const [activeTab, setActiveTab] = useState<'manage' | 'capacity'>('manage');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentDate] = useState(new Date('2023-10-23'));
    const weekDays = getWeekDays(currentDate);

    // Modal state
    const [showFormModal, setShowFormModal] = useState(false);
    const [editProfile, setEditProfile] = useState<Profile | null>(null);
    const [previewCredentials, setPreviewCredentials] = useState<AccountantCredentials | null>(null);
    const [passwordResetProfileId, setPasswordResetProfileId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [telegramLoading, setTelegramLoading] = useState<{ id: string; action: 'generate' | 'unlink' } | null>(null);
    const [telegramUiStateByProfile, setTelegramUiStateByProfile] = useState<Record<string, TelegramLinkUiState>>({});

    const accountants = (profiles ?? []).filter((p: Profile) => p.role === 'accountant');
    const canManage = profile ? canManageTeam(profile) : false;
    const hasPendingTelegramLinks = accountants.some((acc) => {
        const ui = telegramUiStateByProfile[acc.id];
        return !acc.telegram_chat_id && Boolean(ui?.code) && !isTelegramCodeExpired(ui.expiresAt);
    });

    useEffect(() => {
        if (!hasPendingTelegramLinks) return;
        const timerId = window.setInterval(() => {
            void refetchProfiles();
        }, 5000);
        return () => window.clearInterval(timerId);
    }, [hasPendingTelegramLinks, refetchProfiles]);

    useEffect(() => {
        if (accountants.length === 0) return;
        setTelegramUiStateByProfile((prev) => {
            let changed = false;
            const next: Record<string, TelegramLinkUiState> = { ...prev };

            for (const acc of accountants) {
                const current = next[acc.id];
                if (!current) continue;

                if (acc.telegram_chat_id) {
                    const connectedNotice = 'Telegram підключено.';
                    if (
                        current.code ||
                        current.expiresAt ||
                        current.error ||
                        current.notice !== connectedNotice
                    ) {
                        next[acc.id] = {
                            ...current,
                            code: undefined,
                            expiresAt: undefined,
                            error: undefined,
                            notice: connectedNotice,
                        };
                        changed = true;
                    }
                    continue;
                }

                if (current.code && isTelegramCodeExpired(current.expiresAt)) {
                    next[acc.id] = {
                        ...current,
                        code: undefined,
                        expiresAt: undefined,
                        notice: undefined,
                        error: 'Термін дії коду минув. Згенеруйте новий код.',
                    };
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [accountants]);

    if (!profile) return null;

    if (!canManage) {
        return <AccessDeniedCard message="Розділ команди доступний лише адміністратору." />;
    }

    const dateRangeStr = `${weekDays[0].toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('uk-UA', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const filteredAccountants = accountants.filter((a: Profile) => {
        if (!searchQuery) return true;
        return a.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.phone.includes(searchQuery);
    });

    const readMutationMessage = (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback;

    const handleEdit = (profile: Profile) => {
        setEditProfile(profile);
        setShowFormModal(true);
        setMenuOpenId(null);
    };

    const handleDeactivate = async (profileId: string) => {
        try {
            await deactivateProfileMutation.mutateAsync(profileId);
            setMenuOpenId(null);
        } catch (error) {
            window.alert(readMutationMessage(error, 'Не вдалося деактивувати профіль.'));
        }
    };

    const handleReactivate = async (profileId: string) => {
        try {
            await reactivateProfileMutation.mutateAsync(profileId);
            setMenuOpenId(null);
        } catch (error) {
            window.alert(readMutationMessage(error, 'Не вдалося активувати профіль.'));
        }
    };

    const handleDeleteProfile = async (staffProfile: Profile) => {
        const confirmed = window.confirm(
            `Видалити бухгалтера "${staffProfile.full_name}" назавжди?\n\nЦе можна зробити лише якщо профіль не прив'язаний до клієнтів і не має історії.`
        );
        if (!confirmed) return;

        try {
            await deleteProfileMutation.mutateAsync(staffProfile.id);
            setTelegramUiStateByProfile((prev) => {
                const next = { ...prev };
                delete next[staffProfile.id];
                return next;
            });
            setMenuOpenId(null);
        } catch (error) {
            window.alert(readMutationMessage(error, 'Не вдалося видалити профіль.'));
        }
    };

    const handleRegeneratePassword = async (staffProfile: Profile) => {
        if (!staffProfile.email) {
            window.alert('У профілю немає email. Додайте email у картці бухгалтера, щоб згенерувати пароль.');
            return;
        }

        const confirmed = window.confirm(
            `Перегенерувати пароль для "${staffProfile.full_name}"?\n\nПопередній пароль перестане працювати одразу після підтвердження.`
        );
        if (!confirmed) return;

        setPasswordResetProfileId(staffProfile.id);
        try {
            const result = await regeneratePasswordMutation.mutateAsync(staffProfile.id);
            setPreviewCredentials({
                login: result.email ?? staffProfile.email,
                password: result.generated_password ?? '',
                name: result.full_name ?? staffProfile.full_name,
                context: 'reset',
            });
            setMenuOpenId(null);
        } catch (error) {
            window.alert(readMutationMessage(error, 'Не вдалося перегенерувати пароль.'));
        } finally {
            setPasswordResetProfileId((current) => (current === staffProfile.id ? null : current));
        }
    };

    const handleGenerateTelegramCode = async (staffProfile: Profile) => {
        setTelegramLoading({ id: staffProfile.id, action: 'generate' });
        setTelegramUiStateByProfile((prev) => ({
            ...prev,
            [staffProfile.id]: { ...prev[staffProfile.id], error: undefined, notice: undefined },
        }));

        try {
            const response = await fetch('/api/staff/telegram-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: staffProfile.id }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(readErrorMessage(payload) ?? 'Не вдалося згенерувати Telegram-код.');
            }

            const data = payload as TelegramLinkResponse;
            if (data.alreadyLinked) {
                await refetchProfiles();
                setTelegramUiStateByProfile((prev) => ({
                    ...prev,
                    [staffProfile.id]: {
                        ...prev[staffProfile.id],
                        code: undefined,
                        expiresAt: undefined,
                        botUsername: data.botUsername,
                        error: undefined,
                        notice: 'Telegram уже підключено для цього бухгалтера.',
                    },
                }));
                return;
            }

            setTelegramUiStateByProfile((prev) => ({
                ...prev,
                [staffProfile.id]: {
                    code: data.code,
                    expiresAt: data.expiresAt,
                    botUsername: data.botUsername,
                    error: undefined,
                    notice: 'Код згенеровано. Очікуємо підтвердження від бухгалтера в Telegram.',
                },
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не вдалося згенерувати Telegram-код.';
            setTelegramUiStateByProfile((prev) => ({
                ...prev,
                [staffProfile.id]: { ...prev[staffProfile.id], notice: undefined, error: message },
            }));
        } finally {
            setTelegramLoading((current) => (current?.id === staffProfile.id && current.action === 'generate' ? null : current));
        }
    };

    const handleUnlinkTelegram = async (staffProfile: Profile) => {
        const confirmed = window.confirm(`Відв'язати Telegram у бухгалтера "${staffProfile.full_name}"?`);
        if (!confirmed) return;

        setTelegramLoading({ id: staffProfile.id, action: 'unlink' });
        setTelegramUiStateByProfile((prev) => ({
            ...prev,
            [staffProfile.id]: { ...prev[staffProfile.id], error: undefined, notice: undefined },
        }));

        try {
            const response = await fetch('/api/staff/telegram-link', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: staffProfile.id }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(readErrorMessage(payload) ?? 'Не вдалося відв’язати Telegram.');
            }

            setTelegramUiStateByProfile((prev) => {
                const next = { ...prev };
                next[staffProfile.id] = { notice: 'Telegram відвʼязано.' };
                return next;
            });
            await refetchProfiles();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не вдалося відв’язати Telegram.';
            setTelegramUiStateByProfile((prev) => ({
                ...prev,
                [staffProfile.id]: { ...prev[staffProfile.id], error: message },
            }));
        } finally {
            setTelegramLoading((current) => (current?.id === staffProfile.id && current.action === 'unlink' ? null : current));
        }
    };

    return (
        <div className="p-6 h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-text-primary">Команда</h1>

                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Пошук бухгалтерів..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 w-64 transition-all"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Tab Toggle */}
                    <div className="flex items-center bg-white border border-surface-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setActiveTab('manage')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                                activeTab === 'manage' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-50'
                            )}
                        >
                            <Users size={14} />
                            Управління
                        </button>
                        <button
                            onClick={() => setActiveTab('capacity')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                                activeTab === 'capacity' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-50'
                            )}
                        >
                            <Calendar size={14} />
                            Навантаження
                        </button>
                    </div>

                    {activeTab === 'manage' && (
                        <button
                            onClick={() => { setEditProfile(null); setShowFormModal(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                        >
                            <UserPlus size={16} />
                            Додати бухгалтера
                        </button>
                    )}
                </div>
            </div>

            {/* ===== MANAGE TAB ===== */}
            {activeTab === 'manage' && (
                <div className="flex-1 overflow-y-auto">
                    {/* Stats bar */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="card p-4">
                            <div className="text-2xl font-bold text-brand-600">{accountants.filter(a => a.is_active).length}</div>
                            <div className="text-xs text-text-muted font-medium mt-0.5">Активних бухгалтерів</div>
                        </div>
                        <div className="card p-4">
                            <div className="text-2xl font-bold text-text-primary">{accountants.length}</div>
                            <div className="text-xs text-text-muted font-medium mt-0.5">Всього акаунтів</div>
                        </div>
                    </div>

                    {/* Accountant Cards */}
                    <div className="space-y-3">
                        {filteredAccountants.map((acc) => {
                            const activeTasks = (tasks ?? []).filter(t => t.assignee_id === acc.id && t.status !== 'done');
                            const telegramUi = telegramUiStateByProfile[acc.id];
                            const linkExpired = isTelegramCodeExpired(telegramUi?.expiresAt);
                            const pendingTelegramLink = Boolean(telegramUi?.code) && !acc.telegram_chat_id && !linkExpired;
                            const telegramMinutesLeft = getTelegramCodeMinutesLeft(telegramUi?.expiresAt);
                            const generatingCode = telegramLoading?.id === acc.id && telegramLoading.action === 'generate';
                            const unlinkingTelegram = telegramLoading?.id === acc.id && telegramLoading.action === 'unlink';
                            const resettingPassword = passwordResetProfileId === acc.id;

                            return (
                                <div
                                    key={acc.id}
                                    className={cn(
                                        'card p-5 transition-all',
                                        !acc.is_active && 'opacity-60'
                                    )}
                                >
                                    <div className="flex items-center gap-5">
                                        {/* Avatar */}
                                        <div className={cn(
                                            'w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                                            acc.is_active
                                                ? 'bg-brand-100 text-brand-700'
                                                : 'bg-surface-200 text-text-muted'
                                        )}>
                                            {getInitials(acc.full_name)}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <h3 className="text-sm font-bold text-text-primary">{acc.full_name}</h3>
                                                {acc.is_active ? (
                                                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                        Активний
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-semibold text-text-muted bg-surface-100 px-2 py-0.5 rounded-full">
                                                        Деактивований
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-text-muted">
                                                <span>{acc.phone}</span>
                                                {acc.email && <span>• {acc.email}</span>}
                                                <span>• {activeTasks.length} активних завдань</span>
                                                <span>• Створено {formatDate(acc.created_at)}</span>
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                {acc.telegram_chat_id ? (
                                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                        Telegram підключено
                                                    </span>
                                                ) : pendingTelegramLink ? (
                                                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        Очікує підтвердження в Telegram
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-semibold text-text-muted bg-surface-100 px-2 py-0.5 rounded-full">
                                                        Telegram не підключено
                                                    </span>
                                                )}
                                                {pendingTelegramLink && telegramUi?.expiresAt && (
                                                    <span className="text-[10px] text-text-muted">
                                                        Код діє ще {telegramMinutesLeft ?? 0} хв (до {formatTelegramExpiry(telegramUi.expiresAt)})
                                                    </span>
                                                )}
                                                {!pendingTelegramLink && telegramUi?.notice && (
                                                    <span className="text-[10px] text-emerald-700">{telegramUi.notice}</span>
                                                )}
                                                {telegramUi?.error && (
                                                    <span className="text-[10px] text-red-600">{telegramUi.error}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions menu */}
                                        <div className="flex-shrink-0">
                                            <DropdownMenu.Root
                                                open={menuOpenId === acc.id}
                                                onOpenChange={(open) => {
                                                    if (open) {
                                                        setMenuOpenId(acc.id);
                                                        return;
                                                    }
                                                    setMenuOpenId((current) => (current === acc.id ? null : current));
                                                }}
                                            >
                                                <DropdownMenu.Trigger asChild>
                                                    <button
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 hover:text-text-primary transition-colors"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>
                                                </DropdownMenu.Trigger>

                                                <DropdownMenu.Portal>
                                                    <DropdownMenu.Content
                                                        sideOffset={8}
                                                        align="end"
                                                        collisionPadding={12}
                                                        className="z-[120] w-56 bg-white border border-surface-200 rounded-xl shadow-lg py-1.5 animate-in fade-in zoom-in-95 duration-150"
                                                    >
                                                        <button
                                                            onClick={() => handleEdit(acc)}
                                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-50 transition-colors"
                                                        >
                                                            <Pencil size={14} /> Редагувати
                                                        </button>
                                                        <button
                                                            onClick={() => void handleRegeneratePassword(acc)}
                                                            disabled={resettingPassword || !acc.email}
                                                            className={cn(
                                                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                                                                resettingPassword || !acc.email
                                                                    ? 'text-text-muted cursor-not-allowed'
                                                                    : 'text-text-primary hover:bg-surface-50'
                                                            )}
                                                        >
                                                            {resettingPassword
                                                                ? <Loader2 size={14} className="animate-spin" />
                                                                : <Key size={14} />}
                                                            {resettingPassword
                                                                ? 'Оновлюємо пароль...'
                                                                : 'Перегенерувати пароль'}
                                                        </button>
                                                        <div className="border-t border-surface-100 my-1" />

                                                        {acc.telegram_chat_id ? (
                                                            <>
                                                                <div className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-emerald-700 bg-emerald-50/70">
                                                                    <MessageCircle size={14} />
                                                                    Telegram підключено
                                                                </div>
                                                                <button
                                                                    onClick={() => void handleUnlinkTelegram(acc)}
                                                                    disabled={unlinkingTelegram}
                                                                    className={cn(
                                                                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                                                                        unlinkingTelegram
                                                                            ? 'text-text-muted cursor-not-allowed'
                                                                            : 'text-text-primary hover:bg-surface-50'
                                                                    )}
                                                                >
                                                                    {unlinkingTelegram
                                                                        ? <Loader2 size={14} className="animate-spin" />
                                                                        : <Link2Off size={14} />}
                                                                    {unlinkingTelegram ? 'Відв’язуємо...' : 'Відв’язати Telegram'}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => void handleGenerateTelegramCode(acc)}
                                                                disabled={generatingCode}
                                                                className={cn(
                                                                    'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                                                                    generatingCode
                                                                        ? 'text-text-muted cursor-not-allowed'
                                                                        : 'text-text-primary hover:bg-surface-50'
                                                                )}
                                                            >
                                                                {generatingCode
                                                                    ? <Loader2 size={14} className="animate-spin" />
                                                                    : <MessageCircle size={14} />}
                                                                {generatingCode
                                                                    ? 'Генеруємо код...'
                                                                    : pendingTelegramLink
                                                                        ? 'Згенерувати новий код'
                                                                        : 'Telegram'}
                                                            </button>
                                                        )}

                                                        {telegramUi?.code && !acc.telegram_chat_id && (
                                                            <div className="mx-3 my-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold text-brand-700">
                                                                    Код: <span className="font-mono tracking-[0.12em]">{telegramUi.code}</span>
                                                                </p>
                                                                <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                                                                    Відправте <span className="font-mono">/start {telegramUi.code}</span>{' '}
                                                                    {telegramUi.botUsername ? `боту @${telegramUi.botUsername}` : 'боту в Telegram'}.
                                                                </p>
                                                                <p className="mt-1 text-[10px] text-brand-700">
                                                                    Очікуємо підтвердження від бухгалтера. Статус оновиться автоматично.
                                                                </p>
                                                                {telegramUi.expiresAt && (
                                                                    <p className="mt-1 text-[10px] text-text-muted">
                                                                        Діє до {formatTelegramExpiry(telegramUi.expiresAt)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {!telegramUi?.code && telegramUi?.notice && (
                                                            <div className="mx-3 my-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                                                                {telegramUi.notice}
                                                            </div>
                                                        )}

                                                        {telegramUi?.error && (
                                                            <div className="mx-3 my-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                                                                {telegramUi.error}
                                                            </div>
                                                        )}

                                                        <div className="border-t border-surface-100 my-1" />
                                                        {acc.is_active ? (
                                                            <button
                                                                onClick={() => void handleDeactivate(acc.id)}
                                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                            >
                                                                <UserX size={14} /> Деактивувати
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => void handleReactivate(acc.id)}
                                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-50 transition-colors"
                                                            >
                                                                <UserCheck size={14} /> Активувати
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => void handleDeleteProfile(acc)}
                                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 size={14} /> Видалити назавжди
                                                        </button>
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Portal>
                                            </DropdownMenu.Root>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {filteredAccountants.length === 0 && (
                            <div className="text-center py-16">
                                <Users size={48} className="mx-auto text-surface-300 mb-3" />
                                <p className="text-sm text-text-muted">
                                    {searchQuery ? 'Нічого не знайдено' : 'Ще немає бухгалтерів'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== CAPACITY TAB ===== */}
            {activeTab === 'capacity' && (
                <>
                    {/* Legend */}
                    <div className="flex items-center gap-6 mb-5 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-load-optimal" />
                            <span className="text-xs text-text-muted font-medium">ОПТИМАЛЬНО (1-5)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-load-heavy" />
                            <span className="text-xs text-text-muted font-medium">ВИСОКЕ (6-10)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-load-overload" />
                            <span className="text-xs text-text-muted font-medium">ПЕРЕВАНТАЖЕННЯ (11+)</span>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                            <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted">
                                <ChevronLeft size={16} />
                            </button>
                            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-surface-200 rounded-lg text-sm font-medium text-text-primary hover:bg-surface-50 transition-colors">
                                <Calendar size={14} />
                                {dateRangeStr}
                            </button>
                            <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Capacity Grid */}
                    <div className="flex-1 card overflow-auto">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-white z-10">
                                <tr className="border-b border-surface-200">
                                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 w-56">
                                        БУХГАЛТЕР
                                    </th>
                                    {weekDays.map((day, i) => (
                                        <th key={i} className="text-center text-xs font-semibold text-text-muted px-3 py-3 w-20">
                                            <div className="flex flex-col items-center">
                                                <span>{DAYS_OF_WEEK[i]}</span>
                                                <span className="text-lg font-bold text-text-primary mt-0.5">{day.getDate()}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAccountants.filter(a => a.is_active).map((acc) => (
                                    <tr key={acc.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                                        <td className="px-4 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-xs font-bold text-text-secondary">
                                                    {getInitials(acc.full_name)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-text-primary">{acc.full_name}</p>
                                                    <p className="text-xs text-text-muted">Бухгалтер</p>
                                                </div>
                                            </div>
                                        </td>
                                        {weekDays.map((_, dayIndex) => {
                                            const count = getTaskCountForDay(acc.id, dayIndex, accountants);
                                            if (count === 0) {
                                                return (
                                                    <td key={dayIndex} className="px-3 py-5 text-center">
                                                        <span className="text-xs text-text-muted">Вільно</span>
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={dayIndex} className="px-3 py-5 text-center">
                                                    <span className={cn(
                                                        'inline-flex items-center justify-center min-w-[52px] px-2 py-1.5 rounded-lg text-xs font-bold border',
                                                        getLoadColor(count)
                                                    )}>
                                                        {count} {count === 1 ? 'завдання' : 'завдань'}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Accountant Form Modal */}
            {(showFormModal || Boolean(previewCredentials)) && (
                <AccountantFormModal
                    isOpen={showFormModal || Boolean(previewCredentials)}
                    onClose={() => {
                        setShowFormModal(false);
                        setEditProfile(null);
                        setPreviewCredentials(null);
                    }}
                    editProfile={editProfile}
                    initialCredentials={previewCredentials}
                />
            )}
        </div>
    );
}
