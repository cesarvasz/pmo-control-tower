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
      elemento_archivos: {
        Row: {
          borrado_at: string | null
          columna_id: string | null
          comentario_id: string | null
          creado_at: string
          elemento_id: string
          estado: string
          id: string
          monday_asset_id: string | null
          nombre: string
          ruta: string
          subido_email: string | null
          subido_por: string | null
          tablero_id: string
          tamano: number | null
          tipo_mime: string | null
        }
        Insert: {
          borrado_at?: string | null
          columna_id?: string | null
          comentario_id?: string | null
          creado_at?: string
          elemento_id: string
          estado?: string
          id?: string
          monday_asset_id?: string | null
          nombre: string
          ruta: string
          subido_email?: string | null
          subido_por?: string | null
          tablero_id: string
          tamano?: number | null
          tipo_mime?: string | null
        }
        Update: {
          borrado_at?: string | null
          columna_id?: string | null
          comentario_id?: string | null
          creado_at?: string
          elemento_id?: string
          estado?: string
          id?: string
          monday_asset_id?: string | null
          nombre?: string
          ruta?: string
          subido_email?: string | null
          subido_por?: string | null
          tablero_id?: string
          tamano?: number | null
          tipo_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "elemento_archivos_columna_id_fkey"
            columns: ["columna_id"]
            isOneToOne: false
            referencedRelation: "tablero_columnas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elemento_archivos_elemento_id_fkey"
            columns: ["elemento_id"]
            isOneToOne: false
            referencedRelation: "elementos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elemento_archivos_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      elemento_comentarios: {
        Row: {
          autor_email: string | null
          autor_id: string | null
          autor_nombre: string
          borrado_at: string | null
          creado_at: string
          editado_at: string | null
          elemento_id: string
          id: string
          monday_update_id: string | null
          respuesta_a: string | null
          tablero_id: string
          texto: string
        }
        Insert: {
          autor_email?: string | null
          autor_id?: string | null
          autor_nombre?: string
          borrado_at?: string | null
          creado_at?: string
          editado_at?: string | null
          elemento_id: string
          id?: string
          monday_update_id?: string | null
          respuesta_a?: string | null
          tablero_id: string
          texto: string
        }
        Update: {
          autor_email?: string | null
          autor_id?: string | null
          autor_nombre?: string
          borrado_at?: string | null
          creado_at?: string
          editado_at?: string | null
          elemento_id?: string
          id?: string
          monday_update_id?: string | null
          respuesta_a?: string | null
          tablero_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "elemento_comentarios_elemento_id_fkey"
            columns: ["elemento_id"]
            isOneToOne: false
            referencedRelation: "elementos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elemento_comentarios_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      elementos: {
        Row: {
          actualizado_at: string
          archivado_at: string | null
          creado_at: string
          creado_por: string | null
          grupo_id: string | null
          id: string
          monday_item_id: string | null
          nombre: string
          orden: number
          parent_id: string | null
          responsables: string[]
          tablero_id: string
          valores: Json
        }
        Insert: {
          actualizado_at?: string
          archivado_at?: string | null
          creado_at?: string
          creado_por?: string | null
          grupo_id?: string | null
          id?: string
          monday_item_id?: string | null
          nombre?: string
          orden?: number
          parent_id?: string | null
          responsables?: string[]
          tablero_id: string
          valores?: Json
        }
        Update: {
          actualizado_at?: string
          archivado_at?: string | null
          creado_at?: string
          creado_por?: string | null
          grupo_id?: string | null
          id?: string
          monday_item_id?: string | null
          nombre?: string
          orden?: number
          parent_id?: string | null
          responsables?: string[]
          tablero_id?: string
          valores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "elementos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tablero_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elementos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "elementos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elementos_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
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
      monday_boards: {
        Row: {
          activo: boolean
          columnas: Json
          id: string
          nombre: string
          padre_board_id: string | null
          synced_at: string | null
          tipo: string
          updated_at: string
          version: number
        }
        Insert: {
          activo?: boolean
          columnas?: Json
          id: string
          nombre: string
          padre_board_id?: string | null
          synced_at?: string | null
          tipo: string
          updated_at?: string
          version?: number
        }
        Update: {
          activo?: boolean
          columnas?: Json
          id?: string
          nombre?: string
          padre_board_id?: string | null
          synced_at?: string | null
          tipo?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "monday_boards_padre_board_id_fkey"
            columns: ["padre_board_id"]
            isOneToOne: false
            referencedRelation: "monday_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      monday_items: {
        Row: {
          board_id: string
          column_values: Json
          deleted_at: string | null
          email: string | null
          grupo: string | null
          id: string
          nombre: string
          orden: number
          parent_id: string | null
          sub_board_id: string | null
          synced_at: string
        }
        Insert: {
          board_id: string
          column_values?: Json
          deleted_at?: string | null
          email?: string | null
          grupo?: string | null
          id: string
          nombre: string
          orden: number
          parent_id?: string | null
          sub_board_id?: string | null
          synced_at?: string
        }
        Update: {
          board_id?: string
          column_values?: Json
          deleted_at?: string | null
          email?: string | null
          grupo?: string | null
          id?: string
          nombre?: string
          orden?: number
          parent_id?: string | null
          sub_board_id?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monday_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "monday_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      monday_sync_runs: {
        Row: {
          detalle: Json
          error: string | null
          finished_at: string | null
          id: number
          ok: boolean | null
          origen: string
          started_at: string
          tipo: string
        }
        Insert: {
          detalle?: Json
          error?: string | null
          finished_at?: string | null
          id?: never
          ok?: boolean | null
          origen: string
          started_at?: string
          tipo: string
        }
        Update: {
          detalle?: Json
          error?: string | null
          finished_at?: string | null
          id?: never
          ok?: boolean | null
          origen?: string
          started_at?: string
          tipo?: string
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
      personas: {
        Row: {
          activo: boolean
          actualizado_at: string
          app_user_id: string | null
          creado_at: string
          email: string | null
          grupo: string | null
          hrs_mes: number | null
          id: string
          monday_item_id: string | null
          nombre: string
          rol: string | null
          tld: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_at?: string
          app_user_id?: string | null
          creado_at?: string
          email?: string | null
          grupo?: string | null
          hrs_mes?: number | null
          id?: string
          monday_item_id?: string | null
          nombre: string
          rol?: string | null
          tld?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_at?: string
          app_user_id?: string | null
          creado_at?: string
          email?: string | null
          grupo?: string | null
          hrs_mes?: number | null
          id?: string
          monday_item_id?: string | null
          nombre?: string
          rol?: string | null
          tld?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas: {
        Row: {
          actualizado_at: string
          archivada_at: string | null
          categoria: string
          creado_at: string
          creado_por: string | null
          definicion: Json
          descripcion: string | null
          id: string
          nombre: string
          tablero_origen_id: string | null
          version: number
        }
        Insert: {
          actualizado_at?: string
          archivada_at?: string | null
          categoria?: string
          creado_at?: string
          creado_por?: string | null
          definicion?: Json
          descripcion?: string | null
          id?: string
          nombre: string
          tablero_origen_id?: string | null
          version?: number
        }
        Update: {
          actualizado_at?: string
          archivada_at?: string | null
          categoria?: string
          creado_at?: string
          creado_por?: string | null
          definicion?: Json
          descripcion?: string | null
          id?: string
          nombre?: string
          tablero_origen_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_tablero_origen_fk"
            columns: ["tablero_origen_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
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
      tablero_columnas: {
        Row: {
          ancho: number | null
          archivada_at: string | null
          config: Json
          id: string
          monday_column_id: string | null
          nivel: string
          oculta: boolean
          orden: number
          rol: string | null
          tablero_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          ancho?: number | null
          archivada_at?: string | null
          config?: Json
          id?: string
          monday_column_id?: string | null
          nivel?: string
          oculta?: boolean
          orden?: number
          rol?: string | null
          tablero_id: string
          tipo: string
          titulo: string
        }
        Update: {
          ancho?: number | null
          archivada_at?: string | null
          config?: Json
          id?: string
          monday_column_id?: string | null
          nivel?: string
          oculta?: boolean
          orden?: number
          rol?: string | null
          tablero_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tablero_columnas_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      tablero_grupos: {
        Row: {
          archivado_at: string | null
          color: string | null
          fase: string | null
          id: string
          monday_group_id: string | null
          orden: number
          tablero_id: string
          titulo: string
        }
        Insert: {
          archivado_at?: string | null
          color?: string | null
          fase?: string | null
          id?: string
          monday_group_id?: string | null
          orden?: number
          tablero_id: string
          titulo: string
        }
        Update: {
          archivado_at?: string | null
          color?: string | null
          fase?: string | null
          id?: string
          monday_group_id?: string | null
          orden?: number
          tablero_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tablero_grupos_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      tablero_historial: {
        Row: {
          antes: Json | null
          campo: string
          columna_id: string | null
          creado_at: string
          despues: Json | null
          elemento_id: string | null
          id: number
          tablero_id: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          antes?: Json | null
          campo: string
          columna_id?: string | null
          creado_at?: string
          despues?: Json | null
          elemento_id?: string | null
          id?: never
          tablero_id: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          antes?: Json | null
          campo?: string
          columna_id?: string | null
          creado_at?: string
          despues?: Json | null
          elemento_id?: string | null
          id?: never
          tablero_id?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tablero_historial_columna_id_fkey"
            columns: ["columna_id"]
            isOneToOne: false
            referencedRelation: "tablero_columnas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablero_historial_elemento_id_fkey"
            columns: ["elemento_id"]
            isOneToOne: false
            referencedRelation: "elementos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablero_historial_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      tablero_permisos: {
        Row: {
          actualizado_at: string
          actualizado_por: string | null
          categoria: string | null
          columnas_editables: string[]
          id: string
          nivel: string
          rol_id: string
          solo_lo_mio: boolean
          tablero_id: string | null
        }
        Insert: {
          actualizado_at?: string
          actualizado_por?: string | null
          categoria?: string | null
          columnas_editables?: string[]
          id?: string
          nivel: string
          rol_id: string
          solo_lo_mio?: boolean
          tablero_id?: string | null
        }
        Update: {
          actualizado_at?: string
          actualizado_por?: string | null
          categoria?: string | null
          columnas_editables?: string[]
          id?: string
          nivel?: string
          rol_id?: string
          solo_lo_mio?: boolean
          tablero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tablero_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tablero_permisos_tablero_id_fkey"
            columns: ["tablero_id"]
            isOneToOne: false
            referencedRelation: "tableros"
            referencedColumns: ["id"]
          },
        ]
      }
      tablero_sincronizaciones: {
        Row: {
          error: string | null
          estado: string
          fin: string | null
          id: number
          inicio: string
          origen: string
          resumen: Json
        }
        Insert: {
          error?: string | null
          estado?: string
          fin?: string | null
          id?: never
          inicio?: string
          origen: string
          resumen?: Json
        }
        Update: {
          error?: string | null
          estado?: string
          fin?: string | null
          id?: never
          inicio?: string
          origen?: string
          resumen?: Json
        }
        Relationships: []
      }
      tableros: {
        Row: {
          actualizado_at: string
          archivado_at: string | null
          categoria: string
          codigo: string | null
          creado_at: string
          creado_por: string | null
          descripcion: string | null
          id: string
          monday_board_id: string | null
          nombre: string
          plantilla_id: string | null
          sincroniza_monday: boolean
        }
        Insert: {
          actualizado_at?: string
          archivado_at?: string | null
          categoria?: string
          codigo?: string | null
          creado_at?: string
          creado_por?: string | null
          descripcion?: string | null
          id?: string
          monday_board_id?: string | null
          nombre: string
          plantilla_id?: string | null
          sincroniza_monday?: boolean
        }
        Update: {
          actualizado_at?: string
          archivado_at?: string | null
          categoria?: string
          codigo?: string | null
          creado_at?: string
          creado_por?: string | null
          descripcion?: string | null
          id?: string
          monday_board_id?: string | null
          nombre?: string
          plantilla_id?: string | null
          sincroniza_monday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tableros_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas"
            referencedColumns: ["id"]
          },
        ]
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
      mirror_desactivar_boards: {
        Args: { p_tipo: string; p_vigentes: string[] }
        Returns: number
      }
      mirror_guardar_board: {
        Args: { p_board: Json; p_items: Json }
        Returns: Json
      }
      reabrir_encuesta: { Args: { p_token: string }; Returns: undefined }
      responder_encuesta: {
        Args: { p_answers: Json; p_respondent_email: string; p_token: string }
        Returns: undefined
      }
      tablero_cambiar_valor: {
        Args: {
          p_columna: string
          p_elemento: string
          p_email: string
          p_usuario: string
          p_valor: Json
        }
        Returns: boolean
      }
      tablero_ids_persona: { Args: { p: Json }; Returns: string[] }
      tablero_recalcular_responsables: {
        Args: { p_tablero: string }
        Returns: number
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
