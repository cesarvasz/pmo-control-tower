"use client";

// Pestaña Tableros: la lista de tableros que el usuario puede ver, crear uno nuevo y abrirlo.

import { useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { EmptyRow, ErrorBox, Loader } from "@/components/ui";
import { tieneAccionTableros } from "../../dominio/acciones";
import { CATEGORIAS_TABLERO, categoriaTablero, CATEGORIA_DEFECTO } from "../../dominio/categorias";
import { rolColumna } from "../../dominio/roles";
import type { TableroResumen } from "../../datos/tableros";
import { Boton, enviar, estiloControl, Nota, Tarjeta, useCarga } from "../comun";
import TableroVista from "./TableroVista";
import ImportarMonday from "./ImportarMonday";
import type { PlantillaResumen } from "../../datos/plantillas";

const URL_API = "/api/tableros/tableros";
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });

export default function TablerosTab() {
  const { me } = useMe();
  const puedeCrear = tieneAccionTableros(me?.permissions, "tableros_crear");
  const { data, error, recargar } = useCarga<{ tableros: TableroResumen[] }>(URL_API);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIA_DEFECTO);
  const [fallo, setFallo] = useState<string | null>(null);
  const [plantillaId, setPlantillaId] = useState("");
  const plantillas = useCarga<{ plantillas: PlantillaResumen[] }>(puedeCrear ? "/api/tableros/plantillas" : "").data?.plantillas ?? [];

  if (abierto) return <TableroVista id={abierto} onVolver={() => { setAbierto(null); void recargar(); }} />;
  if (!data) return error ? <ErrorBox msg={error} /> : <Loader />;

  async function crear() {
    if (!nombre.trim()) { setFallo("El tablero necesita un nombre."); return; }
    setCreando(true); setFallo(null);
    try {
      const { id } = await enviar<{ id: string }>(URL_API, "POST", { nombre, codigo, categoria, plantillaId: plantillaId || undefined });
      setNombre(""); setCodigo("");
      setAbierto(id);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setCreando(false);
    }
  }

  const pide = categoriaTablero(categoria)?.columnasIniciales ?? [];
  const plantilla = plantillas.find((p) => p.id === plantillaId);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Tableros propios de la app. Cada uno tiene grupos, elementos con subelementos y las columnas que quieras; las columnas con
        <strong> rol</strong> son las que leerán las métricas.
      </p>

      {puedeCrear && (
        <Tarjeta titulo="Nuevo tablero">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Nombre
              <input value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void crear(); }} {...estiloControl} className={`${estiloControl.className} w-72 py-1.5`} />
            </label>
            <label className="flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Código
              <input value={codigo} maxLength={30} placeholder="PM-020" onChange={(e) => setCodigo(e.target.value)} {...estiloControl} className={`${estiloControl.className} w-28 py-1.5`} />
            </label>
            <label className="flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Categoría
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} {...estiloControl} className={`${estiloControl.className} py-1.5`}>
                {CATEGORIAS_TABLERO.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </select>
            </label>
            {plantillas.length > 0 && (
              <label className="flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Desde plantilla
                <select
                  value={plantillaId} {...estiloControl} className={`${estiloControl.className} py-1.5`}
                  onChange={(e) => { setPlantillaId(e.target.value); const p = plantillas.find((x) => x.id === e.target.value); if (p) setCategoria(p.categoria); }}
                >
                  <option value="">— En blanco —</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
            )}
            <Boton primario onClick={crear} disabled={creando}>{creando ? "Creando…" : "Crear tablero"}</Boton>
          </div>
          <p className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
            {plantilla
              ? <>Nace igual que la plantilla: {plantilla.resumen.grupos} grupos, {plantilla.resumen.columnas + plantilla.resumen.columnasSub} columnas{plantilla.resumen.elementos ? `, ${plantilla.resumen.elementos} elementos y ${plantilla.resumen.subelementos} subelementos` : ""}.</>
              : <>Nace con un grupo{pide.length ? <> y las columnas {pide.map((r) => rolColumna(r)?.etiqueta ?? r).join(", ")}</> : ""}.</>}
          </p>
          {fallo && <div className="mt-2"><Nota tono="mal">{fallo}</Nota></div>}
        </Tarjeta>
      )}

      {puedeCrear && <ImportarMonday onAbrir={setAbierto} onImportado={() => { void recargar(); }} />}

      {data.tableros.length === 0 ? <EmptyRow msg="Todavía no hay tableros." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.tableros.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setAbierto(t.id)}
              className="rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline gap-2">
                {t.codigo && <span className="text-[0.75rem] font-semibold text-[var(--accent)]">{t.codigo}</span>}
                <span className="truncate text-[0.95rem] font-semibold text-[var(--text-primary)]">{t.nombre}</span>
              </div>
              <div className="mt-1.5 text-[0.75rem] text-[var(--text-muted)]">
                {categoriaTablero(t.categoria)?.etiqueta ?? t.categoria} · {t.elementos} elemento{t.elementos === 1 ? "" : "s"} · actualizado {fmtFecha(t.actualizadoAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
