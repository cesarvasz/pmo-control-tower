"use client";

// El resultado de conectar Google: el callback vuelve con ?google=<motivo>. Se muestra una vez y se limpia de la barra.

import { useState } from "react";
import { Nota } from "../comun";

const MOTIVOS_GOOGLE: Record<string, [tono: "ok" | "mal", texto: string]> = {
  ok: ["ok", "Tu cuenta de Google quedó conectada. Ya puedes agendar reuniones desde una iniciativa."],
  cancelado: ["mal", "No se conectó tu Google: cancelaste el permiso."],
  "permisos-incompletos": ["mal", "No se conectó tu Google: faltó aceptar el permiso de Calendar. Vuelve a intentarlo y deja marcadas todas las casillas."],
  "sin-refresh-token": ["mal", "Google no entregó un permiso duradero. Quita el acceso de esta app en tu cuenta de Google (myaccount.google.com/permissions) y conéctala de nuevo."],
  "estado-invalido": ["mal", "La conexión con Google expiró o no es válida. Vuelve a intentarlo desde «Agendar»."],
  "sin-configurar": ["mal", "La conexión con Google no está configurada en el servidor."],
  error: ["mal", "No se pudo conectar tu Google. Intenta de nuevo."],
};

export default function AvisoGoogle() {
  const [google, setGoogle] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("google")));
  const cerrar = () => { setGoogle(null); window.history.replaceState(null, "", window.location.pathname); };
  const m = google ? MOTIVOS_GOOGLE[google] : undefined;
  if (!m) return null;
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="flex-1"><Nota tono={m[0]}>{m[1]}</Nota></div>
      <button type="button" onClick={cerrar} aria-label="Cerrar aviso" className="px-2 text-[var(--text-muted)]">×</button>
    </div>
  );
}
