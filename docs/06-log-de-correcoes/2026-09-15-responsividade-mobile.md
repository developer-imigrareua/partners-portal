# Responsividade mobile

**Data:** 15/09/2026 · **Gravidade:** média

## O sintoma

No celular, a barra lateral de 232px ocupava dois terços da tela e empurrava o
conteúdo para fora. Cartões colados uns nos outros, último item escondido atrás
do menu, filtros arrastando a página inteira para o lado.

O portal não tinha **nenhuma media query** — era inteiramente desktop.

## As causas, uma a uma

**A barra lateral** tinha largura fixa com `min-width`, então não encolhia.
Virou gaveta deslizante abaixo de 900px.

**As grades** eram `repeat(4, 1fr)` fixas. Vários grids vêm de `style` inline
gerado no JS, então as regras mobile precisaram de `!important` para vencê-los.

**Cartões colados.** A regra `.only-mobile{display:block}` vencia
`.lead-cards{display:flex}` — mesma especificidade, e a media query vem depois no
arquivo. Sem flex, o `gap` simplesmente não existe.

**Último cartão sob o menu.** O atalho `.content{padding:12px 10px}` num
breakpoint menor zerava o `padding-bottom` reservado para a barra inferior.

**Filtros empurrando a página.** Duas causas somadas: `#main-area` tem
`overflow-y:auto`, o que promove o eixo horizontal a scroll; e a faixa de pills,
sendo item flex com `min-width:auto`, não encolhia — estourava o container e
arrastava tudo.

A correção não foi só técnica: rolagem lateral escondida é uma affordance ruim,
o usuário não descobre. As pills viraram **dropdowns** no mobile.

**Título sumindo no iPhone.** O `.topbar` vive dentro do `#main-area`, que é
quem rola — então saía de vista. Só passou a incomodar quando o título duplicado
do cabeçalho foi ocultado no mobile: o topbar virou o único lugar com o título.
Ficou `sticky`.

## O caso das tabelas do admin

Sete páginas, cinco tabelas largas. Reescrever cada uma como cartão significaria
recriar coluna por coluna e botão por botão — exatamente onde se perde algo sem
perceber.

A solução foi outra: **o mesmo DOM é reaproveitado.** Uma função percorre a
tabela renderizada e marca cada célula com o texto do cabeçalho da sua coluna; o
CSS reempilha aquilo como cartão. Nada é reescrito, então nada pode se perder — e
vale para as sete páginas de uma vez, inclusive tabelas injetadas depois, via
`MutationObserver`.

Verificado comparando mobile e desktop: mesma contagem de células e botões
visíveis em todas as páginas.

## Também corrigido

- Campos com `font-size:16px` no mobile — abaixo disso o iOS dá zoom ao focar e
  desloca o layout
- "Personalizado" no filtro de período não mostrava os campos de data: eles
  estavam dentro do container que virou `only-desktop`
- O afiliado perdeu o ☰ (a barra inferior cobre as 4 páginas dele), então o
  logout foi para a tela de Perfil

## O aprendizado

**Especificidade e ordem no CSS.** Duas regras de mesma especificidade: vence a
última do arquivo. Foi o que anulou o `flex` dos cartões.

**Atalho de `padding` apaga o valor específico.** `padding: 12px 10px` zera
qualquer `padding-bottom` definido antes.

**Item flex não encolhe sozinho.** `min-width:auto` é o padrão e faz o item
estourar o container.

**Rolagem lateral escondida não é solução de responsividade.** Funciona no teste
de quem sabe que ela existe, e falha com o usuário real.
