"use client";

// Pestaña Permisos: qué rol ve y edita qué categoría de tableros (capa 2), con columnas editables
// y "solo lo mío" (capa 3). Abajo, un simulador que corre el MISMO motor que usará el servidor.

import { useMemo, useState, type ReactNode } from "react";
import { useMe } from "@/context/PermissionsContext";
import { EmptyRow, ErrorBox, Loader, Pill } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import { CATEGORIAS_TABLERO, categoriaTablero } from "../dominio/categorias";
import { ROLES_COLUMNA, rolColumna } from "../dominio/roles";
import {
  evaluar, NIVEL_DESCRIPCION, NIVEL_ETIQUETA, NIVELES, type Nivel, type Operacion, type ReglaPermiso,
} from "../dominio/permisos";
import { Boton, enviar, estiloControl, Nota, Tarjeta, useCarga } from "./comun";

interface Respuesta { reglas: ReglaPermiso[]; roles: { id: string; name: string }[] }
const URL_API = "/api/tableros/permisos";

const OPERACIONES: { clave: Operacion; etiqueta: string }[] = [
  { clave: "ver", etiqueta: "Ver un elemento" },
  { clave: "editar_valor", etiqueta: "Editar una celda" },
  { clave: "editar_estructura", etiqueta: "Editar columnas o grupos" },
  { clave: "administrar", etiqueta: "Archivar / guardar como plantilla" },
];

const VACIA = { rolId: "", categoria: CATEGORIAS_TABLERO[0].clave, nivel: "ver" as Nivel, columnasEditables: [] as string[], soloLoMio: false };

export default function PermisosTab() {
  const { me } = useMe();
  const puedeAdministrar = tieneAccionTableros(me?.permissions, "permisos_tableros_administrar");
  const { data, error, cargando, recargar } = useCarga<Respuesta>(URL_API);
  const [form, setForm] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const roles = useMemo(() => data?.roles ?? [], [data]);
  const nombreRol = useMemo(() => {
    const m = new Map(roles.map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? id;
  }, [roles]);
  const reglas = useMemo(
    () => [...(data?.reglas ?? [])].sort((a, b) => nombreRol(a.rolId).localeCompare(nombreRol(b.rolId), "es") || (a.categoria ?? "").localeCompare(b.categoria ?? "")),
    [data, nombreRol],
  );

  async function guardar() {
    if (!form.rolId) { setFallo("Elige un rol."); return; }
    setGuardando(true); setFallo(null);
    try {
      await enviar(URL_API, "PUT", {
        ...form, tableroId: null,
        columnasEditables: form.nivel === "editar_valores" ? form.columnasEditables : [],
      });
      setForm({ ...VACIA, rolId: form.rolId });
      await recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    setFallo(null);
    try { await enviar(`${URL_API}?id=${id}`, "DELETE"); await recargar(); } catch (e) { setFallo(e instanceof Error ? e.message : "Error"); }
  }

  function editar(r: ReglaPermiso) {
    setForm({ rolId: r.rolId, categoria: r.categoria ?? VACIA.categoria, nivel: r.nivel, columnasEditables: r.columnasEditables, soloLoMio: r.soloLoMio });
  }

  if (cargando && !data) return <Loader />;
  if (error && !data) return <ErrorBox msg={error} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Cada regla le da a un <strong>rol</strong> un nivel de acceso sobre una <strong>categoría</strong> de tableros. Si un rol no
        tiene regla, no ve esos tableros. Cuando existan tableros, también se podrán dar reglas para uno solo (ganan sobre la de su
        categoría). El Admin siempre puede todo.
      </p>
      {fallo && <Nota tono="mal">{fallo}</Nota>}

      {puedeAdministrar && (
        <Tarjeta titulo="Agregar o cambiar una regla">
          <div className="flex flex-wrap items-end gap-3">
            <Campo etiqueta="Rol">
              <select value={form.rolId} onChange={(e) => setForm({ ...form, rolId: e.target.value })} {...estiloControl}>
                <option value="">— Elige —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Categoría">
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} {...estiloControl}>
                {CATEGORIAS_TABLERO.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Nivel">
              <select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value as Nivel })} {...estiloControl} title={NIVEL_DESCRIPCION[form.nivel]}>
                {NIVELES.map((n) => <option key={n} value={n}>{NIVEL_ETIQUETA[n]}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-1.5 pb-1 text-[0.8rem] text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.soloLoMio} onChange={(e) => setForm({ ...form, soloLoMio: e.target.checked })} />
              Solo lo mío
            </label>
            <Boton primario onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar regla"}</Boton>
          </div>
          <p className="mt-2 text-[0.75rem] text-[var(--text-muted)]">{NIVEL_DESCRIPCION[form.nivel]}</p>
          {form.nivel === "editar_valores" && (
            <div className="mt-3">
              <div className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Columnas que puede editar (ninguna marcada = todas)
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ROLES_COLUMNA.map((r) => (
                  <label key={r.clave} className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
                    <input
                      type="checkbox" checked={form.columnasEditables.includes(r.clave)}
                      onChange={(e) => setForm({
                        ...form,
                        columnasEditables: e.target.checked ? [...form.columnasEditables, r.clave] : form.columnasEditables.filter((x) => x !== r.clave),
                      })}
                    />
                    {r.etiqueta}
                  </label>
                ))}
              </div>
            </div>
          )}
        </Tarjeta>
      )}

      {reglas.length === 0 ? <EmptyRow msg="Todavía no hay reglas: solo el Admin ve los tableros." /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead><tr><th>Rol</th><th>Aplica a</th><th>Nivel</th><th>Columnas editables</th><th>Solo lo mío</th>{puedeAdministrar && <th />}</tr></thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id}>
                  <td className="pm-name">{nombreRol(r.rolId)}</td>
                  <td>{r.categoria ? `Categoría: ${categoriaTablero(r.categoria)?.etiqueta ?? r.categoria}` : `Tablero ${r.tableroId}`}</td>
                  <td><Pill tone={r.nivel === "ninguno" ? "bad" : r.nivel === "ver" ? "neutral" : "info"} small>{NIVEL_ETIQUETA[r.nivel]}</Pill></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>
                    {r.nivel !== "editar_valores" ? "—" : r.columnasEditables.length ? r.columnasEditables.map((c) => rolColumna(c)?.etiqueta ?? c).join(", ") : "Todas"}
                  </td>
                  <td>{r.soloLoMio ? "Sí" : "No"}</td>
                  {puedeAdministrar && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Boton onClick={() => editar(r)}>Editar</Boton>{" "}
                      <Boton onClick={() => r.id && borrar(r.id)}>Quitar</Boton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Simulador reglas={reglas} roles={roles} />
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{etiqueta}</span>
      {children}
    </label>
  );
}

