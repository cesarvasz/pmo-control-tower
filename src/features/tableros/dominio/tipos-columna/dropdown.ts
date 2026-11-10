// Tipo "Lista": una o varias opciones de una lista fija. El valor guardado son ids de opción.
import { definirTipo, esObjeto, listaUnica, parseJson, partirTextoMonday } from "./tipo";

export interface OpcionLista { id: string; texto: string }
export interface ConfigDropdown { opciones: OpcionLista[]; multiple: boolean }

function validarConfig(c: unknown): ConfigDropdown {
  const o = esObjeto(c) ? c : {};
  const vistos = new Set<string>();
  const opciones: OpcionLista[] = [];
  for (const x of Array.isArray(o.opciones) ? o.opciones : []) {
    if (!esObjeto(x)) continue;
    const id = typeof x.id === "string" || typeof x.id === "number" ? String(x.id).trim() : "";
    const texto = typeof x.texto === "string" ? x.texto.trim().slice(0, 80) : "";
    if (id && texto && !vistos.has(id)) { vistos.add(id); opciones.push({ id, texto }); }
  }
  return { opciones, multiple: o.multiple !== false };
}

function validarValor(v: unknown, c: ConfigDropdown): string[] | null {
  const ids = listaUnica(Array.isArray(v) ? v : [v]).filter((id) => c.opciones.some((o) => o.id === id));
  const out = c.multiple ? ids : ids.slice(0, 1);
  return out.length ? out : null;
}

function textoValor(v: string[], c: ConfigDropdown): string {
  return v.map((id) => c.opciones.find((o) => o.id === id)?.texto ?? "").filter(Boolean).join(", ");
}

export const dropdown = definirTipo<string[], ConfigDropdown>({
  clave: "dropdown",
  etiqueta: "Lista",
  icono: "▾",
  descripcion: "Una o varias opciones de una lista fija.",
  config: {
    defecto: { opciones: [], multiple: true },
    validar: validarConfig,
    // {"labels":[{"id":1,"name":"PM"},…],"label_limit_count":1}
    desdeMonday: (s) => {
      const o = parseJson(s);
      const labels = esObjeto(o) && Array.isArray(o.labels) ? o.labels : [];
      return validarConfig({
        opciones: labels.map((l) => (esObjeto(l) ? { id: l.id, texto: l.name } : null)),
        multiple: !(esObjeto(o) && o.label_limit_count === 1),
      });
    },
  },
  valor: {
    validar: validarValor,
    texto: textoValor,
    comparar: (a, b, c) => textoValor(a, c).localeCompare(textoValor(b, c), "es"),
    desdeMonday: (t, c) => {
      const ids = partirTextoMonday(t)
        .map((s) => c.opciones.find((o) => o.texto.toLowerCase() === s.toLowerCase())?.id)
        .filter((x): x is string => !!x);
      return validarValor(ids, c);
    },
  },
});
