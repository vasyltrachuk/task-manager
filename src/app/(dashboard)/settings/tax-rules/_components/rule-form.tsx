'use client';

import { useMemo, useState } from 'react';
import { X, Check, AlertTriangle, Trash2 } from 'lucide-react';
import {
  CLIENT_TYPE_LABELS,
  RECURRENCE_LABELS,
  TASK_TYPE_LABELS,
  TAX_SYSTEM_LABELS,
  type ClientType,
  type TaskPriority,
  type TaskType,
  type TaxSystem,
} from '@/lib/types';
import {
  RULEBOOK_DUE_RULE_LABELS,
  type RulebookDueRulePreset,
  type RulebookRuleFormInput,
} from '@/lib/rulebook-ui';

interface RuleFormProps {
  initialData?: RulebookRuleFormInput;
  onClose: () => void;
  onSave: (data: RulebookRuleFormInput) => void;
  onHardDelete?: (rule: RulebookRuleFormInput) => void;
}

const CLIENT_TYPE_OPTIONS: ClientType[] = ['FOP', 'LLC', 'NGO', 'OSBB', 'GRANT'];
const TAX_SYSTEM_OPTIONS: TaxSystem[] = [
  'single_tax_group1',
  'single_tax_group2',
  'single_tax_group3',
  'single_tax_group3_vat',
  'single_tax_group4',
  'general_no_vat',
  'general_vat',
  'non_profit',
];

const TASK_TYPE_OPTIONS: TaskType[] = [
  'tax_report',
  'payroll',
  'payment',
  'reconciliation',
  'other',
];

const DUE_RULE_OPTIONS = Object.keys(RULEBOOK_DUE_RULE_LABELS) as RulebookDueRulePreset[];

