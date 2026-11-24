// Flujo «Nueva iniciativa»: los textos que manda el bot. Lógica PURA.

import type { AdjuntoChat } from "../../nucleo/flujo";

/** Parámetros de los botones «¿a qué iniciativa lo adjunto?». */
export const PARAM_ELEMENTO = "elemento";
export const PARAM_MENSAJE = "mensaje";

export const nombreConId = (i: { iniId: string; nombre: string }) => (i.iniId ? `${i.iniId} · ${i.nombre}` : i.nombre);

/** Lo que contesta al crearla. */
export function textoCreada(o: {
  ini: { iniId: string; nombre: string; sinDescripcion: boolean };
  cku: string | null;
  enlace: string;
  /** ¿Se pueden mandar archivos en el chat? (cuenta de servicio configurada) */
  adjuntos: boolean;
}): string {
  return [
    `✅ Se creó la iniciativa *${nombreConId(o.ini)}* (status New, en Nuevas Iniciativas).`,
    o.cku ? `CKU: ${o.cku}. El PMO le asignará PM y Estrategia.` : "Sin CKU (no estás en el Directorio RH). El PMO le asignará CKU, PM y Estrategia.",
    o.ini.sinDescripcion ? "⚠️ No pude guardar la descripción en la bitácora: agrégala en la app o avísale al PMO." : "La descripción quedó en su bitácora.",
    o.adjuntos ? "📎 Si quieres adjuntar archivos, mándamelos aquí en el chat." : null,
    `Puedes verla en <${o.enlace}|Gestión de Iniciativas>.`,
  ].filter(Boolean).join("\n");
}

const lista = (nombres: string[]) => nombres.map((n) => `«${n}»`).join(", ");

/** La pregunta al recibir archivos. `conectarDrive` = trae archivos de Drive y la persona aún no conectó su Drive. */
export function textoElegirIniciativa(adjuntos: Pick<AdjuntoChat, "nombre">[], o: { conectarDrive?: boolean } = {}): string {
  const n = adjuntos.length;
  return `📎 Recibí ${n === 1 ? `el archivo ${lista([adjuntos[0].nombre])}` : `${n} archivos (${lista(adjuntos.map((a) => a.nombre))})`}. ` +
    "¿A qué iniciativa lo adjunto? Se guarda en su bitácora." +
    (o.conectarDrive ? "\nPara copiar los archivos de Google Drive, primero toca «🔗 Conectar mi Drive» (una sola vez); si no, dejo su enlace." : "");
}

/** El resultado de pegar los archivos. `enlaceConectar` = a dónde ir para conectar Drive (si hizo falta y se puede). */
export function textoResultadoAdjuntos(
  titulo: string,
  r: { guardados: string[]; enlazados: { nombre: string; motivo: string | null }[]; fallidos: { nombre: string; motivo: string }[]; driveSinConectar: boolean },
  enlaceConectar: string | null = null,
): string {
  const lineas: string[] = [];
  if (r.guardados.length) lineas.push(`✅ Adjunté ${lista(r.guardados)} a *${titulo}*.`);
  if (r.enlazados.length) {
    lineas.push(`🔗 Dejé el enlace de Drive de ${lista(r.enlazados.map((e) => e.nombre))} en la bitácora de *${titulo}*.`);
    for (const e of r.enlazados) if (e.motivo) lineas.push(`   «${e.nombre}» no se copió: ${e.motivo}.`);
  }
  for (const f of r.fallidos) lineas.push(`⚠️ «${f.nombre}»: ${f.motivo}.`);
  if (r.driveSinConectar) {
    lineas.push(enlaceConectar
      ? `Para que la próxima vez copie los archivos de Drive, <${enlaceConectar}|conecta tu Drive> (una sola vez).`
      : "Los archivos de Drive se dejan como enlace (la conexión con Drive no está configurada).");
  }
  if (!r.guardados.length && !r.enlazados.length) lineas.unshift(`No pude adjuntar nada a *${titulo}*.`);
  return lineas.join("\n");
}
