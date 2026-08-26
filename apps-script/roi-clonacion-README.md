# Apps Script — ROI Clonación de Files

Expone en **solo lectura** la pestaña `clonacion` del archivo de Google Sheets
**"Clonacion files"** (un archivo DISTINTO al de la hoja ROI de 003) para que
la app la muestre en la pestaña **"Clonación de Files"** de la página ROI.
Fuente independiente de 003 — su propio archivo de origen, su propio Apps
Script, su propia variable de entorno, su propio endpoint. No comparte código
con `roi-log.gs` a propósito.

## Archivos de este folder

- [`roi-clonacion.gs`](./roi-clonacion.gs) — todo el código para pegar en Apps Script.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto**.
2. Pega el contenido de [`roi-clonacion.gs`](./roi-clonacion.gs) en un archivo `.gs`.
3. **Configuración (⚙️) → Propiedades del script**, agrega:
   - `CLONACION_SHEET_ID` = el ID del archivo **"Clonacion files"** (de su URL:
     `.../spreadsheets/d/<ESTE_ID>/edit`). **No es el mismo ID que usa 003** —
     son archivos distintos.
4. **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo.
   - **Quién tiene acceso:** cualquier persona con el enlace.
5. Copia la **URL de la aplicación web** y pégala en `.env.local` de la app como
   `ROI_CLONACION_WEBAPP_URL=...`.
6. Ejecuta **`instalarDisparador()`** desde el editor (ver abajo). Sin este paso
   el reporte falla de forma intermitente. Pide autorizar acceso a Drive.
7. **Reinicia `npm run dev`** — Next.js solo lee `.env.local` al arrancar, así
   que si el servidor ya estaba corriendo cuando agregaste la variable, no la
   va a ver hasta que lo reinicies.

> Cada vez que redepliegues cambios del `.gs`, usa **Administrar implementaciones
> → Editar → Nueva versión** para conservar la misma URL.

## Columnas esperadas en la pestaña "clonacion"

| Columna | Tipo |
|---|---|
| `c807_file` | texto |
| `Solicitud_fecha` | fecha-hora |
| `Fecha` | fecha-hora (no se usa en la app, pero se codifica igual) |
| `Creacion_Fecha` | fecha-hora |
| `Usuario` | texto |
| `Cliente` | texto |

Una fila = una clonación. Un mismo `c807_file` puede repetirse — el script no
deduplica ni agrupa nada, igual que con 003.

## El payload va codificado, no en filas crudas

Mismo esquema que `roi-log.gs`:

```
{ epoca, libres, textos, fechas, dicc: {columna: [valores únicos]}, filas: [[...]] }
```

`c807_file`, `Usuario` y `Cliente` van por diccionario (se repiten mucho:
~80 usuarios, ~280 clientes). `Solicitud_fecha`, `Creacion_Fecha` y `Fecha`
van como segundos desde una época, igual que las fechas de 003.

**Todas las reglas de negocio (minutos hábiles, tiempo hábil, anómalo, días de
antigüedad, costo) se calculan en la app**, en `src/lib/clonaciones.ts` — este
script, como `roi-log.gs`, es solo codificación de transporte: no escribe nada
en la hoja.

## El caché en Drive (obligatorio)

**Ejecuta `instalarDisparador()` una vez desde el editor.** Crea un disparador
que cada 30 minutos deja el JSON armado en un archivo de Drive
(`roi-clonacion-cache.json`), y llena el caché de inmediato.

- **`medirDoGet()`** — comprueba que el caché existe y cuánto tarda en servirse.
- **`regenerarCache()`** — refresca a mano, sin esperar al disparador.
- **`diagnosticarCache()`** — qué hay realmente en el archivo de caché.
- **`diagnosticarHoja()`** — por qué la app no muestra datos: ¿está el
  `CLONACION_SHEET_ID`, existe la pestaña `clonacion`, cuántas filas trae?
- **`verificarFechas()`** — confirma que la codificación de fechas da la vuelta exacta.

## Notas

- Lee siempre la pestaña `clonacion` (variable `SHEET_TAB` en el script) — si
  la pestaña cambia de nombre, actualízalo ahí.
- Lee siempre el archivo apuntado por `CLONACION_SHEET_ID` — si el archivo
  "Clonacion files" se mueve o se recrea, actualiza esa Script Property.
- El `doGet` es de solo lectura: no escribe nada en la hoja.
- Si se agrega una columna nueva, el `doGet` ya la expone (lee los encabezados
  dinámicamente). Para usarla en el reporte hay que declararla en
  `src/types/index.ts` → `ClonacionRow`; si es fecha o texto muy repetido,
  agrégala además a `COLS_FECHA` / `COLS_TEXTO` del script para que se comprima.
