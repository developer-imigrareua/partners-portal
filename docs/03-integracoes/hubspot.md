# HubSpot

É a **origem da verdade** sobre os leads. O portal nunca escreve no HubSpot —
apenas lê.

Portal ID: `46465963`

## Como um lead é atribuído a um afiliado

O elo é o campo **`referred_by`** do contato. Ele é preenchido automaticamente
pelo parâmetro `utm_affiliatename` que o formulário captura da URL.

Ou seja: `to.imigrareua.com/leticia-ferrari-eb2` carrega
`utm_affiliatename=leticia-ferrari`, e o contato nasce no HubSpot com
`referred_by = leticia-ferrari`.

**Se o UTM não chegar, o lead é perdido para sempre** do ponto de vista do
afiliado — não há como reconstruir a atribuição depois.

## A busca

```
POST /crm/v3/objects/contacts/search
filtro: referred_by = {hs_affiliate_id}
```

Propriedades lidas: `firstname`, `lastname`, `lifecyclestage`,
`hs_latest_disqualified_lead_date`, `createdate`, `hubspot_owner_id`,
`notes_last_updated`, `next_meeting_time`.

Além disso, duas buscas complementares:

- **Owners** (`/crm/v3/owners`) para traduzir o id do responsável em nome
- **Negócios associados** ao contato, para pegar o responsável do negócio quando
  ele difere do responsável do contato

## Escopos necessários no Private App

```
crm.objects.contacts.read
crm.objects.deals.read
crm.objects.owners.read
```

⚠️ O `crm.objects.owners.read` foi adicionado tarde e a falta dele custou um
ciclo inteiro de depuração — a coluna "Responsável" simplesmente vinha vazia,
sem erro visível. Se ela voltar a ficar em branco, confira o escopo antes de
qualquer outra coisa.

## Sincronização

Roda todo dia às **7h BRT (10h UTC)** por `node-cron`, dentro do próprio
`server.js`. Percorre os afiliados ativos com slug preenchido, busca os leads de
cada um e grava em `sync_data`.

O admin também pode disparar manualmente, por afiliado, na tela de Afiliados.

⚠️ O cron sobe junto com **qualquer** instância do servidor, inclusive uma rodada
localmente. Se você deixar o portal rodando na sua máquina passando das 7h, ele
vai gravar em produção.

## Privacidade

O nome do lead é parcialmente ocultado antes de chegar ao afiliado:
`Romulo Queiroz` vira `Romulo Q.**`. O afiliado nunca vê e-mail ou telefone.
