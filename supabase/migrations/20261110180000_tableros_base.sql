-- Tableros propios — Fase 0 (base). Diseño: docs/tableros/diseno.md
--
-- Tablas para que la app tenga sus propios tableros y deje de depender de Monday:
--   personas          directorio (antes Directorio RH de Monday), ligado a app_users → "solo lo mío"
--   plantillas        definiciones reutilizables (grupos, columnas con roles, items base)
--   tableros          cada tablero
--   tablero_grupos    grupos / fases
--   tablero_columnas  columnas de items y de subitems (tipo + rol + config)
--   elementos         items y subitems en una sola tabla; valores en jsonb {columna_id: valor}
--   tablero_permisos  permisos por rol, para un tablero o para toda una categoría
--
-- Tipos de columna, roles y categorías NO se validan con CHECK en la base: viven en registros del
-- código (src/features/tableros/dominio). Así agregar uno nuevo no necesita migración.
-- Igual que el resto del esquema: RLS activo sin políticas, solo service_role lee y escribe.

-- ── Directorio de personas ───────────────────────────────────────────────────
create table public.personas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  email          text,
  grupo          text,              -- Equipo CKU, Sponsor, PMO, Equipo Desarrollo Interno…
  rol            text,              -- CKU, PKU, PM, DEV, BI, SPONSOR…
  tld            text,
  hrs_mes        numeric,
  activo         boolean not null default true,
  app_user_id    uuid references public.app_users (id) on delete set null,
  monday_item_id text unique,       -- item del Directorio RH del que salió (importación)
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create unique index personas_email_unico    on public.personas (lower(email)) where email is not null;
create unique index personas_app_user_unico on public.personas (app_user_id)  where app_user_id is not null;

-- ── Plantillas ───────────────────────────────────────────────────────────────
create table public.plantillas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  descripcion       text,
  categoria         text not null default 'libre',
  version           integer not null default 1,
  definicion        jsonb not null default '{}'::jsonb,
  tablero_origen_id uuid,           -- FK abajo (tableros se crea después)
  creado_por        uuid,
  creado_at         timestamptz not null default now(),
  actualizado_at    timestamptz not null default now(),
  archivada_at      timestamptz
);

-- ── Tableros ─────────────────────────────────────────────────────────────────
create table public.tableros (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  codigo          text,             -- PM-001…
  categoria       text not null default 'libre',
  descripcion     text,
  plantilla_id    uuid references public.plantillas (id) on delete set null,
  monday_board_id text unique,
  creado_por      uuid,
  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now(),
  archivado_at    timestamptz
);
create index tableros_plantilla_idx on public.tableros (plantilla_id);
create index tableros_categoria_idx on public.tableros (categoria) where archivado_at is null;

alter table public.plantillas
  add constraint plantillas_tablero_origen_fk
  foreign key (tablero_origen_id) references public.tableros (id) on delete set null;
create index plantillas_tablero_origen_idx on public.plantillas (tablero_origen_id);

-- ── Grupos (fases) ───────────────────────────────────────────────────────────
create table public.tablero_grupos (
  id              uuid primary key default gen_random_uuid(),
  tablero_id      uuid not null references public.tableros (id) on delete cascade,
  titulo          text not null,
  color           text,
  orden           double precision not null default 0,
  fase            text check (fase in ('V', 'A', 'L', 'O', 'R')),
  monday_group_id text,
  archivado_at    timestamptz
);
create index tablero_grupos_tablero_idx on public.tablero_grupos (tablero_id, orden);

-- ── Columnas ─────────────────────────────────────────────────────────────────
create table public.tablero_columnas (
  id               uuid primary key default gen_random_uuid(),
  tablero_id       uuid not null references public.tableros (id) on delete cascade,
  nivel            text not null default 'item' check (nivel in ('item', 'sub')),
  titulo           text not null,
  tipo             text not null,   -- clave de TIPOS_COLUMNA
  rol              text,            -- clave de ROLES_COLUMNA (opcional)
  config           jsonb not null default '{}'::jsonb,
  orden            double precision not null default 0,
  ancho            integer,
  oculta           boolean not null default false,
  monday_column_id text,
  archivada_at     timestamptz
);
create index tablero_columnas_tablero_idx on public.tablero_columnas (tablero_id, nivel, orden);
-- Un rol se usa una sola vez por nivel en cada tablero (una sola "Fecha límite"…).
create unique index tablero_columnas_rol_unico on public.tablero_columnas (tablero_id, nivel, rol)
  where rol is not null and archivada_at is null;

