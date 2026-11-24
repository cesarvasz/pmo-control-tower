// Bot de Google Chat · Drive: lo que no toca la red. Qué permiso se pide, a dónde vuelve Google y cómo se guarda cada tipo
// de archivo (los Docs/Sheets/Slides de Google no se descargan tal cual: se exportan). Lógica PURA.

/** drive.readonly: leer el archivo que la persona mandó (drive.file no sirve: solo ve lo que abrió la app). */
export const SCOPE_DRIVE = "https://www.googleapis.com/auth/drive.readonly";
export const SCOPES_DRIVE = ["openid", "email", SCOPE_DRIVE] as const;

/** Rutas del enlace «Conectar mi Drive» y de la vuelta de Google. La de vuelta se registra en el cliente OAuth. */
export const RUTA_CONECTAR = "/api/google-chat/drive/conectar";
export const RUTA_CALLBACK = "/api/google-chat/drive/callback";
export const COOKIE_DRIVE = "g_drive_n";
/** El enlace «Conectar mi Drive» que va en el chat (código firmado). */
export const VIDA_ENLACE_SEG = 24 * 3600;
export const PREFIJO_DRIVE = "drive:";

export function urlAutorizacionDrive(o: { clientId: string; origen: string; state: string; email: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId, redirect_uri: `${o.origen}${RUTA_CALLBACK}`, response_type: "code", scope: SCOPES_DRIVE.join(" "),
    access_type: "offline", prompt: "consent", state: o.state, login_hint: o.email,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Cómo se exporta cada archivo nativo de Google (Docs → PDF, Sheets → Excel, Slides → PowerPoint, Dibujos → PDF).
 *  Los demás nativos (Forms, Sites…) no se pueden copiar: queda el enlace. */
const EXPORTAR: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  "application/vnd.google-apps.presentation": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
  "application/vnd.google-apps.drawing": { mime: "application/pdf", ext: "pdf" },
};

export type ComoBajar =
  | { modo: "descargar" }
  | { modo: "exportar"; mime: string; nombre: string }
  | { modo: "no-se-puede" };

/** Qué hacer con un archivo de Drive según su tipo. */
export function comoBajar(mimeType: string, nombre: string): ComoBajar {
  if (!mimeType.startsWith("application/vnd.google-apps.")) return { modo: "descargar" };
  const e = EXPORTAR[mimeType];
  if (!e) return { modo: "no-se-puede" };
  const conExt = nombre.toLowerCase().endsWith(`.${e.ext}`) ? nombre : `${nombre}.${e.ext}`;
  return { modo: "exportar", mime: e.mime, nombre: conExt };
}
