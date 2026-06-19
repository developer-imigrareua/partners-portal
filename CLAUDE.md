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
```

## Deploy

- **Plataforma:** EasyPanel na VPS própria, fonte GitHub (`developer-imigrareua/partners-portal`, branch `master`)
- **Domínio:** `partners.imigrareua.com` via Traefik (HTTPS automático)
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

### getLinkForms()
Retorna `linkFormsCache` se populado, senão usa o array `AFF_LINK_FORMS` hardcoded. Sempre usar esta função — nunca `AFF_LINK_FORMS` diretamente.

### Normalização de `base_url` → `url`
Ao carregar forms da API, mapear: `forms.map(f => ({ ...f, url: f.url || f.base_url }))`. Necessário porque o banco usa `base_url` mas o código de matching usa `f.url`.

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

## O que não fazer

- Não alterar a porta 3000 — outras aplicações na VPS dependem do mapeamento atual
- Não chamar `DELETE /links` no Short.io em hipótese alguma
- Não expor chaves de API no frontend — todo acesso a HubSpot, Short.io e Supabase service key passa pelo servidor
- Não usar `AFF_LINK_FORMS` diretamente — usar sempre `getLinkForms()`
- Não salvar `sync_data` com dados fictícios — campo deve conter apenas dados reais do HubSpot ou ser `null`
