# Bot de Google Chat «PMO Iniciativas»

Un bot de Google Chat con varios **flujos** (uno por comando). Al escribirle cualquier cosa saluda con el nombre y el
rol del Directorio RH («¡Hola Ana! Rol CKU»; Admin de la app gana) y muestra los flujos que ESE usuario puede usar. A
quien no es CKU, Sponsor, PM ni Admin solo le dice «Si necesitas apoyo con el equipo de PMO contacta a tu CKU asignado».

| Comando | ID | Flujo | Quién lo ve |
|---|---|---|---|
| `/iniciativa` | 1 | Nueva iniciativa (nombre + descripción → tablero de Iniciativas); recibe archivos en el chat | CKU del Directorio RH o Admin (no pide cuenta en la app) |
| `/status-card` | 2 | Status Card de un proyecto (elegir de la lista → tarjeta en el chat) | Cuenta en la app con la página Resumen Ejecutivo o Proyectos |

## Estructura (para agregar flujos)

```
src/app/api/google-chat/route.ts     verifica que venga de Google y llama a despachar()
src/features/google-chat/
├─ nucleo/                           no se toca al agregar flujos
│  ├─ flujo.ts                       EL CONTRATO de un flujo (FlujoChat) y AvisoChat
│  ├─ registro.ts                    la lista de flujos (orden del menú)
│  ├─ despachar.ts                   saludo → menú · archivos → recibirArchivos · comando/botón → flujo · cancelar
│  ├─ usuario.ts                     correo de Google → persona del Directorio RH + cuenta de la app (si tiene)
│  ├─ token.ts                       verificación del ID token de Google
│  ├─ chat-api.ts                    Chat API como la app (cuenta de servicio): bajar archivos, escribir después
│  ├─ eventos.ts · respuestas.ts     leer eventos / respuestas que entiende Chat (puros)
│  ├─ formulario.ts                  campos texto/número/lista, validar, tarjeta de formulario (puro)
│  └─ menu.ts                        el menú del saludo (puro)
└─ flujos/
   ├─ iniciativa/   flujo.ts · datos.ts · textos.ts
   └─ status-card/  flujo.ts · datos.ts · tarjeta.ts
```

**Agregar un flujo:**
1. `flujos/<nombre>/flujo.ts` que exporte un `FlujoChat`: `clave`, `comandoId`, `comando`, `titulo`, `descripcion`,
   `puedeUsar(usuario)`, `abrir(ctx)` (tarjeta del diálogo) y `enviar(ctx, accion)` (botones del diálogo).
   Lo que se lee de la base va en `datos.ts` (solo servidor); lo que arma tarjetas, en archivos puros con tests.
2. Agregarlo a `FLUJOS` en `nucleo/registro.ts`.
3. Registrar el comando en Google Cloud con el **mismo ID** y «Abre un diálogo».

Los botones llevan los parámetros `flujo` y `accion`. «abrir» y «cancelar» los atiende el núcleo; las demás acciones van
a `enviar`. Un `AvisoChat` lanzado desde un flujo se le muestra al usuario tal cual.

## Flujo /status-card

Lista los proyectos que el usuario puede ver (por código; un **CKU solo los suyos** y lo que está en **On Hold** no sale,
igual que /resumen-ejecutivo). Al elegir uno, deja en el chat una tarjeta con los MISMOS datos de la Status Card de la app
(`buildStatusReportDataForBoard`): salud, avance real/plan y SPI, atraso, cierre plan/estimado, valor/ROI/payback, fases
VALOR, entregables de Launch (plegable), causas de atraso (hasta 8) con su reparto, datos del proyecto, y botones
«Abrir en PMO Control Tower» y «Ver otro proyecto». El Gantt no se dibuja en Chat (las fases van como lista).

