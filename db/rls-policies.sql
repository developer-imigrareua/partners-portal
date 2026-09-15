-- ═══════════════════════════════════════════════════════════════
-- Partners Portal — Row Level Security
--
-- Problema: as tabelas public.users e public.bonif_models estao sem
-- RLS. Como a anon key fica em texto puro no index.html, qualquer
-- pessoa le a tabela users inteira (e-mail, telefone, sync_data com
-- os leads) sem nem fazer login.
--
-- Nada aqui APAGA dados. RLS so muda quem enxerga/escreve o que.
-- Rodar os blocos NA ORDEM. O bloco 3 e o unico que muda o
-- comportamento do portal.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- BLOCO 1 — INERTE. Nao muda absolutamente nada no portal.
-- Cria a funcao e as policies. Enquanto o RLS estiver desligado,
-- policy nao tem efeito nenhum: fica guardada, dormente.
-- Pode rodar quantas vezes quiser (e idempotente).
-- ───────────────────────────────────────────────────────────────

-- LIMPEZA OBRIGATORIA (descoberta em 2026-09-15)
-- A base ja tinha policies antigas, criadas por alguem antes e nunca
-- ativadas (o RLS estava desligado, entao ficaram dormentes).
--
-- A critica: "service role bypass" em users e em bonif_models estava
-- como  TO public USING (true) FOR ALL  — isto e, todo mundo (inclusive
-- anonimo) podia ler/alterar/apagar tudo. Policies se SOMAM: com ela no
-- lugar, ligar o RLS nao fecharia nada.
--
-- Era desnecessaria: o service role ignora RLS por natureza no Supabase.
-- Prova neste proprio projeto: link_forms tem RLS ligado e ZERO policies,
-- e mesmo assim o /api/link-forms le os 6 formularios com a service key.
--
-- As outras duas eram inofensivas porem mortas:
--   admin full access  -> compara auth.jwt()->>'role' com 'admin', mas o
--                         Supabase poe 'authenticated' nesse claim.
--   affiliate sees own -> compara auth.uid() com a coluna id, quando o
--                         valor do Auth mora em auth_id.
--
-- drop policy nao apaga dado nenhum.
drop policy if exists "service role bypass" on public.users;
drop policy if exists "admin full access"   on public.users;
drop policy if exists "affiliate sees own"  on public.users;
drop policy if exists "service role bypass" on public.bonif_models;


-- Diz se quem esta chamando e um admin.
-- SECURITY DEFINER e essencial: faz a funcao rodar ignorando RLS.
-- Sem isso, a policy de users consultaria users e entraria em
-- recursao infinita.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.auth_id = auth.uid()
      and u.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;


-- ── public.users ───────────────────────────────────────────────

-- LEITURA: afiliado le so a propria linha; admin le todas.
-- O "or lower(email) = ..." e rede de seguranca: o portal tem um
-- fallback por e-mail no login (index.html:546) para linha que
-- perdeu o auth_id. Hoje as 14 linhas tem auth_id, mas se alguma
-- perder, o login continua funcionando em vez de travar.
drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin on public.users
  for select to authenticated
  using (
    auth_id = auth.uid()
    or lower(email) = lower(auth.jwt() ->> 'email')
    or public.is_admin()
  );

-- ESCRITA: afiliado altera so a propria linha; admin altera todas.
drop policy if exists users_update_own_or_admin on public.users;
create policy users_update_own_or_admin on public.users
  for update to authenticated
  using      (auth_id = auth.uid() or public.is_admin())
  with check (auth_id = auth.uid() or public.is_admin());

-- CADASTRO: a pessoa so cria a propria linha.
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (auth_id = auth.uid() or public.is_admin());

-- Repare que NAO existe policy de DELETE. Isso e proposital:
-- sem policy, ninguem apaga linha de users pelo portal. Nem admin.


-- ── public.bonif_models ────────────────────────────────────────

