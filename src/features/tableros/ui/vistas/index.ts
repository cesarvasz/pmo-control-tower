// REGISTRO de vistas de un tablero. "Tabla" es la vista de edición (vive en TableroVista); las
// demás son componentes que reciben el tablero ya calculado. Agregar una vista (Kanban,
// Calendario…) = crear su componente aquí y agregarlo a la lista.

import type { ComponentType } from "react";
import type { Calculados } from "../../dominio/calculos";
import type { TableroCompleto } from "../../dominio/tablero";
import VistaGantt from "./Gantt";

export interface PropsVista {
  datos: TableroCompleto;
  calc: Calculados;
  /** Texto de la búsqueda de la barra del tablero. */
  busca: string;
  /** Abre el detalle (bitácora e historial) de un elemento. */
  onAbrir(elementoId: string): void;
}

export interface Vista {
  clave: string;
  etiqueta: string;
  /** undefined = la tabla editable (propia de TableroVista). */
  Componente?: ComponentType<PropsVista>;
}

export const VISTAS: Vista[] = [
  { clave: "tabla", etiqueta: "Tabla" },
  { clave: "gantt", etiqueta: "Gantt", Componente: VistaGantt },
];
