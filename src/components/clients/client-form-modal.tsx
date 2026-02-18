'use client';

import { useMemo, useState } from 'react';
import { X, Building2, User, Phone, Mail, Hash, FileText, RefreshCw } from 'lucide-react';
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
    type TaxRulebookConfig,
} from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
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
import { useProfiles } from '@/lib/hooks/use-profiles';
import { useTaxRulebook } from '@/lib/hooks/use-tax-rulebook';
import { useLicenses } from '@/lib/hooks/use-licenses';
import {
    useCreateClient,
    useDpsClientPrefill,
    useUpdateClient,
    type DpsClientPrefillSuggestion,
} from '@/lib/hooks/use-clients';

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
    rnokpp: '1234567890',
    edrpou: '12345678',
};

const TAX_ID_LENGTH_BY_TYPE: Record<ClientTaxIdType, number> = {
    rnokpp: 10,
    edrpou: 8,
};

function normalizeTaxIdInput(value: string): string {
    return value.replace(/\D/g, '');
}

function isTaxIdValidForType(taxId: string, taxIdType: ClientTaxIdType): boolean {
    return /^\d+$/.test(taxId) && taxId.length === TAX_ID_LENGTH_BY_TYPE[taxIdType];
}

function mergeNotesWithDpsAutofill(existingNotes: string, dpsNote: string): string {
    const normalizedDpsNote = dpsNote.trim();
    if (!normalizedDpsNote) return existingNotes;

    const normalizedExisting = existingNotes.trim();
    if (!normalizedExisting) return normalizedDpsNote;
    if (normalizedExisting.includes(normalizedDpsNote)) return normalizedExisting;
    return `${normalizedExisting}\n\n${normalizedDpsNote}`;
}

function applyDpsPrefillSuggestion(
    formData: ClientFormData,
    suggestion: DpsClientPrefillSuggestion
): { nextFormData: ClientFormData; appliedFields: string[] } {
    const next = { ...formData };
    const appliedFields: string[] = [];

    if (suggestion.name && normalizeClientName(suggestion.name) && suggestion.name !== formData.name) {
        next.name = suggestion.name;
        appliedFields.push('назва');
    }

    if (suggestion.type && suggestion.type !== formData.type) {
        const previousDefaultTaxIdType = CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE[formData.type];
        const nextDefaultTaxIdType = CLIENT_DEFAULT_TAX_ID_TYPE_BY_CLIENT_TYPE[suggestion.type];

        next.type = suggestion.type;
        next.tax_id_type = formData.tax_id_type === previousDefaultTaxIdType
            ? nextDefaultTaxIdType
            : formData.tax_id_type;
        appliedFields.push('тип');
    }

    if (suggestion.tax_system && suggestion.tax_system !== formData.tax_system) {
        next.tax_system = suggestion.tax_system;
        appliedFields.push('система оподаткування');
    }

    if (suggestion.notes) {
        const mergedNotes = mergeNotesWithDpsAutofill(formData.notes, suggestion.notes);
        if (mergedNotes !== formData.notes) {
            next.notes = mergedNotes;
            appliedFields.push('нотатки');
        }
    }

    return {
        nextFormData: next,
        appliedFields,
    };
}

function getMutationErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';

    if (/duplicate key|already exists|already been registered/i.test(message)) {
        return 'Запис з таким ідентифікатором вже існує.';
    }

    return message || 'Не вдалося зберегти клієнта. Спробуйте ще раз.';
}

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
    const { profile } = useAuth();
    const { data: profilesData } = useProfiles();
    const { data: taxRulebook } = useTaxRulebook();
    const { data: licensesData } = useLicenses();
    const createClientMutation = useCreateClient();
    const updateClientMutation = useUpdateClient();
    const dpsPrefillMutation = useDpsClientPrefill();

    const assignees = (profilesData ?? []).filter(p => p.role === 'accountant' && p.is_active);
    const canManageClient = profile ? canManageClients(profile) : false;
    const effectiveTaxRulebook: TaxRulebookConfig = taxRulebook ?? {
        year: new Date().getFullYear(),
        minimum_wage_on_january_1: 0,
        single_tax_multipliers: {
            single_tax_group1: 0,
            single_tax_group2: 0,
            single_tax_group3: 0,
            single_tax_group4: 0,
        },
        vat_registration_threshold: 0,
    };

    const [formData, setFormData] = useState<ClientFormData>(() => getInitialFormData(editClient));

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [dpsPrefillError, setDpsPrefillError] = useState<string | null>(null);
    const [dpsPrefillMessage, setDpsPrefillMessage] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showAnalytics, setShowAnalytics] = useState(Boolean(editClient));
    const normalizedTaxId = normalizeTaxIdInput(formData.tax_id);
    const isTaxIdValid = isTaxIdValidForType(normalizedTaxId, formData.tax_id_type);
    const autoIncomeLimit = calculateIncomeLimitByTaxSystem(formData.tax_system, effectiveTaxRulebook);
    const usesRulebookIncomeLimit = isSingleTaxSystem(formData.tax_system || undefined);
    const isVatPayer = isVatPayerByTaxSystem(formData.tax_system || undefined);
    const isSubmitting = createClientMutation.isPending || updateClientMutation.isPending;
    const previewClient = useMemo<Client>(() => {
        const normalizedName = normalizeClientName(formData.name);

        return {
            id: editClient?.id || 'preview-client',
            name: normalizedName || formData.name || '—',
            type: formData.type,
            tax_id_type: formData.tax_id_type,
            tax_id: normalizeTaxIdInput(formData.tax_id),
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
        () => (editClient ? (licensesData ?? []).filter((license) => license.client_id === editClient.id) : []),
        [editClient, licensesData]
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
        if (!normalizedTaxId) {
            e.tax_id = `Вкажіть ${CLIENT_TAX_ID_TYPE_LABELS[formData.tax_id_type]}`;
        } else if (!isTaxIdValidForType(normalizedTaxId, formData.tax_id_type)) {
            e.tax_id = `${CLIENT_TAX_ID_TYPE_LABELS[formData.tax_id_type]} має містити ${TAX_ID_LENGTH_BY_TYPE[formData.tax_id_type]} цифр`;
        }
        if (!formData.tax_system) e.tax_system = 'Оберіть систему оподаткування';
        if (formData.assignee_ids.length === 0) e.assignee_ids = 'Призначте фахівця';
        setErrors(e);

        const firstErrorField = Object.keys(e)[0];
        if (firstErrorField && typeof document !== 'undefined') {
            requestAnimationFrame(() => {
                const target = document.querySelector<HTMLElement>(`[data-field="${firstErrorField}"]`);
                if (!target) return;
                target.focus({ preventScroll: true });
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
        }

        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!validate()) return;
        setSubmitError(null);

        const resolvedIncomeLimit = usesRulebookIncomeLimit
            ? autoIncomeLimit
            : undefined;
        const resolvedIncomeLimitSource: Client['income_limit_source'] = usesRulebookIncomeLimit
            ? 'rulebook'
            : undefined;
        const resolvedTaxSystem = formData.tax_system || undefined;
        const normalizedName = normalizeClientName(formData.name);

        const clientData = {
            name: normalizedName,
            type: formData.type,
            tax_id_type: formData.tax_id_type,
            tax_id: normalizedTaxId,
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
            accountant_ids: formData.assignee_ids,
        };

        try {
            if (editClient) {
                await updateClientMutation.mutateAsync({
                    ...clientData,
                    id: editClient.id,
                });
            } else {
                await createClientMutation.mutateAsync(clientData);
            }
            onClose();
        } catch (error) {
            setSubmitError(getMutationErrorMessage(error));
        }
    };

    const toggleAssignee = (id: string) => {
        setFormData(prev => ({
            ...prev,
            assignee_ids: prev.assignee_ids.includes(id)
                ? prev.assignee_ids.filter(x => x !== id)
                : [...prev.assignee_ids, id],
        }));
        setDpsPrefillError(null);
        setDpsPrefillMessage(null);
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

    const handleDpsPrefill = async () => {
        if (!isTaxIdValid) {
            setDpsPrefillMessage(null);
            setDpsPrefillError(`${CLIENT_TAX_ID_TYPE_LABELS[formData.tax_id_type]} має містити ${TAX_ID_LENGTH_BY_TYPE[formData.tax_id_type]} цифр.`);
            return;
        }

        try {
            setDpsPrefillError(null);
            setDpsPrefillMessage(null);

            const payload = await dpsPrefillMutation.mutateAsync({
                taxIdType: formData.tax_id_type,
                taxId: normalizedTaxId,
                accountantIds: formData.assignee_ids,
            });

            const { nextFormData, appliedFields } = applyDpsPrefillSuggestion(formData, payload.suggestion);
            setFormData(nextFormData);

            if (appliedFields.length === 0) {
                setDpsPrefillMessage('Дані ДПС отримано, але нових полів для оновлення немає.');
                return;
            }

            setDpsPrefillMessage(`Автозаповнення застосовано: ${appliedFields.join(', ')}.`);
        } catch (error) {
            setDpsPrefillError(error instanceof Error ? error.message : 'Не вдалося отримати дані ДПС.');
        }
    };

    if (!isOpen) return null;
    if (!profile) return null;
    if (!canManageClient) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />
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
                                    {editClient ? 'Редагувати клієнта' : 'Додати клієнта'}
                                </h2>
                                <p className="text-xs text-text-muted">
                                    {editClient ? 'Оновити дані клієнта' : 'Заповніть інформацію про клієнта'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className={cn(
                                'w-8 h-8 flex items-center justify-center rounded-lg text-text-muted transition-colors',
                                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-100'
                            )}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="px-8 py-6 space-y-5">
                    {/* Identification */}
                    <section className="rounded-xl border border-surface-200 p-4 space-y-3">
                        <div>
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Ідентифікація</p>
                            <p className="text-[11px] text-text-muted mt-1">
                                Спочатку введіть РНОКПП/ЄДРПОУ, потім за потреби підтягуйте дані з ДПС.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <Hash size={12} className="inline mr-1" />
                                РНОКПП / ЄДРПОУ *
                            </label>
                            <div className="inline-flex rounded-lg border border-surface-200 bg-surface-50 p-1 mb-2">
                                {(Object.entries(CLIENT_TAX_ID_TYPE_LABELS) as [ClientTaxIdType, string][]).map(([taxIdType, label]) => (
                                    <button
                                        key={taxIdType}
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, tax_id_type: taxIdType }));
                                            setDpsPrefillError(null);
                                            setDpsPrefillMessage(null);
                                        }}
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
                                data-field="tax_id"
                                type="text"
                                value={formData.tax_id}
                                autoFocus={!editClient}
                                onChange={(e) => {
                                    const nextTaxId = normalizeTaxIdInput(e.target.value);
                                    setFormData(prev => ({ ...prev, tax_id: nextTaxId }));
                                    setErrors(prev => ({ ...prev, tax_id: '' }));
                                    setDpsPrefillError(null);
                                    setDpsPrefillMessage(null);
                                    setSubmitError(null);
                                }}
                                placeholder={TAX_ID_PLACEHOLDERS[formData.tax_id_type]}
                                className={cn(
                                    'w-full px-4 py-3 bg-white border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                    errors.tax_id ? 'border-red-400' : 'border-surface-200'
                                )}
                            />
                            {!editClient && (
                                <div className="mt-2 space-y-2">
                                    <button
                                        type="button"
                                        onClick={handleDpsPrefill}
                                        disabled={!isTaxIdValid || dpsPrefillMutation.isPending}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                                            !isTaxIdValid || dpsPrefillMutation.isPending
                                                ? 'bg-surface-100 text-text-muted cursor-not-allowed'
                                                : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                                        )}
                                    >
                                        <RefreshCw size={13} className={cn(dpsPrefillMutation.isPending && 'animate-spin')} />
                                        Підтягнути з ДПС
                                    </button>
                                    <p className="text-[11px] text-text-muted">
                                        Автозаповнення використовує токен призначеного бухгалтера або будь-який активний токен у tenant.
                                    </p>
                                </div>
                            )}
                            {errors.tax_id && <p className="text-xs text-red-500 mt-1">{errors.tax_id}</p>}
                            {dpsPrefillError && <p className="text-xs text-red-500 mt-1">{dpsPrefillError}</p>}
                            {dpsPrefillMessage && <p className="text-xs text-emerald-700 mt-1">{dpsPrefillMessage}</p>}
                        </div>
                    </section>

                    {/* Required core */}
                    <section className="rounded-xl border border-surface-200 p-4 space-y-4">
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Ключові дані</p>

                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <Building2 size={12} className="inline mr-1" />
                                Назва / ПІБ *
                            </label>
                            <input
                                data-field="name"
                                type="text"
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData(prev => ({ ...prev, name: e.target.value }));
                                    setErrors(prev => ({ ...prev, name: '' }));
                                    setSubmitError(null);
                                }}
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div data-field="type" tabIndex={-1}>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Тип клієнта *
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(Object.entries(CLIENT_TYPE_LABELS) as [ClientType, string][]).map(([t, label]) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => {
                                                handleClientTypeChange(t);
                                                setErrors(prev => ({ ...prev, type: '' }));
                                                setSubmitError(null);
                                            }}
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

                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    Система оподаткування *
                                </label>
                                <select
                                    data-field="tax_system"
                                    value={formData.tax_system}
                                    onChange={(e) => {
                                        setFormData(prev => ({ ...prev, tax_system: e.target.value as TaxSystem | '' }));
                                        setErrors(prev => ({ ...prev, tax_system: '' }));
                                        setSubmitError(null);
                                    }}
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
                                    ПДВ:
                                    {' '}
                                    <span className={cn('font-semibold', isVatPayer ? 'text-status-done' : 'text-text-secondary')}>
                                        {formData.tax_system ? (isVatPayer ? 'Платник ПДВ' : 'Без ПДВ') : '—'}
                                    </span>
                                </p>
                                {errors.tax_system && <p className="text-xs text-red-500 mt-1">{errors.tax_system}</p>}
                            </div>
                        </div>

                        <div data-field="assignee_ids" tabIndex={-1}>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                <User size={12} className="inline mr-1" />
                                Відповідальний фахівець *
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {assignees.map((acc) => (
                                    <button
                                        key={acc.id}
                                        type="button"
                                        onClick={() => {
                                            toggleAssignee(acc.id);
                                            setErrors(prev => ({ ...prev, assignee_ids: '' }));
                                            setSubmitError(null);
                                        }}
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
                    </section>

                    {/* Additional details */}
                    <section className="rounded-xl border border-surface-200 p-4 space-y-4">
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Додатково</p>

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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    onChange={(e) => setFormData(prev => ({ ...prev, employee_count: parseInt(e.target.value, 10) || 0 }))}
                                    placeholder="0"
                                    min="0"
                                    className="w-full px-4 py-3 bg-white border border-surface-200 rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
                                />
                            </div>
                        </div>

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
                    </section>

                    {/* Analytics */}
                    <section className="rounded-xl border border-surface-200 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowAnalytics((prev) => !prev)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left bg-surface-50 hover:bg-surface-100 transition-colors"
                        >
                            <div>
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Податкова аналітика</p>
                                <p className="text-[11px] text-text-muted mt-1">Ліміт доходу та preview обов&apos;язків.</p>
                            </div>
                            <span className="text-xs font-semibold text-brand-700">
                                {showAnalytics ? 'Згорнути' : 'Показати'}
                            </span>
                        </button>

                        {showAnalytics && (
                            <div className="border-t border-surface-200 p-4 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                        Ліміт доходу (авто)
                                    </label>
                                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm text-text-muted">Розраховано за rulebook ({effectiveTaxRulebook.year})</span>
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
                            </div>
                        )}
                    </section>

                    {submitError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {submitError}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-surface-200 px-8 py-4 flex items-center justify-between rounded-b-2xl">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className={cn(
                            'px-5 py-2.5 text-sm font-medium rounded-lg transition-colors',
                            isSubmitting
                                ? 'text-text-muted bg-surface-100 cursor-not-allowed'
                                : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
                        )}
                    >
                        Скасувати
                    </button>
                    <button
                        onClick={() => { void handleSubmit(); }}
                        disabled={isSubmitting}
                        className={cn(
                            'px-6 py-2.5 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm',
                            isSubmitting
                                ? 'bg-brand-400 cursor-not-allowed'
                                : 'bg-brand-600 hover:bg-brand-700'
                        )}
                    >
                        {isSubmitting
                            ? (editClient ? 'Збереження...' : 'Створення...')
                            : (editClient ? 'Зберегти зміни' : 'Створити клієнта')}
                    </button>
                </div>
            </div>
        </div>
    );
}
