"use client";

// Controles editables EN SITIO para la tabla "Causas de atraso" del Status
// Ejecutivo (ver components/StatusReport.tsx):
//  - AtrasoRespReparto: reparte los días de atraso entre roles con selectores
//    en cascada (elige días + rol; si queda saldo aparece otra línea con los
//    días restantes; al llegar a 0 se cierra). Sustituye al <select> único.
//  - AtrasoMotivoInput: el Motivo como texto editable.
// Persistencia optimista: actualiza el contexto y hace POST /api/atraso-detalle;
// si falla, resincroniza con refresh().

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";
import { ATRASO_RESPONSABLES } from "@/lib/delay";
import { atrasoRespSlot } from "@/lib/reportTheme";
import { respToneColor } from "@/components/StatusReport";
import type { AtrasoReparto } from "@/types";

const MAX_LEN = 500;

function useSaveAtraso(itemId: string) {
  const { data, setAtrasoDetalle, refresh } = useData();
  const det = data?.atrasoDetalles[itemId];
  const save = async (reparto: AtrasoReparto[], motivo: string) => {
    setAtrasoDetalle(itemId, { reparto, motivo }); // optimista
    try {
      const res = await authedFetch("/api/atraso-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, reparto, motivo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
    }
  };
  return { det, save };
}

const pillStyle = (resp: string): React.CSSProperties => {
  const c = respToneColor(atrasoRespSlot(resp));
  return { background: `${c}15`, color: c, border: `1px solid ${c}55` };
};

/** Tramos guardados de un detalle, migrando el `responsable` legacy a un tramo
 *  con todos los días. Vacío si nunca se asignó nada (no inventa "Sin asignar"). */
function savedTramos(
  det: { reparto?: AtrasoReparto[]; responsable?: string } | undefined,
  totalDias: number,
): AtrasoReparto[] {
  if (det?.reparto?.length) return det.reparto;
  if (det?.responsable) return [{ dias: totalDias, resp: det.responsable }];
  return [];
}

function DiasSelect({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const hi = Math.max(max, value, 1);
  return (
    <select
      className="reparto-dias"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      title="Días atribuidos a este rol"
    >
      {Array.from({ length: hi }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

/** Línea "pendiente": los días de atraso que aún no tienen responsable. Al
 *  elegir un rol se convierte en un tramo. `key={rem}` en el caller la reinicia
 *  cuando cambia el saldo. */
function PendingLine({ rem, withDias, onAdd }: {
  rem: number; withDias: boolean; onAdd: (dias: number, resp: string) => void;
}) {
  const [dias, setDias] = useState(rem || 1);
  const d = Math.min(Math.max(dias, 1), rem || 1);
  return (
    <div className="reparto-line pending">
      {withDias && (
        <>
          <select
            className="reparto-dias"
            value={d}
            onChange={(e) => setDias(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            title="Días atribuidos a este rol"
          >
            {Array.from({ length: Math.max(rem, 1) }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="reparto-x">d ·</span>
        </>
      )}
      <select
        className="pill-resp reparto-pending-role"
        value=""
        onChange={(e) => onAdd(withDias ? d : 0, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        title="Asignar responsable de estos días"
      >
        <option value="">Asignar…</option>
        {ATRASO_RESPONSABLES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

/** Celda "Responsable": reparto de los `totalDias` de atraso entre roles.
 *  `totalDias === 0` (solo "Stuck") → un único selector de rol sin días. */
export function AtrasoRespReparto({ itemId, totalDias }: { itemId: string; totalDias: number }) {
  const { det, save } = useSaveAtraso(itemId);
  const motivo = det?.motivo ?? "";

  const tramos = savedTramos(det, totalDias);

  const used = tramos.reduce((s, r) => s + r.dias, 0);
  const rem = Math.max(0, totalDias - used);

  const commit = (next: AtrasoReparto[]) => save(next.filter((r) => r.resp), motivo);
  const setDias = (i: number, d: number) => commit(tramos.map((r, j) => (j === i ? { ...r, dias: d } : r)));
  const setResp = (i: number, resp: string) =>
    commit(resp ? tramos.map((r, j) => (j === i ? { ...r, resp } : r)) : tramos.filter((_, j) => j !== i));
  const addTramo = (dias: number, resp: string) => { if (resp) commit([...tramos, { dias, resp }]); };

  const showPending = totalDias === 0 ? tramos.length === 0 : rem > 0;

  return (
    <div className="reparto-edit" onClick={(e) => e.stopPropagation()}>
      {tramos.map((r, i) => (
        <div className="reparto-line" key={i}>
          {totalDias > 0 && (
            <>
              <DiasSelect value={r.dias} max={r.dias + rem} onChange={(d) => setDias(i, d)} />
              <span className="reparto-x">d ·</span>
            </>
          )}
          <select
            className="pill-resp"
            value={r.resp}
            onChange={(e) => setResp(i, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={pillStyle(r.resp)}
            title="Responsable de estos días"
          >
            {ATRASO_RESPONSABLES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button type="button" className="reparto-rm" title="Quitar tramo" onClick={() => setResp(i, "")}>×</button>
        </div>
      ))}

      {showPending && (
        <PendingLine key={`pend-${rem}`} rem={totalDias === 0 ? 0 : rem} withDias={totalDias > 0} onAdd={addTramo} />
      )}

      {totalDias > 0 && tramos.length > 0 && (
        <div className={`reparto-foot ${rem === 0 ? "ok" : "rem"}`}>
          {rem === 0 ? `✓ ${totalDias} / ${totalDias} d repartidos` : `Faltan ${rem} d de ${totalDias}`}
        </div>
      )}
    </div>
  );
}

/** Celda "Motivo": <textarea> multilínea con la pinta de `.c-motivo` — crece
 *  solo para mostrar todo el texto, respeta saltos de línea (Enter). Ctrl/⌘+Enter
 *  guarda y sale; Esc revierte; también guarda al perder foco. */
export function AtrasoMotivoInput({ itemId, totalDias }: { itemId: string; totalDias: number }) {
  const { det, save } = useSaveAtraso(itemId);
  const reparto = savedTramos(det, totalDias);
  const [motivo, setMotivo] = useState(det?.motivo ?? "");
  const [prev, setPrev] = useState(det?.motivo ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  if ((det?.motivo ?? "") !== prev) { // realinea si cambió por fuera (refresh / otro usuario)
    setPrev(det?.motivo ?? "");
    setMotivo(det?.motivo ?? "");
  }
  const autosize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(autosize, [motivo, autosize]);
  const commit = () => { if (motivo !== (det?.motivo ?? "")) save(reparto, motivo); };
  return (
    <textarea
      ref={ref}
      className="c-motivo-input"
      rows={1}
      value={motivo}
      onChange={(e) => setMotivo(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
        else if (e.key === "Escape") { setMotivo(det?.motivo ?? ""); (e.target as HTMLTextAreaElement).blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="Motivo del atraso…"
      maxLength={MAX_LEN}
      title="Motivo del atraso — Enter: salto de línea · Ctrl+Enter: guardar"
    />
  );
}
