# Changelog

Mudanças relevantes do Partner Portal.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

---

## [1.1.0] — 2026-09-15

Rodada de correções de segurança, suporte a celular e conserto dos links de
afiliado. Exige **duas migrações no Supabase** — ver *Migrações* abaixo.

### Segurança

- **Fechado o acesso público à base de usuários.** As tabelas `users` e
  `bonif_models` estavam sem Row Level Security: qualquer pessoa lia a tabela de
  usuários inteira — nomes, e-mails, telefones e o cache de leads — sem fazer
  login, usando a anon key que fica no código-fonte da página.
- Removida a policy `service role bypass`, que estava como
  `TO public USING (true) FOR ALL`. Como policies se somam, ela tornaria o RLS
  inócuo. O `service_role` já ignora RLS por natureza.
- Adicionado o gatilho `users_guard_admin_columns`: RLS é por linha, não por
  coluna. Sem ele, um afiliado logado podia alterar o próprio `status` para
  `active` ou o `role` para `admin`.
- **Removido o `express.static`**, que servia publicamente `server.js`,
  `package.json`, `audit.jsonl` e a pasta `outputs/` — esta com dados reais de
  lead.

### Corrigido — links de afiliado

- **Links nasciam apontando para `https://undefined`.** Desde 17/06, todo link
  criado na aprovação de um afiliado tinha destino inválido. A coluna no banco
  chama `base_url` e o servidor lia `url`; a normalização existia só no
  frontend. De 81 links, apenas 11 estavam corretos.
- **Links exibidos sob o formulário errado.** Com `url` indefinido,
  `includes(undefined)` virava `includes("undefined")` — e o destino quebrado
  contém essa palavra. Todos os links casavam com o primeiro formulário da lista.
  A associação passou a resolver pelo path do link, que é confiável.
- **A tela de edição de link estava corrompendo links.** Vinha com o formulário
  errado pré-selecionado e, ao salvar, gravava o destino inválido de volta.
  Adicionada trava: nenhum destino que não seja URL absoluta é gravado.
- **Criar e editar formulário nunca funcionou.** O payload enviava `url` e
  `utm_*` como colunas, que não existem — o banco tem `base_url` e
  `default_utms`. O PostgREST devolvia `400 PGRST204`. O botão "Editar" também
  não respondia ao clique, por um JSON embutido em atributo HTML.
- **65 links recuperados** por scripts de manutenção: 47 com destino inválido ou
  errado, e 18 criados sob identificador antigo do afiliado. Os endereços curtos
  não mudaram.

### Corrigido — persistência

- `saveUsers` e `saveModels` gravam apenas as linhas e colunas alteradas. Antes
  faziam `upsert` da tabela inteira a cada mudança, o que com RLS passa a ser
  rejeitado e falhava em silêncio. Falha de escrita agora avisa o usuário.

### Adicionado — celular

- **Barra inferior com quatro abas** para o afiliado (Painel, Leads, Links,
  Perfil); **gaveta lateral** para o admin, que tem sete páginas.
- Pipeline de Leads e Meus Links redesenhados como cartões, preservando
  responsável, bonificação e ordenação.
- As sete páginas do admin adaptadas: tabelas viram cartões com cada campo
  identificado, incluindo os botões de ação, que antes ficavam fora da tela.
- Filtros de período e etapa deixaram de ser faixas roláveis e viraram menus
  suspensos.
- Título fixo no topo ao rolar; campos com fonte de 16px para o iOS não dar zoom.

### Adicionado — links customizados por afiliado

- Formulários ganharam escopo: valem para todos os afiliados (padrão) ou apenas
  para os escolhidos.
- Botão **"Link customizado"** no acordeão de cada afiliado, que abre o modal já
  restrito a ele.

### Removido

- Array `LEADS` com 50 registros reais de lead em código morto, e o
  `LINK_FORMS` duplicado com identificadores divergentes dos em uso.
- `audit.jsonl` (19 MB), `outputs/` e as pastas de sessão de agente saíram do
  versionamento. Rastreado caiu de 27 MB para 380 KB.

### Documentação e testes

- `docs/` — 18 páginas cobrindo visão geral, arquitetura, integrações, operação,
  segurança, limitações, pendências e log de correções.
- `npm test` — 37 casos sobre persistência e escopo de formulários, sem
  dependências.
- `scripts/` — utilitários de reparo de links, com simulação por padrão.

### Migrações necessárias

Rodar no SQL Editor do Supabase, nesta ordem:

1. **`db/rls-policies.sql`** — policies, função `is_admin()` e gatilho de
   colunas. Sem isso a base segue aberta.
2. **`db/escopo-link-forms.sql`** — colunas `scope` e `affiliate_ids`. O código
   tolera a ausência delas (tudo vira global), então não há janela de quebra.

### Limitações conhecidas

Ver [`docs/07-limitacoes-conhecidas.md`](docs/07-limitacoes-conhecidas.md). Em
resumo: os endpoints `/api/*` não têm autenticação; a bonificação não varia por
tipo de visto porque o sync nunca preenche o produto do lead; e
`hs_affiliate_id` não tem restrição de unicidade.

---

## [1.0.0] — 2026-06-25

Estado do portal antes da rodada de setembro: autenticação via Supabase,
sincronização com HubSpot, geração de links no Short.io, modelos de bonificação
e o painel administrativo. Somente desktop.
