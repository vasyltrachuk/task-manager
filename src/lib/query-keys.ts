export const queryKeys = {
  profiles: {
    all: ['profiles'] as const,
    detail: (id: string) => ['profiles', id] as const,
  },

  clients: {
    all: ['clients'] as const,
    detail: (id: string) => ['clients', id] as const,
  },

  tasks: {
    all: ['tasks'] as const,
    detail: (id: string) => ['tasks', id] as const,
    byClient: (clientId: string) => ['tasks', 'client', clientId] as const,
  },

  licenses: {
    all: ['licenses'] as const,
    byClient: (clientId: string) => ['licenses', 'client', clientId] as const,
  },

  billingPlans: {
    all: ['billingPlans'] as const,
    byClient: (clientId: string) => ['billingPlans', 'client', clientId] as const,
  },

  invoices: {
    all: ['invoices'] as const,
    byClient: (clientId: string) => ['invoices', 'client', clientId] as const,
  },

  payments: {
    all: ['payments'] as const,
    byClient: (clientId: string) => ['payments', 'client', clientId] as const,
  },

  paymentAllocations: {
    all: ['paymentAllocations'] as const,
    byInvoice: (invoiceId: string) => ['paymentAllocations', 'invoice', invoiceId] as const,
  },

  activityLog: {
    byTask: (taskId: string) => ['activityLog', 'task', taskId] as const,
    byTasks: (taskIds: readonly string[]) => ['activityLog', 'tasks', ...taskIds] as const,
  },

  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', id] as const,
    messages: (conversationId: string) => ['conversations', conversationId, 'messages'] as const,
    unreadTotal: ['conversations', 'unreadTotal'] as const,
  },

  documents: {
    byClient: (clientId: string) => ['documents', 'client', clientId] as const,
  },

  rulebook: {
    activeVersion: ['rulebook', 'activeVersion'] as const,
    rules: ['rulebook', 'rules'] as const,
  },
} as const;
