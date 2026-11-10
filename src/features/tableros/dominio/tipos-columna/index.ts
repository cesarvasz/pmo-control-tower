// REGISTRO de tipos de columna. Para agregar un tipo nuevo: crea su módulo en esta carpeta
// (implementa TipoColumna, ver tipo.ts) y agrégalo a la lista. Para quitarlo: sácalo de la
// lista; las columnas que ya lo usan quedan "sin tipo" y sus datos se conservan.
// Próximos (fases 1–3): email, archivo, fórmula, relación, espejo, id automático…
import type { TipoColumna } from "./tipo";
import { texto } from "./texto";
import { numero } from "./numero";
import { fecha } from "./fecha";
import { timeline } from "./timeline";
import { status } from "./status";
import { dropdown } from "./dropdown";
import { persona } from "./persona";
import { checkbox } from "./checkbox";

export const TIPOS_COLUMNA = [texto, numero, fecha, timeline, status, dropdown, persona, checkbox] as TipoColumna[];

export function tipoColumna(clave: string): TipoColumna | undefined {
  return TIPOS_COLUMNA.find((t) => t.clave === clave);
}

export type { TipoColumna, ContextoValor } from "./tipo";
