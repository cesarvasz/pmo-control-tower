-- Bot de Google Chat · copiar a la bitácora los archivos de Google Drive que le mandan al bot. Cada persona autoriza UNA vez
-- (OAuth con drive.readonly) desde un botón del chat. Va por CORREO y no por usuario de la app: casi ningún CKU tiene cuenta.
--
-- google_drive_conexiones   la autorización de cada correo. El REFRESH TOKEN no se guarda aquí: vive cifrado en el Vault
--                           de Supabase y esta tabla solo apunta a él (secreto_id), igual que google_conexiones (Calendar).
-- google_drive_guardar / google_drive_leer_token   únicas puertas al Vault (solo service_role, o sea, el servidor).

create table public.google_drive_conexiones (
  email          text primary key check (email = lower(email)),
  google_sub     text not null,            -- id estable de la cuenta de Google
  secreto_id     uuid not null,            -- vault.secrets.id del refresh token
  scopes         text[] not null default '{}',
  estado         text not null default 'activa' check (estado in ('activa', 'reconectar')),
  ultimo_error   text,
  conectado_at   timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

alter table public.google_drive_conexiones enable row level security;
revoke all on table public.google_drive_conexiones from anon, authenticated;
grant select, insert, update, delete on table public.google_drive_conexiones to service_role;

-- Guarda (o renueva) la autorización y su refresh token, todo en una transacción (sin secretos huérfanos).
create function public.google_drive_guardar(
  p_email         text,
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
  v_email   text := lower(trim(p_email));
  v_secreto uuid;
begin
  if coalesce(p_refresh_token, '') = '' then raise exception 'token-vacio'; end if;
  if coalesce(v_email, '') = '' then raise exception 'email-vacio'; end if;

  select c.secreto_id into v_secreto from public.google_drive_conexiones c where c.email = v_email for update;
  if v_secreto is not null and not exists (select 1 from vault.secrets s where s.id = v_secreto) then
    v_secreto := null;   -- el secreto ya no está (alguien lo borró a mano): se crea uno nuevo
  end if;

  if v_secreto is null then
    v_secreto := vault.create_secret(p_refresh_token, 'google_drive_' || v_email, 'Refresh token de Google Drive (bot de Chat) de ' || v_email);
  else
    perform vault.update_secret(v_secreto, p_refresh_token);
  end if;

  insert into public.google_drive_conexiones (email, google_sub, secreto_id, scopes, estado, ultimo_error, conectado_at, actualizado_at)
  values (v_email, p_google_sub, v_secreto, coalesce(p_scopes, '{}'), 'activa', null, now(), now())
  on conflict (email) do update
    set google_sub = excluded.google_sub, secreto_id = excluded.secreto_id, scopes = excluded.scopes,
        estado = 'activa', ultimo_error = null, conectado_at = now(), actualizado_at = now();
end;
$$;

-- El refresh token en claro (solo el servidor, solo para pedirle un access token a Google). null = no autorizó.
create function public.google_drive_leer_token(p_email text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select s.decrypted_secret
  from public.google_drive_conexiones c
  join vault.decrypted_secrets s on s.id = c.secreto_id
  where c.email = lower(trim(p_email)) and c.estado = 'activa'
$$;

-- Al borrar la autorización se borra también su secreto.
create function public.google_drive_conexiones_borrar_secreto()
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

create trigger google_drive_conexiones_borrar_secreto
  after delete on public.google_drive_conexiones
  for each row execute function public.google_drive_conexiones_borrar_secreto();

revoke execute on function public.google_drive_guardar(text, text, text[], text)  from public, anon, authenticated;
revoke execute on function public.google_drive_leer_token(text)                    from public, anon, authenticated;
revoke execute on function public.google_drive_conexiones_borrar_secreto()        from public, anon, authenticated;
grant  execute on function public.google_drive_guardar(text, text, text[], text)  to service_role;
grant  execute on function public.google_drive_leer_token(text)                    to service_role;
