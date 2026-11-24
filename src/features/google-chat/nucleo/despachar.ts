// SOLO SERVIDOR. Bot de Google Chat · núcleo: recibe un evento ya verificado y lo manda al flujo que toca.
// OJO: Google Chat corta la espera de cada respuesta a los pocos segundos (con 5,7 s respondió; con 8,9 s, «Could not
// load dialog»). Lo lento va antes (precalentar) o después de responder (after), nunca dentro.
//  · saludo (le escriben o lo agregan) → «¡Hola (nombre)! Rol (rol)» + menú con lo que ESE usuario puede usar;
//    sin rol CKU / Sponsor / PM / Admin, el mensaje de apoyo
//  · comando → el flujo con ese comandoId abre su diálogo
//  · botón «abrir» → abre el diálogo del flujo; «cancelar» → cierra; otro → flujo.enviar

import { ACCION_ABRIR, ACCION_CANCELAR, esDeDialogo, intencionDe, type EventoChat } from "./eventos";
import { AvisoChat, type ContextoFlujo, type FlujoChat } from "./flujo";
import { flujoDeBoton, saludoDe } from "./menu";
import { abrirDialogo, botonBot, cerrarDialogo, mensaje, respuestaDeAviso, type RespuestaChat } from "./respuestas";
import { quienSaluda, usuarioDeEvento } from "./usuario";

export async function despachar(e: EventoChat, url: string, flujos: FlujoChat[]): Promise<RespuestaChat> {
  const intencion = intencionDe(e);
  if (intencion.tipo === "ignorar") return {};
  if (intencion.tipo === "boton" && intencion.accion === ACCION_CANCELAR) return cerrarDialogo();
  try {
    if (intencion.tipo === "saludo") {
      // Contesta a cualquiera del dominio: nombre y rol del Directorio RH; el menú, solo con rol y cuenta que sirva.
      const s = await quienSaluda(e);
      const disponibles: FlujoChat[] = [];
      if (s.rol && s.usuario) for (const f of flujos) if (await f.puedeUsar(s.usuario)) disponibles.push(f);
      for (const f of disponibles) f.precalentar?.();
      return saludoDe({ nombre: s.nombre, rol: s.rol, flujos: disponibles, aviso: s.aviso }, url);
    }
    const usuario = await usuarioDeEvento(e);
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
