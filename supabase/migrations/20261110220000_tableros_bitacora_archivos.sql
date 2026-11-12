-- Tableros propios — Fase 3: bitácora (antes "Updates" de Monday) y archivos.
-- Diseño: docs/tableros/diseno.md

-- ── Bitácora ─────────────────────────────────────────────────────────────────
create table public.elemento_comentarios (
  id               uuid primary key default gen_random_uuid(),
  tablero_id       uuid not null references public.tableros (id) on delete cascade,
  elemento_id      uuid not null references public.elementos (id) on delete cascade,
  autor_id         uuid,             -- usuario de la app (null en lo importado de Monday)
  autor_email      text,
  autor_nombre     text not null default '',
  texto            text not null,
  creado_at        timestamptz not null default now(),
  editado_at       timestamptz,
  borrado_at       timestamptz,
  monday_update_id text unique
);
create index elemento_comentarios_elemento_idx on public.elemento_comentarios (elemento_id, creado_at desc) where borrado_at is null;
create index elemento_comentarios_tablero_idx  on public.elemento_comentarios (tablero_id);

-- ── Archivos (el contenido vive en Storage, bucket privado "tableros") ───────
create table public.elemento_archivos (
  id              uuid primary key default gen_random_uuid(),
  tablero_id      uuid not null references public.tableros (id) on delete cascade,
  elemento_id     uuid not null references public.elementos (id) on delete cascade,
  columna_id      uuid references public.tablero_columnas (id) on delete set null,
  ruta            text not null unique,   -- ruta dentro del bucket
  nombre          text not null,
  tamano          bigint,
  tipo_mime       text,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'listo')),
  subido_por      uuid,
  subido_email    text,
  creado_at       timestamptz not null default now(),
  borrado_at      timestamptz,
  monday_asset_id text unique
);
create index elemento_archivos_elemento_idx on public.elemento_archivos (elemento_id) where borrado_at is null;
create index elemento_archivos_tablero_idx  on public.elemento_archivos (tablero_id);
create index elemento_archivos_columna_idx  on public.elemento_archivos (columna_id);

alter table public.elemento_comentarios enable row level security;
alter table public.elemento_archivos    enable row level security;
revoke all on table public.elemento_comentarios from anon, authenticated;
revoke all on table public.elemento_archivos    from anon, authenticated;
grant select, insert, update, delete on table public.elemento_comentarios to service_role;
grant select, insert, update, delete on table public.elemento_archivos    to service_role;

-- Bucket privado: sin políticas en storage.objects para anon/authenticated. El servidor (service_role)
-- da URLs firmadas de subida y descarga después de revisar permisos. Límite 50 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tableros', 'tableros', false, 52428800)
on conflict (id) do nothing;
