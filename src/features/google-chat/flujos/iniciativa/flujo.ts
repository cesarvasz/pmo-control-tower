// SOLO SERVIDOR. Flujo «Nueva iniciativa» (/iniciativa, comando 1): formulario → la iniciativa en el tablero de Iniciativas,
// con la descripción en su bitácora. Además recibe los archivos que le mandan al bot y los pega a la iniciativa que elijan.
// Reglas en datos.ts.

import { after } from "next/server";
import type { FlujoChat } from "../../nucleo/flujo";
import { AvisoChat } from "../../nucleo/flujo";
import { erroresDe, leerFormulario, tarjetaFormulario, type Leidos } from "../../nucleo/formulario";
import { actualizarDialogo, actualizarMensaje, botonBot, mensaje } from "../../nucleo/respuestas";
import { adjuntosDe } from "../../nucleo/eventos";
import { chatApiDisponible, enviarMensaje, espacioDe, leerMensaje } from "../../nucleo/chat-api";
import {
  adjuntarArchivos, contextoIniciativa, crearIniciativa, iniciativasParaAdjuntar, puedeCrearIniciativas, type ContextoIniciativa,
} from "./datos";
import { PARAM_ELEMENTO, PARAM_MENSAJE, textoCreada, textoElegirIniciativa, textoResultadoAdjuntos } from "./textos";

const CLAVE = "iniciativa";
const ACCION_CREAR = "crear";
const ACCION_ADJUNTAR = "adjuntar";

function tarjeta(ctx: ContextoIniciativa, url: string, extra: { leidos?: Leidos; errores?: string[] } = {}) {
  return tarjetaFormulario({
    titulo: "Nueva iniciativa", campos: ctx.campos, url, flujo: CLAVE,
    enviar: { texto: "Crear iniciativa", accion: ACCION_CREAR },
    tituloOpcional: "Opcional (se puede llenar después)",
    aviso: { etiqueta: "Se crea a tu nombre", texto: ctx.cku ? `CKU: ${ctx.cku.nombre}` : "CKU: sin asignar (no estás en el Directorio RH)" },
    ...extra,
  });
}

export const flujoIniciativa: FlujoChat = {
  clave: CLAVE,
  comandoId: 1,
  comando: "/iniciativa",
  titulo: "Nueva iniciativa",
  descripcion: "dar de alta una iniciativa (nombre y descripción); si me mandas archivos, los pego a tu iniciativa",
  puedeUsar: (u) => puedeCrearIniciativas(u),

  async abrir({ usuario, url }) {
    return tarjeta(await contextoIniciativa(usuario), url);
  },

  async enviar(ctx, accion) {
    if (accion === ACCION_ADJUNTAR) return adjuntar(ctx);
    if (accion !== ACCION_CREAR) throw new AvisoChat("No entendí ese botón. Vuelve a abrir el formulario.");
    const { usuario, evento, url, origen } = ctx;
    const c = await contextoIniciativa(usuario);
    const leidos = leerFormulario(evento, c.campos);
    const errores = erroresDe(c.campos, leidos);
    if (errores.length) return actualizarDialogo(tarjeta(c, url, { leidos, errores }));
    try {
      const ini = await crearIniciativa(c, leidos);
      return mensaje(textoCreada({ ini, cku: c.cku?.nombre ?? null, enlace: `${origen}/gestion-iniciativas`, adjuntos: chatApiDisponible() }));
    } catch (err) {
      if (!(err instanceof AvisoChat)) throw err;
      // No se pudo crear (dato inválido…): el formulario sigue abierto con lo que llenó.
      return actualizarDialogo(tarjeta(c, url, { leidos, errores: [err.message] }));
    }
  },

  async recibirArchivos({ usuario, url }, adjuntos, mensajeChat) {
    if (!chatApiDisponible()) return mensaje("Todavía no puedo recibir archivos aquí. Súbelos en la bitácora de la iniciativa en la app o avísale al PMO.");
    const inis = await iniciativasParaAdjuntar(usuario);
    if (!inis.length) return mensaje("📎 No encontré iniciativas tuyas para adjuntar archivos. Crea una con /iniciativa y vuelve a mandármelos.");
    return mensaje(textoElegirIniciativa(adjuntos), inis.map((i) => botonBot({
      url, flujo: CLAVE, accion: ACCION_ADJUNTAR, texto: i.titulo.length > 60 ? `${i.titulo.slice(0, 57)}…` : i.titulo,
      parametros: { [PARAM_ELEMENTO]: i.id, [PARAM_MENSAJE]: mensajeChat },
    })));
  },
};

/** Tocó la iniciativa a la que van los archivos. Se contesta enseguida (Chat no espera más de unos segundos) y la descarga
 *  sigue después; al terminar, el bot escribe el resultado en el mismo chat. */
async function adjuntar({ usuario, evento }: Parameters<FlujoChat["enviar"]>[0]) {
  const p = evento.commonEventObject?.parameters ?? {};
  const elementoId = p[PARAM_ELEMENTO] ?? "";
  const nombreMensaje = p[PARAM_MENSAJE] ?? "";
  const iniciativa = (await iniciativasParaAdjuntar(usuario, 50)).find((i) => i.id === elementoId);
  if (!iniciativa || !nombreMensaje) throw new AvisoChat("Esa iniciativa ya no está disponible para ti. Vuelve a mandarme los archivos.");
  // Los archivos se leen del mensaje en Chat (no de lo que trae el botón), y solo si lo mandó quien tocó el botón.
  const original = await leerMensaje(nombreMensaje);
  const quien = evento.chat?.user?.name;
  if (!quien || original.sender?.name !== quien) throw new AvisoChat("Solo quien mandó los archivos puede adjuntarlos.");
  const adjuntos = adjuntosDe(original);
  if (!adjuntos.length) throw new AvisoChat("Ese mensaje ya no tiene archivos.");
  after(async () => {
    let texto: string;
    try {
      texto = textoResultadoAdjuntos(iniciativa.titulo, await adjuntarArchivos(usuario, iniciativa, adjuntos));
    } catch (e) {
      console.error("[google-chat] adjuntar", e);
      texto = `⚠️ No pude adjuntar los archivos a *${iniciativa.titulo}*. Intenta de nuevo o súbelos en la app.`;
    }
    await enviarMensaje(espacioDe(nombreMensaje), texto).catch((e) => console.error("[google-chat] aviso de adjuntos", e));
  });
  return actualizarMensaje(`⏳ Adjuntando ${adjuntos.length === 1 ? `«${adjuntos[0].nombre}»` : `${adjuntos.length} archivos`} a *${iniciativa.titulo}*… te aviso aquí al terminar.`);
}
