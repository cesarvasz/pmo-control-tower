# Apps Script — ROI 008 (Ducafast SV · análisis de tiempos)

Expone en **solo lectura** la pestaña `008` de la **misma hoja ROI** que usa el
reporte 003, para la pestaña **Ducafast SV** de la página **ROI**. Es un proyecto
de Apps Script aparte, como Clonación e Implementación: su propio `doGet`, su
propio caché y su propia variable de entorno. Así, un cambio aquí no puede
romper el 003.

## Archivos

- [`roi-008.gs`](./roi-008.gs) — todo el código para pegar en Apps Script.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto** (por ejemplo «ROI 008»).
2. Pega el contenido de [`roi-008.gs`](./roi-008.gs) en el archivo `.gs`.
3. **Configuración (⚙️) → Propiedades del script**, agrega:
   - `ROI_SHEET_ID` = el **mismo** ID que tiene el script de 003 (de la URL de la
     hoja ROI: `.../spreadsheets/d/<ESTE_ID>/edit`).
4. Ejecuta **`diagnosticarHoja()`** y mira el registro: debe encontrar la pestaña
   `008`, listar sus encabezados y decir cuántas fechas de cada columna entiende.
   Si una columna de fecha sale con ⚠ 0 %, su formato en la hoja cambió.
5. **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo.
   - **Quién tiene acceso:** cualquier persona (la URL con `/a/macros/c807.com/`
     no sirve para el servidor).
6. Copia la **URL de la aplicación web** y pégala en `.env.local` como
   `ROI_008_WEBAPP_URL=...` (y en Vercel → Settings → Environment Variables; un
   redeploy aplica el cambio). Reinicia el dev server.
7. Ejecuta **`instalarDisparador()`**: crea el disparador cada 30 min y llena el
   caché de inmediato (pide autorizar Drive). Verifica con **`medirDoGet()`**.

> Cada vez que cambies el `.gs`: guarda, ejecuta `regenerarCache()` y usa
> **Administrar implementaciones → Editar → Nueva versión** para conservar la URL.

## Regenerar desde n8n (al terminar de pegar los datos)

El flujo de n8n que pega los datos en la pestaña `008` puede terminar pidiendo
`regenerarCache()`, así la app ve lo nuevo al momento sin esperar al disparador
ni ejecutarlo a mano. Lo atiende el `doPost` del mismo WebApp, protegido con un
token.

**Una sola vez, en el editor de Apps Script:**
1. Ejecuta **`crearTokenRegeneracion()`**: crea la Script Property
   `REGENERAR_TOKEN` y muestra el token en el registro. Cópialo.
2. **Implementar → Administrar implementaciones → Editar → Nueva versión** (la URL
   no cambia). Sin esto, el `doPost` no existe en la versión publicada.

**En n8n**, como último nodo del flujo (después del último que escribe en la hoja):
- Nodo **HTTP Request** · Method **POST** · URL = la misma URL `/exec` de
  `ROI_008_WEBAPP_URL`.
- Body Content Type **JSON** · cuerpo `{"token": "<el token>"}` (mejor guardado
  como credencial o variable de n8n que escrito en el nodo).
- Options: **Timeout** 120000 ms; deja activado **Follow Redirects** (Google
  responde con una redirección y la respuesta real viene después).
- Opcional: **Retry On Fail** con 2 intentos y 5000 ms de espera.
- Agrega un nodo **IF** con la condición `{{ $json.ok }}` es verdadero: Apps Script
  responde HTTP 200 aunque falle, así que el error viene en el JSON:

  ```
  {"ok": true,  "filas": 22947, "generado": "2026-11-27T16:05:08.000Z", "segundos": 9.4}
  {"ok": false, "error": "token inválido"}
  ```

Si la pestaña quedó vacía (por ejemplo, n8n la borró y falló antes de pegar), la
respuesta es `ok: false` y **el caché anterior se conserva**: la app sigue
mostrando los datos de antes en vez de quedarse en blanco.

El disparador de cada 30 min puede quedarse como respaldo. Si n8n y el disparador
coinciden, el segundo espera al primero (candado `LockService`).

## Qué manda

El mismo formato codificado que 003 (`{ epoca, libres, textos, fechas, dicc, filas }`,
comprimido con gzip). Los nombres de columna viajan **tal como están en la hoja**;
el script solo los usa (normalizados: sin mayúsculas, tildes, espacios ni guiones)
para decidir qué va como fecha y qué por diccionario:

| Columna | Viaja como |
|---|---|
| `File_id`, `File` y cualquier columna extra | texto o número, tal cual |
| `Cliente`, `Usuario` | diccionario |
| `Fecha_file`, `Creado`, `DPR`, `Clasificacion_exacta`, `Solicitud_prepoliza` | segundos de hora de pared |

Una fecha puede estar en la hoja como **fecha**, como **texto**
(`2026-01-01 23:59:16`, `01/01/2026 23:59:16` con el día primero) o como
**número de serie** (`46352.626748` = 2026-11-26 15:02:31). Las tres se leen igual.
`verificarFechas()` lo comprueba.

**Zona horaria:** vale la hora que se **ve** en la hoja. Si la zona de la hoja y
la del proyecto de Apps Script no coinciden, el script corrige la diferencia
(`ajusteZona_`, lo avisa en el registro). Lo más simple es dejar las dos en
`America/Guatemala`.

Aquí **no se calcula nada**: Ducafast, tramos, horas hábiles y agregados viven
en `src/lib/tiempos008.ts` y `src/lib/horario008.ts`, con sus pruebas.

## Si algo falla

- **«Falta ROI_008_WEBAPP_URL»** en la pestaña: falta el paso 6.
- **«no existe la pestaña "008"»**: la pestaña se renombró. Cambia `SHEET_TAB`
  arriba del script (el mensaje lista las pestañas que sí hay).
- **«Faltan columnas en la pestaña 008»**: se renombró o borró un encabezado de
  la fila 1. El tablero no calcula con datos incompletos.
- **404 intermitente / tarda**: es la misma falla de Apps Script descrita en
  [`roi-log-README.md`](./roi-log-README.md); revisa que el caché esté instalado
  con `medirDoGet()`.
