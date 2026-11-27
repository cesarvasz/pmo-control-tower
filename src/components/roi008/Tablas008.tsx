"use client";

// Tablas del análisis de tiempos ROI 008 (pestaña «Ducafast SV» de ROI). Todas
// usan table.pmo dentro de .table-wrap (scroll horizontal en pantallas
// angostas, encabezado fijo). Solo números: el contexto lo da cada sección.

import { fmtFechaHora, fmtHabil } from "@/lib/horario008";
import {
  MEDIDAS, TRAMO_KEYS, etiquetaMes, fmtNum, fmtPct,
  type File008, type FilaMes, type FilaRango, type FilaUso, type FilaUsuarioTiempo, type Medida,
} from "@/lib/tiempos008";
import { COLOR_DUCAFAST, COLOR_TRAMO } from "@/components/roi008/Graficas008";

const NUM = "tabular-nums text-right whitespace-nowrap";
const thDer = { textAlign: "right" as const };

const SinCasos = ({ msg }: { msg: string }) => (
  <div className="rounded-xl border px-4 py-6 text-center text-[0.8rem] text-[var(--text-muted)]"
    style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
    {msg}
  </div>
);

/** Celda con una barra de fondo proporcional (0–1) en el color dado. */
function CeldaBarra({ frac, color, children, className = "" }: {
  frac: number | null; color: string; children: React.ReactNode; className?: string;
}) {
  const ancho = Math.max(0, Math.min(1, frac ?? 0));
  return (
    <td className={`relative ${NUM} ${className}`} style={{ minWidth: 120 }}>
      <span aria-hidden className="absolute inset-y-1.5 left-2 rounded"
        style={{ width: `calc((100% - 16px) * ${ancho})`, background: `color-mix(in srgb, ${color} 24%, transparent)` }} />
      <span className="relative">{children}</span>
    </td>
  );
}

const Nombre = ({ texto }: { texto: string }) => (
  <td className="max-w-[16rem] truncate text-[var(--text-primary)]" title={texto}>{texto}</td>
);

// ── Por mes (files con y sin Ducafast) ───────────────────────────────────

