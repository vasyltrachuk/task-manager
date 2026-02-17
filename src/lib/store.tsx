'use client';

import { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import {
    Profile, Client, Task, SubTask, TaskComment, License, LicenseType,
    TaskStatus, ClientStatus, ActivityLogEntry, TaskType, UserRole, TaxRulebookConfig,
    BillingPlan, Invoice, Payment, PaymentAllocation, PaymentMethod, PaymentStatus,
} from './types';
import {
    profiles as initialProfiles,
    clients as initialClients,
    licenses as initialLicenses,
    tasks as initialTasks,
    activityLog as initialActivityLog,
    billingPlans as initialBillingPlans,
    invoices as initialInvoices,
    payments as initialPayments,
    paymentAllocations as initialPaymentAllocations,
    admin,
    taxRulebook as initialTaxRulebook,
} from './mock-data';
import { generateId, generatePassword } from './utils';
import { applyIncomeLimitRulebook, normalizeClientIncomeLimit } from './tax';
import { normalizeClientName } from './client-name';
import { getInvoiceOutstandingMinor, normalizeInvoiceStatus } from './billing';
import {
    buildTaxProfile,
    resolveObligations,
    ResolvedObligation,
    TaxProfile,
} from './tax-profile';
import {
    canAccessBilling,
    canCreateTask,
    canManageBillingForClient,
    canManageClients,
    canManageLicenses,
    canOperateTask,
    canViewClient,
    getVisibleTasksForUser,
    isAccountant,
    isAdmin,
} from './rbac';

type AssignableRole = Exclude<UserRole, 'admin'>;

const PROFILE_ID_PREFIXES: Record<AssignableRole, string> = {
    accountant: 'acc',
    lawyer: 'law',
    hr: 'hr',
    auditor: 'aud',
    manager: 'mgr',
};

const TASK_ID_PREFIXES: Record<TaskType, string> = {
    tax_report: 'TAX',
    payroll: 'PAY',
    reconciliation: 'REC',
    audit: 'AUD',
    license: 'LIC',
    onboarding: 'ONB',
    kik_report: 'KIK',
    registration: 'REG',
    liquidation: 'LIQ',
    management_reporting: 'MGT',
    due_diligence: 'DUE',
    other: 'TSK',
};

const LICENSE_ID_PREFIXES: Record<LicenseType, string> = {
    alcohol_retail: 'ALR',
    alcohol_wholesale: 'ALW',
    transport_passenger: 'TRP',
    transport_cargo: 'TRC',
    fuel_storage: 'FUL',
    medical_practice: 'MED',
    security_services: 'SEC',
    other: 'LIC',
};

const INVOICE_ID_PREFIX = 'inv';
const BILLING_PLAN_ID_PREFIX = 'bp';
const PAYMENT_ID_PREFIX = 'pay';
const PAYMENT_ALLOCATION_ID_PREFIX = 'alloc';

// ========== State Shape ==========
interface AppState {
    profiles: Profile[];
    clients: Client[];
    licenses: License[];
    billingPlans: BillingPlan[];
    invoices: Invoice[];
    payments: Payment[];
    paymentAllocations: PaymentAllocation[];
    tasks: Task[];
    activityLog: ActivityLogEntry[];
    currentUser: Profile;
    taxRulebook: TaxRulebookConfig;
}

// ========== Actions ==========
type Action =
    // Profiles
    | { type: 'ADD_PROFILE'; payload: Profile }
    | { type: 'UPDATE_PROFILE'; payload: Profile }
    | { type: 'DEACTIVATE_PROFILE'; payload: string }
    | { type: 'REGENERATE_PASSWORD'; payload: { profileId: string; password: string } }
    // Clients
    | { type: 'ADD_CLIENT'; payload: Client }
    | { type: 'UPDATE_CLIENT'; payload: Client }
    | { type: 'ARCHIVE_CLIENT'; payload: string }
    // Licenses
    | { type: 'ADD_LICENSE'; payload: License }
    | { type: 'UPDATE_LICENSE'; payload: License }
    | { type: 'DELETE_LICENSE'; payload: string }
    // Billing
    | { type: 'ADD_BILLING_PLAN'; payload: BillingPlan }
    | { type: 'UPDATE_BILLING_PLAN'; payload: BillingPlan }
    | { type: 'ADD_INVOICE'; payload: Invoice }
    | { type: 'UPDATE_INVOICE'; payload: Invoice }
    | { type: 'ADD_PAYMENT'; payload: Payment }
    | { type: 'UPDATE_PAYMENT'; payload: Payment }
    | { type: 'ADD_PAYMENT_ALLOCATIONS'; payload: PaymentAllocation[] }
    | { type: 'UPDATE_TAX_RULEBOOK'; payload: TaxRulebookConfig }
    // Tasks
    | { type: 'ADD_TASK'; payload: Task }
    | { type: 'UPDATE_TASK'; payload: Task }
    | { type: 'DELETE_TASK'; payload: string }
    | { type: 'UPDATE_TASK_STATUS'; payload: { taskId: string; status: TaskStatus } }
    | { type: 'MOVE_TASK'; payload: { taskId: string; status: TaskStatus } }
    // Subtasks
    | { type: 'ADD_SUBTASK'; payload: { taskId: string; subtask: SubTask } }
    | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
    | { type: 'DELETE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
    // Comments
    | { type: 'ADD_COMMENT'; payload: { taskId: string; comment: TaskComment } }
    // Activity
    | { type: 'ADD_ACTIVITY'; payload: ActivityLogEntry }
    // Session
    | { type: 'SET_CURRENT_USER'; payload: Profile };

// ========== Reducer ==========
function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        // --- Profiles ---
        case 'ADD_PROFILE':
            return { ...state, profiles: [...state.profiles, action.payload] };

        case 'UPDATE_PROFILE':
            return {
                ...state,
                profiles: state.profiles.map(p =>
                    p.id === action.payload.id ? { ...p, ...action.payload } : p
                ),
                currentUser: state.currentUser.id === action.payload.id
                    ? { ...state.currentUser, ...action.payload }
                    : state.currentUser,
            };

        case 'DEACTIVATE_PROFILE':
            {
                const nextProfiles = state.profiles.map(p =>
                    p.id === action.payload ? { ...p, is_active: false } : p
                );
                const isCurrentUserDeactivated = state.currentUser.id === action.payload;
                const fallbackUser = nextProfiles.find(p => p.role === 'admin' && p.is_active)
                    || nextProfiles.find(p => p.is_active)
                    || state.currentUser;

                return {
                    ...state,
                    profiles: nextProfiles,
                    currentUser: isCurrentUserDeactivated ? fallbackUser : state.currentUser,
                };
            }

        case 'REGENERATE_PASSWORD':
            return {
                ...state,
                profiles: state.profiles.map(p =>
                    p.id === action.payload.profileId
                        ? { ...p, generated_password: action.payload.password, password_changed: false }
                        : p
                ),
                currentUser: state.currentUser.id === action.payload.profileId
                    ? { ...state.currentUser, generated_password: action.payload.password, password_changed: false }
                    : state.currentUser,
            };

        // --- Clients ---
        case 'ADD_CLIENT':
            return { ...state, clients: [...state.clients, action.payload] };

        case 'UPDATE_CLIENT':
            return {
                ...state,
                clients: state.clients.map(c =>
                    c.id === action.payload.id ? { ...c, ...action.payload } : c
                ),
            };

        case 'ARCHIVE_CLIENT':
            return {
                ...state,
                clients: state.clients.map(c =>
                    c.id === action.payload ? { ...c, status: 'archived' as ClientStatus } : c
                ),
            };

        // --- Licenses ---
        case 'ADD_LICENSE':
            return { ...state, licenses: [...state.licenses, action.payload] };

        case 'UPDATE_LICENSE':
            return {
                ...state,
                licenses: state.licenses.map(l =>
                    l.id === action.payload.id ? { ...l, ...action.payload } : l
                ),
            };

        case 'DELETE_LICENSE':
            return {
                ...state,
                licenses: state.licenses.filter(l => l.id !== action.payload),
            };

        // --- Billing ---
        case 'ADD_BILLING_PLAN':
            return {
                ...state,
                billingPlans: [...state.billingPlans, action.payload],
            };

        case 'UPDATE_BILLING_PLAN':
            return {
                ...state,
                billingPlans: state.billingPlans.map((plan) =>
                    plan.id === action.payload.id ? { ...plan, ...action.payload } : plan
                ),
            };

        case 'ADD_INVOICE':
            return {
                ...state,
                invoices: [...state.invoices, action.payload],
            };

        case 'UPDATE_INVOICE':
            return {
                ...state,
                invoices: state.invoices.map((invoice) =>
                    invoice.id === action.payload.id ? { ...invoice, ...action.payload } : invoice
                ),
            };

        case 'ADD_PAYMENT':
            return {
                ...state,
                payments: [...state.payments, action.payload],
            };

        case 'UPDATE_PAYMENT':
            return {
                ...state,
                payments: state.payments.map((payment) =>
                    payment.id === action.payload.id ? { ...payment, ...action.payload } : payment
                ),
            };

        case 'ADD_PAYMENT_ALLOCATIONS':
            return {
                ...state,
                paymentAllocations: [...state.paymentAllocations, ...action.payload],
            };

        case 'UPDATE_TAX_RULEBOOK':
            return {
                ...state,
                taxRulebook: action.payload,
                clients: applyIncomeLimitRulebook(state.clients, action.payload),
            };

        // --- Tasks ---
        case 'ADD_TASK':
            return { ...state, tasks: [...state.tasks, action.payload] };

        case 'UPDATE_TASK':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.id ? { ...t, ...action.payload } : t
                ),
            };

        case 'DELETE_TASK':
            return {
                ...state,
                tasks: state.tasks.filter(t => t.id !== action.payload),
            };

        case 'UPDATE_TASK_STATUS':
        case 'MOVE_TASK':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.taskId
                        ? { ...t, status: action.payload.status, updated_at: new Date().toISOString() }
                        : t
                ),
            };

        // --- Subtasks ---
        case 'ADD_SUBTASK':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.taskId
                        ? { ...t, subtasks: [...(t.subtasks || []), action.payload.subtask] }
                        : t
                ),
            };

        case 'TOGGLE_SUBTASK':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.taskId
                        ? {
                            ...t,
                            subtasks: (t.subtasks || []).map(s =>
                                s.id === action.payload.subtaskId
                                    ? { ...s, is_completed: !s.is_completed }
                                    : s
                            ),
                        }
                        : t
                ),
            };

        case 'DELETE_SUBTASK':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.taskId
                        ? {
                            ...t,
                            subtasks: (t.subtasks || []).filter(s => s.id !== action.payload.subtaskId),
                        }
                        : t
                ),
            };

        // --- Comments ---
        case 'ADD_COMMENT':
            return {
                ...state,
                tasks: state.tasks.map(t =>
                    t.id === action.payload.taskId
                        ? { ...t, comments: [...(t.comments || []), action.payload.comment] }
                        : t
                ),
            };

        // --- Activity ---
        case 'ADD_ACTIVITY':
            return {
                ...state,
                activityLog: [...state.activityLog, action.payload],
            };

        case 'SET_CURRENT_USER':
            return {
                ...state,
                currentUser: action.payload,
            };

        default:
            return state;
    }
}