-- ── Elementos (items y subitems) ─────────────────────────────────────────────
create table public.elementos (
  id             uuid primary key default gen_random_uuid(),
  tablero_id     uuid not null references public.tableros (id) on delete cascade,
  grupo_id       uuid references public.tablero_grupos (id) on delete restrict,
  parent_id      uuid references public.elementos (id) on delete cascade,
  nombre         text not null default '',
  orden          double precision not null default 0,
  valores        jsonb not null default '{}'::jsonb,   -- { columna_id: valor }
  responsables   uuid[] not null default '{}',         -- copia de la columna con rol Responsable (personas.id)
  creado_por     uuid,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  archivado_at   timestamptz,
  monday_item_id text unique,
  -- Un item va en un grupo; un subitem cuelga de su item y no tiene grupo.
  constraint elementos_grupo_o_padre check ((parent_id is null) = (grupo_id is not null))
);
create index elementos_tablero_idx      on public.elementos (tablero_id, grupo_id, orden) where archivado_at is null;
create index elementos_grupo_idx        on public.elementos (grupo_id);
create index elementos_parent_idx       on public.elementos (parent_id);
create index elementos_responsables_idx on public.elementos using gin (responsables);

-- ── Permisos por rol ─────────────────────────────────────────────────────────
-- Una regla aplica a UN tablero o a TODA una categoría. La del tablero gana sobre la de su
-- categoría ('ninguno' sirve para quitarle a un rol un tablero que su categoría sí le da).
create table public.tablero_permisos (
  id                 uuid primary key default gen_random_uuid(),
  rol_id             text not null references public.roles (id) on delete cascade,
  tablero_id         uuid references public.tableros (id) on delete cascade,
  categoria          text,
  nivel              text not null check (nivel in ('ninguno', 'ver', 'editar_valores', 'editar_estructura', 'administrar')),
  columnas_editables text[] not null default '{}',     -- roles o ids de columna; vacío = todas
  solo_lo_mio        boolean not null default false,
  actualizado_por    text,
  actualizado_at     timestamptz not null default now(),
  constraint tablero_permisos_alcance check ((tablero_id is null) <> (categoria is null))
);
create unique index tablero_permisos_tablero_unico   on public.tablero_permisos (rol_id, tablero_id) where tablero_id is not null;
create unique index tablero_permisos_categoria_unico on public.tablero_permisos (rol_id, categoria)  where categoria is not null;
create index tablero_permisos_tablero_idx on public.tablero_permisos (tablero_id);

-- ── Seguridad: solo el servidor (service_role) ───────────────────────────────
alter table public.personas         enable row level security;
alter table public.plantillas       enable row level security;
alter table public.tableros         enable row level security;
alter table public.tablero_grupos   enable row level security;
alter table public.tablero_columnas enable row level security;
alter table public.elementos        enable row level security;
alter table public.tablero_permisos enable row level security;

revoke all on table public.personas         from anon, authenticated;
revoke all on table public.plantillas       from anon, authenticated;
revoke all on table public.tableros         from anon, authenticated;
revoke all on table public.tablero_grupos   from anon, authenticated;
revoke all on table public.tablero_columnas from anon, authenticated;
revoke all on table public.elementos        from anon, authenticated;
revoke all on table public.tablero_permisos from anon, authenticated;

grant select, insert, update, delete on table public.personas         to service_role;
grant select, insert, update, delete on table public.plantillas       to service_role;
grant select, insert, update, delete on table public.tableros         to service_role;
grant select, insert, update, delete on table public.tablero_grupos   to service_role;
grant select, insert, update, delete on table public.tablero_columnas to service_role;
grant select, insert, update, delete on table public.elementos        to service_role;
grant select, insert, update, delete on table public.tablero_permisos to service_role;
