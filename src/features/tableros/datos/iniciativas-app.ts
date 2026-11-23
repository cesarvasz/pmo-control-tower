// SOLO SERVIDOR. Iniciativas como parte de la app (fuera de /tableros):
//  · tableroDeIniciativas(): cuál es EL tablero oficial de Iniciativas (el traído del board de Monday).
//  · iniciativasParaRecordatorios(): lo que necesita el Apps Script de «Sin Valor Def» para mandar sus correos, leído del
//    tablero en vez de Monday (status, Ini ID, En Espera, PKU, CKU y PM con sus correos del directorio).

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import { tipoColumna } from "../dominio/tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "../dominio/tipos-columna/status";
import { textoCelda } from "../dominio/tablero";
import { columnasNuevaIni } from "../dominio/nueva-iniciativa";
import { leerTablero, listarPersonasCorto, type Acceso } from "./tableros";

const ACCESO_SISTEMA: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

/** Id del tablero oficial de Iniciativas: el ligado al board de Monday de Iniciativas (si hubiera más, el primero). null = no hay. */
export async function tableroDeIniciativas(): Promise<string | null> {
  const filas = unwrap(await getSupabaseAdmin().from("tableros").select("id, monday_board_id, creado_at")
    .eq("categoria", "iniciativas").is("archivado_at", null).order("creado_at")) ?? [];
  const ini = process.env.MONDAY_INI_BOARD_ID;
  return (filas.find((f) => ini && f.monday_board_id === ini) ?? filas.find((f) => f.monday_board_id) ?? filas[0])?.id ?? null;
}

/** Una iniciativa como la necesita el correo de «Sin Valor Def». */
export interface IniciativaRecordatorio {
  /** Llave del registro de envíos: el id del item de Monday si vino de allá (así sigue el conteo de antes); si no, el de la app. */
  id: string;
  iniId: string;
  nombre: string;
  status: string;
  /** Fecha «En Espera», AAAA-MM-DD (vacío si no tiene). */
  espera: string;
  pku: boolean;
  ckuEmail: string;
  ckuNombre: string;
  pmNombre: string;
  /** Correos del PM (para el CC), separados por coma. */
  pmEmails: string;
}

export async function iniciativasParaRecordatorios(): Promise<IniciativaRecordatorio[]> {
  const id = await tableroDeIniciativas();
  if (!id) return [];
  const [t, personas] = await Promise.all([leerTablero(id, ACCESO_SISTEMA), listarPersonasCorto()]);
  if (!t) return [];
  const porId = new Map(personas.map((p) => [p.id, p]));
  const k = columnasNuevaIni(t.columnas);
  const configStatus = k.status ? (tipoColumna("status")!.config.validar(k.status.config) as ConfigStatus) : null;
  const gente = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => porId.get(String(x))).filter((p): p is NonNullable<typeof p> => !!p);

  return t.elementos.filter((e) => !e.parentId).map((e) => {
    const v = (c: { id: string } | undefined) => (c ? e.valores[c.id] : undefined);
    const st = v(k.status);
    const cku = gente(v(k.cku)), pm = gente(v(k.pm));
    return {
      id: e.mondayItemId ?? e.id,
      iniId: k.iniId ? textoCelda(k.iniId, v(k.iniId)) : "",
      nombre: e.nombre,
      status: configStatus && typeof st === "string" ? etiquetaStatus(configStatus, st)?.texto ?? "" : "",
      espera: typeof v(k.espera) === "string" ? String(v(k.espera)).slice(0, 10) : "",
      pku: v(k.pku) === true,
      ckuEmail: cku.map((p) => p.email).filter(Boolean).join(","),
      ckuNombre: cku.map((p) => p.nombre).join(", "),
      pmNombre: pm.map((p) => p.nombre).join(", "),
      pmEmails: [...new Set(pm.map((p) => p.email).filter(Boolean))].join(","),
    };
  });
}
