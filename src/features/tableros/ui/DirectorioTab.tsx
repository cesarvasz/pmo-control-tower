"use client";

// Pestaña Directorio: las personas que se pueden poner en una columna Persona. Hoy se importan
// del Directorio RH de Monday; cada una se liga a su usuario de la app por correo (eso es lo que
// hace funcionar "solo lo mío").

import { useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { EmptyRow, ErrorBox, Loader, Pill, StatCard } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import type { PersonaConUsuario, ResultadoImportacion } from "../datos/personas";
import { Boton, enviar, estiloControl, Nota, useCarga } from "./comun";

interface Respuesta {
  personas: PersonaConUsuario[];
  usuarios: { id: string; email: string; nombre: string }[];
}

const URL_API = "/api/tableros/personas";

export default function DirectorioTab() {
  const { me } = useMe();
  const puedeAdministrar = tieneAccionTableros(me?.permissions, "directorio_administrar");
  const { data, error, cargando, recargar } = useCarga<Respuesta>(URL_API);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("");
  const [soloSinUsuario, setSoloSinUsuario] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const personas = useMemo(() => data?.personas ?? [], [data]);
  const grupos = useMemo(() => [...new Set(personas.map((p) => p.grupo ?? "Sin grupo"))].sort((a, b) => a.localeCompare(b, "es")), [personas]);
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return personas.filter((p) =>
      (!grupo || (p.grupo ?? "Sin grupo") === grupo) &&
      (!soloSinUsuario || !p.appUserId) &&
      (!q || p.nombre.toLowerCase().includes(q) || (p.email ?? "").includes(q) || (p.rol ?? "").toLowerCase().includes(q)));
  }, [personas, busca, grupo, soloSinUsuario]);

  const ligadas = personas.filter((p) => p.appUserId).length;
  const usuariosSinPersona = (data?.usuarios ?? []).filter((u) => !personas.some((p) => p.appUserId === u.id));

  async function importar() {
    setImportando(true); setFallo(null); setResultado(null);
    try {
      setResultado(await enviar<ResultadoImportacion>(URL_API, "POST", { refrescar: true }));
      await recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setImportando(false);
    }
  }

  async function ligar(personaId: string, appUserId: string | null) {
    setFallo(null);
    try {
      await enviar(URL_API, "PATCH", { personaId, appUserId });
      await recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    }
  }

  if (cargando && !data) return <Loader />;
  if (error && !data) return <ErrorBox msg={error} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[0.82rem] text-[var(--text-muted)]">
          Las personas que se asignan en las columnas <strong>Persona</strong> de los tableros. Se importan del Directorio RH
          de Monday y se ligan a su usuario de la app por correo; así cada quien puede ver «solo lo mío».
        </p>
        {puedeAdministrar && (
          <Boton primario onClick={importar} disabled={importando}>
            {importando ? "Importando…" : personas.length ? "↻ Volver a importar del Directorio RH" : "Importar del Directorio RH"}
          </Boton>
        )}
      </div>

      {resultado && (
        <Nota tono="ok">
          Leídas {resultado.leidas} · nuevas {resultado.nuevas} · actualizadas {resultado.actualizadas} · desactivadas {resultado.desactivadas} ·
          ligadas a usuario {resultado.ligadas}.
          {resultado.aviso && <> <br />{resultado.aviso}</>}
        </Nota>
      )}
      {fallo && <Nota tono="mal">{fallo}</Nota>}

      {personas.length === 0 ? (
        <EmptyRow msg="Todavía no hay personas. Importa el Directorio RH para empezar." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard value={personas.length} label="Personas" />
            <StatCard value={personas.filter((p) => p.activo).length} label="Activas" />
            <StatCard value={ligadas} label="Ligadas a un usuario" color="var(--ok)" />
            <StatCard
              value={usuariosSinPersona.length} label="Usuarios sin persona"
              color={usuariosSinPersona.length ? "var(--warn)" : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search" placeholder="Buscar nombre, correo o rol…" value={busca} onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar persona" {...estiloControl} className={`${estiloControl.className} w-64 py-1.5`}
            />
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo" {...estiloControl}>
              <option value="">Todos los grupos</option>
              {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
              <input type="checkbox" checked={soloSinUsuario} onChange={(e) => setSoloSinUsuario(e.target.checked)} />
              Solo sin usuario
            </label>
            <span className="text-[0.78rem] text-[var(--text-muted)]">{visibles.length} de {personas.length}</span>
          </div>

          {visibles.length === 0 ? <EmptyRow /> : (
            <div className="table-wrap">
              <table className="pmo">
                <thead>
                  <tr><th>Nombre</th><th>Grupo</th><th>Rol</th><th>TLD</th><th>Hrs/mes</th><th>Correo</th><th>Usuario de la app</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.id} style={p.activo ? undefined : { opacity: 0.6 }}>
                      <td className="pm-name">{p.nombre}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.grupo ?? "—"}</td>
                      <td>{p.rol ?? "—"}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.tld ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{p.hrsMes ?? "—"}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>{p.email ?? "—"}</td>
                      <td>
                        {puedeAdministrar ? (
                          <select
                            value={p.appUserId ?? ""} onChange={(e) => ligar(p.id, e.target.value || null)}
                            aria-label={`Usuario de ${p.nombre}`} {...estiloControl}
                            className={`${estiloControl.className} max-w-[220px]`}
                          >
                            <option value="">— Sin usuario —</option>
                            {(data?.usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>)}
                          </select>
                        ) : (p.usuarioEmail ?? "—")}
                      </td>
                      <td>{p.activo ? <Pill tone="ok" small>Activa</Pill> : <Pill tone="neutral" small>Inactiva</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {usuariosSinPersona.length > 0 && (
            <Nota>
              Usuarios de la app que no están en el directorio (no podrán usar «solo lo mío» hasta ligarlos):{" "}
              {usuariosSinPersona.map((u) => u.nombre).join(", ")}.
            </Nota>
          )}
        </>
      )}
    </div>
  );
}