-- LEITURA: qualquer pessoa logada. O afiliado precisa ler para ver
-- a propria tabela de bonificacao no dashboard.
drop policy if exists bonif_select_authenticated on public.bonif_models;
create policy bonif_select_authenticated on public.bonif_models
  for select to authenticated
  using (true);

-- ESCRITA: so admin.
drop policy if exists bonif_insert_admin on public.bonif_models;
create policy bonif_insert_admin on public.bonif_models
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists bonif_update_admin on public.bonif_models;
create policy bonif_update_admin on public.bonif_models
  for update to authenticated
  using      (public.is_admin())
  with check (public.is_admin());

-- FIM DO BLOCO 1 ------------------------------------------------


-- ───────────────────────────────────────────────────────────────
-- BLOCO 2 — VERIFICACAO. So leitura, nao altera nada.
-- Rode e confira o resultado ANTES de ir para o bloco 3.
-- ───────────────────────────────────────────────────────────────

-- Esperado: is_admin devolve true se voce estiver logado como admin
-- no SQL editor; no editor normalmente devolve false (sem sessao).
-- O que importa e a funcao EXISTIR sem erro.
select public.is_admin() as sou_admin;

-- Esperado: 6 linhas (3 de users, 3 de bonif_models).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('users','bonif_models')
order by tablename, policyname;

-- Esperado NESTE momento: users=false, bonif_models=false,
-- link_forms=true (essa ja estava ligada, nao mexemos nela).
select relname as tabela, relrowsecurity as rls_ligado
from pg_class
where relname in ('users','bonif_models','link_forms');

-- FIM DO BLOCO 2 ------------------------------------------------


-- ───────────────────────────────────────────────────────────────
-- BLOCO 3 — O INTERRUPTOR. Este muda o comportamento na hora.
--
-- Nao apaga nada. Mas a partir daqui quem nao se encaixar numa
-- policy deixa de enxergar as linhas. Se algo der errado, o
-- portal fica inacessivel ate voce rodar o rollback abaixo.
--
-- Deixe o rollback ja copiado numa aba antes de rodar isto.
-- ───────────────────────────────────────────────────────────────

alter table public.users        enable row level security;
alter table public.bonif_models enable row level security;

-- FIM DO BLOCO 3 ------------------------------------------------


-- ───────────────────────────────────────────────────────────────
-- ROLLBACK — volta exatamente ao estado de antes, na hora.
-- Nenhum dado e perdido. As policies continuam salvas, so param
-- de ser aplicadas.
-- ───────────────────────────────────────────────────────────────
--
--   alter table public.users        disable row level security;
--   alter table public.bonif_models disable row level security;
--
-- ───────────────────────────────────────────────────────────────


-- ───────────────────────────────────────────────────────────────
-- BLOCO 4 — gatilho de colunas administrativas
--
-- A policy de UPDATE deixa o afiliado alterar a PROPRIA linha, mas RLS
-- e por linha, nao por coluna. Sem isto, um afiliado logado consegue
-- mandar status='active' ou role='admin' em si mesmo pelo console.
--
-- O gatilho fecha isso por coluna. Diferente das policies, ele passa a
-- valer NA HORA (gatilho nao depende de RLS estar ligado).
--
-- ATENCAO: a funcao NAO pode ser SECURITY DEFINER. Dentro de uma funcao
-- definer o current_user vira o dono (postgres), a checagem de servidor
-- daria sempre verdadeiro e o gatilho nao bloquearia nada.
-- ───────────────────────────────────────────────────────────────

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

  return new;
end;
$$;

drop trigger if exists users_guard_admin_columns_trg on public.users;
create trigger users_guard_admin_columns_trg
  before update on public.users
  for each row execute function public.users_guard_admin_columns();

-- ROLLBACK DO BLOCO 4 (nao apaga dado nenhum):
--   drop trigger if exists users_guard_admin_columns_trg on public.users;
