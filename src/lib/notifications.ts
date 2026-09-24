// src/lib/notifications.ts
// Campanita de notificaciones del Topbar: "qué hay que hacer hoy", por PM,
// usando las fechas límite YA calculadas de los 3 boards (Iniciativas, PML,
// Proyectos — items y sus hitos/subitems). Función pura sobre DashboardData,
// sin red ni DOM — fácil de testear con fixtures.
//
// Pedido del usuario: 3 pestañas por rango de fecha, SOLO lo pendiente — lo
// ya marcado Done/Cerrado NUNCA se muestra, en ninguna pestaña ("no muestres
// los que estan Done en las notificaciones") —
//  · "atras"    (hoy-3 .. hoy-1): sigue atrasado, sin cerrarse.
//  · "hoy"      (== hoy): vence hoy.
//  · "adelante" (hoy+1 .. hoy+3): vence pronto.

import { today } from "@/lib/business";
import { splitBoardName } from "@/lib/proj";
import type { DashboardData, DirectorioEntry } from "@/types";

export type TodoBoardLabel = "Iniciativas" | "PML" | "Proyectos";

export interface TodoNotification {
  key: string;
  board: TodoBoardLabel;
  name: string;
  context?: string; // proyecto/item padre — solo hitos de Proyectos lo usan
  status: string;
  date: Date;
  href: string;
}

export interface TodoBuckets {
  atras: TodoNotification[];
  hoy: TodoNotification[];
  adelante: TodoNotification[];
}

export interface MeIdentity {
  email: string;
  displayName: string;
}

/** ¿Alguno de los nombres en `pmText` (columna PM — puede traer varias
 *  personas separadas por coma) es el usuario logueado? El login no da un
 *  nombre confiable (el displayName de Firebase puede venir vacío o no
 *  calzar con Monday) — por eso el email de la sesión se resuelve PRIMERO a
 *  un nombre real vía el Directorio RH, y ES ESE nombre el que se compara
 *  contra los de `pmText`. Solo si el email no aparece en el directorio
 *  (ej. una cuenta que no es un "recurso" de RH) cae a comparar directo
 *  contra el displayName, como último recurso. */
function isMe(pmText: string, me: MeIdentity, directorio: DirectorioEntry[]): boolean {
  if (!pmText) return false;
  const meEmail = me.email.trim().toLowerCase();
  const entry = directorio.find((d) => d.email.trim().toLowerCase() === meEmail);
  const meName = (entry?.name ?? me.displayName).trim().toLowerCase();
  if (!meName) return false;
  return pmText.split(",").some((raw) => raw.trim().toLowerCase() === meName);
}

const DAY_MS = 86400000;

/** Diferencia en días calendario entre `date` y `anchor` (ambos a medianoche). */
function dayOffset(date: Date, anchor: Date): number {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - anchor.getTime()) / DAY_MS);
}

function bucketOf(offset: number): keyof TodoBuckets | null {
  if (offset >= -3 && offset <= -1) return "atras";
  if (offset === 0) return "hoy";
  if (offset >= 1 && offset <= 3) return "adelante";
  return null;
}

export function buildTodoNotifications(data: DashboardData, me: MeIdentity, now: Date = today()): TodoBuckets {
  const anchor = new Date(now); anchor.setHours(0, 0, 0, 0);
  const buckets: TodoBuckets = { atras: [], hoy: [], adelante: [] };
  const { directorio } = data;

  const add = (n: TodoNotification) => {
    const bucket = bucketOf(dayOffset(n.date, anchor));
    if (bucket) buckets[bucket].push(n);
  };

  for (const it of data.ini) {
    if (!it.deadline || !isMe(it.pm, me, directorio)) continue;
    add({
      key: `ini-${it.id}`, board: "Iniciativas", name: it.name, status: it.status,
      date: it.deadline, href: `/iniciativas?pm=${encodeURIComponent(it.pm)}`,
    });
  }

  for (const it of data.req) {
    if (!it.deadline || it.estado === "CERRADO" || !isMe(it.pm, me, directorio)) continue;
    add({
      key: `req-${it.id}`, board: "PML", name: it.name, status: it.status,
      date: it.deadline, href: `/req?pm=${encodeURIComponent(it.pm)}`,
    });
  }

  // El PM de Proyectos vive de forma confiable a nivel de BOARD (ProjBoard.pm,
  // ya enriquecido por projEnrichBoards) — no en el item: en 13 de los 14
  // boards reales, la columna "PM" viene vacía en TODOS los items (el dato
  // real está en "Resp"/"Responsible", que es de donde board.pm ya lo saca).
  // Si `it.pm` sí trae algo (el único board donde Monday la llena por fila),
  // se prioriza por ser más específico.
  const boardPmById = new Map(data.projBoards.map((b) => [b.id, b.pm]));

  for (const it of data.proj) {
    const pm = it.pm || boardPmById.get(it.boardId) || "";
    if (!isMe(pm, me, directorio)) continue;
    const { name: projectName } = splitBoardName(it.boardName);
    if (it.deadline && it.status !== "Done") {
      add({
        key: `proj-${it.id}`, board: "Proyectos", name: it.name, context: projectName,
        status: it.status, date: it.deadline, href: "/proyectos",
      });
    }
    for (const s of it.subitems) {
      if (!s.deadline || s.status === "Done") continue;
      add({
        key: `proj-hito-${s.id}`, board: "Proyectos", name: s.name, context: `${projectName} · ${it.name}`,
        status: s.status, date: s.deadline, href: "/proyectos",
      });
    }
  }

  const byDate = (a: TodoNotification, b: TodoNotification) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name);
  buckets.atras.sort(byDate);
  buckets.hoy.sort(byDate);
  buckets.adelante.sort(byDate);
  return buckets;
}
