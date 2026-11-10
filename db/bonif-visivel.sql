-- ═══════════════════════════════════════════════════════════════
-- Liberar visualização da bonificação (aba "Meu desempenho")
--
-- Cria a coluna users.bonif_visible e a inclui no gatilho de colunas
-- administrativas: só o admin (ou o servidor) pode ligar/desligar.
-- Sem a linha no gatilho, o afiliado poderia se liberar pelo console.
--
-- Rodar inteiro no SQL Editor do Supabase. É idempotente.
-- Rollback no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════

alter table public.users add column if not exists bonif_visible boolean not null default false;

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

  return new;
end;
$$;

-- Conferência: deve devolver 1 linha, default false.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'bonif_visible';

-- ROLLBACK (não apaga outro dado além da própria coluna):
--   1. Rode de novo o BLOCO 4 de db/rls-policies.sql (função sem a linha bonif_visible)
--   2. alter table public.users drop column if exists bonif_visible;
