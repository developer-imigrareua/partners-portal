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
