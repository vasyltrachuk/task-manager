'use client';

import { useMemo, useState } from 'react';
import { X, Building2, User, Phone, Mail, Hash, FileText } from 'lucide-react';
import {
    Client,
    ClientType,
    ClientStatus,
    ClientTaxIdType,
    TaxSystem,
    CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE,
    CLIENT_TYPE_LABELS,
    CLIENT_TAX_ID_TYPE_LABELS,
    TAX_SYSTEM_LABELS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn, formatMoneyUAH } from '@/lib/utils';
import {
    calculateIncomeLimitByTaxSystem,
    isSingleTaxSystem,
    isVatPayerByTaxSystem,
    TAX_SYSTEM_UI_GROUPS,
} from '@/lib/tax';
import { canManageClients } from '@/lib/rbac';
import { normalizeClientName } from '@/lib/client-name';
import {
    buildTaxProfile,
    resolveObligations,
    TAX_PROFILE_CADENCE_LABELS,
    TAX_PROFILE_RISK_FLAG_LABELS,
    TAX_PROFILE_SUBJECT_LABELS,
} from '@/lib/tax-profile';

interface ClientFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editClient?: Client | null;
}

interface ClientFormData {
    name: string;
    type: ClientType;
    tax_id_type: ClientTaxIdType;
    tax_id: string;
    status: ClientStatus;
    tax_system: TaxSystem | '';
    contact_phone: string;
    contact_email: string;
    employee_count: number;
    industry: string;
    notes: string;
    assignee_ids: string[];
}

const CLIENT_NAME_PLACEHOLDERS: Record<ClientType, string> = {
    FOP: 'Іваненко Петро Олександрович',
    LLC: '«Компанія»',
    OSBB: '«Затишний двір»',
    NGO: '«Центр розвитку»',
    GRANT: '«Назва проєкту»',
};

const TAX_ID_PLACEHOLDERS: Record<ClientTaxIdType, string> = {
    ipn: '1234567890',
    edrpou: '12345678',
};

function getInitialFormData(editClient?: Client | null): ClientFormData {
    if (editClient) {
        return {
            name: normalizeClientName(editClient.name),
            type: editClient.type,
            tax_id_type: editClient.tax_id_type || CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE[editClient.type],
            tax_id: editClient.tax_id,
            status: editClient.status,
            tax_system: editClient.tax_system || '',
            contact_phone: editClient.contact_phone || '',
            contact_email: editClient.contact_email || '',
            employee_count: editClient.employee_count || 0,
            industry: editClient.industry || '',
            notes: editClient.notes || '',
            assignee_ids: editClient.accountants?.map(a => a.id) || [],
        };
    }

    return {
        name: '',
        type: 'FOP',
        tax_id_type: CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE.FOP,
        tax_id: '',
        status: 'onboarding',
        tax_system: '',
        contact_phone: '',
        contact_email: '',
        employee_count: 0,
        industry: '',
        notes: '',
        assignee_ids: [],
    };
}

