"use client";

// Pestaña Migración: el portafolio de Monday → tableros de la app, y la CONVIVENCIA con Monday
// (Fase 5): la sincronización trae cada hora lo de Monday a los tableros ya importados sin
// rehacerlos (Monday manda en los datos; la app, en el modelo). Aquí se ve cada corrida, se
// dispara una a mano y se compara cada tablero con Monday.

import { useEffect, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { ErrorBox, Loader, Pill, StatCard } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import { Boton, enviar, Nota, Tarjeta, useCarga } from "./comun";
import CompararModal, { filaIgual, type Comparacion } from "./tablero/CompararModal";

interface BoardImportable { id: string; nombre: string; tipo: "est" | "ini" | "req" | "proj"; tableroId: string | null }
interface Estado { comparacion?: { diferencias: number; avisos: number }; error?: string; trabajando?: string }

interface CambiosTablero {
  renombrado?: string;
  creados: number; actualizados: number; valores: number; archivados: number; restaurados: number;
  gruposNuevos: string[]; columnasNuevas: string[]; etiquetasNuevas: string[]; columnasFueraDeMonday: string[];
}
interface BoardCorrida {
  board: string; tipo: string; tableroId: string | null; importado?: boolean; omitido?: string; cambios?: CambiosTablero;
  comentariosNuevos?: number; archivosNuevos?: number; adjuntosSinTraer?: number; diferencias?: number; avisos?: number; error?: string;
}
interface Corrida {
  id: number; origen: string; inicio: string; fin: string | null; estado: "en_curso" | "ok" | "con_errores" | "fallo"; error: string | null;
  resumen: { copia?: { ok: boolean; boards: number; errores: string[] }; boards: BoardCorrida[]; enCurso?: string | null };
}

const TIPO: Record<BoardImportable["tipo"], string> = { est: "Estrategia", ini: "Iniciativas", req: "PML / VALOR Lite", proj: "Proyecto" };
const URL_API = "/api/tableros/importar";
const URL_SYNC = "/api/tableros/sincronizar";
const ESTADO: Record<Corrida["estado"], { tono: "ok" | "warn" | "bad" | "info"; texto: string }> = {
  en_curso: { tono: "info", texto: "Sincronizando…" }, ok: { tono: "ok", texto: "✓ Bien" },
  con_errores: { tono: "warn", texto: "Con errores" }, fallo: { tono: "bad", texto: "Falló" },
};

function hace(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h ${min % 60} min` : new Date(iso).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}
const duracion = (c: Corrida) => (c.fin ? `${Math.max(1, Math.round((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 1000))} s` : "—");

/** Totales de una corrida, para mostrarla en una línea. */
function totales(c: Corrida) {
  const t = { nuevos: 0, cambios: 0, valores: 0, archivados: 0, comentarios: 0, archivos: 0, importados: 0, conDiferencias: 0, conError: 0 };
  for (const b of c.resumen.boards ?? []) {
    t.nuevos += b.cambios?.creados ?? 0; t.cambios += b.cambios?.actualizados ?? 0; t.valores += b.cambios?.valores ?? 0;
    t.archivados += b.cambios?.archivados ?? 0; t.comentarios += b.comentariosNuevos ?? 0; t.archivos += b.archivosNuevos ?? 0;
    if (b.importado) t.importados++;
    if (b.diferencias) t.conDiferencias++;
    if (b.error) t.conError++;
  }
  return t;
}

function textoTotales(c: Corrida): string {
  const t = totales(c);
  const partes = [
    t.importados && `${t.importados} board${t.importados === 1 ? "" : "s"} nuevo${t.importados === 1 ? "" : "s"}`,
    `${t.nuevos} elementos nuevos`, `${t.cambios} con cambios (${t.valores} valores)`, t.archivados && `${t.archivados} archivados`,
    `+${t.comentarios} actualizaciones`, `+${t.archivos} archivos`,
    t.conDiferencias && `${t.conDiferencias} board${t.conDiferencias === 1 ? "" : "s"} con diferencias`,
    t.conError && `${t.conError} con error`,
  ].filter(Boolean);
  return partes.join(" · ");
}

function textoBoard(b: BoardCorrida): string {
  if (b.omitido) return b.omitido;
  if (b.importado) return "Importado (nuevo en Monday)";
  const c = b.cambios;
  const partes = [
    c?.renombrado && `renombrado en Monday: «${c.renombrado}»`,
    c?.creados && `+${c.creados} nuevos`, c?.actualizados && `${c.actualizados} con cambios`, c?.archivados && `${c.archivados} archivados`,
    c?.restaurados && `${c.restaurados} restaurados`, c?.columnasNuevas.length && `columnas nuevas: ${c.columnasNuevas.join(", ")}`,
    c?.etiquetasNuevas.length && `etiquetas nuevas: ${c.etiquetasNuevas.join(", ")}`,
    b.comentariosNuevos && `+${b.comentariosNuevos} actualizaciones`, b.archivosNuevos && `+${b.archivosNuevos} archivos`,
    b.adjuntosSinTraer && `${b.adjuntosSinTraer} archivo${b.adjuntosSinTraer === 1 ? "" : "s"} que Monday ya no entrega`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sin cambios";
}

export default function MigracionTab() {
  const { me } = useMe();
  const puede = tieneAccionTableros(me?.permissions, "tableros_crear");
  const { data, error, recargar } = useCarga<{ boards: BoardImportable[] }>(puede ? URL_API : "");
  const sync = useCarga<{ corridas: Corrida[] }>(puede ? URL_SYNC : "");
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [viendo, setViendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const corridas = sync.data?.corridas ?? [];
  const ultima = corridas[0];
  const enCurso = ultima?.estado === "en_curso";
  const recargarSync = sync.recargar;
  const recargarBoards = recargar;

  // Mientras corre, se refresca cada 5 s; al terminar, se recargan los boards (pudo importar nuevos).
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => { void recargarSync(); }, 5000);
    return () => { clearInterval(t); void recargarBoards(); };
  }, [enCurso, recargarSync, recargarBoards]);

  if (!puede) return <Nota>La migración la hace quien puede crear tableros (por ahora, el Admin).</Nota>;
  if (!data) return error ? <ErrorBox msg={error} /> : <Loader />;

  const marcar = (id: string, e: Estado) => setEstado((s) => ({ ...s, [id]: { ...s[id], ...e } }));

  async function sincronizarAhora() {
    setFallo(null);
    try { await enviar(URL_SYNC, "POST"); } catch (e) { setFallo(e instanceof Error ? e.message : "Error"); }
    await recargarSync();
  }

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

  /** Corre una tarea board por board, en el orden de importación. */
  async function enLote(nombre: string, lista: BoardImportable[], tarea: (b: BoardImportable) => Promise<void>) {
    setOcupado(nombre);
    for (const b of lista) await tarea(b);
    await recargar();
    setOcupado(null);
  }

  const boards = data.boards;
  const importados = boards.filter((b) => b.tableroId);
  // Resultado por board de la última corrida terminada (o de la que va, si ya pasó por él).
  const deCorrida = new Map((ultima?.resumen.boards ?? []).map((b) => [b.board, b]));
  const terminada = corridas.find((c) => c.estado !== "en_curso");
  const ultimaTerminada = new Map((terminada?.resumen.boards ?? []).map((b) => [b.board, b]));
  const diferenciasDe = (b: BoardImportable) => estado[b.id]?.comparacion ?? (() => {
    const r = deCorrida.get(b.nombre) ?? ultimaTerminada.get(b.nombre);
    return r?.diferencias !== undefined ? { diferencias: r.diferencias, avisos: r.avisos ?? 0 } : undefined;
  })();
  const comparados = boards.filter((b) => diferenciasDe(b));
  const igual = comparados.filter((b) => diferenciasDe(b)!.diferencias === 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Monday sigue vivo mientras se modela la data en la app. La sincronización trae lo de Monday a los tableros ya importados sin
        rehacerlos: <strong>Monday manda en los datos</strong> (elementos, valores, bitácora, archivos, directorio y boards nuevos) y{" "}
        <strong>la app en el modelo</strong> (columnas, títulos, roles, tipos, fórmulas, grupos y permisos).
      </p>

      <Tarjeta
        titulo="Sincronización con Monday"
        accion={<Boton primario disabled={enCurso || !!ocupado} onClick={sincronizarAhora}>{enCurso ? "Sincronizando…" : "Sincronizar ahora"}</Boton>}
      >
        {sync.error && <ErrorBox msg={sync.error} />}
        {fallo && <Nota tono="mal">{fallo}</Nota>}
        {!ultima ? (
          <p className="text-[0.84rem] text-[var(--text-secondary)]">Todavía no ha corrido ninguna sincronización.</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-[0.84rem] text-[var(--text-secondary)]">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={ESTADO[ultima.estado].tono} small>{ESTADO[ultima.estado].texto}</Pill>
              <span>
                {enCurso ? `Empezó ${hace(ultima.inicio)}${ultima.resumen.enCurso ? ` · va en: ${ultima.resumen.enCurso}` : ""} · ${ultima.resumen.boards?.length ?? 0} de ${boards.length} boards`
                  : `Última: ${hace(ultima.fin ?? ultima.inicio)} (${ultima.origen === "manual" ? "a mano" : "programada"}, ${duracion(ultima)})`}
              </span>
            </div>
            {!enCurso && <span className="text-[0.8rem] text-[var(--text-muted)]">{textoTotales(ultima)}</span>}
            {ultima.error && <span className="text-[0.8rem] text-[#e2445c]">{ultima.error}</span>}
            {!!ultima.resumen.copia?.errores.length && <span className="text-[0.8rem] text-[#e2445c]">Copia de Monday: {ultima.resumen.copia.errores.join(" | ")}</span>}
          </div>
        )}
        <p className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
          Corre sola cada hora en esta PC (Programador de tareas de Windows, <code>npm run tableros:sincronizar</code>), solo con la PC encendida.
        </p>
        {corridas.length > 1 && (
          <div className="mt-2">
            <button type="button" className="text-[0.78rem] text-[var(--accent)] hover:underline" onClick={() => setVerHistorial((v) => !v)}>
              {verHistorial ? "Ocultar corridas anteriores" : `Ver corridas anteriores (${corridas.length - 1})`}
            </button>
            {verHistorial && (
              <div className="table-wrap mt-2">
                <table className="pmo">
                  <thead><tr><th>Inicio</th><th>Origen</th><th>Duración</th><th>Estado</th><th>Resultado</th></tr></thead>
                  <tbody>
                    {corridas.slice(1).map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontSize: ".78rem", whiteSpace: "nowrap" }}>{new Date(c.inicio).toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td style={{ fontSize: ".78rem" }}>{c.origen === "manual" ? "A mano" : "Programada"}</td>
                        <td style={{ fontSize: ".78rem" }}>{duracion(c)}</td>
                        <td><Pill tone={ESTADO[c.estado].tono} small>{ESTADO[c.estado].texto}</Pill></td>
                        <td style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>{c.error ?? textoTotales(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard value={boards.length} label="Boards en Monday" />
        <StatCard value={importados.length} label="En la app" />
        <StatCard value={comparados.length ? `${igual.length}/${comparados.length}` : "—"} label="Miden igual que Monday" color={comparados.length && igual.length === comparados.length ? "var(--ok)" : undefined} />
        <StatCard value={boards.reduce((n, b) => n + (diferenciasDe(b)?.avisos ?? 0), 0)} label="Personas fuera del directorio" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton disabled={!!ocupado || enCurso || importados.length === boards.length} onClick={() => enLote("importar", boards.filter((b) => !b.tableroId), async (b) => { const id = await importar(b); if (id) await comparar(b, id); })}>
          {ocupado === "importar" ? "Importando…" : `Importar lo que falta (${boards.length - importados.length})`}
        </Boton>
        <Boton disabled={!!ocupado || enCurso || !importados.length} onClick={() => enLote("comparar", importados, (b) => comparar(b, b.tableroId!))}>
          {ocupado === "comparar" ? "Comparando…" : "Comparar todo con Monday"}
        </Boton>
      </div>

      <div className="table-wrap">
        <table className="pmo">
          <thead><tr><th>Board de Monday</th><th>Tipo</th><th>Última sincronización</th><th>Comparación</th><th /></tr></thead>
          <tbody>
            {boards.map((b) => {
              const e = estado[b.id] ?? {};
              const c = diferenciasDe(b);
              const r = deCorrida.get(b.nombre) ?? ultimaTerminada.get(b.nombre);
              return (
                <tr key={b.id}>
                  <td className="pm-name">{b.nombre}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>{TIPO[b.tipo]}</td>
                  <td style={{ fontSize: ".78rem" }}>
                    {e.trabajando ? <span className="text-[var(--accent)]">{e.trabajando}</span>
                      : e.error ? <span className="text-[#e2445c]" title={e.error}>✕ {e.error.slice(0, 60)}</span>
                        : !b.tableroId ? <Pill tone="neutral" small>Sin importar</Pill>
                          : r ? <span className={r.error ? "text-[#e2445c]" : "text-[var(--text-secondary)]"} title={r.error ?? undefined}>{r.error ? `✕ ${r.error.slice(0, 80)}` : textoBoard(r)}</span>
                            : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td>
                    {!c ? <span className="text-[var(--text-muted)]">—</span>
                      : c.diferencias === 0 ? <Pill tone="ok" small>✓ Mide igual</Pill> : <Pill tone="bad" small>{c.diferencias} diferencias</Pill>}
                    {c && c.avisos > 0 && <span className="ml-1.5 text-[0.72rem] text-[var(--text-muted)]">{c.avisos} aviso{c.avisos === 1 ? "" : "s"}</span>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {b.tableroId && <><Boton disabled={!!ocupado || !!e.trabajando} onClick={() => setViendo(b.tableroId)}>Ver comparación</Boton>{" "}</>}
                    <Boton disabled={!!ocupado || !!e.trabajando || enCurso} primario={!b.tableroId} title={b.tableroId ? "Borra el tablero y lo crea otra vez desde Monday" : undefined} onClick={async () => {
                      if (b.tableroId && !confirm(`¿Rehacer «${b.nombre}» desde cero?\n\nSe borra el tablero y se crea otra vez con lo que hay hoy en Monday: se PIERDE todo lo que modelaste en la app (columnas propias, títulos, roles, fórmulas…), además de su bitácora y archivos (vuelven con la siguiente sincronización).\n\nPara traer lo nuevo de Monday no hace falta: usa «Sincronizar ahora».`)) return;
                      const id = await importar(b);
                      if (id) { await comparar(b, id); await recargar(); }
                    }}>
                      {b.tableroId ? "Rehacer desde cero" : "Importar"}
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
