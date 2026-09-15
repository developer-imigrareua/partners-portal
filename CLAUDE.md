# Partners Portal — Contexto para Claude Code

## O que é este projeto

Portal de afiliados da ImigrarEUA / LIV Immigration Law. Single-page app (HTML + JS) servida por um backend Node.js + Express. Autenticação e persistência via Supabase. Links encurtados via Short.io. Integração com HubSpot CRM para rastrear leads indicados por afiliados.

## Arquitetura

```
index.html      SPA completa — toda UI, lógica de frontend, autenticação Supabase
server.js       Express — proxy seguro para HubSpot, Short.io e Supabase (chaves nunca no frontend)
.env            Variáveis de ambiente (não commitado)
.env.example    Template das variáveis necessárias
Dockerfile      Build para deploy no EasyPanel (VPS)
db/             SQL aplicado no Supabase (RLS, policies, gatilho)
test/           Testes de persistência — `npm test`, sem dependências
```

## Deploy

- **Plataforma:** EasyPanel na VPS própria, fonte GitHub (`developer-imigrareua/partners-portal`, branch `master`)
- **Domínio:** `partner.imigrareua.com` via Traefik (HTTPS automático)
- **Porta interna:** 3000 (não mudar — outras aplicações rodam na VPS)
- **Redeploy:** automático a cada push no `master`

## Variáveis de ambiente (configurar no EasyPanel)

```
PORT=3000
HUBSPOT_API_KEY=...
SUPABASE_URL=https://kkrhtfpjdlzuebqnyzzy.supabase.co
SUPABASE_SERVICE_KEY=...        # service role key (não a anon key)
SHORTIO_API_KEY=...
SHORTIO_DOMAIN=to.imigrareua.com
SHORTIO_DOMAIN_ID=1165599
SHORTIO_FOLDER_ID=gCpFB1mhsXTlpieU67ZCy
```

## Supabase

### Tabela `users`
Colunas relevantes:
- `id` — UUID primário
- `auth_id` — UUID do usuário no Supabase Auth
- `role` — `'admin'` | `'affiliate'`
- `status` — `'pending'` | `'active'` | `'rejected'`
- `hs_affiliate_id` — slug do afiliado (ex: `leticia-ferrari`). Gerado automaticamente no cadastro. Usado como `utm_affiliatename` nos links e como `referred_by` na busca do HubSpot
- `sync_data` — JSONB com cache dos leads do HubSpot
- `links_config` — JSONB com controle de visibilidade dos links por afiliado (`{ "slug": { hidden: true, deleted: true } }`)
- `affiliate_type` — `'internal'` | `'external'`
- `bonif_model_id` — referência ao modelo de bonificação

### Tabela `link_forms`
Formulários configuráveis pelo admin. Colunas:
- `id` — slug único (ex: `contato`, `eb2`)
- `label`, `icon`, `platform` (`HubSpot` | `Typeform` | `Outro`)
- `base_url` — URL do formulário sem UTMs
- `default_utms` — JSONB com UTM params padrão
- `active` — se `true`, inclui no "Criar todos"
- `sort_order` — ordem de exibição

