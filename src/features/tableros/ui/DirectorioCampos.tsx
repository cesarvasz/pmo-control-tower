"use client";

// Campos PROPIOS del directorio (además de los que trae el Directorio RH): el panel para
// agregarlos, renombrarlos o quitarlos, y la celda para llenarlos por persona. Se muestran en los
// tableros con una columna Espejo sobre una columna Persona.

import { useState } from "react";
import { TIPOS_CAMPO_DIRECTORIO, textoValorCampo, type CampoDirectorio, type TipoCampoDirectorio } from "../dominio/directorio-campos";
import { Boton, enviar, estiloControl, Nota, Tarjeta } from "./comun";

const URL_CAMPOS = "/api/tableros/personas/campos";
const etiquetaTipo = (t: TipoCampoDirectorio) => TIPOS_CAMPO_DIRECTORIO.find((x) => x.clave === t)?.etiqueta ?? t;
const partirOpciones = (s: string) => s.split(",").map((o) => o.trim()).filter(Boolean);

/** Panel de campos propios: lista, agregar, renombrar / cambiar opciones y quitar. */
export function CamposPanel({ campos, puedeAdministrar, onCambio }: {
  campos: CampoDirectorio[]; puedeAdministrar: boolean; onCambio(): Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoCampoDirectorio>("texto");
  const [opciones, setOpciones] = useState("");
  const [editando, setEditando] = useState<{ id: string; titulo: string; opciones: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function correr(f: () => Promise<unknown>) {
    setOcupado(true); setFallo(null);
    try { await f(); await onCambio(); return true; }
    catch (e) { setFallo(e instanceof Error ? e.message : "Error"); return false; }
    finally { setOcupado(false); }
  }

  async function agregar() {
    const ok = await correr(() => enviar(URL_CAMPOS, "POST", { titulo, tipo, opciones: partirOpciones(opciones) }));
    if (ok) { setTitulo(""); setOpciones(""); setTipo("texto"); }
  }

  return (
    <Tarjeta titulo="Campos propios del directorio">
      <p className="text-[0.8rem] text-[var(--text-muted)]">
        Además de los campos que trae el Directorio RH, puedes agregar los tuyos (p. ej. País o Área) y llenarlos aquí por persona.
        En un tablero se muestran con una columna <strong>Espejo</strong> sobre una columna Persona. La sincronización con Monday no los toca.
      </p>
      {fallo && <div className="mt-2"><Nota tono="mal">{fallo}</Nota></div>}
      {campos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {campos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-[0.84rem]">
              {editando?.id === c.id ? (
                <>
                  <input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} aria-label="Título del campo" {...estiloControl} />
                  {c.tipo === "lista" && (
                    <input value={editando.opciones} onChange={(e) => setEditando({ ...editando, opciones: e.target.value })}
                      aria-label="Opciones separadas por coma" placeholder="Opciones, separadas por coma" {...estiloControl} className={`${estiloControl.className} w-72`} />
                  )}
                  <Boton primario disabled={ocupado} onClick={async () => {
                    const ok = await correr(() => enviar(URL_CAMPOS, "PATCH", {
                      campoId: c.id, titulo: editando.titulo, ...(c.tipo === "lista" ? { opciones: partirOpciones(editando.opciones) } : {}),
                    }));
                    if (ok) setEditando(null);
                  }}>Guardar</Boton>
                  <Boton disabled={ocupado} onClick={() => setEditando(null)}>Cancelar</Boton>
                </>
              ) : (
                <>
                  <span className="font-semibold text-[var(--text-primary)]">{c.titulo}</span>
                  <span className="text-[var(--text-muted)]">· {etiquetaTipo(c.tipo)}{c.tipo === "lista" ? `: ${c.opciones.join(", ")}` : ""}</span>
                  {puedeAdministrar && (
                    <>
                      <button type="button" className="text-[0.78rem] text-[var(--accent)] hover:underline" disabled={ocupado}
                        onClick={() => setEditando({ id: c.id, titulo: c.titulo, opciones: c.opciones.join(", ") })}>Editar</button>
                      <button type="button" className="text-[0.78rem] text-[var(--bad)] hover:underline" disabled={ocupado} onClick={() => {
                        if (confirm(`¿Quitar el campo «${c.titulo}»?\n\nDeja de verse en el directorio y en los Espejos que lo usan. Los valores se quedan guardados.`)) {
                          void correr(() => enviar(`${URL_CAMPOS}?id=${c.id}`, "DELETE"));
                        }
                      }}>Quitar</button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeAdministrar && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre del campo nuevo" aria-label="Nombre del campo nuevo" {...estiloControl} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampoDirectorio)} aria-label="Tipo del campo" {...estiloControl}>
            {TIPOS_CAMPO_DIRECTORIO.map((t) => <option key={t.clave} value={t.clave}>{t.etiqueta}</option>)}
          </select>
          {tipo === "lista" && (
            <input value={opciones} onChange={(e) => setOpciones(e.target.value)} placeholder="Opciones, separadas por coma"
              aria-label="Opciones separadas por coma" {...estiloControl} className={`${estiloControl.className} w-72`} />
          )}
          <Boton primario disabled={ocupado || !titulo.trim()} onClick={agregar}>Agregar campo</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

/** El valor de un campo propio para una persona: editable (se guarda al salir o al elegir) o solo texto. */
export function CeldaCampo({ campo, personaId, valor, editable, onError, onGuardado }: {
  campo: CampoDirectorio; personaId: string; valor: unknown; editable: boolean;
  onError(m: string): void; onGuardado(personaId: string, campoId: string, valor: unknown): void;
}) {
  const inicial = valor === null || valor === undefined ? "" : String(valor);
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  if (!editable) return <>{textoValorCampo(campo, valor) || "—"}</>;

  async function guardar(nuevo: string) {
    if (nuevo === inicial) return;
    setGuardando(true);
    try {
      const r = await enviar<{ valor: unknown }>("/api/tableros/personas", "PATCH", { personaId, campoId: campo.id, valor: nuevo });
      onGuardado(personaId, campo.id, r.valor);
      setTexto(r.valor === null || r.valor === undefined ? "" : String(r.valor));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error");
      setTexto(inicial);
    } finally {
      setGuardando(false);
    }
  }

  const comun = { "aria-label": campo.titulo, disabled: guardando, ...estiloControl, className: `${estiloControl.className} w-36` };
  if (campo.tipo === "lista") {
    return (
      <select value={texto} onChange={(e) => { setTexto(e.target.value); void guardar(e.target.value); }} {...comun}>
        <option value="">—</option>
        {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type={campo.tipo === "fecha" ? "date" : campo.tipo === "numero" ? "number" : "text"}
      value={texto} onChange={(e) => setTexto(e.target.value)}
      onBlur={() => void guardar(texto)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      {...comun}
    />
  );
}
