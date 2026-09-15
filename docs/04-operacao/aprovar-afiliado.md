# Aprovar um afiliado

## O fluxo

1. A pessoa se cadastra pelo portal. Um **slug é gerado automaticamente** a
   partir do nome (`Letícia Ferrari` → `leticia-ferrari`) e guardado em
   `hs_affiliate_id`
2. Ela cai em `pending` e vê uma tela de aguardo
3. O admin encontra a solicitação em **Solicitações**
4. Ao clicar em **Aprovar**: o status vira `active` e o portal **cria
   automaticamente todos os links** no Short.io
5. O afiliado entra e já encontra os links prontos

## Antes de aprovar, confira o slug

O slug é o que liga o afiliado aos leads dele no HubSpot. Depois que os links
forem criados e distribuídos, mudá-lo é caro: os links antigos continuam
carregando o slug velho, e os leads que chegarem por eles ficam sem atribuição.

⚠️ **Não existe restrição de unicidade no slug.** Dois afiliados com o mesmo
slug puxam os mesmos leads. Confira se já não existe alguém com aquele
identificador antes de aprovar — principalmente quando o nome é parecido ou a
pessoa representa a mesma empresa.

Se um slug antigo já tiver links distribuídos, use
`scripts/remap-slugs-antigos.js` para apontá-los ao slug atual sem quebrar o
endereço curto.

## Cuidado ao testar

Aprovar um afiliado **cria links reais no Short.io**, e a regra do projeto é
nunca apagar link. Um teste de aprovação deixa resíduo permanente na pasta.

## Revogar

O botão **Revogar** muda o status para `rejected`. Os links continuam existindo e
funcionando — revogar tira o acesso ao portal, não desliga os links já
distribuídos.