Datos: se arman en el servidor como el cron semanal (`fetchDashboardRaw`, caché de 60 s, + Supabase + On Hold). La
primera consulta tarda ~7 s; las siguientes, < 1 s. Solo lee: no sincroniza baselines.
Ojo en producción: «hoy» sale del reloj del servidor (igual que el cron); en Vercel el servidor está en UTC.

### La imagen (idéntica a la app)

El mensaje lleva la **foto** de la hoja A4 de la app (decisión del usuario, 2026-11-23): 3 datos en texto (Salud, Atraso,
Cierre estimado), la imagen (al tocarla se abre en grande), «Se puede ver hasta el …» y los botones Ver en grande /
Abrir en PMO Control Tower / Ver otro proyecto.

**Límite de tiempo de Google Chat:** corta la espera de cada respuesta a los pocos segundos (2026-11-23: 5,7 s pasó;
8,9 s dio «Could not load dialog. Either the app is not responding or the response is invalid» en PM-012 y PM-013).
Por eso, dentro de la respuesta no va nada lento:
- **Datos:** caché del bot (`datos.ts`): ≤ 60 s se entrega tal cual; ≤ 5 min al instante y se refresca en segundo plano.
  Se espera a lo más 4 s; si no está, el diálogo muestra «Cargando…» con **Reintentar** (acción `recargar`). El menú del
  saludo la precalienta (`precalentar` del flujo).
- **Foto:** el mensaje lleva `/api/google-chat/foto/<código>` (código firmado de **7 días**: proyecto + momento) y la foto
  se empieza a tomar **después** de responder (`after`). Ese enlace entrega la guardada; si aún no existe, espera la que
  está en curso (hasta ~9 s si es reciente) o la toma ahí. Una vez tomada, es siempre la misma.

1. `flujos/status-card/imagen.ts` firma un código de 2 min (`nucleo/firma.ts`, HMAC con llave derivada de
   `SUPABASE_SECRET_KEY`) y abre con Chrome sin ventana (`puppeteer-core`) la página interna
   [`/status-card-imagen/<código>`](../src/app/status-card-imagen/[codigo]/page.tsx): el MISMO componente `StatusReport`
   de /resumen-ejecutivo, solo, en tema claro. Espera `data-lista="1"` (fuentes + auto-ajuste) y toma la foto a 2×.
2. El PNG va al bucket **privado** `google-chat` (migración `20261123190000_google_chat_imagenes`) como
   `status-card/<proyecto>/<momento>.png`, y lo entrega
   [`/api/google-chat/foto/<código>`](../src/app/api/google-chat/foto/[codigo]/route.ts). Mientras el código sea
   válido, quien tenga el enlace ve la imagen; después da 404 y deja de verse en los mensajes viejos. Las fotos de más de
   8 días se borran al tomar otra del mismo proyecto.

Chrome: en local, el instalado (o `CHROME_PATH`) y la hoja se abre en `http://localhost:$PORT`; en Vercel,
`@sparticuz/chromium@143` (compatible con Node 20; las versiones nuevas piden Node 22) y la hoja se abre en el dominio
de la app (`outputFileTracingIncludes` en next.config.ts lleva su binario a las dos funciones). Tiempos medidos en local:
respuesta al chat ~1 s con la caché lista; foto 3–5 s; entregar una foto ya guardada < 1 s. **Antes de producción:** `npm run build` y probar en Vercel (tamaño de la función,
arranque en frío de Chrome).

## /iniciativa: qué pide (reglas del PMO, 2026-11-24)

| Sección | Campo | Notas |
|---|---|---|
| Datos (obligatorios) | Nombre de la iniciativa | |
| | Descripción | Texto de varias líneas, **mínimo 200 caracteres** (sin contar espacios repetidos). Queda como **primera entrada de la bitácora** de la iniciativa, a nombre de quien escribe. |
| | ☐ Adjuntaré un archivo | Casilla. Marcada, la descripción ya no pide los 200 caracteres pero el **archivo es obligatorio** (decisión del PMO, 2026-11-25). |

Beneficio $ y Proceso **no se piden** (se llenan después en la app).

