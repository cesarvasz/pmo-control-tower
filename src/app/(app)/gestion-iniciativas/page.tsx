"use client";

// /gestion-iniciativas — Crear y dar seguimiento a las Iniciativas, ya como parte de la app (antes solo en /tableros).
// Es el tablero oficial de Iniciativas en modo página: la lista agrupada, «+ Nueva iniciativa» y el pop-up (timeline,
// completar, agendar con Google). El menú y /roles deciden quién entra; adentro, las reglas del tablero deciden qué ve y
// qué edita cada rol (p. ej. un PM, solo las suyas). Métricas: siguen en /iniciativas.

import { Loader, ErrorBox } from "@/components/ui";
import { useCarga } from "@/features/tableros/ui/comun";
import TableroVista from "@/features/tableros/ui/tablero/TableroVista";
import AvisoGoogle from "@/features/tableros/ui/iniciativas/AvisoGoogle";

export default function GestionIniciativasPage() {
  const { data, error } = useCarga<{ id: string }>("/api/iniciativas/tablero");

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Gestión de Iniciativas</h1>
      </div>
      <p className="mb-4 text-[0.82rem] text-[var(--text-muted)]">
        Crea iniciativas, completa sus acciones y agenda sus reuniones. Los indicadores siguen en la página Iniciativas.
      </p>
      <AvisoGoogle />
      {error ? <ErrorBox msg={error} /> : !data ? <Loader /> : <TableroVista id={data.id} pagina />}
    </div>
  );
}