export function TablaUsoMes({ porMes }: { porMes: FilaMes[] }) {
  if (!porMes.length) return null;
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>Mes</th><th style={thDer}>Total files</th><th style={thDer}>Ducafast</th>
            <th style={thDer}>Sin Ducafast</th><th style={thDer}>% Ducafast</th>
          </tr>
        </thead>
        <tbody>
          {porMes.map((m) => (
            <tr key={m.mes}>
              <td className="whitespace-nowrap">{etiquetaMes(m.mes)}</td>
              <td className={NUM}>{fmtNum(m.total)}</td>
              <td className={NUM}>{fmtNum(m.con)}</td>
              <td className={NUM}>{fmtNum(m.sin)}</td>
              <CeldaBarra frac={m.pct} color={COLOR_DUCAFAST}>{fmtPct(m.pct)}</CeldaBarra>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Por usuario / por cliente ────────────────────────────────────────────

export function TablaUso({ titulo, filas }: { titulo: string; filas: FilaUso[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[0.8rem] font-semibold text-[var(--text-primary)]">
        Por {titulo.toLowerCase()} <span className="font-normal text-[var(--text-muted)]">· {fmtNum(filas.length)}</span>
      </div>
      {!filas.length ? <SinCasos msg="Sin files con estos filtros." /> : (
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="pmo">
            <thead>
              <tr>
                <th>{titulo}</th><th style={thDer}>Total</th><th style={thDer}>Ducafast</th>
                <th style={thDer}>Sin Ducafast</th><th style={thDer}>% Ducafast</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre}>
                  <Nombre texto={f.nombre} />
                  <td className={NUM}>{fmtNum(f.total)}</td>
                  <td className={NUM}>{fmtNum(f.con)}</td>
                  <td className={NUM}>{fmtNum(f.sin)}</td>
                  <CeldaBarra frac={f.pct} color={COLOR_DUCAFAST}>{fmtPct(f.pct)}</CeldaBarra>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Top 10 usuarios con más tiempo ───────────────────────────────────────

export function TablaTopUsuarios({ filas, medida }: { filas: FilaUsuarioTiempo[]; medida: Medida }) {
  if (!filas.length) return <SinCasos msg="Sin files con Ducafast medidos en este tramo con estos filtros." />;
  const max = Math.max(...filas.map((u) => u.medidas[medida].promedio ?? 0), 1);
  const color = medida === "cadena" ? "var(--accent-light)" : COLOR_TRAMO[medida];
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th><th>Usuario</th><th style={thDer}>Files medidos</th>
            <th style={thDer}>Promedio</th><th style={thDer}>Mediana</th>
            {TRAMO_KEYS.map((k) => <th key={k} style={thDer}>{MEDIDAS[k].corto} promedio</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((u, i) => {
            const m = u.medidas[medida];
            return (
              <tr key={u.usuario}>
                <td className="tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                <Nombre texto={u.usuario} />
                <td className={NUM}>{fmtNum(m.n)}</td>
                <CeldaBarra frac={(m.promedio ?? 0) / max} color={color} className="font-semibold">{fmtHabil(m.promedio)}</CeldaBarra>
                <td className={NUM}>{fmtHabil(m.mediana)}</td>
                {TRAMO_KEYS.map((k) => <td key={k} className={`${NUM} text-[var(--text-secondary)]`}>{fmtHabil(u.medidas[k].promedio)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Detalle mensual de tiempos ───────────────────────────────────────────

export function TablaDetalleMensual({ porMes }: { porMes: FilaMes[] }) {
  if (!porMes.length) return <SinCasos msg="Sin files con estos filtros." />;
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>Mes</th><th style={thDer}>Files con Ducafast</th>
            {TRAMO_KEYS.flatMap((k) => [
              <th key={`${k}m`} style={thDer}>{MEDIDAS[k].corto} mediana</th>,
              <th key={`${k}p`} style={thDer}>{MEDIDAS[k].corto} promedio</th>,
            ])}
            <th style={thDer}>T2 simultáneo (%)</th><th style={thDer}>T3 invertidos</th>
          </tr>
        </thead>
        <tbody>
          {porMes.map((m) => (
            <tr key={m.mes}>
              <td className="whitespace-nowrap">{etiquetaMes(m.mes)}</td>
              <td className={NUM}>{fmtNum(m.con)}</td>
              {TRAMO_KEYS.flatMap((k) => [
                <td key={`${k}m`} className={NUM}>{fmtHabil(m.tramos[k].mediana)}</td>,
                <td key={`${k}p`} className={`${NUM} text-[var(--text-secondary)]`}>{fmtHabil(m.tramos[k].promedio)}</td>,
              ])}
              <td className={NUM}>{fmtPct(m.simultaneo)}</td>
              <td className={NUM}>{fmtNum(m.invertidos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Distribución por rangos ──────────────────────────────────────────────

export function TablaDistribucion({ filas }: { filas: FilaRango[] }) {
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>Rango (horas hábiles)</th>
            {TRAMO_KEYS.map((k) => (
              <th key={k} style={thDer}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COLOR_TRAMO[k] }} />
                {MEDIDAS[k].corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.label}>
              <td className="whitespace-nowrap">{r.label}</td>
              {TRAMO_KEYS.map((k) => {
                const c = r.porTramo[k];
                return (
                  <CeldaBarra key={k} frac={c.pct} color={COLOR_TRAMO[k]}>
                    {c.pct == null ? "—" : <>{fmtPct(c.pct)} <span className="text-[var(--text-muted)]">({fmtNum(c.n)})</span></>}
                  </CeldaBarra>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Los 10 files con la cadena más larga ─────────────────────────────────

export function TablaTopCadena({ files }: { files: File008[] }) {
  if (!files.length) return <SinCasos msg="Sin files con la cadena completa con estos filtros." />;
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>File</th><th>Usuario</th><th>Creado</th>
            {TRAMO_KEYS.map((k) => <th key={k} style={thDer}>{MEDIDAS[k].corto}</th>)}
            <th style={thDer}>Total</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.file}>
              <td className="ini-id">{f.file}</td>
              <Nombre texto={f.usuario} />
              <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{fmtFechaHora(f.creado)}</td>
              {TRAMO_KEYS.map((k) => <td key={k} className={`${NUM} text-[var(--text-secondary)]`}>{fmtHabil(f[k])}</td>)}
              <td className={`${NUM} font-semibold`}>{fmtHabil(f.cadena)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Files a revisar: solicitud antes de la clasificación ─────────────────

export function TablaRevisar({ files }: { files: File008[] }) {
  if (!files.length) return <SinCasos msg="No hay files con la solicitud antes de la clasificación con estos filtros." />;
  return (
    <div className="table-wrap" style={{ maxHeight: 420 }}>
      <table className="pmo">
        <thead>
          <tr>
            <th>File</th><th>Usuario</th><th>Clasificación exacta</th><th>Solicitud prepóliza</th>
            <th style={thDer}>Diferencia hábil</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.file}>
              <td className="ini-id">{f.file}</td>
              <Nombre texto={f.usuario} />
              <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{fmtFechaHora(f.clas)}</td>
              <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{fmtFechaHora(f.sol)}</td>
              <td className={`${NUM} font-semibold`} style={{ color: "var(--bad)" }}>{fmtHabil(f.t3Diferencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
