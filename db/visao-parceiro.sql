-- ═══════════════════════════════════════════════════════════════
-- Registro de uso do "Ver como parceiro"
--
-- Cada vez que um admin abre a visão de um parceiro, o servidor grava
-- quem, qual parceiro e quando (POST /api/admin/ver-como, com a service
-- key). RLS ligado e nenhuma policy: só o servidor lê e escreve; nem o
-- admin pelo navegador consegue apagar ou alterar o registro.
--
-- Rodar inteiro no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.admin_view_log (
  id              bigint generated always as identity primary key,
  admin_user_id   text not null,
  admin_email     text,
  partner_user_id text not null,
  partner_name    text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

alter table public.admin_view_log enable row level security;

create index if not exists admin_view_log_created_at_idx on public.admin_view_log (created_at desc);

-- Conferência: rls ligado, zero policies.
select relname, relrowsecurity from pg_class where relname = 'admin_view_log';
select count(*) as policies from pg_policies where tablename = 'admin_view_log';

-- Consultar os usos:
--   select created_at, admin_email, partner_name from public.admin_view_log order by created_at desc;

-- ROLLBACK (apaga o histórico de uso):
--   drop table if exists public.admin_view_log;
