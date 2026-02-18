export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          meta: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          meta?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          meta?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          cadence: string
          client_id: string
          created_at: string
          currency: string
          due_day: number
          fee_minor: number
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cadence?: string
          client_id: string
          created_at?: string
          currency?: string
          due_day?: number
          fee_minor: number
          id?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          client_id?: string
          created_at?: string
          currency?: string
          due_day?: number
          fee_minor?: number
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accountants: {
        Row: {
          accountant_id: string
          client_id: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          accountant_id: string
          client_id: string
          is_primary?: boolean
          tenant_id: string
        }
        Update: {
          accountant_id?: string
          client_id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_accountants_accountant_id_fkey"
            columns: ["accountant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_accountants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_accountants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          employee_count: number | null
          id: string
          income_limit: number | null
          income_limit_source: string | null
          industry: string | null
          is_vat_payer: boolean
          name: string
          notes: string | null
          status: string
          tax_id: string
          tax_id_type: string
          tax_system: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_count?: number | null
          id?: string
          income_limit?: number | null
          income_limit_source?: string | null
          industry?: string | null
          is_vat_payer?: boolean
          name: string
          notes?: string | null
          status?: string
          tax_id: string
          tax_id_type?: string
          tax_system?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_count?: number | null
          id?: string
          income_limit?: number | null
          income_limit_source?: string | null
          industry?: string | null
          is_vat_payer?: boolean
          name?: string
          notes?: string | null
          status?: string
          tax_id?: string
          tax_id_type?: string
          tax_system?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          profile_id: string
          role: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_accountant_id: string | null
          bot_id: string
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          status: string
          telegram_contact_id: string
          tenant_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_accountant_id?: string | null
          bot_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string
          telegram_contact_id: string
          tenant_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_accountant_id?: string | null
          bot_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string
          telegram_contact_id?: string
          tenant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_accountant_id_fkey"
            columns: ["assigned_accountant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "tenant_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_telegram_contact_id_fkey"
            columns: ["telegram_contact_id"]
            isOneToOne: false
            referencedRelation: "telegram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          doc_type: string | null
          file_name: string
          id: string
          mime: string | null
          origin_attachment_id: string | null
          size_bytes: number | null
          storage_path: string
          tags: string[] | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          file_name: string
          id?: string
          mime?: string | null
          origin_attachment_id?: string | null
          size_bytes?: number | null
          storage_path: string
          tags?: string[] | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          file_name?: string
          id?: string
          mime?: string | null
          origin_attachment_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tags?: string[] | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_origin_attachment_id_fkey"
            columns: ["origin_attachment_id"]
            isOneToOne: false
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due_minor: number
          amount_paid_minor: number
          billing_plan_id: string | null
          client_id: string
          created_at: string
          currency: string
          due_date: string
          id: string
          issued_at: string
          notes: string | null
          period: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_due_minor: number
          amount_paid_minor?: number
          billing_plan_id?: string | null
          client_id: string
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          issued_at?: string
          notes?: string | null
          period: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_due_minor?: number
          amount_paid_minor?: number
          billing_plan_id?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          issued_at?: string
          notes?: string | null
          period?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_plan_id_fkey"
            columns: ["billing_plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          client_id: string
          created_at: string
          id: string
          issued_at: string
          issuing_authority: string
          last_check_result: string
          last_checked_at: string | null
          next_check_due: string | null
          next_payment_due: string | null
          notes: string | null
          number: string
          payment_frequency: string
          place_of_activity: string | null
          responsible_id: string
          status: string
          tenant_id: string
          type: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          issued_at: string
          issuing_authority: string
          last_check_result?: string
          last_checked_at?: string | null
          next_check_due?: string | null
          next_payment_due?: string | null
          notes?: string | null
          number: string
          payment_frequency?: string
          place_of_activity?: string | null
          responsible_id: string
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          issued_at?: string
          issuing_authority?: string
          last_check_result?: string
          last_checked_at?: string | null
          next_check_due?: string | null
          next_payment_due?: string | null
          notes?: string | null
          number?: string
          payment_frequency?: string
          place_of_activity?: string | null
          responsible_id?: string
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          message_id: string
          mime: string | null
          size_bytes: number | null
          storage_path: string
          telegram_file_id: string | null
          telegram_file_unique_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          mime?: string | null
          size_bytes?: number | null
          storage_path: string
          telegram_file_id?: string | null
          telegram_file_unique_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path?: string
          telegram_file_id?: string | null
          telegram_file_unique_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          sender_profile_id: string | null
          source: string
          status: string
          telegram_message_id: number | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          sender_profile_id?: string | null
          source?: string
          status?: string
          telegram_message_id?: number | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          sender_profile_id?: string | null
          source?: string
          status?: string
          telegram_message_id?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          client_id: string
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          method: string
          notes: string | null
          paid_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          client_id: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          client_id?: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: string
          tenant_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_customers: {
        Row: {
          created_at: string
          id: string
          provider: string
          provider_account_id: string | null
          provider_customer_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          provider_account_id?: string | null
          provider_customer_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          provider_account_id?: string | null
          provider_customer_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_entitlements: {
        Row: {
          created_at: string
          feature_key: string
          is_enabled: boolean
          limit_value: number | null
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          is_enabled?: boolean
          limit_value?: number | null
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          is_enabled?: boolean
          limit_value?: number | null
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plan_features: {
        Row: {
          created_at: string
          feature_key: string
          is_enabled: boolean
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          is_enabled?: boolean
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          is_enabled?: boolean
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          monthly_price_minor: number
          name: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price_minor?: number
          name: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price_minor?: number
          name?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      saas_subscription_events: {
        Row: {
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string
          received_at: string
          tenant_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
          tenant_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string
          provider_subscription_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider: string
          provider_subscription_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string
          provider_subscription_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          id: string
          is_completed: boolean
          sort_order: number
          task_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          id?: string
          is_completed?: boolean
          sort_order?: number
          task_id: string
          tenant_id: string
          title: string
        }
        Update: {
          id?: string
          is_completed?: boolean
          sort_order?: number
          task_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
          tenant_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_documents: {
        Row: {
          document_id: string
          linked_at: string
          linked_by: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          document_id: string
          linked_at?: string
          linked_by: string
          task_id: string
          tenant_id: string
        }
        Update: {
          document_id?: string
          linked_at?: string
          linked_by?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_documents_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime: string
          size_bytes: number | null
          storage_path: string
          task_id: string
          tenant_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime: string
          size_bytes?: number | null
          storage_path: string
          task_id: string
          tenant_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          tenant_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string
          id: string
          period: string | null
          priority: number
          proof_required: boolean
          recurrence: string
          recurrence_days: number[] | null
          status: string
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assignee_id: string
          client_id: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date: string
          id?: string
          period?: string | null
          priority?: number
          proof_required?: boolean
          recurrence?: string
          recurrence_days?: number[] | null
          status?: string
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string
          id?: string
          period?: string | null
          priority?: number
          proof_required?: boolean
          recurrence?: string
          recurrence_days?: number[] | null
          status?: string
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rulebook_configs: {
        Row: {
          id: string
          minimum_wage_on_january_1: number
          single_tax_multipliers: Json
          tenant_id: string
          vat_registration_threshold: number
          year: number
        }
        Insert: {
          id?: string
          minimum_wage_on_january_1: number
          single_tax_multipliers: Json
          tenant_id: string
          vat_registration_threshold: number
          year: number
        }
        Update: {
          id?: string
          minimum_wage_on_january_1?: number
          single_tax_multipliers?: Json
          tenant_id?: string
          vat_registration_threshold?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rulebook_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_contacts: {
        Row: {
          bot_id: string
          chat_id: number
          client_id: string | null
          created_at: string
          first_name: string | null
          id: string
          is_blocked: boolean
          last_name: string | null
          phone: string | null
          telegram_user_id: number
          tenant_id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          bot_id: string
          chat_id: number
          client_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_user_id: number
          tenant_id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          bot_id?: string
          chat_id?: number
          client_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_user_id?: number
          tenant_id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_contacts_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "tenant_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_updates_raw: {
        Row: {
          bot_id: string
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          update_id: number
        }
        Insert: {
          bot_id: string
          error?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          update_id: number
        }
        Update: {
          bot_id?: string
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          update_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_updates_raw_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "tenant_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_bots: {
        Row: {
          bot_username: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          public_id: string
          tenant_id: string
          token_encrypted: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          bot_username?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          public_id?: string
          tenant_id: string
          token_encrypted: string
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          bot_username?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          public_id?: string
          tenant_id?: string
          token_encrypted?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          is_active: boolean
          joined_at: string
          profile_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          is_active?: boolean
          joined_at?: string
          profile_id: string
          role?: string
          tenant_id: string
        }
        Update: {
          is_active?: boolean
          joined_at?: string
          profile_id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_saas_subscription_status: {
        Args: { target_tenant?: string }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      has_active_saas_subscription: {
        Args: { target_tenant?: string }
        Returns: boolean
      }
      is_active_subscription_status: {
        Args: { status_text: string }
        Returns: boolean
      }
      is_saas_feature_enabled: {
        Args: { feature: string; target_tenant?: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
