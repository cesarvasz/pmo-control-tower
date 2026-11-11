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
  { nombre: "3 · Completo", entrega: "Fórmulas (sintaxis de Monday y en español), espejo, relación entre tableros, bitácora y archivos (Supabase Storage). Importar trae fórmulas y espejos; «Traer bitácora y archivos» trae los Updates y documentos de Monday.", valida: "Piloto PM-013 completo (solo faltan Dependent On, sin uso, y Creation log) y mide igual; un Developer actualiza solo lo suyo.", estado: "hecha" },
  { nombre: "4 · Migración", entrega: "Pestaña Migración: los 22 boards (Estrategia, Iniciativas, PML y 19 proyectos) importados en orden, con relaciones entre tableros, ID automático y fecha de creación; bitácora y archivos de todo. Vista Gantt en cada tablero.", valida: "Paridad en todo el portafolio con el procesador real de la app (una diferencia explicada en PM-018: la app aplica la fórmula completa del costo).", estado: "hecha" },
  { nombre: "5 · Convivencia", entrega: "Monday sigue vivo. Cada hora se trae todo de Monday a los tableros ya creados sin rehacerlos: Monday manda en los datos (elementos, valores, bitácora, archivos, directorio y boards nuevos) y la app en el modelo (columnas, roles, fórmulas, grupos, permisos). Los valores que vienen de Monday no se editan aquí; las columnas propias sí. Registro de corridas, «Sincronizar ahora» y comparación con Monday en cada corrida (pestaña Migración). Corre solo en local: cada hora con el Programador de tareas de Windows.", valida: "Una semana de corridas sin errores; lo modelado sobrevive a las sincronizaciones.", estado: "en_curso" },
  { nombre: "6 · Conectar la app", entrega: "Interruptor de fuente: la app lee sus métricas de los tableros (datos de hasta 1 h). Mientras dure la convivencia, lo que la app escribe sigue yendo a Monday. Menú y roles (toca la estructura de la app).", valida: "El dashboard completo da igual con las dos fuentes.", estado: "pendiente" },
  { nombre: "7 · Corte", entrega: "Cuando el modelo esté listo: se detiene la sincronización, las escrituras van a los tableros, Monday solo lectura → exportación final → se apagan la copia y la clave de Monday.", valida: "Paridad final; respaldo semanal de la base y de Storage.", estado: "pendiente" },
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
