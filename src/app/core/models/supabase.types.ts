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
      catalog_products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
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
          created_at?: string
          ean?: string | null
          id?: string
          is_public_store?: boolean
          listing_price?: number | null
          model?: string | null
          title: string
          tracking_mode: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
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
          amount: number
          created_at: string
          description: string | null
          id: string
          purchase_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          purchase_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          purchase_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_costs_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          allocated_additional_cost: number
          catalog_product_id: string | null
          created_at: string
          id: string
          line_kind: string
          line_total: number
          ordered_quantity: number
          purchase_id: string
          received_quantity: number
          title_snapshot: string
          unit_purchase_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_additional_cost?: number
          catalog_product_id?: string | null
          created_at?: string
          id?: string
          line_kind: string
          line_total: number
          ordered_quantity: number
          purchase_id: string
          received_quantity?: number
          title_snapshot: string
          unit_purchase_price: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_additional_cost?: number
          catalog_product_id?: string | null
          created_at?: string
          id?: string
          line_kind?: string
          line_total?: number
          ordered_quantity?: number
          purchase_id?: string
          received_quantity?: number
          title_snapshot?: string
          unit_purchase_price?: number
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
      purchases: {
        Row: {
          cost_allocation_mode: string
          created_at: string
          estimated_delivery: string | null
          id: string
          notes: string | null
          original_url: string | null
          purchase_date: string
          purchase_price: number
          receiving_status: string
          source_id: string | null
          supplier_id: string | null
          title: string
          total_purchase_cost: number
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cost_allocation_mode?: string
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          original_url?: string | null
          purchase_date?: string
          purchase_price?: number
          receiving_status?: string
          source_id?: string | null
          supplier_id?: string | null
          title: string
          total_purchase_cost?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_status?: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cost_allocation_mode?: string
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          original_url?: string | null
          purchase_date?: string
          purchase_price?: number
          receiving_status?: string
          source_id?: string | null
          supplier_id?: string | null
          title?: string
          total_purchase_cost?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_workspace_id_fkey"
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
      sale_line_lot_allocations: {
        Row: {
          allocated_cost: number
          created_at: string
          id: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          unit_cost: number
          workspace_id: string
        }
        Insert: {
          allocated_cost?: number
          created_at?: string
          id?: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          unit_cost: number
          workspace_id: string
        }
        Update: {
          allocated_cost?: number
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
          other_costs: number
          packaging_cost: number
          platform: string
          platform_fee: number
          refund_amount: number | null
          returned_at: string | null
          sale_date: string
          sale_price: number
          sale_price_total: number | null
          shipping_cost: number
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
          other_costs?: number
          packaging_cost?: number
          platform: string
          platform_fee?: number
          refund_amount?: number | null
          returned_at?: string | null
          sale_date?: string
          sale_price?: number
          sale_price_total?: number | null
          shipping_cost?: number
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
          other_costs?: number
          packaging_cost?: number
          platform?: string
          platform_fee?: number
          refund_amount?: number | null
          returned_at?: string | null
          sale_date?: string
          sale_price?: number
          sale_price_total?: number | null
          shipping_cost?: number
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
          unit_cost: number
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
          unit_cost: number
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
          unit_cost?: number
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
          contact_info: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          workspace_id: string
        }
        Insert: {
          contact_info?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          workspace_id: string
        }
        Update: {
          contact_info?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
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
          created_at: string
          currency: string
          id: string
          min_profit_amount: number
          min_roi_percent: number
          name: string
          tax_mode: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          min_profit_amount?: number
          min_roi_percent?: number
          name: string
          tax_mode?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          min_profit_amount?: number
          min_roi_percent?: number
          name?: string
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
      create_workspace: { Args: { p_name: string }; Returns: string }
      is_workspace_admin: { Args: { ws_id: string }; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
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
      refresh_purchase_receiving_status: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: {
          cost_allocation_mode: string
          created_at: string
          estimated_delivery: string | null
          id: string
          notes: string | null
          original_url: string | null
          purchase_date: string
          purchase_price: number
          receiving_status: string
          source_id: string | null
          supplier_id: string | null
          title: string
          total_purchase_cost: number
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

