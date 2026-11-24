// SOLO SERVIDOR. Flujo «Nueva iniciativa»: crea Iniciativas en el tablero oficial con la MISMA operación que el pop-up
// «Nueva iniciativa» de la app (elemento.crear), con los mismos permisos: entra quien tiene la página Gestión de
// Iniciativas o Tableros completo; el PM es quien escribe (el Admin puede elegir a otro PM).

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { accesoDe, aColumna, aElemento, aGrupo, leerTableroFila, listarPersonasCorto, type Acceso } from "@/features/tableros/datos/tableros";
import { puedeEntrarATablero } from "@/features/tableros/datos/puerta";
import { ejecutarOperacion } from "@/features/tableros/datos/operaciones";
import { tableroDeIniciativas } from "@/features/tableros/datos/iniciativas-app";
import { ErrorTablero } from "@/features/tableros/datos/errores";
import { puede } from "@/features/tableros/dominio/permisos";
import { textoCelda, type Columna, type Tablero } from "@/features/tableros/dominio/tablero";
import { grupoInicialId, valoresDeAlta } from "@/features/tableros/dominio/formulario-alta";
import { camposDespues, camposQueLlena, columnasNuevaIni, sinOpciones, tituloCampo } from "@/features/tableros/dominio/nueva-iniciativa";
import { AvisoChat } from "../../nucleo/flujo";
import { MAX_OPCIONES, valoresDeTablero, type CampoChat, type Leidos, type Opcion } from "../../nucleo/formulario";

/** El nombre del campo del nombre de la iniciativa (no es una columna del tablero). */
export const CAMPO_NOMBRE = "nombre";

export interface ContextoIniciativa {
  me: AppUser;
  acceso: Acceso;
  tablero: Tablero;
  grupoId: string;
  columnas: Columna[];
  /** Los campos del formulario: el nombre primero, luego las columnas que le tocan. */
  campos: CampoChat[];
  /** Nombre del PM cuando es quien escribe (no Admin): se muestra arriba del formulario. */
  pmFijo: string | null;
}

/** ¿Puede crear iniciativas? (la misma puerta que la página Gestión de Iniciativas). */
export async function puedeCrearIniciativas(me: AppUser): Promise<boolean> {
  const id = await tableroDeIniciativas();
  return !!id && (await puedeEntrarATablero(me, id));
}

async function opcionesDeRelacion(c: Columna): Promise<Opcion[]> {
  const destino = (c.config as { tableroId?: string } | null)?.tableroId;
  if (!destino) return [];
  const filas = unwrap(await getSupabaseAdmin().from("elementos").select("id, nombre, orden")
    .eq("tablero_id", destino).is("parent_id", null).is("archivado_at", null).order("orden")) ?? [];
  return filas.map((f) => ({ valor: f.id, texto: f.nombre || "(sin nombre)" }));
}

const opcionesDeDropdown = (c: Columna): Opcion[] =>
  ((c.config as { opciones?: { id: string; texto: string }[] } | null)?.opciones ?? []).map((o) => ({ valor: o.id, texto: o.texto }));

function conLimite(titulo: string, opciones: Opcion[]): Opcion[] {
  // Google Chat no muestra más de 100 opciones; si se llega ahí hace falta cambiar a una lista con búsqueda (autocompletar).
  if (opciones.length > MAX_OPCIONES) throw new AvisoChat(`${titulo} tiene más de ${MAX_OPCIONES} opciones y Google Chat no las puede mostrar. Avísale al PMO.`);
  return opciones;
}

async function campoDe(c: Columna, seccion: CampoChat["seccion"], gente: Opcion[]): Promise<CampoChat> {
  const base = { nombre: c.id, etiqueta: tituloCampo(c), seccion, obligatorio: seccion === "datos" && !sinOpciones(c) };
  switch (c.tipo) {
    case "persona": return { ...base, tipo: "lista", opciones: gente };
    case "relacion": return { ...base, tipo: "lista", opciones: conLimite(base.etiqueta, await opcionesDeRelacion(c)) };
    case "dropdown": return { ...base, tipo: "lista", opciones: conLimite(base.etiqueta, opcionesDeDropdown(c)) };
    case "numero": return { ...base, tipo: "numero" };
    default: return { ...base, tipo: "texto" };
  }
}

