// REGISTRO de acciones globales de Tableros (capa 1 de permisos). Mientras Tableros vive solo en
// su página de prueba (/tableros), estas acciones NO están en el catálogo de la app
// (src/lib/registry.ts): las tiene quien tenga "manage_roles" (Admin). Cuando Tableros entre a la
// app, se pasan a ACTIONS y desde /roles se le pueden dar a cualquier rol; este archivo ya las
// lee por su clave, así que no hay que cambiar nada más.

import type { Permissions } from "@/lib/permissions";

export interface AccionTableros {
  clave: string;
  etiqueta: string;
  descripcion: string;
}

export const ACCIONES_TABLEROS: AccionTableros[] = [
  { clave: "tableros_ver", etiqueta: "Entrar a Tableros", descripcion: "Ver la página de Tableros (por ahora en prueba)." },
  { clave: "tableros_crear", etiqueta: "Crear tableros", descripcion: "Crear tableros nuevos, en blanco o desde una plantilla." },
  { clave: "plantillas_administrar", etiqueta: "Administrar plantillas", descripcion: "Guardar tableros como plantilla, editarlas y archivarlas." },
  { clave: "directorio_administrar", etiqueta: "Administrar el directorio", descripcion: "Importar y editar las personas del directorio y ligarlas a usuarios." },
  { clave: "permisos_tableros_administrar", etiqueta: "Administrar permisos de tableros", descripcion: "Decidir qué rol ve y edita qué tablero o categoría." },
];

/** Acción que, mientras Tableros está en prueba, da TODAS las de arriba. */
export const ACCION_PUENTE = "manage_roles";

export function tieneAccionTableros(perms: Permissions | undefined, clave: string): boolean {
  return !!perms?.actions?.[clave] || !!perms?.actions?.[ACCION_PUENTE];
}
