"use client";

// "Guardar como plantilla": la estructura del tablero (grupos y columnas con sus roles) y, si se
// quiere, los nombres de sus elementos, para crear tableros iguales después.

import { useState } from "react";
import Modal from "@/components/Modal";
import { Boton, estiloControl, Nota } from "../comun";

export default function GuardarPlantillaModal({ nombreInicial, onGuardar, onCerrar }: {
  nombreInicial: string;
  onGuardar(d: { nombre: string; descripcion: string; conElementos: boolean }): Promise<void>;
  onCerrar(): void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [descripcion, setDescripcion] = useState("");
  const [conElementos, setConElementos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function guardar() {
    if (!nombre.trim()) { setFallo("La plantilla necesita un nombre."); return; }
    setGuardando(true); setFallo(null);
    try {
      await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim(), conElementos });
      setListo(true);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} width={480} label="Guardar como plantilla">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Guardar como plantilla</h2>
        <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-[var(--text-secondary)]">Nombre
          <input autoFocus value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)} {...estiloControl} className={`${estiloControl.className} py-1.5`} />
        </label>
        <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-[var(--text-secondary)]">Descripción
          <textarea value={descripcion} maxLength={1000} rows={2} onChange={(e) => setDescripcion(e.target.value)} {...estiloControl} />
        </label>
        <label className="flex items-start gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
          <input type="checkbox" checked={conElementos} onChange={(e) => setConElementos(e.target.checked)} className="mt-0.5" />
          <span>Incluir los elementos y subelementos (solo sus nombres y valores de texto, lista y número; sin personas, fechas ni avances).</span>
        </label>
        <p className="text-[0.72rem] text-[var(--text-muted)]">Si ya existe una plantilla con ese nombre, se actualiza (sube de versión).</p>
        {fallo && <Nota tono="mal">{fallo}</Nota>}
        {listo && <Nota tono="ok">Plantilla guardada. La encuentras en la pestaña Plantillas y al crear un tablero nuevo.</Nota>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>{listo ? "Cerrar" : "Cancelar"}</Boton>
          {!listo && <Boton primario onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar plantilla"}</Boton>}
        </div>
      </div>
    </Modal>
  );
}
