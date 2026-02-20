'use client';

import { useState } from 'react';
import {
  Plus,
  Database,
  Pencil,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { canManageSettings } from '@/lib/rbac';
import AccessDeniedCard from '@/components/ui/access-denied-card';
import RuleForm from './_components/rule-form';
import { TASK_TYPE_LABELS, RECURRENCE_LABELS } from '@/lib/types';
import {
  RULEBOOK_DUE_RULE_LABELS,
  type RulebookRuleFormInput,
} from '@/lib/rulebook-ui';
import {
  useDeleteRulebookRule,
  useInitRulebook,
  useRulebookRules,
  useSetRulebookRuleActive,
  useUpsertRulebookRule,
} from '@/lib/hooks/use-rulebook';

export default function TaxRulesPage() {
  const { profile } = useAuth();
  const { data, isLoading, error } = useRulebookRules();
  const initMutation = useInitRulebook();
  const upsertMutation = useUpsertRulebookRule();
  const toggleMutation = useSetRulebookRuleActive();
  const deleteMutation = useDeleteRulebookRule();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RulebookRuleFormInput | undefined>();

  if (!profile) return null;

  if (!canManageSettings(profile)) {
    return (
      <AccessDeniedCard message="Керування податковими правилами доступне лише адміністратору." />
    );
  }

  const activeVersion = data?.activeVersion ?? null;
  const rules = data?.rules ?? [];
  const isMutating =
    initMutation.isPending ||
    upsertMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending;

  const handleInit = (replaceRules: boolean) => {
    initMutation.mutate({
      replaceRules,
      activateVersion: true,
    });
  };

  const handleSave = (input: RulebookRuleFormInput) => {
    upsertMutation.mutate(input, {
      onSuccess: () => {
        setIsFormOpen(false);
        setEditingRule(undefined);
      },
    });
  };

  const handleToggle = (rule: RulebookRuleFormInput) => {
    if (!rule.id) return;
    toggleMutation.mutate({
      id: rule.id,
      isActive: !rule.is_active,
    });
  };

  const handleHardDelete = (rule: RulebookRuleFormInput) => {
    if (!rule.id) return;
    if (!confirm(`Видалити правило "${rule.title}" назавжди? Цю дію неможливо скасувати.`)) return;

    const confirmPhrase = prompt('Для підтвердження введіть DELETE');
    if (confirmPhrase !== 'DELETE') return;

    deleteMutation.mutate({
      id: rule.id,
      hardDelete: true,
    }, {
      onSuccess: () => {
        setIsFormOpen(false);
        setEditingRule(undefined);
      },
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Database className="text-brand-600" size={24} />
            Rulebook податкових правил
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Активна версія: {activeVersion ? `${activeVersion.name} (${activeVersion.code})` : 'відсутня'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleInit(false)}
            disabled={isMutating}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-surface-300 hover:bg-surface-50 text-text-primary text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
          >
            {initMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Init (merge)
          </button>

          <button
            onClick={() => {
              setEditingRule(undefined);
              setIsFormOpen(true);
            }}
            disabled={!activeVersion || isMutating}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
          >
            <Plus size={16} />
            Створити правило
          </button>
        </div>
      </div>

      {!activeVersion && (
        <div className="card p-4 border border-amber-200 bg-amber-50/40">
          <p className="text-sm text-amber-900">
            Активної версії rulebook ще немає. Спочатку виконайте init.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => handleInit(false)}
              disabled={isMutating}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {initMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Ініціалізувати rulebook
            </button>

            <button
              onClick={() => handleInit(true)}
              disabled={isMutating}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 hover:bg-amber-100 text-amber-900 text-sm font-semibold disabled:opacity-60"
            >
              Init з повною заміною правил
            </button>
          </div>
        </div>
      )}

      {(error || initMutation.error || upsertMutation.error || toggleMutation.error || deleteMutation.error) && (
        <div className="card p-4 border border-red-200 bg-red-50 text-sm text-red-700">
          {String(
            error ??
              initMutation.error ??
              upsertMutation.error ??
              toggleMutation.error ??
              deleteMutation.error
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-50 border-b border-surface-200 text-text-muted font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Назва правила</th>
                <th className="px-6 py-4">Тип / Періодичність</th>
                <th className="px-6 py-4">Умови застосування</th>
                <th className="px-6 py-4">Статус</th>
                <th className="px-6 py-4 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-text-muted">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> Завантаження правил...
                    </span>
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-text-muted">
                    Немає правил в активній версії.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id ?? rule.code} className="hover:bg-surface-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-text-primary">{rule.title}</p>
                      {rule.description && <p className="text-xs text-text-muted mt-1">{rule.description}</p>}
                      <p className="text-[11px] text-text-muted mt-1">code: {rule.code}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-1 bg-surface-100 text-text-primary rounded text-xs font-medium mb-1">
                        {TASK_TYPE_LABELS[rule.task_type] || rule.task_type}
                      </span>
                      <div className="text-xs text-text-muted">
                        {RECURRENCE_LABELS[rule.recurrence] || rule.recurrence}
                      </div>
                      <div className="text-xs text-text-muted">
                        {RULEBOOK_DUE_RULE_LABELS[rule.due_date_rule] || rule.due_date_rule}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(rule.target_legal_forms ?? []).map((form) => (
                          <span
                            key={form}
                            className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-semibold"
                          >
                            {form}
                          </span>
                        ))}
                        {rule.require_vat !== null && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              rule.require_vat
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {rule.require_vat ? 'З ПДВ' : 'Без ПДВ'}
                          </span>
                        )}
                        {rule.require_employees !== null && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              rule.require_employees
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {rule.require_employees ? 'Є наймані' : 'Без найманих'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {rule.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                          <CheckCircle2 size={14} /> Активне
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-text-muted text-xs font-medium">
                          <XCircle size={14} /> Вимкнено
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingRule(rule);
                            setIsFormOpen(true);
                          }}
                          disabled={isMutating}
                          className="p-2 text-text-muted hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-60"
                          title="Редагувати"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleToggle(rule)}
                          disabled={isMutating}
                          className="p-2 text-text-muted hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-60"
                          title={rule.is_active ? 'Вимкнути правило' : 'Увімкнути правило'}
                        >
                          {rule.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <RuleForm
          initialData={editingRule}
          onHardDelete={handleHardDelete}
          onClose={() => {
            setIsFormOpen(false);
            setEditingRule(undefined);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
