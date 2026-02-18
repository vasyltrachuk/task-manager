import Link from 'next/link';

export default function ProvisioningPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8 space-y-4">
        <h1 className="text-xl font-bold text-text-primary">Акаунт готується</h1>
        <p className="text-sm text-text-muted">
          Ми отримали авторизацію, але профіль ще не прив&apos;язаний до компанії.
          Якщо ви щойно оплатили підписку, зачекайте 10-30 секунд і спробуйте ще раз.
        </p>
        <p className="text-sm text-text-muted">
          Якщо статус не змінюється, перевірте оплату або зверніться в підтримку.
        </p>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            Оновити вхід
          </Link>
          <Link
            href="/auth/bootstrap"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-surface-300 text-text-primary text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Bootstrap
          </Link>
        </div>
      </div>
    </div>
  );
}
