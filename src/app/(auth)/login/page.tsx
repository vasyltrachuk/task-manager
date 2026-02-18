'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/server/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface-0 rounded-2xl shadow-card border border-surface-200 p-8">
        <h1 className="text-xl font-bold text-text-primary mb-1">
          Task&Control
        </h1>
        <p className="text-sm text-text-muted mb-6">
          Увійдіть до вашого акаунту
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="admin@yourfirm.com"
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
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white
                       rounded-lg text-sm font-medium transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Вхід...' : 'Увійти'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/auth/bootstrap" className="text-sm text-brand-600 hover:text-brand-700">
            Перший запуск? Створити tenant
          </Link>
        </div>
      </div>
    </div>
  );
}
