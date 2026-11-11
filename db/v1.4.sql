-- ═══════════════════════════════════════════════════════════════
-- Versão 1.4.0: política sem efeito retroativo e termo de adesão
--
-- 1. bonif_models.versions: histórico de valores de cada modelo
--    [{"desde":"AAAA-MM-DD","tiers":{...}}]. Editar um modelo só vale
--    daqui para a frente.
-- 2. users.bonif_history: histórico de qual modelo o parceiro tinha
--    [{"desde":"AAAA-MM-DD","modelo":"id"}]. Trocar o modelo não muda o passado.
-- 3. users.terms_version / terms_accepted_at: último termo aceito.
-- 4. terms_acceptance: histórico de cada aceite (só o servidor lê e grava).
-- 5. Gatilho de colunas administrativas: as três colunas novas de users só
--    mudam pelo admin ou pelo servidor. O aceite do termo é gravado pelo
--    servidor (/api/termo/aceite), então o parceiro não consegue forjá-lo.
--
-- Rodar inteiro no SQL Editor do Supabase. É idempotente.
-- Pré-requisito: db/bonif-visivel.sql (já aplicado em 11/11/2026).
-- ═══════════════════════════════════════════════════════════════

alter table public.bonif_models add column if not exists versions jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists bonif_history jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists terms_version text;
alter table public.users add column if not exists terms_accepted_at timestamptz;

create table if not exists public.terms_acceptance (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  user_name   text,
  user_email  text,
  version     text not null,
  accepted_at timestamptz not null default now(),
  user_agent  text
);
alter table public.terms_acceptance enable row level security;
create index if not exists terms_acceptance_user_idx on public.terms_acceptance (user_id, accepted_at desc);

create or replace function public.users_guard_admin_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Passe livre: o servidor (service key, usada pelo cron e pelos /api/*),
  -- o proprio Postgres (SQL editor) e os admins do portal.
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or public.is_admin()
  then
    return new;
  end if;

  -- Caso preservado do app: o login preenche auth_id quando esta vazio
  -- (index.html, doLogin/boot). Isso continua permitido.
  if old.auth_id is null and new.auth_id = auth.uid() then
    null;
  elsif new.auth_id is distinct from old.auth_id then
    raise exception 'Campo administrativo nao pode ser alterado: auth_id';
  end if;

  -- Afiliado so altera: name, phone, company, site, channel, photo.
  if new.id              is distinct from old.id              then raise exception 'Campo administrativo nao pode ser alterado: id'; end if;
  if new.role            is distinct from old.role            then raise exception 'Campo administrativo nao pode ser alterado: role'; end if;
  if new.email           is distinct from old.email           then raise exception 'Campo administrativo nao pode ser alterado: email'; end if;
  if new.status          is distinct from old.status          then raise exception 'Campo administrativo nao pode ser alterado: status'; end if;
  if new.created_at      is distinct from old.created_at      then raise exception 'Campo administrativo nao pode ser alterado: created_at'; end if;
  if new.applied_at      is distinct from old.applied_at      then raise exception 'Campo administrativo nao pode ser alterado: applied_at'; end if;
  if new.approved_at     is distinct from old.approved_at     then raise exception 'Campo administrativo nao pode ser alterado: approved_at'; end if;
  if new.hs_affiliate_id is distinct from old.hs_affiliate_id then raise exception 'Campo administrativo nao pode ser alterado: hs_affiliate_id'; end if;
  if new.bonif_model_id  is distinct from old.bonif_model_id  then raise exception 'Campo administrativo nao pode ser alterado: bonif_model_id'; end if;
  if new.affiliate_type  is distinct from old.affiliate_type  then raise exception 'Campo administrativo nao pode ser alterado: affiliate_type'; end if;
  if new.sync_data       is distinct from old.sync_data       then raise exception 'Campo administrativo nao pode ser alterado: sync_data'; end if;
  if new.links_config    is distinct from old.links_config    then raise exception 'Campo administrativo nao pode ser alterado: links_config'; end if;
  if new.bonif_visible   is distinct from old.bonif_visible   then raise exception 'Campo administrativo nao pode ser alterado: bonif_visible'; end if;
  if new.bonif_history   is distinct from old.bonif_history   then raise exception 'Campo administrativo nao pode ser alterado: bonif_history'; end if;
  if new.terms_version   is distinct from old.terms_version   then raise exception 'Campo administrativo nao pode ser alterado: terms_version'; end if;
  if new.terms_accepted_at is distinct from old.terms_accepted_at then raise exception 'Campo administrativo nao pode ser alterado: terms_accepted_at'; end if;

  return new;
end;
$$;

-- Conferência: deve devolver 4 linhas.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'users' and column_name in ('bonif_history', 'terms_version', 'terms_accepted_at'))
    or (table_name = 'bonif_models' and column_name = 'versions'))
order by table_name, column_name;

-- Consultar os aceites:
--   select accepted_at, user_name, version from public.terms_acceptance order by accepted_at desc;

-- ROLLBACK:
--   1. Rode de novo db/bonif-visivel.sql (função sem as três linhas novas)
--   2. drop table if exists public.terms_acceptance;
--      alter table public.users drop column if exists bonif_history, drop column if exists terms_version, drop column if exists terms_accepted_at;
--      alter table public.bonif_models drop column if exists versions;
