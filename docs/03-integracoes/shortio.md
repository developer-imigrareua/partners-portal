# Short.io

Gera os links curtos rastreáveis que o afiliado divulga.

Domínio: `to.imigrareua.com` · Todos os links vivem numa pasta única.

## Anatomia de um link

```
to.imigrareua.com/leticia-ferrari-eb2
└─ path: {slug do afiliado}-{id do formulário}

→ redireciona para:
https://share.hsforms.com/1pWgVKSF...?utm_source=general&utm_medium=affiliate
   &utm_campaign=analise-liv&utm_term=affiliate-audience
   &utm_content=direct-message&utm_affiliatetype=external
   &utm_affiliatename=leticia-ferrari
```

O `utm_affiliatename` é o que garante a atribuição do lead no HubSpot. Um link
sem ele é um lead perdido.

## Quando os links são criados

Na **aprovação do afiliado**: o portal chama `create-bulk`, que percorre os
formulários ativos e cria um link para cada. O admin também pode criar
individualmente ou refazer todos.

## 🚫 A regra mais importante

**Nunca chamar `DELETE` na API do Short.io.** Nem para limpar, nem para testar.

Remover um link da visão do afiliado é feito marcando `links_config` no Supabase
— o link continua existindo e funcionando para quem já o recebeu. Apagar de
verdade quebraria links já distribuídos, sem volta.

## Outras regras

- **Limite de listagem: 150.** Valores maiores fazem a API recusar
- **O path nunca muda.** Corrigir um link significa alterar o *destino*, jamais o
  endereço curto
- **Formulário sem `base_url` não deve gerar link.** O servidor hoje recusa e
  reporta erro, em vez de criar um link inválido silenciosamente

## Scripts de manutenção

Em `scripts/`:

- **`reparar-links.js`** — conserta o destino de links quebrados ou apontando
  para o formulário errado
- **`remap-slugs-antigos.js`** — conserta links criados sob um slug antigo do
  afiliado, apontando-os para o slug atual

Ambos rodam em simulação por padrão. Só gravam com `--aplicar`. Nenhum dos dois
apaga link.
