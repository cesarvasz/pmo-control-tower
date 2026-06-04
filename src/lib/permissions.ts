// src/lib/permissions.ts
// Tipos y helpers del modelo de permisos. Módulo PURO (cliente + servidor).
// Los permisos son genéricos: mapas de páginas y acciones → boolean.
// El catálogo concreto de páginas/acciones vive en registry.ts (extensible).

export interface Permissions {
  pages: Record<string, boolean>;
  actions: Record<string, boolean>;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  isSystem?: boolean; // roles base sembrados: no se pueden borrar
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
  return { pages: {}, actions: {} };
}

export function hasPage(p: Permissions | undefined, key: string): boolean {
  return !!p?.pages?.[key];
}

export function hasAction(p: Permissions | undefined, key: string): boolean {
  return !!p?.actions?.[key];
}

/** Normaliza un objeto de permisos arbitrario a la forma {pages,actions}. */
export function normalizePermissions(p: Partial<Permissions> | undefined): Permissions {
  return {
    pages: { ...(p?.pages ?? {}) },
    actions: { ...(p?.actions ?? {}) },
  };
}
