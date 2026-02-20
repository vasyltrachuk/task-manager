'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    KanbanSquare,
    MessageSquare,
    ShieldCheck,
    Wallet,
    UserRoundCog,
    Settings,
    Plug,
    Scale,
    LogOut,
    PanelLeftOpen,
    PanelLeftClose,
} from 'lucide-react';
import { cn, getInitials, formatShortName } from '@/lib/utils';
import { USER_ROLE_LABELS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useUnreadTotal } from '@/lib/hooks/use-conversations';
import { isAdmin, canAccessInbox, getVisibleTasksForUser } from '@/lib/rbac';

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
    { href: '/inbox', label: 'Чати', icon: MessageSquare },
    { href: '/licenses', label: 'Ліцензії', icon: ShieldCheck },
    { href: '/billing', label: 'Оплати', icon: Wallet },
    { href: '/team', label: 'Команда', icon: UserRoundCog },
];

const accountantNavItems: NavItem[] = [
    { href: '/clients', label: 'Клієнти', icon: Users },
    { href: '/tasks', label: 'Завдання', icon: KanbanSquare },
    { href: '/inbox', label: 'Чати', icon: MessageSquare },
    { href: '/billing', label: 'Оплати', icon: Wallet },
];

const adminSettingsItems = [
    { href: '/settings', label: 'Налаштування', icon: Settings },
    { href: '/settings/tax-rules', label: 'Податкові правила', icon: Scale },
    { href: '/settings/integrations', label: 'Інтеграції', icon: Plug },
];

const accountantSettingsItems = [
    { href: '/settings/integrations', label: 'Інтеграції', icon: Plug },
];

interface Tooltip {
    label: string;
    variant: 'default' | 'active';
    visible: boolean;
}

const subscribe = () => () => { };

function SidebarTooltip({
    label,
    variant,
    visible,
    tooltipRef,
}: Tooltip & { tooltipRef: React.RefObject<HTMLDivElement | null> }) {
    const isMounted = useSyncExternalStore(subscribe, () => true, () => false);
    const isActive = variant === 'active';

    // Keep SSR and first client render identical; only create a portal after mount.
    if (!isMounted) return null;

    return createPortal(
        <div
            ref={tooltipRef}
            className={cn('nav-tooltip', visible && 'visible')}
            aria-hidden={!visible}
            style={{
                backgroundColor: isActive ? 'var(--color-brand-50)' : 'var(--color-surface-100)',
                color: isActive ? 'var(--color-brand-600)' : 'var(--color-text-primary)',
            }}
        >
            {label}
        </div>,
        document.body
    );
}

export default function Sidebar() {
    const pathname = usePathname();
    const { profile, signOut } = useAuth();
    const { data: tasks } = useTasks();
    const canViewInbox = profile ? canAccessInbox(profile) : false;
    const { data: unreadTotal } = useUnreadTotal(canViewInbox);
    const [isExpanded, setIsExpanded] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<Tooltip>({
        label: '',
        variant: 'default',
        visible: false,
    });

    const isCurrentUserAdmin = profile ? isAdmin(profile) : false;

    const navItems = useMemo(() => {
        if (!profile) return [];
        let navWithBadges = [...(isCurrentUserAdmin ? adminNavItems : accountantNavItems)];
        if (!canViewInbox) {
            navWithBadges = navWithBadges.filter(item => item.href !== '/inbox');
        }
        if (canViewInbox && (unreadTotal ?? 0) > 0) {
            navWithBadges = navWithBadges.map(item =>
                item.href === '/inbox' ? { ...item, badge: unreadTotal } : item
            );
        }
        if (isCurrentUserAdmin) return navWithBadges;
        const todoCount = getVisibleTasksForUser(tasks ?? [], profile)
            .filter(t => t.status === 'todo').length;
        if (todoCount === 0) return navWithBadges;
        return navWithBadges.map(item =>
            item.href === '/tasks' ? { ...item, badge: todoCount } : item
        );
    }, [canViewInbox, isCurrentUserAdmin, unreadTotal, tasks, profile]);
    const settingsItems = isCurrentUserAdmin ? adminSettingsItems : accountantSettingsItems;

    const collapse = useCallback(() => {
        setIsExpanded(false);
    }, []);

    // Close on Escape
    useEffect(() => {
        if (!isExpanded) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') collapse();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded, collapse]);

    const showTooltip = useCallback((
        e: React.PointerEvent<HTMLElement>,
        label: string,
        variant: Tooltip['variant'] = 'default'
    ) => {
        if (isExpanded || e.pointerType === 'touch') return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

        if (tooltipRef.current) {
            tooltipRef.current.style.setProperty('--sidebar-tooltip-top', `${rect.top + rect.height / 2}px`);
            tooltipRef.current.style.setProperty('--sidebar-tooltip-left', `${rect.right - 8}px`);
        }

        setTooltip((prev) => {
            if (prev.label === label && prev.variant === variant && prev.visible) return prev;
            return { label, variant, visible: true };
        });
    }, [isExpanded]);

    const hideTooltip = useCallback(() => {
        setTooltip(prev => (prev.visible ? { ...prev, visible: false } : prev));
    }, []);

    if (!profile) return null;

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
                                onClick={collapse}
                                onPointerEnter={(e) => showTooltip(e, item.label, isActive ? 'active' : 'default')}
                                onPointerLeave={hideTooltip}
                            >
                                <div className="relative nav-icon">
                                    <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                                    {item.badge && item.badge > 0 && (
                                        <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full ring-2 ring-white inline-flex items-center justify-center">
                                            {item.badge > 99 ? '99+' : item.badge}
                                        </span>
                                    )}
                                </div>
                                <span className="nav-label">{item.label}</span>
                            </Link>
                        );
                    })}

                    {settingsItems.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-surface-200">
                            {settingsItems.map((item) => {
                                const isActive = item.href === '/settings'
                                    ? pathname === '/settings'
                                    : pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn('nav-item', isActive && 'active')}
                                        onClick={collapse}
                                        onPointerEnter={(e) => showTooltip(e, item.label, isActive ? 'active' : 'default')}
                                        onPointerLeave={hideTooltip}
                                    >
                                        <div className="nav-icon">
                                            <item.icon size={18} strokeWidth={1.8} />
                                        </div>
                                        <span className="nav-label">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </nav>

                {/* User Profile */}
                <div className="px-2 py-3 border-t border-surface-200">
                    <div
                        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg"
                        onPointerEnter={(e) => showTooltip(e, profile.full_name)}
                        onPointerLeave={hideTooltip}
                    >
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-semibold flex-shrink-0">
                            {getInitials(profile.full_name)}
                        </div>
                        {isExpanded && (
                            <>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="text-sm font-semibold text-text-primary truncate">{formatShortName(profile.full_name)}</div>
                                    <div className="text-[11px] text-text-muted capitalize">{USER_ROLE_LABELS[profile.role]}</div>
                                </div>
                                <button
                                    onClick={signOut}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 transition-colors flex-shrink-0"
                                    aria-label="Вийти"
                                    title="Вийти"
                                >
                                    <LogOut size={16} className="text-text-muted" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* Portal tooltip — renders outside sidebar overflow */}
            {!isExpanded && <SidebarTooltip {...tooltip} tooltipRef={tooltipRef} />}
        </>
    );
}
