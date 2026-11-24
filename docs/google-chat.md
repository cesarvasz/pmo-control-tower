# Bot de Google Chat «PMO Iniciativas»

Un bot de Google Chat con varios **flujos** (uno por comando). Al escribirle cualquier cosa muestra un menú con los
flujos que ESE usuario puede usar.

| Comando | ID | Flujo | Quién lo ve |
|---|---|---|---|
| `/iniciativa` | 1 | Nueva iniciativa (formulario → tablero de Iniciativas) | Página Gestión de Iniciativas o Tableros completo |
| `/status-card` | 2 | Status Card de un proyecto (elegir de la lista → tarjeta en el chat) | Página Resumen Ejecutivo o Proyectos |

## Estructura (para agregar flujos)

```
src/app/api/google-chat/route.ts     verifica que venga de Google y llama a despachar()
src/features/google-chat/
├─ nucleo/                           no se toca al agregar flujos
│  ├─ flujo.ts                       EL CONTRATO de un flujo (FlujoChat) y AvisoChat
│  ├─ registro.ts                    la lista de flujos (orden del menú)
│  ├─ despachar.ts                   saludo → menú · comando/botón → flujo · cancelar
│  ├─ usuario.ts                     correo de Google → cuenta de la app → rol
│  ├─ token.ts                       verificación del ID token de Google
│  ├─ eventos.ts · respuestas.ts     leer eventos / respuestas que entiende Chat (puros)
│  ├─ formulario.ts                  campos texto/número/lista, validar, tarjeta de formulario (puro)
│  └─ menu.ts                        el menú del saludo (puro)
└─ flujos/
   ├─ iniciativa/   flujo.ts · datos.ts
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

## /iniciativa: qué pide

| Sección | Campo | Notas |
|---|---|---|
| Datos (obligatorios) | Nombre | |
| | PM | **Solo lo ve un Admin.** Para un PM, el PM es quien escribe (se muestra arriba «PM: …»). |
| | CKU | Personas activas del Directorio. |
| | Estrategia | Elementos del tablero de Estrategia. |
| | Proceso | Opciones de la columna Proceso. |
| Opcional (plegable) | Beneficio $, Presupuesto $, KPI, Tipo de iniciativa | Los números aceptan `15000`, `15,000.50`, `$ 15,000`. |

Solo aparecen las columnas que el rol puede editar (reglas del tablero). Si falta algo, el formulario vuelve a salir con
lo ya llenado y la lista de lo que falta.

## Quién puede usarlo

Se identifica al usuario por su correo de Google (`@c807.com`) → su cuenta en `app_users` → su rol:

- Sin cuenta en la app, cuenta en espera o correo de otro dominio → aviso, no crea nada.
- Necesita la página **Gestión de Iniciativas** o Tableros completo (igual que `exigirAccesoTablero`).
- Un PM necesita su cuenta **ligada a una persona del Directorio** (`personas.app_user_id`), si no, no se le puede poner de PM.

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

Si el administrador de Workspace restringe las apps de Chat, puede hacer falta que permita esta app para el dominio.

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
- Listas largas: Google Chat admite hasta 100 opciones por lista; hoy hay 84 personas activas. Si se pasa, el bot avisa
  y hay que cambiar CKU/PM a una lista con búsqueda (`externalDataSource`, autocompletar).

## Por confirmar con la primera prueba real

La documentación de Google no deja claro todo. El código lo maneja de forma defensiva, pero conviene verificarlo:

- Que `chat.user.email` llegue en el evento (si no, se usa `authorizationEventObject.userIdToken`).
- Que `updateCard` mantenga el diálogo abierto con los errores (alternativa: `pushCard`).
- Que el mensaje de confirmación (`createMessageAction`) cierre el diálogo.
