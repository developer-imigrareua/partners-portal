# Limitações conhecidas

Coisas que não funcionam hoje. Nenhuma é regressão — todas existem desde antes
das correções de setembro de 2026, e estão aqui para não serem redescobertas com
susto.

## ~~Endpoints sem autenticação~~ — resolvido na 1.3.0

Toda rota `/api/*` valida o token do Supabase Auth e o papel do usuário
(`exigirLogin` / `exigirAdmin` no `server.js`). Única rota pública:
`/api/health`, que só informa se HubSpot e Short.io respondem.

## Bonificação não varia por tipo de visto

O editor de políticas permite valores diferentes por produto (EB-2 NIW, EB-1A,
O-1, E-2, L-1A), mas **nada disso tem efeito**. A sincronização nunca preenche o
tipo de visto do lead, então todo cálculo usa a coluna "Padrão".

Na prática: todo lead convertido vale o mesmo, independentemente do visto.

**Para ligar:** descobrir qual propriedade do HubSpot guarda o tipo de visto e
mapeá-la na sincronização, no `server.js` e no sync manual.

## `hs_affiliate_id` sem restrição de unicidade

Dois afiliados podem acabar com o mesmo slug. Como o slug é o que liga o
afiliado aos leads no HubSpot, os dois passam a ver **os mesmos leads**.

Já aconteceu duas vezes. Em ambos os casos um dos dois estava `rejected`, então
não houve disputa real — mas com dois ativos a atribuição ficaria ambígua e
ninguém perceberia.

**Para fechar:** índice único na coluna, mais verificação no cadastro.

## Excluir modelo de bonificação

A função `deleteModel()` existe no código mas **não tem nenhum botão que a
chame** — não dá para excluir um modelo pela interface.

Se algum dia for ligada, saiba que ela remove o modelo da lista local mas **não
apaga a linha no banco**: o modelo reaparece no próximo carregamento.

## O cron sobe em qualquer instância

A sincronização diária é agendada dentro do `server.js`, sem condicional. Uma
instância rodando na máquina de alguém às 7h grava em produção.

**Para fechar:** condicionar o agendamento a uma variável de ambiente presente
apenas no EasyPanel.

## Histórico do git carrega arquivos pesados

`audit.jsonl` (19 MB) e a pasta `outputs/` deixaram de ser versionados, mas
continuam no histórico. Expurgar exigiria reescrever o histórico, o que quebra
clones existentes. Como não são mais servidos pela web, não há urgência.
