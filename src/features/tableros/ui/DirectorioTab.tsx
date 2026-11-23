"use client";

// Directorio: las personas que se pueden poner en una columna Persona. Antes del corte se importan del Directorio RH de
// Monday; después del corte (cortado) se dan de alta y se editan aquí. Cada una se liga a su usuario de la app por correo
// (eso es lo que hace funcionar "solo lo mío"). Además tiene campos PROPIOS que se agregan y llenan aquí (DirectorioCampos.tsx).
// Se ve en la página «Directorio» del menú y en la pestaña de /tableros.

import { useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { EmptyRow, ErrorBox, Loader, Pill, StatCard } from "@/components/ui";
import { tieneAccionTableros } from "../dominio/acciones";
import type { PersonaConUsuario, ResultadoImportacion } from "../datos/personas";
import { Boton, enviar, estiloControl, Nota, useCarga } from "./comun";
import type { CampoDirectorio } from "../dominio/directorio-campos";
import { CamposPanel, CeldaCampo } from "./DirectorioCampos";
import { ActivoPersona, CeldaPersona, NuevaPersona } from "./DirectorioPersona";

interface Respuesta {
  personas: PersonaConUsuario[];
  usuarios: { id: string; email: string; nombre: string }[];
  campos: CampoDirectorio[];
  /** El Directorio RH ya se cortó de Monday: las personas se editan aquí. */
  cortado: boolean;
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
  const [nueva, setNueva] = useState(false);

  const personas = useMemo(() => data?.personas ?? [], [data]);
  const campos = data?.campos ?? [];
  const grupos = useMemo(() => [...new Set(personas.map((p) => p.grupo ?? "Sin grupo"))].sort((a, b) => a.localeCompare(b, "es")), [personas]);
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return personas.filter((p) =>
      (!grupo || (p.grupo ?? "Sin grupo") === grupo) &&
      (!soloSinUsuario || !p.appUserId) &&
      (!q || p.nombre.toLowerCase().includes(q) || (p.email ?? "").includes(q) || (p.rol ?? "").toLowerCase().includes(q)));
  }, [personas, busca, grupo, soloSinUsuario]);

  const cortado = !!data?.cortado;
  /** Después del corte, el Admin edita aquí los campos fijos. */
  const editaFijos = cortado && puedeAdministrar;
  const roles = useMemo(() => [...new Set(personas.map((p) => p.rol).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "es")), [personas]);
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
          Las personas que se asignan en las columnas <strong>Persona</strong> de los tableros y que usan las métricas (rol, grupo, horas).{" "}
          {cortado
            ? <>Ya no dependen de Monday: se dan de alta y se editan aquí.</>
            : <>Se importan del Directorio RH de Monday.</>}{" "}
          Se ligan a su usuario de la app por correo; así cada quien puede ver «solo lo mío».
        </p>
        {editaFijos && !nueva && <Boton primario onClick={() => setNueva(true)}>+ Nueva persona</Boton>}
        {puedeAdministrar && !cortado && (
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
      {nueva && (
        <NuevaPersona listaGrupos="dir-grupos" listaRoles="dir-roles" onCancelar={() => setNueva(false)} onCreada={() => { setNueva(false); void recargar(); }} />
      )}
      <datalist id="dir-grupos">{grupos.filter((g) => g !== "Sin grupo").map((g) => <option key={g} value={g} />)}</datalist>
      <datalist id="dir-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>

      <CamposPanel campos={campos} puedeAdministrar={puedeAdministrar} onCambio={recargar} />

      {personas.length === 0 ? (
        <EmptyRow msg={cortado ? "Todavía no hay personas. Agrega la primera con «+ Nueva persona»." : "Todavía no hay personas. Importa el Directorio RH para empezar."} />
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
                  <tr>
                    <th>Nombre</th><th>Grupo</th><th>Rol</th><th>TLD</th><th>Hrs/mes</th><th>Correo</th>
                    {campos.map((c) => <th key={c.id} title="Campo propio (no viene del Directorio RH)">{c.titulo}</th>)}
                    <th>Usuario de la app</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.id} style={p.activo ? undefined : { opacity: 0.6 }}>
                      {editaFijos ? (
                        <>
                          {([["nombre", p.nombre], ["grupo", p.grupo, "dir-grupos"], ["rol", p.rol, "dir-roles"], ["tld", p.tld], ["hrsMes", p.hrsMes], ["email", p.email]] as const).map(([campo, valor, lista]) => (
                            <td key={campo} className={campo === "nombre" ? "pm-name" : undefined}>
                              <CeldaPersona
                                key={`${p.id}-${campo}-${valor ?? ""}`} personaId={p.id} campo={campo} valor={valor} lista={lista} numero={campo === "hrsMes"}
                                onError={setFallo} onGuardado={() => void recargar()}
                              />
                            </td>
                          ))}
                        </>
                      ) : (
                        <>
                          <td className="pm-name">{p.nombre}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{p.grupo ?? "—"}</td>
                          <td>{p.rol ?? "—"}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{p.tld ?? "—"}</td>
                          <td style={{ textAlign: "right" }}>{p.hrsMes ?? "—"}</td>
                          <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>{p.email ?? "—"}</td>
                        </>
                      )}
                      {campos.map((c) => (
                        <td key={c.id}>
                          <CeldaCampo
                            campo={c} personaId={p.id} valor={p.extra?.[c.id]} editable={puedeAdministrar}
                            onError={setFallo} onGuardado={() => void recargar()}
                          />
                        </td>
                      ))}
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
                      <td>
                        {editaFijos
                          ? <ActivoPersona personaId={p.id} activo={p.activo} onError={setFallo} onGuardado={() => void recargar()} />
                          : p.activo ? <Pill tone="ok" small>Activa</Pill> : <Pill tone="neutral" small>Inactiva</Pill>}
                      </td>
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
