// REGISTRO de pestañas de la página /tableros. Cada funcionalidad nueva de Tableros entra como
// una pestaña: crea su componente en esta carpeta y agrégalo aquí. Para quitarla, sácala de la lista.
// `accion`: la acción de Tableros que hace falta para ver la pestaña (ver dominio/acciones.ts).

import type { ComponentType } from "react";
import DirectorioTab from "./DirectorioTab";
import PermisosTab from "./PermisosTab";
import CatalogoTab from "./CatalogoTab";
import PlanTab from "./PlanTab";

export interface Pestana {
  clave: string;
  etiqueta: string;
  accion: string;
  Componente: ComponentType;
}

export const PESTANAS: Pestana[] = [
  { clave: "directorio", etiqueta: "Directorio", accion: "tableros_ver", Componente: DirectorioTab },
  { clave: "permisos", etiqueta: "Permisos", accion: "tableros_ver", Componente: PermisosTab },
  { clave: "catalogo", etiqueta: "Catálogo", accion: "tableros_ver", Componente: CatalogoTab },
  { clave: "plan", etiqueta: "Plan", accion: "tableros_ver", Componente: PlanTab },
];
