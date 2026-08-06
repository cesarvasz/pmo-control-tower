// src/lib/registry.ts
// CATÁLOGO CENTRAL de páginas y acciones gobernadas por permisos.
//
// ▸ Para AGREGAR UNA PÁGINA nueva: añade una entrada a PAGES (key/label/href/icon).
//   Si necesita una ACCIÓN en vez de permiso de página, agrega requiredAction.
//   La página aparecerá en el editor de grupos y en el gating automáticamente.
// ▸ Para AGREGAR UNA ACCIÓN nueva: añade una entrada a ACTIONS.
//
// Los GRUPOS son DINÁMICOS (Firestore). La resolución/armado del menú recibe la
// lista de grupos como parámetro (módulo PURO cliente+servidor).

import type { Group, Permissions, Role } from "@/lib/permissions";

export interface PageDef {
  key: string;
  label: string;
  href: string;
  icon: string;
  /**
   * Si está presente, el acceso a esta página se verifica con esta ACCIÓN
   * (en vez del permiso de página). Útil para páginas de administración.
   */
  requiredAction?: string;
  /**
   * Página pública: siempre visible en el sidebar y accesible, sin gating de
   * permisos. Para contenido informativo/de referencia (no datos sensibles).
   * No aparece en el editor de grupos/roles.
   */
  public?: boolean;
}

export interface ActionDef {
  key: string;
  label: string;
  description: string;
}

// ── Páginas (contenido + administración) ──────────────────────────────
// Las páginas con requiredAction se muestran en el sidebar cuando el usuario
// tiene esa acción, y pueden asignarse libremente a cualquier grupo.
export const PAGES: PageDef[] = [
  { key: "overview",    label: "Control Tower", href: "/",         icon: "control-tower" },
  { key: "valor",       label: "VALOR",         href: "/valor",    icon: "💰", public: true },
  { key: "iniciativas", label: "Iniciativas",   href: "/iniciativas", icon: "◐" },
  { key: "req",         label: "REQ",           href: "/req",      icon: "◇" },
  { key: "proyectos",   label: "Proyectos",     href: "/proyectos", icon: "▤" },
  { key: "costo-un",    label: "Costo $ x Unid Neg", href: "/costo-un", icon: "🏢" },
  { key: "visor",       label: "Visor",         href: "/visor",    icon: "🛃", public: true },
  { key: "encuestas",   label: "Encuestas",     href: "/encuestas", icon: "📋" },
  { key: "roi",         label: "ROI",           href: "/roi",       icon: "📈" },
  { key: "usuarios",    label: "Usuarios",      href: "/usuarios",  icon: "⚙", requiredAction: "manage_users" },
  { key: "roles",       label: "Roles",         href: "/roles",     icon: "🛡", requiredAction: "manage_roles" },
  { key: "grupos",      label: "Grupos",        href: "/grupos",    icon: "🗂", requiredAction: "manage_roles" },
  // Oculta por ahora: solo Admin (misma acción que Roles/Grupos). Cuando se
  // quiera abrir a más roles, quitar requiredAction para que sea una página
  // de contenido normal, asignable desde el editor de Grupos.
  { key: "calidad-cumplimiento", label: "Calidad & Cumplimiento", href: "/calidad-cumplimiento", icon: "🎯", requiredAction: "manage_roles" },
  // Solo Admin: consumo diario de Firestore (Cloud Monitoring), no es contenido de negocio.
  { key: "uso-firebase", label: "Uso de Firebase", href: "/uso-firebase", icon: "🔥", requiredAction: "manage_roles" },
];

// ── Acciones (lo que un rol puede HACER) ───────────────────────────────
export const ACTIONS: ActionDef[] = [
  { key: "manage_users", label: "Gestionar usuarios", description: "Ver usuarios y asignarles roles." },
  { key: "manage_roles", label: "Gestionar roles",    description: "Crear, editar y eliminar roles, grupos y sus permisos." },
];

// Páginas "puras" (sin requiredAction) — las únicas que van en el mapa de
// permisos de un rol (las de acción se controlan solo via actions).
const CONTENT_PAGES = PAGES.filter((p) => !p.requiredAction && !p.public);

/** Mapea una ruta a su PageDef completa (para el gating). */
export function pageByHref(pathname: string): PageDef | undefined {
  return PAGES.find((p) => p.href === pathname);
}

/** Mapea una clave a su PageDef (para buildNav). */
export function pageByKey(key: string): PageDef | undefined {
  return PAGES.find((p) => p.key === key);
}

