// src/lib/supabase-admin.ts
// SOLO SERVIDOR. Cliente de Supabase con la SECRET key (rol service_role): es el único que
// puede leer y escribir las tablas (todas tienen RLS sin políticas y sin permisos para
// anon/authenticated). Nunca importar desde un componente "use client".

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

export function getSupabaseAdmin(): Db {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase sin configurar: define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local");
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

/** Códigos de Postgres que el código de dominio necesita distinguir. */
export const PG = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
} as const;

/** Error de PostgREST/Postgres → Error de JS. Las funciones de la BD lanzan códigos de dominio
 *  ('already-answered', 'group-not-found'…) como mensaje, que api-errors.ts ya sabe traducir. */
export class DbError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DbError";
  }
}

export function fail(error: PostgrestError): never {
  throw new DbError(error.code, error.message);
}

type Respuesta = { data: unknown; error: PostgrestError | null };

/** Desenvuelve { data, error } de supabase-js: lanza si hubo error. Genérico sobre la respuesta
 *  completa porque supabase-js la tipa como unión ({data: Fila} | {data: null}). */
export function unwrap<R extends Respuesta>(res: R): R["data"] {
  if (res.error) fail(res.error);
  return res.data;
}

/** Como unwrap, para `.single()`: la fila tiene que existir. */
export function unwrapOne<R extends Respuesta>(res: R): NonNullable<R["data"]> {
  const data = unwrap(res);
  if (data == null) throw new Error("db-row-missing");
  return data as NonNullable<R["data"]>;
}

const PAGINA = 1000; // el máximo de filas que PostgREST devuelve por consulta

/**
 * Lee TODAS las filas de una consulta, de PAGINA en PAGINA. PostgREST corta en 1000 sin avisar,
 * así que cualquier tabla que pueda crecer (baselines, encuestas, atribuciones…) se lee con esto.
 * `consulta(desde, hasta)` debe ordenar por una columna única para que el paginado sea estable.
 */
export async function selectAll<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) fail(error);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}

/** Parte una lista en trozos (para filtros `.in()` largos, que van en la URL). */
export function enTrozos<T>(lista: T[], tam: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}
