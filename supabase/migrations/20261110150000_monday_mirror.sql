-- Copia (espejo) de los boards de Monday en Supabase.
-- Monday sigue siendo donde se edita; aquí se guarda la imagen para que la app lea de Supabase.
-- La llena src/lib/mondayMirrorSync.ts: copia completa periódica (reconciliación) y, más
-- adelante, webhooks por item. Ver docs del plan en la memoria del proyecto.

-- ── Boards ──────────────────────────────────────────────────────────────────
-- Un board por fila. Incluye los boards OCULTOS de subitems (tipo 'sub'): sus columnas
-- (título + settings_str) son distintas de las del board padre.
create table public.monday_boards (
  id              text primary key,                 -- id de Monday
  nombre          text not null,
  tipo            text not null check (tipo in ('ini', 'req', 'rh', 'est', 'proj', 'sub')),
  padre_board_id  text references public.monday_boards (id) on delete cascade, -- solo tipo 'sub'
  -- { "<column_id>": { "title": "...", "settings_str": "..." } } — se guardan una vez por
  -- board en vez de repetirlas en cada valor de cada item.
  columnas        jsonb not null default '{}'::jsonb,
  activo          boolean not null default true,    -- false = salió de la carpeta de Proyectos
  version         bigint not null default 0,        -- sube cuando cambia algo del board (para Realtime)
  synced_at       timestamptz,                      -- última copia completa exitosa
  updated_at      timestamptz not null default now()
);

create index monday_boards_padre_idx on public.monday_boards (padre_board_id);

-- ── Items y subitems ────────────────────────────────────────────────────────
create table public.monday_items (
  id                text primary key,               -- id de Monday
  board_id          text not null references public.monday_boards (id) on delete cascade,
  parent_id         text,                           -- null = item; con valor = subitem de ese item
  sub_board_id      text,                           -- subitems: board oculto real (lo exige la mutación de status)
  orden             integer not null,               -- posición en la que Monday los devuelve
  nombre            text not null,
  email             text,
  grupo             text,                           -- título del grupo (null en subitems)
  -- [{ "id": "...", "text": "...", "display_value"?: "..." }] — mismo orden que la API.
  column_values     jsonb not null default '[]'::jsonb,
  synced_at         timestamptz not null default now(),
  deleted_at        timestamptz                     -- ya no está en Monday (borrado/archivado)
);

-- El lector filtra por board y vigentes; los subitems se agrupan por item padre.
create index monday_items_board_vigentes_idx on public.monday_items (board_id, orden) where deleted_at is null;
create index monday_items_parent_idx on public.monday_items (parent_id) where parent_id is not null;

-- ── Bitácora de sincronizaciones ────────────────────────────────────────────
create table public.monday_sync_runs (
  id           bigint generated always as identity primary key,
  tipo         text not null check (tipo in ('completa', 'board', 'item')),
  origen       text not null,                       -- 'cron', 'manual', 'webhook'…
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  detalle      jsonb not null default '{}'::jsonb,  -- conteos por board
  error        text
);

create index monday_sync_runs_started_idx on public.monday_sync_runs (started_at desc);

