// Bot de Google Chat · núcleo: las respuestas que entiende Google Chat (formato add-on) y piezas de tarjeta comunes.
// Lógica PURA.
//  · Diálogo: abrir (pushCard), volver a mostrar sin cerrarlo (updateCard), cerrar (endNavigation).
//  · Mensaje en el chat (hostAppDataAction.createMessageAction): si venía de un diálogo, también lo cierra.

import { esDeDialogo, PARAM_ACCION, PARAM_FLUJO, type EventoChat } from "./eventos";

export type Tarjeta = Record<string, unknown>;
export type Widget = Record<string, unknown>;
export type RespuestaChat = Record<string, unknown>;

/** Texto seguro para los widgets que aceptan HTML básico (textParagraph, decoratedText). */
export const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Abrir el diálogo. */
export const abrirDialogo = (tarjeta: Tarjeta): RespuestaChat => ({ action: { navigations: [{ pushCard: tarjeta }] } });

/** Volver a mostrar el diálogo (p. ej. con errores) sin cerrarlo. */
export const actualizarDialogo = (tarjeta: Tarjeta): RespuestaChat => ({ action: { navigations: [{ updateCard: tarjeta }] } });

/** Cerrar el diálogo, con un aviso corto opcional. */
export const cerrarDialogo = (aviso?: string): RespuestaChat => ({
  action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }], ...(aviso ? { notification: { text: aviso } } : {}) },
});

/** Un botón que vuelve al bot: a `flujo`, con `accion`. `dialogo` = abre un diálogo (botones de mensajes). */
export function botonBot(o: { url: string; flujo: string; accion: string; texto: string; dialogo?: boolean; secundario?: boolean }): Widget {
  return {
    text: o.texto,
    ...(o.secundario ? { type: "OUTLINED" } : {}),
    onClick: {
      action: {
        function: o.url,
        ...(o.dialogo ? { interaction: "OPEN_DIALOG" } : {}),
        parameters: [{ key: PARAM_FLUJO, value: o.flujo }, { key: PARAM_ACCION, value: o.accion }],
      },
    },
  };
}

/** Un botón que abre una página (p. ej. la app). */
export const botonEnlace = (texto: string, url: string): Widget => ({ text: texto, onClick: { openLink: { url } } });

/** Un mensaje en el chat; con `botones`, debajo del texto. */
export function mensaje(texto: string, botones: Widget[] = []): RespuestaChat {
  const accessoryWidgets = botones.length ? [{ buttonList: { buttons: botones } }] : undefined;
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: texto, ...(accessoryWidgets ? { accessoryWidgets } : {}) } } } } };
}

/** Un mensaje con una tarjeta (los mensajes llevan la tarjeta envuelta en cardsV2; los diálogos no). */
export function mensajeConTarjeta(texto: string, cardId: string, tarjeta: Tarjeta): RespuestaChat {
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: texto, cardsV2: [{ cardId, card: tarjeta }] } } } } };
}

/** Lo que se contesta cuando algo impide seguir (sin cuenta, sin permiso…): un aviso si es diálogo, un mensaje si no. */
export function respuestaDeAviso(e: EventoChat, texto: string): RespuestaChat {
  return esDeDialogo(e) ? cerrarDialogo(texto) : mensaje(texto);
}

/** Recuadro rojo con lo que hay que corregir (arriba de un formulario). */
export function widgetErrores(errores: string[]): Widget {
  return { textParagraph: { text: `<font color="#d93025"><b>Revisa:</b><br>${errores.map((x) => `• ${escapar(x)}`).join("<br>")}</font>` } };
}