export default function RuleForm({
  initialData,
  onClose,
  onSave,
  onHardDelete,
}: RuleFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [taskType, setTaskType] = useState<TaskType>(initialData?.task_type ?? 'tax_report');
  const [priority, setPriority] = useState<TaskPriority>(initialData?.priority ?? 2);
  const [targetForms, setTargetForms] = useState<ClientType[]>(initialData?.target_legal_forms ?? []);
  const [targetSystems, setTargetSystems] = useState<TaxSystem[]>(
    initialData?.target_tax_systems ?? []
  );
  const [requireVat, setRequireVat] = useState<boolean | null>(initialData?.require_vat ?? null);
  const [requireEmployees, setRequireEmployees] = useState<boolean | null>(
    initialData?.require_employees ?? null
  );
  const [recurrence, setRecurrence] = useState<RulebookRuleFormInput['recurrence']>(
    initialData?.recurrence ?? 'monthly'
  );
  const [dueDateRule, setDueDateRule] = useState<RulebookDueRulePreset>(
    initialData?.due_date_rule ?? '20th_of_next_month'
  );
  const [legalBasisText, setLegalBasisText] = useState(initialData?.legal_basis_text ?? '');
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order ?? 100);
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  const handleToggleForm = (value: ClientType) => {
    setTargetForms((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handleToggleTaxSystem = (value: TaxSystem) => {
    setTargetSystems((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!canSave) return;

    onSave({
      id: initialData?.id,
      code: initialData?.code,
      title: title.trim(),
      description: description.trim() || undefined,
      task_type: taskType,
      priority,
      target_legal_forms: targetForms.length > 0 ? targetForms : null,
      target_tax_systems: targetSystems.length > 0 ? targetSystems : null,
      require_vat: requireVat,
      require_employees: requireEmployees,
      recurrence,
      due_date_rule: dueDateRule,
      due_rule_custom: dueDateRule === 'custom' ? initialData?.due_rule_custom ?? null : undefined,
      legal_basis_text: legalBasisText,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-text-primary">
            {initialData ? 'Редагувати правило' : 'Нове правило'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:bg-surface-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Основна інформація
            </h3>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Назва правила</label>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Напр. Подати декларацію ПДВ"
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Опис</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Тип задачі</label>
                <select
                  value={taskType}
                  onChange={(event) => setTaskType(event.target.value as TaskType)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {TASK_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {TASK_TYPE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Пріоритет</label>
                <select
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value) as TaskPriority)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value={1}>Високий</option>
                  <option value={2}>Середній</option>
                  <option value={3}>Низький</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Сортування</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(Number(event.target.value) || 100)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rule-active"
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="rule-active" className="text-sm text-text-primary">
                Правило активне
              </label>
            </div>
          </div>

          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Умови застосування
            </h3>
            <p className="text-xs text-text-muted italic -mt-3">
              Якщо нічого не вибрано, правило застосовується до всіх клієнтів
            </p>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-2">Організаційна форма</label>
              <div className="flex flex-wrap gap-2">
                {CLIENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleToggleForm(option)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      targetForms.includes(option)
                        ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-white border-surface-200 text-text-muted hover:border-surface-300'
                    }`}
                  >
                    {CLIENT_TYPE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-2">Податкова система</label>
              <div className="flex flex-wrap gap-2">
                {TAX_SYSTEM_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleToggleTaxSystem(option)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      targetSystems.includes(option)
                        ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-white border-surface-200 text-text-muted hover:border-surface-300'
                    }`}
                  >
                    {TAX_SYSTEM_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-2">Платник ПДВ</label>
                <select
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm text-text-primary bg-surface-50"
                  value={requireVat === null ? 'any' : requireVat ? 'yes' : 'no'}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRequireVat(value === 'any' ? null : value === 'yes');
                  }}
                >
                  <option value="any">Не важливо</option>
                  <option value="yes">Тільки платники ПДВ</option>
                  <option value="no">Тільки без ПДВ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-2">Наймані працівники</label>
                <select
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm text-text-primary bg-surface-50"
                  value={requireEmployees === null ? 'any' : requireEmployees ? 'yes' : 'no'}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRequireEmployees(value === 'any' ? null : value === 'yes');
                  }}
                >
                  <option value="any">Не важливо</option>
                  <option value="yes">Є працівники</option>
                  <option value="no">Немає працівників</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-surface-200">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Розклад і дедлайни</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Періодичність</label>
                <select
                  value={recurrence}
                  onChange={(event) =>
                    setRecurrence(event.target.value as RulebookRuleFormInput['recurrence'])
                  }
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value="monthly">{RECURRENCE_LABELS.monthly}</option>
                  <option value="semi_monthly">{RECURRENCE_LABELS.semi_monthly}</option>
                  <option value="quarterly">{RECURRENCE_LABELS.quarterly}</option>
                  <option value="yearly">{RECURRENCE_LABELS.yearly}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Правило дедлайну</label>
                <select
                  value={dueDateRule}
                  onChange={(event) => setDueDateRule(event.target.value as RulebookDueRulePreset)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {DUE_RULE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {RULEBOOK_DUE_RULE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-surface-200">
            <label className="block text-xs font-semibold text-text-muted mb-1.5">Нормативна підстава</label>
            <textarea
              value={legalBasisText}
              onChange={(event) => setLegalBasisText(event.target.value)}
              rows={3}
              placeholder="Кожен рядок або ; як окрема норма. Напр: ПКУ ст. 203.1"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          {initialData?.id && onHardDelete && (
            <div className="space-y-3 pt-4 border-t border-surface-200">
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Небезпечна дія</p>
                  <p className="text-xs text-red-700/90">
                    Використовуйте лише якщо правило створене помилково. Зазвичай достатньо вимкнути правило.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onHardDelete(initialData)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 text-sm font-semibold transition-colors"
              >
                <Trash2 size={14} />
                Видалити назавжди
              </button>
            </div>
          )}

          <div className="pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-surface-200 hover:bg-surface-50 text-text-primary rounded-lg text-sm font-semibold transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <Check size={16} />
              Зберегти правило
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