/** Prueba el motor de permisos con las reglas guardadas, sin necesidad de tableros reales. */
function Simulador({ reglas, roles }: { reglas: ReglaPermiso[]; roles: { id: string; name: string }[] }) {
  const [rolId, setRolId] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS_TABLERO[0].clave);
  const [op, setOp] = useState<Operacion>("editar_valor");
  const [columna, setColumna] = useState(ROLES_COLUMNA[0].clave);
  const [esResponsable, setEsResponsable] = useState(true);
  const [ligado, setLigado] = useState(true);

  const persona = "00000000-0000-4000-8000-000000000001";
  const res = rolId
    ? evaluar(
      { rolId, esAdmin: false, personaId: ligado ? persona : null },
      op,
      { id: "simulado", categoria },
      reglas,
      { columna: { id: "columna-simulada", rol: columna }, elemento: { responsables: esResponsable ? [persona] : [] } },
    )
    : null;

  return (
    <Tarjeta titulo="Simulador: ¿puede o no puede?">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Rol">
          <select value={rolId} onChange={(e) => setRolId(e.target.value)} {...estiloControl}>
            <option value="">— Elige —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tablero de la categoría">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} {...estiloControl}>
            {CATEGORIAS_TABLERO.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Quiere">
          <select value={op} onChange={(e) => setOp(e.target.value as Operacion)} {...estiloControl}>
            {OPERACIONES.map((o) => <option key={o.clave} value={o.clave}>{o.etiqueta}</option>)}
          </select>
        </Campo>
        {op === "editar_valor" && (
          <Campo etiqueta="Columna con rol">
            <select value={columna} onChange={(e) => setColumna(e.target.value)} {...estiloControl}>
              {ROLES_COLUMNA.map((r) => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}
            </select>
          </Campo>
        )}
        <label className="flex items-center gap-1.5 pb-1 text-[0.8rem] text-[var(--text-secondary)]">
          <input type="checkbox" checked={esResponsable} onChange={(e) => setEsResponsable(e.target.checked)} /> Es responsable del elemento
        </label>
        <label className="flex items-center gap-1.5 pb-1 text-[0.8rem] text-[var(--text-secondary)]">
          <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} /> Su usuario está en el directorio
        </label>
      </div>
      {res && (
        <div className="mt-3 flex items-center gap-2.5">
          {res.permitido ? <Pill tone="ok">✓ Puede</Pill> : <Pill tone="bad">✕ No puede</Pill>}
          <span className="text-[0.82rem] text-[var(--text-secondary)]">{res.motivo}</span>
        </div>
      )}
    </Tarjeta>
  );
}
