'use client';

import Sidebar from '@/components/layout/sidebar';
import { AppProvider } from '@/lib/store';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AppProvider>
            <div className="flex min-h-screen bg-surface-50">
                <Sidebar />
                <main className="flex-1 min-w-0" style={{ marginLeft: 'var(--sidebar-width)' }}>
                    {children}
                </main>
            </div>
        </AppProvider>
    );
}
