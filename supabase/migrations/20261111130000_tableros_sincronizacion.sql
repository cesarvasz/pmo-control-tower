-- Tableros · Fase 5 (convivencia con Monday): sincronización que FUSIONA lo que hay en Monday con
-- los tableros ya importados. Monday manda en los datos; la app, en el modelo (ver
-- docs/tableros/diseno.md §8).

-- 1) Qué tableros se sincronizan. Mientras esté en true, los datos que vienen de Monday (elementos
--    con monday_item_id y columnas con monday_column_id) son de solo lectura en la app.
alter table public.tableros
  add column if not exists sincroniza_monday boolean not null default false;

update public.tableros set sincroniza_monday = true
where monday_board_id is not null and archivado_at is null;

-- 2) Grupos: la clave del grupo en Monday. La copia (monday_items.grupo) solo trae el TÍTULO del
--    grupo, así que esa es la clave; con ella el grupo se reconoce aunque se renombre en la app.
comment on column public.tablero_grupos.monday_group_id is
  'Grupo de Monday del que viene (su título en la copia monday_items.grupo); null si nació en la app.';

update public.tablero_grupos g set monday_group_id = g.titulo
from public.tableros t
where g.tablero_id = t.id and t.monday_board_id is not null and g.monday_group_id is null;

-- 3) Registro de corridas. Solo puede haber UNA en curso (índice único parcial = candado).
create table if not exists public.tablero_sincronizaciones (
  id        bigint generated always as identity primary key,
  origen    text not null check (origen in ('manual', 'programada')),
  inicio    timestamptz not null default now(),
  fin       timestamptz,
  estado    text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'con_errores', 'fallo')),
  resumen   jsonb not null default '{}'::jsonb,
  error     text
);

create unique index if not exists tablero_sincronizaciones_una_en_curso
  on public.tablero_sincronizaciones ((true)) where estado = 'en_curso';
create index if not exists tablero_sincronizaciones_inicio
  on public.tablero_sincronizaciones (inicio desc);

-- Igual que el resto de Tableros: solo el servidor (service_role) la lee y escribe.
alter table public.tablero_sincronizaciones enable row level security;
revoke all on public.tablero_sincronizaciones from anon, authenticated;
