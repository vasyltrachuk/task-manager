'use client';

import { useMemo, useState } from 'react';
import { Bell, Shield, Database, Palette, SlidersHorizontal, Save } from 'lucide-react';
import { useApp } from '@/lib/store';
import { TaxRulebookConfig } from '@/lib/types';
import { calculateIncomeLimitByTaxSystem } from '@/lib/tax';
import { cn, formatMoneyUAH } from '@/lib/utils';
import { canManageSettings } from '@/lib/rbac';

function isRulebookValid(rulebook: TaxRulebookConfig): boolean {
    return (
        rulebook.year >= 2020 &&
        rulebook.minimum_wage_on_january_1 > 0 &&
        rulebook.single_tax_multipliers.single_tax_group1 > 0 &&
        rulebook.single_tax_multipliers.single_tax_group2 > 0 &&
        rulebook.single_tax_multipliers.single_tax_group3 > 0 &&
        rulebook.single_tax_multipliers.single_tax_group4 > 0 &&
        rulebook.vat_registration_threshold > 0
    );
}

export default function SettingsPage() {
    const { state, updateTaxRulebook } = useApp();
    const canManage = canManageSettings(state.currentUser);
    const [form, setForm] = useState<TaxRulebookConfig>(state.taxRulebook);

    const calculatedLimits = useMemo(() => {
        return {
            group1: calculateIncomeLimitByTaxSystem('single_tax_group1', form),
            group2: calculateIncomeLimitByTaxSystem('single_tax_group2', form),
            group3: calculateIncomeLimitByTaxSystem('single_tax_group3', form),
            group4: calculateIncomeLimitByTaxSystem('single_tax_group4', form),
        };
    }, [form]);

    const isDirty = JSON.stringify(form) !== JSON.stringify(state.taxRulebook);
    const isValid = isRulebookValid(form);
    const autoClientsCount = state.clients.filter((client) => client.tax_system?.startsWith('single_tax_group')).length;

    const handleSave = () => {
        const normalized: TaxRulebookConfig = {
            year: Math.max(2020, Math.round(form.year)),
            minimum_wage_on_january_1: Math.max(0, Math.round(form.minimum_wage_on_january_1)),
            single_tax_multipliers: {
                single_tax_group1: Math.max(0, Math.round(form.single_tax_multipliers.single_tax_group1)),
                single_tax_group2: Math.max(0, Math.round(form.single_tax_multipliers.single_tax_group2)),
                single_tax_group3: Math.max(0, Math.round(form.single_tax_multipliers.single_tax_group3)),
                single_tax_group4: Math.max(0, Math.round(form.single_tax_multipliers.single_tax_group4)),
            },
            vat_registration_threshold: Math.max(0, Math.round(form.vat_registration_threshold)),
        };

        if (!isRulebookValid(normalized)) return;

        updateTaxRulebook(normalized);
        setForm(normalized);
    };

    if (!canManage) {
        return (
            <div className="p-8">
                <div className="card p-6 max-w-xl">
                    <h1 className="text-xl font-bold text-text-primary mb-2">Немає доступу</h1>
                    <p className="text-sm text-text-muted">Налаштування доступні лише адміністратору.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">Налаштування</h1>
                <p className="text-sm text-text-muted">Керуйте параметрами системи та податковими правилами для автоконтролю.</p>
            </div>

            <div className="card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                    <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <SlidersHorizontal size={16} className="text-brand-600" />
                            Податкові правила
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            Після збереження авто-ліміти оновляться для {autoClientsCount} клієнтів.
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || !isValid}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                            isDirty && isValid
                                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                                : 'bg-surface-100 text-text-muted cursor-not-allowed'
                        )}
                    >
                        <Save size={14} />
                        Зберегти правила
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Рік дії</label>
                        <input
                            type="number"
                            min="2020"
                            value={form.year}
                            onChange={(e) => setForm((prev) => ({ ...prev, year: Number(e.target.value) || 0 }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            МЗП на 1 січня
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={form.minimum_wage_on_january_1}
                            onChange={(e) => setForm((prev) => ({ ...prev, minimum_wage_on_january_1: Number(e.target.value) || 0 }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            ПДВ поріг (12 міс)
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={form.vat_registration_threshold}
                            onChange={(e) => setForm((prev) => ({ ...prev, vat_registration_threshold: Number(e.target.value) || 0 }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Коеф. ЄП 1</label>
                        <input
                            type="number"
                            min="0"
                            value={form.single_tax_multipliers.single_tax_group1}
                            onChange={(e) => setForm((prev) => ({
                                ...prev,
                                single_tax_multipliers: {
                                    ...prev.single_tax_multipliers,
                                    single_tax_group1: Number(e.target.value) || 0,
                                },
                            }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Коеф. ЄП 2</label>
                        <input
                            type="number"
                            min="0"
                            value={form.single_tax_multipliers.single_tax_group2}
                            onChange={(e) => setForm((prev) => ({
                                ...prev,
                                single_tax_multipliers: {
                                    ...prev.single_tax_multipliers,
                                    single_tax_group2: Number(e.target.value) || 0,
                                },
                            }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Коеф. ЄП 3</label>
                        <input
                            type="number"
                            min="0"
                            value={form.single_tax_multipliers.single_tax_group3}
                            onChange={(e) => setForm((prev) => ({
                                ...prev,
                                single_tax_multipliers: {
                                    ...prev.single_tax_multipliers,
                                    single_tax_group3: Number(e.target.value) || 0,
                                },
                            }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Коеф. ЄП 4</label>
                        <input
                            type="number"
                            min="0"
                            value={form.single_tax_multipliers.single_tax_group4}
                            onChange={(e) => setForm((prev) => ({
                                ...prev,
                                single_tax_multipliers: {
                                    ...prev.single_tax_multipliers,
                                    single_tax_group4: Number(e.target.value) || 0,
                                },
                            }))}
                            className="w-full px-3 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                    </div>
                </div>

                <div className="mt-5 rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                        Автоматично обчислені ліміти ({form.year})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                        <div className="bg-white border border-surface-200 rounded-lg px-3 py-2">
                            <p className="text-text-muted">ЄП 1 група</p>
                            <p className="font-semibold text-text-primary">{formatMoneyUAH(calculatedLimits.group1)}</p>
                        </div>
                        <div className="bg-white border border-surface-200 rounded-lg px-3 py-2">
                            <p className="text-text-muted">ЄП 2 група</p>
                            <p className="font-semibold text-text-primary">{formatMoneyUAH(calculatedLimits.group2)}</p>
                        </div>
                        <div className="bg-white border border-surface-200 rounded-lg px-3 py-2">
                            <p className="text-text-muted">ЄП 3 група</p>
                            <p className="font-semibold text-text-primary">{formatMoneyUAH(calculatedLimits.group3)}</p>
                        </div>
                        <div className="bg-white border border-surface-200 rounded-lg px-3 py-2">
                            <p className="text-text-muted">ЄП 4 група</p>
                            <p className="font-semibold text-text-primary">{formatMoneyUAH(calculatedLimits.group4)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {[
                    { icon: Shield, title: 'Ролі та доступи', desc: 'Налаштування ролей та прав користувачів' },
                    { icon: Bell, title: 'Сповіщення', desc: 'Ел. пошта, Telegram та вбудовані нотифікації' },
                    { icon: Database, title: 'Шаблони завдань', desc: 'Регулярні задачі для режимів ФОП/ТОВ/ГО/грантів' },
                    { icon: Palette, title: 'Інтерфейс', desc: 'Тема, мова та персоналізація' },
                ].map((item) => (
                    <div key={item.title} className="card p-5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                            <item.icon size={20} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                            <p className="text-xs text-text-muted">{item.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
