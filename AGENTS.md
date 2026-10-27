<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PMO Control Tower — guía para agentes

Dashboard interno del PMO de C807 (portafolio de iniciativas, requerimientos y proyectos bajo la metodología **VALOR**). Lee datos de **Monday.com** y de varias hojas de **Google Sheets / Calendar** expuestas por Apps Script, y guarda lo propio de la app (usuarios, roles, baselines, encuestas, snapshots) en **Firestore**.

Todo el producto está en español: UI, comentarios, nombres de dominio (`esPlantillaLite`, `calcConfirmacionRoi`, `atrasoDetalle`) y mensajes de commit. Mantén ese idioma.

## Stack

- Next.js **16** (App Router, Turbopack, `output: "standalone"`), React 19, TypeScript estricto
- Tailwind CSS v4 + variables CSS de tema en [src/app/globals.css](src/app/globals.css)
- Firebase Auth (cliente) + Firebase Admin SDK / Firestore (solo servidor)
- Recharts para gráficas; jsPDF + html2canvas para exportar reportes
- Vitest (entorno Node, sin DOM) para la lógica pura
- Deploy: Vercel (con cron en [vercel.json](vercel.json)); alternativa Docker en [Dockerfile](Dockerfile) / [compose.yml](compose.yml)

## Comandos

