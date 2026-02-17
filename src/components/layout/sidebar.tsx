'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    PanelLeftOpen,
    PanelLeftClose,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { USER_ROLE_LABELS } from '@/lib/types';
import { useApp } from '@/lib/store';
import { isAdmin, getVisibleTasksForUser } from '@/lib/rbac';

interface NavItem {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
}

const adminNavItems: NavItem[] = [
    { href: '/', label: 'Огляд', icon: LayoutDashboard },
    { href: '/clients', label: 'Клієнти', icon: Users },
    { href: '/tasks', label: 'Завдання', icon: KanbanSquare },
    { href: '/licenses', label: 'Ліцензії', icon: ShieldCheck },
    { href: '/billing', label: 'Оплати', icon: Wallet },
    { href: '/team', label: 'Команда', icon: BarChart3 },
];

const accountantNavItems: NavItem[] = [
    { href: '/clients', label: 'Клієнти', icon: Users },
    { href: '/tasks', label: 'Завдання', icon: KanbanSquare },
    { href: '/billing', label: 'Оплати', icon: Wallet },
];

const adminSettingsItems = [
    { href: '/settings', label: 'Налаштування', icon: Settings },
];

interface Tooltip {
    label: string;
    top: number;
}

function SidebarTooltip({ label, top }: Tooltip) {
    return createPortal(
        <div
            className="nav-tooltip visible"
            style={{ top }}
        >
            {label}
        </div>,
        document.body
    );
}

export default function Sidebar() {
    const pathname = usePathname();
    const { state, setCurrentUser } = useApp();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [tooltip, setTooltip] = useState<Tooltip | null>(null);
    const hideTimeout = useRef<ReturnType<typeof setTimeout>>(null);
    const currentUser = state.currentUser;
    const isCurrentUserAdmin = isAdmin(currentUser);

    const navItems = useMemo(() => {
        const base = isCurrentUserAdmin ? adminNavItems : accountantNavItems;
        if (isCurrentUserAdmin) return base;
        const todoCount = getVisibleTasksForUser(state.tasks, currentUser)
            .filter(t => t.status === 'todo').length;
        if (todoCount === 0) return base;
        return base.map(item =>
            item.href === '/tasks' ? { ...item, badge: todoCount } : item
        );
    }, [isCurrentUserAdmin, state.tasks, currentUser]);
    const settingsItems = isCurrentUserAdmin ? adminSettingsItems : [];
    const switchableProfiles = useMemo(
        () => state.profiles.filter((profile) =>
            profile.is_active && (profile.role === 'admin' || profile.role === 'accountant')
        ),
        [state.profiles]
    );

    const collapse = useCallback(() => {
        setIsExpanded(false);
        setIsUserMenuOpen(false);
    }, []);

    // Collapse on navigation
    useEffect(() => {
        collapse();
    }, [pathname, collapse]);

    // Close on Escape
    useEffect(() => {
        if (!isExpanded) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') collapse();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded, collapse]);

    const showTooltip = useCallback((e: React.MouseEvent, label: string) => {
        if (isExpanded) return;
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTooltip({ label, top: rect.top + rect.height / 2 });
    }, [isExpanded]);

    const hideTooltip = useCallback(() => {
        hideTimeout.current = setTimeout(() => setTooltip(null), 100);
    }, []);

    return (
        <>
            {/* Backdrop — closes sidebar on click outside */}
            {isExpanded && (
                <div className="sidebar-backdrop" onClick={collapse} />
            )}

            <aside className={cn('sidebar', isExpanded && 'expanded')}>
                {/* Header — toggle button + logo */}
                <div className="flex items-center gap-3 px-3 py-4 border-b border-surface-200">
                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-100 transition-colors flex-shrink-0"
                        aria-label={isExpanded ? 'Згорнути меню' : 'Розгорнути меню'}
                    >
                        {isExpanded
                            ? <PanelLeftClose size={20} className="text-text-secondary" />
                            : <PanelLeftOpen size={20} className="text-text-secondary" />
                        }
                    </button>
                    {isExpanded && (
                        <div className="min-w-0">
                            <div className="font-bold text-sm text-text-primary leading-tight">Task&Control</div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn('nav-item', isActive && 'active')}
                                onMouseEnter={(e) => showTooltip(e, item.label)}
                                onMouseLeave={hideTooltip}
                            >
                                <div className="relative nav-icon">
                                    <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                                    {item.badge && item.badge > 0 && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                                    )}
                                </div>
                                {isExpanded && <span>{item.label}</span>}
                            </Link>
                        );
                    })}

                    {settingsItems.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-surface-200">
                            {settingsItems.map((item) => {
                                const isActive = pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn('nav-item', isActive && 'active')}
                                        onMouseEnter={(e) => showTooltip(e, item.label)}
                                        onMouseLeave={hideTooltip}
                                    >
                                        <div className="nav-icon">
                                            <item.icon size={18} strokeWidth={1.8} />
                                        </div>
                                        {isExpanded && <span>{item.label}</span>}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </nav>

                {/* User Profile */}
                <div className="px-2 py-3 border-t border-surface-200 relative">
                    <button
                        onClick={() => {
                            if (!isExpanded) {
                                setIsExpanded(true);
                                setIsUserMenuOpen(true);
                            } else {
                                setIsUserMenuOpen(prev => !prev);
                            }
                        }}
                        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-surface-100 transition-colors"
                        onMouseEnter={(e) => showTooltip(e, currentUser.full_name)}
                        onMouseLeave={hideTooltip}
                    >
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-semibold flex-shrink-0">
                            {getInitials(currentUser.full_name)}
                        </div>
                        {isExpanded && (
                            <>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="text-sm font-semibold text-text-primary truncate">{currentUser.full_name}</div>
                                    <div className="text-[11px] text-text-muted capitalize">{USER_ROLE_LABELS[currentUser.role]}</div>
                                </div>
                                <ChevronDown size={14} className="text-text-muted" />
                            </>
                        )}
                    </button>

                    {isUserMenuOpen && isExpanded && (
                        <div className="absolute bottom-[72px] left-2 right-2 bg-white border border-surface-200 rounded-xl shadow-lg py-1.5 z-50">
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

            {/* Portal tooltip — renders outside sidebar overflow */}
            {tooltip && !isExpanded && <SidebarTooltip {...tooltip} />}
        </>
    );
}
