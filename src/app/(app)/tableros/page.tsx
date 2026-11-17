"use client";

// /tableros — página de PRUEBA de los tableros propios (dejar Monday). Todo lo de Tableros vive
// aquí, en pestañas, sin tocar el resto de la app: no está en el menú (registry.ts) y solo entra
// quien tiene la acción "tableros_ver" (por ahora, el Admin). Las pestañas salen del registro
// features/tableros/ui/pestanas.ts. Diseño: docs/tableros/diseno.md

import { useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { Loader } from "@/components/ui";
import { tieneAccionTableros } from "@/features/tableros/dominio/acciones";
import { PESTANAS } from "@/features/tableros/ui/pestanas";
import { Nota } from "@/features/tableros/ui/comun";

const MOTIVOS_GOOGLE: Record<string, [tono: "ok" | "mal", texto: string]> = {
  ok: ["ok", "Tu cuenta de Google quedó conectada. Ya puedes agendar reuniones desde una iniciativa."],
  cancelado: ["mal", "No se conectó tu Google: cancelaste el permiso."],
  "permisos-incompletos": ["mal", "No se conectó tu Google: faltó aceptar el permiso de Calendar. Vuelve a intentarlo y deja marcadas todas las casillas."],
  "sin-refresh-token": ["mal", "Google no entregó un permiso duradero. Quita el acceso de esta app en tu cuenta de Google (myaccount.google.com/permissions) y conéctala de nuevo."],
  "estado-invalido": ["mal", "La conexión con Google expiró o no es válida. Vuelve a intentarlo desde «Agendar»."],
  "sin-configurar": ["mal", "La conexión con Google no está configurada en el servidor."],
  error: ["mal", "No se pudo conectar tu Google. Intenta de nuevo."],
};

export default function TablerosPage() {
  const { me } = useMe();
  const visibles = PESTANAS.filter((p) => tieneAccionTableros(me?.permissions, p.accion));
  const [tab, setTab] = useState(visibles[0]?.clave ?? "");
  // Resultado de conectar Google (viene en la URL al volver del permiso); se muestra una vez y se limpia de la barra
  const [google, setGoogle] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("google")));
  const cerrarGoogle = () => { setGoogle(null); window.history.replaceState(null, "", window.location.pathname); };

  if (!me) return <Loader />;
  if (!tieneAccionTableros(me.permissions, "tableros_ver") || !visibles.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <div className="text-4xl opacity-30">🔒</div>
        <div className="text-lg font-semibold text-[var(--text-primary)]">Sin acceso</div>
        <div className="max-w-sm text-sm text-[var(--text-muted)]">Tableros está en prueba. Pídele a un administrador que te lo habilite.</div>
      </div>
    );
  }

  const activa = visibles.find((p) => p.clave === tab) ?? visibles[0];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Tableros</h1>
        <span className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold" style={{ background: "var(--bg-accent-soft)", color: "var(--accent)" }}>
          En prueba
        </span>
      </div>
      {google && MOTIVOS_GOOGLE[google] && (
        <div className="mb-3 flex items-start gap-2">
          <div className="flex-1"><Nota tono={MOTIVOS_GOOGLE[google][0]}>{MOTIVOS_GOOGLE[google][1]}</Nota></div>
          <button type="button" onClick={cerrarGoogle} aria-label="Cerrar aviso" className="px-2 text-[var(--text-muted)]">×</button>
        </div>
      )}
      <p className="mb-5 text-[0.82rem] text-[var(--text-muted)]">
        Los tableros propios de la app, para dejar de depender de Monday. Cada pestaña es una pieza que se va construyendo.
      </p>

      <div className="mb-6 flex w-fit flex-wrap rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }} role="tablist">
        {visibles.map((p) => (
          <button
            key={p.clave}
            role="tab"
            aria-selected={activa.clave === p.clave}
            onClick={() => setTab(p.clave)}
            className="rounded-md px-3.5 py-1.5 text-[0.82rem] font-bold transition-colors"
            style={activa.clave === p.clave ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-muted)" }}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <activa.Componente key={activa.clave} />
    </div>
  );
}