```bash
npm run dev         # http://localhost:3000
npm run lint        # eslint (flat config). `next lint` ya NO existe en Next 16
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (src/**/*.test.ts)
npx vitest run src/lib/kpi.test.ts   # un solo archivo
npm run build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) corre **lint → typecheck → test** en cada push/PR a `main`. Antes de dar un cambio por terminado, corre los tres.

## Arquitectura

```
src/
├─ app/
│  ├─ (app)/      páginas protegidas con Sidebar + Topbar (layout hace el gating por permisos)
│  ├─ api/        Route Handlers — único lugar que habla con Monday, Sheets y Firestore
│  ├─ login/      fuera del shell
│  └─ encuesta/[token]/   encuesta NPS pública (sin login, por token)
├─ components/    UI; subcarpetas por reporte (clonacion/, implementacion/, tramites/)
├─ context/       Auth, Permissions (useMe), Groups, Data (useData)
├─ lib/           lógica de negocio pura + clientes de servidor
└─ types/index.ts tipos compartidos
apps-script/      código .gs de los WebApps de Google (se pega a mano en script.google.com)
```

**Flujo de datos (Single Fetch):** `DataContext` llama una vez a `/api/dashboard` → el handler hace `Promise.all` a Monday (boards INI, REQ, carpeta de Proyectos), Calendar y Firestore → `buildDashboardData()` ([src/lib/dashboardData.ts](src/lib/dashboardData.ts)) arma el modelo → las páginas leen con `useData()` y navegan como SPA. El botón "Actualizar" del Topbar llama `refresh()`. Las fuentes de ROI (003, Tiempo 0/Clonación, Implementación) tienen endpoints propios bajo `/api/roi/*`.

**Separación servidor / cliente — no la rompas:**

- Solo servidor: [src/lib/monday.ts](src/lib/monday.ts), [src/lib/firebase-admin.ts](src/lib/firebase-admin.ts), `users.ts`, `roles.ts`, `groups.ts`, `surveys.ts`, `gcp-usage.ts`. Nunca los importes desde un componente `"use client"`.
- Los secretos (`MONDAY_API_KEY`, `FIREBASE_ADMIN_*`, URLs de WebApps, `CRON_SECRET`) **no** llevan prefijo `NEXT_PUBLIC_`. Solo la config web de Firebase y `NEXT_PUBLIC_ALLOWED_DOMAIN` son públicas.
- La mayoría de los módulos de `lib/` son **puros** (sin I/O) y se usan en cliente y servidor; ahí va la lógica de negocio y ahí van los tests.

## Patrones a seguir

**Route Handler nuevo** — copia la forma de [src/app/api/proj-status/route.ts](src/app/api/proj-status/route.ts):

```ts
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "mi_accion"); // o requirePage(..., "roi")
    // validar body → 400 con { error: "..." } si falta algo
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err); // traduce "forbidden", "invalid-token", etc. a 401/403/404/409
  }
}
```

Errores de dominio nuevos: lanza `new Error("codigo-kebab")` y agrega el caso en [src/lib/api-errors.ts](src/lib/api-errors.ts).

**Llamadas desde el cliente:** usa `authedFetch()` de [src/lib/api.ts](src/lib/api.ts) (adjunta el ID token de Firebase). No uses `fetch` directo a `/api/*`.

**Permisos:** todo pasa por el catálogo de [src/lib/registry.ts](src/lib/registry.ts).
- Página nueva → una entrada en `PAGES` (y la carpeta en `app/(app)/`). Aparece sola en sidebar, editor de roles y gating.
- Capacidad nueva (escribir en Monday, editar metas…) → una entrada en `ACTIONS` y `requireAction` en el handler. Admin la tiene siempre; a otros roles se les otorga desde `/roles`.
- Roles y grupos del menú son **dinámicos** (Firestore), no se definen en código. `resolvePermissions(stored, groups)` y `buildNav(perms, groups)` siempre reciben la lista de grupos.

**UI:** reutiliza [src/components/ui.tsx](src/components/ui.tsx) (`Loader`, `ErrorBox`, `StatCard`, `Pill`, `EstadoPill`, `SectionHeader`, `FilterReset`, …) y [src/components/Modal.tsx](src/components/Modal.tsx). Colores siempre con variables de tema (`var(--text-muted)`, `var(--ok)`, `var(--warn)`, `var(--bad)`, `var(--accent)`…), nunca hex sueltos, para que funcionen tema claro y oscuro. La paleta de reportes ejecutivos/PDF vive en [src/lib/reportTheme.ts](src/lib/reportTheme.ts).

**Tests:** la lógica nueva en `lib/` lleva su `*.test.ts` al lado (fechas, días hábiles, dinero, KPI, reglas de plantillas). Compara montos en centavos para evitar ruido de punto flotante.

## Dominio — lo que no se deduce del código

- **VALOR** = fases del proyecto: **V**aluación (1), **A**probación (2), **L**aunch (3), **O**peración / Implementación (4), **R**esultado / Beneficio (5).
- **Fuentes en Monday:** board de Iniciativas (INI), board de Requerimientos (REQ, se muestra como "PML"), y una **carpeta** con un board por proyecto (`PM-XXX`). Los boards ocultos "Subitems of PM-XXX" se descartan. Los IDs de board están en [.env.example](.env.example); para leer columnas usa los helpers de [src/lib/monday-cols.ts](src/lib/monday-cols.ts) (`colText`, …) en vez de recorrer `column_values` a mano.
- **Tres plantillas de board de proyecto** conviven. La tercera, *VALOR Lite* (PM-015, PM-016), nombra los grupos con letra (`L | Launch`). Cualquier regla que mire el nombre de un grupo debe pasar por `sinLetraDeFase` / `isFase1..5` ([src/lib/dashboard.ts](src/lib/dashboard.ts)), `esPlantillaLite` ([src/lib/proj.ts](src/lib/proj.ts)) y `valorStageOf` ([src/lib/valorStepper.ts](src/lib/valorStepper.ts)); no compares strings de grupo a mano.
- **KPIs principales:** EVM (SPI/CPI), Beneficio $ Confirmado, Calidad de Entregas, Cumplimiento de Entrega, NPS. El cron semanal (`/api/cron/weekly-snapshot`, lunes 8:00 Guatemala = `0 14 * * 1` UTC) los guarda como histórico y debe producir **los mismos números** que las tarjetas de Control Tower: si cambias un cálculo, cámbialo en la función compartida, no en la página.
- **Fechas:** zona horaria `America/Guatemala` (UTC-6, sin horario de verano). Los días hábiles descuentan asuetos ([src/lib/holidays.ts](src/lib/holidays.ts), [src/lib/business.ts](src/lib/business.ts)).
- **Roles de negocio:** PM, CKU, PKU, Sponsor. La vista de cada uno se recorta en `players.ts` y `sponsorScope.ts`.
- **Escribir en Monday** es una acción con efecto real sobre el tablero del equipo (p. ej. `changeProjStatus`); siempre detrás de una acción de permiso.

## Seguridad

- `.env.local` nunca se versiona (está en `.gitignore`); la plantilla es `.env.example`. Si agregas una variable, agrégala ahí con un comentario.
- Auth: el servidor verifica el ID token con Admin SDK y exige el dominio `@c807.com`. No agregues endpoints sin `requireAction` / `requirePage` / `verifyRequest`, salvo los de encuesta pública por token y el cron (protegido por `CRON_SECRET`).
- Firestore solo se toca desde el servidor (Admin SDK); el cliente no tiene acceso directo.

## Git

- Este directorio (`pmo-app/`) es el repo real: rama `main`, remoto `github.com/cesarvasz/pmo-control-tower`. El repo padre (`PMO CT/`) es solo un contenedor local sin remoto.
- Mensajes de commit en español, con el formato `Área: qué cambia` en la primera línea (p. ej. `Implementación: metas por cliente (Vol × CM1) y % de meta alcanzada`) y un cuerpo que explique el porqué y las decisiones.
- **No hagas push a `main`** salvo que el usuario lo pida explícitamente. Se prueba primero en localhost.
