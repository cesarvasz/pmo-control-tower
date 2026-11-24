// Bot de Google Chat · núcleo: el CONTRATO de un flujo. Un flujo es una cosa que el bot sabe hacer (dar de alta una
// iniciativa, mostrar una Status Card…). Para agregar uno:
//   1. Crear src/features/google-chat/flujos/<nombre>/flujo.ts que exporte un FlujoChat.
//   2. Agregarlo a FLUJOS en nucleo/registro.ts.
//   3. Registrar su comando en Google Cloud (Chat API → Configuración → Comandos) con el MISMO comandoId y «Abre un diálogo».
// El núcleo se encarga de verificar a Google, identificar al usuario, el menú del saludo, abrir el diálogo y cancelar.

import type { AppUser } from "@/lib/permissions";
import type { EventoChat } from "./eventos";
import type { RespuestaChat, Tarjeta } from "./respuestas";

/** La persona del Directorio RH (activa) con el correo de quien escribe. */
export interface PersonaChat {
  id: string;
  nombre: string;
  /** Rol del Directorio RH tal cual (CKU, SPONSOR, PM, DEV…). */
  rol: string | null;
}

/** Quién escribe: correo de la empresa ya verificado. Puede no tener cuenta en la app (la mayoría de los CKUs): cada flujo
 *  decide en `puedeUsar` si le basta el Directorio o necesita la cuenta (`cuentaDe`). */
export interface UsuarioChat {
  email: string;
  /** Para mostrar: el del Directorio RH; si no está, el de Google Chat; si no, el correo. */
  nombre: string;
  persona: PersonaChat | null;
  /** La cuenta de la app, solo si sirve (tiene rol). */
  me: AppUser | null;
  /** Por qué no tiene cuenta que sirva (sin cuenta o en espera); null = sí tiene. */
  avisoCuenta: string | null;
  /** Administrador en la app. */
  esAdmin: boolean;
}

/** La cuenta de la app de quien escribe; si no tiene una que sirva, AvisoChat con el porqué. */
export function cuentaDe(u: UsuarioChat): AppUser {
  if (!u.me) throw new AvisoChat(u.avisoCuenta ?? "Necesitas una cuenta en PMO Control Tower. Pide acceso al PMO.");
  return u.me;
}

/** Un archivo que mandaron al bot en un mensaje. */
export interface AdjuntoChat {
  /** spaces/…/messages/…/attachments/… */
  nombreRecurso: string;
  /** Nombre original del archivo. */
  nombre: string;
  tipoMime: string | null;
  /** Subido a Chat (se descarga) o de Google Drive (solo se guarda el enlace). */
  origen: "subido" | "drive";
  /** Para descargarlo (subido) con la Chat API. */
  recursoDatos: string | null;
  /** Para enlazarlo (Drive). */
  driveId: string | null;
}

export interface ContextoFlujo {
  usuario: UsuarioChat;
  evento: EventoChat;
  /** Endpoint del bot (los botones lo llaman). */
  url: string;
  /** Origen de la app (https://…): para enlaces a sus páginas. */
  origen: string;
}

export interface FlujoChat {
  /** Identificador estable: viaja en los botones (parámetro «flujo»). No cambiarlo una vez en uso. */
  clave: string;
  /** El ID del comando en Google Cloud. */
  comandoId: number;
  /** El comando tal como se registró (solo para los textos de ayuda), p. ej. «/status-card». */
  comando: string;
  /** Texto del botón del menú. */
  titulo: string;
  /** Una línea para el menú del saludo. */
  descripcion: string;
  /** ¿Este usuario puede usarlo? (permisos de la app). Si no, no sale en su menú y el comando le avisa. */
  puedeUsar(u: UsuarioChat): boolean | Promise<boolean>;
  /** La tarjeta del diálogo que se abre con el comando o con el botón del menú. */
  abrir(ctx: ContextoFlujo): Promise<Tarjeta>;
  /** Un botón del diálogo (cualquier acción salvo «abrir» y «cancelar», que atiende el núcleo). */
  enviar(ctx: ContextoFlujo, accion: string): Promise<RespuestaChat>;
  /** Opcional: empezar a cargar lo que el flujo va a necesitar, sin esperarlo (se llama al mostrar el menú). Google Chat
   *  corta la espera de cada respuesta a los pocos segundos: lo lento conviene tenerlo listo antes. */
  precalentar?(): void;
  /** Opcional: qué hacer cuando le mandan archivos al bot en un mensaje. Los recibe el primer flujo que lo tenga y que el
   *  usuario pueda usar. `mensaje` = nombre del mensaje en Chat (spaces/…/messages/…). */
  recibirArchivos?(ctx: ContextoFlujo, adjuntos: AdjuntoChat[], mensaje: string): Promise<RespuestaChat>;
}

/** Un motivo para no seguir, con el texto que se le muestra al usuario en Google Chat. */
export class AvisoChat extends Error {}
