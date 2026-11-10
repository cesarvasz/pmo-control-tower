"use client";

// Pestaña Plantillas: las plantillas guardadas (desde "Guardar como plantilla" en un tablero), con
// su estructura, para crear tableros iguales o archivarlas.

import { useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { EmptyRow, ErrorBox, Loader } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import { categoriaTablero } from "../dominio/categorias";
import { rolColumna } from "../dominio/roles";
import { tipoColumna } from "../dominio/tipos-columna";
import type { PlantillaResumen } from "../datos/plantillas";
import { Boton, enviar, estiloControl, Nota, Tarjeta, useCarga } from "./comun";

const URL_API = "/api/tableros/plantillas";

export default function PlantillasTab() {
  const { me } = useMe();
  const puedeCrear = tieneAccionTableros(me?.permissions, "tableros_crear");
  const puedeAdministrar = tieneAccionTableros(me?.permissions, "plantillas_administrar");
  const { data, error, recargar } = useCarga<{ plantillas: PlantillaResumen[] }>(URL_API);
  const [creandoDe, setCreandoDe] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nota, setNota] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);

  if (!data) return error ? <ErrorBox msg={error} /> : <Loader />;

  async function crear(p: PlantillaResumen) {
    if (!nombre.trim()) { setNota({ tono: "mal", texto: "El tablero necesita un nombre." }); return; }
    try {
      await enviar("/api/tableros/tableros", "POST", { nombre, codigo, plantillaId: p.id });
      setNota({ tono: "ok", texto: `Tablero «${nombre}» creado desde «${p.nombre}». Lo encuentras en la pestaña Tableros.` });
      setCreandoDe(null); setNombre(""); setCodigo("");
    } catch (e) {
      setNota({ tono: "mal", texto: e instanceof Error ? e.message : "Error" });
    }
  }

  async function archivar(p: PlantillaResumen) {
    if (!confirm(`¿Archivar la plantilla «${p.nombre}»? Los tableros creados con ella no cambian.`)) return;
    try { await enviar(`${URL_API}?id=${p.id}`, "DELETE"); await recargar(); } catch (e) { setNota({ tono: "mal", texto: e instanceof Error ? e.message : "Error" }); }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Una plantilla es la estructura de un tablero (grupos, columnas con sus roles y, si se quiere, sus elementos) para crear
        tableros iguales. Se guarda desde un tablero con <strong>Guardar como plantilla</strong>.
      </p>
      {nota && <Nota tono={nota.tono}>{nota.texto}</Nota>}
      {data.plantillas.length === 0 ? <EmptyRow msg="Todavía no hay plantillas. Abre un tablero y usa «Guardar como plantilla»." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.plantillas.map((p) => (
            <Tarjeta
              key={p.id}
              titulo={<>{p.nombre} <span className="text-[0.72rem] font-normal text-[var(--text-muted)]">v{p.version} · {categoriaTablero(p.categoria)?.etiqueta ?? p.categoria}</span></>}
              accion={
                <div className="flex gap-1.5">
                  {puedeCrear && <Boton primario onClick={() => { setCreandoDe(creandoDe === p.id ? null : p.id); setNota(null); }}>Crear tablero</Boton>}
                  {puedeAdministrar && <Boton onClick={() => archivar(p)}>Archivar</Boton>}
                </div>
              }
            >
              {p.descripcion && <p className="mb-2 text-[0.8rem] text-[var(--text-secondary)]">{p.descripcion}</p>}
              <p className="mb-2 text-[0.75rem] text-[var(--text-muted)]">
                {p.resumen.grupos} grupos · {p.resumen.columnas} columnas{p.resumen.columnasSub ? ` + ${p.resumen.columnasSub} de subelementos` : ""}
                {p.resumen.elementos ? ` · ${p.resumen.elementos} elementos y ${p.resumen.subelementos} subelementos` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.columnas.map((c, i) => (
                  <span key={i} className="rounded-full border px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}
                    title={c.rol ? `Rol: ${rolColumna(c.rol)?.etiqueta ?? c.rol}` : "Sin rol"}>
                    {tipoColumna(c.tipo)?.icono} {c.titulo}{c.rol && <span className="ml-1 text-[var(--accent)]">●</span>}
                  </span>
                ))}
              </div>
              {creandoDe === p.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                  <input autoFocus placeholder="Nombre del tablero" value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void crear(p); }} {...estiloControl} className={`${estiloControl.className} w-60 py-1.5`} />
                  <input placeholder="Código" value={codigo} maxLength={30} onChange={(e) => setCodigo(e.target.value)} {...estiloControl} className={`${estiloControl.className} w-24 py-1.5`} />
                  <Boton primario onClick={() => crear(p)}>Crear</Boton>
                </div>
              )}
            </Tarjeta>
          ))}
        </div>
      )}
      <p className="text-[0.72rem] text-[var(--text-muted)]"><span className="text-[var(--accent)]">●</span> = columna con rol para las métricas.</p>
    </div>
  );
}
