-- Encuestas NPS de un CKU (/players, botón del CKU o de un Admin). A diferencia de las de PM
-- (tabla surveys, un enlace por persona), esta es UN enlace por encuesta que contestan varias
-- personas, cada una con su nombre y correo, una sola vez por encuesta. Sus resultados cuentan
-- en el NPS del Player de ese CKU (ver lib/surveysCku.ts y lib/players.ts).

create table public.cku_surveys (
  token             text primary key,                                    -- uuid; es el enlace público
  cku               text not null,                                       -- nombre del CKU dueño
  cku_email         text not null default '' check (cku_email = lower(cku_email)),
  nombre            text not null,                                       -- lo que el CKU escribe: qué se califica
  created_by_email  text not null default '',
  created_at        timestamptz not null default now()
);
create index cku_surveys_cku_idx on public.cku_surveys (cku);

create table public.cku_survey_responses (
  id                uuid primary key default gen_random_uuid(),
  survey_token      text not null references public.cku_surveys (token) on delete cascade,
  respondent_name   text not null,
  respondent_email  text not null check (respondent_email = lower(respondent_email)),
  answers           jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  invalidated       boolean not null default false,                      -- un Admin la saca de las métricas
  submitted_at      timestamptz not null default now(),
  -- El candado de «una sola vez por encuesta»: el mismo correo no puede contestar dos veces.
  unique (survey_token, respondent_email)
);

alter table public.cku_surveys          enable row level security;
alter table public.cku_survey_responses enable row level security;
revoke all on table public.cku_surveys          from anon, authenticated;
revoke all on table public.cku_survey_responses from anon, authenticated;
grant select, insert, update, delete on table public.cku_surveys          to service_role;
grant select, insert, update, delete on table public.cku_survey_responses to service_role;
