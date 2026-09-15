# Segurança

## A anon key aparecer no código-fonte é normal

A chave do Supabase que está em texto puro no `index.html` é a **anon key**. Ela
é pública por design — apenas identifica o projeto, como uma chave de API do
Google Maps. A documentação do Supabase manda colocá-la no frontend.

Quem decide o que ela pode ler é o **RLS**. Chave pública com RLS ativo não abre
nada.

**O que nunca pode aparecer no navegador:** a `service_role`. Essa ignora RLS por
completo. Ela vive só no `.env` do servidor. Se algum dia você vir na página um
token cujo papel é `service_role`, é emergência.

## Row Level Security

Aplicado em 15/09/2026. Antes disso as tabelas `users` e `bonif_models` estavam
**sem RLS** — qualquer pessoa lia a tabela de usuários inteira, com e-mails,
telefones e o cache de leads, sem nem fazer login.

O SQL comentado está em `db/rls-policies.sql`.

### Como está hoje

| Tabela | Afiliado | Admin |
|---|---|---|
| `users` | lê e altera só a própria linha | todas |
| `bonif_models` | lê todas | escreve |
| `link_forms` | RLS ativo, sem policy — só o servidor acessa | idem |

**Não existe policy de DELETE em `users`.** Ninguém apaga usuário pelo portal,
nem admin. É proposital.

### Decisões técnicas que parecem detalhe e não são

- **`is_admin()` é `SECURITY DEFINER`** para não entrar em recursão — a policy de
  `users` precisa consultar `users`.
- **O gatilho de colunas é `SECURITY INVOKER`**, e isso é essencial. Como
  `DEFINER`, o `current_user` dentro dele viraria o dono da função e a checagem
  de "é o servidor?" daria sempre verdadeiro — o gatilho viraria decorativo.
- **O `service_role` ignora RLS por natureza.** Não precisa de policy. Prova
  dentro do próprio projeto: `link_forms` tem RLS ligado e zero policies, e o
  servidor lê normalmente.

### A policy que não pode voltar

Existia uma policy chamada `service role bypass` em `users` e `bonif_models`,
criada antes e nunca ativada, escrita como `TO public USING (true) FOR ALL`.

Como policies **se somam**, ela liberaria tudo para todos — ligar o RLS com ela
no lugar não fecharia nada. Foi removida. **Não recriar.** O service role já
ignora RLS sem precisar de ajuda.

## Proteção por coluna

RLS é por linha, não por coluna. Sem proteção adicional, um afiliado poderia
alterar a própria linha para `status = 'active'` ou `role = 'admin'`.

O gatilho `users_guard_admin_columns` fecha isso: o afiliado só pode alterar
nome, telefone, empresa, site, canal e foto. Qualquer outra coluna é recusada com
mensagem explícita.

## Arquivos não são servidos

O `express.static` foi removido. Ele expunha publicamente o `server.js`, o
`package.json` e a pasta `outputs/` — esta última com dados reais de lead.

**Não reintroduzir.** O `index.html` não referencia nenhum arquivo local: fontes,
Chart.js e o cliente Supabase vêm de CDN. O catch-all já responde todas as rotas.

## O que continua aberto

**Nenhum endpoint `/api/*` tem autenticação.** Quem souber a URL consegue buscar
os leads de um afiliado ou mexer nos formulários. O servidor usa a service key,
que ignora RLS — então essa camada não protege aqui.

Ver [Limitações](07-limitacoes-conhecidas.md).
