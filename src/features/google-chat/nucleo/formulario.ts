// Bot de Google Chat · núcleo: formularios genéricos (texto, número, lista) para los diálogos de cualquier flujo: leer lo
// que se llenó, validarlo y armar la tarjeta. Lógica PURA.

import { leerInputs, type EventoChat } from "./eventos";
import { botonBot, escapar, widgetErrores, type Tarjeta, type Widget } from "./respuestas";

/** Una opción de una lista: `valor` es lo que se guarda (id), `texto` lo que se ve. */
export interface Opcion { valor: string; texto: string }

/** Un campo del formulario. `nombre` es el nombre del widget en Google Chat (lo elige el flujo: id de columna, «proyecto»…). */
export interface CampoChat {
  nombre: string;
  etiqueta: string;
  /** «parrafo» = texto de varias líneas. */
  tipo: "texto" | "parrafo" | "numero" | "lista";
  obligatorio: boolean;
  /** «datos» = sección principal; «despues» = sección plegable de lo opcional. */
  seccion: "datos" | "despues";
  opciones?: Opcion[];
  ayuda?: string;
}

/** Lo que el usuario escribió/eligió, por nombre de campo (texto tal cual; "" = vacío). */
export type Leidos = Record<string, string>;

/** Google Chat no acepta más de 100 opciones en una lista desplegable. */
export const MAX_OPCIONES = 100;

export const leerFormulario = (e: EventoChat, campos: Pick<CampoChat, "nombre">[]): Leidos => leerInputs(e, campos.map((c) => c.nombre));

/** Un número escrito a mano: acepta «15000», «15,000.50», «$ 15,000», «Q15000». null = no es número. */
export function leerNumero(texto: string): number | null {
  const limpio = texto.replace(/[\s$,]/g, "").replace(/^Q/i, "");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Lo que falta o está mal, en el orden del formulario (vacío = todo bien). */
export function erroresDe(campos: CampoChat[], leidos: Leidos): string[] {
  const errores: string[] = [];
  for (const c of campos) {
    const v = leidos[c.nombre] ?? "";
    if (!v) {
      if (c.obligatorio) errores.push(`Falta ${c.etiqueta}`);
      continue;
    }
    if (c.tipo === "numero" && leerNumero(v) === null) errores.push(`${c.etiqueta} tiene que ser un número (p. ej. 15000)`);
    if (c.tipo === "lista" && !(c.opciones ?? []).some((o) => o.valor === v)) errores.push(`${c.etiqueta}: la opción elegida ya no existe`);
  }
  return errores;
}

/** Los valores como los guarda un tablero: listas → [id] (persona, relación, dropdown), números → number, texto → string.
 *  Lo vacío no se manda. */
export function valoresDeTablero(campos: CampoChat[], leidos: Leidos): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of campos) {
    const v = leidos[c.nombre] ?? "";
    if (!v) continue;
    if (c.tipo === "lista") out[c.nombre] = [v];
    else if (c.tipo === "numero") { const n = leerNumero(v); if (n !== null) out[c.nombre] = n; }
    else out[c.nombre] = v;
  }
  return out;
}

function widgetDe(c: CampoChat, valor: string): Widget {
  const etiqueta = c.obligatorio ? `${c.etiqueta} *` : c.etiqueta;
  if (c.tipo === "lista") {
    // La primera opción vacía evita que Google Chat deje elegida la primera de la lista sin que el usuario la haya escogido.
    const items = [{ text: "— Elige una opción —", value: "", selected: !valor },
      ...(c.opciones ?? []).map((o) => ({ text: o.texto, value: o.valor, selected: o.valor === valor }))];
    return { selectionInput: { name: c.nombre, label: etiqueta, type: "DROPDOWN", items } };
  }
  return {
    textInput: {
      name: c.nombre, label: etiqueta, type: c.tipo === "parrafo" ? "MULTIPLE_LINE" : "SINGLE_LINE", value: valor,
      ...(c.ayuda ? { hintText: c.ayuda } : c.tipo === "numero" ? { hintText: "Solo el número, p. ej. 15000" } : {}),
    },
  };
}

export interface OpcionesFormulario {
  /** Encabezado de la sección principal (p. ej. «Nueva iniciativa»). */
  titulo: string;
  campos: CampoChat[];
  /** Endpoint del bot y flujo al que vuelven los botones. */
  url: string;
  flujo: string;
  /** El botón principal: su texto y la acción que manda (la atiende el flujo). Siempre lleva además «Cancelar». */
  enviar: { texto: string; accion: string };
  leidos?: Leidos;
  errores?: string[];
  /** Línea fija arriba (p. ej. «PM: Ana López»), con su etiqueta. */
  aviso?: { etiqueta: string; texto: string };
  /** Encabezado de la sección plegable de lo opcional. */
  tituloOpcional?: string;
}

/** La tarjeta de un diálogo con formulario (sin envoltura cardsV2: así la piden pushCard / updateCard). */
export function tarjetaFormulario(o: OpcionesFormulario): Tarjeta {
  const leidos = o.leidos ?? {};
  const cabecera: Widget[] = [];
  if (o.errores?.length) cabecera.push(widgetErrores(o.errores));
  if (o.aviso) cabecera.push({ decoratedText: { topLabel: o.aviso.etiqueta, text: escapar(o.aviso.texto) } });
  const de = (s: CampoChat["seccion"]) => o.campos.filter((c) => c.seccion === s).map((c) => widgetDe(c, leidos[c.nombre] ?? ""));
  const despues = de("despues");
  return {
    sections: [
      { header: o.titulo, widgets: [...cabecera, ...de("datos")] },
      ...(despues.length ? [{ header: o.tituloOpcional ?? "Opcional", collapsible: true, uncollapsibleWidgetsCount: 0, widgets: despues }] : []),
      { widgets: [{ buttonList: { buttons: [
        botonBot({ url: o.url, flujo: o.flujo, accion: o.enviar.accion, texto: o.enviar.texto }),
        botonBot({ url: o.url, flujo: o.flujo, accion: "cancelar", texto: "Cancelar", secundario: true }),
      ] } }] },
    ],
  };
}
