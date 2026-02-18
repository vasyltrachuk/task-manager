import Link from 'next/link';

function statusLabel(status: string | null): string {
  switch (status) {
    case 'trialing':
      return 'Пробний період';
    case 'active':
      return 'Активна';
    case 'grace':
      return 'Пільговий період';
    case 'past_due':
      return 'Прострочена оплата';
    case 'canceled':
      return 'Скасована';
    case 'incomplete':
      return 'Очікує завершення';
    case 'incomplete_expired':
      return 'Протерміновано';
    case 'unpaid':
      return 'Неоплачена';
    default:
      return 'Неактивна';
  }
}

interface SubscriptionRequiredPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SubscriptionRequiredPage({
  searchParams,
}: SubscriptionRequiredPageProps) {
  const params = await searchParams;
  const rawStatus = params.status;
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8 space-y-4">
        <h1 className="text-xl font-bold text-text-primary">Потрібна активна підписка</h1>
        <p className="text-sm text-text-muted">
          Для доступу до робочої області підписка компанії має бути активною.
        </p>
        <div className="text-sm text-text-secondary bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
          Поточний статус: <span className="font-semibold text-text-primary">{statusLabel(status)}</span>
        </div>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            Повернутись до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
