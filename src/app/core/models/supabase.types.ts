export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          inventory_item_id: string | null
          notes: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "activity_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          booked_at: string | null
          booking_date: string
          counterparty_iban: string | null
          counterparty_name: string
          created_at: string
          currency: string
          id: string
          match_json: Json | null
          notes: string | null
          purpose: string
          source_format: string | null
          status: string
          value_date: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          booked_at?: string | null
          booking_date: string
          counterparty_iban?: string | null
          counterparty_name: string
          created_at?: string
          currency?: string
          id?: string
          match_json?: Json | null
          notes?: string | null
          purpose: string
          source_format?: string | null
          status?: string
          value_date?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          booked_at?: string | null
          booking_date?: string
          counterparty_iban?: string | null
          counterparty_name?: string
          created_at?: string
          currency?: string
          id?: string
          match_json?: Json | null
          notes?: string | null
          purpose?: string
          source_format?: string | null
          status?: string
          value_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_application_attempts: {
        Row: {
          created_at: string
          id: number
          origin_hash: string
        }
        Insert: {
          created_at?: string
          id?: never
          origin_hash: string
        }
        Update: {
          created_at?: string
          id?: never
          origin_hash?: string
        }
        Relationships: []
      }
      beta_applications: {
        Row: {
          consent_at: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          email: string
          first_name: string
          granted_days: number | null
          id: string
          last_name: string
          status: string
        }
        Insert: {
          consent_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          email: string
          first_name: string
          granted_days?: number | null
          id?: string
          last_name: string
          status?: string
        }
        Update: {
          consent_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          email?: string
          first_name?: string
          granted_days?: number | null
          id?: string
          last_name?: string
          status?: string
        }
        Relationships: []
      }
      business_events: {
        Row: {
          actor_id: string | null
          changes: Json
          correlation_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          changes?: Json
          correlation_id?: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          changes?: Json
          correlation_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_configs: {
        Row: {
          created_at: string
          dhl_api_key: string | null
          dhl_ekp: string | null
          dhl_enabled: boolean
          hermes_api_key: string | null
          hermes_client_id: string | null
          hermes_enabled: boolean
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dhl_api_key?: string | null
          dhl_ekp?: string | null
          dhl_enabled?: boolean
          hermes_api_key?: string | null
          hermes_client_id?: string | null
          hermes_enabled?: boolean
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          dhl_api_key?: string | null
          dhl_ekp?: string | null
          dhl_enabled?: boolean
          hermes_api_key?: string | null
          hermes_client_id?: string | null
          hermes_enabled?: boolean
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_wallet_sessions: {
        Row: {
          current_cash: number
          estimated_total_resale: number
          id: string
          is_active: boolean
          items_count: number
          location_name: string | null
          start_cash: number
          started_at: string
          total_spent: number
          workspace_id: string
        }
        Insert: {
          current_cash?: number
          estimated_total_resale?: number
          id?: string
          is_active?: boolean
          items_count?: number
          location_name?: string | null
          start_cash?: number
          started_at?: string
          total_spent?: number
          workspace_id: string
        }
        Update: {
          current_cash?: number
          estimated_total_resale?: number
          id?: string
          is_active?: boolean
          items_count?: number
          location_name?: string | null
          start_cash?: number
          started_at?: string
          total_spent?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_wallet_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_media: {
        Row: {
          catalog_product_id: string
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          is_primary: boolean
          mime_type: string | null
          sort_order: number
          storage_path: string
          workspace_id: string
        }
        Insert: {
          catalog_product_id: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string | null
          sort_order?: number
          storage_path: string
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string | null
          sort_order?: number
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_media_workspace_id_catalog_product_id_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "catalog_product_media_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          brand: string | null
          category: string | null
          condition: string | null
          condition_notes: string | null
          created_at: string
          description: string | null
          ean: string | null
          id: string
          is_public_store: boolean
          listing_price: number | null
          model: string | null
          title: string
          tracking_mode: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          is_public_store?: boolean
          listing_price?: number | null
          model?: string | null
          title: string
          tracking_mode?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          is_public_store?: boolean
          listing_price?: number | null
          model?: string | null
          title?: string
          tracking_mode?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_confirmations: {
        Row: {
          id: string
          invoice_number: string | null
          order_number: string | null
          recipient_email: string
          recipient_name: string
          sent_at: string
          status: string
          subject: string
          workspace_id: string
        }
        Insert: {
          id?: string
          invoice_number?: string | null
          order_number?: string | null
          recipient_email: string
          recipient_name: string
          sent_at?: string
          status?: string
          subject: string
          workspace_id: string
        }
        Update: {
          id?: string
          invoice_number?: string | null
          order_number?: string | null
          recipient_email?: string
          recipient_name?: string
          sent_at?: string
          status?: string
          subject?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_confirmations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          allocated_purchase_cost: number
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          category: string | null
          condition: string
          created_at: string
          description: string | null
          dimension_height_cm: number | null
          dimension_length_cm: number | null
          dimension_width_cm: number | null
          ean: string | null
          expected_value: number | null
          id: string
          is_public_store: boolean
          model: string | null
          purchase_id: string | null
          purchase_line_id: string | null
          sku: string | null
          status: string
          tax_mode_override: string | null
          title: string
          updated_at: string
          weight_g: number | null
          workspace_id: string
        }
        Insert: {
          allocated_purchase_cost?: number
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          category?: string | null
          condition?: string
          created_at?: string
          description?: string | null
          dimension_height_cm?: number | null
          dimension_length_cm?: number | null
          dimension_width_cm?: number | null
          ean?: string | null
          expected_value?: number | null
          id?: string
          is_public_store?: boolean
          model?: string | null
          purchase_id?: string | null
          purchase_line_id?: string | null
          sku?: string | null
          status?: string
          tax_mode_override?: string | null
          title: string
          updated_at?: string
          weight_g?: number | null
          workspace_id: string
        }
        Update: {
          allocated_purchase_cost?: number
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          category?: string | null
          condition?: string
          created_at?: string
          description?: string | null
          dimension_height_cm?: number | null
          dimension_length_cm?: number | null
          dimension_width_cm?: number | null
          ean?: string | null
          expected_value?: number | null
          id?: string
          is_public_store?: boolean
          model?: string | null
          purchase_id?: string | null
          purchase_line_id?: string | null
          sku?: string | null
          status?: string
          tax_mode_override?: string | null
          title?: string
          updated_at?: string
          weight_g?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_purchase_line_id_fkey"
            columns: ["purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_workspace_purchase_line_fkey"
            columns: ["workspace_id", "purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_reconciliation_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          inventory_item_id: string
          new_status: string
          previous_status: string
          reason: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          inventory_item_id: string
          new_status: string
          previous_status: string
          reason: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          inventory_item_id?: string
          new_status?: string
          previous_status?: string
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_even_workspace_id_inventory_item__fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_even_workspace_id_inventory_item__fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          condition: string | null
          id: string
          invoice_id: string
          quantity: number
          sku: string | null
          title: string
          total_price: number
          unit_price: number
        }
        Insert: {
          condition?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          sku?: string | null
          title: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          condition?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          sku?: string | null
          title?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer: Json
          created_at: string
          delivery_date: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_number: string
          payment_due_date: string | null
          payment_method: string | null
          payment_status: string
          sale_id: string | null
          seller: Json
          shipping_cost: number
          store_order_id: string | null
          subtotal: number
          tax_clause: string | null
          tax_mode: string
          total: number
          workspace_id: string
        }
        Insert: {
          buyer?: Json
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          order_number: string
          payment_due_date?: string | null
          payment_method?: string | null
          payment_status?: string
          sale_id?: string | null
          seller?: Json
          shipping_cost?: number
          store_order_id?: string | null
          subtotal?: number
          tax_clause?: string | null
          tax_mode?: string
          total?: number
          workspace_id: string
        }
        Update: {
          buyer?: Json
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_number?: string
          payment_due_date?: string | null
          payment_method?: string | null
          payment_status?: string
          sale_id?: string | null
          seller?: Json
          shipping_cost?: number
          store_order_id?: string | null
          subtotal?: number
          tax_clause?: string | null
          tax_mode?: string
          total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_sale_fkey"
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "invoices_workspace_store_order_fkey"
            columns: ["workspace_id", "store_order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      item_costs: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          inventory_item_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_costs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "item_costs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_media: {
        Row: {
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          inventory_item_id: string
          is_primary: boolean
          mime_type: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          inventory_item_id: string
          is_primary?: boolean
          mime_type?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          inventory_item_id?: string
          is_primary?: boolean
          mime_type?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "item_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_drafts: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string
          platform: string
          price: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id: string
          platform: string
          price: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string
          platform?: string
          price?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_drafts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "listing_drafts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      market_research: {
        Row: {
          confidence_score: number | null
          created_at: string
          deal_score: number | null
          fair_value: number | null
          fast_sale_price: number | null
          id: string
          inventory_item_id: string | null
          max_buy_price: number | null
          query: string
          recommended_listing_price: number | null
          workspace_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          deal_score?: number | null
          fair_value?: number | null
          fast_sale_price?: number | null
          id?: string
          inventory_item_id?: string | null
          max_buy_price?: number | null
          query: string
          recommended_listing_price?: number | null
          workspace_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          deal_score?: number | null
          fair_value?: number | null
          fast_sale_price?: number | null
          id?: string
          inventory_item_id?: string | null
          max_buy_price?: number | null
          query?: string
          recommended_listing_price?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_research_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "market_research_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_research_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      number_assignments: {
        Row: {
          assigned_at: string
          entity_id: string
          entity_type: string
          format_snapshot: Json
          id: number
          record_number: string
          series_id: number
          series_version: number
          workspace_id: string
        }
        Insert: {
          assigned_at: string
          entity_id: string
          entity_type: string
          format_snapshot: Json
          id?: never
          record_number: string
          series_id: number
          series_version: number
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          entity_id?: string
          entity_type?: string
          format_snapshot?: Json
          id?: never
          record_number?: string
          series_id?: number
          series_version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_assignments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "number_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      number_series: {
        Row: {
          entity_type: string
          id: number
          include_year: boolean
          label: string
          minimum_digits: number
          prefix: string
          reset_yearly: boolean
          separator: string
          start_value: number
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          entity_type: string
          id?: never
          include_year?: boolean
          label: string
          minimum_digits?: number
          prefix: string
          reset_yearly?: boolean
          separator?: string
          start_value?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          entity_type?: string
          id?: never
          include_year?: boolean
          label?: string
          minimum_digits?: number
          prefix?: string
          reset_yearly?: boolean
          separator?: string
          start_value?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_series_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      number_series_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          configuration: Json
          id: number
          series_id: number
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          configuration: Json
          id?: never
          series_id: number
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          configuration?: Json
          id?: never
          series_id?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_series_changes_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "number_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_series_changes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      number_series_counters: {
        Row: {
          id: number
          last_value: number
          period: number
          series_id: number
        }
        Insert: {
          id?: never
          last_value: number
          period: number
          series_id: number
        }
        Update: {
          id?: never
          last_value?: number
          period?: number
          series_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "number_series_counters_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "number_series"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_purchase_entries: {
        Row: {
          captured_at: string
          category: string | null
          condition: string | null
          created_at: string
          estimated_resale_price: number
          id: string
          location_name: string
          notes: string | null
          photo_data_url: string | null
          purchase_price: number
          sync_status: string
          title: string
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          category?: string | null
          condition?: string | null
          created_at?: string
          estimated_resale_price?: number
          id?: string
          location_name?: string
          notes?: string | null
          photo_data_url?: string | null
          purchase_price?: number
          sync_status?: string
          title: string
          workspace_id: string
        }
        Update: {
          captured_at?: string
          category?: string | null
          condition?: string | null
          created_at?: string
          estimated_resale_price?: number
          id?: string
          location_name?: string
          notes?: string | null
          photo_data_url?: string | null
          purchase_price?: number
          sync_status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_purchase_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_operators: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_tracked_items: {
        Row: {
          alert_triggered: string
          category: string | null
          created_at: string
          current_market_average: number
          current_market_lowest: number
          current_our_price: number
          id: string
          inventory_item_id: string | null
          is_tracking_active: boolean
          last_checked_at: string
          lowest_competitor_platform: string | null
          lowest_competitor_title: string | null
          lowest_competitor_url: string | null
          price_difference_percent: number
          price_history: Json
          price_trend: string
          recommended_price: number
          title: string
          workspace_id: string
        }
        Insert: {
          alert_triggered?: string
          category?: string | null
          created_at?: string
          current_market_average?: number
          current_market_lowest?: number
          current_our_price?: number
          id?: string
          inventory_item_id?: string | null
          is_tracking_active?: boolean
          last_checked_at?: string
          lowest_competitor_platform?: string | null
          lowest_competitor_title?: string | null
          lowest_competitor_url?: string | null
          price_difference_percent?: number
          price_history?: Json
          price_trend?: string
          recommended_price?: number
          title: string
          workspace_id: string
        }
        Update: {
          alert_triggered?: string
          category?: string | null
          created_at?: string
          current_market_average?: number
          current_market_lowest?: number
          current_our_price?: number
          id?: string
          inventory_item_id?: string | null
          is_tracking_active?: boolean
          last_checked_at?: string
          lowest_competitor_platform?: string | null
          lowest_competitor_title?: string | null
          lowest_competitor_url?: string | null
          price_difference_percent?: number
          price_history?: Json
          price_trend?: string
          recommended_price?: number
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tracked_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "price_tracked_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tracked_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_costs: {
        Row: {
          allocation_method: string
          amount: number
          created_at: string
          description: string | null
          id: string
          purchase_id: string
          target_purchase_line_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          allocation_method?: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          purchase_id: string
          target_purchase_line_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          allocation_method?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          purchase_id?: string
          target_purchase_line_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_costs_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_costs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_costs_workspace_purchase_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_costs_workspace_target_purchase_line_fkey"
            columns: ["workspace_id", "target_purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          allocated_additional_cost: number
          allocated_total_cost: number
          catalog_product_id: string | null
          condition_snapshot: string | null
          created_at: string
          ean_snapshot: string | null
          estimated_market_value: number | null
          id: string
          line_kind: string
          line_total: number | null
          ordered_quantity: number
          price_mode: string
          purchase_id: string
          received_quantity: number
          title_snapshot: string
          unit_purchase_price: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_additional_cost?: number
          allocated_total_cost?: number
          catalog_product_id?: string | null
          condition_snapshot?: string | null
          created_at?: string
          ean_snapshot?: string | null
          estimated_market_value?: number | null
          id?: string
          line_kind: string
          line_total?: number | null
          ordered_quantity: number
          price_mode?: string
          purchase_id: string
          received_quantity?: number
          title_snapshot: string
          unit_purchase_price?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_additional_cost?: number
          allocated_total_cost?: number
          catalog_product_id?: string | null
          condition_snapshot?: string | null
          created_at?: string
          ean_snapshot?: string | null
          estimated_market_value?: number | null
          id?: string
          line_kind?: string
          line_total?: number | null
          ordered_quantity?: number
          price_mode?: string
          purchase_id?: string
          received_quantity?: number
          title_snapshot?: string
          unit_purchase_price?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_workspace_catalog_product_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_workspace_purchase_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_receipt_requests: {
        Row: {
          created_at: string
          id: string
          purchase_id: string
          request_id: string
          request_lines: Json
          response: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id: string
          purchase_id: string
          request_id: string
          request_lines: Json
          response: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_id?: string
          request_id?: string
          request_lines?: Json
          response?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_requests_workspace_id_purchase_id_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchases: {
        Row: {
          arrived_at: string | null
          content_status: string
          cost_allocation_mode: string
          created_at: string
          discount_amount: number
          entry_status: string
          estimated_delivery: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          notes: string | null
          numbered_at: string | null
          numbering_series_id: number | null
          numbering_version: number | null
          original_url: string | null
          pricing_mode: string | null
          purchase_date: string
          purchase_price: number | null
          receiving_status: string
          record_number: string | null
          request_id: string | null
          shipment_status: string
          source_id: string | null
          supplier_id: string | null
          supplier_reference: string | null
          title: string
          total_purchase_cost: number | null
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          arrived_at?: string | null
          content_status?: string
          cost_allocation_mode?: string
          created_at?: string
          discount_amount?: number
          entry_status?: string
          estimated_delivery?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          numbered_at?: string | null
          numbering_series_id?: number | null
          numbering_version?: number | null
          original_url?: string | null
          pricing_mode?: string | null
          purchase_date?: string
          purchase_price?: number | null
          receiving_status?: string
          record_number?: string | null
          request_id?: string | null
          shipment_status?: string
          source_id?: string | null
          supplier_id?: string | null
          supplier_reference?: string | null
          title: string
          total_purchase_cost?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_status?: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          arrived_at?: string | null
          content_status?: string
          cost_allocation_mode?: string
          created_at?: string
          discount_amount?: number
          entry_status?: string
          estimated_delivery?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          numbered_at?: string | null
          numbering_series_id?: number | null
          numbering_version?: number | null
          original_url?: string | null
          pricing_mode?: string | null
          purchase_date?: string
          purchase_price?: number | null
          receiving_status?: string
          record_number?: string | null
          request_id?: string | null
          shipment_status?: string
          source_id?: string | null
          supplier_id?: string | null
          supplier_reference?: string | null
          title?: string
          total_purchase_cost?: number | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_numbering_series_id_fkey"
            columns: ["numbering_series_id"]
            isOneToOne: false
            referencedRelation: "number_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_workspace_source_fkey"
            columns: ["workspace_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchases_workspace_supplier_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      record_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          purchase_id: string | null
          sale_id: string | null
          workspace_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          purchase_id?: string | null
          sale_id?: string | null
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          purchase_id?: string | null
          sale_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_comments_purchase_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "record_comments_sale_fkey"
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "record_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_comparables: {
        Row: {
          condition: string | null
          created_at: string
          external_id: string | null
          id: string
          is_sold: boolean
          listed_at: string | null
          platform: string
          price: number
          research_id: string
          similarity_score: number
          sold_at: string | null
          title: string
          url: string | null
        }
        Insert: {
          condition?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          is_sold?: boolean
          listed_at?: string | null
          platform: string
          price: number
          research_id: string
          similarity_score?: number
          sold_at?: string | null
          title: string
          url?: string | null
        }
        Update: {
          condition?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          is_sold?: boolean
          listed_at?: string | null
          platform?: string
          price?: number
          research_id?: string
          similarity_score?: number
          sold_at?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_comparables_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "market_research"
            referencedColumns: ["id"]
          },
        ]
      }
      research_queries: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          max_price: number
          median_price: number
          min_price: number
          query_text: string
          result_count: number
          source: string
          workspace_id: string
        }
        Insert: {
          avg_price?: number
          created_at?: string
          id?: string
          max_price?: number
          median_price?: number
          min_price?: number
          query_text: string
          result_count?: number
          source?: string
          workspace_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          max_price?: number
          median_price?: number
          min_price?: number
          query_text?: string
          result_count?: number
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_queries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          buyer_name: string | null
          created_at: string
          credit_note_number: string
          id: string
          inventory_item_id: string | null
          is_full_refund: boolean
          notes: string | null
          reason: string
          refund_amount: number
          restock_action: string
          return_date: string
          sale_id: string
          workspace_id: string
        }
        Insert: {
          buyer_name?: string | null
          created_at?: string
          credit_note_number: string
          id?: string
          inventory_item_id?: string | null
          is_full_refund?: boolean
          notes?: string | null
          reason: string
          refund_amount?: number
          restock_action?: string
          return_date?: string
          sale_id: string
          workspace_id: string
        }
        Update: {
          buyer_name?: string | null
          created_at?: string
          credit_note_number?: string
          id?: string
          inventory_item_id?: string | null
          is_full_refund?: boolean
          notes?: string | null
          reason?: string
          refund_amount?: number
          restock_action?: string
          return_date?: string
          sale_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "returns_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_cost_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          sale_id: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          sale_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          sale_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_cost_entries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_entries_workspace_sale_fkey"
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      sale_line_lot_allocations: {
        Row: {
          active_allocated_cost: number | null
          allocated_cost: number
          consumption_sequence: number | null
          created_at: string
          id: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          unit_cost: number
          workspace_id: string
        }
        Insert: {
          active_allocated_cost?: number | null
          allocated_cost?: number
          consumption_sequence?: number | null
          created_at?: string
          id?: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          unit_cost: number
          workspace_id: string
        }
        Update: {
          active_allocated_cost?: number | null
          allocated_cost?: number
          consumption_sequence?: number | null
          created_at?: string
          id?: string
          quantity?: number
          sale_line_id?: string
          stock_lot_id?: string
          unit_cost?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_line_lot_allocations_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_line_lot_allocations_stock_lot_id_fkey"
            columns: ["stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_line_lot_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_line_lot_allocations_workspace_sale_line_fkey"
            columns: ["workspace_id", "sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "sale_line_lot_allocations_workspace_stock_lot_fkey"
            columns: ["workspace_id", "stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          catalog_product_id: string | null
          cost_of_goods_sold: number
          created_at: string
          id: string
          inventory_item_id: string | null
          line_total: number
          quantity: number
          sale_id: string
          tax_mode: string
          title_snapshot: string
          unit_sale_price: number
          workspace_id: string
        }
        Insert: {
          catalog_product_id?: string | null
          cost_of_goods_sold: number
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_total: number
          quantity: number
          sale_id: string
          tax_mode: string
          title_snapshot: string
          unit_sale_price: number
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string | null
          cost_of_goods_sold?: number
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          quantity?: number
          sale_id?: string
          tax_mode?: string
          title_snapshot?: string
          unit_sale_price?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_workspace_catalog_product_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "sale_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_workspace_inventory_item_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "sale_lines_workspace_inventory_item_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "sale_lines_workspace_sale_fkey"
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      sales: {
        Row: {
          buyer_notes: string | null
          created_at: string
          external_listing_id: string | null
          external_order_id: string | null
          id: string
          inventory_item_id: string | null
          numbered_at: string | null
          numbering_series_id: number | null
          numbering_version: number | null
          other_costs: number
          packaging_cost: number
          platform: string
          platform_fee: number
          record_number: string | null
          refund_amount: number | null
          returned_at: string | null
          sale_date: string
          sale_price: number
          sale_price_total: number | null
          shipping_cost: number
          shipping_mode: string | null
          shipping_revenue: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          workspace_id: string
        }
        Insert: {
          buyer_notes?: string | null
          created_at?: string
          external_listing_id?: string | null
          external_order_id?: string | null
          id?: string
          inventory_item_id?: string | null
          numbered_at?: string | null
          numbering_series_id?: number | null
          numbering_version?: number | null
          other_costs?: number
          packaging_cost?: number
          platform: string
          platform_fee?: number
          record_number?: string | null
          refund_amount?: number | null
          returned_at?: string | null
          sale_date?: string
          sale_price?: number
          sale_price_total?: number | null
          shipping_cost?: number
          shipping_mode?: string | null
          shipping_revenue?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          workspace_id: string
        }
        Update: {
          buyer_notes?: string | null
          created_at?: string
          external_listing_id?: string | null
          external_order_id?: string | null
          id?: string
          inventory_item_id?: string | null
          numbered_at?: string | null
          numbering_series_id?: number | null
          numbering_version?: number | null
          other_costs?: number
          packaging_cost?: number
          platform?: string
          platform_fee?: number
          record_number?: string | null
          refund_amount?: number | null
          returned_at?: string | null
          sale_date?: string
          sale_price?: number
          sale_price_total?: number | null
          shipping_cost?: number
          shipping_mode?: string | null
          shipping_revenue?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "sales_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_numbering_series_id_fkey"
            columns: ["numbering_series_id"]
            isOneToOne: false
            referencedRelation: "number_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_orders: {
        Row: {
          bundled_item_titles: string[] | null
          bundled_order_ids: string[] | null
          bundled_orders_snapshot: Json | null
          carrier: string
          carrier_transaction_id: string | null
          created_at: string
          customer: Json
          id: string
          is_bundled: boolean
          item_condition: string | null
          item_sku: string | null
          item_title: string
          label_price: number | null
          notes: string | null
          order_date: string
          order_number: string
          package_type: string
          platform: string
          sale_id: string | null
          sale_price: number
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          workspace_id: string
        }
        Insert: {
          bundled_item_titles?: string[] | null
          bundled_order_ids?: string[] | null
          bundled_orders_snapshot?: Json | null
          carrier?: string
          carrier_transaction_id?: string | null
          created_at?: string
          customer?: Json
          id?: string
          is_bundled?: boolean
          item_condition?: string | null
          item_sku?: string | null
          item_title: string
          label_price?: number | null
          notes?: string | null
          order_date?: string
          order_number: string
          package_type: string
          platform: string
          sale_id?: string | null
          sale_price?: number
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          workspace_id: string
        }
        Update: {
          bundled_item_titles?: string[] | null
          bundled_order_ids?: string[] | null
          bundled_orders_snapshot?: Json | null
          carrier?: string
          carrier_transaction_id?: string | null
          created_at?: string
          customer?: Json
          id?: string
          is_bundled?: boolean
          item_condition?: string | null
          item_sku?: string | null
          item_title?: string
          label_price?: number | null
          notes?: string | null
          order_date?: string
          order_number?: string
          package_type?: string
          platform?: string
          sale_id?: string | null
          sale_price?: number
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sniper_hits: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          listing_id: string
          notified_at: string | null
          reference_price: number
          reference_scope: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          id?: string
          listing_id: string
          notified_at?: string | null
          reference_price: number
          reference_scope?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          listing_id?: string
          notified_at?: string | null
          reference_price?: number
          reference_scope?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sniper_hits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "sniper_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sniper_hits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "sniper_query_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      sniper_listings: {
        Row: {
          brand: string | null
          catalog_id: number | null
          catalog_source_query_id: string | null
          condition: string | null
          country_code: string | null
          currency: string
          description: string | null
          discovered_by_query_id: string | null
          evaluated_at: string | null
          external_id: string
          first_seen_at: string
          id: string
          image_urls: string[]
          is_hidden: boolean
          item_price: number
          item_updated_at: string | null
          marketplace: string
          photo_uploaded_at: string | null
          seller_avatar_url: string | null
          seller_name: string | null
          seller_rating: number | null
          seller_review_count: number | null
          size: string | null
          title: string
          total_price: number
          url: string
          watchlist_evaluated_at: string | null
        }
        Insert: {
          brand?: string | null
          catalog_id?: number | null
          catalog_source_query_id?: string | null
          condition?: string | null
          country_code?: string | null
          currency?: string
          description?: string | null
          discovered_by_query_id?: string | null
          evaluated_at?: string | null
          external_id: string
          first_seen_at?: string
          id?: string
          image_urls?: string[]
          is_hidden?: boolean
          item_price: number
          item_updated_at?: string | null
          marketplace?: string
          photo_uploaded_at?: string | null
          seller_avatar_url?: string | null
          seller_name?: string | null
          seller_rating?: number | null
          seller_review_count?: number | null
          size?: string | null
          title: string
          total_price: number
          url: string
          watchlist_evaluated_at?: string | null
        }
        Update: {
          brand?: string | null
          catalog_id?: number | null
          catalog_source_query_id?: string | null
          condition?: string | null
          country_code?: string | null
          currency?: string
          description?: string | null
          discovered_by_query_id?: string | null
          evaluated_at?: string | null
          external_id?: string
          first_seen_at?: string
          id?: string
          image_urls?: string[]
          is_hidden?: boolean
          item_price?: number
          item_updated_at?: string | null
          marketplace?: string
          photo_uploaded_at?: string | null
          seller_avatar_url?: string | null
          seller_name?: string | null
          seller_rating?: number | null
          seller_review_count?: number | null
          size?: string | null
          title?: string
          total_price?: number
          url?: string
          watchlist_evaluated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sniper_listings_catalog_source_query_id_fkey"
            columns: ["catalog_source_query_id"]
            isOneToOne: false
            referencedRelation: "sniper_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sniper_listings_discovered_by_query_id_fkey"
            columns: ["discovered_by_query_id"]
            isOneToOne: false
            referencedRelation: "sniper_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      sniper_queries: {
        Row: {
          brand_id: number | null
          catalog_id: number | null
          consecutive_failures: number
          created_at: string
          id: string
          is_active: boolean
          is_seeded: boolean
          is_standard: boolean
          last_polled_at: string | null
          last_status: string
          marketplace: string
          notes: string | null
          poll_interval_ms: number
          price_from: number | null
          price_to: number | null
          query_key: string
          search_text: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: number | null
          catalog_id?: number | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_seeded?: boolean
          is_standard?: boolean
          last_polled_at?: string | null
          last_status?: string
          marketplace?: string
          notes?: string | null
          poll_interval_ms?: number
          price_from?: number | null
          price_to?: number | null
          query_key: string
          search_text?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: number | null
          catalog_id?: number | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_seeded?: boolean
          is_standard?: boolean
          last_polled_at?: string | null
          last_status?: string
          marketplace?: string
          notes?: string | null
          poll_interval_ms?: number
          price_from?: number | null
          price_to?: number | null
          query_key?: string
          search_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sniper_query_subscriptions: {
        Row: {
          created_at: string
          discount_threshold_percent: number
          id: string
          is_active: boolean
          query_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          discount_threshold_percent?: number
          id?: string
          is_active?: boolean
          query_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          discount_threshold_percent?: number
          id?: string
          is_active?: boolean
          query_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sniper_query_subscriptions_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "sniper_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sniper_query_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sniper_runtime_status: {
        Row: {
          id: number
          last_cycle_error: string | null
          rejected_last_minute: number
          reported_at: string
          request_budget: number
          requests_last_minute: number
        }
        Insert: {
          id: number
          last_cycle_error?: string | null
          rejected_last_minute: number
          reported_at: string
          request_budget: number
          requests_last_minute: number
        }
        Update: {
          id?: number
          last_cycle_error?: string | null
          rejected_last_minute?: number
          reported_at?: string
          request_budget?: number
          requests_last_minute?: number
        }
        Relationships: []
      }
      sniper_watchlist_hits: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          listing_id: string
          reference_price: number
          reference_scope: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          id?: string
          listing_id: string
          reference_price: number
          reference_scope: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          listing_id?: string
          reference_price?: number
          reference_scope?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sniper_watchlist_hits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "sniper_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sniper_watchlist_hits_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "sniper_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      sniper_watchlists: {
        Row: {
          brand: string | null
          catalog_id: number | null
          condition: string | null
          created_at: string
          discount_threshold_percent: number
          id: string
          is_active: boolean
          legacy_brand_id: number | null
          price_from: number | null
          price_to: number | null
          search_text: string | null
          starts_at: string
          title: string
          workspace_id: string
        }
        Insert: {
          brand?: string | null
          catalog_id?: number | null
          condition?: string | null
          created_at?: string
          discount_threshold_percent?: number
          id?: string
          is_active?: boolean
          legacy_brand_id?: number | null
          price_from?: number | null
          price_to?: number | null
          search_text?: string | null
          starts_at?: string
          title: string
          workspace_id: string
        }
        Update: {
          brand?: string | null
          catalog_id?: number | null
          condition?: string | null
          created_at?: string
          discount_threshold_percent?: number
          id?: string
          is_active?: boolean
          legacy_brand_id?: number | null
          price_from?: number | null
          price_to?: number | null
          search_text?: string | null
          starts_at?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sniper_watchlists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          type?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          catalog_product_id: string
          created_at: string
          id: string
          purchase_id: string
          purchase_line_id: string
          received_at: string
          received_quantity: number
          remaining_quantity: number
          unit_cost: number | null
          workspace_id: string
        }
        Insert: {
          catalog_product_id: string
          created_at?: string
          id?: string
          purchase_id: string
          purchase_line_id: string
          received_at?: string
          received_quantity: number
          remaining_quantity: number
          unit_cost?: number | null
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string
          created_at?: string
          id?: string
          purchase_id?: string
          purchase_line_id?: string
          received_at?: string
          received_quantity?: number
          remaining_quantity?: number
          unit_cost?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_purchase_line_id_fkey"
            columns: ["purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_workspace_catalog_product_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "stock_lots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_workspace_purchase_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "stock_lots_workspace_purchase_line_fkey"
            columns: ["workspace_id", "purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          direction: string
          id: string
          quantity: number
          reason: string
          sale_line_id: string | null
          stock_lot_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          quantity: number
          reason: string
          sale_line_id?: string | null
          stock_lot_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          quantity?: number
          reason?: string
          sale_line_id?: string | null
          stock_lot_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_lot_id_fkey"
            columns: ["stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_workspace_sale_line_fkey"
            columns: ["workspace_id", "sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_workspace_stock_lot_fkey"
            columns: ["workspace_id", "stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      store_order_items: {
        Row: {
          catalog_product_id: string | null
          id: string
          inventory_item_id: string | null
          item_title: string
          price: number
          quantity: number
          store_order_id: string
        }
        Insert: {
          catalog_product_id?: string | null
          id?: string
          inventory_item_id?: string | null
          item_title: string
          price?: number
          quantity?: number
          store_order_id: string
        }
        Update: {
          catalog_product_id?: string | null
          id?: string
          inventory_item_id?: string | null
          item_title?: string
          price?: number
          quantity?: number
          store_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_items_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "store_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_items_store_order_id_fkey"
            columns: ["store_order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          created_at: string
          customer: Json
          id: string
          order_number: string
          payment_id: string | null
          payment_method: string
          payment_status: string
          shipping_cost: number
          status: string
          subtotal: number
          total: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer?: Json
          id?: string
          order_number: string
          payment_id?: string | null
          payment_method?: string
          payment_status?: string
          shipping_cost?: number
          status?: string
          subtotal?: number
          total?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer?: Json
          id?: string
          order_number?: string
          payment_id?: string | null
          payment_method?: string
          payment_status?: string
          shipping_cost?: number
          status?: string
          subtotal?: number
          total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          banner_url: string | null
          created_at: string
          currency: string
          free_shipping_threshold: number
          id: string
          imprint: Json
          notice_text: string | null
          payments: Json
          shipping_flat_rate: number
          store_name: string
          tagline: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          currency?: string
          free_shipping_threshold?: number
          id?: string
          imprint?: Json
          notice_text?: string | null
          payments?: Json
          shipping_flat_rate?: number
          store_name?: string
          tagline?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          currency?: string
          free_shipping_threshold?: number
          id?: string
          imprint?: Json
          notice_text?: string | null
          payments?: Json
          shipping_flat_rate?: number
          store_name?: string
          tagline?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_extra: string | null
          city: string | null
          contact_info: string | null
          contact_person: string | null
          country: string | null
          country_code: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          profile_url: string | null
          seller_type: string | null
          street: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          address_extra?: string | null
          city?: string | null
          contact_info?: string | null
          contact_person?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_url?: string | null
          seller_type?: string | null
          street?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          address_extra?: string | null
          city?: string | null
          contact_info?: string | null
          contact_person?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_url?: string | null
          seller_type?: string | null
          street?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_advisor_configs: {
        Row: {
          advisor_email: string | null
          auto_send_on_first_of_month: boolean
          client_number: string | null
          consultant_number: string | null
          created_at: string
          firm_name: string | null
          id: string
          include_datev_booking_stack: boolean
          include_diff_tax_journal: boolean
          include_pdf_report: boolean
          skr_standard: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          advisor_email?: string | null
          auto_send_on_first_of_month?: boolean
          client_number?: string | null
          consultant_number?: string | null
          created_at?: string
          firm_name?: string | null
          id?: string
          include_datev_booking_stack?: boolean
          include_diff_tax_journal?: boolean
          include_pdf_report?: boolean
          skr_standard?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          advisor_email?: string | null
          auto_send_on_first_of_month?: boolean
          client_number?: string | null
          consultant_number?: string | null
          created_at?: string
          firm_name?: string | null
          id?: string
          include_datev_booking_stack?: boolean
          include_diff_tax_journal?: boolean
          include_pdf_report?: boolean
          skr_standard?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_advisor_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vinted_categories: {
        Row: {
          id: number
          is_leaf: boolean
          parent_id: number | null
          path: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          id: number
          is_leaf?: boolean
          parent_id?: number | null
          path: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          id?: number
          is_leaf?: boolean
          parent_id?: number | null
          path?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinted_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vinted_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vinted_category_syncs: {
        Row: {
          category_count: number
          id: number
          last_attempt_at: string | null
          last_error: string | null
          refreshed_at: string | null
          requested_at: string | null
        }
        Insert: {
          category_count?: number
          id?: number
          last_attempt_at?: string | null
          last_error?: string | null
          refreshed_at?: string | null
          requested_at?: string | null
        }
        Update: {
          category_count?: number
          id?: number
          last_attempt_at?: string | null
          last_error?: string | null
          refreshed_at?: string | null
          requested_at?: string | null
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          created_at: string
          custom_webhook_enabled: boolean
          custom_webhook_url: string | null
          discord_enabled: boolean
          discord_webhook_url: string | null
          id: string
          notify_on_low_margin: boolean
          notify_on_purchase: boolean
          notify_on_sale: boolean
          sound_enabled: boolean
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          telegram_enabled: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          custom_webhook_enabled?: boolean
          custom_webhook_url?: string | null
          discord_enabled?: boolean
          discord_webhook_url?: string | null
          id?: string
          notify_on_low_margin?: boolean
          notify_on_purchase?: boolean
          notify_on_sale?: boolean
          sound_enabled?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          custom_webhook_enabled?: boolean
          custom_webhook_url?: string | null
          discord_enabled?: boolean
          discord_webhook_url?: string | null
          id?: string
          notify_on_low_margin?: boolean
          notify_on_purchase?: boolean
          notify_on_sale?: boolean
          sound_enabled?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          min_profit_amount: number
          min_roi_percent: number
          name: string
          numbering_timezone: string
          tax_mode: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_profit_amount?: number
          min_roi_percent?: number
          name: string
          numbering_timezone?: string
          tax_mode?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_profit_amount?: number
          min_roi_percent?: number
          name?: string
          numbering_timezone?: string
          tax_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      inventory_item_sale_states: {
        Row: {
          active_sale_count: number | null
          active_sale_id: string | null
          inventory_item_id: string | null
          sale_state: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_purchase_lines: {
        Args: { p_lines: Json; p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      allocate_integer_cents: {
        Args: { p_total_cents: number; p_weights: number[] }
        Returns: number[]
      }
      archive_workspace: {
        Args: { p_workspace_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          min_profit_amount: number
          min_roi_percent: number
          name: string
          numbering_timezone: string
          tax_mode: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      beta_application_attempt: {
        Args: {
          p_max_per_origin: number
          p_max_total: number
          p_origin_hash: string
        }
        Returns: boolean
      }
      book_bank_transaction: {
        Args: {
          p_booked_at: string
          p_store_order_id?: string
          p_transaction_id: string
          p_workspace_id: string
        }
        Returns: {
          amount: number
          booked_at: string | null
          booking_date: string
          counterparty_iban: string | null
          counterparty_name: string
          created_at: string
          currency: string
          id: string
          match_json: Json | null
          notes: string | null
          purpose: string
          source_format: string | null
          status: string
          value_date: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bank_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      build_purchase_costing_plan: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      bundle_shipping_orders: {
        Args: {
          p_bundled_item_titles: string[]
          p_carrier: string
          p_customer: Json
          p_item_condition: string
          p_item_sku: string
          p_item_title: string
          p_notes: string
          p_order_date: string
          p_order_ids: string[]
          p_order_number: string
          p_package_type: string
          p_platform: string
          p_sale_price: number
          p_workspace_id: string
        }
        Returns: {
          bundled_item_titles: string[] | null
          bundled_order_ids: string[] | null
          bundled_orders_snapshot: Json | null
          carrier: string
          carrier_transaction_id: string | null
          created_at: string
          customer: Json
          id: string
          is_bundled: boolean
          item_condition: string | null
          item_sku: string | null
          item_title: string
          label_price: number | null
          notes: string | null
          order_date: string
          order_number: string
          package_type: string
          platform: string
          sale_id: string | null
          sale_price: number
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shipping_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      correct_purchase_costing: {
        Args: {
          p_costs: Json
          p_lines: Json
          p_purchase_id: string
          p_purchase_price: number
          p_reason: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_or_get_invoice: {
        Args: {
          p_invoice: Json
          p_items: Json
          p_sale_id: string
          p_store_order_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_purchase: {
        Args: {
          p_expenses?: Json
          p_lines?: Json
          p_purchase: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      create_sniper_subscription: {
        Args: {
          p_brand_id: number
          p_price_from: number
          p_price_to: number
          p_search_text: string
          p_threshold?: number
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace: { Args: { p_name: string }; Returns: string }
      delete_sniper_watchlist: {
        Args: { p_id: string; p_workspace_id: string }
        Returns: undefined
      }
      export_audit_snapshot: {
        Args: { p_filter?: Json; p_workspace_id: string }
        Returns: Json
      }
      finalize_purchase_costing: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      format_record_number: {
        Args: {
          p_minimum_digits: number
          p_prefix: string
          p_separator: string
          p_sequence: number
          p_year: number
        }
        Returns: string
      }
      get_number_settings: { Args: { p_workspace_id: string }; Returns: Json }
      get_purchase_sale_history: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_purchase_sale_history_state: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: string
      }
      has_purchase_recorded_sales: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_catalog_product_media_path: {
        Args: { p_path: string; p_product_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_platform_operator: { Args: never; Returns: boolean }
      is_valid_gtin: { Args: { p_value: string }; Returns: boolean }
      is_workspace_admin: { Args: { ws_id: string }; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      list_business_events: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_filter: Json
          p_page_size: number
          p_workspace_id: string
        }
        Returns: {
          actor_id: string
          changes: Json
          correlation_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          reason: string
          workspace_id: string
        }[]
      }
      list_entity_business_events: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_entity_id: string
          p_entity_type: string
          p_page_size: number
          p_workspace_id: string
        }
        Returns: {
          actor_id: string
          changes: Json
          correlation_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          reason: string
          workspace_id: string
        }[]
      }
      list_record_timeline: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_cursor_kind?: string
          p_entity_id: string
          p_entity_type: string
          p_page_size?: number
          p_workspace_id: string
        }
        Returns: {
          actor_id: string
          actor_name: string
          body: string
          changes: Json
          correlation_id: string
          created_at: string
          event_type: string
          id: string
          kind: string
          reason: string
        }[]
      }
      migrate_purchase_costing_legacy: {
        Args: {
          p_confirm: boolean
          p_expected_fingerprint?: string
          p_purchase_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      place_store_order: {
        Args: {
          p_buyer_notes: string
          p_customer: Json
          p_items: Json
          p_order_id: string
          p_order_number: string
          p_payment_id: string
          p_payment_method: string
          p_payment_status: string
          p_sale_date: string
          p_shipping_cost: number
          p_status: string
          p_subtotal: number
          p_total: number
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          customer: Json
          id: string
          order_number: string
          payment_id: string | null
          payment_method: string
          payment_status: string
          shipping_cost: number
          status: string
          subtotal: number
          total: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "store_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_purchase_cost_repair: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      preview_purchase_costing_legacy: {
        Args: { p_workspace_id: string }
        Returns: {
          classification: string
          item_count: number
          line_count: number
          purchase_id: string
          reason: string
        }[]
      }
      purchase_draft_audit_snapshot: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      receive_individual_purchase_line: {
        Args: {
          p_item: Json
          p_purchase_id: string
          p_purchase_line_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      receive_purchase_lines: {
        Args: { p_lines: Json; p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      receive_purchase_lines_idempotent: {
        Args: {
          p_lines: Json
          p_purchase_id: string
          p_request_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_legacy_inventory_sale: {
        Args: {
          p_inventory_item_id: string
          p_reason: string
          p_sale: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      record_sale: {
        Args: { p_lines: Json; p_sale: Json; p_workspace_id: string }
        Returns: Json
      }
      record_sale_return: {
        Args: {
          p_buyer_name: string
          p_notes: string
          p_reason: string
          p_refund_amount: number
          p_restock: boolean
          p_restock_action: string
          p_sale_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_sniper_listing_category: {
        Args: { p_external_ids: string[]; p_query_id: string }
        Returns: undefined
      }
      refresh_purchase_receiving_status: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: {
          arrived_at: string | null
          content_status: string
          cost_allocation_mode: string
          created_at: string
          discount_amount: number
          entry_status: string
          estimated_delivery: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          notes: string | null
          numbered_at: string | null
          numbering_series_id: number | null
          numbering_version: number | null
          original_url: string | null
          pricing_mode: string | null
          purchase_date: string
          purchase_price: number | null
          receiving_status: string
          record_number: string | null
          request_id: string | null
          shipment_status: string
          source_id: string | null
          supplier_id: string | null
          supplier_reference: string | null
          title: string
          total_purchase_cost: number | null
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_purchase_costing: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      replace_bank_transactions: {
        Args: { p_transactions: Json; p_workspace_id: string }
        Returns: number
      }
      resolve_legacy_sold_item: {
        Args: {
          p_action: string
          p_inventory_item_id: string
          p_reason: string
          p_workspace_id: string
        }
        Returns: Json
      }
      restore_workspace: {
        Args: { p_workspace_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          min_profit_amount: number
          min_roi_percent: number
          name: string
          numbering_timezone: string
          tax_mode: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_number_series: {
        Args: {
          p_configuration: Json
          p_entity_type: string
          p_expected_version?: number
          p_workspace_id: string
        }
        Returns: {
          entity_type: string
          id: number
          include_year: boolean
          label: string
          minimum_digits: number
          prefix: string
          reset_yearly: boolean
          separator: string
          start_value: number
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "number_series"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_sniper_watchlist: {
        Args: {
          p_brand: string
          p_catalog_id: number
          p_condition: string
          p_discount_threshold_percent: number
          p_id: string
          p_is_active: boolean
          p_price_from: number
          p_price_to: number
          p_search_text: string
          p_title: string
          p_workspace_id: string
        }
        Returns: string
      }
      set_inventory_item_archived: {
        Args: { p_archived: boolean; p_item_id: string; p_workspace_id: string }
        Returns: {
          allocated_purchase_cost: number
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          category: string | null
          condition: string
          created_at: string
          description: string | null
          dimension_height_cm: number | null
          dimension_length_cm: number | null
          dimension_width_cm: number | null
          ean: string | null
          expected_value: number | null
          id: string
          is_public_store: boolean
          model: string | null
          purchase_id: string | null
          purchase_line_id: string | null
          sku: string | null
          status: string
          tax_mode_override: string | null
          title: string
          updated_at: string
          weight_g: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_purchase_line_eans: {
        Args: { p_lines: Json; p_workspace_id: string }
        Returns: undefined
      }
      set_sniper_query_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      set_workspace_archive_state: {
        Args: { p_archived: boolean; p_workspace_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          min_profit_amount: number
          min_roi_percent: number
          name: string
          numbering_timezone: string
          tax_mode: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sniper_evaluate_hits: {
        Args: { p_query_id: string; p_report_hits?: boolean }
        Returns: number
      }
      sniper_evaluate_watchlist_hits: {
        Args: { p_query_id: string; p_report_hits?: boolean }
        Returns: number
      }
      sniper_feed: {
        Args: {
          p_before_id?: string
          p_before_time?: string
          p_deals_only?: boolean
          p_limit?: number
          p_watchlist_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sniper_purge_expired_listings: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      sniper_query_listing_counts: {
        Args: never
        Returns: {
          listing_count: number
          query_id: string
        }[]
      }
      sniper_reference_price:
        | {
            Args: { p_brand: string; p_catalog_id: number; p_condition: string }
            Returns: {
              reference_price: number
              reference_scope: string
              sample_size: number
              unusable_reason: string
            }[]
          }
        | {
            Args: { p_condition: string; p_query_id: string }
            Returns: {
              reference_price: number
              sample_size: number
              unusable_reason: string
            }[]
          }
      sniper_watchlist_matches: {
        Args: {
          p_listing: Database["public"]["Tables"]["sniper_listings"]["Row"]
          p_watchlist: Database["public"]["Tables"]["sniper_watchlists"]["Row"]
        }
        Returns: boolean
      }
      unbundle_shipping_order: {
        Args: { p_bundled_order_id: string; p_workspace_id: string }
        Returns: {
          bundled_item_titles: string[] | null
          bundled_order_ids: string[] | null
          bundled_orders_snapshot: Json | null
          carrier: string
          carrier_transaction_id: string | null
          created_at: string
          customer: Json
          id: string
          is_bundled: boolean
          item_condition: string | null
          item_sku: string | null
          item_title: string
          label_price: number | null
          notes: string | null
          order_date: string
          order_number: string
          package_type: string
          platform: string
          sale_id: string | null
          sale_price: number
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shipping_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_purchase_draft: {
        Args: {
          p_expenses?: Json
          p_lines?: Json
          p_purchase: Json
          p_purchase_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      update_purchase_tracking: {
        Args: {
          p_purchase_id: string
          p_tracking_carrier: string
          p_tracking_number: string
          p_tracking_status: string
        }
        Returns: Json
      }
      update_purchase_workflow: {
        Args: { p_purchase_id: string; p_status: string }
        Returns: Json
      }
      upsert_sniper_query: {
        Args: {
          p_brand_id: number
          p_catalog_id: number
          p_id: string
          p_notes: string
          p_poll_interval_ms: number
          p_price_from: number
          p_price_to: number
          p_search_text: string
        }
        Returns: string
      }
      validate_inventory_item_sale_integrity: {
        Args: { p_inventory_item_id: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
