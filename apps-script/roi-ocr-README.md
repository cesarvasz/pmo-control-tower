# Apps Script — ROI Digitalización OCR (pestaña "009")

Expone en **solo lectura** la pestaña `009` de **un archivo de Google Sheets
distinto al de 003 y al de Clonación**, para que la app la muestre en la pestaña
**"Digitalización OCR"** de la página ROI. Fuente independiente de 003 y de
Clonación — su propio archivo de origen, su propio Apps Script, su propia
variable de entorno, su propio endpoint y su propio caché. No comparte código
con `roi-log.gs` a propósito.

Una fila de la pestaña `009` = un expediente. La app mide dos tiempos por file,
en ventana hábil L–V 08:00–18:00 corrido:

1. **T1 = `Creacion` → `Digit_docs`** — digitalización de documentos.
2. **T2 = `Digit_docs` → `Digit_carta_licencia`** — digitalización de la carta de
   licencia.

Y muestra su promedio / mediana / P90 en el tiempo y por cliente.

## Archivos de este folder

- [`roi-ocr.gs`](./roi-ocr.gs) — todo el código para pegar en Apps Script.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto**.
2. Pega el contenido de [`roi-ocr.gs`](./roi-ocr.gs) en un archivo `.gs`.
3. **Configuración (⚙️) → Propiedades del script**, agrega:
   - `OCR_SHEET_ID` = el ID del archivo de Google Sheets de la digitalización OCR
     (de su URL: `.../spreadsheets/d/<ESTE_ID>/edit`). **NO es el mismo archivo
     que 003 ni que Clonación** — son tres archivos distintos.
4. **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo.
   - **Quién tiene acceso:** **Cualquier persona** (NO "Cualquier persona de
     c807.com"). Con la opción del dominio, la URL queda como
     `https://script.google.com/a/macros/c807.com/s/…/exec` y el servidor de la
     app **no puede leerla** (Google la intercepta con un login) → la pestaña da
     error 500. La URL correcta es `https://script.google.com/macros/s/…/exec`.
5. Copia la **URL de la aplicación web** y pégala en `.env.local` de la app como
   `ROI_OCR_WEBAPP_URL=...`.
6. Ejecuta **`instalarDisparador()`** desde el editor (ver abajo). Sin este paso
   el reporte falla de forma intermitente. Pide autorizar acceso a Drive.
7. **Reinicia `npm run dev`** — Next.js solo lee `.env.local` al arrancar.

> Cada vez que redepliegues cambios del `.gs`, usa **Administrar implementaciones
> → Editar → Nueva versión** para conservar la misma URL.

## Columnas esperadas en la pestaña "009"

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | entero | id interno |
| `c807_file` | texto | identificador del file, ej. `GT-2026-99641`. Llave de negocio (sin duplicados) |
| `Embarque` | texto | tipo de embarque |
| `Cliente` | texto | nombre del cliente |
| `Creacion` | fecha-hora | creación del file |
| `Digit_docs` | fecha-hora | digitalización de documentos (puede venir vacía) |
| `Digit_carta_licencia` | fecha-hora | digitalización de la carta de licencia (puede venir vacía) |

Los dos hitos de digitalización pueden estar vacíos si el file aún está en
proceso — la app calcula T1 / T2 solo cuando ambos extremos existen.

## El payload va codificado, no en filas crudas

Mismo esquema que `roi-log.gs` / `roi-clonacion.gs`:

```
{ epoca, libres, textos, fechas, dicc: {columna: [valores únicos]}, filas: [[...]] }
```

`c807_file`, `Cliente` y `Embarque` van por diccionario (se repiten mucho).
`Creacion`, `Digit_docs` y `Digit_carta_licencia` van como segundos desde una
época (null si el hito no ocurrió). `id` va como texto libre.

**Todas las reglas de negocio** (ventana hábil L–V 08:00–18:00 corrido, cálculo
de T1 / T2, estadística) se calculan en la app, en `src/lib/ocrHabil.ts` +
`src/lib/digitalizacion.ts` — este script, como los otros, es solo codificación
de transporte: no escribe nada en la hoja.

## El caché en Drive (obligatorio)

**Ejecuta `instalarDisparador()` una vez desde el editor.** Crea un disparador
que cada 30 minutos deja el JSON armado en un archivo de Drive
(`roi-ocr-cache.json`), y llena el caché de inmediato.

- **`medirDoGet()`** — comprueba que el caché existe y cuánto tarda en servirse.
- **`regenerarCache()`** — refresca a mano, sin esperar al disparador.
- **`diagnosticarCache()`** — qué hay realmente en el archivo de caché.
- **`diagnosticarHoja()`** — por qué la app no muestra datos: ¿está el
  `OCR_SHEET_ID`, existe la pestaña `009`, cuántas filas trae?
- **`verificarFechas()`** — confirma que la codificación de fechas da la vuelta exacta.

## Notas

- Lee siempre la pestaña `009` (variable `SHEET_TAB` en el script) — si cambia de
  nombre, actualízalo ahí.
- El `doGet` es de solo lectura: no escribe nada en la hoja.
- Si se agrega una columna nueva, el `doGet` ya la expone (lee los encabezados
  dinámicamente). Para usarla en el reporte hay que declararla en
  `src/types/index.ts` → `OcrRow`; si es fecha o texto muy repetido, agrégala
  además a `COLS_FECHA` / `COLS_TEXTO` del script para que se comprima.
