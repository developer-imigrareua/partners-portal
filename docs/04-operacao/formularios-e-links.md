# Formulários e links

## Formulários de Captação

A tela **Formulários de Captação** administra a lista de formulários que viram
links. Cada um tem:

- **ID** — compõe o path do link (`{slug}-{id}`). Escolha com cuidado: mudar
  depois desalinha os links já criados
- **URL base** — o endereço do formulário, sem UTMs
- **Plataforma** — HubSpot, Typeform ou Outro
- **UTMs padrão** — aplicados a todos os links daquele formulário
- **Ativo** — se entra no "Criar todos"
- **Aplicar a** — todos os afiliados, ou apenas os escolhidos

Os parâmetros `utm_affiliatetype` e `utm_affiliatename` são preenchidos
automaticamente por afiliado. Não configure manualmente.

## Links customizados por afiliado

Um formulário com escopo **"Afiliados específicos"** só vira link para quem
estiver na lista. É assim que se cria um link exclusivo para um parceiro.

O caminho curto: em **Links de Afiliados**, abra o afiliado e clique em
**✨ Link customizado**. O modal abre já travado naquele afiliado.

O padrão continua sendo global: um formulário novo vale para todos, a menos que
você mude o escopo.

## Links de Afiliados

Mostra, por afiliado, qual link existe para cada formulário. Dá para:

- **Criar todos** — gera os que faltam
- **Criar** um link individual
- **Editar** o destino de um link
- **Ocultar** da visão do afiliado (o link continua funcionando)
- **Remover** da visão do afiliado (idem — não apaga no Short.io)

## Ao editar o destino de um link

A tela permite escolher outro formulário ou digitar uma URL própria. Duas coisas
a saber:

- **O endereço curto nunca muda.** Só o destino
- Existe uma trava contra destino inválido: o portal recusa gravar algo que não
  seja uma URL absoluta. Foi acrescentada depois que essa tela gravou
  `undefined` em links reais — ver [Log de correções](../06-log-de-correcoes/2026-09-15-links-quebrados.md)
