// REGISTRO de tipos de columna. Para agregar un tipo nuevo: crea su módulo en esta carpeta
// (implementa TipoColumna, ver tipo.ts) y agrégalo a la lista. Para quitarlo: sácalo de la
// lista; las columnas que ya lo usan quedan "sin tipo" y sus datos se conservan.
// Los "calculados" (fórmula, espejo, archivo) los arma la app: ver dominio/calculos.ts.
import type { TipoColumna } from "./tipo";
import { formula } from "./formula";
import { espejo } from "./espejo";
import { relacion } from "./relacion";
import { archivo } from "./archivo";
import { autonumero } from "./autonumero";
import { creacion } from "./creacion";
import { texto } from "./texto";
import { numero } from "./numero";
import { fecha } from "./fecha";
import { timeline } from "./timeline";
import { status } from "./status";
import { dropdown } from "./dropdown";
import { persona } from "./persona";
import { checkbox } from "./checkbox";

export const TIPOS_COLUMNA = [
  texto, numero, fecha, timeline, status, dropdown, persona, checkbox, formula, espejo, relacion, archivo, autonumero, creacion,
] as TipoColumna[];

export const esCalculado = (tipo: string) => !!tipoColumna(tipo)?.calculado;
/** Lo pone la app (ID automático, fecha de creación): se guarda, pero no se edita a mano. */
export const esAutomatico = (tipo: string) => !!tipoColumna(tipo)?.automatico;
/** ¿Se puede editar a mano? (ni calculado ni automático) */
export const esEditable = (tipo: string) => !esCalculado(tipo) && !esAutomatico(tipo);

export function tipoColumna(clave: string): TipoColumna | undefined {
  return TIPOS_COLUMNA.find((t) => t.clave === clave);
}

export type { TipoColumna, ContextoValor } from "./tipo";
