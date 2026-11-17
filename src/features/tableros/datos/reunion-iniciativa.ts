// SOLO SERVIDOR. De un elemento del tablero de Iniciativas saca lo que hace falta para agendar su reunión (Ini ID, nombre, qué
// reunión toca) y decide si el usuario puede. Todo sale de la base: el cliente solo dice QUÉ iniciativa, nunca su código, su
// tipo ni su PM.

import type { AppUser } from "@/lib/permissions";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { TipoReunion } from "@/lib/reunionesRows";
import { textoCelda } from "../dominio/tablero";
import { tipoColumna } from "../dominio/tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "../dominio/tipos-columna/status";
import { columnasNuevaIni } from "../dominio/nueva-iniciativa";
import { puedeAgendarIniciativa, reunionQueToca } from "../dominio/reunion-iniciativa";
import { aColumna, aElemento } from "./tableros";
import { usuarioTableros } from "./puerta";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IniciativaAgendable { elementoId: string; codigo: string; nombre: string; tipo: TipoReunion }

/**
 * Valida que `elementoId` sea una iniciativa a la que le toca una reunión y que `me` pueda agendarla.
 * Errores: «reunion-iniciativa-no-encontrada», «reunion-etapa-invalida» (ya no le toca agendar), «forbidden».
 */
export async function iniciativaAgendable(elementoId: string, me: AppUser): Promise<IniciativaAgendable> {
  if (!UUID_RE.test(elementoId)) throw new Error("reunion-iniciativa-no-encontrada");
  const db = getSupabaseAdmin();
  const fila = unwrap(await db.from("elementos").select("*").eq("id", elementoId).is("archivado_at", null).is("parent_id", null).maybeSingle());
  if (!fila) throw new Error("reunion-iniciativa-no-encontrada");
  const e = aElemento(fila);
  const columnas = (unwrap(await db.from("tablero_columnas").select("*").eq("tablero_id", fila.tablero_id).is("archivada_at", null)) ?? []).map(aColumna);
  const k = columnasNuevaIni(columnas);
  if (!k.iniId || !k.status) throw new Error("reunion-iniciativa-no-encontrada"); // no es un tablero de Iniciativas

  const codigo = textoCelda(k.iniId, e.valores[k.iniId.id]).trim();
  if (!/^IN-[0-9]+$/.test(codigo)) throw new Error("reunion-iniciativa-no-encontrada");
  const config = tipoColumna("status")!.config.validar(k.status.config) as ConfigStatus;
  const v = e.valores[k.status.id];
  const tipo = reunionQueToca(typeof v === "string" ? etiquetaStatus(config, v)?.texto ?? null : null);
  if (!tipo) throw new Error("reunion-etapa-invalida");

  const u = await usuarioTableros(me);
  if (!puedeAgendarIniciativa(u, k.pm ? e.valores[k.pm.id] : null)) throw new Error("forbidden");
  return { elementoId: e.id, codigo, nombre: e.nombre, tipo };
}
