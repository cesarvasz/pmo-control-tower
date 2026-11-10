"use client";

// Crear o editar una columna: título, tipo (solo al crear), rol y su config.

import { useState, type ComponentType } from "react";
import Modal from "@/components/Modal";
import { TIPOS_COLUMNA, tipoColumna } from "../../dominio/tipos-columna";
import { rolesParaTipo } from "../../dominio/roles";
import { errorColumna, type Columna, type Nivel } from "../../dominio/tablero";
import { ErrorFormula, idsATitulos, titulosAIds } from "../../dominio/formulas";
import type { ConfigFormula } from "../../dominio/tipos-columna/formula";
import { Boton, estiloControl, Nota } from "../comun";
import { EDITORES_CONFIG, type PropsConfig } from "./config";
import type { ContextoConfig } from "./configCalculadas";

export interface CambiosColumna {
  titulo: string;
  tipo: string;
  rol: string | null;
  config: unknown;
  nivel: Nivel;
  oculta: boolean;
}

export default function ColumnaEditor({ columna, nivel, columnas, tableros, ligados, onGuardar, onArchivar, onCerrar }: {
  /** null = columna nueva */
  columna: Columna | null;
  nivel: Nivel;
  columnas: Columna[];
  tableros: ContextoConfig["tableros"];
  ligados: ContextoConfig["ligados"];
  onGuardar(c: CambiosColumna): Promise<void>;
  onArchivar?(): Promise<void>;
  onCerrar(): void;
}) {
  const [titulo, setTitulo] = useState(columna?.titulo ?? "");
  const [tipo, setTipo] = useState(columna?.tipo ?? "texto");
  const [rol, setRol] = useState<string | null>(columna?.rol ?? null);
  // Las otras columnas del mismo nivel (para fórmulas y espejos).
  const otras = columnas.filter((c) => c.nivel === nivel && c.id !== columna?.id);
  const [config, setConfig] = useState<unknown>(() => {
    const t = tipoColumna(columna?.tipo ?? "texto");
    const c = t ? t.config.validar(columna?.config ?? t.config.defecto) : {};
    // La fórmula se edita con títulos, no con ids.
    return columna?.tipo === "formula" ? { ...(c as ConfigFormula), expresion: idsATitulos((c as ConfigFormula).expresion, otras) } : c;
  });
  const [oculta, setOculta] = useState(columna?.oculta ?? false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const def = tipoColumna(tipo);
  const roles = rolesParaTipo(tipo, config);
  const EditorConfig = EDITORES_CONFIG[tipo] as ComponentType<PropsConfig<unknown>> | undefined;

  function cambiarTipo(t: string) {
    setTipo(t);
    setConfig(tipoColumna(t)?.config.defecto ?? {});
    if (rol && !rolesParaTipo(t, tipoColumna(t)?.config.defecto).some((r) => r.clave === rol)) setRol(null);
  }

  function cambiarConfig(c: unknown) {
    setConfig(c);
    if (rol && !rolesParaTipo(tipo, c).some((r) => r.clave === rol)) setRol(null);
  }

  async function guardar() {
    let final = def ? def.config.validar(config) : config;
    if (tipo === "formula") {
      try {
        final = { ...(final as ConfigFormula), expresion: titulosAIds((final as ConfigFormula).expresion, otras) };
      } catch (e) {
        setFallo(e instanceof ErrorFormula ? e.message : "Fórmula inválida"); return;
      }
    }
    const error = !titulo.trim() ? "La columna necesita un título." : errorColumna({ tipo, rol, nivel, id: columna?.id, config: final }, columnas);
    if (error) { setFallo(error); return; }
    setGuardando(true); setFallo(null);
    try {
      await onGuardar({ titulo: titulo.trim(), tipo, rol, config: final, nivel, oculta });
      onCerrar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} width={600} label={columna ? "Editar columna" : "Nueva columna"}>
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          {columna ? "Editar columna" : `Nueva columna${nivel === "sub" ? " de subelementos" : ""}`}
        </h2>
        <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-[var(--text-secondary)]">Título
          <input autoFocus value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} {...estiloControl} className={`${estiloControl.className} py-1.5`} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-[var(--text-secondary)]">Tipo
            {columna
              ? <span className="py-1 text-[0.82rem] font-normal text-[var(--text-primary)]">{def?.icono} {def?.etiqueta ?? tipo}</span>
              : (
                <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)} {...estiloControl}>
                  {TIPOS_COLUMNA.map((t) => <option key={t.clave} value={t.clave}>{t.icono} {t.etiqueta}</option>)}
                </select>
              )}
          </label>
          <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-[var(--text-secondary)]">Rol para las métricas
            <select value={rol ?? ""} onChange={(e) => setRol(e.target.value || null)} disabled={!roles.length} {...estiloControl}>
              <option value="">Sin rol</option>
              {roles.map((r) => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}
            </select>
          </label>
        </div>
        {def && <p className="text-[0.75rem] text-[var(--text-muted)]">{def.descripcion}</p>}
        {EditorConfig && (
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <EditorConfig config={config} onCambiar={cambiarConfig} contexto={{ columnas: otras, tableros, ligados }} />
          </div>
        )}
        {columna && (
          <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
            <input type="checkbox" checked={oculta} onChange={(e) => setOculta(e.target.checked)} /> Ocultar en la tabla
          </label>
        )}
        {fallo && <Nota tono="mal">{fallo}</Nota>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {columna && onArchivar ? (
            <Boton onClick={async () => { if (confirm(`¿Quitar la columna «${columna.titulo}»? Sus datos se conservan archivados.`)) { await onArchivar(); onCerrar(); } }}>
              Quitar columna
            </Boton>
          ) : <span />}
          <div className="flex gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton primario onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
