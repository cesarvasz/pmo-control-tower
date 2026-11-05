-- ─────────────────────────────────────────────────────────────────────────────
-- PMO Control Tower · esquema inicial (migración desde Firestore)
--
-- Modelo de acceso: SOLO el servidor (Route Handlers con la secret key, rol
-- service_role) lee y escribe. Todas las tablas tienen RLS activo y NINGUNA
-- política, y se les quitan los permisos a anon/authenticated: aunque alguien
-- tenga la publishable key o una sesión válida, no ve nada. Es el mismo modelo
-- que hoy («el cliente no toca la BD»).
--
-- Convenciones:
--   · Ids que vienen de Monday (boards, items, REQ) son `text`.
--   · updated_by / created_by = correo de quien hizo el cambio.
--   · Montos y notas en `numeric` sin escala: no se redondea nada de lo que
--     viene de Firestore (los KPI deben dar idéntico tras la migración).
--   · Meses "YYYY-MM" como text con check; días como `date`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Usuarios, roles y grupos del menú ────────────────────────────────────────

create table public.roles (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  -- { pages: {key: bool}, actions: {key: bool}, groups: {groupId: bool} }
  permissions jsonb not null default '{"pages":{},"actions":{},"groups":{}}'::jsonb
              check (jsonb_typeof(permissions) = 'object'),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.menu_groups (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  icon        text not null default '🗂',
  page_keys   text[] not null default '{}',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Perfil de la app. El id ES el del usuario de Supabase Auth.
create table public.app_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique check (email = lower(email)),
  display_name  text not null default '',
  -- restrict: no se puede borrar un rol asignado (hoy lo valida deleteRole → "role-in-use").
  role_id       text references public.roles (id) on delete restrict,
  default_page  text,
  -- uid que tenía en Firebase Auth (trazabilidad de la migración; null en usuarios nuevos).
  firebase_uid  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index app_users_role_id_idx on public.app_users (role_id);

-- ── Baselines de costo (EV / CPI) ────────────────────────────────────────────

create table public.req_baselines (
  req_id    text primary key,
  cost_rh   numeric not null default 0,
  cost_sft  numeric not null default 0,
  saved_at  timestamptz not null default now()
);

create table public.proj_item_baselines (
  item_id   text primary key,
  board_id  text not null,
  cost      numeric not null default 0,
  saved_at  timestamptz not null default now()
);

-- ── Atribuciones de responsable ──────────────────────────────────────────────
-- Une las 4 colecciones de Firestore (delay_, reproceso_, cku_delay_,
-- cku_reproceso_attributions): misma forma, distinto `kind`.

create table public.responsible_attributions (
  kind         text not null check (kind in ('delay', 'reproceso', 'delay-cku', 'reproceso-cku')),
  item_id      text not null,
  responsible  text not null,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (kind, item_id)
);

-- ── Calificaciones que pone un Admin ─────────────────────────────────────────

create table public.metodologia_califs (
  key         text primary key,   -- tal cual el id del doc en Firestore
  score       numeric not null check (score between 0 and 100),
  comentario  text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- Antes: un doc por mes con el mapa `notas`. Ahora: una fila por (mes, indicador),
-- así calificar un indicador no pisa a otro (lo que hacía el merge de Firestore).
create table public.vpa_califs (
  mes         text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  indicador   text not null,
  nota        numeric not null check (nota between 0 and 100),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (mes, indicador)
);

-- ── Metas de Implementación (pestaña Implementación de ROI) ──────────────────
-- Antes: un solo doc `implementacion_metas/actual`. Se guardan SIEMPRE juntas
-- (reemplazo completo) con la función guardar_metas_implementacion().

create table public.implementacion_metas_cliente (
  cliente     text primary key,
  vol         numeric not null check (vol >= 0),
  cm1         numeric not null check (cm1 >= 0),
  desde       text check (desde ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table public.implementacion_objetivos (
  mes         text primary key check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  objetivo    numeric not null check (objetivo > 0),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ── On Hold (Proyectos y PML fuera de toda métrica) ──────────────────────────
-- Antes: doc `on_hold/actual` con dos mapas. Ahora: una fila por pausa.
-- created_by/created_at = quién y cuándo lo pausó (no cambian al editar el motivo).

create table public.on_hold (
  tipo        text not null check (tipo in ('proyecto', 'pml')),
  id          text not null,      -- id de board (proyecto) o de item (pml)
  motivo      text not null default '',
  created_by  text not null,
  created_at  timestamptz not null default now(),
  primary key (tipo, id)
);

-- ── Textos editables del Resumen Ejecutivo / Status Card ─────────────────────

create table public.atraso_detalles (
  item_id             text primary key,
  -- [{ dias, resp, actual? }]
  reparto             jsonb check (reparto is null or jsonb_typeof(reparto) = 'array'),
  -- formato viejo (un solo rol); solo se lee si no hay reparto. Desaparece al re-guardar.
  responsable_legacy  text,
  motivo              text not null default '',
  updated_by          text,
  updated_at          timestamptz not null default now()
);

create table public.board_alcance (
  board_id    text primary key,
  alcance     text not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- Clase A/B/C de Proyectos (id de board) y PML (id de item).
create table public.clasificacion (
  id          text primary key,
  clase       text not null check (clase in ('A', 'B', 'C')),
  updated_by  text not null,
  updated_at  timestamptz not null default now()
);

-- ── Control Tower ────────────────────────────────────────────────────────────

create table public.weekly_snapshots (
  week_of               date primary key,   -- lunes de la semana
  evm                   numeric,
  beneficio_confirmado  numeric not null default 0,
  calidad               numeric,
  cumplimiento          numeric,
  nps                   numeric,
  created_at            timestamptz not null default now()
);

-- Antes: un doc con el arreglo completo. Se reemplaza entero con
-- guardar_fechas_preprod().
create table public.preprod_restore_dates (
  fecha       date primary key,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ── Encuestas NPS ────────────────────────────────────────────────────────────

create table public.surveys (
  token             text primary key,   -- uuid en las nuevas; text por si hay tokens viejos
  req_id            text not null,
  req_code          text not null default '',
  req_name          text not null default '',
  pm                text not null default '',
  assigned_email    text not null check (assigned_email = lower(assigned_email)),
  assigned_name     text not null default '',
  created_by_email  text not null default '',
  cku               text not null default '',   -- '' = la envió un PM/admin
  answered          boolean not null default false,
  answered_at       timestamptz,
  invalidated       boolean not null default false,
  created_at        timestamptz not null default now()
);
create index surveys_req_id_idx on public.surveys (req_id);
-- Un solo link PENDIENTE por persona, REQ y remitente (lo que hoy hace createSurvey a mano).
create unique index surveys_pendiente_unico
  on public.surveys (req_id, assigned_email, cku) where not answered;

-- Sin FK a surveys: las respuestas importadas del Sheet no tienen encuesta.
-- La PK es el candado de «una sola respuesta por token».
create table public.survey_responses (
  token             text primary key,
  answers           jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  respondent_email  text not null default '',
  submitted_at      timestamptz not null default now()
);

-- ── Funciones (operaciones que deben ser atómicas) ───────────────────────────

-- Guarda la respuesta y marca la encuesta como contestada. Si ya había
-- respuesta lanza 'already-answered' (lo traduce api-errors.ts).
create function public.responder_encuesta(p_token text, p_answers jsonb, p_respondent_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  begin
    insert into public.survey_responses (token, answers, respondent_email, submitted_at)
    values (p_token, p_answers, p_respondent_email, v_now);
  exception when unique_violation then
    raise exception 'already-answered';
  end;
  update public.surveys set answered = true, answered_at = v_now where token = p_token;
end;
$$;

-- Reabre una encuesta: borra la respuesta y quita el candado.
create function public.reabrir_encuesta(p_token text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.survey_responses where token = p_token;
  update public.surveys
     set answered = false, answered_at = null, invalidated = false
   where token = p_token;
end;
$$;

-- Reemplaza TODAS las metas y objetivos de Implementación de una vez.
-- p_metas: [{cliente, vol, cm1, desde?}]  ·  p_objetivos: [{mes, objetivo}]
-- (ya validados por normalizarMetas / normalizarObjetivos en el servidor).
create function public.guardar_metas_implementacion(p_metas jsonb, p_objetivos jsonb, p_by text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  delete from public.implementacion_metas_cliente where true;
  delete from public.implementacion_objetivos where true;

  insert into public.implementacion_metas_cliente (cliente, vol, cm1, desde, updated_by, updated_at)
  select m.cliente, m.vol, m.cm1, nullif(m.desde, ''), p_by, v_now
    from jsonb_to_recordset(coalesce(p_metas, '[]'::jsonb))
         as m(cliente text, vol numeric, cm1 numeric, desde text);

  insert into public.implementacion_objetivos (mes, objetivo, updated_by, updated_at)
  select o.mes, o.objetivo, p_by, v_now
    from jsonb_to_recordset(coalesce(p_objetivos, '[]'::jsonb))
         as o(mes text, objetivo numeric);
end;
$$;

-- Reemplaza la lista completa de fechas de restauración de Pre-producción.
create function public.guardar_fechas_preprod(p_fechas date[], p_by text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  delete from public.preprod_restore_dates where true;
  insert into public.preprod_restore_dates (fecha, updated_by, updated_at)
  select distinct f, p_by, v_now from unnest(coalesce(p_fechas, '{}'::date[])) as f;
end;
$$;

-- Borra un grupo del menú y lo quita de los permisos de cada rol que lo concedía.
-- Lanza 'group-not-found' / 'group-is-system' (los mismos códigos de hoy).
create function public.borrar_grupo(p_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_system boolean;
begin
  select is_system into v_is_system from public.menu_groups where id = p_id for update;
  if not found then
    raise exception 'group-not-found';
  end if;
  if v_is_system then
    raise exception 'group-is-system';
  end if;

  delete from public.menu_groups where id = p_id;

  update public.roles
     set permissions = jsonb_set(permissions, '{groups}', (permissions -> 'groups') - p_id),
         updated_at  = now()
   where permissions -> 'groups' ? p_id;
end;
$$;

-- ── Seguridad: solo service_role (servidor) ──────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'roles', 'menu_groups', 'app_users',
    'req_baselines', 'proj_item_baselines',
    'responsible_attributions', 'metodologia_califs', 'vpa_califs',
    'implementacion_metas_cliente', 'implementacion_objetivos',
    'on_hold', 'atraso_detalles', 'board_alcance', 'clasificacion',
    'weekly_snapshots', 'preprod_restore_dates',
    'surveys', 'survey_responses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.responder_encuesta(text, jsonb, text)          from public, anon, authenticated;
revoke execute on function public.reabrir_encuesta(text)                          from public, anon, authenticated;
revoke execute on function public.guardar_metas_implementacion(jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.guardar_fechas_preprod(date[], text)           from public, anon, authenticated;
revoke execute on function public.borrar_grupo(text)                              from public, anon, authenticated;

grant execute on function public.responder_encuesta(text, jsonb, text)          to service_role;
grant execute on function public.reabrir_encuesta(text)                          to service_role;
grant execute on function public.guardar_metas_implementacion(jsonb, jsonb, text) to service_role;
grant execute on function public.guardar_fechas_preprod(date[], text)           to service_role;
grant execute on function public.borrar_grupo(text)                              to service_role;
