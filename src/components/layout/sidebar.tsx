'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    KanbanSquare,
    ShieldCheck,
    Wallet,
    BarChart3,
    Settings,
    ChevronDown,
    Check,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { USER_ROLE_LABELS } from '@/lib/types';
import { useApp } from '@/lib/store';
import { isAdmin } from '@/lib/rbac';

const adminNavItems = [
    { href: '/', label: 'Огляд', icon: LayoutDashboard },
    { href: '/clients', label: 'Клієнти', icon: Users },
    { href: '/tasks', label: 'Завдання', icon: KanbanSquare },
    { href: '/licenses', label: 'Ліцензії', icon: ShieldCheck },
    { href: '/billing', label: 'Оплати', icon: Wallet },
    { href: '/team', label: 'Команда', icon: BarChart3 },
];

const accountantNavItems = [
    { href: '/clients', label: 'Клієнти', icon: Users },
    { href: '/tasks', label: 'Завдання', icon: KanbanSquare },
    { href: '/billing', label: 'Оплати', icon: Wallet },
];

const adminSettingsItems = [
    { href: '/settings', label: 'Налаштування', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { state, setCurrentUser } = useApp();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const currentUser = state.currentUser;
    const isCurrentUserAdmin = isAdmin(currentUser);

    const navItems = isCurrentUserAdmin ? adminNavItems : accountantNavItems;
    const settingsItems = isCurrentUserAdmin ? adminSettingsItems : [];
    const switchableProfiles = useMemo(
        () => state.profiles.filter((profile) =>
            profile.is_active && (profile.role === 'admin' || profile.role === 'accountant')
        ),
        [state.profiles]
    );

    return (
        <aside className="fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-surface-200 z-40"
            style={{ width: 'var(--sidebar-width)' }}>
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-200">
                <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                </div>
                <div>
                    <div className="font-bold text-sm text-text-primary leading-tight">Task&Control</div>
                    <div className="text-[11px] text-text-muted font-medium">
                        {isCurrentUserAdmin ? 'Робочий простір адміністратора' : 'Робочий простір бухгалтера'}
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn('nav-item', isActive && 'active')}
                        >
                            <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}

                {settingsItems.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-surface-200">
                        <div className="px-4 pb-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                            Налаштування
                        </div>
                        {settingsItems.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn('nav-item', isActive && 'active')}
                                >
                                    <item.icon size={18} strokeWidth={1.8} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </nav>

            {/* User Profile */}
            <div className="px-3 py-4 border-t border-surface-200 relative">
                <button
                    onClick={() => setIsUserMenuOpen((prev) => !prev)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-surface-100 transition-colors"
                >
                    <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-semibold">
                        {getInitials(currentUser.full_name)}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{currentUser.full_name}</div>
                        <div className="text-[11px] text-text-muted capitalize">{USER_ROLE_LABELS[currentUser.role]}</div>
                    </div>
                    <ChevronDown size={14} className="text-text-muted" />
                </button>

                {isUserMenuOpen && (
                    <div className="absolute bottom-[72px] left-3 right-3 bg-white border border-surface-200 rounded-xl shadow-lg py-1.5 z-50">
                        {switchableProfiles.map((profile) => (
                            <button
                                key={profile.id}
                                onClick={() => {
                                    setCurrentUser(profile.id);
                                    setIsUserMenuOpen(false);
                                }}
                                className={cn(
                                    'w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center justify-between gap-2',
                                    profile.id === currentUser.id
                                        ? 'bg-brand-50 text-brand-700'
                                        : 'text-text-primary hover:bg-surface-50'
                                )}
                            >
                                <span className="truncate">{profile.full_name} ({USER_ROLE_LABELS[profile.role]})</span>
                                {profile.id === currentUser.id && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}