/** Mapea una ruta a su clave de página de contenido (sin requiredAction). */
export function pathToPageKey(pathname: string): string | null {
  return CONTENT_PAGES.find((p) => p.href === pathname)?.key ?? null;
}

// ── Resolución: aplana los grupos concedidos a sus páginas ─────────────
export function resolvePermissions(stored: Permissions, groups: Group[]): Permissions {
  const pages = { ...stored.pages };
  for (const g of groups) {
    if (!stored.groups?.[g.id]) continue;
    for (const k of g.pageKeys) pages[k] = true;
  }
  return { pages, actions: { ...stored.actions }, groups: { ...stored.groups } };
}

// ── Construcción del menú lateral ─────────────────────────────────────
export interface NavLeaf { href: string; label: string; icon: string; }
export type NavNode =
  | { type: "item";  item: NavLeaf }
  | { type: "group"; key: string; label: string; icon: string; items: NavLeaf[] };

/**
 * Árbol de navegación filtrado por permisos. Las páginas de contenido se
 * muestran según perms.pages; las de acción según perms.actions.
 * Primero van las páginas sueltas, luego los grupos.
 */
export function buildNav(perms: Permissions | undefined, groups: Group[]): NavNode[] {
  const canSee = (p: PageDef) =>
    p.public
      ? true
      : p.requiredAction
        ? !!perms?.actions?.[p.requiredAction]
        : !!perms?.pages?.[p.key];

  const nodes: NavNode[] = [];
  const grouped = new Set(groups.flatMap((g) => g.pageKeys));

  // Páginas sueltas primero.
  for (const p of PAGES) {
    if (!grouped.has(p.key) && canSee(p)) {
      nodes.push({ type: "item", item: { href: p.href, label: p.label, icon: p.icon } });
    }
  }

  // Grupos después.
  for (const g of groups) {
    const items: NavLeaf[] = [];
    for (const key of g.pageKeys) {
      const p = pageByKey(key);
      if (p && canSee(p)) items.push({ href: p.href, label: p.label, icon: p.icon });
    }
    if (items.length) nodes.push({ type: "group", key: g.id, label: g.name, icon: g.icon, items });
  }

  return nodes;
}

// ── Helpers para construir permisos ───────────────────────────────────
function allContentPages(value: boolean): Record<string, boolean> {
  return Object.fromEntries(CONTENT_PAGES.map((p) => [p.key, value]));
}
function allActions(value: boolean): Record<string, boolean> {
  return Object.fromEntries(ACTIONS.map((a) => [a.key, value]));
}

/** Rellena un permiso parcial con TODAS las páginas de contenido y acciones
 *  del catálogo (las faltantes en false). Los grupos se conservan tal cual. */
export function withCatalog(p: Permissions): Permissions {
  return {
    pages:   { ...allContentPages(false), ...p.pages },
    actions: { ...allActions(false),      ...p.actions },
    groups:  { ...p.groups },
  };
}

// ── Roles base sembrados al inicializar ──────────────────────────────
export const DEFAULT_ROLES: Role[] = [
  {
    id: "admin",
    name: "Administrador",
    isSystem: true,
    permissions: { pages: allContentPages(true), actions: allActions(true), groups: {} },
  },
  {
    id: "viewer",
    name: "Lector",
    isSystem: true,
    permissions: { pages: { overview: true }, actions: {}, groups: {} },
  },
];

export const BOOTSTRAP_ADMIN_ROLE_ID  = "admin";
export const DEFAULT_NEW_USER_ROLE_ID = "viewer";
export const BOOTSTRAP_ADMIN_GROUP_ID = "administracion";

/**
 * Reconciliación del rol Administrador del sistema: SIEMPRE debe tener todo el
 * catálogo vigente (páginas de contenido + acciones), aunque el rol se haya
 * sembrado antes de que existieran páginas nuevas. Evita que al agregar una
 * página el admin pierda acceso hasta re-otorgársela. Los demás roles se
 * devuelven tal cual (ahí sí aplica la granularidad configurada). */
export function reconcileSystemAdmin(role: Role): Role {
  if (role.id !== BOOTSTRAP_ADMIN_ROLE_ID) return role;
  return {
    ...role,
    permissions: {
      pages:   { ...role.permissions.pages,   ...allContentPages(true) },
      actions: { ...role.permissions.actions, ...allActions(true) },
      groups:  { ...role.permissions.groups },
    },
  };
}
