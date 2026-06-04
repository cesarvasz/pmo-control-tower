# PMO Dashboard

Suite de dashboards PMO construida con **Next.js 16 (App Router)**, **Tailwind CSS** y **Firebase**. Consume datos de **Monday.com** y **Google Calendar** mediante un único fetch seguro del lado del servidor.

## Características

- **Control Tower** — índice de salud del portafolio y resumen por PM.
- **Iniciativas / REQ / Proyectos** — tableros con métricas, filtros, EVM (SPI/CPI) y detalle.
- **Single Fetch seguro** — un Route Handler (`/api/dashboard`) consulta Monday/Calendar en el servidor; la API key nunca llega al cliente.
- **Autenticación** con Firebase (Google + email), restringida a un dominio (`@c807.com`).
- **Roles y permisos dinámicos** — crea roles, define qué ven (páginas) y qué hacen (acciones), y asígnalos a usuarios (Firestore + Admin SDK).

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Estilos | Tailwind CSS v4 |
| Auth + datos de usuarios | Firebase Auth + Firestore (Admin SDK) |
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
   Necesitas: API key de Monday, config de Firebase Web, y un Service Account de Firebase Admin (Project Settings → Service accounts → Generate new private key).

3. **Habilitar Firestore** en la consola de Firebase (Native mode) — requerido por el sistema de roles.

4. **Ejecutar en desarrollo**
   ```bash
   npm run dev
   ```
   Abre <http://localhost:3000>. El primer usuario que inicie sesión se convierte en administrador.

## Estructura

```
src/
├─ app/
│  ├─ (app)/            Páginas protegidas (Control Tower, Iniciativas, REQ, Proyectos, Usuarios, Roles)
│  ├─ api/              Route Handlers (dashboard, me, users, roles)
│  └─ login/            Pantalla de login
├─ components/          UI compartida (Sidebar, Topbar, Modal, MultiSelect…)
├─ context/             Auth / Permissions / Data (React Context, client-side)
├─ lib/                 Lógica de negocio, Monday, Firebase Admin, permisos
└─ types/               Tipos compartidos
```

## Extender el sistema de permisos

Para agregar una página nueva al control de acceso, añade una entrada a `PAGES` en `src/lib/registry.ts`:
aparecerá automáticamente en el editor de roles, el sidebar y el gating.

## Seguridad

- `.env.local` está en `.gitignore` — **nunca** se versiona.
- La API key de Monday y el Service Account viven solo en el servidor.
- El acceso a Firestore pasa únicamente por endpoints del servidor (Admin SDK).
