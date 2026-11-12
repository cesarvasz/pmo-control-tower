// Tipo "Archivo": documentos del elemento (guardados en Supabase Storage, tabla elemento_archivos).
// El valor son los archivos subidos a esa columna: lo arma la app, no se edita como texto.
import { definirTipo, listaUnica } from "./tipo";

export const archivo = definirTipo<string[], Record<string, never>>({
  clave: "archivo",
  etiqueta: "Archivo",
  icono: "📎",
  descripcion: "Documentos adjuntos (PDF, imágenes…), hasta 50 MB cada uno.",
  calculado: true,
  config: { defecto: {}, validar: () => ({}) },
  valor: {
    validar: (v) => { const ids = listaUnica(v); return ids.length ? ids : null; },
    texto: (v, _c, ctx) => v.map((id) => ctx?.nombreArchivo?.(id) ?? "archivo").join(", "),
    comparar: (a, b) => a.length - b.length,
  },
});
