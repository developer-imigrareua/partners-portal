# Supabase

Faz dois papéis: **autenticação** dos usuários e **banco de dados** do portal.

Projeto: `kkrhtfpjdlzuebqnyzzy`

## Autenticação

Supabase Auth com e-mail e senha. A confirmação automática de e-mail está
**ligada**, então o cadastro devolve sessão na hora — detalhe importante, porque
a policy de inserção depende de haver sessão no momento do cadastro.

O vínculo entre a conta do Auth e a linha do portal é a coluna `auth_id`. O login
procura por ela e, se não achar, tenta por e-mail — uma rede de segurança para
linhas antigas.

## Tabela `users`

| Coluna | Para que serve |
|---|---|
| `id` | UUID primário |
| `auth_id` | UUID da conta no Supabase Auth |
| `role` | `admin` ou `affiliate` |
| `status` | `pending`, `active` ou `rejected` |
| `hs_affiliate_id` | **O slug do afiliado.** Gerado do nome no cadastro. É o `utm_affiliatename` dos links e o `referred_by` na busca do HubSpot |
| `sync_data` | JSONB com o cache dos leads vindos do HubSpot |
| `links_config` | JSONB controlando quais links ficam ocultos para aquele afiliado |
| `affiliate_type` | `internal` ou `external` |
| `bonif_model_id` | Política de bonificação atribuída |

⚠️ **`hs_affiliate_id` não tem restrição de unicidade.** Dois afiliados podem
acabar com o mesmo slug, e aí os dois puxam os mesmos leads do HubSpot. Já
aconteceu — ver [Limitações](../07-limitacoes-conhecidas.md).

## Tabela `link_forms`

Os formulários de captação que viram links.

| Coluna | Para que serve |
|---|---|
| `id` | Slug do formulário (`contato`, `eb2`, `typeform`) — compõe o path do link |
| `label`, `icon`, `platform` | Como aparece na interface |
| `base_url` | A URL do formulário, sem UTMs |
| `default_utms` | JSONB com os UTMs padrão |
| `active` | Se entra no "Criar todos" |
| `sort_order` | Ordem de exibição |
| `scope` | `all` (todos os afiliados) ou `selected` |
| `affiliate_ids` | Quais afiliados, quando o escopo é `selected` |

⚠️ **A coluna chama `base_url`, mas boa parte do código JS espera `url`.** Essa
discrepância já causou o incidente mais grave do projeto — todo link de afiliado
nasceu quebrado por três meses. Ao carregar formulários da API, **sempre**
normalize:

```js
forms.map(f => ({ ...f, url: f.url || f.base_url }))
```

## Tabela `bonif_models`

Políticas de bonificação. A matriz de valores fica em `tiers` (JSONB), no formato
produto → etapa → valor.

## Acesso

O servidor usa a **service role key**, que ignora RLS. O navegador usa a **anon
key**, submetida às policies. Ver [Segurança](../05-seguranca.md).
