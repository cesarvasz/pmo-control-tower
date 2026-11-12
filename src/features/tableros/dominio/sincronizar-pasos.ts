// Sincronización POR PASOS (camino a producción): la corrida completa (copia de Monday → directorio →
// cada tablero → bitácora y archivos → comparación) tarda 2–3 minutos y en Vercel una función se
// corta a los 60 s. Por eso la corrida se parte en pasos chicos que se guardan en la corrida; cada
// llamada avanza los que le alcancen y la siguiente sigue donde quedó.
// Puro: sin I/O (lo usa datos/sincronizar.ts).

export type TipoBoardCopia = "ini" | "req" | "rh" | "est" | "proj";

export type Paso =
  /** Lista los boards de Monday (carpeta de Proyectos incluida) y abre el registro de la copia. */
  | { tipo: "descubrir" }
  /** Copia unos boards de Monday a monday_boards / monday_items (en paralelo). */
  | { tipo: "copiar"; boards: { id: string; tipo: TipoBoardCopia }[]; de: [number, number] }
  /** Desactiva los boards que salieron de la carpeta, guarda su orden y cierra el registro de la copia. */
  | { tipo: "cerrar_copia"; projIds: string[] }
  /** Directorio RH → personas. */
  | { tipo: "directorio" }
  /** Trae la copia al tablero de ese board (o lo importa si es nuevo en Monday). */
  | { tipo: "tablero"; boardId: string; nombre: string; tipoBoard: string }
  /** Bitácora (updates y respuestas) y archivos de ese board. */
  | { tipo: "bitacora"; boardId: string; nombre: string }
  /** Compara el tablero con Monday (las métricas deben dar igual). */
  | { tipo: "comparar"; boardId: string; nombre: string };

/** Un paso en la cola, con las veces que se intentó (una función que se corta a medias lo deja intentado). */
export type PasoEnCola = Paso & { intentos?: number };

/** Boards de Monday que se copian juntos en un paso (en paralelo; cuida el rate limit de Monday). */
export const BOARDS_POR_PASO_DE_COPIA = 3;
/** Un paso que se cortó estas veces se abandona (queda como error) para que la corrida no se trabe. */
export const MAX_INTENTOS_POR_PASO = 3;
/** Una corrida que lleva más que esto abierta se da por cortada. */
export const HORAS_MAX_CORRIDA = 2;

/** La copia de Monday partida en pasos, y su cierre. */
export function pasosDeCopia(objetivos: { id: string; tipo: TipoBoardCopia }[], porPaso = BOARDS_POR_PASO_DE_COPIA): Paso[] {
  const pasos: Paso[] = [];
  for (let i = 0; i < objetivos.length; i += porPaso) {
    const boards = objetivos.slice(i, i + porPaso).map(({ id, tipo }) => ({ id, tipo }));
    pasos.push({ tipo: "copiar", boards, de: [i + boards.length, objetivos.length] });
  }
  pasos.push({ tipo: "cerrar_copia", projIds: objetivos.filter((o) => o.tipo === "proj").map((o) => o.id) });
  return pasos;
}

/** El directorio y, por cada board EN ORDEN (las relaciones necesitan su destino al día): traerlo,
 *  su bitácora y su comparación. */
export function pasosDeTableros(boards: { id: string; nombre: string; tipo: string }[]): Paso[] {
  return [
    { tipo: "directorio" },
    ...boards.flatMap((b): Paso[] => [
      { tipo: "tablero", boardId: b.id, nombre: b.nombre, tipoBoard: b.tipo },
      { tipo: "bitacora", boardId: b.id, nombre: b.nombre },
      { tipo: "comparar", boardId: b.id, nombre: b.nombre },
    ]),
  ];
}

/** Qué está haciendo (para «va en: …» en la pestaña Migración). */
export function describirPaso(p: Paso): string {
  switch (p.tipo) {
    case "descubrir": return "Copia de Monday (buscando boards)";
    case "copiar": return `Copia de Monday (${p.de[0]} de ${p.de[1]})`;
    case "cerrar_copia": return "Copia de Monday (cerrando)";
    case "directorio": return "Directorio";
    case "tablero": return p.nombre;
    case "bitacora": return `${p.nombre} · bitácora y archivos`;
    case "comparar": return `${p.nombre} · comparación con Monday`;
  }
}

/** Si un paso falla, ¿se cae toda la corrida? Los de la copia y el directorio sí (sin ellos los
 *  tableros traerían datos viejos); los de un board solo marcan ese board. */
export const pasoCritico = (p: Paso): boolean => p.tipo === "descubrir" || p.tipo === "cerrar_copia" || p.tipo === "directorio";

export type DecisionTick =
  | { decision: "avanzar" }
  | { decision: "cerrar_cortada" }
  | { decision: "abrir" }
  | { decision: "esperar"; faltanMin: number };

/** Lo que hace cada llamada programada (cada minuto): seguir la corrida abierta, darla por cortada
 *  si lleva demasiado, abrir una nueva si la última empezó hace `cadaMin` o más, o no hacer nada. */
export function decidirTick(e: {
  enCurso: { inicio: string } | null;
  ultimaInicio: string | null;
  ahora: Date;
  cadaMin: number;
}): DecisionTick {
  const minDesde = (iso: string) => (e.ahora.getTime() - new Date(iso).getTime()) / 60_000;
  if (e.enCurso) return minDesde(e.enCurso.inicio) > HORAS_MAX_CORRIDA * 60 ? { decision: "cerrar_cortada" } : { decision: "avanzar" };
  if (!e.ultimaInicio) return { decision: "abrir" };
  const desde = minDesde(e.ultimaInicio);
  return desde >= e.cadaMin ? { decision: "abrir" } : { decision: "esperar", faltanMin: Math.ceil(e.cadaMin - desde) };
}