// ========== Context ==========
interface AppContextType {
    state: AppState;
    dispatch: React.Dispatch<Action>;
    setCurrentUser: (profileId: string) => void;
    // Profile actions
    addProfile: (data: {
        full_name: string;
        phone: string;
        email?: string;
        role?: AssignableRole;
    }) => { profile: Profile; password: string };
    updateProfile: (profile: Profile) => void;
    deactivateProfile: (profileId: string) => void;
    regeneratePassword: (profileId: string) => string;
    // Client actions
    addClient: (client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => Client;
    updateClient: (client: Client) => void;
    archiveClient: (clientId: string) => void;
    updateTaxRulebook: (rulebook: TaxRulebookConfig) => void;
    // License actions
    addLicense: (license: Omit<License, 'id' | 'created_at' | 'updated_at'>) => License;
    updateLicense: (license: License) => void;
    deleteLicense: (licenseId: string) => void;
    // Billing actions
    addBillingPlan: (plan: Omit<BillingPlan, 'id' | 'created_at' | 'updated_at'>) => BillingPlan;
    updateBillingPlan: (plan: BillingPlan) => void;
    addInvoice: (
        invoice: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>
    ) => Invoice;
    updateInvoice: (invoice: Invoice) => void;
    registerPayment: (payment: {
        client_id: string;
        amount_minor: number;
        currency?: 'UAH';
        paid_at: string;
        method: PaymentMethod;
        status?: PaymentStatus;
        external_ref?: string;
        notes?: string;
        allocations?: Array<{
            invoice_id: string;
            amount_minor: number;
        }>;
    }) => Payment;
    updatePayment: (payment: Payment) => void;
    addTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Task;
    updateTask: (task: Task) => void;
    deleteTask: (taskId: string) => void;
    moveTask: (taskId: string, status: TaskStatus) => void;
    addSubtask: (taskId: string, title: string) => void;
    toggleSubtask: (taskId: string, subtaskId: string) => void;
    deleteSubtask: (taskId: string, subtaskId: string) => void;
    addComment: (taskId: string, body: string) => void;
    logActivity: (taskId: string, action: string, details?: string) => void;
    getTaskById: (id: string) => Task | undefined;
    getClientById: (id: string) => Client | undefined;
    getLicenseById: (id: string) => License | undefined;
    getProfileById: (id: string) => Profile | undefined;
    getTasksByStatus: (status: TaskStatus) => Task[];
    getTasksByAssignee: (assigneeId: string) => Task[];
    getTasksByClient: (clientId: string) => Task[];
    getLicensesByClient: (clientId: string) => License[];
    getClientTaxProfile: (clientId: string) => TaxProfile | undefined;
    getClientObligations: (clientId: string) => ResolvedObligation[];
    getBillingPlansByClient: (clientId: string) => BillingPlan[];
    getInvoicesByClient: (clientId: string) => Invoice[];
    getPaymentsByClient: (clientId: string) => Payment[];
    getActivityForTask: (taskId: string) => ActivityLogEntry[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ========== Provider ==========
const initialClientsWithRulebook = applyIncomeLimitRulebook(
    initialClients.map((client) => ({
        ...client,
        name: normalizeClientName(client.name) || client.name.trim(),
    })),
    initialTaxRulebook
);

const initialBillingPlansWithJoins = initialBillingPlans.map((plan) => ({
    ...plan,
    client: initialClientsWithRulebook.find((client) => client.id === plan.client_id),
}));

const initialInvoicesWithJoins = initialInvoices.map((invoice) => ({
    ...invoice,
    client: initialClientsWithRulebook.find((client) => client.id === invoice.client_id),
    billing_plan: initialBillingPlansWithJoins.find((plan) => plan.id === invoice.billing_plan_id),
    allocations: initialPaymentAllocations.filter((allocation) => allocation.invoice_id === invoice.id),
}));

const initialPaymentsWithJoins = initialPayments.map((payment) => ({
    ...payment,
    client: initialClientsWithRulebook.find((client) => client.id === payment.client_id),
}));

const initialPaymentAllocationsWithJoins = initialPaymentAllocations.map((allocation) => ({
    ...allocation,
    payment: initialPaymentsWithJoins.find((payment) => payment.id === allocation.payment_id),
    invoice: initialInvoicesWithJoins.find((invoice) => invoice.id === allocation.invoice_id),
}));

const initialState: AppState = {
    profiles: initialProfiles,
    clients: initialClientsWithRulebook,
    licenses: initialLicenses.map((license) => ({
        ...license,
        client: initialClientsWithRulebook.find(c => c.id === license.client_id),
        responsible: initialProfiles.find(p => p.id === license.responsible_id),
    })),
    billingPlans: initialBillingPlansWithJoins,
    invoices: initialInvoicesWithJoins,
    payments: initialPaymentsWithJoins,
    paymentAllocations: initialPaymentAllocationsWithJoins,
    tasks: initialTasks,
    activityLog: initialActivityLog,
    currentUser: admin,
    taxRulebook: initialTaxRulebook,
};

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, initialState);

    const setCurrentUser = useCallback((profileId: string) => {
        const profile = state.profiles.find(
            (item) =>
                item.id === profileId
                && item.is_active
                && (item.role === 'admin' || item.role === 'accountant')
        );
        if (!profile) {
            throw new Error('Користувача не знайдено або він неактивний.');
        }
        dispatch({ type: 'SET_CURRENT_USER', payload: profile });
    }, [state.profiles]);

    // --- Profile convenience actions ---
    const addProfile = useCallback((data: {
        full_name: string;
        phone: string;
        email?: string;
        role?: AssignableRole;
    }) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може створювати профілі.');
        }

        const password = generatePassword();
        const role = data.role || 'accountant';
        const newProfile: Profile = {
            id: `u-${PROFILE_ID_PREFIXES[role]}-${generateId()}`,
            full_name: data.full_name,
            phone: data.phone,
            email: data.email,
            role,
            is_active: true,
            created_at: new Date().toISOString(),
            generated_password: password,
            password_changed: false,
        };
        dispatch({ type: 'ADD_PROFILE', payload: newProfile });
        return { profile: newProfile, password };
    }, [state.currentUser]);

    const updateProfile = useCallback((profile: Profile) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати профілі.');
        }
        dispatch({ type: 'UPDATE_PROFILE', payload: profile });
    }, [state.currentUser]);

    const deactivateProfile = useCallback((profileId: string) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може деактивувати профілі.');
        }
        dispatch({ type: 'DEACTIVATE_PROFILE', payload: profileId });
    }, [state.currentUser]);

    const regeneratePassword = useCallback((profileId: string) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може перегенеровувати паролі.');
        }
        const password = generatePassword();
        dispatch({ type: 'REGENERATE_PASSWORD', payload: { profileId, password } });
        return password;
    }, [state.currentUser]);

    // --- Client convenience actions ---
    const addClient = useCallback((data: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
        if (!canManageClients(state.currentUser)) {
            throw new Error('Лише адміністратор може створювати клієнтів.');
        }

        const now = new Date().toISOString();
        const normalizedName = normalizeClientName(data.name) || data.name.trim();
        const newClientBase: Client = {
            ...data,
            name: normalizedName,
            id: `c-${generateId()}`,
            created_at: now,
            updated_at: now,
        };
        const newClient = normalizeClientIncomeLimit(newClientBase, state.taxRulebook);
        dispatch({ type: 'ADD_CLIENT', payload: newClient });
        return newClient;
    }, [state.currentUser, state.taxRulebook]);

    const updateClient = useCallback((client: Client) => {
        if (!canManageClients(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати клієнтів.');
        }

        const normalized = normalizeClientIncomeLimit(
            {
                ...client,
                name: normalizeClientName(client.name) || client.name.trim(),
                updated_at: new Date().toISOString(),
            },
            state.taxRulebook
        );
        dispatch({ type: 'UPDATE_CLIENT', payload: normalized });
    }, [state.currentUser, state.taxRulebook]);

    const archiveClient = useCallback((clientId: string) => {
        if (!canManageClients(state.currentUser)) {
            throw new Error('Лише адміністратор може архівувати клієнтів.');
        }
        dispatch({ type: 'ARCHIVE_CLIENT', payload: clientId });
    }, [state.currentUser]);

    const updateTaxRulebook = useCallback((rulebook: TaxRulebookConfig) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може змінювати податкові правила.');
        }
        dispatch({ type: 'UPDATE_TAX_RULEBOOK', payload: rulebook });
    }, [state.currentUser]);

    // --- License convenience actions ---
    const addLicense = useCallback((data: Omit<License, 'id' | 'created_at' | 'updated_at'>) => {
        if (!canManageLicenses(state.currentUser)) {
            throw new Error('Лише адміністратор може створювати ліцензії.');
        }

        const client = state.clients.find(c => c.id === data.client_id);
        const responsible = state.profiles.find(p => p.id === data.responsible_id);
        if (!client) {
            throw new Error('Клієнта для ліцензії не знайдено.');
        }
        if (!responsible || responsible.role !== 'accountant' || !responsible.is_active) {
            throw new Error('Відповідальним за ліцензію може бути лише активний бухгалтер.');
        }

        const now = new Date().toISOString();
        const prefix = LICENSE_ID_PREFIXES[data.type];
        const newLicense: License = {
            ...data,
            id: `lic-${prefix}-${generateId().slice(0, 4).toUpperCase()}`,
            created_at: now,
            updated_at: now,
        };

        newLicense.client = client;
        newLicense.responsible = responsible;

        dispatch({ type: 'ADD_LICENSE', payload: newLicense });
        return newLicense;
    }, [state.clients, state.currentUser, state.profiles]);

    const updateLicense = useCallback((license: License) => {
        if (!canManageLicenses(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати ліцензії.');
        }

        const client = state.clients.find(c => c.id === license.client_id);
        const responsible = state.profiles.find(p => p.id === license.responsible_id);
        if (!client) {
            throw new Error('Клієнта для ліцензії не знайдено.');
        }
        if (!responsible || responsible.role !== 'accountant' || !responsible.is_active) {
            throw new Error('Відповідальним за ліцензію може бути лише активний бухгалтер.');
        }

        const updatedLicense: License = {
            ...license,
            updated_at: new Date().toISOString(),
            client,
            responsible,
        };

        dispatch({ type: 'UPDATE_LICENSE', payload: updatedLicense });
    }, [state.clients, state.currentUser, state.profiles]);

    const deleteLicense = useCallback((licenseId: string) => {
        if (!canManageLicenses(state.currentUser)) {
            throw new Error('Лише адміністратор може видаляти ліцензії.');
        }
        dispatch({ type: 'DELETE_LICENSE', payload: licenseId });
    }, [state.currentUser]);

    // --- Billing convenience actions ---
    const addBillingPlan = useCallback((data: Omit<BillingPlan, 'id' | 'created_at' | 'updated_at'>) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може створювати тарифні плани.');
        }

        const client = state.clients.find((item) => item.id === data.client_id);
        if (!client) {
            throw new Error('Клієнта для тарифного плану не знайдено.');
        }

        if (data.fee_minor <= 0) {
            throw new Error('Сума тарифу має бути більшою за 0.');
        }

        if (data.due_day < 1 || data.due_day > 28) {
            throw new Error('День оплати має бути в межах 1..28.');
        }

        const now = new Date().toISOString();
        const newPlan: BillingPlan = {
            ...data,
            id: `${BILLING_PLAN_ID_PREFIX}-${generateId().slice(0, 6)}`,
            created_at: now,
            updated_at: now,
            client,
        };

        dispatch({ type: 'ADD_BILLING_PLAN', payload: newPlan });
        return newPlan;
    }, [state.clients, state.currentUser]);

    const updateBillingPlan = useCallback((plan: BillingPlan) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати тарифні плани.');
        }

        const existingPlan = state.billingPlans.find((item) => item.id === plan.id);
        if (!existingPlan) {
            throw new Error('Тарифний план не знайдено.');
        }

        const client = state.clients.find((item) => item.id === plan.client_id);
        if (!client) {
            throw new Error('Клієнта для тарифного плану не знайдено.');
        }

        if (plan.fee_minor <= 0) {
            throw new Error('Сума тарифу має бути більшою за 0.');
        }

        if (plan.due_day < 1 || plan.due_day > 28) {
            throw new Error('День оплати має бути в межах 1..28.');
        }

        const updatedPlan: BillingPlan = {
            ...existingPlan,
            ...plan,
            updated_at: new Date().toISOString(),
            client,
        };

        dispatch({ type: 'UPDATE_BILLING_PLAN', payload: updatedPlan });
    }, [state.billingPlans, state.clients, state.currentUser]);

    const addInvoice = useCallback((data: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може створювати рахунки.');
        }

        const client = state.clients.find((item) => item.id === data.client_id);
        if (!client) {
            throw new Error('Клієнта для рахунку не знайдено.');
        }

        if (data.amount_due_minor <= 0) {
            throw new Error('Сума рахунку має бути більшою за 0.');
        }

        if (data.amount_paid_minor < 0) {
            throw new Error('Сума оплат не може бути відʼємною.');
        }

        if (data.amount_paid_minor > data.amount_due_minor) {
            throw new Error('Оплачена сума не може перевищувати суму рахунку.');
        }

        const billingPlan = data.billing_plan_id
            ? state.billingPlans.find((plan) => plan.id === data.billing_plan_id)
            : undefined;

        if (data.billing_plan_id && !billingPlan) {
            throw new Error('Привʼязаний тарифний план не знайдено.');
        }

        if (billingPlan && billingPlan.client_id !== data.client_id) {
            throw new Error('Рахунок привʼязано до тарифу іншого клієнта.');
        }

        const now = new Date().toISOString();
        const invoiceBase: Invoice = {
            ...data,
            id: `${INVOICE_ID_PREFIX}-${generateId().slice(0, 6)}`,
            created_at: now,
            updated_at: now,
            client,
            billing_plan: billingPlan,
            allocations: data.allocations || [],
        };

        const normalizedInvoice = normalizeInvoiceStatus(invoiceBase);

        dispatch({ type: 'ADD_INVOICE', payload: normalizedInvoice });
        return normalizedInvoice;
    }, [state.billingPlans, state.clients, state.currentUser]);

    const updateInvoice = useCallback((invoice: Invoice) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати рахунки.');
        }

        const existingInvoice = state.invoices.find((item) => item.id === invoice.id);
        if (!existingInvoice) {
            throw new Error('Рахунок не знайдено.');
        }

        const client = state.clients.find((item) => item.id === invoice.client_id);
        if (!client) {
            throw new Error('Клієнта для рахунку не знайдено.');
        }

        if (invoice.amount_due_minor <= 0) {
            throw new Error('Сума рахунку має бути більшою за 0.');
        }

        if (invoice.amount_paid_minor < 0) {
            throw new Error('Сума оплат не може бути відʼємною.');
        }

        if (invoice.amount_paid_minor > invoice.amount_due_minor) {
            throw new Error('Оплачена сума не може перевищувати суму рахунку.');
        }

        const billingPlan = invoice.billing_plan_id
            ? state.billingPlans.find((plan) => plan.id === invoice.billing_plan_id)
            : undefined;

        if (invoice.billing_plan_id && !billingPlan) {
            throw new Error('Привʼязаний тарифний план не знайдено.');
        }

        if (billingPlan && billingPlan.client_id !== invoice.client_id) {
            throw new Error('Рахунок привʼязано до тарифу іншого клієнта.');
        }

        const updatedInvoice = normalizeInvoiceStatus({
            ...existingInvoice,
            ...invoice,
            updated_at: new Date().toISOString(),
            client,
            billing_plan: billingPlan,
        });

        dispatch({ type: 'UPDATE_INVOICE', payload: updatedInvoice });
    }, [state.billingPlans, state.clients, state.currentUser, state.invoices]);

    const registerPayment = useCallback((data: {
        client_id: string;
        amount_minor: number;
        currency?: 'UAH';
        paid_at: string;
        method: PaymentMethod;
        status?: PaymentStatus;
        external_ref?: string;
        notes?: string;
        allocations?: Array<{
            invoice_id: string;
            amount_minor: number;
        }>;
    }) => {
        if (!canAccessBilling(state.currentUser)) {
            throw new Error('Недостатньо прав для реєстрації оплат.');
        }

        const client = state.clients.find((item) => item.id === data.client_id);
        if (!client) {
            throw new Error('Клієнта для оплати не знайдено.');
        }

        if (!canManageBillingForClient(state.currentUser, client)) {
            throw new Error('Недостатньо прав для роботи з оплатами цього клієнта.');
        }

        if (data.amount_minor <= 0) {
            throw new Error('Сума оплати має бути більшою за 0.');
        }

        const now = new Date().toISOString();
        const paymentStatus = data.status || 'received';
        const payment: Payment = {
            id: `${PAYMENT_ID_PREFIX}-${generateId().slice(0, 6)}`,
            client_id: data.client_id,
            amount_minor: data.amount_minor,
            currency: data.currency || 'UAH',
            paid_at: data.paid_at,
            method: data.method,
            status: paymentStatus,
            external_ref: data.external_ref,
            notes: data.notes,
            created_at: now,
            updated_at: now,
            client,
        };

        if (paymentStatus !== 'received' || !data.allocations || data.allocations.length === 0) {
            dispatch({ type: 'ADD_PAYMENT', payload: payment });
            return payment;
        }

        const totalAllocated = data.allocations.reduce((sum, allocation) => sum + allocation.amount_minor, 0);
        if (totalAllocated > data.amount_minor) {
            throw new Error('Сума алокацій не може перевищувати суму оплати.');
        }

        const allocationsByInvoice = data.allocations.reduce<Record<string, number>>((acc, allocation) => {
            if (allocation.amount_minor <= 0) {
                throw new Error('Алокація має бути більшою за 0.');
            }
            acc[allocation.invoice_id] = (acc[allocation.invoice_id] || 0) + allocation.amount_minor;
            return acc;
        }, {});

        const createdAllocations: PaymentAllocation[] = [];
        const invoiceUpdates: Invoice[] = [];

        Object.entries(allocationsByInvoice).forEach(([invoiceId, amountMinor]) => {
            const invoice = state.invoices.find((item) => item.id === invoiceId);
            if (!invoice) {
                throw new Error(`Рахунок ${invoiceId} не знайдено.`);
            }
            if (invoice.client_id !== data.client_id) {
                throw new Error(`Рахунок ${invoiceId} належить іншому клієнту.`);
            }
            if (invoice.status === 'cancelled') {
                throw new Error(`Рахунок ${invoiceId} скасовано, алокація неможлива.`);
            }

            const outstanding = getInvoiceOutstandingMinor(invoice);
            if (amountMinor > outstanding) {
                throw new Error(`Алокація для рахунку ${invoiceId} перевищує залишок до оплати.`);
            }

            const updatedInvoice = normalizeInvoiceStatus({
                ...invoice,
                amount_paid_minor: invoice.amount_paid_minor + amountMinor,
                updated_at: now,
            });

            const allocation: PaymentAllocation = {
                id: `${PAYMENT_ALLOCATION_ID_PREFIX}-${generateId().slice(0, 6)}`,
                payment_id: payment.id,
                invoice_id: invoiceId,
                amount_minor: amountMinor,
                created_at: now,
                payment,
                invoice: updatedInvoice,
            };

            createdAllocations.push(allocation);
            invoiceUpdates.push({
                ...updatedInvoice,
                client: state.clients.find((item) => item.id === updatedInvoice.client_id),
                billing_plan: updatedInvoice.billing_plan_id
                    ? state.billingPlans.find((plan) => plan.id === updatedInvoice.billing_plan_id)
                    : undefined,
                allocations: [...(invoice.allocations || []), allocation],
            });
        });

        dispatch({ type: 'ADD_PAYMENT', payload: payment });

        if (createdAllocations.length > 0) {
            dispatch({ type: 'ADD_PAYMENT_ALLOCATIONS', payload: createdAllocations });
            invoiceUpdates.forEach((invoice) => {
                dispatch({ type: 'UPDATE_INVOICE', payload: invoice });
            });
        }

        return payment;
    }, [state.billingPlans, state.clients, state.currentUser, state.invoices]);

    const updatePayment = useCallback((payment: Payment) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може редагувати оплати.');
        }

        const existingPayment = state.payments.find((item) => item.id === payment.id);
        if (!existingPayment) {
            throw new Error('Оплату не знайдено.');
        }

        const client = state.clients.find((item) => item.id === payment.client_id);
        if (!client) {
            throw new Error('Клієнта для оплати не знайдено.');
        }

        const updatedPayment: Payment = {
            ...existingPayment,
            ...payment,
            updated_at: new Date().toISOString(),
            client,
        };

        dispatch({ type: 'UPDATE_PAYMENT', payload: updatedPayment });
    }, [state.clients, state.currentUser, state.payments]);

    const logActivity = useCallback((taskId: string, action: string, details?: string) => {
        if (!isAdmin(state.currentUser) && !isAccountant(state.currentUser)) {
            throw new Error('Недостатньо прав для додавання активності.');
        }

        const relatedTask = state.tasks.find((task) => task.id === taskId);
        if (relatedTask && !canOperateTask(state.currentUser, relatedTask)) {
            throw new Error('Недостатньо прав для цього завдання.');
        }

        const entry: ActivityLogEntry = {
            id: `al-${generateId()}`,
            task_id: taskId,
            actor_id: state.currentUser.id,
            action,
            details,
            created_at: new Date().toISOString(),
            actor: state.currentUser,
        };
        dispatch({ type: 'ADD_ACTIVITY', payload: entry });
    }, [state.currentUser, state.tasks]);

    const addTask = useCallback((data: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
        if (!canCreateTask(state.currentUser)) {
            throw new Error('Недостатньо прав для створення задач.');
        }

        const client = state.clients.find(c => c.id === data.client_id);
        const assignee = state.profiles.find(p => p.id === data.assignee_id);
        if (!client) {
            throw new Error('Клієнта для задачі не знайдено.');
        }
        if (!assignee || assignee.role !== 'accountant' || !assignee.is_active) {
            throw new Error('Виконавцем задачі може бути лише активний бухгалтер.');
        }

        if (isAccountant(state.currentUser)) {
            if (!canViewClient(state.currentUser, client)) {
                throw new Error('Бухгалтер може створювати задачі лише для своїх клієнтів.');
            }
            if (data.assignee_id !== state.currentUser.id) {
                throw new Error('Бухгалтер може призначати задачу лише собі.');
            }
        }

        const now = new Date().toISOString();
        const prefix = TASK_ID_PREFIXES[data.type];
        const newTask: Task = {
            ...data,
            id: `${prefix}-${generateId().slice(0, 3).toUpperCase()}`,
            created_by: state.currentUser.id,
            created_at: now,
            updated_at: now,
            subtasks: data.subtasks || [],
            comments: data.comments || [],
            files: data.files || [],
        };

        // Attach joined data
        newTask.client = client;
        newTask.assignee = assignee;

        dispatch({ type: 'ADD_TASK', payload: newTask });

        logActivity(newTask.id, 'Задачу створено', `Створено ${state.currentUser.full_name}`);

        return newTask;
    }, [logActivity, state.currentUser, state.clients, state.profiles]);

    const updateTask = useCallback((task: Task) => {
        const existingTask = state.tasks.find((item) => item.id === task.id);
        if (!existingTask) {
            throw new Error('Задачу не знайдено.');
        }

        const client = state.clients.find((item) => item.id === task.client_id);
        const assignee = state.profiles.find((item) => item.id === task.assignee_id);
        if (!client) {
            throw new Error('Клієнта для задачі не знайдено.');
        }
        if (!assignee || assignee.role !== 'accountant' || !assignee.is_active) {
            throw new Error('Виконавцем задачі може бути лише активний бухгалтер.');
        }

        if (isAccountant(state.currentUser)) {
            if (!canOperateTask(state.currentUser, existingTask)) {
                throw new Error('Бухгалтер може редагувати лише власні задачі.');
            }
            if (!canViewClient(state.currentUser, client)) {
                throw new Error('Бухгалтер може працювати лише зі своїми клієнтами.');
            }
            if (task.assignee_id !== state.currentUser.id) {
                throw new Error('Бухгалтер не може перепризначати задачу іншому виконавцю.');
            }
        } else if (!isAdmin(state.currentUser)) {
            throw new Error('Недостатньо прав для редагування задачі.');
        }

        dispatch({
            type: 'UPDATE_TASK',
            payload: {
                ...task,
                client,
                assignee,
                updated_at: new Date().toISOString(),
            },
        });
    }, [state.clients, state.currentUser, state.profiles, state.tasks]);

    const deleteTask = useCallback((taskId: string) => {
        if (!isAdmin(state.currentUser)) {
            throw new Error('Лише адміністратор може видаляти задачі.');
        }
        dispatch({ type: 'DELETE_TASK', payload: taskId });
    }, [state.currentUser]);

    const moveTask = useCallback((taskId: string, status: TaskStatus) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
            throw new Error('Задачу не знайдено.');
        }
        if (!canOperateTask(state.currentUser, task)) {
            throw new Error('Недостатньо прав для зміни статусу задачі.');
        }

        dispatch({ type: 'MOVE_TASK', payload: { taskId, status } });
        const statusLabels: Record<TaskStatus, string> = {
            todo: 'Нова', in_progress: 'В роботі', clarification: 'Уточнення',
            review: 'На перевірці', done: 'Виконано', overdue: 'Прострочено',
        };
        logActivity(taskId, `Статус змінено на "${statusLabels[status]}"`, `${state.currentUser.full_name}`);
    }, [logActivity, state.currentUser, state.tasks]);

    const addSubtask = useCallback((taskId: string, title: string) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
            throw new Error('Задачу не знайдено.');
        }
        if (!canOperateTask(state.currentUser, task)) {
            throw new Error('Недостатньо прав для додавання підзадачі.');
        }

        const subtask: SubTask = {
            id: `st-${generateId()}`,
            task_id: taskId,
            title,
            is_completed: false,
            sort_order: 0,
        };
        dispatch({ type: 'ADD_SUBTASK', payload: { taskId, subtask } });
    }, [state.currentUser, state.tasks]);

    const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
            throw new Error('Задачу не знайдено.');
        }
        if (!canOperateTask(state.currentUser, task)) {
            throw new Error('Недостатньо прав для зміни підзадачі.');
        }
        dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId, subtaskId } });
    }, [state.currentUser, state.tasks]);

    const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
            throw new Error('Задачу не знайдено.');
        }
        if (!canOperateTask(state.currentUser, task)) {
            throw new Error('Недостатньо прав для видалення підзадачі.');
        }
        dispatch({ type: 'DELETE_SUBTASK', payload: { taskId, subtaskId } });
    }, [state.currentUser, state.tasks]);

    const addComment = useCallback((taskId: string, body: string) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
            throw new Error('Задачу не знайдено.');
        }
        if (!canOperateTask(state.currentUser, task)) {
            throw new Error('Недостатньо прав для коментування задачі.');
        }

        const comment: TaskComment = {
            id: `cm-${generateId()}`,
            task_id: taskId,
            author_id: state.currentUser.id,
            body,
            created_at: new Date().toISOString(),
            author: state.currentUser,
        };
        dispatch({ type: 'ADD_COMMENT', payload: { taskId, comment } });
        logActivity(taskId, 'Додано коментар', body.slice(0, 80));
    }, [logActivity, state.currentUser, state.tasks]);

    const getTaskById = useCallback((id: string) => {
        const task = state.tasks.find(t => t.id === id);
        if (!task) return undefined;
        return canOperateTask(state.currentUser, task) ? task : undefined;
    }, [state.currentUser, state.tasks]);

    const getClientById = useCallback((id: string) => {
        const client = state.clients.find(c => c.id === id);
        if (!client) return undefined;
        return canViewClient(state.currentUser, client) ? client : undefined;
    }, [state.clients, state.currentUser]);

    const getLicenseById = useCallback((id: string) => {
        const license = state.licenses.find(l => l.id === id);
        if (!license) return undefined;

        if (isAdmin(state.currentUser)) {
            return license;
        }

        const relatedClient = state.clients.find((client) => client.id === license.client_id);
        if (!relatedClient || !canViewClient(state.currentUser, relatedClient)) {
            return undefined;
        }

        return license;
    }, [state.clients, state.currentUser, state.licenses]);

    const getProfileById = useCallback((id: string) => state.profiles.find(p => p.id === id), [state.profiles]);

    const getTasksByStatus = useCallback(
        (status: TaskStatus) => getVisibleTasksForUser(state.tasks, state.currentUser).filter(t => t.status === status),
        [state.currentUser, state.tasks]
    );
    const getTasksByAssignee = useCallback(
        (assigneeId: string) => getVisibleTasksForUser(state.tasks, state.currentUser).filter(t => t.assignee_id === assigneeId),
        [state.currentUser, state.tasks]
    );
    const getTasksByClient = useCallback(
        (clientId: string) => getVisibleTasksForUser(state.tasks, state.currentUser).filter(t => t.client_id === clientId),
        [state.currentUser, state.tasks]
    );

    const getLicensesByClient = useCallback((clientId: string) => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client || !canViewClient(state.currentUser, client)) {
            return [];
        }
        return state.licenses.filter(l => l.client_id === clientId);
    }, [state.clients, state.currentUser, state.licenses]);

    const getClientTaxProfile = useCallback((clientId: string) => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client || !canViewClient(state.currentUser, client)) {
            return undefined;
        }

        const licenses = state.licenses.filter((license) => license.client_id === clientId);
        return buildTaxProfile({ client, licenses });
    }, [state.clients, state.currentUser, state.licenses]);

    const getClientObligations = useCallback((clientId: string) => {
        const profile = getClientTaxProfile(clientId);
        if (!profile) return [];
        return resolveObligations(profile);
    }, [getClientTaxProfile]);

    const getBillingPlansByClient = useCallback((clientId: string) => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client || !canViewClient(state.currentUser, client)) {
            return [];
        }

        return state.billingPlans
            .filter((plan) => plan.client_id === clientId)
            .map((plan) => ({
                ...plan,
                client,
            }));
    }, [state.billingPlans, state.clients, state.currentUser]);

    const getInvoicesByClient = useCallback((clientId: string) => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client || !canViewClient(state.currentUser, client)) {
            return [];
        }

        return state.invoices
            .filter((invoice) => invoice.client_id === clientId)
            .map((invoice) => normalizeInvoiceStatus({
                ...invoice,
                client,
                billing_plan: invoice.billing_plan_id
                    ? state.billingPlans.find((plan) => plan.id === invoice.billing_plan_id)
                    : undefined,
                allocations: state.paymentAllocations.filter((allocation) => allocation.invoice_id === invoice.id),
            }));
    }, [state.billingPlans, state.clients, state.currentUser, state.invoices, state.paymentAllocations]);

    const getPaymentsByClient = useCallback((clientId: string) => {
        const client = state.clients.find((item) => item.id === clientId);
        if (!client || !canViewClient(state.currentUser, client)) {
            return [];
        }

        return state.payments
            .filter((payment) => payment.client_id === clientId)
            .map((payment) => ({
                ...payment,
                client,
            }));
    }, [state.clients, state.currentUser, state.payments]);

    const getActivityForTask = useCallback((taskId: string) => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task || !canOperateTask(state.currentUser, task)) {
            return [];
        }
        return state.activityLog.filter(a => a.task_id === taskId);
    }, [state.activityLog, state.currentUser, state.tasks]);

    return (
        <AppContext.Provider value={{
            state, dispatch,
            setCurrentUser,
            addProfile, updateProfile, deactivateProfile, regeneratePassword,
            addClient, updateClient, archiveClient, updateTaxRulebook,
            addLicense, updateLicense, deleteLicense,
            addBillingPlan, updateBillingPlan, addInvoice, updateInvoice, registerPayment, updatePayment,
            addTask, updateTask, deleteTask, moveTask,
            addSubtask, toggleSubtask, deleteSubtask,
            addComment, logActivity,
            getTaskById, getClientById, getLicenseById, getProfileById,
            getTasksByStatus, getTasksByAssignee, getTasksByClient,
            getLicensesByClient, getClientTaxProfile, getClientObligations,
            getBillingPlansByClient, getInvoicesByClient, getPaymentsByClient,
            getActivityForTask,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
}
