import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { mapDbProfile } from '@/lib/mappers';
import { QueryProvider } from '@/lib/query-provider';
import { AuthProvider } from '@/lib/auth-context';
import Sidebar from '@/components/layout/sidebar';
import { isSaasSubscriptionEnforced } from '@/lib/server/saas/gating';
import { isActiveSaasSubscriptionStatus } from '@/lib/server/saas/subscription';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profileRow) {
    redirect('/auth/provisioning');
  }

  if (!isSaasSubscriptionEnforced()) {
    const profile = mapDbProfile(profileRow);

    return (
      <QueryProvider>
        <AuthProvider initialProfile={profile}>
          <div className="flex min-h-screen bg-surface-50">
            <Sidebar />
            <main
              className="flex-1 min-w-0"
              style={{ marginLeft: 'var(--sidebar-collapsed-width)' }}
            >
              {children}
            </main>
          </div>
        </AuthProvider>
      </QueryProvider>
    );
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from('saas_subscriptions')
    .select('status')
    .eq('tenant_id', profileRow.tenant_id)
    .maybeSingle();

  const missingSaasTable =
    subscriptionError?.code === 'PGRST205' ||
    Boolean(subscriptionError?.message?.includes('Could not find the table'));

  if (subscriptionError && !missingSaasTable) {
    throw new Error(subscriptionError.message);
  }

  if (subscriptionRow && !isActiveSaasSubscriptionStatus(subscriptionRow.status)) {
    redirect(`/auth/subscription-required?status=${encodeURIComponent(subscriptionRow.status ?? '')}`);
  }

  const profile = mapDbProfile(profileRow);

  return (
    <QueryProvider>
      <AuthProvider initialProfile={profile}>
        <div className="flex min-h-screen bg-surface-50">
          <Sidebar />
          <main
            className="flex-1 min-w-0"
            style={{ marginLeft: 'var(--sidebar-collapsed-width)' }}
          >
            {children}
          </main>
        </div>
      </AuthProvider>
    </QueryProvider>
  );
}
