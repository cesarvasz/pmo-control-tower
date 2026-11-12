-- Tableros · campos PROPIOS del directorio (decisión del usuario 2026-11-12).
-- El directorio sigue siendo una tabla con sus campos fijos (nombre, correo, grupo, rol, TLD,
-- horas/mes; los trae el Directorio RH), pero se le pueden agregar campos nuevos (p. ej. País,
-- Área) que se llenan en la app y se muestran en los tableros con una columna Espejo.
--   directorio_campos  la definición de cada campo (título, tipo, opciones si es lista)
--   personas.extra     los valores de cada persona: { "<id del campo>": valor }
-- La sincronización con el Directorio RH no toca personas.extra (solo escribe los campos fijos).

create table if not exists public.directorio_campos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  tipo         text not null check (tipo in ('texto', 'numero', 'fecha', 'lista')),
  opciones     jsonb not null default '[]'::jsonb,
  orden        integer not null default 0,
  creado_at    timestamptz not null default now(),
  creado_por   text,
  archivado_at timestamptz
);

-- Dos campos vigentes no pueden llamarse igual (sin importar mayúsculas).
create unique index if not exists directorio_campos_titulo_unico
  on public.directorio_campos (lower(titulo)) where archivado_at is null;

alter table public.personas add column if not exists extra jsonb not null default '{}'::jsonb;

comment on table public.directorio_campos is 'Campos propios del directorio (además de los que vienen del Directorio RH).';
comment on column public.personas.extra is 'Valores de los campos propios del directorio: { id del campo: valor }.';

-- Igual que el resto de Tableros: solo el servidor (service_role) la lee y escribe.
alter table public.directorio_campos enable row level security;
revoke all on public.directorio_campos from anon, authenticated;
