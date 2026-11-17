-- Google Calendar · agendar las reuniones (Meeting 1 y Meeting 2) de las iniciativas desde la app. Fase 1: datos y secretos.
--
-- google_conexiones    la cuenta de Google que cada usuario de la app conectó (OAuth por usuario). El REFRESH TOKEN
--                      no se guarda aquí: vive cifrado en el Vault de Supabase y esta tabla solo apunta a él (secreto_id).
-- reuniones            cada reunión agendada. La BD es la fuente de lectura del calendario del dashboard (ya no el Apps
--                      Script); conserva el id del evento de Google para poder editarlo y cancelarlo.
-- google_guardar_conexion / google_leer_token   únicas puertas al Vault (solo service_role, o sea, el servidor).
--
-- Un usuario conecta UNA cuenta de Google. Al desconectar se borra la fila y, por el trigger, su secreto del Vault; las
-- reuniones ya agendadas se conservan (organizador_email queda como rastro).

create table public.google_conexiones (
  usuario_id     uuid primary key references public.app_users (id) on delete cascade,
  google_email   text not null,
  google_sub     text not null,            -- id estable de la cuenta de Google (el correo puede cambiar)
  secreto_id     uuid not null,            -- vault.secrets.id del refresh token
  scopes         text[] not null default '{}',
  estado         text not null default 'activa' check (estado in ('activa', 'reconectar')),
  ultimo_error   text,
  conectado_at   timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create table public.reuniones (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null check (codigo ~ '^IN-[0-9]+$'),   -- Ini ID de la iniciativa (IN-158), la misma llave del calendario de hoy
  tipo               text not null check (tipo in ('M1', 'M2')),
  elemento_id        uuid references public.elementos (id) on delete set null,   -- null en las históricas que no están en los tableros
  titulo             text not null,
  descripcion        text,
  inicio             timestamptz not null,
  fin                timestamptz not null,
  zona               text not null default 'America/Guatemala',      -- zona IANA con la que se eligió la hora (inicio y fin van en UTC)
  invitados          jsonb not null default '[]'::jsonb check (jsonb_typeof(invitados) = 'array'),   -- [{ personaId, email, nombre }]
  estado             text not null default 'agendada' check (estado in ('agendada', 'cancelada')),
  origen             text not null default 'app' check (origen in ('app', 'google', 'apps-script')),   -- creada aquí · reconocida en Google · importada del Apps Script
  organizador_id     uuid references public.app_users (id) on delete set null,
  organizador_email  text,
  google_calendar_id text,
  google_event_id    text,
  google_etag        text,
  meet_url           text,
  enlace_google      text,
  cancelada_at       timestamptz,
  creado_por         uuid,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  constraint reuniones_fin_despues_de_inicio check (fin > inicio),
  -- el mismo evento de Google no puede estar dos veces (los null no chocan entre sí)
  constraint reuniones_evento_unico unique (organizador_id, google_event_id)
);

-- Una sola reunión vigente por iniciativa y tipo cuando se agenda desde la app (también frena el doble clic).
create unique index reuniones_una_vigente_por_tipo on public.reuniones (codigo, tipo)
  where estado = 'agendada' and origen = 'app';
create index reuniones_codigo_idx      on public.reuniones (codigo, tipo) where estado = 'agendada';
create index reuniones_elemento_idx    on public.reuniones (elemento_id);
create index reuniones_organizador_idx on public.reuniones (organizador_id);

alter table public.google_conexiones enable row level security;
alter table public.reuniones         enable row level security;
revoke all on table public.google_conexiones from anon, authenticated;
revoke all on table public.reuniones         from anon, authenticated;
grant select, insert, update, delete on table public.google_conexiones to service_role;
grant select, insert, update, delete on table public.reuniones         to service_role;

-- ── Vault ─────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque el Vault no se abre con la llave del servidor; por eso NADIE más que service_role puede ejecutarlas.

-- Guarda (o renueva) la conexión del usuario y su refresh token, todo en una transacción (sin secretos huérfanos).
create function public.google_guardar_conexion(
  p_usuario       uuid,
  p_google_email  text,
  p_google_sub    text,
  p_scopes        text[],
  p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto uuid;
begin
  if coalesce(p_refresh_token, '') = '' then raise exception 'token-vacio'; end if;

  select c.secreto_id into v_secreto from public.google_conexiones c where c.usuario_id = p_usuario for update;
  if v_secreto is not null and not exists (select 1 from vault.secrets s where s.id = v_secreto) then
    v_secreto := null;   -- el secreto ya no está (alguien lo borró a mano): se crea uno nuevo
  end if;

  if v_secreto is null then
    v_secreto := vault.create_secret(p_refresh_token, 'google_refresh_' || p_usuario::text, 'Refresh token de Google Calendar del usuario ' || p_usuario::text);
  else
    perform vault.update_secret(v_secreto, p_refresh_token);
  end if;

  insert into public.google_conexiones (usuario_id, google_email, google_sub, secreto_id, scopes, estado, ultimo_error, conectado_at, actualizado_at)
  values (p_usuario, lower(p_google_email), p_google_sub, v_secreto, coalesce(p_scopes, '{}'), 'activa', null, now(), now())
  on conflict (usuario_id) do update
    set google_email = excluded.google_email, google_sub = excluded.google_sub, secreto_id = excluded.secreto_id,
        scopes = excluded.scopes, estado = 'activa', ultimo_error = null, conectado_at = now(), actualizado_at = now();
end;
$$;

-- El refresh token en claro (solo el servidor, solo para pedirle un access token a Google). null = no hay conexión.
create function public.google_leer_token(p_usuario uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select s.decrypted_secret
  from public.google_conexiones c
  join vault.decrypted_secrets s on s.id = c.secreto_id
  where c.usuario_id = p_usuario
$$;

-- Al borrar la conexión (desconectar, o borrar al usuario en cascada) se borra también su secreto.
create function public.google_conexiones_borrar_secreto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets s where s.id = old.secreto_id;
  return old;
end;
$$;

create trigger google_conexiones_borrar_secreto
  after delete on public.google_conexiones
  for each row execute function public.google_conexiones_borrar_secreto();

revoke execute on function public.google_guardar_conexion(uuid, text, text, text[], text) from public, anon, authenticated;
revoke execute on function public.google_leer_token(uuid)                                 from public, anon, authenticated;
revoke execute on function public.google_conexiones_borrar_secreto()                      from public, anon, authenticated;
grant  execute on function public.google_guardar_conexion(uuid, text, text, text[], text) to service_role;
grant  execute on function public.google_leer_token(uuid)                                 to service_role;
