// Bot de Google Chat · núcleo: leer un evento de Google Chat (formato Google Workspace add-on, el de las apps de Chat
// nuevas desde julio de 2025). Lógica PURA, sin nada de ningún flujo.

/** Lo que trae un evento de Google Chat (solo lo que usa el bot; el resto se ignora). */
export interface EventoChat {
  commonEventObject?: {
    parameters?: Record<string, string>;
    formInputs?: Record<string, { stringInputs?: { value?: string[] } } | undefined>;
  };
  authorizationEventObject?: { userIdToken?: string; systemIdToken?: string };
  chat?: {
    user?: { name?: string; displayName?: string; email?: string; type?: string };
    messagePayload?: { message?: { text?: string } };
    addedToSpacePayload?: unknown;
    removedFromSpacePayload?: unknown;
    appCommandPayload?: {
      isDialogEvent?: boolean;
      dialogEventType?: string;
      appCommandMetadata?: { appCommandId?: number | string };
      message?: { slashCommand?: { commandId?: number | string } };
    };
    buttonClickedPayload?: { isDialogEvent?: boolean; dialogEventType?: string };
  };
}

/** Parámetros que llevan los botones del bot: a qué flujo vuelven y qué hacer. */
export const PARAM_FLUJO = "flujo";
export const PARAM_ACCION = "accion";
/** Acciones que entiende el núcleo (las demás las decide cada flujo). */
export const ACCION_ABRIR = "abrir";
export const ACCION_CANCELAR = "cancelar";

/** Qué pidió el usuario. */
export type Intencion =
  | { tipo: "comando"; comandoId: number } // un comando (/iniciativa, /status-card…): lo atiende el flujo con ese ID
  | { tipo: "boton"; flujo: string | null; accion: string } // un botón del bot (de un mensaje o de un diálogo)
  | { tipo: "saludo" } // le escribieron o lo agregaron a un espacio: se le muestra el menú
  | { tipo: "ignorar" }; // lo quitaron de un espacio, u otro evento sin respuesta

export function intencionDe(e: EventoChat): Intencion {
  const chat = e.chat ?? {};
  if (chat.buttonClickedPayload) {
    const p = e.commonEventObject?.parameters ?? {};
    return { tipo: "boton", flujo: p[PARAM_FLUJO] || null, accion: p[PARAM_ACCION] || ACCION_ABRIR };
  }
  if (chat.appCommandPayload) {
    const id = chat.appCommandPayload.appCommandMetadata?.appCommandId ?? chat.appCommandPayload.message?.slashCommand?.commandId;
    const n = Number(id);
    return Number.isFinite(n) ? { tipo: "comando", comandoId: n } : { tipo: "saludo" };
  }
  if (chat.messagePayload || chat.addedToSpacePayload) return { tipo: "saludo" };
  return { tipo: "ignorar" };
}

/** ¿Este evento sale de un diálogo (o pide abrir uno)? Si no, la respuesta tiene que ser un mensaje, no una tarjeta. */
export function esDeDialogo(e: EventoChat): boolean {
  const p = e.chat?.appCommandPayload ?? e.chat?.buttonClickedPayload;
  return !!p?.isDialogEvent;
}

/** Lo que el usuario llenó en el diálogo, como texto por nombre de widget ("" = vacío). */
export function leerInputs(e: EventoChat, nombres: string[]): Record<string, string> {
  const inputs = e.commonEventObject?.formInputs ?? {};
  const out: Record<string, string> = {};
  for (const n of nombres) {
    const v = inputs[n]?.stringInputs?.value?.[0];
    out[n] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}