-- ── Guardar un board completo en una sola transacción ──────────────────────
-- p_board: { id, nombre, tipo, columnas, sub_boards: [{ id, nombre, columnas }] }
--          sub_boards = boards OCULTOS de subitems de este board (tipo 'sub').
-- p_items: [{ id, parent_id, sub_board_id, orden, nombre, email, grupo, column_values }]
--          TODOS los items y subitems vigentes del board (los subitems se guardan con el
--          board_id del board padre, para que una copia del board los cubra completos).
-- Los items del board que ya no vienen se marcan deleted_at; los que vuelven se reviven.
-- Solo sube `version` si algo cambió de verdad. Devuelve los conteos.
create or replace function public.mirror_guardar_board(p_board jsonb, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_board_id     text := p_board ->> 'id';
  v_ids          text[];
  v_cambiados    integer := 0;
  v_borrados     integer := 0;
  v_board_cambio integer := 0;
  v_subs_cambio  integer := 0;
begin
  -- Board (+ sus boards de subitems). "is distinct from" → solo se reescribe si cambió.
  with escritos as (
    insert into public.monday_boards as b (id, nombre, tipo, padre_board_id, columnas, activo, synced_at)
    values (v_board_id, p_board ->> 'nombre', p_board ->> 'tipo', null,
            coalesce(p_board -> 'columnas', '{}'::jsonb), true, now())
    on conflict (id) do update set
      nombre = excluded.nombre, tipo = excluded.tipo, padre_board_id = null,
      columnas = excluded.columnas, activo = true, synced_at = now(), updated_at = now()
    where (b.nombre, b.tipo, b.padre_board_id, b.columnas, b.activo)
          is distinct from (excluded.nombre, excluded.tipo, null::text, excluded.columnas, true)
    returning 1
  )
  select count(*) into v_board_cambio from escritos;

  with subs as (
    select s ->> 'id' as id, s ->> 'nombre' as nombre, coalesce(s -> 'columnas', '{}'::jsonb) as columnas
      from jsonb_array_elements(coalesce(p_board -> 'sub_boards', '[]'::jsonb)) as s
  ), escritos as (
    insert into public.monday_boards as b (id, nombre, tipo, padre_board_id, columnas, activo, synced_at)
    select id, nombre, 'sub', v_board_id, columnas, true, now() from subs
    on conflict (id) do update set
      nombre = excluded.nombre, tipo = 'sub', padre_board_id = excluded.padre_board_id,
      columnas = excluded.columnas, activo = true, synced_at = now(), updated_at = now()
    where (b.nombre, b.tipo, b.padre_board_id, b.columnas, b.activo)
          is distinct from (excluded.nombre, 'sub', excluded.padre_board_id, excluded.columnas, true)
    returning 1
  )
  select count(*) into v_subs_cambio from escritos;

  -- La copia completa sí cuenta como sincronizada aunque nada haya cambiado.
  update public.monday_boards set synced_at = now()
   where id = v_board_id or padre_board_id = v_board_id;

  v_ids := array(select e ->> 'id' from jsonb_array_elements(p_items) as e);

  with entrada as (
    select
      e ->> 'id'                         as id,
      nullif(e ->> 'parent_id', '')      as parent_id,
      nullif(e ->> 'sub_board_id', '')   as sub_board_id,
      (e ->> 'orden')::integer           as orden,
      e ->> 'nombre'                     as nombre,
      nullif(e ->> 'email', '')          as email,
      e ->> 'grupo'                      as grupo,
      coalesce(e -> 'column_values', '[]'::jsonb) as column_values
    from jsonb_array_elements(p_items) as e
  ), escritos as (
    insert into public.monday_items as i
      (id, board_id, parent_id, sub_board_id, orden, nombre, email, grupo, column_values, synced_at, deleted_at)
    select id, v_board_id, parent_id, sub_board_id, orden, nombre, email, grupo, column_values, now(), null
      from entrada
    on conflict (id) do update set
      board_id      = excluded.board_id,
      parent_id     = excluded.parent_id,
      sub_board_id  = excluded.sub_board_id,
      orden         = excluded.orden,
      nombre        = excluded.nombre,
      email         = excluded.email,
      grupo         = excluded.grupo,
      column_values = excluded.column_values,
      synced_at     = now(),
      deleted_at    = null
    -- Solo se reescribe la fila si cambió algo: así el conteo dice si el board cambió.
    where (i.board_id, i.parent_id, i.sub_board_id, i.orden, i.nombre, i.email, i.grupo, i.column_values, i.deleted_at)
          is distinct from
          (excluded.board_id, excluded.parent_id, excluded.sub_board_id, excluded.orden, excluded.nombre,
           excluded.email, excluded.grupo, excluded.column_values, null::timestamptz)
    returning 1
  )
  select count(*) into v_cambiados from escritos;

  -- Lo que ya no vino de Monday: borrado suave.
  with borrados as (
    update public.monday_items i
       set deleted_at = now()
     where i.board_id = v_board_id
       and i.deleted_at is null
       and not (i.id = any (v_ids))
    returning 1
  )
  select count(*) into v_borrados from borrados;

  v_board_cambio := v_board_cambio + v_subs_cambio;
  if v_cambiados > 0 or v_borrados > 0 or v_board_cambio > 0 then
    update public.monday_boards set version = version + 1 where id = v_board_id;
  end if;

  return jsonb_build_object(
    'board_id',  v_board_id,
    'items',     jsonb_array_length(p_items),
    'cambiados', v_cambiados,
    'borrados',  v_borrados,
    'board_cambio', v_board_cambio > 0
  );
end;
$$;

-- Boards de Proyectos que ya no están en la carpeta: se apagan (no se borran sus items).
create or replace function public.mirror_desactivar_boards(p_tipo text, p_vigentes text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v integer;
begin
  update public.monday_boards
     set activo = false, version = version + 1, updated_at = now()
   where tipo = p_tipo and activo and not (id = any (p_vigentes));
  get diagnostics v = row_count;
  return v;
end;
$$;

-- ── Permisos: igual que el resto del esquema (solo el servidor con service_role) ──
alter table public.monday_boards    enable row level security;
alter table public.monday_items     enable row level security;
alter table public.monday_sync_runs enable row level security;

revoke all on table public.monday_boards    from anon, authenticated;
revoke all on table public.monday_items     from anon, authenticated;
revoke all on table public.monday_sync_runs from anon, authenticated;

grant select, insert, update, delete on table public.monday_boards    to service_role;
grant select, insert, update, delete on table public.monday_items     to service_role;
grant select, insert, update, delete on table public.monday_sync_runs to service_role;

revoke execute on function public.mirror_guardar_board(jsonb, jsonb)   from public, anon, authenticated;
revoke execute on function public.mirror_desactivar_boards(text, text[]) from public, anon, authenticated;
grant  execute on function public.mirror_guardar_board(jsonb, jsonb)   to service_role;
grant  execute on function public.mirror_desactivar_boards(text, text[]) to service_role;
