-- ═══════════════════════════════════════════════════════════════
-- Links customizados por afiliado
--
-- Hoje todo formulário ativo vira link para TODO afiliado. Estas duas
-- colunas dão escopo: um formulário pode valer para todos (padrão, igual
-- ao comportamento atual) ou só para afiliados específicos.
--
-- Não apaga nada e não muda nenhum formulário existente: o default 'all'
-- reproduz exatamente o que o portal faz hoje.
--
-- O código já está no ar e tolera a ausência destas colunas — antes de
-- rodar isto, tudo é tratado como global. Depois de rodar, o seletor
-- "Aplicar a" no modal de formulário passa a valer.
-- ═══════════════════════════════════════════════════════════════

alter table public.link_forms
  add column if not exists scope text not null default 'all';

alter table public.link_forms
  add column if not exists affiliate_ids jsonb not null default '[]'::jsonb;

-- só aceita os dois valores previstos
alter table public.link_forms
  drop constraint if exists link_forms_scope_check;
alter table public.link_forms
  add constraint link_forms_scope_check check (scope in ('all','selected'));

-- Conferência: todos devem aparecer como 'all', sem nenhum afiliado listado.
select id, label, scope, affiliate_ids from public.link_forms order by sort_order;

-- ROLLBACK (não apaga formulário nenhum, só as colunas de escopo):
--   alter table public.link_forms drop column if exists scope;
--   alter table public.link_forms drop column if exists affiliate_ids;
