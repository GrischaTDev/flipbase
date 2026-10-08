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
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "activity_logs_inventory_item_id_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
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
      article_media_cleanup_jobs: {
        Row: {
          article_id: string
          article_kind: string
          attempt_count: number
          bucket_id: string
          completed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          next_attempt_at: string
          storage_path: string
          workspace_id: string
        }
        Insert: {
          article_id: string
          article_kind: string
          attempt_count?: number
          bucket_id?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          storage_path: string
          workspace_id: string
        }
        Update: {
          article_id?: string
          article_kind?: string
          attempt_count?: number
          bucket_id?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_media_cleanup_jobs_workspace_id_fkey"
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
          auth_user_id: string | null
          consent_at: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          email: string
          first_name: string
          granted_days: number | null
          id: string
          invitation_expires_at: string | null
          invitation_last_error: string | null
          invitation_sent_at: string | null
          invitation_status: string
          last_name: string
          operator_email_last_error: string | null
          operator_email_sent_at: string | null
          operator_email_status: string
          receipt_email_last_error: string | null
          receipt_email_sent_at: string | null
          receipt_email_status: string
          registered_at: string | null
          registration_link_kind: string
          rejection_email_last_error: string | null
          rejection_email_sent_at: string | null
          rejection_email_status: string
          revoked_at: string | null
          status: string
          withdrawal_last_error: string | null
          withdrawal_status: string
          withdrawal_user_id: string | null
          withdrawal_workspace_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          consent_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          email: string
          first_name: string
          granted_days?: number | null
          id?: string
          invitation_expires_at?: string | null
          invitation_last_error?: string | null
          invitation_sent_at?: string | null
          invitation_status?: string
          last_name: string
          operator_email_last_error?: string | null
          operator_email_sent_at?: string | null
          operator_email_status?: string
          receipt_email_last_error?: string | null
          receipt_email_sent_at?: string | null
          receipt_email_status?: string
          registered_at?: string | null
          registration_link_kind?: string
          rejection_email_last_error?: string | null
          rejection_email_sent_at?: string | null
          rejection_email_status?: string
          revoked_at?: string | null
          status?: string
          withdrawal_last_error?: string | null
          withdrawal_status?: string
          withdrawal_user_id?: string | null
          withdrawal_workspace_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          consent_at?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          email?: string
          first_name?: string
          granted_days?: number | null
          id?: string
          invitation_expires_at?: string | null
          invitation_last_error?: string | null
          invitation_sent_at?: string | null
          invitation_status?: string
          last_name?: string
          operator_email_last_error?: string | null
          operator_email_sent_at?: string | null
          operator_email_status?: string
          receipt_email_last_error?: string | null
          receipt_email_sent_at?: string | null
          receipt_email_status?: string
          registered_at?: string | null
          registration_link_kind?: string
          rejection_email_last_error?: string | null
          rejection_email_sent_at?: string | null
          rejection_email_status?: string
          revoked_at?: string | null
          status?: string
          withdrawal_last_error?: string | null
          withdrawal_status?: string
          withdrawal_user_id?: string | null
          withdrawal_workspace_id?: string | null
        }
        Relationships: []
      }
      beta_discord_links: {
        Row: {
          auth_user_id: string
          created_at: string
          discord_user_id: string
          id: number
          role_assigned_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          discord_user_id: string
          id?: never
          role_assigned_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          discord_user_id?: string
          id?: never
          role_assigned_at?: string | null
        }
        Relationships: []
      }
      beta_lifecycle_operations: {
        Row: {
          action: string
          application_id: string | null
          created_at: string
          id: number
          lease_expires_at: string
          lease_id: string
          request_id: string
          result: Json
          status: string
        }
        Insert: {
          action: string
          application_id?: string | null
          created_at?: string
          id?: never
          lease_expires_at?: string
          lease_id?: string
          request_id: string
          result?: Json
          status?: string
        }
        Update: {
          action?: string
          application_id?: string | null
          created_at?: string
          id?: never
          lease_expires_at?: string
          lease_id?: string
          request_id?: string
          result?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_lifecycle_operations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "beta_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_registration_links: {
        Row: {
          application_id: string
          consumed_at: string | null
          expires_at: string
          id: number
          issued_at: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          application_id: string
          consumed_at?: string | null
          expires_at: string
          id?: never
          issued_at?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          application_id?: string
          consumed_at?: string | null
          expires_at?: string
          id?: never
          issued_at?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_registration_links_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "beta_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          name_key: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_key?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          sender_city: string | null
          sender_company: string | null
          sender_country: string | null
          sender_email: string | null
          sender_house_number: string | null
          sender_name: string | null
          sender_phone: string | null
          sender_postal_code: string | null
          sender_street: string | null
          updated_at: string
          use_company_address: boolean | null
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
          sender_city?: string | null
          sender_company?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_house_number?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_postal_code?: string | null
          sender_street?: string | null
          updated_at?: string
          use_company_address?: boolean | null
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
          sender_city?: string | null
          sender_company?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_house_number?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_postal_code?: string | null
          sender_street?: string | null
          updated_at?: string
          use_company_address?: boolean | null
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
      catalog_product_groups: {
        Row: {
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_media: {
        Row: {
          alt_text: string | null
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
          alt_text?: string | null
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
          alt_text?: string | null
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
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
          color: string | null
          condition: string | null
          condition_notes: string | null
          created_at: string
          description: string | null
          ean: string | null
          id: string
          is_public_store: boolean
          listing_price: number | null
          material: string | null
          model: string | null
          seo_description: string | null
          seo_title: string | null
          size: string | null
          sku: string | null
          title: string
          tracking_mode: string
          updated_at: string
          url_handle: string | null
          variant_group_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          is_public_store?: boolean
          listing_price?: number | null
          material?: string | null
          model?: string | null
          seo_description?: string | null
          seo_title?: string | null
          size?: string | null
          sku?: string | null
          title: string
          tracking_mode?: string
          updated_at?: string
          url_handle?: string | null
          variant_group_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          is_public_store?: boolean
          listing_price?: number | null
          material?: string | null
          model?: string | null
          seo_description?: string | null
          seo_title?: string | null
          size?: string | null
          sku?: string | null
          title?: string
          tracking_mode?: string
          updated_at?: string
          url_handle?: string | null
          variant_group_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_variant_group_fkey"
            columns: ["workspace_id", "variant_group_id"]
            isOneToOne: false
            referencedRelation: "catalog_product_groups"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "catalog_products_workspace_brand_fkey"
            columns: ["workspace_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "catalog_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_article_mappings: {
        Row: {
          catalog_product_id: string | null
          environment: string
          external_account_id: string
          id: string
          inventory_item_id: string | null
          listing_id: string
          updated_at: string
          updated_by: string | null
          variation_id: string | null
          workspace_id: string
        }
        Insert: {
          catalog_product_id?: string | null
          environment: string
          external_account_id: string
          id?: string
          inventory_item_id?: string | null
          listing_id: string
          updated_at?: string
          updated_by?: string | null
          variation_id?: string | null
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string | null
          environment?: string
          external_account_id?: string
          id?: string
          inventory_item_id?: string | null
          listing_id?: string
          updated_at?: string
          updated_by?: string | null
          variation_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_article_mappings_workspace_id_catalog_product_id_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "ebay_article_mappings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_article_mappings_workspace_id_inventory_item_id_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "ebay_article_mappings_workspace_id_inventory_item_id_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ebay_authorization_states: {
        Row: {
          authorization_version: number
          connection_id: string
          expires_at: string
          id: string
          state_hash: string
        }
        Insert: {
          authorization_version: number
          connection_id: string
          expires_at?: string
          id?: string
          state_hash: string
        }
        Update: {
          authorization_version?: number
          connection_id?: string
          expires_at?: string
          id?: string
          state_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_authorization_states_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ebay_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_connections: {
        Row: {
          authorization_version: number
          created_at: string
          environment: string
          external_account_id: string | null
          id: string
          last_read_at: string | null
          operation_expires_at: string | null
          operation_id: string | null
          status: string
          updated_at: string
          user_id: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          authorization_version?: number
          created_at?: string
          environment: string
          external_account_id?: string | null
          id?: string
          last_read_at?: string | null
          operation_expires_at?: string | null
          operation_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          authorization_version?: number
          created_at?: string
          environment?: string
          external_account_id?: string | null
          id?: string
          last_read_at?: string | null
          operation_expires_at?: string | null
          operation_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_credentials: {
        Row: {
          encrypted_tokens: string
          id: string
          updated_at: string
        }
        Insert: {
          encrypted_tokens: string
          id: string
          updated_at?: string
        }
        Update: {
          encrypted_tokens?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_credentials_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "ebay_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_order_bookings: {
        Row: {
          environment: string
          id: string
          reason: string | null
          recorded_at: string
          recorded_by: string | null
          sale_id: string | null
          source_key: string
          source_lines: Json
          status: string
          workspace_id: string
        }
        Insert: {
          environment: string
          id?: string
          reason?: string | null
          recorded_at?: string
          recorded_by?: string | null
          sale_id?: string | null
          source_key: string
          source_lines?: Json
          status: string
          workspace_id: string
        }
        Update: {
          environment?: string
          id?: string
          reason?: string | null
          recorded_at?: string
          recorded_by?: string | null
          sale_id?: string | null
          source_key?: string
          source_lines?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_order_bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_order_bookings_workspace_id_sale_id_fkey"
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ebay_order_snapshots: {
        Row: {
          authorization_version: number
          booking_ready: boolean
          connection_id: string
          created_at: string
          environment: string
          expires_at: string
          external_account_id: string
          id: string
          review_hash: string
          source: Json
          source_key: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          authorization_version: number
          booking_ready?: boolean
          connection_id: string
          created_at?: string
          environment: string
          expires_at: string
          external_account_id: string
          id?: string
          review_hash: string
          source: Json
          source_key: string
          user_id: string
          workspace_id: string
        }
        Update: {
          authorization_version?: number
          booking_ready?: boolean
          connection_id?: string
          created_at?: string
          environment?: string
          expires_at?: string
          external_account_id?: string
          id?: string
          review_hash?: string
          source?: Json
          source_key?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_order_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ebay_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_order_snapshots_workspace_id_fkey"
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
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_type: string
          expense_id: string
          file_size: number
          id: string
          mime_type: string
          original_file_name: string
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_type: string
          expense_id: string
          file_size: number
          id?: string
          mime_type: string
          original_file_name: string
          storage_path: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_type?: string
          expense_id?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_file_name?: string
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_documents_workspace_id_expense_id_fkey"
            columns: ["workspace_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "expense_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_recurring_rules: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: string
          gross_amount: number
          id: string
          is_active: boolean
          notes: string | null
          quantity: number
          start_date: string
          title: string
          updated_at: string
          vat_rate: number | null
          vendor_name: string | null
          workspace_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency: string
          gross_amount: number
          id?: string
          is_active?: boolean
          notes?: string | null
          quantity?: number
          start_date: string
          title: string
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
          workspace_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          gross_amount?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          quantity?: number
          start_date?: string
          title?: string
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_recurring_rules_workspace_id_category_id_fkey"
            columns: ["workspace_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          expense_date: string
          gross_amount: number
          id: string
          notes: string | null
          occurrence_date: string | null
          payment_date: string | null
          quantity: number
          recurring_rule_id: string | null
          status: string
          title: string
          updated_at: string
          vat_rate: number | null
          vendor_name: string | null
          workspace_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          expense_date: string
          gross_amount: number
          id?: string
          notes?: string | null
          occurrence_date?: string | null
          payment_date?: string | null
          quantity?: number
          recurring_rule_id?: string | null
          status: string
          title: string
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
          workspace_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          expense_date?: string
          gross_amount?: number
          id?: string
          notes?: string | null
          occurrence_date?: string | null
          payment_date?: string | null
          quantity?: number
          recurring_rule_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_workspace_id_category_id_fkey"
            columns: ["workspace_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "expenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_workspace_id_recurring_rule_id_fkey"
            columns: ["workspace_id", "recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "expense_recurring_rules"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          allocated_purchase_cost: number | null
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
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
          source_package_line_id: string | null
          status: string
          tax_mode_override: string | null
          tax_purchase_cost: number | null
          title: string
          updated_at: string
          weight_g: number | null
          workspace_id: string
        }
        Insert: {
          allocated_purchase_cost?: number | null
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
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
          source_package_line_id?: string | null
          status?: string
          tax_mode_override?: string | null
          tax_purchase_cost?: number | null
          title: string
          updated_at?: string
          weight_g?: number | null
          workspace_id: string
        }
        Update: {
          allocated_purchase_cost?: number | null
          archived_at?: string | null
          archived_by?: string | null
          brand?: string | null
          brand_id?: string | null
          category?: string | null
          category_id?: string | null
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
          source_package_line_id?: string | null
          status?: string
          tax_mode_override?: string | null
          tax_purchase_cost?: number | null
          title?: string
          updated_at?: string
          weight_g?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_package_origin_fkey"
            columns: ["workspace_id", "source_package_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_purchase_id_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_purchase_line_id_fkey"
            columns: ["purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_workspace_brand_fkey"
            columns: ["workspace_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["workspace_id", "id"]
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
      listing_images: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          listing_id: string
          sort_order: number
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          listing_id: string
          sort_order: number
          storage_path: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          listing_id?: string
          sort_order?: number
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_fkey"
            columns: ["workspace_id", "listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      listings: {
        Row: {
          catalog_product_id: string | null
          created_at: string
          description: string
          end_reason: string | null
          ended_at: string | null
          id: string
          image_selection_saved: boolean
          inventory_item_id: string | null
          item_details: Json
          last_listed_at: string | null
          listed_count: number
          online_since: string | null
          platform: string
          postal_code: string | null
          price: number
          price_type: string
          shipping_price: number | null
          shipping_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          catalog_product_id?: string | null
          created_at?: string
          description: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          image_selection_saved?: boolean
          inventory_item_id?: string | null
          item_details?: Json
          last_listed_at?: string | null
          listed_count?: number
          online_since?: string | null
          platform?: string
          postal_code?: string | null
          price: number
          price_type: string
          shipping_price?: number | null
          shipping_type: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string | null
          created_at?: string
          description?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          image_selection_saved?: boolean
          inventory_item_id?: string | null
          item_details?: Json
          last_listed_at?: string | null
          listed_count?: number
          online_since?: string | null
          platform?: string
          postal_code?: string | null
          price?: number
          price_type?: string
          shipping_price?: number | null
          shipping_type?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_catalog_product_workspace_fkey"
            columns: ["workspace_id", "catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "listings_item_workspace_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "listings_item_workspace_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "market_research_inventory_item_id_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
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
      marketplace_account_entries: {
        Row: {
          body: Json
          connection_id: string
          external_id: string
          favorite_notification_version: number | null
          id: string
          kind: string
          observed_at: string
          parent_id: string | null
          sort_at: string
          workspace_id: string
        }
        Insert: {
          body: Json
          connection_id: string
          external_id: string
          favorite_notification_version?: number | null
          id?: string
          kind: string
          observed_at?: string
          parent_id?: string | null
          sort_at?: string
          workspace_id: string
        }
        Update: {
          body?: Json
          connection_id?: string
          external_id?: string
          favorite_notification_version?: number | null
          id?: string
          kind?: string
          observed_at?: string
          parent_id?: string | null
          sort_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_account_entries_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "marketplace_account_entries_workspace_id_connection_id_par_fkey"
            columns: ["workspace_id", "connection_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_account_entries"
            referencedColumns: ["workspace_id", "connection_id", "id"]
          },
        ]
      }
      marketplace_account_sync_sources: {
        Row: {
          area: string
          connection_id: string
          failure: string | null
          id: number
          last_complete_at: string | null
          last_success_at: string | null
          observed_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          area: string
          connection_id: string
          failure?: string | null
          id?: never
          last_complete_at?: string | null
          last_success_at?: string | null
          observed_at: string
          status: string
          workspace_id: string
        }
        Update: {
          area?: string
          connection_id?: string
          failure?: string | null
          id?: never
          last_complete_at?: string | null
          last_success_at?: string | null
          observed_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_account_sync_source_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_browser_profiles: {
        Row: {
          connection_id: string
          created_at: string
          id: number
          provider_profile_id: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: never
          provider_profile_id: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: never
          provider_profile_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_browser_profiles_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_browser_sessions: {
        Row: {
          absolute_expires_at: string | null
          cloud_setup_id: string | null
          connection_id: string
          created_at: string
          expires_at: string
          heartbeat_at: string | null
          id: number
          operation_id: string | null
          provider_profile_id: string
          provider_stopped_at: string | null
          public_id: string
          started_by: string
          state: string
          stop_reason: string | null
          worker_epoch: number | null
          worker_id: string | null
          workspace_id: string
        }
        Insert: {
          absolute_expires_at?: string | null
          cloud_setup_id?: string | null
          connection_id: string
          created_at?: string
          expires_at: string
          heartbeat_at?: string | null
          id?: never
          operation_id?: string | null
          provider_profile_id: string
          provider_stopped_at?: string | null
          public_id?: string
          started_by: string
          state?: string
          stop_reason?: string | null
          worker_epoch?: number | null
          worker_id?: string | null
          workspace_id: string
        }
        Update: {
          absolute_expires_at?: string | null
          cloud_setup_id?: string | null
          connection_id?: string
          created_at?: string
          expires_at?: string
          heartbeat_at?: string | null
          id?: never
          operation_id?: string | null
          provider_profile_id?: string
          provider_stopped_at?: string | null
          public_id?: string
          started_by?: string
          state?: string
          stop_reason?: string | null
          worker_epoch?: number | null
          worker_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_browser_sessions_cloud_setup_id_fkey"
            columns: ["cloud_setup_id"]
            isOneToOne: false
            referencedRelation: "marketplace_cloud_setups"
            referencedColumns: ["public_id"]
          },
          {
            foreignKeyName: "marketplace_browser_sessions_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_browser_test_sessions: {
        Row: {
          connection_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          interaction_count: number
          last_seen_at: string | null
          started_by: string
          state: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          ended_at?: string | null
          expires_at: string
          id?: string
          interaction_count?: number
          last_seen_at?: string | null
          started_by: string
          state?: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          interaction_count?: number
          last_seen_at?: string | null
          started_by?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_browser_test_sessio_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_cloud_ips: {
        Row: {
          country_code: string
          created_at: string
          enabled: boolean
          exit_ip_fingerprint: string
          expires_at: string
          id: number
          is_dedicated_isp: boolean
          network_id: string
          order_reference: string
          provider: string
          verified_at: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          enabled?: boolean
          exit_ip_fingerprint: string
          expires_at: string
          id?: never
          is_dedicated_isp?: boolean
          network_id: string
          order_reference: string
          provider?: string
          verified_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          enabled?: boolean
          exit_ip_fingerprint?: string
          expires_at?: string
          id?: never
          is_dedicated_isp?: boolean
          network_id?: string
          order_reference?: string
          provider?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      marketplace_cloud_message_permissions: {
        Row: {
          approved_by: string
          authorization_version: number
          browser_profile_id: number
          connection_id: string
          created_at: string
          external_account_id: string
          id: number
          provider_profile_id: string
          revoked_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_by: string
          authorization_version?: number
          browser_profile_id: number
          connection_id: string
          created_at?: string
          external_account_id: string
          id?: never
          provider_profile_id: string
          revoked_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_by?: string
          authorization_version?: number
          browser_profile_id?: number
          connection_id?: string
          created_at?: string
          external_account_id?: string
          id?: never
          provider_profile_id?: string
          revoked_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_cloud_message_permi_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "marketplace_cloud_message_permissions_browser_profile_id_fkey"
            columns: ["browser_profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_browser_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_cloud_setups: {
        Row: {
          cloud_ip_id: number
          connection_id: string
          created_at: string
          expected_external_account_id: string | null
          expected_grant_generation: number | null
          expected_grant_revoked_at: string | null
          expires_at: string
          id: number
          is_new_connection: boolean
          previous_provider_profile_id: string | null
          provider_profile_id: string | null
          public_id: string
          request_id: string
          requested_by: string
          requested_name: string | null
          state: string
          updated_at: string
          verified_external_account_id: string | null
          verified_username: string | null
          worker_epoch: number | null
          worker_id: string | null
          workspace_id: string
        }
        Insert: {
          cloud_ip_id: number
          connection_id: string
          created_at?: string
          expected_external_account_id?: string | null
          expected_grant_generation?: number | null
          expected_grant_revoked_at?: string | null
          expires_at?: string
          id?: never
          is_new_connection: boolean
          previous_provider_profile_id?: string | null
          provider_profile_id?: string | null
          public_id?: string
          request_id: string
          requested_by: string
          requested_name?: string | null
          state?: string
          updated_at?: string
          verified_external_account_id?: string | null
          verified_username?: string | null
          worker_epoch?: number | null
          worker_id?: string | null
          workspace_id: string
        }
        Update: {
          cloud_ip_id?: number
          connection_id?: string
          created_at?: string
          expected_external_account_id?: string | null
          expected_grant_generation?: number | null
          expected_grant_revoked_at?: string | null
          expires_at?: string
          id?: never
          is_new_connection?: boolean
          previous_provider_profile_id?: string | null
          provider_profile_id?: string | null
          public_id?: string
          request_id?: string
          requested_by?: string
          requested_name?: string | null
          state?: string
          updated_at?: string
          verified_external_account_id?: string | null
          verified_username?: string | null
          worker_epoch?: number | null
          worker_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_cloud_setups_cloud_ip_id_fkey"
            columns: ["cloud_ip_id"]
            isOneToOne: false
            referencedRelation: "marketplace_cloud_ips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_cloud_setups_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_connections: {
        Row: {
          capabilities: Json
          created_at: string
          display_name: string
          execution_mode: string
          external_account_id: string | null
          id: string
          last_synced_at: string | null
          marketplace: string
          resume_status: string | null
          sort_order: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          display_name: string
          execution_mode?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          marketplace?: string
          resume_status?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          display_name?: string
          execution_mode?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          marketplace?: string
          resume_status?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favorite_message_events: {
        Row: {
          actor_id: string
          claim_token: string | null
          connection_id: string
          error_code: string | null
          event_at: string
          external_conversation_id: string | null
          external_id: string
          external_message_id: string | null
          external_offer_id: string | null
          external_transaction_id: string | null
          id: string
          item_id: string
          lease_expires_at: string | null
          message_text: string | null
          offer_config: Json | null
          offer_error_code: string | null
          offer_price_cents: number | null
          offer_state: string
          setting_version: number
          state: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          claim_token?: string | null
          connection_id: string
          error_code?: string | null
          event_at: string
          external_conversation_id?: string | null
          external_id: string
          external_message_id?: string | null
          external_offer_id?: string | null
          external_transaction_id?: string | null
          id?: string
          item_id: string
          lease_expires_at?: string | null
          message_text?: string | null
          offer_config?: Json | null
          offer_error_code?: string | null
          offer_price_cents?: number | null
          offer_state?: string
          setting_version: number
          state?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          claim_token?: string | null
          connection_id?: string
          error_code?: string | null
          event_at?: string
          external_conversation_id?: string | null
          external_id?: string
          external_message_id?: string | null
          external_offer_id?: string | null
          external_transaction_id?: string | null
          id?: string
          item_id?: string
          lease_expires_at?: string | null
          message_text?: string | null
          offer_config?: Json | null
          offer_error_code?: string | null
          offer_price_cents?: number | null
          offer_state?: string
          setting_version?: number
          state?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorite_message_ev_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_favorite_message_settings: {
        Row: {
          activated_at: string | null
          config: Json
          connection_id: string
          enabled: boolean
          external_account_id: string | null
          grant_generation: number | null
          id: number
          last_checked_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          activated_at?: string | null
          config: Json
          connection_id: string
          enabled?: boolean
          external_account_id?: string | null
          grant_generation?: number | null
          id?: never
          last_checked_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          activated_at?: string | null
          config?: Json
          connection_id?: string
          enabled?: boolean
          external_account_id?: string | null
          grant_generation?: number | null
          id?: never
          last_checked_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorite_message_se_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_favorite_notification_events: {
        Row: {
          connection_id: string
          entry_id: string
          external_listing_id: string
          favorites: number
          id: number
          notification_id: number
          observed_at: string
          previous_favorites: number
          setting_version: number
          title: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          entry_id: string
          external_listing_id: string
          favorites: number
          id?: never
          notification_id: number
          observed_at: string
          previous_favorites: number
          setting_version: number
          title: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          entry_id?: string
          external_listing_id?: string
          favorites?: number
          id?: never
          notification_id?: number
          observed_at?: string
          previous_favorites?: number
          setting_version?: number
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorite_notifica_workspace_id_connection_id_n_fkey"
            columns: ["workspace_id", "connection_id", "notification_id"]
            isOneToOne: false
            referencedRelation: "marketplace_favorite_notifications"
            referencedColumns: ["workspace_id", "connection_id", "id"]
          },
        ]
      }
      marketplace_favorite_notification_settings: {
        Row: {
          baseline_pending: boolean
          connection_id: string
          enabled: boolean
          id: number
          version: number
          workspace_id: string
        }
        Insert: {
          baseline_pending?: boolean
          connection_id: string
          enabled?: boolean
          id?: never
          version?: number
          workspace_id: string
        }
        Update: {
          baseline_pending?: boolean
          connection_id?: string
          enabled?: boolean
          id?: never
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorite_notificati_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_favorite_notifications: {
        Row: {
          connection_id: string
          id: number
          observed_at: string
          read: boolean
          workspace_id: string
        }
        Insert: {
          connection_id: string
          id?: never
          observed_at: string
          read?: boolean
          workspace_id: string
        }
        Update: {
          connection_id?: string
          id?: never
          observed_at?: string
          read?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorite_notificat_workspace_id_connection_id_fkey1"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_feedback_notifications: {
        Row: {
          author_name: string | null
          cleared_at: string | null
          connection_id: string
          external_feedback_id: string
          id: number
          is_automatic: boolean | null
          notified_at: string | null
          observed_at: string
          rating: number | null
          read: boolean
          workspace_id: string
        }
        Insert: {
          author_name?: string | null
          cleared_at?: string | null
          connection_id: string
          external_feedback_id: string
          id?: never
          is_automatic?: boolean | null
          notified_at?: string | null
          observed_at: string
          rating?: number | null
          read?: boolean
          workspace_id: string
        }
        Update: {
          author_name?: string | null
          cleared_at?: string | null
          connection_id?: string
          external_feedback_id?: string
          id?: never
          is_automatic?: boolean | null
          notified_at?: string | null
          observed_at?: string
          rating?: number | null
          read?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_feedback_notificati_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_listing_metric_observations: {
        Row: {
          connection_id: string
          entry_id: string
          favorites: number | null
          id: number
          observed_at: string
          views: number | null
          workspace_id: string
        }
        Insert: {
          connection_id: string
          entry_id: string
          favorites?: number | null
          id?: never
          observed_at: string
          views?: number | null
          workspace_id: string
        }
        Update: {
          connection_id?: string
          entry_id?: string
          favorites?: number | null
          id?: never
          observed_at?: string
          views?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_metric_obse_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "marketplace_listing_metric_observations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "marketplace_account_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_local_extension_grants: {
        Row: {
          approved_by: string
          connection_id: string
          expires_at: string
          external_account_id: string
          grant_generation: number
          id: number
          inbox_next_page: number
          last_seen_at: string | null
          messages_read: boolean
          messages_send: boolean
          revoked_at: string | null
          token_hash: string
          workspace_id: string
        }
        Insert: {
          approved_by: string
          connection_id: string
          expires_at: string
          external_account_id: string
          grant_generation?: number
          id?: never
          inbox_next_page?: number
          last_seen_at?: string | null
          messages_read?: boolean
          messages_send?: boolean
          revoked_at?: string | null
          token_hash: string
          workspace_id: string
        }
        Update: {
          approved_by?: string
          connection_id?: string
          expires_at?: string
          external_account_id?: string
          grant_generation?: number
          id?: never
          inbox_next_page?: number
          last_seen_at?: string | null
          messages_read?: boolean
          messages_send?: boolean
          revoked_at?: string | null
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_local_extension_gra_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_local_message_outbox: {
        Row: {
          attachment_base64: string | null
          attachment_mime_type: string | null
          attachment_name: string | null
          claim_token: string | null
          cloud_authorization_version: number | null
          cloud_browser_session_id: string | null
          cloud_runner_id: string | null
          cloud_worker_epoch: number | null
          cloud_worker_id: string | null
          connection_id: string
          conversation_id: string
          created_at: string
          error_code: string | null
          execution_mode: string
          external_account_id: string
          external_conversation_id: string
          external_message_id: string | null
          grant_generation: number | null
          id: string
          lease_expires_at: string | null
          message_text: string
          payload_hash: string
          request_id: string
          requested_by: string
          started_at: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachment_base64?: string | null
          attachment_mime_type?: string | null
          attachment_name?: string | null
          claim_token?: string | null
          cloud_authorization_version?: number | null
          cloud_browser_session_id?: string | null
          cloud_runner_id?: string | null
          cloud_worker_epoch?: number | null
          cloud_worker_id?: string | null
          connection_id: string
          conversation_id: string
          created_at?: string
          error_code?: string | null
          execution_mode?: string
          external_account_id: string
          external_conversation_id: string
          external_message_id?: string | null
          grant_generation?: number | null
          id?: string
          lease_expires_at?: string | null
          message_text: string
          payload_hash: string
          request_id: string
          requested_by: string
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attachment_base64?: string | null
          attachment_mime_type?: string | null
          attachment_name?: string | null
          claim_token?: string | null
          cloud_authorization_version?: number | null
          cloud_browser_session_id?: string | null
          cloud_runner_id?: string | null
          cloud_worker_epoch?: number | null
          cloud_worker_id?: string | null
          connection_id?: string
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          execution_mode?: string
          external_account_id?: string
          external_conversation_id?: string
          external_message_id?: string | null
          grant_generation?: number | null
          id?: string
          lease_expires_at?: string | null
          message_text?: string
          payload_hash?: string
          request_id?: string
          requested_by?: string
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_local_message_out_workspace_id_connection_id_c_fkey"
            columns: ["workspace_id", "connection_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "marketplace_account_entries"
            referencedColumns: ["workspace_id", "connection_id", "id"]
          },
          {
            foreignKeyName: "marketplace_local_message_outbo_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "marketplace_local_message_outbox_cloud_browser_session_id_fkey"
            columns: ["cloud_browser_session_id"]
            isOneToOne: false
            referencedRelation: "marketplace_browser_sessions"
            referencedColumns: ["public_id"]
          },
        ]
      }
      marketplace_message_notification_baselines: {
        Row: {
          connection_id: string
          external_account_id: string
          first_observed_at: string
          id: number
          last_observed_at: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          external_account_id: string
          first_observed_at: string
          id?: never
          last_observed_at: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          external_account_id?: string
          first_observed_at?: string
          id?: never
          last_observed_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_message_notificatio_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_message_notifications: {
        Row: {
          cleared_at: string | null
          connection_id: string
          conversation_id: string | null
          external_account_id: string
          external_conversation_id: string
          external_event_id: string
          id: number
          notified_at: string | null
          observed_at: string
          occurred_at: string
          read: boolean
          workspace_id: string
        }
        Insert: {
          cleared_at?: string | null
          connection_id: string
          conversation_id?: string | null
          external_account_id: string
          external_conversation_id: string
          external_event_id: string
          id?: never
          notified_at?: string | null
          observed_at: string
          occurred_at: string
          read?: boolean
          workspace_id: string
        }
        Update: {
          cleared_at?: string | null
          connection_id?: string
          conversation_id?: string | null
          external_account_id?: string
          external_conversation_id?: string
          external_event_id?: string
          id?: never
          notified_at?: string | null
          observed_at?: string
          occurred_at?: string
          read?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_message_notificat_workspace_id_connection_id_c_fkey"
            columns: ["workspace_id", "connection_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "marketplace_account_entries"
            referencedColumns: ["workspace_id", "connection_id", "id"]
          },
          {
            foreignKeyName: "marketplace_message_notificati_workspace_id_connection_id_fkey1"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_operations: {
        Row: {
          authorization_kind: string | null
          authorization_version: number | null
          browser_session_id: string | null
          connection_id: string
          counts: Json | null
          created_at: string
          error_code: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          lease_expires_at: string | null
          observed_at: string | null
          requested_by: string
          runner_id: string | null
          schedule_authorization_version: number | null
          schedule_id: number | null
          source_results: Json | null
          stage: string | null
          started_at: string | null
          state: string
          worker_epoch: number | null
          workspace_id: string
        }
        Insert: {
          authorization_kind?: string | null
          authorization_version?: number | null
          browser_session_id?: string | null
          connection_id: string
          counts?: Json | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          lease_expires_at?: string | null
          observed_at?: string | null
          requested_by: string
          runner_id?: string | null
          schedule_authorization_version?: number | null
          schedule_id?: number | null
          source_results?: Json | null
          stage?: string | null
          started_at?: string | null
          state?: string
          worker_epoch?: number | null
          workspace_id: string
        }
        Update: {
          authorization_kind?: string | null
          authorization_version?: number | null
          browser_session_id?: string | null
          connection_id?: string
          counts?: Json | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          lease_expires_at?: string | null
          observed_at?: string | null
          requested_by?: string
          runner_id?: string | null
          schedule_authorization_version?: number | null
          schedule_id?: number | null
          source_results?: Json | null
          stage?: string | null
          started_at?: string | null
          state?: string
          worker_epoch?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_operations_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_sync_schedules: {
        Row: {
          activated_by: string
          authorization_version: number
          connection_id: string
          consecutive_failures: number
          created_at: string
          enabled: boolean
          id: number
          interval_minutes: number
          last_attempt_at: string | null
          last_success_at: string | null
          next_due_at: string | null
          paused_reason: string | null
          retry_after: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activated_by: string
          authorization_version?: number
          connection_id: string
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          id?: never
          interval_minutes?: number
          last_attempt_at?: string | null
          last_success_at?: string | null
          next_due_at?: string | null
          paused_reason?: string | null
          retry_after?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activated_by?: string
          authorization_version?: number
          connection_id?: string
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          id?: never
          interval_minutes?: number
          last_attempt_at?: string | null
          last_success_at?: string | null
          next_due_at?: string | null
          paused_reason?: string | null
          retry_after?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sync_schedules_workspace_id_connection_id_fkey"
            columns: ["workspace_id", "connection_id"]
            isOneToOne: true
            referencedRelation: "marketplace_connections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      marketplace_worker_runtime: {
        Row: {
          expires_at: string
          heartbeat_at: string
          id: number
          worker_epoch: number
          worker_id: string
        }
        Insert: {
          expires_at: string
          heartbeat_at: string
          id?: never
          worker_epoch: number
          worker_id: string
        }
        Update: {
          expires_at?: string
          heartbeat_at?: string
          id?: never
          worker_epoch?: number
          worker_id?: string
        }
        Relationships: []
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
          market_data_verified: boolean
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
          market_data_verified?: boolean
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
          market_data_verified?: boolean
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
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_sale_states"
            referencedColumns: ["workspace_id", "inventory_item_id"]
          },
          {
            foreignKeyName: "price_tracked_items_inventory_item_id_fkey"
            columns: ["workspace_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["workspace_id", "id"]
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
      product_categories: {
        Row: {
          full_name: string
          id: string
          is_deprecated: boolean
          is_leaf: boolean
          level: number
          name: string
          parent_id: string | null
          taxonomy_version: string
        }
        Insert: {
          full_name: string
          id: string
          is_deprecated?: boolean
          is_leaf?: boolean
          level: number
          name: string
          parent_id?: string | null
          taxonomy_version: string
        }
        Update: {
          full_name?: string
          id?: string
          is_deprecated?: boolean
          is_leaf?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          taxonomy_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
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
          tax_treatment: string | null
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
          tax_treatment?: string | null
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
          tax_treatment?: string | null
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
      purchase_documents: {
        Row: {
          company_snapshot: Json | null
          created_at: string
          created_by: string | null
          document_type: string
          file_size: number
          id: string
          mime_type: string
          original_file_name: string
          purchase_id: string
          source_finalized_at: string | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          company_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          document_type: string
          file_size: number
          id?: string
          mime_type: string
          original_file_name: string
          purchase_id: string
          source_finalized_at?: string | null
          storage_path: string
          workspace_id: string
        }
        Update: {
          company_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_file_name?: string
          purchase_id?: string
          source_finalized_at?: string | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_documents_workspace_id_purchase_id_fkey"
            columns: ["workspace_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
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
          is_package: boolean
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
          is_package?: boolean
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
          is_package?: boolean
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
      purchase_package_capture_requests: {
        Row: {
          created_at: string
          id: number
          purchase_line_id: string
          request_id: string
          request_items: Json
          response: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          purchase_line_id: string
          request_id: string
          request_items: Json
          response: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: never
          purchase_line_id?: string
          request_id?: string
          request_items?: Json
          response?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_package_capture_requ_workspace_id_purchase_line_i_fkey"
            columns: ["workspace_id", "purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_package_capture_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          pricing_mode: string | null
          purchase_date: string
          purchase_price: number | null
          receipt_mode: string
          receiving_status: string
          record_number: string | null
          request_id: string | null
          seller_address_extra: string | null
          seller_city: string | null
          seller_country_code: string | null
          seller_details_version: number
          seller_name: string | null
          seller_postal_code: string | null
          seller_street: string | null
          seller_type: string | null
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
          pricing_mode?: string | null
          purchase_date?: string
          purchase_price?: number | null
          receipt_mode?: string
          receiving_status?: string
          record_number?: string | null
          request_id?: string | null
          seller_address_extra?: string | null
          seller_city?: string | null
          seller_country_code?: string | null
          seller_details_version?: number
          seller_name?: string | null
          seller_postal_code?: string | null
          seller_street?: string | null
          seller_type?: string | null
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
          pricing_mode?: string | null
          purchase_date?: string
          purchase_price?: number | null
          receipt_mode?: string
          receiving_status?: string
          record_number?: string | null
          request_id?: string | null
          seller_address_extra?: string | null
          seller_city?: string | null
          seller_country_code?: string | null
          seller_details_version?: number
          seller_name?: string | null
          seller_postal_code?: string | null
          seller_street?: string | null
          seller_type?: string | null
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
          credit_note_snapshot: Json | null
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
          credit_note_snapshot?: Json | null
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
          credit_note_snapshot?: Json | null
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
          active_tax_unit_costs: number[] | null
          active_unit_costs: number[] | null
          allocated_cost: number
          consumption_sequence: number | null
          created_at: string
          id: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          tax_cost_allocations: Json | null
          tax_purchase_cost: number | null
          unit_cost: number
          workspace_id: string
        }
        Insert: {
          active_allocated_cost?: number | null
          active_tax_unit_costs?: number[] | null
          active_unit_costs?: number[] | null
          allocated_cost?: number
          consumption_sequence?: number | null
          created_at?: string
          id?: string
          quantity: number
          sale_line_id: string
          stock_lot_id: string
          tax_cost_allocations?: Json | null
          tax_purchase_cost?: number | null
          unit_cost: number
          workspace_id: string
        }
        Update: {
          active_allocated_cost?: number | null
          active_tax_unit_costs?: number[] | null
          active_unit_costs?: number[] | null
          allocated_cost?: number
          consumption_sequence?: number | null
          created_at?: string
          id?: string
          quantity?: number
          sale_line_id?: string
          stock_lot_id?: string
          tax_cost_allocations?: Json | null
          tax_purchase_cost?: number | null
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
          cost_of_goods_sold: number | null
          created_at: string
          id: string
          inventory_item_id: string | null
          line_total: number
          quantity: number
          sale_id: string
          tax_cost_allocations: Json | null
          tax_mode: string
          tax_purchase_cost: number | null
          title_snapshot: string
          unit_sale_price: number
          workspace_id: string
        }
        Insert: {
          catalog_product_id?: string | null
          cost_of_goods_sold?: number | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_total: number
          quantity: number
          sale_id: string
          tax_cost_allocations?: Json | null
          tax_mode: string
          tax_purchase_cost?: number | null
          title_snapshot: string
          unit_sale_price: number
          workspace_id: string
        }
        Update: {
          catalog_product_id?: string | null
          cost_of_goods_sold?: number | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          quantity?: number
          sale_id?: string
          tax_cost_allocations?: Json | null
          tax_mode?: string
          tax_purchase_cost?: number | null
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
      server_storage_status: {
        Row: {
          available_bytes: number
          id: number
          reported_at: string
          total_bytes: number
          used_bytes: number
        }
        Insert: {
          available_bytes: number
          id?: number
          reported_at?: string
          total_bytes: number
          used_bytes: number
        }
        Update: {
          available_bytes?: number
          id?: number
          reported_at?: string
          total_bytes?: number
          used_bytes?: number
        }
        Relationships: []
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
            columns: ["workspace_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["workspace_id", "id"]
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
      sniper_favorites: {
        Row: {
          external_id: string
          id: string
          removed_at: string | null
          saved_at: string
          snapshot: Json | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          external_id: string
          id?: string
          removed_at?: string | null
          saved_at?: string
          snapshot?: Json | null
          user_id: string
          workspace_id: string
        }
        Update: {
          external_id?: string
          id?: string
          removed_at?: string | null
          saved_at?: string
          snapshot?: Json | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sniper_favorites_workspace_id_fkey"
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
      sniper_origin_state: {
        Row: {
          blocked_until: string | null
          origin: string
          probe_in_flight: boolean
          reason: string | null
          state: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          origin: string
          probe_in_flight?: boolean
          reason?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          origin?: string
          probe_in_flight?: boolean
          reason?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      sniper_queries: {
        Row: {
          brand_id: number | null
          brand_ids: number[]
          brand_names: string[]
          catalog_id: number | null
          consecutive_failures: number
          created_at: string
          deleted_at: string | null
          filter_format_version: number
          filter_revision: number
          id: string
          is_active: boolean
          is_seeded: boolean
          is_standard: boolean
          keyword_mode: string
          last_attempt_at: string | null
          last_error_at: string | null
          last_error_kind: string | null
          last_error_message: string | null
          last_polled_at: string | null
          last_status: string
          last_success_at: string | null
          marketplace: string
          next_attempt_at: string | null
          notes: string | null
          poll_interval_ms: number
          price_from: number | null
          price_to: number | null
          query_key: string
          request_cursor: number
          run_state: string
          search_text: string | null
          seeded_requests: number[]
          title: string
          title_keywords: string[]
          updated_at: string
        }
        Insert: {
          brand_id?: number | null
          brand_ids?: number[]
          brand_names?: string[]
          catalog_id?: number | null
          consecutive_failures?: number
          created_at?: string
          deleted_at?: string | null
          filter_format_version?: number
          filter_revision?: number
          id?: string
          is_active?: boolean
          is_seeded?: boolean
          is_standard?: boolean
          keyword_mode?: string
          last_attempt_at?: string | null
          last_error_at?: string | null
          last_error_kind?: string | null
          last_error_message?: string | null
          last_polled_at?: string | null
          last_status?: string
          last_success_at?: string | null
          marketplace?: string
          next_attempt_at?: string | null
          notes?: string | null
          poll_interval_ms?: number
          price_from?: number | null
          price_to?: number | null
          query_key: string
          request_cursor?: number
          run_state?: string
          search_text?: string | null
          seeded_requests?: number[]
          title?: string
          title_keywords?: string[]
          updated_at?: string
        }
        Update: {
          brand_id?: number | null
          brand_ids?: number[]
          brand_names?: string[]
          catalog_id?: number | null
          consecutive_failures?: number
          created_at?: string
          deleted_at?: string | null
          filter_format_version?: number
          filter_revision?: number
          id?: string
          is_active?: boolean
          is_seeded?: boolean
          is_standard?: boolean
          keyword_mode?: string
          last_attempt_at?: string | null
          last_error_at?: string | null
          last_error_kind?: string | null
          last_error_message?: string | null
          last_polled_at?: string | null
          last_status?: string
          last_success_at?: string | null
          marketplace?: string
          next_attempt_at?: string | null
          notes?: string | null
          poll_interval_ms?: number
          price_from?: number | null
          price_to?: number | null
          query_key?: string
          request_cursor?: number
          run_state?: string
          search_text?: string | null
          seeded_requests?: number[]
          title?: string
          title_keywords?: string[]
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
          search_filter_reported_at: string | null
          search_filter_version: number
          vinted_connected_since: string | null
          vinted_last_success_at: string | null
        }
        Insert: {
          id: number
          last_cycle_error?: string | null
          rejected_last_minute: number
          reported_at: string
          request_budget: number
          requests_last_minute: number
          search_filter_reported_at?: string | null
          search_filter_version?: number
          vinted_connected_since?: string | null
          vinted_last_success_at?: string | null
        }
        Update: {
          id?: number
          last_cycle_error?: string | null
          rejected_last_minute?: number
          reported_at?: string
          request_budget?: number
          requests_last_minute?: number
          search_filter_reported_at?: string | null
          search_filter_version?: number
          vinted_connected_since?: string | null
          vinted_last_success_at?: string | null
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
          remaining_tax_unit_costs: number[] | null
          remaining_unit_costs: number[] | null
          unit_cost: number | null
          unit_tax_purchase_cost: number | null
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
          remaining_tax_unit_costs?: number[] | null
          remaining_unit_costs?: number[] | null
          unit_cost?: number | null
          unit_tax_purchase_cost?: number | null
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
          remaining_tax_unit_costs?: number[] | null
          remaining_unit_costs?: number[] | null
          unit_cost?: number | null
          unit_tax_purchase_cost?: number | null
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
          category_count_high_water: number
          id: number
          last_attempt_at: string | null
          last_error: string | null
          refreshed_at: string | null
          requested_at: string | null
        }
        Insert: {
          category_count?: number
          category_count_high_water?: number
          id?: number
          last_attempt_at?: string | null
          last_error?: string | null
          refreshed_at?: string | null
          requested_at?: string | null
        }
        Update: {
          category_count?: number
          category_count_high_water?: number
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
      webhook_dispatch_claims: {
        Row: {
          channel: string
          claimed_at: string
          delivered_at: string | null
          event: string
          id: string
          workspace_id: string
        }
        Insert: {
          channel: string
          claimed_at?: string
          delivered_at?: string | null
          event: string
          id?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          claimed_at?: string
          delivered_at?: string | null
          event?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_dispatch_claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_company_profiles: {
        Row: {
          bank_account_holder: string | null
          bank_name: string | null
          bic: string | null
          city: string | null
          company_name: string | null
          country_code: string | null
          created_at: string
          email: string | null
          federal_state: string | null
          house_number: string | null
          iban: string | null
          legal_form: string | null
          legal_name: string | null
          logo_path: string | null
          mailing_address_enabled: boolean
          mailing_city: string | null
          mailing_country_code: string | null
          mailing_house_number: string | null
          mailing_postal_code: string | null
          mailing_street: string | null
          phone: string | null
          postal_code: string | null
          street: string | null
          tax_number: string | null
          tax_office: string | null
          updated_at: string
          vat_id: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          federal_state?: string | null
          house_number?: string | null
          iban?: string | null
          legal_form?: string | null
          legal_name?: string | null
          logo_path?: string | null
          mailing_address_enabled?: boolean
          mailing_city?: string | null
          mailing_country_code?: string | null
          mailing_house_number?: string | null
          mailing_postal_code?: string | null
          mailing_street?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_number?: string | null
          tax_office?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          federal_state?: string | null
          house_number?: string | null
          iban?: string | null
          legal_form?: string | null
          legal_name?: string | null
          logo_path?: string | null
          mailing_address_enabled?: boolean
          mailing_city?: string | null
          mailing_country_code?: string | null
          mailing_house_number?: string | null
          mailing_postal_code?: string | null
          mailing_street?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_number?: string | null
          tax_office?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_company_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_licenses: {
        Row: {
          access_source: string
          beta_application_id: string | null
          created_at: string
          ended_at: string | null
          ends_at: string | null
          granted_days: number
          starts_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_source?: string
          beta_application_id?: string | null
          created_at?: string
          ended_at?: string | null
          ends_at?: string | null
          granted_days: number
          starts_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_source?: string
          beta_application_id?: string | null
          created_at?: string
          ended_at?: string | null
          ends_at?: string | null
          granted_days?: number
          starts_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_licenses_beta_application_id_fkey"
            columns: ["beta_application_id"]
            isOneToOne: true
            referencedRelation: "beta_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_licenses_workspace_id_fkey"
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
          setup_completed_at: string | null
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
          setup_completed_at?: string | null
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
          setup_completed_at?: string | null
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
      accept_beta_application: {
        Args: { p_application_id: string; p_granted_days: number }
        Returns: {
          auth_user_id: string | null
          consent_at: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          email: string
          first_name: string
          granted_days: number | null
          id: string
          invitation_expires_at: string | null
          invitation_last_error: string | null
          invitation_sent_at: string | null
          invitation_status: string
          last_name: string
          operator_email_last_error: string | null
          operator_email_sent_at: string | null
          operator_email_status: string
          receipt_email_last_error: string | null
          receipt_email_sent_at: string | null
          receipt_email_status: string
          registered_at: string | null
          registration_link_kind: string
          rejection_email_last_error: string | null
          rejection_email_sent_at: string | null
          rejection_email_status: string
          revoked_at: string | null
          status: string
          withdrawal_last_error: string | null
          withdrawal_status: string
          withdrawal_user_id: string | null
          withdrawal_workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "beta_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_beta_access: {
        Args: never
        Returns: {
          access_source: string
          beta_application_id: string | null
          created_at: string
          ended_at: string | null
          ends_at: string | null
          granted_days: number
          starts_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workspace_licenses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
          setup_completed_at: string | null
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
      begin_beta_registration: {
        Args: { p_request_id: string; p_token_hash: string }
        Returns: Json
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
      can_access_workspace: { Args: { ws_id: string }; Returns: boolean }
      can_administer_workspace: { Args: { ws_id: string }; Returns: boolean }
      can_manage_company_logo_path: {
        Args: { p_path: string }
        Returns: boolean
      }
      capture_purchase_package_contents: {
        Args: {
          p_items: Json
          p_purchase_line_id: string
          p_request_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      change_beta_duration: {
        Args: {
          p_action: string
          p_application_id: string
          p_days: number
          p_request_id: string
        }
        Returns: {
          access_source: string
          beta_application_id: string | null
          created_at: string
          ended_at: string | null
          ends_at: string | null
          granted_days: number
          starts_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_beta_lifecycle_operation: {
        Args: {
          p_action: string
          p_application_id: string
          p_request_id: string
        }
        Returns: {
          action: string
          application_id: string | null
          created_at: string
          id: number
          lease_expires_at: string
          lease_id: string
          request_id: string
          result: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "beta_lifecycle_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_server_webhook_dispatch: {
        Args: { p_channel: string; p_event: string; p_workspace_id: string }
        Returns: boolean
      }
      clear_sniper_favorites: {
        Args: { p_expected_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      company_document_party: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      complete_beta_invitation: {
        Args: {
          p_error: string
          p_lease_id: string
          p_request_id: string
          p_sent: boolean
        }
        Returns: Json
      }
      complete_beta_registration: {
        Args: { p_lease_id: string; p_request_id: string }
        Returns: Json
      }
      complete_beta_withdrawal: {
        Args: { p_lease_id: string; p_request_id: string }
        Returns: undefined
      }
      complete_sniper_search_filter_run: {
        Args: {
          p_cursor: number
          p_listings: Json
          p_query_id: string
          p_revision: number
        }
        Returns: Json
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
      create_catalog_product_variant: {
        Args: {
          p_color: string
          p_ean: string
          p_listing_price: number
          p_product_id: string
          p_size: string
          p_sku: string
          p_workspace_id: string
        }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
          color: string | null
          condition: string | null
          condition_notes: string | null
          created_at: string
          description: string | null
          ean: string | null
          id: string
          is_public_store: boolean
          listing_price: number | null
          material: string | null
          model: string | null
          seo_description: string | null
          seo_title: string | null
          size: string | null
          sku: string | null
          title: string
          tracking_mode: string
          updated_at: string
          url_handle: string | null
          variant_group_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "catalog_products"
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
      delete_purchase_draft: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: undefined
      }
      delete_rejected_beta_application: {
        Args: { p_application_id: string }
        Returns: string
      }
      delete_sniper_query: { Args: { p_id: string }; Returns: undefined }
      delete_sniper_watchlist: {
        Args: { p_id: string; p_workspace_id: string }
        Returns: undefined
      }
      delete_unused_article: {
        Args: {
          p_article_id: string
          p_article_kind: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ebay_begin_authorization: {
        Args: {
          p_environment: string
          p_state_hash: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ebay_can_connect: { Args: { p_workspace_id: string }; Returns: boolean }
      ebay_claim_connection: {
        Args: {
          p_connection_id: string
          p_operation_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ebay_clear_order_recorded_elsewhere: {
        Args: {
          p_connection_id: string
          p_source_key: string
          p_user_id: string
        }
        Returns: boolean
      }
      ebay_complete_authorization: {
        Args: {
          p_connection_id: string
          p_encrypted_tokens: string
          p_external_account_id: string
          p_username: string
          p_version: number
        }
        Returns: boolean
      }
      ebay_consume_authorization: {
        Args: { p_state_hash: string }
        Returns: Json
      }
      ebay_delete_account: {
        Args: { p_environment: string; p_external_account_id: string }
        Returns: undefined
      }
      ebay_disconnect: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: boolean
      }
      ebay_finish_read: {
        Args: {
          p_connection_id: string
          p_encrypted_tokens?: string
          p_needs_login?: boolean
          p_observed?: boolean
          p_operation_id: string
          p_version: number
        }
        Returns: boolean
      }
      ebay_get_order_booking: {
        Args: {
          p_connection_id: string
          p_source_key: string
          p_user_id: string
        }
        Returns: Json
      }
      ebay_import_target: {
        Args: { p_target: Json; p_workspace_id: string }
        Returns: Json
      }
      ebay_lock_import_connection: {
        Args: {
          p_connection_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          authorization_version: number
          created_at: string
          environment: string
          external_account_id: string | null
          id: string
          last_read_at: string | null
          operation_expires_at: string | null
          operation_id: string | null
          status: string
          updated_at: string
          user_id: string
          username: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ebay_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ebay_mark_order_recorded_elsewhere: {
        Args: {
          p_connection_id: string
          p_reason: string
          p_sale_id: string
          p_snapshot_id: string
          p_user_id: string
        }
        Returns: Json
      }
      ebay_record_order_sale: {
        Args: {
          p_assignments: Json
          p_connection_id: string
          p_costs: Json
          p_snapshot_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ebay_remove_article_mapping: {
        Args: {
          p_connection_id: string
          p_mapping_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      ebay_set_article_mapping: {
        Args: {
          p_connection_id: string
          p_listing_id: string
          p_target: Json
          p_variation_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ebay_store_order_snapshot: {
        Args: {
          p_booking_ready: boolean
          p_connection_id: string
          p_operation_id: string
          p_review_hash: string
          p_source: Json
          p_source_key: string
          p_user_id: string
          p_version: number
        }
        Returns: Json
      }
      ebay_valid_cents: { Args: { p_value: Json }; Returns: boolean }
      end_listing: {
        Args: { p_listing_id: string; p_workspace_id: string }
        Returns: {
          catalog_product_id: string | null
          created_at: string
          description: string
          end_reason: string | null
          ended_at: string | null
          id: string
          image_selection_saved: boolean
          inventory_item_id: string | null
          item_details: Json
          last_listed_at: string | null
          listed_count: number
          online_since: string | null
          platform: string
          postal_code: string | null
          price: number
          price_type: string
          shipping_price: number | null
          shipping_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expense_audit_values: {
        Args: { p_expense: Database["public"]["Tables"]["expenses"]["Row"] }
        Returns: Json
      }
      expense_recurring_rule_audit_values: {
        Args: {
          p_rule: Database["public"]["Tables"]["expense_recurring_rules"]["Row"]
        }
        Returns: Json
      }
      export_audit_snapshot: {
        Args: { p_filter?: Json; p_workspace_id: string }
        Returns: Json
      }
      fail_beta_lifecycle_operation: {
        Args: { p_lease_id: string; p_request_id: string }
        Returns: undefined
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
      get_workspace_company_settings: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      has_purchase_recorded_sales: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: boolean
      }
      import_sniper_favorites: {
        Args: {
          p_expected_user_id: string
          p_items: Json
          p_workspace_id: string
        }
        Returns: number
      }
      inspect_beta_registration: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      is_catalog_product_media_path: {
        Args: { p_path: string; p_product_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_company_logo_path: {
        Args: { p_path: string; p_workspace_id: string }
        Returns: boolean
      }
      is_expense_document_path: {
        Args: { p_expense_id: string; p_path: string; p_workspace_id: string }
        Returns: boolean
      }
      is_platform_operator: { Args: never; Returns: boolean }
      is_purchase_document_path: {
        Args: { p_path: string; p_purchase_id: string; p_workspace_id: string }
        Returns: boolean
      }
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
      list_my_workspace_access: {
        Args: never
        Returns: {
          access_status: string
          ends_at: string
          server_time: string
          workspace_id: string
        }[]
      }
      list_platform_beta_lifecycle: {
        Args: never
        Returns: {
          application_id: string
          auth_user_id: string
          ended_at: string
          invitation_expires_at: string
          revoked_at: string
          workspace_id: string
        }[]
      }
      list_platform_user_recent_actions: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          event_id: string
          event_type: string
        }[]
      }
      list_platform_user_usage: {
        Args: never
        Returns: {
          application_status: string
          beta_ends_at: string
          beta_starts_at: string
          email: string
          full_name: string
          invitation_status: string
          last_action_at: string
          last_sign_in_at: string
          license_status: string
          purchases_created_30_days: number
          registered_at: string
          sales_recorded_30_days: number
          user_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      list_platform_users: {
        Args: never
        Returns: {
          application_status: string
          beta_ends_at: string
          beta_starts_at: string
          email: string
          full_name: string
          invitation_status: string
          license_status: string
          registered_at: string
          user_id: string
          workspace_id: string
          workspace_name: string
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
      marketplace_apply_vinted_import: {
        Args: {
          p_connection_id: string
          p_session_id: string
          p_snapshot: Json
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_apply_vinted_sync_import: {
        Args: {
          p_operation_id: string
          p_runner_id: string
          p_session_id: string
          p_snapshot: Json
          p_worker_epoch: number
        }
        Returns: Json
      }
      marketplace_approve_cloud_messages: {
        Args: {
          p_connection_id: string
          p_expected_external_account_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_approve_local_extension: {
        Args: {
          p_connection_id: string
          p_expected_external_account_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_approve_local_inbox: {
        Args: {
          p_connection_id: string
          p_expected_external_account_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_approve_local_messaging: {
        Args: {
          p_connection_id: string
          p_expected_external_account_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_browser_confirm_account: {
        Args: {
          p_connection_id: string
          p_external_account_id: string
          p_session_id: string
          p_user_id: string
          p_username: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_browser_session_bind_worker: {
        Args: {
          p_session_id: string
          p_worker_epoch: number
          p_worker_id: string
        }
        Returns: boolean
      }
      marketplace_browser_session_check: {
        Args: {
          p_connection_id: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_browser_session_reserve: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_browser_session_revoke: {
        Args: {
          p_connection_id: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cache_listing_text: {
        Args: {
          p_confirmed?: boolean
          p_connection_id: string
          p_entry_id: string
          p_external_id: string
          p_price?: number
          p_text: string
          p_title?: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      marketplace_cache_profile_about: {
        Args: {
          p_about: string
          p_account_id: string
          p_connection_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      marketplace_can_manage: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      marketplace_cloud_message_begin: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_message_id: string
          p_worker_epoch: number
          p_worker_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cloud_message_check: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_message_id: string
          p_worker_epoch: number
          p_worker_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cloud_message_claim: {
        Args: {
          p_runner_id: string
          p_worker_epoch: number
          p_worker_id: string
        }
        Returns: Json
      }
      marketplace_cloud_message_finish: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_error_code?: string
          p_external_message_id?: string
          p_message_id: string
          p_outcome: string
          p_worker_epoch: number
          p_worker_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cloud_message_permission_valid: {
        Args: {
          p_connection_id: string
          p_user_id: string
          p_version?: number
          p_workspace_id: string
        }
        Returns: boolean
      }
      marketplace_cloud_network_valid: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: boolean
      }
      marketplace_cloud_setup_begin: {
        Args: {
          p_connection_id: string
          p_display_name: string
          p_request_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cloud_setup_cancel: {
        Args: { p_setup_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_cloud_setup_public: {
        Args: {
          p_setup: Database["public"]["Tables"]["marketplace_cloud_setups"]["Row"]
        }
        Returns: Json
      }
      marketplace_cloud_setup_read: {
        Args: { p_setup_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_cloud_setup_session_check: {
        Args: {
          p_session_id: string
          p_setup_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_cloud_setup_session_reserve: {
        Args: { p_setup_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_cloud_setup_update: {
        Args: {
          p_action: string
          p_external_account_id?: string
          p_profile_id?: string
          p_setup_id: string
          p_user_id: string
          p_username?: string
          p_worker_epoch: number
          p_worker_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_create_connection: {
        Args: { p_display_name: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_enqueue_local_message: {
        Args: {
          p_attachment?: Json
          p_connection_id: string
          p_conversation_id: string
          p_request_id: string
          p_text: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_enqueue_message: {
        Args: {
          p_attachment?: Json
          p_connection_id: string
          p_conversation_id: string
          p_request_id: string
          p_text: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_favorite_message_config_valid: {
        Args: { p_config: Json }
        Returns: boolean
      }
      marketplace_favorite_message_text: {
        Args: { p_at: string; p_config: Json; p_price: number; p_seed: string }
        Returns: string
      }
      marketplace_finalize_favorite_import: {
        Args: {
          p_connection_id: string
          p_observed_at: string
          p_publications_success: boolean
          p_workspace_id: string
        }
        Returns: undefined
      }
      marketplace_import_local_favorites: {
        Args: {
          p_connection_id: string
          p_events: Json
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_import_local_inbox: {
        Args: {
          p_batch: Json
          p_connection_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_ingest_local_extension: {
        Args: {
          p_connection_id: string
          p_snapshot?: Json
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_known_favorite_count: {
        Args: { p_body: Json }
        Returns: number
      }
      marketplace_known_metric_count: {
        Args: { p_body: Json; p_metric: string }
        Returns: number
      }
      marketplace_list_connections: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      marketplace_local_extension_user_valid: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      marketplace_local_favorite_claim:
        | {
            Args: {
              p_connection_id: string
              p_token_hash: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_connection_id: string
              p_offer_supported: boolean
              p_token_hash: string
              p_workspace_id: string
            }
            Returns: Json
          }
      marketplace_local_favorite_finish: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_error_code?: string
          p_event_id: string
          p_external_message_id?: string
          p_outcome: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_favorite_message_sent: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_conversation_id: string
          p_event_id: string
          p_external_message_id: string
          p_token_hash: string
          p_transaction_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_favorite_offer_finish: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_error_code?: string
          p_event_id: string
          p_external_offer_id?: string
          p_outcome: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_favorite_offer_start: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_event_id: string
          p_offer_price_cents: number
          p_original_price_cents: number
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_favorite_start: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_event_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_favorites_state: {
        Args: {
          p_connection_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_inbox_detail_import: {
        Args: {
          p_batch: Json
          p_connection_id: string
          p_conversation_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_inbox_detail_state: {
        Args: {
          p_connection_id: string
          p_conversation_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_inbox_state: {
        Args: {
          p_connection_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_message_authorized: {
        Args: {
          p_connection_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: {
          approved_by: string
          connection_id: string
          expires_at: string
          external_account_id: string
          grant_generation: number
          id: number
          inbox_next_page: number
          last_seen_at: string | null
          messages_read: boolean
          messages_send: boolean
          revoked_at: string | null
          token_hash: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_local_extension_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marketplace_local_message_claim: {
        Args: {
          p_connection_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_message_finish: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_error_code?: string
          p_external_message_id?: string
          p_message_id: string
          p_outcome: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_local_message_public: {
        Args: {
          p_message: Database["public"]["Tables"]["marketplace_local_message_outbox"]["Row"]
        }
        Returns: Json
      }
      marketplace_local_message_start: {
        Args: {
          p_claim_token: string
          p_connection_id: string
          p_message_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_mark_favorite_notifications: {
        Args: {
          p_clear?: boolean
          p_notification_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_mark_feedback_notifications: {
        Args: {
          p_clear?: boolean
          p_notification_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_mark_message_notifications: {
        Args: {
          p_clear?: boolean
          p_notification_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_prepare_favorite_import: {
        Args: {
          p_connection_id: string
          p_observed_at: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      marketplace_read_favorite_messages: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_favorite_notification_settings: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_favorite_notifications: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_feedback_notifications: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_listing_metric_changes: {
        Args: {
          p_connection_id: string
          p_period_minutes?: number
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_read_local_extension: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_local_messages: {
        Args: {
          p_connection_id: string
          p_conversation_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_read_message_notifications: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_message_permission: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_messages: {
        Args: {
          p_connection_id: string
          p_conversation_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_read_page: {
        Args: {
          p_connection_id: string
          p_cursor?: string
          p_kind: string
          p_parent_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_read_snapshot: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_read_sync_schedule: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_record_message_event_batch: {
        Args: {
          p_batch: Json
          p_connection_id: string
          p_external_account_id: string
          p_workspace_id: string
        }
        Returns: number
      }
      marketplace_rename_connection: {
        Args: {
          p_connection_id: string
          p_display_name: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_reorder_connections: {
        Args: { p_connection_ids: string[]; p_workspace_id: string }
        Returns: Json
      }
      marketplace_retry_local_message: {
        Args: {
          p_confirmed_unknown?: boolean
          p_connection_id: string
          p_conversation_id: string
          p_message_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_retry_message: {
        Args: {
          p_confirmed_unknown?: boolean
          p_connection_id: string
          p_conversation_id: string
          p_message_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_revoke_cloud_messages: {
        Args: {
          p_authorization_version: number
          p_connection_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_revoke_local_extension: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_save_favorite_messages: {
        Args: {
          p_config: Json
          p_connection_id: string
          p_enabled: boolean
          p_expected_version: number
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_set_favorite_notification_settings: {
        Args: {
          p_connection_id: string
          p_enabled: boolean
          p_expected_version: number
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_set_paused: {
        Args: {
          p_connection_id: string
          p_paused: boolean
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_set_sync_schedule: {
        Args: {
          p_authorization_version: number
          p_connection_id: string
          p_enabled: boolean
          p_interval_minutes: number
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_sync_authorization_valid: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      marketplace_sync_check: {
        Args: {
          p_operation_id: string
          p_runner_id: string
          p_worker_epoch: number
        }
        Returns: Json
      }
      marketplace_sync_dispatch_claim: {
        Args: {
          p_include_scheduled?: boolean
          p_runner_id: string
          p_worker_epoch: number
          p_worker_id: string
        }
        Returns: Json
      }
      marketplace_sync_enqueue: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_sync_finish: {
        Args: {
          p_operation_id: string
          p_outcome: Json
          p_runner_id: string
          p_worker_epoch: number
        }
        Returns: boolean
      }
      marketplace_sync_heartbeat: {
        Args: {
          p_operation_id: string
          p_runner_id: string
          p_worker_epoch: number
        }
        Returns: Json
      }
      marketplace_sync_progress: {
        Args: {
          p_operation_id: string
          p_runner_id: string
          p_stage: string
          p_worker_epoch: number
        }
        Returns: boolean
      }
      marketplace_sync_recover: {
        Args: { p_worker_epoch: number; p_worker_id: string }
        Returns: Json
      }
      marketplace_sync_validate: {
        Args: {
          p_operation_id: string
          p_renew?: boolean
          p_runner_id: string
          p_worker_epoch: number
        }
        Returns: Json
      }
      marketplace_test_session_action: {
        Args: {
          p_action: string
          p_connection_id: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_test_session_start: {
        Args: { p_connection_id: string; p_workspace_id: string }
        Returns: Json
      }
      marketplace_test_session_status: {
        Args: {
          p_connection_id: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      marketplace_worker_claim: { Args: { p_worker_id: string }; Returns: Json }
      marketplace_worker_heartbeat: {
        Args: { p_worker_epoch: number; p_worker_id: string }
        Returns: Json
      }
      marketplace_worker_release: {
        Args: { p_worker_epoch: number; p_worker_id: string }
        Returns: boolean
      }
      migrate_legacy_category_brand_texts: { Args: never; Returns: undefined }
      migrate_purchase_costing_legacy: {
        Args: {
          p_confirm: boolean
          p_expected_fingerprint?: string
          p_purchase_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      normalize_purchase_seller_details: {
        Args: { p_details: Json }
        Returns: Json
      }
      normalize_sniper_keyword: { Args: { p_value: string }; Returns: string }
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
      prepare_beta_invitation: {
        Args: {
          p_application_id: string
          p_request_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      prepare_beta_withdrawal: {
        Args: { p_application_id: string; p_request_id: string }
        Returns: Json
      }
      prepare_listing: {
        Args: {
          p_catalog_product_id?: string
          p_content?: Json
          p_inventory_item_id?: string
          p_workspace_id: string
        }
        Returns: {
          catalog_product_id: string | null
          created_at: string
          description: string
          end_reason: string | null
          ended_at: string | null
          id: string
          image_selection_saved: boolean
          inventory_item_id: string | null
          item_details: Json
          last_listed_at: string | null
          listed_count: number
          online_since: string | null
          platform: string
          postal_code: string | null
          price: number
          price_type: string
          shipping_price: number | null
          shipping_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
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
      purchase_has_open_prices: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: boolean
      }
      purchase_seller_details_snapshot: {
        Args: { p_purchase: Database["public"]["Tables"]["purchases"]["Row"] }
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
      record_sniper_search_filter_failure: {
        Args: {
          p_cursor: number
          p_error_kind: string
          p_error_message: string
          p_failure_count: number
          p_next_attempt_at: string
          p_query_id: string
          p_revision: number
          p_run_state: string
          p_status: string
        }
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
          pricing_mode: string | null
          purchase_date: string
          purchase_price: number | null
          receipt_mode: string
          receiving_status: string
          record_number: string | null
          request_id: string | null
          seller_address_extra: string | null
          seller_city: string | null
          seller_country_code: string | null
          seller_details_version: number
          seller_name: string | null
          seller_postal_code: string | null
          seller_street: string | null
          seller_type: string | null
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
      reject_beta_application: {
        Args: { p_application_id: string }
        Returns: {
          auth_user_id: string | null
          consent_at: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          email: string
          first_name: string
          granted_days: number | null
          id: string
          invitation_expires_at: string | null
          invitation_last_error: string | null
          invitation_sent_at: string | null
          invitation_status: string
          last_name: string
          operator_email_last_error: string | null
          operator_email_sent_at: string | null
          operator_email_status: string
          receipt_email_last_error: string | null
          receipt_email_sent_at: string | null
          receipt_email_status: string
          registered_at: string | null
          registration_link_kind: string
          rejection_email_last_error: string | null
          rejection_email_sent_at: string | null
          rejection_email_status: string
          revoked_at: string | null
          status: string
          withdrawal_last_error: string | null
          withdrawal_status: string
          withdrawal_user_id: string | null
          withdrawal_workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "beta_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_sniper_favorite: {
        Args: {
          p_expected_user_id: string
          p_external_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      reopen_purchase_costing: {
        Args: { p_purchase_id: string; p_workspace_id: string }
        Returns: Json
      }
      replace_and_delete_brand: {
        Args: {
          p_brand_id: string
          p_replacement_brand_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      replace_bank_transactions: {
        Args: { p_transactions: Json; p_workspace_id: string }
        Returns: number
      }
      report_server_storage: {
        Args: {
          p_available_bytes: number
          p_total_bytes: number
          p_used_bytes: number
        }
        Returns: undefined
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
          setup_completed_at: string | null
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
      save_server_webhook_config: {
        Args: { p_patch: Json; p_workspace_id: string }
        Returns: Json
      }
      save_sniper_favorite: {
        Args: {
          p_expected_user_id: string
          p_import_only?: boolean
          p_item: Json
          p_workspace_id: string
        }
        Returns: boolean
      }
      save_sniper_search_filter: {
        Args: {
          p_brands: Json
          p_catalog_id: number
          p_expected_revision: number
          p_id: string
          p_keyword_mode: string
          p_notes: string
          p_poll_interval_ms: number
          p_price_from?: number
          p_price_to?: number
          p_search_text?: string
          p_title: string
          p_title_keywords: string[]
        }
        Returns: string
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
      seed_default_expense_categories: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      set_catalog_product_archived: {
        Args: {
          p_archived: boolean
          p_product_id: string
          p_workspace_id: string
        }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
          color: string | null
          condition: string | null
          condition_notes: string | null
          created_at: string
          description: string | null
          ean: string | null
          id: string
          is_public_store: boolean
          listing_price: number | null
          material: string | null
          model: string | null
          seo_description: string | null
          seo_title: string | null
          size: string | null
          sku: string | null
          title: string
          tracking_mode: string
          updated_at: string
          url_handle: string | null
          variant_group_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "catalog_products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_inventory_item_archived: {
        Args: { p_archived: boolean; p_item_id: string; p_workspace_id: string }
        Returns: {
          allocated_purchase_cost: number | null
          archived_at: string | null
          archived_by: string | null
          brand: string | null
          brand_id: string | null
          category: string | null
          category_id: string | null
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
          source_package_line_id: string | null
          status: string
          tax_mode_override: string | null
          tax_purchase_cost: number | null
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
      set_listing_online: {
        Args: { p_listing_id: string; p_workspace_id: string }
        Returns: {
          catalog_product_id: string | null
          created_at: string
          description: string
          end_reason: string | null
          ended_at: string | null
          id: string
          image_selection_saved: boolean
          inventory_item_id: string | null
          item_details: Json
          last_listed_at: string | null
          listed_count: number
          online_since: string | null
          platform: string
          postal_code: string | null
          price: number
          price_type: string
          shipping_price: number | null
          shipping_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
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
          setup_completed_at: string | null
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
      set_workspace_company_logo: {
        Args: { p_logo_path: string; p_workspace_id: string }
        Returns: Json
      }
      sniper_check_favorite_scope: {
        Args: { p_expected_user_id: string; p_workspace_id: string }
        Returns: string
      }
      sniper_evaluate_hits: {
        Args: { p_query_id: string; p_report_hits?: boolean }
        Returns: number
      }
      sniper_evaluate_pending_watchlist_hits: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      sniper_evaluate_watchlist_hits: {
        Args: { p_query_id: string; p_report_hits?: boolean }
        Returns: number
      }
      sniper_favorites_page: {
        Args: {
          p_before_id?: string
          p_before_time?: string
          p_expected_user_id: string
          p_limit?: number
          p_workspace_id: string
        }
        Returns: Json
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
      sniper_feed_by_brand: {
        Args: {
          p_before_id: string
          p_before_time: string
          p_brand: string
          p_limit: number
          p_watchlist_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sniper_feed_filtered: {
        Args: {
          p_before_id: string
          p_before_time: string
          p_brand: string
          p_limit: number
          p_max_price: number
          p_min_price: number
          p_size: string
          p_watchlist_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sniper_feed_matches_size: {
        Args: { p_filter_size: string; p_listing_size: string }
        Returns: boolean
      }
      sniper_feed_search: {
        Args: {
          p_before_id: string
          p_before_time: string
          p_brand: string
          p_limit: number
          p_max_price: number
          p_min_price: number
          p_size: string
          p_title_query?: string
          p_watchlist_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sniper_normalize_favorite_item: { Args: { p_item: Json }; Returns: Json }
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
      sniper_supported_brands: {
        Args: { p_workspace_id: string }
        Returns: {
          brand: string
        }[]
      }
      sniper_watchlist_matches: {
        Args: {
          p_listing: Database["public"]["Tables"]["sniper_listings"]["Row"]
          p_watchlist: Database["public"]["Tables"]["sniper_watchlists"]["Row"]
        }
        Returns: boolean
      }
      tax_cost_allocations: { Args: { p_unit_costs: number[] }; Returns: Json }
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
      update_product_media_layout: {
        Args: {
          p_expected_media_ids: string[]
          p_ordered_media_ids: string[]
          p_product_id: string
          p_workspace_id: string
        }
        Returns: {
          alt_text: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "catalog_product_media"
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
      update_purchase_seller_details: {
        Args: {
          p_details: Json
          p_expected_version: number
          p_purchase_id: string
          p_reason?: string
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
      update_workspace_company_settings: {
        Args: { p_profile: Json; p_tax_mode: string; p_workspace_id: string }
        Returns: Json
      }
      upsert_sniper_query:
        | {
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
        | {
            Args: {
              p_brand_id: number
              p_id: string
              p_notes: string
              p_poll_interval_ms: number
              p_title: string
            }
            Returns: string
          }
      user_can_access_workspace: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      user_has_workspace_access: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      validate_inventory_item_sale_integrity: {
        Args: { p_inventory_item_id: string }
        Returns: undefined
      }
      validate_listing_content: { Args: { p_content: Json }; Returns: Json }
      validate_listing_item_details: {
        Args: { p_details: Json }
        Returns: Json
      }
      workspace_access_is_valid: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      workspace_has_business_data: {
        Args: { p_workspace_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

