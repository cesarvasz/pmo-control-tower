// src/lib/registry.ts
// CATÁLOGO CENTRAL de páginas y acciones gobernadas por permisos.
//
// ▸ Para AGREGAR UNA PÁGINA nueva: añade una entrada a PAGES (key/label/href/icon).
//   Aparecerá automáticamente en el editor de roles, el sidebar y el gating.
// ▸ Para AGREGAR UNA ACCIÓN nueva: añade una entrada a ACTIONS.
//
// Módulo PURO (cliente + servidor).

import type { Permissions, Role } from "@/lib/permissions";

export interface PageDef {
  key: string;
  label: string;
  href: string;
  icon: string;
}

export interface ActionDef {
  key: string;
  label: string;
  description: string;
}

// ── Páginas (lo que un rol puede VER) ──────────────────────────────────
export const PAGES: PageDef[] = [
  { key: "overview", label: "Control Tower", href: "/", icon: "◎" },
  { key: "iniciativas", label: "Iniciativas", href: "/iniciativas", icon: "◐" },
  { key: "req", label: "REQ", href: "/req", icon: "◇" },
  { key: "proyectos", label: "Proyectos", href: "/proyectos", icon: "▤" },
];

// ── Acciones (lo que un rol puede HACER) ───────────────────────────────
export const ACTIONS: ActionDef[] = [
  { key: "manage_users", label: "Gestionar usuarios", description: "Ver usuarios y asignarles roles." },
  { key: "manage_roles", label: "Gestionar roles", description: "Crear, editar y eliminar roles y sus permisos." },
];

/** Mapea una ruta a su clave de página (para el gating). */
export function pathToPageKey(pathname: string): string | null {
  return PAGES.find((p) => p.href === pathname)?.key ?? null;
}

// ── Helpers para construir permisos completos desde el catálogo ────────
function allPages(value: boolean): Record<string, boolean> {
  return Object.fromEntries(PAGES.map((p) => [p.key, value]));
}
function allActions(value: boolean): Record<string, boolean> {
  return Object.fromEntries(ACTIONS.map((a) => [a.key, value]));
}

/** Rellena un permiso parcial con TODAS las claves del catálogo (las faltantes en false). */
export function withCatalog(p: Permissions): Permissions {
  return {
    pages: { ...allPages(false), ...p.pages },
    actions: { ...allActions(false), ...p.actions },
  };
}

// ── Roles base sembrados al inicializar (el primer usuario recibe "admin") ──
export const DEFAULT_ROLES: Role[] = [
  {
    id: "admin",
    name: "Administrador",
    isSystem: true,
    permissions: { pages: allPages(true), actions: allActions(true) },
  },
  {
    id: "viewer",
    name: "Lector",
    isSystem: true,
    permissions: { pages: { overview: true }, actions: {} },
  },
];

export const BOOTSTRAP_ADMIN_ROLE_ID = "admin";
export const DEFAULT_NEW_USER_ROLE_ID = "viewer";
