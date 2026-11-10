"use client";

// Pestaña Catálogo: muestra lo que hay en cada REGISTRO del código (tipos de columna, roles,
// categorías…). Es la "lista de piezas" con que se arman los tableros; crece agregando módulos.

import type { ReactNode } from "react";
import { TIPOS_COLUMNA } from "../dominio/tipos-columna";
import { ROLES_COLUMNA } from "../dominio/roles";
import { CATEGORIAS_STATUS } from "../dominio/estados";
import { CATEGORIAS_TABLERO } from "../dominio/categorias";
import { ACCIONES_TABLEROS } from "../dominio/acciones";
import { tipoColumna } from "../dominio/tipos-columna";
import { rolColumna } from "../dominio/roles";
import { Tarjeta } from "./comun";

function Tabla({ cabeceras, children }: { cabeceras: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="pmo">
        <thead><tr>{cabeceras.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const clave = (s: string) => <code className="text-[0.75rem] text-[var(--text-muted)]">{s}</code>;

export default function CatalogoTab() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Las piezas con que se arman los tableros. Cada lista es un <strong>registro</strong> en el código
        (<code>src/features/tableros/dominio</code>): agregar una funcionalidad es agregar una entrada; quitarla es quitar la entrada,
        sin tocar lo demás.
      </p>

      <Tarjeta titulo={`Tipos de columna (${TIPOS_COLUMNA.length})`}>
        <Tabla cabeceras={["", "Tipo", "Clave", "Para qué", "Roles que puede tener"]}>
          {TIPOS_COLUMNA.map((t) => (
            <tr key={t.clave}>
              <td style={{ width: 32, textAlign: "center" }}>{t.icono}</td>
              <td className="pm-name">{t.etiqueta}</td>
              <td>{clave(t.clave)}</td>
              <td style={{ color: "var(--text-secondary)" }}>{t.descripcion}</td>
              <td style={{ color: "var(--text-secondary)", fontSize: ".8rem" }}>
                {ROLES_COLUMNA.filter((r) => r.tipos.includes(t.clave)).map((r) => r.etiqueta).join(", ") || "—"}
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>

      <Tarjeta titulo={`Roles de columna (${ROLES_COLUMNA.length})`}>
        <Tabla cabeceras={["Rol", "Clave", "Qué significa para las métricas", "Tipos"]}>
          {ROLES_COLUMNA.map((r) => (
            <tr key={r.clave}>
              <td className="pm-name">{r.etiqueta}</td>
              <td>{clave(r.clave)}</td>
              <td style={{ color: "var(--text-secondary)" }}>{r.descripcion}</td>
              <td style={{ fontSize: ".8rem" }}>{r.tipos.map((t) => tipoColumna(t)?.etiqueta ?? t).join(", ")}</td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`Categorías de status (${CATEGORIAS_STATUS.length})`}>
          <Tabla cabeceras={["Categoría", "Clave", "¿Cuenta en métricas?"]}>
            {CATEGORIAS_STATUS.map((c) => (
              <tr key={c.clave}>
                <td>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c.color }} />
                  <span className="pm-name" title={c.descripcion}>{c.etiqueta}</span>
                </td>
                <td>{clave(c.clave)}</td>
                <td>{c.cuentaEnMetricas ? "Sí" : "No"}</td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>

        <Tarjeta titulo={`Acciones globales (${ACCIONES_TABLEROS.length})`}>
          <Tabla cabeceras={["Acción", "Clave"]}>
            {ACCIONES_TABLEROS.map((a) => (
              <tr key={a.clave}>
                <td><span className="pm-name">{a.etiqueta}</span><div className="text-[0.75rem] text-[var(--text-muted)]">{a.descripcion}</div></td>
                <td>{clave(a.clave)}</td>
              </tr>
            ))}
          </Tabla>
          <p className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
            Mientras Tableros está en prueba, las tiene quien puede gestionar roles (Admin).
          </p>
        </Tarjeta>
      </div>

      <Tarjeta titulo={`Categorías de tablero (${CATEGORIAS_TABLERO.length})`}>
        <Tabla cabeceras={["Categoría", "Clave", "Para qué", "Columnas que necesita para medirse"]}>
          {CATEGORIAS_TABLERO.map((c) => (
            <tr key={c.clave}>
              <td className="pm-name">{c.etiqueta}</td>
              <td>{clave(c.clave)}</td>
              <td style={{ color: "var(--text-secondary)" }}>{c.descripcion}</td>
              <td style={{ fontSize: ".8rem" }}>{c.rolesRequeridos.map((r) => rolColumna(r)?.etiqueta ?? r).join(", ") || "—"}</td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </div>
  );
}
