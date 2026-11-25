// Flujo «Nueva iniciativa»: la tarjeta del formulario. Lógica PURA.
// Al marcar «Adjuntaré un archivo» (la casilla manda el formulario y se vuelve a dibujar) aparecen los archivos subidos y
// los botones «📎 Subir archivo» (abre la página de subida) y «🔄 Actualizar» (vuelve a leer los archivos del borrador).
// Todos los controles llevan el id del borrador (PARAM_BORRADOR).

import { tamanoLegible } from "@/features/tableros/dominio/bitacora";
import { tarjetaFormulario, VALOR_CASILLA, type CampoChat, type Leidos } from "../../nucleo/formulario";
import { botonBot, botonEnlace, escapar, type Tarjeta, type Widget } from "../../nucleo/respuestas";
import { CAMPO_ADJUNTARE, MAX_ARCHIVOS_BORRADOR } from "./subida";

export const PARAM_BORRADOR = "borrador";
export const ACCION_CREAR = "crear";
/** La casilla se marcó o desmarcó. */
export const ACCION_CASILLA = "casilla";
/** «🔄 Actualizar»: volver a leer los archivos subidos. */
export const ACCION_REFRESCAR = "refrescar";

export interface VistaIniciativa {
  campos: CampoChat[];
  /** Nombre del CKU (quien escribe); null = no está en el Directorio. */
  cku: string | null;
  url: string;
  flujo: string;
  borrador: string;
  /** La página de subida de este borrador (enlace firmado). */
  enlaceSubida: string;
  leidos?: Leidos;
  errores?: string[];
  archivos?: { nombre: string; tamano: number | null }[];
}

/** ¿Marcó «Adjuntaré un archivo»? */
export const marcoAdjuntare = (leidos: Leidos) => leidos[CAMPO_ADJUNTARE] === VALOR_CASILLA;

export function tarjetaIniciativa(v: VistaIniciativa): Tarjeta {
  const leidos = v.leidos ?? {};
  const archivos = v.archivos ?? [];
  const parametros = { [PARAM_BORRADOR]: v.borrador };
  return tarjetaFormulario({
    titulo: "Nueva iniciativa", campos: v.campos, url: v.url, flujo: v.flujo, parametros, leidos, errores: v.errores,
    enviar: { texto: "Crear iniciativa", accion: ACCION_CREAR },
    aviso: { etiqueta: "Se crea a tu nombre", texto: v.cku ? `CKU: ${v.cku}` : "CKU: sin asignar (no estás en el Directorio RH)" },
    // Si subió archivos y luego desmarcó la casilla, se siguen viendo: también se pegan al crearla.
    extra: marcoAdjuntare(leidos) || archivos.length ? widgetsArchivos(v, archivos, parametros) : [],
  });
}

function widgetsArchivos(v: VistaIniciativa, archivos: NonNullable<VistaIniciativa["archivos"]>, parametros: Record<string, string>): Widget[] {
  const lista = archivos.map((a) => `📎 ${escapar(a.nombre)}${a.tamano !== null ? ` · ${tamanoLegible(a.tamano)}` : ""}`).join("<br>");
  const lleno = archivos.length >= MAX_ARCHIVOS_BORRADOR;
  return [
    { decoratedText: { topLabel: archivos.length ? `Archivos subidos (${archivos.length})` : "Archivos subidos", text: lista || "Ninguno todavía", wrapText: true } },
    { buttonList: { buttons: [
      ...(lleno ? [] : [botonEnlace(archivos.length ? "📎 Subir otro archivo" : "📎 Subir archivo", v.enlaceSubida)]),
      botonBot({ url: v.url, flujo: v.flujo, accion: ACCION_REFRESCAR, texto: "🔄 Actualizar", secundario: true, parametros }),
    ] } },
    { textParagraph: { text: lleno
      ? `Ya subiste el máximo (${MAX_ARCHIVOS_BORRADOR}). Se pegan a la bitácora al crear la iniciativa.`
      : `Se abre una página para subirlo (hasta ${MAX_ARCHIVOS_BORRADOR} archivos de 50 MB). Al volver, toca «🔄 Actualizar» para verlo aquí; se pegan a la bitácora al crear la iniciativa.` } },
  ];
}
