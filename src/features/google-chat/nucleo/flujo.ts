// Bot de Google Chat · núcleo: el CONTRATO de un flujo. Un flujo es una cosa que el bot sabe hacer (dar de alta una
// iniciativa, mostrar una Status Card…). Para agregar uno:
//   1. Crear src/features/google-chat/flujos/<nombre>/flujo.ts que exporte un FlujoChat.
//   2. Agregarlo a FLUJOS en nucleo/registro.ts.
//   3. Registrar su comando en Google Cloud (Chat API → Configuración → Comandos) con el MISMO comandoId y «Abre un diálogo».
// El núcleo se encarga de verificar a Google, identificar al usuario, el menú del saludo, abrir el diálogo y cancelar.

import type { AppUser } from "@/lib/permissions";
import type { EventoChat } from "./eventos";
import type { RespuestaChat, Tarjeta } from "./respuestas";

/** Quién escribe: ya verificado (correo de la empresa, cuenta de la app con rol). */
export interface UsuarioChat {
  email: string;
  me: AppUser;
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
}

/** Un motivo para no seguir, con el texto que se le muestra al usuario en Google Chat. */
export class AvisoChat extends Error {}
