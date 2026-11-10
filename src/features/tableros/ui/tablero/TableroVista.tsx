"use client";

// Vista Tabla de un tablero: grupos con sus elementos y subelementos, columnas editables y celdas
// que se editan en su lugar. Todo cambio pasa por POST /api/tableros/tableros/[id] (operaciones).
// Qué se puede tocar lo decide el MISMO motor de permisos que usa el servidor.

import { Fragment, useMemo, useState } from "react";
import { ErrorBox, Loader } from "@/components/ui";
import { CATEGORIAS_TABLERO, categoriaTablero, rolesFaltantes, textoRolRequerido } from "../../dominio/categorias";
import { rolColumna } from "../../dominio/roles";
import { tipoColumna } from "../../dominio/tipos-columna";
import { puede, reglaQueAplica, type ReglaPermiso, type UsuarioTableros } from "../../dominio/permisos";
import { columnasDe, FASES_VALOR, type Columna, type Elemento, type Grupo, type Nivel, type TableroCompleto } from "../../dominio/tablero";
import { Boton, enviar, estiloControl, Nota, useCarga } from "../comun";
import { Celda, type EntornoCelda, type PersonaCorta } from "../celdas";
import type { ArchivoCelda } from "../celdas/comun";
import { calcularTablero, valorDeCelda, type PersonaCalc, type TableroLigado } from "../../dominio/calculos";
import { esCalculado } from "../../dominio/tipos-columna";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import ColumnaEditor, { type CambiosColumna } from "../columnas/ColumnaEditor";
import ElementoPanel from "./ElementoPanel";
import CompararModal from "./CompararModal";
import GuardarPlantillaModal from "./GuardarPlantillaModal";
import { botonMini, NuevoElemento, TextoEditable } from "./piezas";
import { useMe } from "@/context/PermissionsContext";
import { tieneAccionTableros } from "../../dominio/acciones";

interface Datos extends TableroCompleto {
  personas: (PersonaCorta & PersonaCalc)[];
  acceso: { usuario: UsuarioTableros; reglas: ReglaPermiso[] };
  ligados: Record<string, TableroLigado>;
  archivos: ArchivoCelda[];
  /** elementoId → cuántas actualizaciones tiene en la bitácora */
  comentarios: Record<string, number>;
}

const tdCelda = { padding: 0, borderLeft: "1px solid var(--border-subtle)" } as const;
const NOMBRE = { id: "nombre", rol: "nombre" };

