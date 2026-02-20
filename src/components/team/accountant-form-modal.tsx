'use client';

import { useState } from 'react';
import {
    X,
    User,
    Mail,
    Phone,
    Copy,
    Check,
    Key,
    Eye,
    EyeOff,
    ShieldCheck,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCreateProfile, useUpdateProfile } from '@/lib/hooks/use-profiles';

export interface AccountantCredentials {
    login: string;
    password: string;
    name: string;
    context?: 'created' | 'reset';
}

interface AccountantFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editProfile?: Profile | null;
    initialCredentials?: AccountantCredentials | null;
}

export default function AccountantFormModal({
    isOpen,
    onClose,
    editProfile,
    initialCredentials,
}: AccountantFormModalProps) {
    const createProfileMutation = useCreateProfile();
    const updateProfileMutation = useUpdateProfile();
    const editProfileFullName = editProfile?.full_name || '';
    const editProfilePhone = editProfile?.phone || '';
    const editProfileEmail = editProfile?.email || '';

    const [fullName, setFullName] = useState(editProfileFullName);
    const [phone, setPhone] = useState(editProfilePhone);
    const [email, setEmail] = useState(editProfileEmail);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Show generated credentials after creation
    const [createdCredentials, setCreatedCredentials] = useState<AccountantCredentials | null>(
        initialCredentials ? { ...initialCredentials } : null
    );
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    if (!isOpen) return null;

    const getMutationErrorMessage = (error: unknown): string => {
        const message = error instanceof Error ? error.message : '';

        if (message === 'UNAUTHENTICATED') {
            return 'Сесія завершилась. Оновіть сторінку та увійдіть повторно.';
        }

        if (message === 'PROFILE_NOT_FOUND') {
            return 'Не вдалося знайти ваш профіль. Зверніться до адміністратора.';
        }

        if (/already registered|already been registered|duplicate key/i.test(message)) {
            return 'Користувач з таким email вже існує.';
        }

        return message || 'Не вдалося зберегти зміни. Спробуйте ще раз.';
    };

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!fullName.trim()) errs.fullName = "Ім'я обов'язкове";
        if (!phone.trim()) errs.phone = "Телефон обов'язковий";
        else if (!/^\+380\d{9}$/.test(phone.replace(/\s/g, ''))) errs.phone = 'Формат: +380XXXXXXXXX';
        if (!editProfile && !email.trim()) errs.email = "Email обов'язковий";
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Невірний формат email';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitError(null);

        if (editProfile) {
            try {
                await updateProfileMutation.mutateAsync({
                    ...editProfile,
                    full_name: fullName.trim(),
                    phone: phone.trim(),
                    email: email.trim() || undefined,
                });
                onClose();
            } catch (error) {
                setSubmitError(getMutationErrorMessage(error));
            }
        } else {
            const phoneToUse = phone.trim();
            try {
                const result = await createProfileMutation.mutateAsync({
                    full_name: fullName.trim(),
                    phone: phoneToUse,
                    email: email.trim(),
                });

                setCreatedCredentials({
                    login: result.email || email.trim(),
                    password: result.generated_password || '',
                    name: fullName.trim(),
                    context: 'created',
                });
            } catch (error) {
                setSubmitError(getMutationErrorMessage(error));
            }
        }
    };

    const handleCopy = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleCopyAll = async () => {
        if (!createdCredentials) return;
        const text = `Бухгалтер: ${createdCredentials.name}\nЛогін: ${createdCredentials.login}\nПароль: ${createdCredentials.password}`;
        await navigator.clipboard.writeText(text);
        setCopiedField('all');
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleClose = () => {
        setCreatedCredentials(null);
        setFullName('');
        setPhone('');
        setEmail('');
        setErrors({});
        setSubmitError(null);
        setShowPassword(false);
        onClose();
    };

    const isSubmitting = createProfileMutation.isPending || updateProfileMutation.isPending;
    const pendingSubmitLabel = editProfile ? 'Збереження...' : 'Створення...';
    const idleSubmitLabel = editProfile ? 'Зберегти' : 'Створити та згенерувати пароль';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-[520px] max-h-[90vh] overflow-hidden flex flex-col mx-4 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-7 pt-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                            <User size={20} className="text-brand-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-text-primary">
                                {createdCredentials
                                    ? 'Дані для входу'
                                    : editProfile
                                        ? 'Редагувати бухгалтера'
                                        : 'Додати бухгалтера'
                                }
                            </h2>
                            <p className="text-xs text-text-muted">
                                {createdCredentials
                                    ? 'Передайте ці дані бухгалтеру'
                                    : editProfile
                                        ? 'Оновіть дані профілю'
                                        : 'Заповніть дані для створення акаунту'
                                }
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-7 pb-6">
                    {createdCredentials ? (
                        /* ===== Credentials Screen ===== */
                        <div className="space-y-5">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                                <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-emerald-800">
                                        {createdCredentials.context === 'reset'
                                            ? 'Пароль оновлено успішно!'
                                            : 'Акаунт створено успішно!'}
                                    </p>
                                    <p className="text-xs text-emerald-600 mt-0.5">
                                        {createdCredentials.context === 'reset'
                                            ? <>Скопіюйте нові дані нижче та передайте бухгалтеру <strong>{createdCredentials.name}</strong></>
                                            : <>Скопіюйте дані нижче та передайте бухгалтеру <strong>{createdCredentials.name}</strong></>}
                                    </p>
                                </div>
                            </div>

                            {/* Login */}
                            <div>
                                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">
                                    Логін (email)
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-sm font-mono font-semibold text-text-primary select-all">
                                        {createdCredentials.login}
                                    </div>
                                    <button
                                        onClick={() => handleCopy(createdCredentials.login, 'login')}
                                        className={cn(
                                            'w-10 h-10 flex items-center justify-center rounded-xl border transition-all',
                                            copiedField === 'login'
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                                                : 'border-surface-200 text-text-muted hover:bg-surface-50 hover:text-text-primary'
                                        )}
                                    >
                                        {copiedField === 'login' ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">
                                    Тимчасовий пароль
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-sm font-mono font-semibold text-text-primary select-all relative">
                                        {showPassword ? createdCredentials.password : '••••••••••••'}
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleCopy(createdCredentials.password, 'password')}
                                        className={cn(
                                            'w-10 h-10 flex items-center justify-center rounded-xl border transition-all',
                                            copiedField === 'password'
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                                                : 'border-surface-200 text-text-muted hover:bg-surface-50 hover:text-text-primary'
                                        )}
                                    >
                                        {copiedField === 'password' ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Copy All Button */}
                            <button
                                onClick={handleCopyAll}
                                className={cn(
                                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                                    copiedField === 'all'
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                        : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
                                )}
                            >
                                {copiedField === 'all' ? (
                                    <><Check size={16} /> Скопійовано!</>
                                ) : (
                                    <><Copy size={16} /> Скопіювати все</>
                                )}
                            </button>

                            <p className="text-[11px] text-text-muted text-center leading-relaxed">
                                {createdCredentials.context === 'reset'
                                    ? 'Попередній пароль більше не діє. Передайте бухгалтеру тільки новий пароль із цього вікна.'
                                    : 'Пароль показується тільки один раз. Після закриття вікна ви зможете згенерувати новий пароль через кнопку «Перегенерувати пароль».'}
                            </p>
                        </div>
                    ) : (
                        /* ===== Form Screen ===== */
                        <div className="space-y-5">
                            {submitError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2.5">
                                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                    <p>{submitError}</p>
                                </div>
                            )}

                            {/* Full Name */}
                            <div>
                                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <User size={12} />
                                    ПІБ *
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Іванов Іван Іванович"
                                    className={cn(
                                        'w-full px-4 py-2.5 bg-white border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.fullName ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
                            </div>

                            {/* Phone (Login) */}
                            <div>
                                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <Phone size={12} />
                                    Телефон *
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+380XXXXXXXXX"
                                    className={cn(
                                        'w-full px-4 py-2.5 bg-white border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.phone ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                            </div>

                            {/* Email (optional) */}
                            <div>
                                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <Mail size={12} />
                                    Ел. пошта {!editProfile && '*'}
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ivan@taskcontrol.com"
                                    className={cn(
                                        'w-full px-4 py-2.5 bg-white border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all',
                                        errors.email ? 'border-red-400' : 'border-surface-200'
                                    )}
                                />
                                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                            </div>

                            {/* Auto-generation info */}
                            {!editProfile && (
                                <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-start gap-3">
                                    <Key size={18} className="text-brand-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-semibold text-brand-800">Авто-генерація паролю</p>
                                        <p className="text-xs text-brand-600 mt-0.5">
                                            Після створення система автоматично згенерує надійний пароль. Логіном для входу буде email бухгалтера.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-7 py-4 border-t border-surface-200 bg-surface-50">
                    {createdCredentials ? (
                        <button
                            onClick={handleClose}
                            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors"
                        >
                            Готово
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={handleClose}
                                className="px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                            >
                                Скасувати
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                translate="no"
                                className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                            >
                                <span className={isSubmitting ? 'inline-flex items-center justify-center' : 'hidden'}>
                                    <Loader2 size={16} className="animate-spin" />
                                </span>
                                <span className={isSubmitting ? 'hidden' : 'inline-flex items-center justify-center'}>
                                    <Key size={16} />
                                </span>
                                <span translate="no" className={isSubmitting ? '' : 'hidden'}>{pendingSubmitLabel}</span>
                                <span translate="no" className={isSubmitting ? 'hidden' : ''}>{idleSubmitLabel}</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
