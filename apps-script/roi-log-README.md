# Apps Script — ROI Log (bitácora C807)

Expone en **solo lectura** la pestaña `003` de la hoja ROI para que la app la
muestre en la página **ROI**. Los encabezados se leen de la fila 1, así que las
columnas nuevas fluyen solas. Fuente independiente del resto del dashboard — su
propio Apps Script, su propia variable de entorno, su propio endpoint.

## Archivos de este folder

- [`roi-log.gs`](./roi-log.gs) — todo el código para pegar en Apps Script.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto**.
2. Pega el contenido de [`roi-log.gs`](./roi-log.gs) en un archivo `.gs`.
3. **Configuración (⚙️) → Propiedades del script**, agrega:
   - `ROI_SHEET_ID` = el ID del Google Sheet de ROI (de la URL:
     `.../spreadsheets/d/<ESTE_ID>/edit`).
4. **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo.
   - **Quién tiene acceso:** cualquier persona con el enlace.
5. Copia la **URL de la aplicación web** y pégala en `.env.local` de la app como
   `ROI_WEBAPP_URL=...`.
6. Ejecuta **`instalarDisparador()`** desde el editor (ver abajo). Sin este paso
   el reporte falla de forma intermitente.

> Cada vez que redepliegues cambios del `.gs`, usa **Administrar implementaciones
> → Editar → Nueva versión** para conservar la misma URL.

## El payload va codificado, no en filas crudas

El `doGet` **no** devuelve `{rows: [...]}`. Devuelve la hoja codificada:

```
{ epoca, libres, textos, fechas, dicc: {columna: [valores únicos]}, filas: [[...]] }
```

Cada fila es un arreglo posicional: las columnas `libres` (texto tal cual), luego
un índice al diccionario por cada columna de `textos`, luego los segundos desde
`epoca` de cada columna de `fechas` (`null` si el hito no ocurrió).

Por qué: las 8 columnas de texto repetido suman **693 valores únicos** entre
todas, pero se repetían ~59 mil veces cada una. Con diccionario y fechas
numéricas el payload baja de **27.6 MB a 5.0 MB — un 82% menos** (1.2 MB en el
cable, comprimido), sin perder un solo dato.

Esto es **solo codificación de transporte**. El script no agrupa, no deduplica y
no calcula: todas las reglas de negocio siguen en `src/lib/tramites.ts`, donde
están probadas. `src/lib/roi.ts` reconstruye los mismos `RoiRow` de siempre y
nada río abajo se entera.

> Sobre las fechas: se empaquetan los componentes **locales** dentro de un
> `Date.UTC` y se desempaquetan con `getUTC*`. El número no es un instante real,
> es la hora de pared codificada — así el valor no depende de la zona horaria de
> quien lo decodifique (Vercel corre en UTC, tu PC no). `verificarFechas()` lo
> comprueba contra `Utilities.formatDate`.

Si una columna nueva aparece en la hoja y no está en `COLS_TEXTO` ni en
`COLS_FECHA`, viaja en `libres` como texto tal cual — sigue llegando sola a la
app. Si es de fecha o de texto muy repetido, agrégala al arreglo que corresponda
para que también se comprima.

## El caché en Drive (obligatorio)

**Ejecuta `instalarDisparador()` una vez desde el editor.** Crea un disparador
que cada 30 minutos deja el JSON armado en un archivo de Drive, y llena el caché
de inmediato. Pide autorizar el acceso a Drive.

Sin eso, el `doGet` lee las ~892 mil celdas de la hoja en cada petición (~12 s) y
el 404 de abajo se vuelve frecuente.

- **`medirDoGet()`** — comprueba que el caché existe y cuánto tarda en servirse.
  Debería ser ~1 s. Si dice «SIN CACHÉ ⚠», falta el disparador.
- **`regenerarCache()`** — refresca a mano, sin esperar al disparador.
- El archivo se llama `roi-003-cache.json` y vive en tu Drive. Si lo borras, el
  script lo vuelve a crear solo.
- Si el caché supera las 3 horas de antigüedad, el `doGet` lo rehace al vuelo en
  vez de servir algo viejo.

La app muestra la antigüedad del dato junto al título de la página.

## El 404 intermitente

El `/exec` no devuelve el contenido: redirige a
`script.googleusercontent.com/macros/echo?user_content_key=…`, y **ese** endpoint
devuelve **404 cada tantas peticiones** aunque el script haya corrido perfecto.

Al medirlo (agosto 2026, payload de 5 MB) apareció una correlación limpia con el
tiempo de respuesta:

| Resultado | Tiempos observados |
|---|---|
| Éxito | 10.5 s · 14.2 s |
| 404 | 21 · 29 · 42 · 43 · 45 · 79 s |

**Cuanto más tarda la ejecución, más probable es el 404.** Por eso el caché en
Drive no es un lujo: al bajar el `doGet` de ~12 s a ~1 s, ataca la causa.

Como red de seguridad, `src/lib/roi.ts` reintenta hasta 4 veces y **aborta a los
18 s** en vez de esperar: pasada esa marca la respuesta ya viene mala, y cortar
para reintentar sale mucho más barato que aguantar 80 s por un error. El
presupuesto total es de 50 s, por debajo del corte de 60 s de Vercel.

## El límite de 6 minutos

Google corta cualquier ejecución de Apps Script a los **6 minutos**. Cuando eso
pasa, el WebApp responde HTTP 200 con una página HTML que dice *«Excedió el
tiempo máximo de ejecución»*, no JSON — en la app aparecía como
`Unexpected token '<'`. Hoy `src/lib/roi.ts` detecta ese caso y muestra el motivo
real.

Ya ocurrió una vez, en agosto 2026, con ~59 mil filas. La causa **no** era leer la
hoja: era llamar `Utilities.formatDate()` + `Session.getScriptTimeZone()` una vez
por celda de fecha (~700 mil llamadas a servicios, cada una cruzando el puente
JS↔Java). El script actual formatea las fechas en JavaScript puro y hace solo dos
llamadas al servicio de hojas en total.

Para vigilar el margen, ejecuta **`medirTiempo()`** desde el editor y mira el
registro: reporta filas, MB del JSON y segundos usados de los 360 disponibles.
Si vuelve a acercarse al límite, el siguiente paso es recortar la ventana de
fechas que devuelve el `doGet` (no hace falta toda la historia en cada carga).

**`verificarFechas()`** confirma que la codificación de fechas da la vuelta
exacta, comparándola contra `Utilities.formatDate`.

## Notas

- Lee siempre la pestaña `003` (variable `SHEET_TAB` en el script) — si la
  pestaña cambia de nombre, actualízalo ahí.
- El `doGet` es de solo lectura: no escribe nada en la hoja.
- Si se agrega una columna nueva a la hoja, el `doGet` ya la expone (lee los
  encabezados dinámicamente). Para usarla en el reporte hay que declararla en
  `src/types/index.ts` → `RoiRow`; si es fecha o texto muy repetido, agrégala
  además a `COLS_FECHA` / `COLS_TEXTO` del script para que se comprima.
- `src/lib/roi.ts` acepta también el formato viejo (`{rows: [...]}`), así que la
  app no se rompe mientras el WebApp no se haya redesplegado.