### Archivos desde el formulario (casilla «Adjuntaré un archivo»)

Google Chat **no tiene un control para subir archivos dentro de un formulario** (la lista de widgets de las tarjetas no
trae ninguno: [card.proto](https://github.com/googleapis/googleapis/blob/master/google/apps/card/v1/card.proto)). Lo que sí
hay: un botón puede abrir un enlace, y una casilla puede mandar el formulario al marcarla (`onChangeAction`). Con eso:

1. Al abrir el formulario, el bot le da un **borrador** (uuid) que viaja en todos sus controles (`PARAM_BORRADOR`).
2. Al marcar la casilla, el formulario se vuelve a dibujar con «Archivos subidos», **«📎 Subir archivo»** y **«🔄
   Actualizar»**. «Subir archivo» abre [`/archivos-iniciativa/<código>`](../src/app/archivos-iniciativa/[codigo]/page.tsx):
   página sin sesión (la protege el código firmado con el correo y el borrador, 12 h) donde se arrastran o eligen los
   archivos (hasta 10, 50 MB cada uno; también desde el celular). Cada archivo sube **directo a Storage** con URL firmada
   (bucket `tableros`, carpeta `chat-borradores/<borrador>/`) y queda anotado en `google_chat_borrador_archivos`
   (migración `20261125120000_google_chat_borradores`). API: [`/api/google-chat/archivos`](../src/app/api/google-chat/archivos/route.ts).
3. Al volver al chat, «🔄 Actualizar» muestra lo que subió. «Crear iniciativa» revisa la regla (`erroresDeDescripcion` en
   `flujos/iniciativa/subida.ts`): sin la casilla, 200 caracteres; con la casilla, al menos un archivo. Si no se cumple, el
   formulario sigue abierto con el error y lo que llenó.
4. Al crearla, los archivos del borrador se **mueven** (sin bajarlos) a la entrada de la descripción en la bitácora
   (`moverAComentario` en `tableros/datos/operaciones.ts`) y el mensaje de confirmación dice cuáles quedaron.
5. Los borradores que nunca se usan se borran solos (archivos y filas) a los 2 días (`limpiarBorradoresViejos`, al abrir
   el formulario).

No necesita la cuenta de servicio (`GOOGLE_CHAT_LLAVE`): la subida no pasa por Google Chat.

Automático: **CKU = quien escribe** (su persona del Directorio; un Admin que no está en el Directorio la deja sin CKU),
status New, grupo Nuevas Iniciativas, Ini ID y fecha de creación. **PM y Estrategia quedan vacíos**: los asigna el PMO
después en Gestión de Iniciativas.

La pueden crear los **CKU del Directorio RH y los Admin**, aunque no tengan cuenta en la app (casi ningún CKU la tiene). El
bot crea con acceso de sistema (`ACCESO_BOT`); el historial y la bitácora quedan con el correo y el nombre de quien
escribe (`Actor` con `uid` null si no tiene cuenta, en `tableros/datos/operaciones.ts`).

### Archivos (se mandan en el chat, para una iniciativa que ya existe)

Además del formulario, se pueden mandar como **mensaje normal al bot**: el bot pregunta
«¿A qué iniciativa lo adjunto?» con botones (las 5 más recientes que la persona creó o en cuya bitácora escribió). Al
elegir, responde «⏳ Adjuntando…» y, después de responder (`after`), lee el mensaje con la Chat API (solo si lo mandó quien
tocó el botón), descarga cada archivo y lo pega a una entrada nueva de la bitácora «📎 Archivos enviados desde Google
Chat» (`adjuntarAComentario`); al terminar escribe el resultado en el mismo chat. Límites: 10 archivos por mensaje,
50 MB cada uno, 100 MB en total.

Requiere la **cuenta de servicio** del bot (`GOOGLE_CHAT_LLAVE`, ver abajo). Sin ella el bot contesta que todavía no
puede recibir archivos.

### Archivos de Google Drive (cada persona conecta su Drive una vez)

Chat solo deja bajar lo que se **sube** al chat; un archivo de Drive sigue siendo de la persona. Por eso cada persona
autoriza **una vez** que el bot lea su Drive (decisión del PMO, 2026-11-24, «opción 1»):

1. Si manda un archivo de Drive y aún no conectó su Drive, junto a la pregunta sale el botón **«🔗 Conectar mi Drive»**:
   enlace firmado con su correo (1 día) → [`/api/google-chat/drive/conectar`](../src/app/api/google-chat/drive/conectar/route.ts)
   → Google pide permiso (`drive.readonly`, con su correo sugerido) →
   [`/api/google-chat/drive/callback`](../src/app/api/google-chat/drive/callback/route.ts). Solo se guarda si entró a
   Google con la **misma** cuenta del enlace. El refresh token va cifrado en el Vault (tabla `google_drive_conexiones`,
   por correo, migración `20261124150000_google_chat_drive`).
2. Conectado, los archivos de Drive se **copian** a la bitácora con su permiso (`nucleo/drive.ts`). Los de Google se
   exportan: Docs → PDF, Sheets → Excel, Slides → PowerPoint, Dibujos → PDF (Google exporta hasta 10 MB). Forms, Sites y
   lo que no tenga acceso quedan como **enlace**, y el resultado dice por qué.
3. Si la persona quita el permiso en su cuenta de Google, el bot lo marca `reconectar` y vuelve a ofrecer el botón.

Usa el **mismo cliente OAuth** que Calendar (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`). En
Google Cloud: habilitar **Google Drive API**; en la pantalla de consentimiento (tipo **Interno**) agregar el scope
`.../auth/drive.readonly`; y en el cliente OAuth agregar la URI de redirección
`https://pmo-control-tower.vercel.app/api/google-chat/drive/callback`.

## Quién puede usarlo

Se identifica al usuario por su correo de Google (`@c807.com`) → su persona **activa** del Directorio RH (nombre y rol) y
su cuenta en `app_users` si tiene una con rol. Solo se rechaza a quien no es de la empresa; cada flujo decide en
`puedeUsar` si le basta el Directorio (`/iniciativa`) o necesita la cuenta (`/status-card`, con `cuentaDe`).

Formato: **Google Workspace add-on** (el predeterminado para apps de Chat nuevas desde julio de 2025; el clásico ya es
el «anterior»). Respuestas: `action.navigations[pushCard | updateCard | endNavigation]` y
`hostAppDataAction.chatDataAction.createMessageAction`.

## Configuración en Google Cloud (una vez)

Se usa el **mismo proyecto de Google Cloud** que Google Calendar (docs/google-calendar.md).

1. **APIs y servicios → Biblioteca →** habilitar **Google Chat API**.
2. **Google Chat API → Configuración:**
   - Nombre de la app: `PMO Iniciativas`. URL del avatar: cualquier PNG cuadrado público. Descripción: `Alta de iniciativas del PMO`.
   - **Funciones interactivas:** activadas. Marcar «Unirse a espacios y conversaciones grupales» solo si se quiere usar fuera del chat directo.
   - Dejar marcada **«Build this Chat app as a Google Workspace add-on»** (formato add-on). *Ojo: no se puede revertir.*
   - **Configuración de conexión → URL del extremo HTTP:** `https://pmo-control-tower.vercel.app/api/google-chat`
     (en pruebas locales, la URL del túnel + `/api/google-chat`). Si pide un URL por activador, usar el mismo en todos.
   - **Comandos → Agregar comando:** tipo *Slash command*, nombre `/iniciativa`, ID `1`, descripción
     `Dar de alta una iniciativa`, y marcar **«Abre un diálogo»**. Igual para `/status-card`, ID `2`,
     `Ver la Status Card de un proyecto`. (Un comando por flujo; el ID tiene que coincidir con `comandoId`.)
   - **Visibilidad:** para el piloto, solo personas concretas (p. ej. el PMO y un PM). Después, todo el dominio.
   - **Registros:** «Registrar errores en Logging» (ayuda si Google rechaza una respuesta).
   - Guardar. Al guardar aparece el **correo de la cuenta de servicio** (`service-NUMERO@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`).
3. Poner en `.env.local` (y en Vercel para producción):
   ```
   GOOGLE_CHAT_URL=<la URL del extremo HTTP, EXACTA>
   GOOGLE_CHAT_CUENTA_SERVICIO=<el correo de la cuenta de servicio>
   GOOGLE_CHAT_DIAGNOSTICO=1   # solo en la primera prueba
   ```
   Sin las dos primeras el bot está **apagado** (503).
4. **Cuenta de servicio (para recibir archivos):** IAM y administración → Cuentas de servicio → **Crear cuenta de
   servicio** (p. ej. `pmo-chat-bot`, sin roles) → en ella, **Claves → Agregar clave → Crear clave nueva → JSON**. El JSON
   descargado va completo en `GOOGLE_CHAT_LLAVE` (en Vercel, como variable *Sensitive*; también se acepta en base64). Es
   la única copia: guardarla en un lugar seguro y no subirla al repo. Usa el scope `chat.bot` (no pide aprobación del
   administrador). Si la organización bloquea crear claves (`iam.disableServiceAccountKeyCreation`), lo tiene que
   permitir un administrador de Google Cloud.

Visibilidad: el administrador de Workspace de C807 exige **allowlisting del Marketplace**. Sin eso, solo funcionan hasta
5 correos individuales en *Visibility* (grupos y dominio no surten efecto). Para todo el dominio: publicar la app como
**privada** en el Google Workspace Marketplace (Marketplace SDK en el mismo proyecto) y que el administrador la apruebe o
la instale para el dominio.

## Probar en local

Google Chat necesita una URL pública con HTTPS, así que localhost se expone con un túnel:

```bash
npm run dev
npx cloudflared tunnel --url http://localhost:3000   # da una URL https://xxxx.trycloudflare.com
```

1. Poner `https://xxxx.trycloudflare.com/api/google-chat` en la configuración de Chat **y** en `GOOGLE_CHAT_URL`, y reiniciar el dev server.
   (La URL del túnel cambia cada vez que se abre.)
2. En Google Chat: **Nuevo chat → buscar «PMO Iniciativas»** → escribir `hola` (sale el botón) o `/iniciativa`.
3. Con `GOOGLE_CHAT_DIAGNOSTICO=1` la consola del dev server muestra la forma de cada evento (sin tokens). Revisar que
   `usuario.email` venga lleno; si no, el bot intenta con el token del usuario (`tokenDeUsuario: true`).
4. Las iniciativas de prueba se eliminan desde Gestión de Iniciativas (Admin).

## Antes de encenderlo para todos

- **Corte de Iniciativas:** mientras el tablero siga sincronizando con Monday (`sincroniza_monday = true`), lo que se
  crea en la app no va a Monday y no cuenta en las métricas hasta el corte (guardia `soloLoDeMonday`). El bot debería
  abrirse a los PM **con el corte**, no antes.
- Producción: variables en Vercel + push (cuando se autorice) + cambiar la URL del extremo a la de Vercel.
- Listas largas: Google Chat admite hasta 100 opciones por lista. Si un formulario llega a pasarse, el bot avisa y hay
  que cambiarla a una lista con búsqueda (`externalDataSource`, autocompletar).

## Por confirmar con la primera prueba real

La documentación de Google no deja claro todo. El código lo maneja de forma defensiva, pero conviene verificarlo:

- Que `chat.user.email` llegue en el evento (si no, se usa `authorizationEventObject.userIdToken`).
- Que `updateCard` mantenga el diálogo abierto con los errores (alternativa: `pushCard`).
- Que el mensaje de confirmación (`createMessageAction`) cierre el diálogo.
