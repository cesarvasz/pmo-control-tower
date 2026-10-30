// Celda de la fila de métricas de una tarjeta de Player (p. ej. EVM · Beneficio · Calidad · Cumplimiento · NPS del
// PM, o los indicadores del VPA). La etiqueta tiene altura mínima fija para que los valores queden alineados aunque
// el texto ocupe una o dos líneas.
export default function MetricCell({ label, value, color, onClick, title, divider, sub, badge }: {
  label: string; value: React.ReactNode; color: string; onClick?: () => void; title?: string; divider?: boolean; sub?: string;
  /** Etiqueta de salud (con su fondo) debajo del valor — la del EVM del PM. */
  badge?: { text: string; color: string; bg: string };
}) {
  const style = divider ? { borderLeft: "1px solid var(--border)" } : undefined;
  const cls = `flex flex-col items-center px-1.5 py-2.5 text-center ${onClick ? "cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" : ""}`;
  const inner = (
    <>
      <span className="flex min-h-[2rem] items-center text-[0.56rem] font-bold uppercase leading-tight tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <span className="mt-0.5 text-[0.95rem] font-extrabold leading-none tabular-nums" style={{ color }}>
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 text-[0.56rem] font-bold uppercase leading-tight tracking-wide" style={{ color }}>
          {sub}
        </span>
      )}
      {badge && (
        <span className="mt-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.56rem] font-bold uppercase leading-none tracking-wide" style={{ color: badge.color, background: badge.bg }}>
          {badge.text}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button onClick={onClick} title={title} className={cls} style={style}>{inner}</button>
  ) : (
    <div title={title} className={cls} style={style}>{inner}</div>
  );
}
