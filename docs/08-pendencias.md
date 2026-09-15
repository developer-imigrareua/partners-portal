# Pendências

Itens em aberto, com o que falta decidir e quem decide. Diferente de
[Limitações conhecidas](07-limitacoes-conhecidas.md), que descreve o que o
sistema não faz por desenho ou dívida antiga — aqui é fila de trabalho.

Atualizado em 15/09/2026.

---

## Decisões de negócio

### Bonificação por tipo de visto

**Status:** aguardando informação · **Decide:** time LIV

O editor de políticas permite valores diferentes por produto (EB-2 NIW, EB-1A,
O-1, E-2, L-1A), mas nada disso tem efeito: a sincronização nunca preenche o tipo
de visto do lead, então todo cálculo cai na coluna "Padrão".

Na prática, **todo lead convertido vale $178**, seja qual for o visto. A
diferença máxima seria $30 por lead, para EB-1A.

**O que falta:** o nome da propriedade do HubSpot que guarda o tipo de visto.
Com ela, é mapear na sincronização — poucas linhas no `server.js` e no sync
manual.

⚠️ Não convém adivinhar o nome do campo: um mapeamento errado produziria valores
de bonificação incorretos, e esse é o tipo de erro que ninguém percebe até virar
reclamação de afiliado.

### Link `xeQx7W` apontando para o Typeform antigo

**Status:** aguardando decisão · **Decide:** time LIV

É um dos seis links da Letícia Ferrari criados em 17/06 com path aleatório, antes
da convenção `{slug}-{formulário}`. Os outros cinco estão corretos; este aponta
para o Typeform `Iie2l4oF`, descontinuado em favor do unificado `bk6wGqhM`.

Funciona e atribui corretamente — só leva ao funil antigo. Como não segue o
padrão de path, nenhum script o alcança automaticamente.

**O que falta:** confirmar se ele foi distribuído. Se sim, atualizar o destino à
mão.

### Formulário de teste

**Status:** limpeza pendente

O formulário `teste-customizado` ("Teste Link Custom") foi criado em 15/09 para
validar a funcionalidade de links por afiliado. Está inativo, restrito à Letícia
Ferrari, com 0 cliques no link gerado.

**O que falta:** decidir se some ou vira um link real. Lembrando que o link no
Short.io nunca é apagado — some da visão do afiliado pelo botão de ocultar.

---

## Dívida técnica

### Autenticação nos endpoints

**Status:** aberto · **Prioridade:** alta

Nenhuma rota `/api/*` verifica quem chama. Quem souber a URL busca os leads de
qualquer afiliado, cria links ou altera formulários. O servidor usa a service
key, que ignora RLS — a proteção do banco não cobre essa camada.

**Caminho:** validar o JWT do Supabase em cada rota e checar o papel.

### Slug de afiliado sem unicidade

**Status:** aberto · **Prioridade:** média

`hs_affiliate_id` não tem índice único. Dois afiliados com o mesmo slug veem os
mesmos leads.

Hoje existem dois pares duplicados — `america-connection` e `lucas` — mas em
ambos um dos dois está `rejected`, então não há disputa real. Com dois ativos, a
atribuição ficaria ambígua sem sinal nenhum.

**Caminho:** índice único na coluna, mais verificação no cadastro antes de gerar
o slug.

### O cron sobe em qualquer instância

**Status:** aberto · **Prioridade:** baixa

A sincronização diária é agendada sem condicional. Uma instância rodando na
máquina de alguém às 7h grava em produção.

**Caminho:** condicionar a uma variável de ambiente presente só no EasyPanel.

### Excluir modelo de bonificação

**Status:** aberto · **Prioridade:** baixa

`deleteModel()` não tem botão que a chame. Se for ligada, note que ela não apaga
a linha no banco — o modelo reaparece no próximo carregamento. Exigiria um
`DELETE` real ou uma coluna de exclusão lógica.
