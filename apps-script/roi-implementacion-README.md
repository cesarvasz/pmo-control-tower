# Apps Script — ROI Implementación

Expone en **solo lectura** la pestaña `implementacion` del archivo de Google
Sheets **"Clonacion files"** (el mismo archivo de la pestaña `clonacion`, pero
otra pestaña) para que la app la muestre en la pestaña **"Implementación"** de
la página ROI. Fuente independiente de Clonación y de 003 — aunque comparta
archivo de origen con Clonación, tiene su propio proyecto de Apps Script, su
propia variable de entorno y su propio endpoint. No comparte código con
`roi-clonacion.gs` ni con `roi-log.gs` a propósito.

## Archivos de este folder

- [`roi-implementacion.gs`](./roi-implementacion.gs) — todo el código para pegar en Apps Script.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto** (uno NUEVO; no pegues
   esto en el proyecto de Clonación).
2. Pega el contenido de [`roi-implementacion.gs`](./roi-implementacion.gs) en un archivo `.gs`.
3. **Configuración (⚙️) → Propiedades del script**, agrega:
   - `IMPLEMENTACION_SHEET_ID` = el ID del archivo **"Clonacion files"** (de su URL:
     `.../spreadsheets/d/<ESTE_ID>/edit`). Es **el mismo valor** que ya pusiste
     como `CLONACION_SHEET_ID` en el script de Clonación.
4. **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo.
   - **Quién tiene acceso:** cualquier persona con el enlace.
5. Copia la **URL de la aplicación web** y pégala en `.env.local` de la app como
   `ROI_IMPLEMENTACION_WEBAPP_URL=...` — **y también en las variables de entorno
   de Vercel**, o la pestaña funcionará en local y fallará en producción.
6. Ejecuta **`instalarDisparador()`** desde el editor (ver abajo). Sin este paso
   el reporte falla de forma intermitente. Pide autorizar acceso a Drive y a
   Google Sheets.
7. **Reinicia `npm run dev`** — Next.js solo lee `.env.local` al arrancar, así
   que si el servidor ya estaba corriendo cuando agregaste la variable, no la
   va a ver hasta que lo reinicies.

> Cada vez que redepliegues cambios del `.gs`, usa **Administrar implementaciones
> → Editar → Nueva versión** para conservar la misma URL.

## Columnas esperadas en la pestaña "implementacion"

| Columna | Tipo |
|---|---|
| `File` | texto |
| `Fecha` | fecha (o fecha-hora) |
| `Cliente` | texto |
| `Usuario` | texto |
| `ingresos_facturados` | número |
| `egresos_liquidados` | número |
| `Profit` | número |

- `Fecha` debe ser una fecha real de Google Sheets, o texto `yyyy-MM-dd` /
  `yyyy-MM-dd HH:mm:ss`. Un texto en otro formato (p. ej. `05/01/2026`) no se
  reconoce y la fecha llega vacía — `medirTiempo()` lo delata con `⚠ Fecha: 0 (0.0%)`.
- Los números pueden venir con formato de moneda en la hoja; lo que importa es
  que la celda sea numérica. Si alguna viene como texto (`"Q1,234.50"`, `"$1,234.50"`,
  `"(500)"`), la app también la interpreta.
- `Profit` se muestra tal como está en la hoja; la app **no** lo recalcula.

Una fila = un registro de la pestaña. El script no deduplica ni agrupa nada,
igual que con Clonación y 003. La única excepción: se salta una fila **sin
ningún dato** (sin texto, sin fecha y con todos los números en 0 o vacíos), para
que las fórmulas arrastradas hacia abajo no generen filas fantasma.

## El payload va codificado, no en filas crudas

Mismo esquema que `roi-clonacion.gs`:

```
{ epoca, libres, textos, fechas, dicc: {columna: [valores únicos]}, filas: [[...]] }
```

`File`, `Cliente` y `Usuario` van por diccionario (se repiten). `Fecha` va como
segundos desde una época, igual que las fechas de Clonación y 003. Las columnas
numéricas viajan tal cual, como número.

**Las reglas de negocio se calculan en la app**, en `src/lib/implementacion.ts` —
este script, como los otros, es solo codificación de transporte: no escribe
nada en la hoja.

## El caché en Drive (obligatorio)

**Ejecuta `instalarDisparador()` una vez desde el editor.** Crea un disparador
que cada 30 minutos deja el JSON armado en un archivo de Drive
(`roi-implementacion-cache.json`), y llena el caché de inmediato.

- **`medirDoGet()`** — comprueba que el caché existe y cuánto tarda en servirse.
- **`regenerarCache()`** — refresca a mano, sin esperar al disparador.
- **`diagnosticarCache()`** — qué hay realmente en el archivo de caché.
- **`diagnosticarHoja()`** — por qué la app no muestra datos: ¿está el
  `IMPLEMENTACION_SHEET_ID`, existe la pestaña `implementacion`, cuántas filas trae?
- **`medirTiempo()`** — filas, tamaño del JSON y % de filas con fecha.
- **`verificarFechas()`** — confirma que la codificación de fechas da la vuelta exacta.

## Forzar el refresco desde n8n (opcional)

El caché se refresca solo cada `REFRESCO_MIN` minutos (disparador) o al
vuelo si está vencido. Para forzarlo bajo demanda, p. ej. desde un workflow
de n8n después de actualizar la hoja:

1. En el `.gs`, pon un valor largo y random en `REFRESH_TOKEN` (cerca del
   inicio del archivo — viene vacío, es decir deshabilitado, por defecto).
2. **Implementar → Administrar implementaciones → Editar → Nueva versión**
   para que el cambio quede activo en la URL del WebApp (no te da una URL
   nueva).
3. En n8n, un nodo **HTTP Request** (GET) a:
   ```
   https://script.google.com/macros/s/TU_ID/exec?action=regenerar&token=TU_REFRESH_TOKEN
   ```
   Responde `{"ok": true, "generado": "<ISO>"}`. No requiere credenciales de
   Google — el token hace de guardia. Sin `action=regenerar` o con el token
   equivocado, el endpoint se comporta exactamente igual que antes (sirve el
   caché de solo lectura).

## Notas

- Lee siempre la pestaña `implementacion` (variable `SHEET_TAB` en el script) —
  si la pestaña cambia de nombre, actualízalo ahí.
- Lee siempre el archivo apuntado por `IMPLEMENTACION_SHEET_ID` — si el archivo
  "Clonacion files" se mueve o se recrea, actualiza esa Script Property (y la
  de Clonación).
- El `doGet` es de solo lectura: no escribe nada en la hoja.
- Si se agrega una columna nueva, el `doGet` ya la expone (lee los encabezados
  dinámicamente). Para usarla en el reporte hay que declararla en
  `src/types/index.ts` → `ImplementacionRow`; si es fecha o texto muy repetido,
  agrégala además a `COLS_FECHA` / `COLS_TEXTO` del script para que se comprima.
