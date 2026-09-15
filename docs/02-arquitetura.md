# Arquitetura

## Em uma frase

Uma SPA de arquivo único servida por um Express que funciona como **proxy de
chaves** — nenhuma credencial sensível chega ao navegador.

## Os arquivos

```
index.html      A aplicação inteira: CSS, markup e ~2.300 linhas de JS
server.js       Express — proxy para HubSpot, Short.io e Supabase, mais o cron
db/             SQL aplicado no Supabase (RLS, policies, gatilho, escopo)
test/           Testes sem dependências — `npm test`
scripts/        Utilitários de manutenção (reparo de links, remap de slugs)
docs/           Esta documentação
Dockerfile      Build para o EasyPanel
```

Não há build, bundler nem framework. Três dependências no total: `express`,
`dotenv` e `node-cron`. Chart.js e o cliente do Supabase vêm de CDN.

## Como a interface é montada

Não existem componentes. `renderPage(page)` é um mapa que limpa o container
principal e chama a função de renderização daquela página, que monta HTML por
template string. Os handlers são `onclick` inline chamando funções globais.

É simples e funciona, mas tem consequências que valem conhecer:

- **Estilo inline gerado no JS vence o CSS.** Várias regras responsivas precisam
  de `!important` por causa disso.
- **Passar dados por atributo `onclick` é frágil.** Já causou um bug real: um
  JSON embutido no atributo quebrava o parser de HTML e o botão ficava inerte.
  Passe identificadores, nunca objetos serializados.

## Estado global

```js
let usersCache = []       // todos os usuários carregados
let modelsCache = []      // políticas de bonificação
let linkFormsCache = []   // formulários de captação
let currentUser = null    // quem está logado
```

## Persistência

`saveUsers()` e `saveModels()` gravam **apenas as linhas e colunas que mudaram**,
comparando com uma baseline capturada no carregamento.

Isso não é otimização: é requisito. Com RLS ativo, um afiliado só tem permissão
sobre a própria linha — gravar a tabela inteira seria rejeitado. Antes era um
`upsert` de tudo, que além de rejeitado falhava em silêncio.

Falha de escrita hoje avisa o usuário e **não avança a baseline**, então a
próxima tentativa regrava o que ficou pendente.

## Responsividade

O breakpoint principal é `900px`. Três mecanismos:

- **`.only-desktop` / `.only-mobile`** — tabela e cards são gerados na mesma
  passada e alternados por CSS. Sem detecção de viewport em JS, então
  redimensionar a janela funciona.
- **`rotularTabelas()`** — marca cada célula com o texto do cabeçalho da sua
  coluna, e o CSS reempilha a tabela como cartão. Usado nas 7 páginas do admin:
  como o DOM não é reescrito, nenhuma coluna ou botão pode se perder na
  conversão.
- **Navegação por perfil** — afiliado tem barra inferior com 4 abas (suas 4
  páginas); admin tem gaveta lateral, porque 7 páginas não cabem em abas.

## Deploy

- **EasyPanel** em VPS própria, buscando do GitHub
- **Porta interna 3000** — não mudar, outras aplicações na VPS dependem do
  mapeamento
- **Domínio** `partner.imigrareua.com` (singular) via Traefik

⚠️ **O push no `master` não dispara o deploy sozinho**, apesar do que se possa
supor. É preciso chamar o webhook de deploy do EasyPanel. Pior: o painel mostra
"sucesso" mesmo quando reconstruiu o commit antigo — confira o tamanho em bytes
da página servida, ou procure um trecho novo do código, antes de dar por feito.
