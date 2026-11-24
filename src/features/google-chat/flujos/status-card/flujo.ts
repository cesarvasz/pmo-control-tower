// SOLO SERVIDOR. Flujo «Status Card» (/status-card, comando 2): elegir un proyecto de la lista → su Status Card en el chat
// como IMAGEN idéntica a la app + un resumen corto.
// Google Chat corta la espera de cada respuesta a los pocos segundos, así que aquí nada lento va dentro de la respuesta:
//  · los datos salen de la caché del bot (datos.ts) y se esperan a lo más 4 s; si no están, «Reintentar»;
//  · la foto NO se toma aquí: el mensaje lleva el enlace /api/google-chat/foto/<código> y la foto se empieza a tomar
//    justo después de responder (after); si Google la pide antes, ese enlace la espera o la toma.

import { after } from "next/server";
import { AvisoChat, type FlujoChat } from "../../nucleo/flujo";
import { erroresDe, leerFormulario } from "../../nucleo/formulario";
import { firmar } from "../../nucleo/firma";
import { actualizarDialogo, mensajeConTarjeta } from "../../nucleo/respuestas";
import { precalentar, proyectosDe, puedeVerStatusCard, SinDatosAun, statusCardDe } from "./datos";
import { tomarYGuardar } from "./imagen";
import { VIDA_FOTO_SEG, datoFoto } from "./codigo";
import {
  ACCION_RECARGAR, ACCION_VER, CAMPO_PROYECTO, CLAVE_STATUS_CARD, campoProyecto, nombreProyecto, tarjetaCargando, tarjetaConImagen,
  tarjetaElegirProyecto,
} from "./tarjeta";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const flujoStatusCard: FlujoChat = {
  clave: CLAVE_STATUS_CARD,
  comandoId: 2,
  comando: "/status-card",
  titulo: "Status Card",
  descripcion: "ver la Status Card de un proyecto",
  puedeUsar: (u) => puedeVerStatusCard(u.me),
  precalentar,

  async abrir({ usuario, url }) {
    try {
      return tarjetaElegirProyecto(await proyectosDe(usuario), url);
    } catch (e) {
      if (e instanceof SinDatosAun) return tarjetaCargando(url);
      throw e;
    }
  },

  async enviar({ usuario, evento, url, origen }, accion) {
    if (accion === ACCION_RECARGAR) {
      try {
        return actualizarDialogo(tarjetaElegirProyecto(await proyectosDe(usuario), url));
      } catch (e) {
        if (e instanceof SinDatosAun) return actualizarDialogo(tarjetaCargando(url, "Todavía estoy cargando los proyectos. Toca «Reintentar» otra vez en unos segundos."));
        throw e;
      }
    }
    if (accion !== ACCION_VER) throw new AvisoChat("No entendí ese botón. Vuelve a pedir la Status Card.");

    let boards, datos;
    const leidosAntes = leerFormulario(evento, [{ nombre: CAMPO_PROYECTO }]);
    try {
      boards = await proyectosDe(usuario);
      const errores = erroresDe([campoProyecto(boards)], leidosAntes);
      if (errores.length) return actualizarDialogo(tarjetaElegirProyecto(boards, url, { leidos: leidosAntes, errores }));
      datos = await statusCardDe(usuario, leidosAntes[CAMPO_PROYECTO]);
    } catch (e) {
      if (!(e instanceof SinDatosAun)) throw e;
      return actualizarDialogo(boards
        ? tarjetaElegirProyecto(boards, url, { leidos: leidosAntes, errores: ["Todavía estoy cargando los datos del proyecto. Toca «Ver Status Card» otra vez en unos segundos."] })
        : tarjetaCargando(url));
    }

    const boardId = leidosAntes[CAMPO_PROYECTO];
    const board = boards.find((b) => b.id === boardId)!;
    const emitido = Date.now();
    const imagen = `${origen}/api/google-chat/foto/${encodeURIComponent(firmar(datoFoto(boardId, emitido), VIDA_FOTO_SEG))}`;
    // La foto se toma DESPUÉS de responder (Google Chat no espera tanto); queda guardada para cuando Google la pida.
    after(() => tomarYGuardar(boardId, emitido, origen).then(() => undefined).catch((e) => console.error("[google-chat] no se pudo tomar la foto de la Status Card", e)));
    return mensajeConTarjeta(
      `📊 Status Card de *${nombreProyecto(board.name)}*`,
      `status-card-${boardId}`,
      tarjetaConImagen(datos, {
        url, imagen,
        enlace: `${origen}/resumen-ejecutivo?board=${encodeURIComponent(boardId)}`,
        vence: ymd(new Date(emitido + VIDA_FOTO_SEG * 1000)),
      }),
    );
  },
};
