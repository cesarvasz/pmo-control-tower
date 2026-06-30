"use client";

interface Asueto {
  date: string;   // ISO yyyy-mm-dd
  name: string;
  note?: string;  // p. ej. "Medio día" o "Semana Santa"
}

// Asuetos oficiales de Guatemala (Art. 127 Código de Trabajo + Día de la Madre).
// Semana Santa: Pascua 2026 = 5 abr · Pascua 2027 = 28 mar.
const ASUETOS: Record<number, Asueto[]> = {
  2026: [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-04-02", name: "Jueves Santo", note: "Semana Santa" },
    { date: "2026-04-03", name: "Viernes Santo", note: "Semana Santa" },
    { date: "2026-04-04", name: "Sábado Santo", note: "Semana Santa" },
    { date: "2026-05-01", name: "Día del Trabajo" },
    { date: "2026-05-10", name: "Día de la Madre" },
    { date: "2026-06-30", name: "Día del Ejército" },
    { date: "2026-08-15", name: "Día de la Asunción", note: "Fiesta patronal · Ciudad de Guatemala" },
    { date: "2026-09-15", name: "Día de la Independencia" },
    { date: "2026-10-20", name: "Día de la Revolución" },
    { date: "2026-11-01", name: "Día de Todos los Santos" },
    { date: "2026-12-24", name: "Nochebuena", note: "A partir del mediodía" },
    { date: "2026-12-25", name: "Navidad" },
    { date: "2026-12-31", name: "Fin de Año", note: "A partir del mediodía" },
  ],
  2027: [
    { date: "2027-01-01", name: "Año Nuevo" },
    { date: "2027-03-25", name: "Jueves Santo", note: "Semana Santa" },
    { date: "2027-03-26", name: "Viernes Santo", note: "Semana Santa" },
    { date: "2027-03-27", name: "Sábado Santo", note: "Semana Santa" },
    { date: "2027-05-01", name: "Día del Trabajo" },
    { date: "2027-05-10", name: "Día de la Madre" },
    { date: "2027-06-30", name: "Día del Ejército" },
    { date: "2027-08-15", name: "Día de la Asunción", note: "Fiesta patronal · Ciudad de Guatemala" },
    { date: "2027-09-15", name: "Día de la Independencia" },
    { date: "2027-10-20", name: "Día de la Revolución" },
    { date: "2027-11-01", name: "Día de Todos los Santos" },
    { date: "2027-12-24", name: "Nochebuena", note: "A partir del mediodía" },
    { date: "2027-12-25", name: "Navidad" },
    { date: "2027-12-31", name: "Fin de Año", note: "A partir del mediodía" },
  ],
};

// Formatea "2026-01-01" → { dia: "Jue", fecha: "1 ene" } en es-GT, sin desfase de zona horaria.
function fmtAsueto(iso: string): { dia: string; fecha: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dia = dt.toLocaleDateString("es-GT", { weekday: "short" }).replace(".", "");
  const fecha = dt.toLocaleDateString("es-GT", { day: "numeric", month: "short" }).replace(".", "");
  return { dia, fecha };
}

export default function AsuetosModal({ onClose }: { onClose: () => void }) {
  const years = Object.keys(ASUETOS).map(Number).sort();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              🇬🇹 Guatemala
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">
              Asuetos Oficiales {years[0]}–{years[years.length - 1]}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {years.map((year) => (
            <div key={year}>
              <div className="mb-2 text-[0.8rem] font-bold uppercase tracking-widest text-[var(--accent)]">
                {year}
              </div>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {ASUETOS[year].map((a, i) => {
                  const { dia, fecha } = fmtAsueto(a.date);
                  return (
                    <div
                      key={a.date}
                      className="flex items-center gap-3 px-3 py-2"
                      style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                    >
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-[0.62rem] uppercase text-[var(--text-muted)]">{dia}</div>
                        <div className="text-[0.82rem] font-bold tabular-nums text-[var(--text-primary)]">{fecha}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.82rem] font-medium text-[var(--text-primary)]">{a.name}</div>
                        {a.note && (
                          <div className="text-[0.66rem] text-[var(--text-muted)]">{a.note}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-6 py-3 text-[0.66rem] text-[var(--text-muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          Asuetos según el Art. 127 del Código de Trabajo. Las fechas de Semana Santa son móviles.
          Incluye la fiesta patronal de la Ciudad de Guatemala (15 ago); otras localidades tienen su propia fecha.
        </div>
      </div>
    </div>
  );
}
