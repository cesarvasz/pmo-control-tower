"use client";

// Slicer de línea de tiempo, al estilo de las tablas dinámicas de Excel:
// una tira horizontal de meses agrupados por año donde se selecciona uno con un
// clic o un rango arrastrando. La barra dentro de cada celda muestra el volumen
// del mes, para que se vea dónde están los datos antes de filtrar.
//
// El filtro de la app admite meses sueltos (no contiguos); arrastrar produce el
// rango contiguo, que es la interacción natural de este control, y Ctrl/⌘ + clic
// cubre las selecciones arbitrarias.

import { useEffect, useMemo, useRef, useState } from "react";

export interface MesOpcion { value: string; label: string; count: number }

/**
 * Alto del Topbar, medido en vivo.
 *
 * El Topbar es `sticky top-0` y su alto cambia entre móvil y escritorio (el
 * subtítulo se oculta en pantallas chicas), así que fijar un número a mano
 * dejaría el timeline flotando o tapado. Se mide y se reacciona a los cambios.
 */
function useAltoTopbar(): number {
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const medir = () => setAlto(header.getBoundingClientRect().height);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return alto;
}

/** ¿El elemento ya quedó pegado arriba? Un centinela encima lo delata. */
function usePegado(ref: React.RefObject<HTMLDivElement | null>, offset: number): boolean {
  const [pegado, setPegado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setPegado(!e.isIntersecting),
      { rootMargin: `-${offset + 1}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, offset]);
  return pegado;
}

export default function TimelineMeses({
  meses, seleccion, onChange,
}: {
  /** Meses disponibles; se ordenan cronológicamente aquí. */
  meses: MesOpcion[];
  /** Claves "YYYY-MM" seleccionadas. Vacío = todos. */
  seleccion: string[];
  onChange: (meses: string[]) => void;
}) {
  const orden = useMemo(() => [...meses].sort((a, b) => a.value.localeCompare(b.value)), [meses]);
  const maxVol = Math.max(1, ...orden.map((m) => m.count));

  // Se queda pegado bajo el Topbar para tenerlo a mano durante todo el scroll.
  const centinela = useRef<HTMLDivElement>(null);
  const topbar = useAltoTopbar();
  const pegado = usePegado(centinela, topbar);

  const [arrastre, setArrastre] = useState<{ desde: number; hasta: number } | null>(null);
  const arrastrando = useRef(false);
  // Espejo del rango en curso: el listener de mouseup necesita leerlo sin pasar
  // por el updater de setArrastre (avisar al padre desde ahí sería un setState
  // durante el render de este componente).
  const rangoRef = useRef<{ desde: number; hasta: number } | null>(null);

  const marcar = (r: { desde: number; hasta: number } | null) => {
    rangoRef.current = r;
    setArrastre(r);
  };

  // El arrastre termina aunque se suelte fuera de la tira.
  useEffect(() => {
    const fin = () => {
      if (!arrastrando.current) return;
      arrastrando.current = false;
      const a = rangoRef.current;
      rangoRef.current = null;
      setArrastre(null);
      if (a) {
        const [i, j] = a.desde <= a.hasta ? [a.desde, a.hasta] : [a.hasta, a.desde];
        onChange(orden.slice(i, j + 1).map((m) => m.value));
      }
    };
    window.addEventListener("mouseup", fin);
    return () => window.removeEventListener("mouseup", fin);
  }, [orden, onChange]);

  const sel = new Set(seleccion);
  const rango = arrastre
    ? (arrastre.desde <= arrastre.hasta ? [arrastre.desde, arrastre.hasta] : [arrastre.hasta, arrastre.desde])
    : null;
  const activo = (i: number) =>
    rango ? i >= rango[0] && i <= rango[1] : sel.size === 0 ? false : sel.has(orden[i].value);

  // Años, para la banda superior.
  const anios = useMemo(() => {
    const out: { anio: string; desde: number; n: number }[] = [];
    orden.forEach((m, i) => {
      const a = m.value.slice(0, 4);
      const ult = out[out.length - 1];
      if (ult && ult.anio === a) ult.n++;
      else out.push({ anio: a, desde: i, n: 1 });
    });
    return out;
  }, [orden]);

  const etiquetaSeleccion = () => {
    if (sel.size === 0) return "Todos los periodos";
    const elegidos = orden.filter((m) => sel.has(m.value));
    if (elegidos.length === 1) return elegidos[0].label;
    const contiguo = elegidos.length === orden.indexOf(elegidos[elegidos.length - 1]) - orden.indexOf(elegidos[0]) + 1;
    return contiguo
      ? `${elegidos[0].label} – ${elegidos[elegidos.length - 1].label}`
      : `${elegidos.length} meses seleccionados`;
  };

  const volSeleccionado = orden
    .filter((m) => sel.size === 0 || sel.has(m.value))
    .reduce((s, m) => s + m.count, 0);

  if (orden.length === 0) return null;

  return (
    <>
      {/* Centinela: marca dónde empezaría el timeline si no estuviera pegado. */}
      <div ref={centinela} aria-hidden style={{ height: 1 }} />

      <div
        className="mb-5 rounded-xl border transition-shadow"
        style={{
          position: "sticky",
          top: topbar,
          zIndex: 40, // debajo del Topbar (z-50), encima del contenido
          background: "var(--bg-surface)",
          borderColor: pegado ? "var(--accent)" : "var(--border)",
          boxShadow: pegado ? "0 6px 16px -6px rgba(0,0,0,0.45)" : undefined,
        }}
      >
      <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Periodo</span>
        <span className="text-[0.82rem] font-semibold text-[var(--text-primary)]">{etiquetaSeleccion()}</span>
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          {volSeleccionado.toLocaleString("es-GT")} expedientes
        </span>
        {sel.size > 0 && (
          <button
            onClick={() => onChange([])}
            title="Quitar el filtro de periodo"
            className="ml-auto rounded-lg border px-2.5 py-1 text-[0.72rem] font-semibold text-[var(--text-muted)] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]"
            style={{ borderColor: "var(--border)" }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      <div className="overflow-x-auto px-4" style={{ paddingTop: pegado ? 6 : 12, paddingBottom: pegado ? 6 : 12 }}>
        <div className="min-w-max select-none">
          {/* Banda de años */}
          <div className="mb-1 flex gap-px">
            {anios.map((a) => (
              <div
                key={a.anio}
                onClick={() => onChange(orden.slice(a.desde, a.desde + a.n).map((m) => m.value))}
                title={`Seleccionar todo ${a.anio}`}
                className="cursor-pointer rounded-t-md px-1 py-0.5 text-center text-[0.68rem] font-bold tracking-wide transition-colors hover:bg-[var(--bg-accent-soft)]"
                style={{ width: a.n * 54, background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                {a.anio}
              </div>
            ))}
          </div>

          {/* Tira de meses */}
          <div className="flex gap-px">
            {orden.map((m, i) => {
              const on = activo(i);
              return (
                <div
                  key={m.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // Ctrl/⌘ + clic: alterna un mes suelto (selección no contigua).
                    if (e.ctrlKey || e.metaKey) {
                      onChange(sel.has(m.value) ? seleccion.filter((v) => v !== m.value) : [...seleccion, m.value]);
                      return;
                    }
                    arrastrando.current = true;
                    marcar({ desde: i, hasta: i });
                  }}
                  onMouseEnter={() => {
                    const a = rangoRef.current;
                    if (arrastrando.current && a) marcar({ ...a, hasta: i });
                  }}
                  title={`${m.label} · ${m.count.toLocaleString("es-GT")} expedientes`}
                  className="flex cursor-pointer flex-col justify-end transition-colors"
                  style={{
                    width: 54, height: pegado ? 34 : 52,
                    background: on ? "var(--bg-accent-soft)" : "var(--bg-hover)",
                    boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : undefined,
                    borderRadius: 4,
                  }}
                >
                  {/* Volumen del mes */}
                  <div className="mx-1.5 rounded-sm"
                    style={{
                      height: Math.max(2, (m.count / maxVol) * (pegado ? 10 : 26)),
                      background: on ? "var(--accent)" : "var(--text-disabled)",
                      opacity: on ? 0.9 : 0.5,
                    }} />
                  <div className="pb-1 pt-1 text-center text-[0.66rem] font-semibold"
                    style={{ color: on ? "var(--accent-light)" : "var(--text-muted)" }}>
                    {m.label.split(" ")[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* La ayuda estorba una vez pegado: ya se leyó y ahí el alto es lo que escasea. */}
      {!pegado && (
        <div className="border-t px-4 py-1.5 text-[0.68rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Clic en un mes para filtrarlo · arrastra para un rango · Ctrl/⌘ + clic para meses sueltos ·
          clic en el año para seleccionarlo completo
        </div>
      )}
      </div>
    </>
  );
}
