'use client';

import { useState } from 'react';
import {
    Calendar,
    Search,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    Key,
    Copy,
    Check,
    Eye,
    EyeOff,
    MoreVertical,
    UserX,
    Pencil,
    RefreshCw,
    Users,
    Shield,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { Profile } from '@/lib/types';
import { cn, getInitials, formatDate } from '@/lib/utils';
import AccountantFormModal from '@/components/team/accountant-form-modal';
import { canManageTeam } from '@/lib/rbac';

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

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
    const { state, deactivateProfile, regeneratePassword } = useApp();
    const canManage = canManageTeam(state.currentUser);
    const accountants = state.profiles.filter((p: Profile) => p.role === 'accountant');
    const [activeTab, setActiveTab] = useState<'manage' | 'capacity'>('manage');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentDate] = useState(new Date('2023-10-23'));
    const weekDays = getWeekDays(currentDate);

    // Modal state
    const [showFormModal, setShowFormModal] = useState(false);
    const [editProfile, setEditProfile] = useState<Profile | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    // Password reveal state (per-profile)
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [regeneratedPasswords, setRegeneratedPasswords] = useState<Record<string, string>>({});

    if (!canManage) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Немає доступу</h1>
                    <p className="text-sm text-text-muted">Розділ команди доступний лише адміністратору.</p>
                </div>
            </div>
        );
    }

    const dateRangeStr = `${weekDays[0].toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('uk-UA', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const filteredAccountants = accountants.filter((a: Profile) => {
        if (!searchQuery) return true;
        return a.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.phone.includes(searchQuery);
    });

    const handleCopy = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleRegeneratePassword = (profileId: string) => {
        const newPassword = regeneratePassword(profileId);
        setRegeneratedPasswords(prev => ({ ...prev, [profileId]: newPassword }));
        setRevealedPasswords(prev => ({ ...prev, [profileId]: true }));
        setMenuOpenId(null);
    };

    const handleEdit = (profile: Profile) => {
        setEditProfile(profile);
        setShowFormModal(true);
        setMenuOpenId(null);
    };

    const handleDeactivate = (profileId: string) => {
        deactivateProfile(profileId);
        setMenuOpenId(null);
    };

    return (
        <div className="p-8 h-screen flex flex-col">
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
                            Створити бухгалтера
                        </button>
                    )}
                </div>
            </div>

            {/* ===== MANAGE TAB ===== */}
            {activeTab === 'manage' && (
                <div className="flex-1 overflow-y-auto">
                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="card p-4">
                            <div className="text-2xl font-bold text-brand-600">{accountants.filter(a => a.is_active).length}</div>
                            <div className="text-xs text-text-muted font-medium mt-0.5">Активних бухгалтерів</div>
                        </div>
                        <div className="card p-4">
                            <div className="text-2xl font-bold text-text-primary">{accountants.length}</div>
                            <div className="text-xs text-text-muted font-medium mt-0.5">Всього акаунтів</div>
                        </div>
                        <div className="card p-4">
                            <div className="text-2xl font-bold text-amber-500">{accountants.filter(a => a.generated_password && !a.password_changed).length}</div>
                            <div className="text-xs text-text-muted font-medium mt-0.5">Не змінили пароль</div>
                        </div>
                    </div>

                    {/* Accountant Cards */}
                    <div className="space-y-3">
                        {filteredAccountants.map((acc) => {
                            const activeTasks = state.tasks.filter(t => t.assignee_id === acc.id && t.status !== 'done');
                            const password = regeneratedPasswords[acc.id] || acc.generated_password;
                            const isRevealed = revealedPasswords[acc.id];

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
                                                {password && !acc.password_changed && (
                                                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        Не змінив пароль
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-text-muted">
                                                <span>{acc.phone}</span>
                                                {acc.email && <span>• {acc.email}</span>}
                                                <span>• {activeTasks.length} активних завдань</span>
                                                <span>• Створено {formatDate(acc.created_at)}</span>
                                            </div>
                                        </div>

                                        {/* Credentials */}
                                        {password && acc.is_active && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <div className="flex items-center gap-1 px-3 py-1.5 bg-surface-50 border border-surface-200 rounded-lg">
                                                    <Key size={12} className="text-text-muted" />
                                                    <span className="text-xs font-mono text-text-secondary">
                                                        {isRevealed ? password : '••••••••'}
                                                    </span>
                                                    <button
                                                        onClick={() => setRevealedPasswords(prev => ({
                                                            ...prev,
                                                            [acc.id]: !prev[acc.id]
                                                        }))}
                                                        className="text-text-muted hover:text-text-primary ml-1 transition-colors"
                                                    >
                                                        {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopy(password, `pass-${acc.id}`)}
                                                        className="text-text-muted hover:text-text-primary ml-0.5 transition-colors"
                                                    >
                                                        {copiedField === `pass-${acc.id}` ? (
                                                            <Check size={12} className="text-emerald-500" />
                                                        ) : (
                                                            <Copy size={12} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions menu */}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                onClick={() => setMenuOpenId(menuOpenId === acc.id ? null : acc.id)}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors"
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {menuOpenId === acc.id && (
                                                <div className="absolute right-0 top-10 w-56 bg-white border border-surface-200 rounded-xl shadow-lg z-20 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                                                    <button
                                                        onClick={() => handleEdit(acc)}
                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-50 transition-colors"
                                                    >
                                                        <Pencil size={14} /> Редагувати
                                                    </button>
                                                    {acc.is_active && (
                                                        <button
                                                            onClick={() => handleRegeneratePassword(acc.id)}
                                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-50 transition-colors"
                                                        >
                                                            <RefreshCw size={14} /> Перегенерувати пароль
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            handleCopy(`Логін: ${acc.phone}\nПароль: ${password || 'Н/Д'}`, `all-${acc.id}`);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-50 transition-colors"
                                                    >
                                                        <Copy size={14} /> Скопіювати дані входу
                                                    </button>
                                                    <div className="border-t border-surface-100 my-1" />
                                                    {acc.is_active ? (
                                                        <button
                                                            onClick={() => handleDeactivate(acc.id)}
                                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <UserX size={14} /> Деактивувати
                                                        </button>
                                                    ) : (
                                                        <div className="px-4 py-2.5 text-xs text-text-muted">
                                                            <Shield size={12} className="inline mr-1" />
                                                            Акаунт деактивовано
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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
            <AccountantFormModal
                isOpen={showFormModal}
                onClose={() => { setShowFormModal(false); setEditProfile(null); }}
                editProfile={editProfile}
            />

            {/* Click outside to close menu */}
            {menuOpenId && (
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
            )}
        </div>
    );
}
