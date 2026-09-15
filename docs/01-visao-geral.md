# Visão geral

## O problema que o portal resolve

A LIV recebe indicações de parceiros — consultores de imigração, influenciadores,
escritórios parceiros. Antes, o parceiro indicava alguém e ficava no escuro: não
sabia se o lead foi atendido, se avançou, se fechou.

O portal dá **transparência ao afiliado** sobre o andamento das próprias
indicações, e dá ao **time LIV** o controle de quem participa do programa.

## Os dois perfis

**Afiliado** — vê apenas os próprios dados. Quatro telas:

- **Dashboard** — total de leads, convertidos, em andamento, taxa de conversão e
  a bonificação simulada no período
- **Pipeline de Leads** — cada indicação, em que etapa está, quem é o responsável
  na LIV e quanto aquele lead vale
- **Meus Links** — os links curtos que ele divulga, prontos para copiar
- **Meu Perfil** — dados cadastrais e foto

**Admin** — visão de toda a rede. Sete telas: Visão Geral, Solicitações,
Afiliados, Modelos de Bonificação, Links de Afiliados, Formulários de Captação e
Health das Integrações.

## O ciclo completo de um lead

1. **O afiliado divulga um link curto**, por exemplo
   `to.imigrareua.com/leticia-ferrari-eb2`
2. **O link redireciona** para um formulário (HubSpot ou Typeform), carregando
   parâmetros UTM — entre eles `utm_affiliatename=leticia-ferrari`, que é a
   identidade do afiliado
3. **A pessoa preenche o formulário.** O HubSpot grava o `utm_affiliatename` no
   campo `referred_by` do contato
4. **O time comercial trabalha o lead** normalmente dentro do HubSpot, movendo o
   ciclo de vida do contato
5. **O portal sincroniza** — busca no HubSpot todos os contatos com
   `referred_by` igual ao slug do afiliado, traduz o ciclo de vida para as etapas
   do funil e guarda o resultado
6. **O afiliado vê o andamento**, com o nome do lead parcialmente ocultado
   (`Romulo Q.**`) por privacidade

A sincronização roda **automaticamente todo dia às 7h da manhã (BRT)**, e o admin
pode disparar manualmente por afiliado a qualquer momento.

## As etapas do funil

O portal traduz o *lifecycle stage* do HubSpot para uma linguagem própria:

| No portal | No HubSpot |
|---|---|
| Lead Recebido | qualquer outro estágio |
| Em Atendimento | `marketingqualifiedlead` |
| Reunião Agendada | `salesqualifiedlead` |
| Oportunidade | `opportunity` |
| Convertido | `customer` ou `evangelist` |
| Não Convertido | `other`, `unqualifiedlead`, ou com data de desqualificação |

## Bonificação

Cada afiliado pode ter uma **política de bonificação** atribuída pelo admin. A
política define um valor por etapa alcançada, e o valor de um lead é a soma de
todas as etapas até onde ele chegou.

Afiliado **sem política atribuída não vê valor nenhum** — nem no dashboard, nem
no pipeline. É proposital: evita expor número a quem ainda não teve a
remuneração acordada.

O rótulo na tela é sempre **"Bonificação Simulada"**. É um indicativo, não um
registro de pagamento.
