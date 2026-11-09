// src/types/supabase.ts
// GENERADO desde el esquema de Supabase (MCP generate_typescript_types). No editar a mano:
// si cambia el esquema (supabase/migrations/), se vuelve a generar.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          default_page: string | null
          display_name: string
          email: string
          firebase_uid: string | null
          id: string
          must_change_password: boolean
          role_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_page?: string | null
          display_name?: string
          email: string
          firebase_uid?: string | null
          id: string
          must_change_password?: boolean
          role_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_page?: string | null
          display_name?: string
          email?: string
          firebase_uid?: string | null
          id?: string
          must_change_password?: boolean
          role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      atraso_detalles: {
        Row: {
          item_id: string
          motivo: string
          reparto: Json | null
          responsable_legacy: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          item_id: string
          motivo?: string
          reparto?: Json | null
          responsable_legacy?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          item_id?: string
          motivo?: string
          reparto?: Json | null
          responsable_legacy?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      buenas_noticias_suplentes: {
        Row: {
          nombre: string
          semana: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          nombre: string
          semana: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          nombre?: string
          semana?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      board_alcance: {
        Row: {
          alcance: string
          board_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alcance: string
          board_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alcance?: string
          board_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      clasificacion: {
        Row: {
          clase: string
          id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          clase: string
          id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          clase?: string
          id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      implementacion_metas_cliente: {
        Row: {
          cliente: string
          cm1: number
          desde: string | null
          updated_at: string
          updated_by: string | null
          vol: number
        }
        Insert: {
          cliente: string
          cm1: number
          desde?: string | null
          updated_at?: string
          updated_by?: string | null
          vol: number
        }
        Update: {
          cliente?: string
          cm1?: number
          desde?: string | null
          updated_at?: string
          updated_by?: string | null
          vol?: number
        }
        Relationships: []
      }
      implementacion_objetivos: {
        Row: {
          mes: string
          objetivo: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          mes: string
          objetivo: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          mes?: string
          objetivo?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      menu_groups: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_system: boolean
          name: string
          page_keys: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          page_keys?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          page_keys?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      metodologia_califs: {
        Row: {
          comentario: string
          key: string
          score: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comentario?: string
          key: string
          score: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comentario?: string
          key?: string
          score?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      on_hold: {
        Row: {
          created_at: string
          created_by: string
          id: string
          motivo: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          motivo?: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          motivo?: string
          tipo?: string
        }
        Relationships: []
      }
      preprod_restore_dates: {
        Row: {
          fecha: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fecha: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fecha?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      proj_item_baselines: {
        Row: {
          board_id: string
          cost: number
          item_id: string
          saved_at: string
        }
        Insert: {
          board_id: string
          cost?: number
          item_id: string
          saved_at?: string
        }
        Update: {
          board_id?: string
          cost?: number
          item_id?: string
          saved_at?: string
        }
        Relationships: []
      }
      req_baselines: {
        Row: {
          cost_rh: number
          cost_sft: number
          req_id: string
          saved_at: string
        }
        Insert: {
          cost_rh?: number
          cost_sft?: number
          req_id: string
          saved_at?: string
        }
        Update: {
          cost_rh?: number
          cost_sft?: number
          req_id?: string
          saved_at?: string
        }
        Relationships: []
      }
      responsible_attributions: {
        Row: {
          item_id: string
          kind: string
          responsible: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          item_id: string
          kind: string
          responsible: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          item_id?: string
          kind?: string
          responsible?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          answers: Json
          respondent_email: string
          submitted_at: string
          token: string
        }
        Insert: {
          answers?: Json
          respondent_email?: string
          submitted_at?: string
          token: string
        }
        Update: {
          answers?: Json
          respondent_email?: string
          submitted_at?: string
          token?: string
        }
        Relationships: []
      }
      surveys: {
        Row: {
          answered: boolean
          answered_at: string | null
          assigned_email: string
          assigned_name: string
          cku: string
          created_at: string
          created_by_email: string
          invalidated: boolean
          pm: string
          req_code: string
          req_id: string
          req_name: string
          token: string
        }
        Insert: {
          answered?: boolean
          answered_at?: string | null
          assigned_email: string
          assigned_name?: string
          cku?: string
          created_at?: string
          created_by_email?: string
          invalidated?: boolean
          pm?: string
          req_code?: string
          req_id: string
          req_name?: string
          token: string
        }
        Update: {
          answered?: boolean
          answered_at?: string | null
          assigned_email?: string
          assigned_name?: string
          cku?: string
          created_at?: string
          created_by_email?: string
          invalidated?: boolean
          pm?: string
          req_code?: string
          req_id?: string
          req_name?: string
          token?: string
        }
        Relationships: []
      }
      vpa_califs: {
        Row: {
          indicador: string
          mes: string
          nota: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          indicador: string
          mes: string
          nota: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          indicador?: string
          mes?: string
          nota?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      weekly_snapshots: {
        Row: {
          beneficio_confirmado: number
          calidad: number | null
          created_at: string
          cumplimiento: number | null
          evm: number | null
          nps: number | null
          week_of: string
        }
        Insert: {
          beneficio_confirmado?: number
          calidad?: number | null
          created_at?: string
          cumplimiento?: number | null
          evm?: number | null
          nps?: number | null
          week_of: string
        }
        Update: {
          beneficio_confirmado?: number
          calidad?: number | null
          created_at?: string
          cumplimiento?: number | null
          evm?: number | null
          nps?: number | null
          week_of?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      borrar_grupo: { Args: { p_id: string }; Returns: undefined }
      guardar_fechas_preprod: {
        Args: { p_by: string; p_fechas: string[] }
        Returns: undefined
      }
      guardar_metas_implementacion: {
        Args: { p_by: string; p_metas: Json; p_objetivos: Json }
        Returns: undefined
      }
      reabrir_encuesta: { Args: { p_token: string }; Returns: undefined }
      responder_encuesta: {
        Args: { p_answers: Json; p_respondent_email: string; p_token: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
