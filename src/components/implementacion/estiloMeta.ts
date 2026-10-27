// Estilo de las columnas de META (Vol, CM1 por file y Total = Vol × CM1) de
// Implementación. Se usa igual en la tabla por cliente y en el popup de metas, para que
// se reconozcan de un vistazo y no se confundan con las columnas que salen de la hoja
// (Vol., Profit, % Meta): fondo con un tinte del color de acento, texto en acento y una
// línea gruesa a cada lado del bloque.

export const META_FONDO = "color-mix(in srgb, var(--accent) 12%, var(--bg-surface))";
export const META_FONDO_ENCABEZADO = "color-mix(in srgb, var(--accent) 26%, var(--table-head-bg))";
export const META_BORDE = "2px solid var(--accent)";
export const META_TEXTO = "var(--accent-light)";