export default function ClientFormModal({ isOpen, onClose, editClient }: ClientFormModalProps) {
    const { state, addClient, updateClient } = useApp();
    const assignees = state.profiles.filter(p => p.role === 'accountant' && p.is_active);
    const canManageClient = canManageClients(state.currentUser);

    const [formData, setFormData] = useState<ClientFormData>(() => getInitialFormData(editClient));

    const [errors, setErrors] = useState<Record<string, string>>({});
    const autoIncomeLimit = calculateIncomeLimitByTaxSystem(formData.tax_system, state.taxRulebook);
    const usesRulebookIncomeLimit = isSingleTaxSystem(formData.tax_system || undefined);
    const isVatPayer = isVatPayerByTaxSystem(formData.tax_system || undefined);
    const previewClient = useMemo<Client>(() => {
        const normalizedName = normalizeClientName(formData.name);

        return {
            id: editClient?.id || 'preview-client',
            name: normalizedName || formData.name || '—',
            type: formData.type,
            tax_id_type: formData.tax_id_type,
            tax_id: formData.tax_id.trim(),
            status: formData.status,
            tax_system: formData.tax_system || undefined,
            is_vat_payer: isVatPayerByTaxSystem(formData.tax_system || undefined),
            income_limit: usesRulebookIncomeLimit ? autoIncomeLimit : undefined,
            income_limit_source: usesRulebookIncomeLimit ? 'rulebook' : undefined,
            contact_phone: formData.contact_phone || undefined,
            contact_email: formData.contact_email || undefined,
            employee_count: formData.employee_count || undefined,
            industry: formData.industry || undefined,
            notes: formData.notes || undefined,
            accountants: assignees.filter((assignee) => formData.assignee_ids.includes(assignee.id)),
            created_at: editClient?.created_at || '1970-01-01T00:00:00.000Z',
            updated_at: editClient?.updated_at || '1970-01-01T00:00:00.000Z',
        };
    }, [
        assignees,
        autoIncomeLimit,
        editClient?.created_at,
        editClient?.id,
        editClient?.updated_at,
        formData.assignee_ids,
        formData.contact_email,
        formData.contact_phone,
        formData.employee_count,
        formData.industry,
        formData.name,
        formData.notes,
        formData.status,
        formData.tax_id,
        formData.tax_id_type,
        formData.tax_system,
        formData.type,
        usesRulebookIncomeLimit,
    ]);
    const previewLicenses = useMemo(
        () => (editClient ? state.licenses.filter((license) => license.client_id === editClient.id) : []),
        [editClient, state.licenses]
    );
    const previewTaxProfile = useMemo(
        () => buildTaxProfile({ client: previewClient, licenses: previewLicenses }),
        [previewClient, previewLicenses]
    );
    const previewObligations = useMemo(
        () => resolveObligations(previewTaxProfile),
        [previewTaxProfile]
    );
    const previewObligationsByCadence = useMemo(() => {
        const groups: Record<'monthly' | 'quarterly' | 'annual' | 'event', typeof previewObligations> = {
            monthly: [],
            quarterly: [],
            annual: [],
            event: [],
        };

        previewObligations.forEach((obligation) => {
            groups[obligation.cadence].push(obligation);
        });

        return groups;
    }, [previewObligations]);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!normalizeClientName(formData.name)) e.name = "Обов'язкове поле";
        if (!formData.type) e.type = "Оберіть тип";
        if (!formData.tax_id.trim()) e.tax_id = `Вкажіть ${CLIENT_TAX_ID_TYPE_LABELS[formData.tax_id_type]}`;
        if (!formData.tax_system) e.tax_system = 'Оберіть систему оподаткування';
        if (formData.assignee_ids.length === 0) e.assignee_ids = 'Призначте фахівця';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = () => {
        if (!validate()) return;

        const resolvedIncomeLimit = usesRulebookIncomeLimit
            ? autoIncomeLimit
            : undefined;
        const resolvedIncomeLimitSource = usesRulebookIncomeLimit
            ? 'rulebook'
            : undefined;
        const resolvedTaxSystem = formData.tax_system || undefined;
        const normalizedName = normalizeClientName(formData.name);

        const clientData = {
            name: normalizedName,
            type: formData.type,
            tax_id_type: formData.tax_id_type,
            tax_id: formData.tax_id.trim(),
            status: formData.status,
            tax_system: resolvedTaxSystem,
            is_vat_payer: isVatPayerByTaxSystem(resolvedTaxSystem),
            income_limit: resolvedIncomeLimit,
            income_limit_source: resolvedIncomeLimitSource,
            contact_phone: formData.contact_phone || undefined,
            contact_email: formData.contact_email || undefined,
            employee_count: formData.employee_count || undefined,
            industry: formData.industry || undefined,
            notes: formData.notes || undefined,
            accountants: assignees.filter(a => formData.assignee_ids.includes(a.id)),
        };

        if (editClient) {
            updateClient({
                ...editClient,
                ...clientData,
                updated_at: new Date().toISOString(),
            } as Client);
        } else {
            addClient(clientData as Omit<Client, 'id' | 'created_at' | 'updated_at'>);
        }
        onClose();
    };

    const toggleAssignee = (id: string) => {
        setFormData(prev => ({
            ...prev,
            assignee_ids: prev.assignee_ids.includes(id)
                ? prev.assignee_ids.filter(x => x !== id)
                : [...prev.assignee_ids, id],
        }));
    };

    const handleClientTypeChange = (nextType: ClientType) => {
        setFormData(prev => {
            const previousDefaultTaxIdType = CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE[prev.type];
            const nextDefaultTaxIdType = CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE[nextType];

            return {
                ...prev,
                type: nextType,
                tax_id_type: prev.tax_id_type === previousDefaultTaxIdType
                    ? nextDefaultTaxIdType
                    : prev.tax_id_type,
            };
        });
    };

    if (!isOpen) return null;
    if (!canManageClient) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="sticky top-0 bg-white z-10 px-8 pt-6 pb-4 border-b border-surface-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                                <Building2 size={20} className="text-brand-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-text-primary">
                                    {editClient ? 'Редагувати клієнта' : 'Новий клієнт'}
                                </h2>
                                <p className="text-xs text-text-muted">
                                    {editClient ? 'Оновити дані клієнта' : 'Заповніть інформацію про клієнта'}
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

                {/* Form */}
                <div className="px-8 py-6 space-y-6">
                    {/* Type + Status */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Тип клієнта *
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {(Object.entries(CLIENT_TYPE_LABELS) as [ClientType, string][]).map(([t, label]) => (
                                    <button
                                        key={t}
                                        onClick={() => handleClientTypeChange(t)}
                                        className={cn(
                                            'w-full min-h-[42px] px-2 py-2 rounded-lg text-xs font-semibold leading-tight text-center transition-all border',
                                            formData.type === t
                                                ? 'bg-brand-600 text-white border-brand-600'
                                                : 'bg-white text-text-secondary border-surface-200 hover:border-brand-400'
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
                        </div>

                        <div className="max-w-xs">
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Статус
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as ClientStatus }))}
                                className="w-full px-3 py-2.5 bg-white border border-surface-200 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            >
                                <option value="onboarding">Онбординг</option>
                                <option value="active">Активний</option>
                                <option value="archived">Архів</option>
                            </select>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            <Building2 size={12} className="inline mr-1" />
                            Назва / ПІБ *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder={CLIENT_NAME_PLACEHOLDERS[formData.type]}
                            className={cn(
                                'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                errors.name ? 'border-red-400' : 'border-surface-200'
                            )}
                        />
                        <p className="text-xs text-text-muted mt-1">
                            Тип клієнта додається автоматично у відображенні назви.
                        </p>
                        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                    </div>

                    {/* Tax ID + Tax system */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <Hash size={12} className="inline mr-1" />
                                Податковий ідентифікатор *
                            </label>
                            <div className="inline-flex rounded-lg border border-surface-200 bg-surface-50 p-1 mb-2">
                                {(Object.entries(CLIENT_TAX_ID_TYPE_LABELS) as [ClientTaxIdType, string][]).map(([taxIdType, label]) => (
                                    <button
                                        key={taxIdType}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, tax_id_type: taxIdType }))}
                                        className={cn(
                                            'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                                            formData.tax_id_type === taxIdType
                                                ? 'bg-brand-600 text-white'
                                                : 'text-text-secondary hover:bg-surface-100'
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={formData.tax_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                                placeholder={TAX_ID_PLACEHOLDERS[formData.tax_id_type]}
                                className={cn(
                                    'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.tax_id ? 'border-red-400' : 'border-surface-200'
                                )}
                            />
                            {errors.tax_id && <p className="text-xs text-red-500 mt-1">{errors.tax_id}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Система оподаткування *
                            </label>
                            <select
                                value={formData.tax_system}
                                onChange={(e) => setFormData(prev => ({ ...prev, tax_system: e.target.value as TaxSystem | '' }))}
                                className={cn(
                                    'w-full px-3 py-3 bg-white border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.tax_system ? 'border-red-400' : 'border-surface-200'
                                )}
                            >
                                <option value="">Оберіть систему</option>
                                {TAX_SYSTEM_UI_GROUPS.map((group) => (
                                    <optgroup key={group.label} label={group.label}>
                                        {group.options.map((option) => (
                                            <option key={option} value={option}>
                                                {TAX_SYSTEM_LABELS[option]}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <p className="text-xs text-text-muted mt-2">
                                ПДВ визначається автоматично від системи:
                                {' '}
                                <span className={cn('font-semibold', isVatPayer ? 'text-status-done' : 'text-text-secondary')}>
                                    {formData.tax_system ? (isVatPayer ? 'Платник ПДВ' : 'Без ПДВ') : '—'}
                                </span>
                            </p>
                            {errors.tax_system && <p className="text-xs text-red-500 mt-1">{errors.tax_system}</p>}
                        </div>
                    </div>

                    {/* Contact info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <Phone size={12} className="inline mr-1" />
                                Телефон
                            </label>
                            <input
                                type="tel"
                                value={formData.contact_phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                                placeholder="+380501234567"
                                className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <Mail size={12} className="inline mr-1" />
                                Ел. пошта
                            </label>
                            <input
                                type="email"
                                value={formData.contact_email}
                                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                                placeholder="client@example.com"
                                className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            />
                        </div>
                    </div>

                    {/* Industry + Employees */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Галузь
                            </label>
                            <input
                                type="text"
                                value={formData.industry}
                                onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                                placeholder="IT, Торгівля, HoReCa..."
                                className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Кількість працівників
                            </label>
                            <input
                                type="number"
                                value={formData.employee_count || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, employee_count: parseInt(e.target.value) || 0 }))}
                                placeholder="0"
                                min="0"
                                className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                            />
                        </div>
                    </div>

                    {/* Income limit */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            Ліміт доходу (авто)
                        </label>
                        <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-text-muted">Розраховано за rulebook ({state.taxRulebook.year})</span>
                                <span className={cn(
                                    'text-sm font-semibold',
                                    autoIncomeLimit ? 'text-brand-700' : 'text-text-muted'
                                )}>
                                    {usesRulebookIncomeLimit && autoIncomeLimit ? formatMoneyUAH(autoIncomeLimit) : 'Не застосовується'}
                                </span>
                            </div>
                            <p className="text-xs text-text-muted mt-2">
                                Ліміт автоматично застосовується для ЄП 1/2/3 (з або без ПДВ)/4. Параметри редагуються в Налаштуваннях.
                            </p>
                        </div>
                    </div>

                    {/* Tax profile preview */}
                    <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-bold text-text-primary">Податковий профіль (preview)</h3>
                            <p className="text-xs text-text-muted mt-1">
                                Профіль формується автоматично з введених полів і каталогу обов&apos;язків.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                <p className="text-xs text-text-muted">Subject</p>
                                <p className="font-semibold text-text-primary">
                                    {TAX_PROFILE_SUBJECT_LABELS[previewTaxProfile.subject]}
                                </p>
                            </div>
                            <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                <p className="text-xs text-text-muted">VAT</p>
                                <p className={cn('font-semibold', previewTaxProfile.is_vat_payer ? 'text-status-done' : 'text-text-primary')}>
                                    {previewTaxProfile.is_vat_payer ? 'Платник ПДВ' : 'Без ПДВ'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                <p className="text-xs text-text-muted">Працівники</p>
                                <p className="font-semibold text-text-primary">
                                    {previewTaxProfile.has_employees ? `${previewTaxProfile.employee_count} активних` : 'Немає працівників'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                <p className="text-xs text-text-muted">Ліцензії</p>
                                <p className="font-semibold text-text-primary">
                                    {previewTaxProfile.has_licenses ? `${previewTaxProfile.license_types.length} тип(ів)` : 'Немає ліцензій'}
                                </p>
                            </div>
                        </div>

                        {previewTaxProfile.risk_flags.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-xs font-semibold text-amber-700">
                                    Недостатньо даних для повного профілю.
                                </p>
                                <div className="mt-1 space-y-1">
                                    {previewTaxProfile.risk_flags.map((flag) => (
                                        <p key={flag} className="text-xs text-amber-700">
                                            {TAX_PROFILE_RISK_FLAG_LABELS[flag]}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                                Активні обов&apos;язки
                            </p>
                            {previewObligations.length > 0 ? (
                                <div className="space-y-2">
                                    {(Object.keys(previewObligationsByCadence) as Array<keyof typeof previewObligationsByCadence>)
                                        .map((cadence) => {
                                            const obligations = previewObligationsByCadence[cadence];
                                            if (obligations.length === 0) return null;

                                            return (
                                                <div key={cadence}>
                                                    <p className="text-[11px] font-semibold text-text-muted mb-1">
                                                        {TAX_PROFILE_CADENCE_LABELS[cadence]}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {obligations.map((obligation) => (
                                                            <span
                                                                key={obligation.code}
                                                                title={obligation.description}
                                                                className="inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-xs text-text-secondary"
                                                            >
                                                                {obligation.title}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">
                                    Для поточного набору полів обов&apos;язки ще не визначені.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Assignee */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            <User size={12} className="inline mr-1" />
                            Відповідальний фахівець *
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {assignees.map((acc) => (
                                <button
                                    key={acc.id}
                                    onClick={() => toggleAssignee(acc.id)}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all',
                                        formData.assignee_ids.includes(acc.id)
                                            ? 'bg-brand-600 text-white border-brand-600'
                                            : 'bg-white text-text-secondary border-surface-200 hover:border-brand-400'
                                    )}
                                >
                                    <div className={cn(
                                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                                        formData.assignee_ids.includes(acc.id) ? 'bg-white/30 text-white' : 'bg-surface-200 text-text-secondary'
                                    )}>
                                        {acc.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                    </div>
                                    {acc.full_name}
                                </button>
                            ))}
                        </div>
                        {errors.assignee_ids && <p className="text-xs text-red-500 mt-1">{errors.assignee_ids}</p>}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            <FileText size={12} className="inline mr-1" />
                            Нотатки
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Додаткова інформація..."
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
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
                        {editClient ? 'Зберегти зміни' : 'Створити клієнта'}
                    </button>
                </div>
            </div>
        </div>
    );
}
