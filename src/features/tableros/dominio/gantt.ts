// Vista Gantt de un tablero: una barra por elemento con su Plan (inicio–fin) o, si no tiene, un
// punto en su Fecha límite; color por la categoría de su status. Lee por ROL (como las métricas),
// así sirve igual para un tablero importado de Monday que para uno nuevo. Lógica PURA.

import { tipoColumna } from "./tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "./tipos-columna/status";
import { categoriaStatus } from "./estados";
import { valorDeCelda, type Calculados } from "./calculos";
import { columnaConRol, porOrden, type Nivel, type TableroCompleto } from "./tablero";
import { hoyLocal } from "./formulas";

export interface Barra {
  id: string;
  parentId: string | null;
  grupoId: string | null;
  nombre: string;
  /** Sin Plan, `desde` = `hasta` = la fecha límite (se dibuja como hito). */
  desde: string | null;
  hasta: string | null;
  hito: boolean;
  /** Etiqueta y color de su status (o gris si no tiene). */
  status: string;
  color: string;
  hecho: boolean;
  /** Ya pasó su fin y no está hecho. */
  atrasado: boolean;
  /** Fin real, si lo tiene (para marcarlo). */
  finReal: string | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v);

export function barrasGantt(t: TableroCompleto, calc: Calculados, hoy = hoyLocal()): Barra[] {
  const leer = (nivel: Nivel, rol: string) => columnaConRol(t.columnas, nivel, rol);
  const out: Barra[] = [];
  const items = t.elementos.filter((e) => !e.parentId);
  const ordenGrupo = new Map([...t.grupos].sort(porOrden).map((g, i) => [g.id, i]));
  items.sort((a, b) => (ordenGrupo.get(a.grupoId ?? "") ?? 0) - (ordenGrupo.get(b.grupoId ?? "") ?? 0) || porOrden(a, b));

  const barra = (e: (typeof t.elementos)[number]): Barra => {
    const nivel: Nivel = e.parentId ? "sub" : "item";
    const plan = leer(nivel, "plan");
    const limite = leer(nivel, "fecha_limite");
    const fin = leer(nivel, "fin_real");
    const st = leer(nivel, "status");
    const rango = plan ? valorDeCelda(calc, e, plan) as { desde?: string; hasta?: string } | null : null;
    const fechaLimite = limite ? valorDeCelda(calc, e, limite) : null;
    let desde: string | null = esFecha(rango?.desde) ? rango!.desde! : null;
    let hasta: string | null = esFecha(rango?.hasta) ? rango!.hasta! : null;
    const hito = !desde && esFecha(fechaLimite);
    if (hito) { desde = fechaLimite as string; hasta = fechaLimite as string; }
    // Si hay fecha límite (puede venir de una fórmula), es el fin que cuenta para "atrasado".
    const finQueCuenta = esFecha(fechaLimite) ? fechaLimite : hasta;

    let status = "Sin status";
    let color = "#c4c4c4";
    let categoria = "";
    if (st) {
      const config = tipoColumna("status")!.config.validar(st.config) as ConfigStatus;
      const et = etiquetaStatus(config, e.valores[st.id] as string);
      if (et) { status = et.texto; color = et.color; categoria = et.categoria; }
    }
    const hecho = categoria === "hecho";
    const fueraDeMedicion = categoriaStatus(categoria)?.cuentaEnMetricas === false;
    return {
      id: e.id, parentId: e.parentId, grupoId: e.grupoId, nombre: e.nombre, desde, hasta, hito, status, color, hecho,
      atrasado: !hecho && !fueraDeMedicion && !!finQueCuenta && finQueCuenta < hoy,
      finReal: fin && esFecha(e.valores[fin.id]) ? (e.valores[fin.id] as string) : null,
    };
  };

  for (const it of items) {
    out.push(barra(it));
    for (const s of t.elementos.filter((x) => x.parentId === it.id).sort(porOrden)) out.push(barra(s));
  }
  return out;
}

/** Rango de fechas que cubre el Gantt (con un margen), o null si nada tiene fechas. */
export function rangoGantt(barras: Barra[], hoy = hoyLocal(), margenDias = 7): { desde: string; hasta: string } | null {
  const fechas = barras.flatMap((b) => [b.desde, b.hasta, b.finReal]).filter((f): f is string => !!f);
  if (!fechas.length) return null;
  const min = [...fechas, hoy].sort()[0];
  const max = [...fechas, hoy].sort().at(-1)!;
  return { desde: sumarDias(min, -margenDias), hasta: sumarDias(max, margenDias) };
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
}

export function sumarDias(f: string, n: number): string {
  const d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/** Primer día de cada mes dentro del rango (para el encabezado). */
export function mesesEnRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let y = +desde.slice(0, 4); let m = +desde.slice(5, 7);
  for (;;) {
    const f = `${y}-${String(m).padStart(2, "0")}-01`;
    if (f > hasta) break;
    out.push(f);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
