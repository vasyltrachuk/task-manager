'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/server/supabase-browser';

type BootstrapStatus = 'loading' | 'ready' | 'initialized' | 'error';

export default function BootstrapPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BootstrapStatus>('loading');
  const [requiresSecret, setRequiresSecret] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const response = await fetch('/auth/bootstrap/api', { method: 'GET', cache: 'no-store' });
        const payload = (await response.json()) as {
          initialized?: boolean;
          requiresSecret?: boolean;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Не вдалося перевірити стан ініціалізації.');
        }

        if (!cancelled) {
          setRequiresSecret(Boolean(payload.requiresSecret));
          setStatus(payload.initialized ? 'initialized' : 'ready');
        }
      } catch (nextError) {
        if (!cancelled) {
          setStatus('error');
          setError(nextError instanceof Error ? nextError.message : 'Неочікувана помилка.');
        }
      }
    }

    void checkStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/auth/bootstrap/api', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenantName,
          fullName,
          email,
          password,
          bootstrapSecret,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Не вдалося створити перший tenant.');
      }

      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(
          `Акаунт створено, але автологін не вдався: ${signInError.message}. Спробуйте увійти вручну.`
        );
      }

      router.refresh();
      router.push('/');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Неочікувана помилка.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8">
          <p className="text-sm text-text-muted">Перевірка стану ініціалізації...</p>
        </div>
      </div>
    );
  }

  if (status === 'initialized') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8 space-y-4">
          <h1 className="text-xl font-bold text-text-primary">Система вже налаштована</h1>
          <p className="text-sm text-text-muted">
            Перший tenant вже створено. Використайте сторінку входу.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            Перейти до входу
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8 space-y-4">
          <h1 className="text-xl font-bold text-text-primary">Помилка ініціалізації</h1>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            Перейти до входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8">
        <h1 className="text-xl font-bold text-text-primary mb-1">Перший запуск</h1>
        <p className="text-sm text-text-muted mb-6">
          Створіть першу компанію та адміністратора.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Назва компанії
            </label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="My Accounting Firm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Ім&apos;я адміністратора
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Імʼя Прізвище"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="owner@firm.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {requiresSecret && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Bootstrap ключ
              </label>
              <input
                type="password"
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Створення...' : 'Створити tenant'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-brand-600 hover:text-brand-700">
            Назад до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
