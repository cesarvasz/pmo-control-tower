"use client";

// Pestaña Plan: en qué fase va Tableros. Se actualiza a mano al cerrar cada fase
// (detalle completo en docs/tableros/diseno.md).

import { Pill } from "@/components/ui";
import { Tarjeta } from "./comun";

type Estado = "hecha" | "en_curso" | "pendiente";

const FASES: { nombre: string; entrega: string; valida: string; estado: Estado }[] = [
  { nombre: "0 · Base", entrega: "Registros (tipos, roles, categorías, acciones), tablas en Supabase, motor de permisos y directorio de personas importado del Directorio RH y ligado a los usuarios.", valida: "Tests del dominio; directorio visible aquí.", estado: "hecha" },
  { nombre: "1 · Tablero", entrega: "Vista Tabla editable: grupos, subitems, tipos básicos, crear y editar columnas y grupos, roles e historial de cambios. Los permisos (por columna y «solo lo mío») ya se aplican.", valida: "Crear un tablero de prueba de punta a punta.", estado: "hecha" },
  { nombre: "2 · Plantillas + piloto", entrega: "Guardar como plantilla y crear desde plantilla; importar de Monday (piloto PM-013: 31 elementos, 123 subelementos); adaptador de métricas y «Comparar con Monday».", valida: "Las métricas del piloto dan igual en Monday y en la app: 0 diferencias en EVM, salud y entregas.", estado: "hecha" },
  { nombre: "3 · Completo", entrega: "Permisos por columna y «solo lo mío» en el tablero, bitácora, archivos, fórmulas, relación y espejo.", valida: "Un Developer actualiza solo lo suyo.", estado: "pendiente" },
  { nombre: "4 · Migración", entrega: "Importar los 19 proyectos, PML, Iniciativas y Estrategia; vista Gantt.", valida: "Paridad de métricas en todo el portafolio.", estado: "pendiente" },
  { nombre: "5 · Corte", entrega: "Monday solo lectura → exportación final → se apaga la copia.", valida: "—", estado: "pendiente" },
];

const PILL: Record<Estado, { tono: "ok" | "warn" | "neutral"; texto: string }> = {
  hecha: { tono: "ok", texto: "✓ Hecha" },
  en_curso: { tono: "warn", texto: "En curso" },
  pendiente: { tono: "neutral", texto: "Pendiente" },
};

export default function PlanTab() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[0.82rem] text-[var(--text-muted)]">
        Objetivo: que la app tenga sus propios tableros y deje de depender de Monday. Todo se construye en esta página, aparte del
        resto de la app; cada fase agrega su pestaña. Cuando esté lista, se conecta al menú y a las métricas.
      </p>
      {FASES.map((f) => (
        <Tarjeta key={f.nombre} titulo={f.nombre} accion={<Pill tone={PILL[f.estado].tono} small>{PILL[f.estado].texto}</Pill>}>
          <p className="text-[0.84rem] text-[var(--text-secondary)]">{f.entrega}</p>
          <p className="mt-1.5 text-[0.75rem] text-[var(--text-muted)]">Cómo se valida: {f.valida}</p>
        </Tarjeta>
      ))}
    </div>
  );
}