/** A qué tablero va y qué campos le tocan a este usuario. Lanza AvisoChat si no puede crear iniciativas. */
export async function contextoIniciativa(me: AppUser): Promise<ContextoIniciativa> {
  const tableroId = await tableroDeIniciativas();
  if (!tableroId) throw new AvisoChat("No encontré el tablero de Iniciativas. Avísale al PMO.");
  if (!(await puedeEntrarATablero(me, tableroId))) throw new AvisoChat("Tu rol no puede crear iniciativas. Pide acceso al PMO.");
  const acceso = await accesoDe(me);
  const tablero = await leerTableroFila(tableroId);
  if (!tablero || !puede(acceso.usuario, "ver", tablero, acceso.reglas)) throw new AvisoChat("Tu rol no puede ver el tablero de Iniciativas.");

  const db = getSupabaseAdmin();
  const [filasCol, filasGrupo, personas] = await Promise.all([
    db.from("tablero_columnas").select("*").eq("tablero_id", tableroId).is("archivada_at", null).order("orden"),
    db.from("tablero_grupos").select("*").eq("tablero_id", tableroId).is("archivado_at", null).order("orden"),
    listarPersonasCorto(),
  ]);
  const columnas = (unwrap(filasCol) ?? []).map(aColumna);
  const grupoId = grupoInicialId(tablero.categoria, (unwrap(filasGrupo) ?? []).map(aGrupo));
  if (!grupoId) throw new AvisoChat("El tablero de Iniciativas no tiene grupos. Avísale al PMO.");

  const editable = (c: Columna) => puede(acceso.usuario, "editar_valor", tablero, acceso.reglas, { columna: c });
  const k = columnasNuevaIni(columnas);
  const esAdmin = acceso.usuario.esAdmin;
  const yo = acceso.usuario.personaId ? personas.find((p) => p.id === acceso.usuario.personaId) : undefined;
  if (!esAdmin && !yo) throw new AvisoChat("Tu cuenta no está ligada a una persona del Directorio, así que no puedo ponerte de PM. Pídele al PMO que la ligue.");
  const gente = conLimite("El Directorio (personas activas)", personas.filter((p) => p.activo !== false).map((p) => ({ valor: p.id, texto: p.nombre })));

  const campos: CampoChat[] = [{ nombre: CAMPO_NOMBRE, etiqueta: "Nombre de la iniciativa", tipo: "texto", obligatorio: true, seccion: "datos" }];
  for (const c of camposQueLlena(k)) {
    if (c.id === k.pm?.id && !esAdmin) continue; // el PM es quien escribe
    if (!editable(c)) continue;
    campos.push(await campoDe(c, "datos", gente));
  }
  for (const { columna, etiqueta } of camposDespues(k)) {
    if (!editable(columna)) continue;
    campos.push({ ...(await campoDe(columna, "despues", gente)), etiqueta, obligatorio: false });
  }
  return { me, acceso, tablero, grupoId, columnas, campos, pmFijo: esAdmin ? null : yo!.nombre };
}

/** Crea la iniciativa (status New, grupo Nuevas Iniciativas, PM = quien escribe si no es Admin). Devuelve su Ini ID y nombre. */
export async function crearIniciativa(ctx: ContextoIniciativa, leidos: Leidos): Promise<{ id: string; iniId: string; nombre: string }> {
  const k = columnasNuevaIni(ctx.columnas);
  const columnasDelForm = ctx.campos.filter((c) => c.nombre !== CAMPO_NOMBRE);
  const valores: Record<string, unknown> = { ...valoresDeAlta(ctx.tablero.categoria, ctx.columnas), ...valoresDeTablero(columnasDelForm, leidos) };
  const yo = ctx.acceso.usuario.personaId;
  const pmEditable = k.pm && puede(ctx.acceso.usuario, "editar_valor", ctx.tablero, ctx.acceso.reglas, { columna: k.pm });
  // Sin «editar» en la columna PM, «solo lo mío» de elemento.crear ya lo pone de responsable.
  if (!ctx.acceso.usuario.esAdmin && k.pm && yo && pmEditable) valores[k.pm.id] = [yo];
  const nombre = leidos[CAMPO_NOMBRE];
  let res: { id: string };
  try {
    res = (await ejecutarOperacion(ctx.me, ctx.acceso, ctx.tablero, { op: "elemento.crear", grupoId: ctx.grupoId, nombre, valores })) as { id: string };
  } catch (e) {
    if (e instanceof ErrorTablero) throw new AvisoChat(e.message);
    throw e;
  }
  const fila = unwrap(await getSupabaseAdmin().from("elementos").select("*").eq("id", res.id).maybeSingle());
  const iniId = fila && k.iniId ? textoCelda(k.iniId, aElemento(fila).valores[k.iniId.id]) : "";
  return { id: res.id, iniId, nombre };
}
