-- Tableros propios — Fase 1. Diseño: docs/tableros/diseno.md
--
-- tablero_historial            quién cambió qué y cuándo (valores, nombre, creación, archivo, movimientos)
-- tablero_cambiar_valor        cambia UNA celda y deja su historial en la misma transacción. Escribe
--                              solo esa llave del jsonb (dos personas editando celdas distintas del
--                              mismo elemento no se pisan) y mantiene `responsables` al día.
-- tablero_recalcular_responsables  vuelve a calcular `responsables` de todo un tablero (cuando una
--                              columna gana o pierde el rol Responsable).

create table public.tablero_historial (
  id            bigint generated always as identity primary key,
  tablero_id    uuid not null references public.tableros (id) on delete cascade,
  elemento_id   uuid references public.elementos (id) on delete cascade,
  columna_id    uuid references public.tablero_columnas (id) on delete set null,
  campo         text not null,      -- valor · nombre · creado · archivado · movido
  antes         jsonb,
  despues       jsonb,
  usuario_id    uuid,
  usuario_email text,
  creado_at     timestamptz not null default now()
);
create index tablero_historial_elemento_idx on public.tablero_historial (elemento_id, creado_at desc);
create index tablero_historial_tablero_idx  on public.tablero_historial (tablero_id, creado_at desc);
create index tablero_historial_columna_idx  on public.tablero_historial (columna_id);

alter table public.tablero_historial enable row level security;
revoke all on table public.tablero_historial from anon, authenticated;
grant select, insert, update, delete on table public.tablero_historial to service_role;

-- Ids de persona de un valor de columna Persona (["uuid", …]); cualquier otra cosa → vacío.
create function public.tablero_ids_persona(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(x::uuid), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) as t(x)
  where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- p_valor ya viene validado por el servidor (registro de tipos); null = vaciar la celda.
create function public.tablero_cambiar_valor(
  p_elemento uuid,
  p_columna  uuid,
  p_valor    jsonb,
  p_usuario  uuid,
  p_email    text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tablero uuid;
  v_antes   jsonb;
  v_nivel   text;
  v_rol     text;
begin
  select e.tablero_id, e.valores -> (p_columna::text), case when e.parent_id is null then 'item' else 'sub' end
    into v_tablero, v_antes, v_nivel
  from public.elementos e
  where e.id = p_elemento and e.archivado_at is null
  for update;
  if not found then raise exception 'elemento-no-encontrado'; end if;

  select c.rol into v_rol
  from public.tablero_columnas c
  where c.id = p_columna and c.tablero_id = v_tablero and c.nivel = v_nivel and c.archivada_at is null;
  if not found then raise exception 'columna-no-encontrada'; end if;

  if v_antes is not distinct from p_valor then return false; end if;

  update public.elementos e
     set valores = case when p_valor is null then e.valores - (p_columna::text)
                        else jsonb_set(e.valores, array[p_columna::text], p_valor) end,
         responsables = case when v_rol = 'responsable' then public.tablero_ids_persona(p_valor) else e.responsables end,
         actualizado_at = now()
   where e.id = p_elemento;

  insert into public.tablero_historial (tablero_id, elemento_id, columna_id, campo, antes, despues, usuario_id, usuario_email)
  values (v_tablero, p_elemento, p_columna, 'valor', v_antes, p_valor, p_usuario, p_email);
  return true;
end;
$$;

create function public.tablero_recalcular_responsables(p_tablero uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  with nuevo as (
    select e.id,
           coalesce((
             select public.tablero_ids_persona(e.valores -> (c.id::text))
             from public.tablero_columnas c
             where c.tablero_id = e.tablero_id and c.rol = 'responsable' and c.archivada_at is null
               and c.nivel = case when e.parent_id is null then 'item' else 'sub' end
             limit 1
           ), '{}') as responsables
    from public.elementos e
    where e.tablero_id = p_tablero
  )
  update public.elementos e
     set responsables = n.responsables
    from nuevo n
   where e.id = n.id and e.responsables is distinct from n.responsables;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.tablero_ids_persona(jsonb)                          from public, anon, authenticated;
revoke execute on function public.tablero_cambiar_valor(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.tablero_recalcular_responsables(uuid)                from public, anon, authenticated;
grant  execute on function public.tablero_ids_persona(jsonb)                          to service_role;
grant  execute on function public.tablero_cambiar_valor(uuid, uuid, jsonb, uuid, text) to service_role;
grant  execute on function public.tablero_recalcular_responsables(uuid)                to service_role;
