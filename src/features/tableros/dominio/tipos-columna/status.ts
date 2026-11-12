// Tipo "Status": una etiqueta de una lista; cada etiqueta pertenece a una CATEGORÍA (hecho, en
// curso, atascado…) que es lo que leen las métricas. El valor guardado es el id de la etiqueta,
// así renombrar una etiqueta no toca los datos.
import { CATEGORIA_STATUS_DEFECTO, categoriaDeTextoMonday, categoriaStatus } from "../estados";
import { definirTipo, esObjeto, parseJson } from "./tipo";

export interface EtiquetaStatus { id: string; texto: string; color: string; categoria: string }
export interface ConfigStatus { etiquetas: EtiquetaStatus[] }

function normalizarEtiqueta(e: unknown): EtiquetaStatus | null {
  if (!esObjeto(e)) return null;
  const id = typeof e.id === "string" || typeof e.id === "number" ? String(e.id).trim() : "";
  const texto = typeof e.texto === "string" ? e.texto.trim().slice(0, 60) : "";
  if (!id || !texto) return null;
  const categoria = typeof e.categoria === "string" && categoriaStatus(e.categoria) ? e.categoria : CATEGORIA_STATUS_DEFECTO;
  const color = typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : categoriaStatus(categoria)!.color;
  return { id, texto, color, categoria };
}

export function etiquetaStatus(c: ConfigStatus, id: string): EtiquetaStatus | undefined {
  return c.etiquetas.find((e) => e.id === id);
}

function validarConfig(c: unknown): ConfigStatus {
  const lista = esObjeto(c) && Array.isArray(c.etiquetas) ? c.etiquetas : [];
  const vistos = new Set<string>();
  const etiquetas: EtiquetaStatus[] = [];
  for (const e of lista) {
    const n = normalizarEtiqueta(e);
    if (n && !vistos.has(n.id)) { vistos.add(n.id); etiquetas.push(n); }
  }
  return { etiquetas };
}

export const status = definirTipo<string, ConfigStatus>({
  clave: "status",
  etiqueta: "Status",
  icono: "◉",
  descripcion: "Una etiqueta de color; cada etiqueta cae en una categoría que leen las métricas.",
  config: {
    defecto: {
      etiquetas: [
        { id: "1", texto: "En curso", color: "#fdab3d", categoria: "en_curso" },
        { id: "2", texto: "Atascado", color: "#e2445c", categoria: "atascado" },
        { id: "3", texto: "Listo", color: "#00c875", categoria: "hecho" },
      ],
    },
    validar: validarConfig,
    // {"labels":{"0":"Working on it",…},"labels_colors":{"0":{"color":"#fdab3d"}},"labels_positions_v2":{"0":2,…}}
    desdeMonday: (s) => {
      const o = parseJson(s);
      if (!esObjeto(o) || !esObjeto(o.labels)) return { etiquetas: [] };
      const colores = esObjeto(o.labels_colors) ? o.labels_colors : {};
      const pos = esObjeto(o.labels_positions_v2) ? o.labels_positions_v2 : {};
      const etiquetas = Object.entries(o.labels)
        .filter(([, t]) => typeof t === "string" && t.trim())
        .map(([id, t]) => {
          const col = colores[id];
          const color = esObjeto(col) && typeof col.color === "string" ? col.color : undefined;
          return { id, texto: String(t).trim(), color, categoria: categoriaDeTextoMonday(String(t)) };
        })
        .sort((a, b) => (Number(pos[a.id] ?? 99) - Number(pos[b.id] ?? 99)) || Number(a.id) - Number(b.id));
      return validarConfig({ etiquetas });
    },
  },
  valor: {
    validar: (v, c) => {
      const id = typeof v === "string" || typeof v === "number" ? String(v) : "";
      return etiquetaStatus(c, id) ? id : null;
    },
    texto: (v, c) => etiquetaStatus(c, v)?.texto ?? "",
    // Ordena según el orden de las etiquetas en la config.
    comparar: (a, b, c) => c.etiquetas.findIndex((e) => e.id === a) - c.etiquetas.findIndex((e) => e.id === b),
    desdeMonday: (t, c) => {
      const s = (t ?? "").trim().toLowerCase();
      return s ? c.etiquetas.find((e) => e.texto.toLowerCase() === s)?.id ?? null : null;
    },
  },
});