SQL de criação (caso precise recriar):
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS links_config jsonb DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.link_forms (
  id text PRIMARY KEY,
  label text NOT NULL,
  icon text DEFAULT '🔗',
  platform text DEFAULT 'HubSpot',
  base_url text NOT NULL,
  default_utms jsonb DEFAULT '{}',
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

## Segurança — RLS (aplicado em 15/09/2026)

`users` e `bonif_models` estavam **sem RLS**: como a anon key fica em texto puro
no `index.html`, qualquer pessoa lia a tabela de usuários inteira sem login. Foi
fechado. O SQL completo e comentado está em `db/rls-policies.sql`.

- `public.is_admin()` — `SECURITY DEFINER`, para evitar recursão (policy de
  `users` consultando `users`).
- 6 policies, todas `TO authenticated`: afiliado lê/altera só a própria linha,
  admin todas. **Não existe policy de DELETE** — ninguém apaga linha de `users`
  pelo portal, nem admin. Proposital.
- Gatilho `users_guard_admin_columns` — RLS é por linha, não por coluna. Sem ele
  o afiliado poderia mandar `status='active'` ou `role='admin'` em si mesmo.
  A função é **SECURITY INVOKER de propósito**: como DEFINER, o `current_user`
  viraria o dono e a checagem de servidor daria sempre verdadeiro.
- `service_role` ignora RLS por natureza no Supabase — o cron e os `/api/*`
  seguem funcionando sem policy nenhuma. Prova: `link_forms` tem RLS ligado e
  zero policies, e o `/api/link-forms` lê normalmente.

Havia policies antigas criadas antes e nunca ativadas. A `service role bypass`
estava como `TO public USING (true) FOR ALL` em `users` e `bonif_models` — como
policies se somam, ela tornaria o RLS inócuo. Foi removida. **Não recriar.**

## Padrões do frontend (index.html)

### Mapeamento Supabase ↔ JS
- `mapUser(row)` — converte snake_case do banco para camelCase no frontend
- `userToRow(u)` — converte camelCase para snake_case para salvar no banco
- `saveUsers(users)` — persiste via Supabase REST API

### Estado global
```js
let usersCache = []        // todos os usuários carregados
let modelsCache = []       // modelos de bonificação
let linkFormsCache = []    // formulários de link (carregados de /api/link-forms)
let currentUser = null     // usuário logado
```

### Persistência: `saveUsers` / `saveModels`
Gravam **apenas as linhas e colunas que mudaram**, comparando com uma baseline
capturada no `loadData()`. Antes era `upsert` da tabela inteira a cada alteração,
o que com RLS passa a ser rejeitado (o afiliado só pode a própria linha) e
falhava em silêncio. Falha de escrita agora avisa por toast e não avança a
baseline, então o retry regrava. **Nunca voltar para upsert de tudo.**

### Responsividade (mobile)
Não há Tailwind — os designs do Superdesign foram traduzidos para o CSS próprio.
Breakpoint principal: `@media (max-width:900px)`.

- `.only-desktop` / `.only-mobile` — tabela e cards são gerados **na mesma
  passada** e alternados por CSS, sem detecção de viewport em JS. Redimensionar
  a janela funciona.
- `rotularTabelas()` + `MutationObserver` — marca cada `<td>` com o texto do seu
  cabeçalho (`data-rotulo`) e o CSS reempilha a tabela como cartão. Usado nas 7
  páginas do admin: o DOM não é reescrito, então nenhuma coluna ou botão se perde.
- Gaveta lateral (`#sidebar` + `#sb-backdrop`) para o admin; tab bar inferior
  (`#tabbar`) para o afiliado, cujas 4 páginas cabem em 4 abas. O admin tem 7.
- `.filtros-mobile` — as faixas de pills viram dropdown no mobile. Rolagem
  lateral escondida quebrava o layout (item flex com `min-width:auto` não
  encolhe, e `#main-area` tem `overflow-y:auto`, o que promove o eixo x a scroll).
- `.topbar` é `sticky` no mobile — ela vive dentro do `#main-area`, que é quem
  rola, e como o título do `.page-header` fica oculto, sairia de vista levando
  a única identificação da página junto.
- Campos com `font-size:16px` no mobile: abaixo disso o iOS dá zoom ao focar.
- Vários grids vêm de `style` inline no JS, então as regras mobile precisam de
  `!important` para vencê-los.

### getLinkForms()
Retorna `linkFormsCache` se populado, senão usa o array `AFF_LINK_FORMS` hardcoded. Sempre usar esta função — nunca `AFF_LINK_FORMS` diretamente.

### Normalização de `base_url` → `url`
Ao carregar forms da API, mapear: `forms.map(f => ({ ...f, url: f.url || f.base_url }))`. Necessário porque o banco usa `base_url` mas o código de matching usa `f.url`.

## Testes

`npm test` roda `test/persistencia.js` — 27 casos sobre `saveUsers`/`saveModels`,
extraídos do próprio `index.html` com Supabase mockado, sem rede e sem
dependências. Cobrem os 10 pontos de chamada, o caso multi-linha, e o caminho de
falha com retry. Rodar antes de mexer em persistência.

## Endpoints do servidor (server.js)

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/hubspot/sync?hsId=X` | Busca leads no HubSpot pelo `referred_by=X` |
| POST | `/api/shortio/create-bulk` | Cria todos os links ativos para um afiliado |
| POST | `/api/shortio/create` | Cria um único link |
| GET | `/api/shortio/links?affiliateId=X` | Lista links da pasta do afiliado (limit=150) |
| PATCH | `/api/shortio/update` | Atualiza destino de um link |
| PATCH | `/api/affiliate/:userId/links-config` | Oculta/remove link do portal (só no Supabase) |
| GET | `/api/link-forms` | Lista formulários do banco |
| POST | `/api/link-forms` | Cria formulário |
| PATCH | `/api/link-forms/:id` | Atualiza formulário |
| DELETE | `/api/link-forms/:id` | Desativa formulário (soft delete) |
| GET | `/api/health` | Checa conectividade HubSpot + Short.io |
| GET | `*` | Serve `index.html` com `Cache-Control: no-store` |

## Short.io — regras críticas

- **NUNCA chamar DELETE na API do Short.io.** Remover link do portal = apenas atualizar `links_config` no Supabase. Risco de apagar links em produção acidentalmente.
- Limit máximo de listagem: **150** (não usar valores maiores)
- Todos os links ficam na pasta `SHORTIO_FOLDER_ID=gCpFB1mhsXTlpieU67ZCy`
- Slug dos links: `{hs_affiliate_id}-{form_id}` (ex: `leticia-ferrari-contato`)

## HubSpot

- Busca de leads: `POST /crm/v3/objects/contacts/search` com filtro `referred_by = {hs_affiliate_id}`
- O campo `referred_by` nos leads é preenchido pelo UTM `utm_affiliatename` capturado nos formulários
- Afiliados conhecidos com leads reais: `leticia-ferrari` (2 leads), `talita-vilella` (0 ainda)
- Outros valores de `referred_by` existentes no CRM: `imigrar`, `liv`, `natalia-arruda`, `barbara-feres`, `settee`

## Fluxo de aprovação de afiliados

1. Afiliado preenche formulário → slug gerado automaticamente do nome → salvo em `hs_affiliate_id`
2. Admin vê em "Solicitações" → clica Aprovar
3. Status muda para `active` + links criados automaticamente no Short.io via `create-bulk`
4. Afiliado acessa o portal e vê seus links prontos

## Limitações conhecidas

- **`product` é sempre `null`** no sync (`server.js` e o sync manual). Logo
  `calcLeadBonif` sempre cai no tier `'Padrão'`, e as colunas por visto dos
  modelos de bonificação (EB-2 NIW, EB-1A, O-1, E-2, L-1A) **não têm efeito
  nenhum**. É assim desde o primeiro commit de produção. Para ligar, é preciso
  saber qual propriedade do HubSpot guarda o tipo de visto.
- **`deleteModel()` não tem ponto de chamada** — não existe botão de excluir
  modelo na interface. Se for ligado algum dia, note que ele remove o modelo do
  array local mas **não apaga a linha no banco**: o modelo reaparece no reload.

## O que não fazer

- Não alterar a porta 3000 — outras aplicações na VPS dependem do mapeamento atual
- Não chamar `DELETE /links` no Short.io em hipótese alguma
- Não expor chaves de API no frontend — todo acesso a HubSpot, Short.io e Supabase service key passa pelo servidor
- Não usar `AFF_LINK_FORMS` diretamente — usar sempre `getLinkForms()`
- Não salvar `sync_data` com dados fictícios — campo deve conter apenas dados reais do HubSpot ou ser `null`
- **Não reintroduzir `express.static`** no `server.js` — ele servia publicamente
  `server.js`, `package.json`, `audit.jsonl` e `outputs/*` (com dados reais de
  lead). O `index.html` não referencia nenhum arquivo local: tudo vem de CDN, e
  o catch-all já responde todas as rotas.
- **Não recriar a policy `service role bypass`** — o service role já ignora RLS.
- **Não versionar `audit.jsonl`, `outputs/` nem as pastas de sessão do `.claude/`**
  — já estão no `.gitignore`; rastreado caiu de 27 MB para 380 KB.
- Não reintroduzir o array `LEADS` nem o `LINK_FORMS` duplicado — eram código
  morto, o primeiro com 50 registros reais de lead e o segundo com IDs
  divergentes dos que estão em uso.
