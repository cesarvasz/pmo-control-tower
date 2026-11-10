"use client";

// Importar boards de Proyectos de Monday como tableros de la app, tal cual (con roles asignados).

import { useState } from "react";
import { ErrorBox } from "@/components/ui";
import { Boton, enviar, Nota, Tarjeta, useCarga } from "../comun";

interface BoardImportable { id: string; nombre: string; tableroId: string | null }
interface Resultado {
  tableroId: string;
  elementos: number;
  subelementos: number;
  omitidas: { nivel: string; titulo: string; tipo: string }[];
  personasNoEncontradas: string[];
  aviso: string | null;
}

const URL_API = "/api/tableros/importar";

export default function ImportarMonday({ onAbrir, onImportado }: { onAbrir(id: string): void; onImportado(): void }) {
  const [abierto, setAbierto] = useState(false);
  const { data, error, recargar } = useCarga<{ boards: BoardImportable[] }>(abierto ? URL_API : "");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<(Resultado & { nombre: string }) | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function importar(b: BoardImportable) {
    if (b.tableroId && !confirm(`«${b.nombre}» ya está importado. ¿Volver a importarlo? Se reemplaza el tablero de la app (y lo que se haya cambiado en él).`)) return;
    setTrabajando(b.id); setFallo(null); setResultado(null);
    try {
      const r = await enviar<Resultado>(URL_API, "POST", { mondayBoardId: b.id, reemplazar: !!b.tableroId });
      setResultado({ ...r, nombre: b.nombre });
      await recargar();
      onImportado();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setTrabajando(null);
    }
  }

  if (!abierto) {
    return (
      <Tarjeta titulo="Importar de Monday" accion={<Boton onClick={() => setAbierto(true)}>Ver boards de Proyectos</Boton>}>
        <p className="text-[0.8rem] text-[var(--text-muted)]">
          Trae un proyecto de Monday tal cual (grupos, columnas, elementos y subelementos) y le asigna los roles para que mida igual.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Importar de Monday" accion={<Boton onClick={() => setAbierto(false)}>Ocultar</Boton>}>
      <p className="mb-3 text-[0.8rem] text-[var(--text-muted)]">
        Se toma de la copia de Monday en Supabase (se refresca antes de importar). Las fórmulas, espejos, archivos y relaciones a otros
        tableros todavía no se importan; las métricas no los necesitan porque se recalculan igual que hoy.
      </p>
      {fallo && <div className="mb-3"><Nota tono="mal">{fallo}</Nota></div>}
      {resultado && (
        <div className="mb-3">
          <Nota tono="ok">
            <strong>{resultado.nombre}</strong>: {resultado.elementos} elementos y {resultado.subelementos} subelementos importados.{" "}
            <button type="button" className="font-semibold underline" onClick={() => onAbrir(resultado.tableroId)}>Abrirlo</button>
            {resultado.omitidas.length > 0 && <><br />No importadas: {resultado.omitidas.map((o) => `${o.titulo}${o.nivel === "sub" ? " (sub)" : ""} · ${o.tipo}`).join(", ")}.</>}
            {resultado.personasNoEncontradas.length > 0 && <><br />Personas que no están en el directorio (quedaron vacías): {resultado.personasNoEncontradas.join(", ")}.</>}
            {resultado.aviso && <><br />{resultado.aviso}</>}
          </Nota>
        </div>
      )}
      {error && <ErrorBox msg={error} />}
      {!data && !error && <div className="text-[0.8rem] text-[var(--text-muted)]">Cargando…</div>}
      {data && (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="pmo">
            <thead><tr><th>Board de Monday</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.boards.map((b) => (
                <tr key={b.id}>
                  <td className="pm-name">{b.nombre}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>{b.tableroId ? "Importado" : "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {b.tableroId && <><Boton onClick={() => onAbrir(b.tableroId!)}>Abrir</Boton>{" "}</>}
                    <Boton primario={!b.tableroId} onClick={() => importar(b)} disabled={!!trabajando}>
                      {trabajando === b.id ? "Importando…" : b.tableroId ? "Volver a importar" : "Importar"}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