export default function TableroVista({ id, onVolver }: { id: string; onVolver(): void }) {
  const url = `/api/tableros/tableros/${id}`;
  const { data, error, recargar, setData } = useCarga<Datos>(url);
  const [fallo, setFallo] = useState<string | null>(null);
  const [editorCol, setEditorCol] = useState<{ columna: Columna | null; nivel: Nivel } | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<"comparar" | "plantilla" | null>(null);
  const { me } = useMe();

  const alternar = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  /** Ejecuta una operación y recarga el tablero. Lanza si falla (para los formularios). */
  async function op(datos: Record<string, unknown>): Promise<unknown> {
    setFallo(null);
    try {
      const r = await enviar(url, "POST", datos);
      await recargar();
      return r;
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
      await recargar();
      throw e;
    }
  }
  const hacer = (datos: Record<string, unknown>) => { op(datos).catch(() => {}); };

  /** Cambio de celda: se ve al instante y se guarda en segundo plano. */
  function cambiarValor(e: Elemento, c: Columna, valor: unknown) {
    setFallo(null);
    setData((d) => d && {
      ...d,
      elementos: d.elementos.map((x) => {
        if (x.id !== e.id) return x;
        const valores = { ...x.valores };
        if (valor === null) delete valores[c.id]; else valores[c.id] = valor;
        return { ...x, valores };
      }),
    });
    enviar(url, "POST", { op: "valor.cambiar", elementoId: e.id, columnaId: c.id, valor })
      .catch((err) => { setFallo(err instanceof Error ? err.message : "Error"); void recargar(); });
  }

  // Fórmulas, espejos y archivos: se calculan aquí con el mismo código que usan las métricas.
  const calc = useMemo(() => (data ? calcularTablero(data, {
    personas: new Map(data.personas.map((p) => [p.id, p])), ligados: data.ligados, archivos: data.archivos,
  }) : null), [data]);
  const tablerosLista = useCarga<{ tableros: { id: string; nombre: string }[] }>(editorCol ? "/api/tableros/tableros" : "").data?.tableros ?? [];
  const [traidos, setTraidos] = useState<string | null>(null);

  const subsPorPadre = useMemo(() => {
    const m = new Map<string, Elemento[]>();
    for (const e of data?.elementos ?? []) if (e.parentId) m.set(e.parentId, [...(m.get(e.parentId) ?? []), e]);
    return m;
  }, [data]);

  if (!data || !calc) return error ? <ErrorBox msg={error} /> : <Loader />;

  const entorno: EntornoCelda = {
    ligados: data.ligados,
    archivos: data.archivos,
    errores: calc.errores,
    async subir(elementoId, columnaId, archivo) {
      const p = await enviar<{ archivoId: string; ruta: string; token: string }>(url, "POST", {
        op: "archivo.preparar", elementoId, columnaId, nombre: archivo.name, tamano: archivo.size, tipoMime: archivo.type,
      });
      const r = await getSupabaseBrowser().storage.from("tableros").uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type || undefined });
      if (r.error) throw new Error(r.error.message);
      await enviar(url, "POST", { op: "archivo.confirmar", archivoId: p.archivoId });
      await recargar();
    },
    async descargar(archivoId) {
      try {
        const { url: firmada } = await enviar<{ url: string }>(url, "POST", { op: "archivo.descargar", archivoId });
        window.open(firmada, "_blank", "noopener");
      } catch (e) { setFallo(e instanceof Error ? e.message : "Error"); }
    },
    async borrarArchivo(archivoId) { await op({ op: "archivo.borrar", archivoId }).catch(() => {}); },
  };

  async function traerDeMonday() {
    setFallo(null); setTraidos("Trayendo de Monday…");
    try {
      const r = await enviar<{ comentarios: number; comentariosNuevos: number; archivos: number; archivosNuevos: number; errores: string[] }>(`${url}/traer-de-monday`, "POST");
      setTraidos(`Bitácora: ${r.comentariosNuevos} nuevas de ${r.comentarios} · Archivos: ${r.archivosNuevos} nuevos de ${r.archivos}${r.errores.length ? ` · No se pudieron traer: ${r.errores.join("; ")}` : ""}`);
      await recargar();
    } catch (e) {
      setTraidos(null); setFallo(e instanceof Error ? e.message : "Error");
    }
  }

  const { tablero, grupos, columnas, elementos, personas, acceso } = data;
  const u = acceso.usuario;
  const R = acceso.reglas;
  const puedeEstructura = puede(u, "editar_estructura", tablero, R);
  const puedeAdmin = puede(u, "administrar", tablero, R);
  const puedeCrear = puede(u, "editar_valor", tablero, R);
  const soloLoMio = !u.esAdmin && !!reglaQueAplica(u, tablero, R)?.soloLoMio;
  const colsItem = columnasDe(columnas, "item");
  const colsSub = columnasDe(columnas, "sub");
  const faltan = rolesFaltantes(tablero.categoria, columnas);
  const elementoPanel = panel ? elementos.find((e) => e.id === panel) : undefined;

  const q = busca.trim().toLowerCase();
  const coincide = (e: Elemento) => !q || e.nombre.toLowerCase().includes(q) || (subsPorPadre.get(e.id) ?? []).some((s) => s.nombre.toLowerCase().includes(q));
  const itemsDe = (g: Grupo) => elementos.filter((e) => !e.parentId && e.grupoId === g.id && coincide(e));

  const guardarColumna = async (c: CambiosColumna) => {
    if (editorCol?.columna) {
      const antes = editorCol.columna;
      await op({
        op: "columna.editar", columnaId: antes.id, titulo: c.titulo, rol: c.rol, config: c.config, oculta: c.oculta,
      });
    } else {
      await op({ op: "columna.crear", nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: c.rol, config: c.config });
    }
  };

  function encabezado(c: Columna, lista: Columna[]) {
    const i = lista.findIndex((x) => x.id === c.id);
    const rol = c.rol ? rolColumna(c.rol) : undefined;
    return (
      <div className="group flex items-center gap-1">
        {puedeEstructura ? (
          <button type="button" className="truncate text-left hover:underline" onClick={() => setEditorCol({ columna: c, nivel: c.nivel })} title="Editar columna">
            {c.titulo}
          </button>
        ) : <span className="truncate">{c.titulo}</span>}
        {rol && <span className="rounded-full px-1.5 text-[0.62rem] font-semibold" style={{ background: "var(--bg-accent-soft)", color: "var(--accent)" }} title={`Rol: ${rol.etiqueta}`}>{rol.etiqueta}</span>}
        {puedeEstructura && (
          <span className="ml-auto hidden gap-0.5 group-hover:flex">
            <button type="button" className={botonMini} disabled={i === 0} onClick={() => hacer({ op: "columna.mover", columnaId: c.id, direccion: -1 })} aria-label="Mover a la izquierda">◂</button>
            <button type="button" className={botonMini} disabled={i === lista.length - 1} onClick={() => hacer({ op: "columna.mover", columnaId: c.id, direccion: 1 })} aria-label="Mover a la derecha">▸</button>
          </span>
        )}
      </div>
    );
  }

  function nombreElemento(e: Elemento) {
    const editable = puede(u, "editar_valor", tablero, R, { elemento: e, columna: NOMBRE });
    return (
      <div className="flex items-center gap-1">
        <TextoEditable valor={e.nombre} editable={editable} className="flex-1 truncate text-[0.84rem]" onGuardar={(n) => hacer({ op: "elemento.renombrar", elementoId: e.id, nombre: n })} />
        <button type="button" className={botonMini} onClick={() => setPanel(e.id)} title="Bitácora e historial" aria-label="Bitácora e historial">
          {data!.comentarios[e.id] ? <span className="text-[0.72rem]">💬 {data!.comentarios[e.id]}</span> : "↗"}
        </button>
      </div>
    );
  }

  function celdas(e: Elemento, cols: Columna[]) {
    return (
      <>
        {cols.map((c) => (
          <td key={c.id} style={tdCelda}>
            <Celda
              columna={c} valor={valorDeCelda(calc!, e, c)} personas={personas} elementoId={e.id} entorno={entorno}
              // Fórmula y espejo se calculan solos; los archivos sí se suben (si puede editar).
              editable={(c.tipo === "archivo" || !esCalculado(c.tipo)) && puede(u, "editar_valor", tablero, R, { columna: c, elemento: e })}
              onCambiar={(v) => cambiarValor(e, c, v)}
            />
          </td>
        ))}
      </>
    );
  }

  function subelementos(padre: Elemento) {
    const subs = subsPorPadre.get(padre.id) ?? [];
    return (
      <div className="my-1 ml-2 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="pmo">
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Subelemento</th>
              {colsSub.map((c) => <th key={c.id} style={{ minWidth: c.ancho ?? 140 }}>{encabezado(c, colsSub)}</th>)}
              {puedeEstructura && (
                <th style={{ width: 40 }}>
                  <button type="button" className={botonMini} onClick={() => setEditorCol({ columna: null, nivel: "sub" })} title="Agregar columna de subelementos">＋</button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td style={{ padding: "2px 6px" }}>{nombreElemento(s)}</td>
                {celdas(s, colsSub)}
                {puedeEstructura && <td />}
              </tr>
            ))}
            {puedeCrear && puede(u, "editar_valor", tablero, R, { elemento: padre }) && (
              <tr>
                <td colSpan={colsSub.length + 1 + (puedeEstructura ? 1 : 0)} style={{ padding: "2px 6px" }}>
                  <NuevoElemento etiqueta="Agregar subelemento" onCrear={(nombre) => { hacer({ op: "elemento.crear", parentId: padre.id, nombre }); }} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3">
        <Boton onClick={onVolver}>← Tableros</Boton>
        <TextoEditable
          valor={tablero.nombre} editable={puedeEstructura} className="text-lg font-bold text-[var(--text-primary)]"
          onGuardar={(nombre) => { if (nombre) hacer({ op: "tablero.editar", nombre }); }}
        />
        <TextoEditable
          valor={tablero.codigo ?? ""} editable={puedeEstructura} placeholder="(sin código)" max={30}
          className="text-[0.8rem] text-[var(--text-muted)]" onGuardar={(codigo) => hacer({ op: "tablero.editar", codigo })}
        />
        {puedeAdmin ? (
          <select value={tablero.categoria} onChange={(e) => hacer({ op: "tablero.editar", categoria: e.target.value })} aria-label="Categoría" {...estiloControl}>
            {CATEGORIAS_TABLERO.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
        ) : <span className="text-[0.8rem] text-[var(--text-secondary)]">{categoriaTablero(tablero.categoria)?.etiqueta ?? tablero.categoria}</span>}
        <span className="flex-1" />
        {puedeAdmin && tablero.mondayBoardId && <Boton onClick={() => setModal("comparar")}>Comparar con Monday</Boton>}
        {puedeAdmin && tablero.mondayBoardId && tieneAccionTableros(me?.permissions, "tableros_crear") && (
          <Boton onClick={traerDeMonday} disabled={traidos === "Trayendo de Monday…"} title="Bitácora (Updates) y archivos; solo agrega lo nuevo">
            Traer bitácora y archivos
          </Boton>
        )}
        {puedeAdmin && tieneAccionTableros(me?.permissions, "plantillas_administrar") && (
          <Boton onClick={() => setModal("plantilla")}>Guardar como plantilla</Boton>
        )}
        {puedeAdmin && (
          <Boton onClick={async () => { if (confirm(`¿Archivar el tablero «${tablero.nombre}»?`)) { await op({ op: "tablero.archivar" }).catch(() => {}); onVolver(); } }}>
            Archivar tablero
          </Boton>
        )}
      </div>

      {faltan.length > 0 && (
        <Nota>
          Para medirse como <strong>{categoriaTablero(tablero.categoria)?.etiqueta}</strong> le faltan columnas con rol:{" "}
          {faltan.map(textoRolRequerido).join(", ")}.
        </Nota>
      )}
      {soloLoMio && <Nota>Solo ves los elementos donde eres responsable (y su contexto).</Nota>}
      {fallo && <Nota tono="mal">{fallo}</Nota>}
      {traidos && <Nota tono="ok">{traidos}</Nota>}

      {/* Barra */}
      <div className="flex flex-wrap items-center gap-2">
        {puedeEstructura && <Boton onClick={() => hacer({ op: "grupo.crear" })}>+ Grupo</Boton>}
        {puedeEstructura && <Boton onClick={() => setEditorCol({ columna: null, nivel: "item" })}>+ Columna</Boton>}
        <input
          type="search" placeholder="Buscar elemento…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar elemento"
          {...estiloControl} className={`${estiloControl.className} w-56 py-1.5`}
        />
        <span className="text-[0.75rem] text-[var(--text-muted)]">
          {elementos.filter((e) => !e.parentId).length} elementos · {elementos.filter((e) => e.parentId).length} subelementos
        </span>
      </div>

      {/* Grupos */}
      {grupos.map((g, gi) => {
        const items = itemsDe(g);
        const plegado = plegados.has(g.id);
        const color = g.color ?? "var(--accent)";
        return (
          <section key={g.id}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <button type="button" className={botonMini} onClick={() => setPlegados((s) => alternar(s, g.id))} aria-label={plegado ? "Desplegar" : "Plegar"}>{plegado ? "▸" : "▾"}</button>
              {puedeEstructura ? (
                <input type="color" value={g.color ?? "#579bfc"} onChange={(e) => hacer({ op: "grupo.editar", grupoId: g.id, color: e.target.value })} aria-label="Color del grupo" className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent" />
              ) : <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />}
              <TextoEditable
                valor={g.titulo} editable={puedeEstructura} max={80} className="text-[0.95rem] font-semibold" style={{ color }}
                onGuardar={(titulo) => { if (titulo) hacer({ op: "grupo.editar", grupoId: g.id, titulo }); }}
              />
              <span className="text-[0.75rem] text-[var(--text-muted)]">{items.length}</span>
              {puedeEstructura ? (
                <select
                  value={g.fase ?? ""} onChange={(e) => hacer({ op: "grupo.editar", grupoId: g.id, fase: e.target.value || null })}
                  aria-label="Fase VALOR" title="Fase VALOR del grupo" {...estiloControl} className={`${estiloControl.className} py-0.5 text-[0.72rem]`}
                >
                  <option value="">Fase —</option>
                  {FASES_VALOR.map((f) => <option key={f} value={f}>Fase {f}</option>)}
                </select>
              ) : g.fase && <span className="text-[0.72rem] text-[var(--text-muted)]">Fase {g.fase}</span>}
              {puedeEstructura && (
                <>
                  <button type="button" className={botonMini} disabled={gi === 0} onClick={() => hacer({ op: "grupo.mover", grupoId: g.id, direccion: -1 })} aria-label="Subir grupo">↑</button>
                  <button type="button" className={botonMini} disabled={gi === grupos.length - 1} onClick={() => hacer({ op: "grupo.mover", grupoId: g.id, direccion: 1 })} aria-label="Bajar grupo">↓</button>
                  <button
                    type="button" className={botonMini} disabled={grupos.length === 1} aria-label="Archivar grupo" title="Archivar grupo"
                    onClick={() => { if (confirm(`¿Archivar el grupo «${g.titulo}» con sus ${items.length} elementos?`)) hacer({ op: "grupo.archivar", grupoId: g.id }); }}
                  >✕</button>
                </>
              )}
            </div>

            {!plegado && (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)", borderLeft: `4px solid ${color}` }}>
                <table className="pmo">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th style={{ minWidth: 260 }}>Elemento</th>
                      {colsItem.map((c) => <th key={c.id} style={{ minWidth: c.ancho ?? (tipoColumna(c.tipo)?.clave === "timeline" ? 190 : 140) }}>{encabezado(c, colsItem)}</th>)}
                      {puedeEstructura && (
                        <th style={{ width: 40 }}>
                          <button type="button" className={botonMini} onClick={() => setEditorCol({ columna: null, nivel: "item" })} title="Agregar columna">＋</button>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const subs = subsPorPadre.get(e.id) ?? [];
                      const abierto = abiertos.has(e.id);
                      return (
                        <Fragment key={e.id}>
                          <tr>
                            <td style={{ padding: "2px 4px", textAlign: "center" }}>
                              <button type="button" className={botonMini} onClick={() => setAbiertos((s) => alternar(s, e.id))} aria-label={abierto ? "Ocultar subelementos" : "Ver subelementos"} title="Subelementos">
                                {abierto ? "▾" : "▸"}{subs.length > 0 && <span className="ml-0.5 text-[0.7rem]">{subs.length}</span>}
                              </button>
                            </td>
                            <td style={{ padding: "2px 6px" }}>{nombreElemento(e)}</td>
                            {celdas(e, colsItem)}
                            {puedeEstructura && <td />}
                          </tr>
                          {abierto && (
                            <tr>
                              <td />
                              <td colSpan={colsItem.length + 1 + (puedeEstructura ? 1 : 0)} style={{ padding: "2px 6px 8px" }}>
                                {subelementos(e)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {puedeCrear && (
                      <tr>
                        <td />
                        <td colSpan={colsItem.length + 1 + (puedeEstructura ? 1 : 0)} style={{ padding: "2px 6px" }}>
                          <NuevoElemento etiqueta="Agregar elemento" onCrear={(nombre) => hacer({ op: "elemento.crear", grupoId: g.id, nombre })} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {editorCol && (
        <ColumnaEditor
          columna={editorCol.columna} nivel={editorCol.nivel} columnas={columnas}
          tableros={tablerosLista} ligados={data.ligados}
          onGuardar={guardarColumna}
          onArchivar={editorCol.columna ? async () => { await op({ op: "columna.archivar", columnaId: editorCol.columna!.id }); } : undefined}
          onCerrar={() => setEditorCol(null)}
        />
      )}

      {modal === "comparar" && <CompararModal tableroId={tablero.id} onCerrar={() => setModal(null)} />}
      {modal === "plantilla" && (
        <GuardarPlantillaModal
          nombreInicial={tablero.nombre}
          onGuardar={async (d) => { await enviar(url, "POST", { op: "tablero.guardar_plantilla", ...d }); }}
          onCerrar={() => setModal(null)}
        />
      )}

      {elementoPanel && (
        <ElementoPanel
          tableroId={tablero.id} elemento={elementoPanel} grupos={grupos} columnas={columnas} personas={personas}
          puedeEditar={puede(u, "editar_valor", tablero, R, { elemento: elementoPanel })} esAdmin={u.esAdmin}
          onCambio={() => { void recargar(); }}
          onMover={async (grupoId) => { await op({ op: "elemento.mover", elementoId: elementoPanel.id, grupoId }).catch(() => {}); }}
          onArchivar={async () => { await op({ op: "elemento.archivar", elementoId: elementoPanel.id }).catch(() => {}); }}
          onCerrar={() => setPanel(null)}
        />
      )}
    </div>
  );
}
