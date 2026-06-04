// src/lib/permissions.ts
// Tipos y helpers del modelo de permisos. Módulo PURO (cliente + servidor).
// Los permisos son genéricos: mapas de páginas y acciones → boolean.
// El catálogo concreto de páginas/acciones vive en registry.ts (extensible).

export interface Permissions {
  pages: Record<string, boolean>;
  actions: Record<string, boolean>;
  /** Grupos concedidos por completo. Se "aplanan" a sus páginas/acciones
   *  (incl. las que se agreguen al grupo en el futuro) al resolver permisos. */
  groups: Record<string, boolean>;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  isSystem?: boolean; // roles base sembrados: no se pueden borrar
  createdAt?: string;
  updatedAt?: string;
}

/** Grupo de páginas creado dinámicamente (Firestore). Organiza el sidebar y
 *  puede concederse completo a un rol (otorga todas sus páginas, incl. futuras). */
export interface Group {
  id: string;
  name: string;
  icon: string;
  pageKeys: string[]; // claves de PAGES asignadas al grupo
  isSystem?: boolean; // grupos sembrados: no se pueden eliminar (sí editar)
  createdAt?: string;
  updatedAt?: string;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  roleId: string | null;
  roleName: string;
  permissions: Permissions; // efectivos (resueltos desde el rol)
  createdAt?: string;
  updatedAt?: string;
}

export function emptyPermissions(): Permissions {
  return { pages: {}, actions: {}, groups: {} };
}

export function hasPage(p: Permissions | undefined, key: string): boolean {
  return !!p?.pages?.[key];
}

export function hasAction(p: Permissions | undefined, key: string): boolean {
  return !!p?.actions?.[key];
}

/** Normaliza un objeto de permisos arbitrario a la forma {pages,actions,groups}. */
export function normalizePermissions(p: Partial<Permissions> | undefined): Permissions {
  return {
    pages: { ...(p?.pages ?? {}) },
    actions: { ...(p?.actions ?? {}) },
    groups: { ...(p?.groups ?? {}) },
  };
}
