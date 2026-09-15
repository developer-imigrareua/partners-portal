# Partner Portal — Documentação

Portal de afiliados da **ImigrarEUA / LIV Immigration Law**. Afiliados indicam
leads através de links rastreados; o portal mostra a eles o andamento de cada
indicação no funil comercial, e dá ao time LIV o controle de quem participa,
com quais links e sob qual política de bonificação.

**Produção:** https://partner.imigrareua.com
**Repositório:** `developer-imigrareua/partners-portal` (branch `master`)

## Índice

| Página | O que contém |
|---|---|
| [Visão geral](01-visao-geral.md) | O que o portal faz, para quem, e o ciclo completo de um lead |
| [Arquitetura](02-arquitetura.md) | Stack, organização do código, deploy e ambiente |
| [Integrações](03-integracoes/README.md) | Supabase, HubSpot e Short.io — o que cada uma faz e como |
| [Operação](04-operacao/README.md) | Rotinas do dia a dia: aprovar afiliado, gerir formulários, bonificação |
| [Segurança](05-seguranca.md) | Autenticação, RLS, o que nunca deve ser feito |
| [Log de correções](06-log-de-correcoes/README.md) | Histórico de incidentes e correções, com causa raiz |
| [Limitações conhecidas](07-limitacoes-conhecidas.md) | O que não funciona hoje, e por quê |
| [Pendências](08-pendencias.md) | Fila de trabalho: o que falta decidir e fazer |

## Para quem está chegando agora

Leia nesta ordem: **Visão geral** → **Arquitetura** → a integração que você vai
tocar. O **Log de correções** vale uma passada mesmo sem urgência: vários bugs
sérios nasceram de detalhes que parecem inofensivos, e estão documentados ali
justamente para não voltarem.
