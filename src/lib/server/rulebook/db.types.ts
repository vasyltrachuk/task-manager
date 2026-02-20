import type { Database as BaseDatabase, Json } from '@/lib/database.types';

type BaseClients = BaseDatabase['public']['Tables']['clients'];

interface RulebookVersionsTable {
  Row: {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description: string | null;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    tenant_id: string;
    code: string;
    name: string;
    description?: string | null;
    is_active?: boolean;
    effective_from: string;
    effective_to?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    tenant_id?: string;
    code?: string;
    name?: string;
    description?: string | null;
    is_active?: boolean;
    effective_from?: string;
    effective_to?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'rulebook_versions_created_by_fkey';
      columns: ['created_by'];
      isOneToOne: false;
      referencedRelation: 'profiles';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_versions_tenant_id_fkey';
      columns: ['tenant_id'];
      isOneToOne: false;
      referencedRelation: 'tenants';
      referencedColumns: ['id'];
    },
  ];
}

interface RulebookRulesTable {
  Row: {
    id: string;
    tenant_id: string;
    version_id: string;
    code: string;
    title: string;
    is_active: boolean;
    match_condition: Json;
    recurrence: Json;
    due_rule: Json;
    task_template: Json;
    legal_basis: string[];
    sort_order: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    tenant_id: string;
    version_id: string;
    code: string;
    title: string;
    is_active?: boolean;
    match_condition?: Json;
    recurrence: Json;
    due_rule: Json;
    task_template: Json;
    legal_basis?: string[];
    sort_order?: number;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    tenant_id?: string;
    version_id?: string;
    code?: string;
    title?: string;
    is_active?: boolean;
    match_condition?: Json;
    recurrence?: Json;
    due_rule?: Json;
    task_template?: Json;
    legal_basis?: string[];
    sort_order?: number;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'rulebook_rules_created_by_fkey';
      columns: ['created_by'];
      isOneToOne: false;
      referencedRelation: 'profiles';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_rules_tenant_id_fkey';
      columns: ['tenant_id'];
      isOneToOne: false;
      referencedRelation: 'tenants';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_rules_version_id_fkey';
      columns: ['version_id'];
      isOneToOne: false;
      referencedRelation: 'rulebook_versions';
      referencedColumns: ['id'];
    },
  ];
}

interface RulebookRuleOverridesTable {
  Row: {
    id: string;
    tenant_id: string;
    client_id: string;
    rule_id: string;
    is_enabled: boolean;
    due_rule_override: Json | null;
    task_template_override: Json | null;
    reason: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    tenant_id: string;
    client_id: string;
    rule_id: string;
    is_enabled?: boolean;
    due_rule_override?: Json | null;
    task_template_override?: Json | null;
    reason?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    tenant_id?: string;
    client_id?: string;
    rule_id?: string;
    is_enabled?: boolean;
    due_rule_override?: Json | null;
    task_template_override?: Json | null;
    reason?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'rulebook_rule_overrides_client_id_fkey';
      columns: ['client_id'];
      isOneToOne: false;
      referencedRelation: 'clients';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_rule_overrides_created_by_fkey';
      columns: ['created_by'];
      isOneToOne: false;
      referencedRelation: 'profiles';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_rule_overrides_rule_id_fkey';
      columns: ['rule_id'];
      isOneToOne: false;
      referencedRelation: 'rulebook_rules';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_rule_overrides_tenant_id_fkey';
      columns: ['tenant_id'];
      isOneToOne: false;
      referencedRelation: 'tenants';
      referencedColumns: ['id'];
    },
  ];
}

interface RulebookTaskGenerationsTable {
  Row: {
    id: string;
    tenant_id: string;
    client_id: string;
    rule_id: string;
    period_key: string;
    scheduled_due_date: string;
    generated_task_id: string | null;
    status: string;
    error_message: string | null;
    generation_context: Json;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    tenant_id: string;
    client_id: string;
    rule_id: string;
    period_key: string;
    scheduled_due_date: string;
    generated_task_id?: string | null;
    status?: string;
    error_message?: string | null;
    generation_context?: Json;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    tenant_id?: string;
    client_id?: string;
    rule_id?: string;
    period_key?: string;
    scheduled_due_date?: string;
    generated_task_id?: string | null;
    status?: string;
    error_message?: string | null;
    generation_context?: Json;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'rulebook_task_generations_client_id_fkey';
      columns: ['client_id'];
      isOneToOne: false;
      referencedRelation: 'clients';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_task_generations_generated_task_id_fkey';
      columns: ['generated_task_id'];
      isOneToOne: false;
      referencedRelation: 'tasks';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_task_generations_rule_id_fkey';
      columns: ['rule_id'];
      isOneToOne: false;
      referencedRelation: 'rulebook_rules';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'rulebook_task_generations_tenant_id_fkey';
      columns: ['tenant_id'];
      isOneToOne: false;
      referencedRelation: 'tenants';
      referencedColumns: ['id'];
    },
  ];
}

type ExtendedClientsTable = {
  Row: BaseClients['Row'] & {
    additional_tax_tags: string[] | null;
    timezone: string | null;
    payroll_frequency: string | null;
    payroll_advance_day: number | null;
    payroll_final_day: number | null;
  };
  Insert: BaseClients['Insert'] & {
    additional_tax_tags?: string[] | null;
    timezone?: string | null;
    payroll_frequency?: string | null;
    payroll_advance_day?: number | null;
    payroll_final_day?: number | null;
  };
  Update: BaseClients['Update'] & {
    additional_tax_tags?: string[] | null;
    timezone?: string | null;
    payroll_frequency?: string | null;
    payroll_advance_day?: number | null;
    payroll_final_day?: number | null;
  };
  Relationships: BaseClients['Relationships'];
};

export type RulebookDatabase = Omit<BaseDatabase, 'public'> & {
  public: Omit<BaseDatabase['public'], 'Tables'> & {
    Tables: Omit<BaseDatabase['public']['Tables'], 'clients'> & {
      clients: ExtendedClientsTable;
      rulebook_versions: RulebookVersionsTable;
      rulebook_rules: RulebookRulesTable;
      rulebook_rule_overrides: RulebookRuleOverridesTable;
      rulebook_task_generations: RulebookTaskGenerationsTable;
    };
  };
};
