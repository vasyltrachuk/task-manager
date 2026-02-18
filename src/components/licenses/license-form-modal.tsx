'use client';

import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import {
    License,
    LicenseType,
    LicenseStatus,
    LicensePaymentFrequency,
    LicenseCheckResult,
    LICENSE_TYPE_LABELS,
    LICENSE_STATUS_LABELS,
    LICENSE_PAYMENT_FREQUENCY_LABELS,
    LICENSE_CHECK_RESULT_LABELS,
} from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { canManageLicenses } from '@/lib/rbac';
import { useClients } from '@/lib/hooks/use-clients';
import { useProfiles } from '@/lib/hooks/use-profiles';
import { useCreateLicense, useUpdateLicense } from '@/lib/hooks/use-licenses';

interface LicenseFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editLicense?: License | null;
    defaultClientId?: string;
    defaultResponsibleId?: string;
}

interface LicenseFormData {
    client_id: string;
    responsible_id: string;
    type: LicenseType;
    number: string;
    issuing_authority: string;
    place_of_activity: string;
    status: LicenseStatus;
    issued_at: string;
    valid_from: string;
    valid_to: string;
    is_unlimited: boolean;
    payment_frequency: LicensePaymentFrequency;
    next_payment_due: string;
    next_check_due: string;
    last_checked_at: string;
    last_check_result: LicenseCheckResult;
    notes: string;
}

const dateValue = (value?: string) => {
    if (!value) return '';
    return value.slice(0, 10);
};

const toIsoDate = (value?: string) => {
    if (!value) return undefined;
    return new Date(`${value}T10:00:00`).toISOString();
};

function getInitialFormData(
    editLicense?: License | null,
    defaultClientId?: string,
    defaultResponsibleId?: string
): LicenseFormData {
    if (editLicense) {
        return {
            client_id: editLicense.client_id,
            responsible_id: editLicense.responsible_id,
            type: editLicense.type,
            number: editLicense.number,
            issuing_authority: editLicense.issuing_authority,
            place_of_activity: editLicense.place_of_activity || '',
            status: editLicense.status,
            issued_at: dateValue(editLicense.issued_at),
            valid_from: dateValue(editLicense.valid_from),
            valid_to: dateValue(editLicense.valid_to),
            is_unlimited: !editLicense.valid_to,
            payment_frequency: editLicense.payment_frequency,
            next_payment_due: dateValue(editLicense.next_payment_due),
            next_check_due: dateValue(editLicense.next_check_due),
            last_checked_at: dateValue(editLicense.last_checked_at),
            last_check_result: editLicense.last_check_result,
            notes: editLicense.notes || '',
        };
    }

    return {
        client_id: defaultClientId || '',
        responsible_id: defaultResponsibleId || '',
        type: 'alcohol_retail',
        number: '',
        issuing_authority: '',
        place_of_activity: '',
        status: 'active',
        issued_at: '',
        valid_from: '',
        valid_to: '',
        is_unlimited: false,
        payment_frequency: 'quarterly',
        next_payment_due: '',
        next_check_due: '',
        last_checked_at: '',
        last_check_result: 'not_checked',
        notes: '',
    };
}

