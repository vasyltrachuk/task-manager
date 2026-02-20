-- Update clients table to support additional tax tags
ALTER TABLE clients
ADD COLUMN additional_tax_tags text[] DEFAULT '{}';

-- Create task_templates table
CREATE TABLE task_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  title             text NOT NULL,      -- e.g., "VAT Payment"
  description       text,               
  task_type         text NOT NULL DEFAULT 'report', -- 'report', 'payment', 'other'
  
  -- Targeting conditions (null means applies to all)
  target_legal_forms text[],            -- e.g., ['FOP', 'LLC']
  target_tax_systems text[],            -- e.g., ['single_3', 'general']
  require_vat       boolean,            -- true (VAT only), false (non-VAT only), null (any)
  require_employees boolean,            -- true (>0 employees), false (0), null (any)
  
  -- Scheduling and settings
  recurrence        text NOT NULL,      -- 'monthly', 'quarterly', 'yearly', 'once'
  due_date_rule     text NOT NULL,      -- e.g., '20th_of_next_month'
  priority          smallint DEFAULT 2,
  is_active         boolean DEFAULT true,
  
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  created_by        uuid REFERENCES profiles(id)
);

-- RLS policies
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_task_templates_tenant ON task_templates(tenant_id);

CREATE POLICY "tenant_isolation" ON task_templates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
