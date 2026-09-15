# Links apontando para `undefined` e formulários trocados

**Data:** 15/09/2026 · **Gravidade:** alta · **Duração:** ~3 meses sem detecção

## O sintoma

Três coisas, aparentemente independentes:

1. A tela de Links de Afiliados mostrava um link sob o formulário errado — o link
   de EB-1A aparecia como "Contato Geral"
2. Ao abrir a edição de um link, o preview da URL final começava com `undefined`
3. O botão "Editar" dos Formulários de Captação não respondia ao clique

Investigando, o problema real era maior: **a maioria dos links de afiliado
apontava para `https://undefined`** — endereço morto. De 81 links na pasta, só 11
estavam corretos.

## A causa raiz

Uma incompatibilidade de nome. A coluna no banco chama **`base_url`**; parte do
código lê **`url`**.

O commit `de5205b`, de 17/06, chama-se literalmente *"normalize base_url→url when
loading link forms from DB"* — mas corrigiu apenas o `index.html`. O `server.js`
ficou de fora.

Daí os quatro defeitos:

**1. A criação de links (causa raiz).** No `create-bulk`, a lista de formulários
começa como o array local (que tem `.url`) e é substituída pelas linhas do
Supabase (que têm `.base_url`). O código montava a URL com `form.url`, recebia
`undefined`, e gerava `https://undefined?utm_...`. Todo link criado desde 17/06
nasceu morto.

**2. O cache global sendo contaminado.** A tela de Formulários de Captação fazia
`linkFormsCache = forms` com as linhas cruas, sem normalizar. Bastava **visitar
aquela tela** para `f.url` virar `undefined` em todo o portal.

**3. A associação trocada.** Com `f.url` valendo `undefined`, a comparação
`originalURL.includes(f.url)` vira `includes("undefined")` — e o destino quebrado
contém literalmente a palavra "undefined". Como a busca percorre os formulários
em ordem, **tudo casava com o primeiro da lista**, que é "Contato Geral".

**4. A tela de edição piorando o quadro.** O seletor montava
`<option value="${f.url}">`, então o valor da opção virava a string
`"undefined"`. E a pré-seleção usava a mesma comparação defeituosa, marcando o
formulário errado. Quem abrisse a tela para **consertar** um link e salvasse
gravava `undefined?utm_...` de volta.

Ou seja: a ferramenta de conserto estava espalhando o defeito.

**Bônus.** Descobriu-se também que salvar formulário **nunca funcionou**: o
payload enviava `url` e `utm_source`/`utm_medium`/etc. como colunas, e nenhuma
existe — o banco tem `base_url` e `default_utms` (jsonb). O PostgREST devolvia
`400 PGRST204`.

E o botão "Editar" embutia um JSON no atributo `onclick`; a primeira aspa dupla
interna encerrava o atributo e o clique não fazia nada.

## A correção

- `server.js` passou a usar `form.url || form.base_url`, e recusa criar link para
  formulário sem URL base, em vez de gerar um inválido em silêncio
- A tela de Formulários normaliza antes de gravar no cache global
- A associação resolve primeiro pelo **path do link**, que é confiável, e só
  depois tenta pela URL. Base vazia nunca casa
- O botão "Editar" passa o identificador, não o objeto
- O salvamento usa o schema real (`base_url` + `default_utms`)
- **Trava nova:** nenhum destino que não seja URL absoluta válida é gravado

## A recuperação

Dois scripts em `scripts/`, ambos com simulação por padrão e sem nenhum `DELETE`:

- **`reparar-links.js`** — 47 links recuperados: 37 mortos e 10 apontando para o
  formulário errado
- **`remap-slugs-antigos.js`** — 18 links criados sob um slug antigo do afiliado,
  remapeados para o slug atual

Os endereços curtos não mudaram, então nada que já tinha sido distribuído deixou
de funcionar.

Também foi corrigido o cadastro do formulário de Avaliação Geral, que apontava
para uma versão antiga do Typeform.

## O aprendizado

**Um nome divergente entre banco e código é uma bomba-relógio.** Sobreviveu três
meses porque cada sintoma parecia um bug de interface isolado.

**Cuidado com `includes()` sobre valor possivelmente indefinido.**
`"texto".includes(undefined)` não dá erro: vira `includes("undefined")` e casa
com qualquer coisa que contenha essa palavra. Foi o que fez todos os links
colapsarem no primeiro formulário.

**Corrigir só a raiz não basta quando existe uma ferramenta de conserto manual.**
A tela de edição também precisava de trava, senão reintroduziria o defeito.

**Repare depois de decidir o destino certo, não antes.** Os primeiros 37 links
foram reparados apontando para o formulário que o banco declarava na hora — que
ainda era o antigo. Deu retrabalho: uma segunda passada depois que o cadastro foi
corrigido.
