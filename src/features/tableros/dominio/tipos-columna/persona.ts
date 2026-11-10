// Tipo "Persona": una o varias personas del directorio (tabla personas). Es la ÚNICA forma de
// ligar gente: reemplaza al "people" de Monday y a las relaciones con el Directorio RH.
// La columna con rol Responsable alimenta elementos.responsables ("solo lo mío").
import { definirTipo, esObjeto, listaUnica, partirTextoMonday } from "./tipo";

export interface ConfigPersona { multiple: boolean }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarValor(v: unknown, c: ConfigPersona): string[] | null {
  const ids = listaUnica(Array.isArray(v) ? v : [v]).filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase());
  const out = c.multiple ? ids : ids.slice(0, 1);
  return out.length ? out : null;
}

export const persona = definirTipo<string[], ConfigPersona>({
  clave: "persona",
  etiqueta: "Persona",
  icono: "👤",
  descripcion: "Una o varias personas del directorio.",
  config: {
    defecto: { multiple: true },
    validar: (c) => ({ multiple: !(esObjeto(c) && c.multiple === false) }),
  },
  valor: {
    validar: validarValor,
    texto: (v, _c, ctx) => v.map((id) => ctx?.nombrePersona?.(id) ?? "¿?").join(", "),
    comparar: (a, b) => a.join(",").localeCompare(b.join(",")),
    // Monday da los nombres ("Ana López, Luis Pérez"); se buscan en el directorio.
    desdeMonday: (t, c, ctx) => {
      const ids = partirTextoMonday(t).map((n) => ctx?.personaPorNombre?.(n)).filter((x): x is string => !!x);
      return validarValor(ids, c);
    },
  },
});
