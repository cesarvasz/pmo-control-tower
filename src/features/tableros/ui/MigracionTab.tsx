"use client";

// Pestaña Migración: el portafolio completo de Monday → tableros de la app. Importa en orden
// (Estrategia → Iniciativas → PML → Proyectos, porque las relaciones necesitan su destino), compara
// cada uno con Monday y trae bitácora y archivos. Todo board por board, para no pasar del tiempo
// máximo de una llamada al servidor.

import { useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { ErrorBox, Loader, Pill, StatCard } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import { Boton, enviar, Nota, useCarga } from "./comun";
import CompararModal, { filaIgual, type Comparacion } from "./tablero/CompararModal";

interface BoardImportable { id: string; nombre: string; tipo: "est" | "ini" | "req" | "proj"; tableroId: string | null }
interface Estado { comparacion?: { diferencias: number; avisos: number }; error?: string; trabajando?: string; extras?: string }

const TIPO: Record<BoardImportable["tipo"], string> = { est: "Estrategia", ini: "Iniciativas", req: "PML / VALOR Lite", proj: "Proyecto" };
const URL_API = "/api/tableros/importar";

export default function MigracionTab() {
  const { me } = useMe();
  const puede = tieneAccionTableros(me?.permissions, "tableros_crear");
  const { data, error, recargar } = useCarga<{ boards: BoardImportable[] }>(puede ? URL_API : "");
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [viendo, setViendo] = useState<string | null>(null);

  if (!puede) return <Nota>La migración la hace quien puede crear tableros (por ahora, el Admin).</Nota>;
  if (!data) return error ? <ErrorBox msg={error} /> : <Loader />;

  const marcar = (id: string, e: Estado) => setEstado((s) => ({ ...s, [id]: { ...s[id], ...e } }));

  async function importar(b: BoardImportable): Promise<string | null> {
    marcar(b.id, { trabajando: "Importando…", error: undefined });
    try {
      const r = await enviar<{ tableroId: string }>(URL_API, "POST", { mondayBoardId: b.id, reemplazar: !!b.tableroId });
      marcar(b.id, { trabajando: undefined, comparacion: undefined });
      return r.tableroId;
    } catch (e) {
      marcar(b.id, { trabajando: undefined, error: e instanceof Error ? e.message : "Error" });
      return null;
    }
  }

  async function comparar(b: BoardImportable, tableroId: string) {
    marcar(b.id, { trabajando: "Comparando…" });
    try {
      const c = await enviar<Comparacion>(`/api/tableros/tableros/${tableroId}/comparar`, "GET");
      marcar(b.id, { trabajando: undefined, comparacion: { diferencias: c.diferencias.length + c.filas.filter((f) => !filaIgual(f)).length, avisos: c.avisos.length } });
    } catch (e) {
      marcar(b.id, { trabajando: undefined, error: e instanceof Error ? e.message : "Error" });
    }
  }

  async function traer(b: BoardImportable, tableroId: string) {
    marcar(b.id, { trabajando: "Trayendo bitácora y archivos…" });
    try {
      const r = await enviar<{ comentariosNuevos: number; archivosNuevos: number; errores: string[] }>(`/api/tableros/tableros/${tableroId}/traer-de-monday`, "POST");
      marcar(b.id, { trabajando: undefined, extras: `+${r.comentariosNuevos} actualizaciones, +${r.archivosNuevos} archivos${r.errores.length ? ` · ${r.errores.length} con error` : ""}` });
    } catch (e) {
      marcar(b.id, { trabajando: undefined, error: e instanceof Error ? e.message : "Error" });
    }
  }

  /** Corre una tarea board por board, en el orden de importación. */
  async function enLote(nombre: string, lista: BoardImportable[], tarea: (b: BoardImportable) => Promise<void>) {
    setOcupado(nombre);
    for (const b of lista) await tarea(b);
    await recargar();
    setOcupado(null);
  }

  const boards = data.boards;
  const importados = boards.filter((b) => b.tableroId);
  const comparados = boards.filter((b) => estado[b.id]?.comparacion);
  const igual = comparados.filter((b) => estado[b.id]!.comparacion!.diferencias === 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Pasa el portafolio de Monday a tableros de la app, tal cual. El orden importa: Estrategia, luego Iniciativas y PML (que se ligan a
        Estrategia) y al final los Proyectos. Volver a importar conserva los mismos ids, así no se rompe lo que apunta a un tablero. El
        Directorio RH ya está en la pestaña Directorio.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard value={boards.length} label="Boards en Monday" />
        <StatCard value={importados.length} label="Importados" />
        <StatCard value={comparados.length ? `${igual.length}/${comparados.length}` : "—"} label="Miden igual" color={comparados.length && igual.length === comparados.length ? "var(--ok)" : undefined} />
        <StatCard value={boards.reduce((n, b) => n + (estado[b.id]?.comparacion?.avisos ?? 0), 0)} label="Personas fuera del directorio" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton primario disabled={!!ocupado} onClick={() => enLote("importar", boards.filter((b) => !b.tableroId), async (b) => { const id = await importar(b); if (id) await comparar(b, id); })}>
          {ocupado === "importar" ? "Importando…" : `Importar lo que falta (${boards.length - importados.length})`}
        </Boton>
        <Boton disabled={!!ocupado || !importados.length} onClick={() => enLote("comparar", importados, (b) => comparar(b, b.tableroId!))}>
          {ocupado === "comparar" ? "Comparando…" : "Comparar todo con Monday"}
        </Boton>
        <Boton disabled={!!ocupado || !importados.length} onClick={() => enLote("traer", importados, (b) => traer(b, b.tableroId!))}>
          {ocupado === "traer" ? "Trayendo…" : "Traer bitácora y archivos de todo"}
        </Boton>
        <Boton disabled={!!ocupado} onClick={() => {
          if (!confirm("¿Volver a importar TODO desde Monday? Se reemplazan los tableros importados con lo que hay hoy en Monday (lo editado en la app se pierde; después hay que traer otra vez la bitácora y los archivos).")) return;
          void enLote("reimportar", boards, async (b) => { const id = await importar(b); if (id) await comparar(b, id); });
        }}>
          {ocupado === "reimportar" ? "Reimportando…" : "Volver a importar todo"}
        </Boton>
      </div>

      <div className="table-wrap">
        <table className="pmo">
          <thead><tr><th>Board de Monday</th><th>Tipo</th><th>Estado</th><th>Comparación</th><th /></tr></thead>
          <tbody>
            {boards.map((b) => {
              const e = estado[b.id] ?? {};
              const c = e.comparacion;
              return (
                <tr key={b.id}>
                  <td className="pm-name">{b.nombre}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>{TIPO[b.tipo]}</td>
                  <td style={{ fontSize: ".8rem" }}>
                    {e.trabajando ? <span className="text-[var(--accent)]">{e.trabajando}</span>
                      : e.error ? <span className="text-[#e2445c]" title={e.error}>✕ {e.error.slice(0, 60)}</span>
                        : b.tableroId ? <Pill tone="info" small>Importado</Pill> : <Pill tone="neutral" small>Pendiente</Pill>}
                    {e.extras && <div className="text-[0.72rem] text-[var(--text-muted)]">{e.extras}</div>}
                  </td>
                  <td>
                    {!c ? <span className="text-[var(--text-muted)]">—</span>
                      : c.diferencias === 0 ? <Pill tone="ok" small>✓ Mide igual</Pill> : <Pill tone="bad" small>{c.diferencias} diferencias</Pill>}
                    {c && c.avisos > 0 && <span className="ml-1.5 text-[0.72rem] text-[var(--text-muted)]">{c.avisos} aviso{c.avisos === 1 ? "" : "s"}</span>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {b.tableroId && <><Boton disabled={!!ocupado || !!e.trabajando} onClick={() => setViendo(b.tableroId)}>Ver comparación</Boton>{" "}</>}
                    <Boton disabled={!!ocupado || !!e.trabajando} primario={!b.tableroId} onClick={async () => {
                      if (b.tableroId && !confirm(`¿Volver a importar «${b.nombre}»? Se reemplaza con lo que hay hoy en Monday.`)) return;
                      const id = await importar(b);
                      if (id) { await comparar(b, id); await recargar(); }
                    }}>
                      {b.tableroId ? "Volver a importar" : "Importar"}
                    </Boton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {viendo && <CompararModal tableroId={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}