export default function LicenseFormModal({
    isOpen,
    onClose,
    editLicense,
    defaultClientId,
    defaultResponsibleId,
}: LicenseFormModalProps) {
    const { profile } = useAuth();
    const { data: clientsData } = useClients();
    const { data: profilesData } = useProfiles();
    const createLicenseMutation = useCreateLicense();
    const updateLicenseMutation = useUpdateLicense();

    const canManage = profile ? canManageLicenses(profile) : false;

    const activeClients = (clientsData ?? []).filter(c => c.status !== 'archived');
    const responsibleCandidates = (profilesData ?? []).filter(p => p.role === 'accountant' && p.is_active);

    const [formData, setFormData] = useState<LicenseFormData>(() =>
        getInitialFormData(editLicense, defaultClientId, defaultResponsibleId)
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const e: Record<string, string> = {};

        if (!formData.client_id) e.client_id = 'Оберіть клієнта';
        if (!formData.responsible_id) e.responsible_id = 'Оберіть відповідального бухгалтера';
        if (!formData.number.trim()) e.number = "Обов'язкове поле";
        if (!formData.issuing_authority.trim()) e.issuing_authority = "Обов'язкове поле";
        if (!formData.issued_at) e.issued_at = 'Вкажіть дату видачі';
        if (!formData.valid_from) e.valid_from = 'Вкажіть дату початку дії';

        if (!formData.is_unlimited) {
            if (!formData.valid_to) {
                e.valid_to = 'Вкажіть строк дії або оберіть безстрокову ліцензію';
            } else if (new Date(formData.valid_to) < new Date(formData.valid_from)) {
                e.valid_to = 'Дата завершення не може бути раніше початку дії';
            }
        }

        if (formData.payment_frequency !== 'none' && !formData.next_payment_due) {
            e.next_payment_due = 'Вкажіть наступний платіж';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = () => {
        if (!validate()) return;

        const licenseData = {
            client_id: formData.client_id,
            responsible_id: formData.responsible_id,
            type: formData.type,
            number: formData.number.trim(),
            issuing_authority: formData.issuing_authority.trim(),
            place_of_activity: formData.place_of_activity.trim() || undefined,
            status: formData.status,
            issued_at: toIsoDate(formData.issued_at)!,
            valid_from: toIsoDate(formData.valid_from)!,
            valid_to: formData.is_unlimited ? undefined : toIsoDate(formData.valid_to),
            payment_frequency: formData.payment_frequency,
            next_payment_due: toIsoDate(formData.next_payment_due),
            next_check_due: toIsoDate(formData.next_check_due),
            last_checked_at: toIsoDate(formData.last_checked_at),
            last_check_result: formData.last_check_result,
            notes: formData.notes.trim() || undefined,
        };

        if (editLicense) {
            updateLicenseMutation.mutate({
                ...licenseData,
                id: editLicense.id,
            });
        } else {
            createLicenseMutation.mutate(licenseData);
        }

        onClose();
    };

    if (!isOpen) return null;
    if (!profile) return null;
    if (!canManage) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto mx-4 animate-in fade-in zoom-in-95">
                <div className="sticky top-0 bg-white z-10 px-8 pt-6 pb-4 border-b border-surface-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                <ShieldCheck size={20} className="text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-text-primary">
                                    {editLicense ? 'Редагувати ліцензію' : 'Нова ліцензія'}
                                </h2>
                                <p className="text-xs text-text-muted">
                                    Контроль строків, оплат і звірок по реєстрах
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Клієнт *
                            </label>
                            <select
                                value={formData.client_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                                className={cn(
                                    'w-full px-3 py-3 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.client_id ? 'border-red-400' : 'border-surface-200'
                                )}
                            >
                                <option value="">Оберіть клієнта</option>
                                {activeClients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Відповідальний бухгалтер *
                            </label>
                            <select
                                value={formData.responsible_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, responsible_id: e.target.value }))}
                                className={cn(
                                    'w-full px-3 py-3 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.responsible_id ? 'border-red-400' : 'border-surface-200'
                                )}
                            >
                                <option value="">Оберіть бухгалтера</option>
                                {responsibleCandidates.map(p => (
                                    <option key={p.id} value={p.id}>{p.full_name}</option>
                                ))}
                            </select>
                            {errors.responsible_id && <p className="text-xs text-red-500 mt-1">{errors.responsible_id}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Тип ліцензії
                            </label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as LicenseType }))}
                                className="w-full px-3 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            >
                                {Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Статус
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as LicenseStatus }))}
                                className="w-full px-3 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            >
                                {Object.entries(LICENSE_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Номер ліцензії *
                            </label>
                            <input
                                type="text"
                                value={formData.number}
                                onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                                placeholder="ALC-RT-23-1189"
                                className={cn(
                                    'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.number ? 'border-red-400' : 'border-surface-200'
                                )}
                            />
                            {errors.number && <p className="text-xs text-red-500 mt-1">{errors.number}</p>}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Орган видачі *
                            </label>
                            <input
                                type="text"
                                value={formData.issuing_authority}
                                onChange={(e) => setFormData(prev => ({ ...prev, issuing_authority: e.target.value }))}
                                placeholder="ГУ ДПС у м. Києві"
                                className={cn(
                                    'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.issuing_authority ? 'border-red-400' : 'border-surface-200'
                                )}
                            />
                            {errors.issuing_authority && <p className="text-xs text-red-500 mt-1">{errors.issuing_authority}</p>}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Місце провадження діяльності
                        </label>
                        <input
                            type="text"
                            value={formData.place_of_activity}
                            onChange={(e) => setFormData(prev => ({ ...prev, place_of_activity: e.target.value }))}
                            placeholder="м. Київ, вул. Прикладна, 10"
                            className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                        />
                    </div>

                    <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-4 space-y-4">
                        <h3 className="text-sm font-bold text-text-primary">Строк дії</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Дата видачі *
                                </label>
                                <input
                                    type="date"
                                    value={formData.issued_at}
                                    onChange={(e) => setFormData(prev => ({ ...prev, issued_at: e.target.value }))}
                                    className={cn(
                                        'w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.issued_at ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.issued_at && <p className="text-xs text-red-500 mt-1">{errors.issued_at}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Початок дії *
                                </label>
                                <input
                                    type="date"
                                    value={formData.valid_from}
                                    onChange={(e) => setFormData(prev => ({ ...prev, valid_from: e.target.value }))}
                                    className={cn(
                                        'w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.valid_from ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.valid_from && <p className="text-xs text-red-500 mt-1">{errors.valid_from}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Завершення дії
                                </label>
                                <input
                                    type="date"
                                    value={formData.valid_to}
                                    onChange={(e) => setFormData(prev => ({ ...prev, valid_to: e.target.value }))}
                                    disabled={formData.is_unlimited}
                                    className={cn(
                                        'w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all disabled:bg-surface-100 disabled:text-text-muted',
                                        errors.valid_to ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.valid_to && <p className="text-xs text-red-500 mt-1">{errors.valid_to}</p>}
                            </div>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <div
                                onClick={() => setFormData(prev => ({
                                    ...prev,
                                    is_unlimited: !prev.is_unlimited,
                                    valid_to: prev.is_unlimited ? prev.valid_to : '',
                                }))}
                                className={cn(
                                    'w-10 h-6 rounded-full transition-colors relative',
                                    formData.is_unlimited ? 'bg-brand-600' : 'bg-surface-300'
                                )}
                            >
                                <div className={cn(
                                    'w-4 h-4 rounded-full bg-white shadow absolute top-1 transition-transform',
                                    formData.is_unlimited ? 'translate-x-5' : 'translate-x-1'
                                )} />
                            </div>
                            <span className="text-sm text-text-primary font-medium">Безстрокова ліцензія</span>
                        </label>
                    </div>

                    <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-4 space-y-4">
                        <h3 className="text-sm font-bold text-text-primary">Контрольні події</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Наступна звірка з реєстром
                                </label>
                                <input
                                    type="date"
                                    value={formData.next_check_due}
                                    onChange={(e) => setFormData(prev => ({ ...prev, next_check_due: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Остання звірка
                                </label>
                                <input
                                    type="date"
                                    value={formData.last_checked_at}
                                    onChange={(e) => setFormData(prev => ({ ...prev, last_checked_at: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Результат звірки
                                </label>
                                <select
                                    value={formData.last_check_result}
                                    onChange={(e) => setFormData(prev => ({ ...prev, last_check_result: e.target.value as LicenseCheckResult }))}
                                    className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                >
                                    {Object.entries(LICENSE_CHECK_RESULT_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Нотатки
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Коментарі, домовленості з клієнтом, особливості ліцензії..."
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all resize-none"
                        />
                    </div>

                    <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-4 space-y-4">
                        <h3 className="text-sm font-bold text-text-primary">Оплати</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Частота платежів
                                </label>
                                <select
                                    value={formData.payment_frequency}
                                    onChange={(e) => setFormData(prev => ({ ...prev, payment_frequency: e.target.value as LicensePaymentFrequency }))}
                                    className="w-full px-3 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                >
                                    {Object.entries(LICENSE_PAYMENT_FREQUENCY_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Наступний платіж
                                </label>
                                <input
                                    type="date"
                                    value={formData.next_payment_due}
                                    onChange={(e) => setFormData(prev => ({ ...prev, next_payment_due: e.target.value }))}
                                    disabled={formData.payment_frequency === 'none'}
                                    className={cn(
                                        'w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all disabled:bg-surface-100 disabled:text-text-muted',
                                        errors.next_payment_due ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.next_payment_due && <p className="text-xs text-red-500 mt-1">{errors.next_payment_due}</p>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sticky bottom-0 bg-white border-t border-surface-200 px-8 py-4 flex items-center justify-between rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-100 rounded-lg transition-colors"
                    >
                        Скасувати
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                    >
                        {editLicense ? 'Зберегти зміни' : 'Додати ліцензію'}
                    </button>
                </div>
            </div>
        </div>
    );
}
