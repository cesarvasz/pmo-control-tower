// SOLO SERVIDOR. Bot de Google Chat · núcleo: recibe un evento ya verificado y lo manda al flujo que toca.
// OJO: Google Chat corta la espera de cada respuesta a los pocos segundos (con 5,7 s respondió; con 8,9 s, «Could not
// load dialog»). Lo lento va antes (precalentar) o después de responder (after), nunca dentro.
//  · saludo (le escriben o lo agregan) → menú con lo que ESE usuario puede usar
//  · comando → el flujo con ese comandoId abre su diálogo
//  · botón «abrir» → abre el diálogo del flujo; «cancelar» → cierra; otro → flujo.enviar

import { ACCION_ABRIR, ACCION_CANCELAR, esDeDialogo, intencionDe, type EventoChat } from "./eventos";
import { AvisoChat, type ContextoFlujo, type FlujoChat } from "./flujo";
import { flujoDeBoton, menuDe } from "./menu";
import { abrirDialogo, botonBot, cerrarDialogo, mensaje, respuestaDeAviso, type RespuestaChat } from "./respuestas";
import { usuarioDeEvento } from "./usuario";

export async function despachar(e: EventoChat, url: string, flujos: FlujoChat[]): Promise<RespuestaChat> {
  const intencion = intencionDe(e);
  if (intencion.tipo === "ignorar") return {};
  if (intencion.tipo === "boton" && intencion.accion === ACCION_CANCELAR) return cerrarDialogo();
  try {
    const usuario = await usuarioDeEvento(e);
    if (intencion.tipo === "saludo") {
      const disponibles: FlujoChat[] = [];
      for (const f of flujos) if (await f.puedeUsar(usuario)) disponibles.push(f);
      for (const f of disponibles) f.precalentar?.();
      return menuDe(disponibles, url);
    }
    const flujo = intencion.tipo === "comando"
      ? flujos.find((f) => f.comandoId === intencion.comandoId)
      : flujoDeBoton(flujos, intencion.flujo);
    if (!flujo) throw new AvisoChat("No conozco ese comando. Escríbeme «hola» para ver lo que puedo hacer.");
    if (!(await flujo.puedeUsar(usuario))) throw new AvisoChat(`Tu rol no tiene acceso a «${flujo.titulo}». Pide acceso al PMO.`);

    const ctx: ContextoFlujo = { usuario, evento: e, url, origen: new URL(url).origin };
    if (intencion.tipo === "comando" || intencion.accion === ACCION_ABRIR) {
      // Un comando sin «Abre un diálogo» en Google Cloud no puede abrir una tarjeta: se manda el botón que sí la abre.
      if (!esDeDialogo(e)) return mensaje("Toca el botón para continuar.", [botonBot({ url, flujo: flujo.clave, accion: ACCION_ABRIR, texto: flujo.titulo, dialogo: true })]);
      return abrirDialogo(await flujo.abrir(ctx));
    }
    return await flujo.enviar(ctx, intencion.accion);
  } catch (err) {
    if (err instanceof AvisoChat) return respuestaDeAviso(e, err.message);
    console.error("[google-chat]", err);
    return respuestaDeAviso(e, "Algo falló de nuestro lado. Intenta de nuevo en un momento o avísale al PMO.");
  }
}
