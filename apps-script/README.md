# Apps Script — Recordatorios "Sin Valor Def"

Envía hasta **4 correos** (uno cada **10 días hábiles**) a las iniciativas en status
**"Sin Valor Def"** cuya casilla **PKU esté sin marcar**, al email de la columna **"CKU Mail"**.

- **Correo 1:** 10 días hábiles después de la fecha de *En Espera*.
- **Correo 2/3/4:** 10 días hábiles después del correo anterior, mientras siga en
  "Sin Valor Def" y PKU sin marcar. Máximo 4.
- **Disparo:** trigger diario ~7:30am.
- **Registro:** hoja de cálculo `Envios` (se crea sola la primera vez).

## Archivos de este folder

- [`sin-valor-def-reminders.gs`](./sin-valor-def-reminders.gs) — **todo el código** para pegar en Apps Script.
- [`appsscript.json`](./appsscript.json) — el **manifiesto** (zona horaria, servicio Gmail API y
  ajustes del Web App ya configurados). Si lo pegas, te ahorras los pasos 3 y 5 de abajo.

## Instalación (una sola vez)

1. Ve a <https://script.google.com> → **Nuevo proyecto** (o abre el proyecto existente del calendario).
2. Pega el contenido de [`sin-valor-def-reminders.gs`](./sin-valor-def-reminders.gs) en un archivo `.gs`.
   - Opcional pero recomendado: **⚙️ Configuración → "Mostrar archivo de manifiesto appsscript.json"**
     y reemplaza su contenido por el de [`appsscript.json`](./appsscript.json). Esto deja lista la
     zona horaria (paso 3), el servicio Gmail API (paso 5) y el acceso del Web App.
3. **Proyecto → Configuración (⚙️) → Zona horaria:** `America/Guatemala` (ya viene en el manifiesto).
4. **Configuración → Propiedades del script**, agrega (mismos valores de `.env.local`):
   - `MONDAY_API_KEY`
   - `MONDAY_INI_BOARD_ID`
   - `MONDAY_RH_BOARD_ID` (Directorio RH — necesario para el CC al PM)
5. **Firma automática de Gmail:** en el editor, **Servicios (＋) → Gmail API → Agregar**.
   Así el script toma la firma que ya tienes configurada en Gmail (la que aparece al redactar
   un correo nuevo) y la agrega al final. Si no lo activas, usa el respaldo de la variable `FIRMA`.
6. Con `DRY_RUN = true` (por defecto), ejecuta la función **`revisarYEnviarRecordatorios`** una vez.
   - Google pedirá autorizar permisos (Gmail, hojas, red externa). Acéptalos.
   - Revisa **Ejecuciones / Registros**: verás qué correos *enviaría* sin mandar nada.
7. Cuando el resultado se vea bien, cambia **`DRY_RUN = false`** y guarda.
8. Ejecuta **`crearTriggerDiario`** una vez para programar el envío diario (~7:30am).

## Mostrar los envíos en la app (tabla "En Espera")

La app rastrea los correos leyendo el registro (hoja `Envios`) vía un `doGet`. Para conectarlo:

1. En el editor de Apps Script: **Implementar → Nueva implementación → Aplicación web**.
   - **Ejecutar como:** yo (el manager).
   - **Quién tiene acceso:** cualquier persona con el enlace.
2. Copia la **URL de la aplicación web** y pégala en `.env.local` de la app como
   `REMINDERS_WEBAPP_URL=...`.
3. La tabla **En Espera** de la app mostrará: correos enviados (N/4) y el próximo
   (= último envío + 10 días háb.). Mientras no haya envíos, muestra `0/4` y "Pendiente".

> El `doGet` es de **solo lectura** (no envía nada); solo devuelve las filas de la hoja `Envios`.
> Cada vez que redepliegues cambios del `.gs`, usa **Administrar implementaciones → Editar → Nueva versión**
> para conservar la misma URL.

## Remitente: que el correo salga a nombre del manager

Apps Script envía **desde la cuenta que ejecuta el script** (la dueña del trigger). Para que el
correo salga a nombre del **manager del equipo** (y lleve su firma) hay dos caminos:

**➡ Camino A — el manager instala/ejecuta el script (ELEGIDO).**
El **manager** crea el proyecto de Apps Script y es quien ejecuta `crearTriggerDiario`. Como el
trigger corre bajo su cuenta, los correos salen desde su dirección y con su nombre automáticamente.
Deja `REMITENTE_ALIAS = ""` y `REMITENTE_NOMBRE = ""`; solo completa `FIRMA` con su nombre y cargo.
> Importante: los pasos de instalación (pegar el script, poner las Script Properties, autorizar,
> ejecutar `crearTriggerDiario`) los hace **el manager con su propia cuenta de Google**.

**Camino B — una cuenta compartida ejecuta el script, "enviando como" el manager.**
1. En la cuenta que ejecuta el script: Gmail → **Configuración → Cuentas → "Enviar como" →
   Añadir otra dirección** → la del manager, y **verifícala** (o pide al manager que delegue).
   Requiere permisos de Workspace; suele necesitar apoyo de IT.
2. Pon el correo del manager en `REMITENTE_ALIAS`. El script valida que sea un alias válido
   (`GmailApp.getAliases()`) y, si no, aborta con un mensaje claro.

En ambos casos:
- `REMITENTE_NOMBRE` = nombre visible del remitente (ej. `"Juan Pérez — Gerente PMO"`).
- `FIRMA` = bloque de firma al pie del correo.
- `RESPONDER_A` (opcional) = dirección de respuesta.

> Nota: el envío ahora usa `GmailApp` (permite `from`, nombre y firma); la primera ejecución
> pedirá autorizar el permiso de Gmail.

## Notas

- El correo se envía **desde la cuenta que ejecuta el script** (o el alias del manager, según arriba).
- Los **días hábiles** saltan sábado, domingo y los **asuetos oficiales de Guatemala** (misma
  lista que `src/lib/holidays.ts`). Al cambiar de año, actualizar el objeto `FERIADOS` en el `.gs`.
- El **registro** (hoja `Envios`) es la única fuente de verdad: el nº de correo y la fecha del
  último envío se derivan de sus filas. No borres filas si no quieres reiniciar la cuenta.
- Si una iniciativa sale de "Sin Valor Def" o le marcan PKU, deja de recibir correos.

## Destinatarios y personalización

- **Para (TO):** email de la columna **CKU Mail**.
- **CC:** email del **PM**. La columna PM trae el *nombre*; el correo se resuelve por
  match de nombre contra el **Directorio RH** (`MONDAY_RH_BOARD_ID`). Si no hay match, se
  envía sin CC (y se deja vacío en el registro).
- **Cuerpo (HTML):** saludo al **CKU** (nombre), referencia a la iniciativa (**Ini ID + nombre**),
  mención del **PM** y la **firma** del remitente. Edita el texto en `enviarCorreo_` y la firma en `FIRMA`.

## Columnas de Monday usadas

| Campo | Columna Monday | ID |
|---|---|---|
| Status | Status | `color_mm3a94fr` |
| PKU (checkbox) | PKU | `boolean_mm3gbngt` |
| Email destino (TO) | CKU Mail (mirror) | `lookup_mm3baydr` |
| Nombre CKU (saludo) | CKU (relación) | `board_relation_mm3bde9a` |
| PM (para CC) | PM (people) | `multiple_person_mm3akwgd` |
| Fecha base | En Espera | `date_mm3gw8yy` |
| ID legible | Ini ID | `pulse_id_mm3atas7` |
| Email en Directorio RH | Email | `email_mkz5qg4v` |
