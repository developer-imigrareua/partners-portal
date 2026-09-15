# Integrações

Três serviços externos. O navegador **nunca** fala diretamente com nenhum deles
usando credencial sensível — tudo passa pelo `server.js`.

| Serviço | Papel | Página |
|---|---|---|
| Supabase | Autenticação e banco de dados | [supabase.md](supabase.md) |
| HubSpot | Origem da verdade sobre os leads | [hubspot.md](hubspot.md) |
| Short.io | Links curtos rastreáveis | [shortio.md](shortio.md) |

## Chaves

Todas ficam em variáveis de ambiente configuradas no EasyPanel:

```
HUBSPOT_API_KEY         token de Private App
SUPABASE_URL            URL do projeto
SUPABASE_SERVICE_KEY    service role — ignora RLS, só no servidor
SHORTIO_API_KEY         chave secreta
SHORTIO_DOMAIN          to.imigrareua.com
SHORTIO_DOMAIN_ID       1165599
SHORTIO_FOLDER_ID       pasta onde todos os links vivem
```

A única chave que aparece no navegador é a **anon key** do Supabase, que é
pública por design — ela apenas identifica o projeto. Quem decide o que ela pode
ler é o RLS. Ver [Segurança](../05-seguranca.md).

## Endpoints do servidor

| Método | Rota | Função |
|---|---|---|
| GET | `/api/hubspot/sync?hsId=X` | Busca os leads de um afiliado no HubSpot |
| POST | `/api/shortio/create-bulk` | Cria todos os links de um afiliado |
| POST | `/api/shortio/create` | Cria um link avulso |
| GET | `/api/shortio/links?affiliateId=X` | Lista os links da pasta |
| PATCH | `/api/shortio/update` | Altera o destino de um link |
| PATCH | `/api/affiliate/:userId/links-config` | Oculta ou remove link da visão do afiliado |
| GET/POST/PATCH/DELETE | `/api/link-forms` | CRUD dos formulários de captação |
| GET | `/api/health` | Testa conectividade com HubSpot e Short.io |

⚠️ **Nenhum endpoint tem autenticação.** Quem souber a URL consegue chamar. É uma
limitação conhecida, registrada em [Limitações](../07-limitacoes-conhecidas.md).
