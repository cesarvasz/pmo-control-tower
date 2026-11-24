// SOLO SERVIDOR. Bot de Google Chat · núcleo: recibe un evento ya verificado y lo manda al flujo que toca.
// OJO: Google Chat corta la espera de cada respuesta a los pocos segundos (con 5,7 s respondió; con 8,9 s, «Could not
// load dialog»). Lo lento va antes (precalentar) o después de responder (after), nunca dentro.
//  · saludo (le escriben o lo agregan) → «¡Hola (nombre)! Rol (rol)» + menú con lo que ESE usuario puede usar;
//    sin rol CKU / Sponsor / PM / Admin, el mensaje de apoyo
//  · archivos en un mensaje → el primer flujo que sabe recibirlos (recibirArchivos) y que el usuario puede usar
//  · comando → el flujo con ese comandoId abre su diálogo
//  · botón «abrir» → abre el diálogo del flujo; «cancelar» → cierra; otro → flujo.enviar

import { ACCION_ABRIR, ACCION_CANCELAR, esDeDialogo, intencionDe, type EventoChat } from "./eventos";
import { AvisoChat, type ContextoFlujo, type FlujoChat, type UsuarioChat } from "./flujo";
import { flujoDeBoton, MENSAJE_APOYO, rolDeSaludo, saludoDe } from "./menu";
import { abrirDialogo, botonBot, cerrarDialogo, mensaje, respuestaDeAviso, type RespuestaChat } from "./respuestas";
import { usuarioDeEvento } from "./usuario";

async function disponiblesPara(usuario: UsuarioChat, flujos: FlujoChat[]): Promise<FlujoChat[]> {
  const out: FlujoChat[] = [];
  for (const f of flujos) if (await f.puedeUsar(usuario)) out.push(f);
  return out;
}

export async function despachar(e: EventoChat, url: string, flujos: FlujoChat[]): Promise<RespuestaChat> {
  const intencion = intencionDe(e);
  if (intencion.tipo === "ignorar") return {};
  if (intencion.tipo === "boton" && intencion.accion === ACCION_CANCELAR) return cerrarDialogo();
  try {
    const usuario = await usuarioDeEvento(e);
    const ctx: ContextoFlujo = { usuario, evento: e, url, origen: new URL(url).origin };

    if (intencion.tipo === "saludo") {
      // Nombre y rol del Directorio RH (Admin de la app gana); el menú, solo a quien tiene uno de esos roles.
      const rol = rolDeSaludo(usuario.esAdmin, usuario.persona?.rol);
      const disponibles = rol ? await disponiblesPara(usuario, flujos) : [];
      for (const f of disponibles) f.precalentar?.();
      return saludoDe({ nombre: usuario.nombre, rol, flujos: disponibles, aviso: disponibles.length ? null : usuario.avisoCuenta }, url);
    }

    if (intencion.tipo === "archivos") {
      const receptor = (await disponiblesPara(usuario, flujos.filter((f) => f.recibirArchivos)))[0];
      if (!receptor?.recibirArchivos) return mensaje(`No tengo dónde guardar archivos para ti. ${MENSAJE_APOYO}`);
      return await receptor.recibirArchivos(ctx, intencion.adjuntos, intencion.mensaje);
    }

    const flujo = intencion.tipo === "comando"
      ? flujos.find((f) => f.comandoId === intencion.comandoId)
      : flujoDeBoton(flujos, intencion.flujo);
    if (!flujo) throw new AvisoChat("No conozco ese comando. Escríbeme «hola» para ver lo que puedo hacer.");
    if (!(await flujo.puedeUsar(usuario))) {
      // Sin rol reconocido → con su CKU; con rol pero sin cuenta que sirva → eso es lo que tiene que resolver; si no, es su rol.
      const sinAcceso = `Tu rol no tiene acceso a «${flujo.titulo}».`;
      throw new AvisoChat(
        !rolDeSaludo(usuario.esAdmin, usuario.persona?.rol) ? `${sinAcceso} ${MENSAJE_APOYO}`
          : !usuario.me && usuario.avisoCuenta ? usuario.avisoCuenta
            : `${sinAcceso} Pide acceso al PMO.`,
      );
    }

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
