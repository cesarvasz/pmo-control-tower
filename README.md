# PMO Dashboard

Suite de dashboards PMO construida con **Next.js 16 (App Router)**, **Tailwind CSS** y **Supabase**. Consume datos de **Monday.com** y **Google Calendar** mediante un único fetch seguro del lado del servidor.

## Características

- **Control Tower** — índice de salud del portafolio y resumen por PM.
- **Iniciativas / REQ / Proyectos** — tableros con métricas, filtros, EVM (SPI/CPI) y detalle.
- **Single Fetch seguro** — un Route Handler (`/api/dashboard`) consulta Monday/Calendar en el servidor; la API key nunca llega al cliente.
- **Autenticación** con Supabase Auth (Google + correo y contraseña), restringida a un dominio (`@c807.com`). Las cuentas nuevas entran «En espera» hasta que un Admin les asigna rol.
- **Roles y permisos dinámicos** — crea roles, define qué ven (páginas) y qué hacen (acciones), y asígnalos a usuarios (Supabase, solo desde el servidor).

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Estilos | Tailwind CSS v4 |
| Auth + datos de la app | Supabase (Auth + Postgres; el servidor usa la secret key) |
| Fuente de datos | Monday.com GraphQL + Google Apps Script (Calendar) |

## Puesta en marcha

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno** — copia la plantilla y rellena los valores:
   ```bash
   cp .env.example .env.local
   ```
   Necesitas: API key de Monday y las llaves de Supabase (Project Settings → API Keys: URL, publishable key y secret key).

3. **Esquema de la base**: las migraciones están en `supabase/migrations/` (ya aplicadas en el proyecto de producción).

4. **Ejecutar en desarrollo**
   ```bash
   npm run dev
   ```
   Abre <http://localhost:3000>. Una cuenta nueva entra «En espera»: un Admin le asigna rol desde `/usuarios`.

## Estructura

```
src/
├─ app/
│  ├─ (app)/            Páginas protegidas (Control Tower, Iniciativas, REQ, Proyectos, Usuarios, Roles)
│  ├─ api/              Route Handlers (dashboard, me, users, roles)
│  └─ login/            Pantalla de login
├─ components/          UI compartida (Sidebar, Topbar, Modal, MultiSelect…)
├─ context/             Auth / Permissions / Data (React Context, client-side)
├─ lib/                 Lógica de negocio, Monday, Supabase (store.ts), permisos
└─ types/               Tipos compartidos
```

## Extender el sistema de permisos

Para agregar una página nueva al control de acceso, añade una entrada a `PAGES` en `src/lib/registry.ts`:
aparecerá automáticamente en el editor de roles, el sidebar y el gating.

## Seguridad

- `.env.local` está en `.gitignore` — **nunca** se versiona.
- La API key de Monday y la secret key de Supabase viven solo en el servidor.
- Las tablas de Supabase tienen RLS sin políticas: solo el servidor (secret key) las lee y escribe; el navegador solo usa Supabase Auth.
