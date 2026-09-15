# Bonificação

## Como funciona

Uma **política de bonificação** define um valor para cada etapa do funil. O valor
de um lead é a **soma acumulada** de todas as etapas até onde ele chegou.

Exemplo, na política Padrão:

```
Lead Recebido       $3
Em Atendimento      $5
Reunião Agendada   $20
Oportunidade       $50
Convertido        $100
```

Um lead que chegou a "Convertido" vale `3 + 5 + 20 + 50 + 100 = $178`. Um que
parou em "Reunião Agendada" vale `3 + 5 + 20 = $28`.

Lead marcado como "Não Convertido" é contado como "Lead Recebido".

## Atribuir a um afiliado

Em **Afiliados**, abra o afiliado e escolha a política no seletor. Duas políticas
vêm prontas — **Padrão** e **Premium** — e o admin pode criar outras.

## Afiliado sem política não vê valor

É proposital. Quem ainda não teve a remuneração acordada não vê número nenhum,
nem no dashboard nem no pipeline. Atribuir uma política é o que liga a exibição.

## O rótulo é "Bonificação Simulada"

O portal não é sistema de pagamento. O número é indicativo, para o afiliado
acompanhar o próprio desempenho.

## ⚠️ Os valores por tipo de visto não funcionam

O editor de políticas permite configurar valores diferentes por produto — EB-2
NIW, EB-1A, O-1, E-2, L-1A. **Essa configuração não tem efeito nenhum hoje.**

O motivo: a sincronização com o HubSpot nunca preenche o tipo de visto do lead,
então todo cálculo cai na coluna "Padrão". É assim desde o primeiro dia do
portal.

Para ligar, é preciso descobrir qual propriedade do HubSpot guarda o tipo de
visto e mapeá-la na sincronização. Ver
[Limitações](../07-limitacoes-conhecidas.md).
