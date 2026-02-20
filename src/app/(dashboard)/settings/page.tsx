'use client';

import Link from 'next/link';
import { Bell, Database, Palette, Plug, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { canAccessIntegrations, canManageSettings } from '@/lib/rbac';
import AccessDeniedCard from '@/components/ui/access-denied-card';

export default function SettingsPage() {
  const { profile } = useAuth();

  if (!profile) return null;

  const canManage = canManageSettings(profile);
  const canOpenIntegrations = canAccessIntegrations(profile);

  if (!canManage) {
    const integrationsAction = canOpenIntegrations ? (
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
      >
        Відкрити інтеграції
      </Link>
    ) : undefined;

    return (
      <AccessDeniedCard
        message="Налаштування доступні лише адміністратору."
        action={integrationsAction}
      />
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">Налаштування</h1>
        <p className="text-sm text-text-muted">
          Керуйте системними розділами та податковим rulebook.
        </p>
      </div>

      <Link
        href="/settings/tax-rules"
        className="card p-5 flex items-center gap-4 hover:border-brand-300 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Database size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">Rulebook податкових правил</h3>
          <p className="text-xs text-text-muted">
            Версії правил, умови застосування, дедлайни та генерація задач.
          </p>
        </div>
      </Link>

      <Link
        href="/settings/integrations"
        className="card p-5 flex items-center gap-4 hover:border-brand-300 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Plug size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">Інтеграції</h3>
          <p className="text-xs text-text-muted">
            ДПС, Telegram та інші зовнішні сервіси.
          </p>
        </div>
      </Link>

      <div className="space-y-4">
        {[
          { icon: Shield, title: 'Ролі та доступи', desc: 'Налаштування ролей та прав користувачів', href: '#' },
          { icon: Bell, title: 'Сповіщення', desc: 'Ел. пошта, Telegram та вбудовані нотифікації', href: '#' },
          { icon: Palette, title: 'Інтерфейс', desc: 'Тема, мова та персоналізація', href: '#' },
        ].map((item) => (
          <Link
            href={item.href}
            key={item.title}
            className="card p-5 flex items-center gap-4 hover:border-brand-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
              <item.icon size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
              <p className="text-xs text-text-muted">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
