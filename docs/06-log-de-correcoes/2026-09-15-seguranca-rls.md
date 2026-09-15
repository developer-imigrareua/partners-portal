# Exposição da base de usuários (RLS)

**Data:** 15/09/2026 · **Gravidade:** crítica

## O sintoma

Nenhum. O portal funcionava normalmente — e era exatamente esse o problema.

## A causa raiz

As tabelas `users` e `bonif_models` estavam **sem Row Level Security**.

Como a anon key do Supabase fica em texto puro no `index.html` — o que é normal e
esperado — qualquer pessoa que abrisse o código-fonte da página conseguia ler a
tabela de usuários **inteira, sem fazer login**: nomes, e-mails, telefones,
empresas, e o cache completo de leads de cada afiliado.

Verificado na prática: uma requisição anônima devolvia as 14 linhas.

## A armadilha que quase passou

Ao inspecionar antes de ligar o RLS, apareceram policies antigas criadas por
alguém e nunca ativadas — invisíveis justamente porque o RLS estava desligado.

Uma delas, chamada `service role bypass`, estava escrita como:

```sql
TO public USING (true) FOR ALL
```

`public` é todo mundo, inclusive anônimo. `true` é todas as linhas. `ALL` é ler,
inserir, alterar e apagar.

**Policies se somam.** Ligar o RLS com ela no lugar não teria fechado nada — o
buraco continuaria aberto, agora com uma camada de segurança aparente. Era o pior
desfecho possível.

O nome revela a intenção: alguém quis garantir que o servidor continuasse
funcionando. Mas era desnecessário — o `service_role` ignora RLS por natureza no
Supabase. Prova dentro do próprio projeto: `link_forms` tem RLS ligado e **zero**
policies, e o servidor lê normalmente.

## A correção

1. Removidas as policies antigas, incluindo a `service role bypass`
2. Criada `is_admin()` como `SECURITY DEFINER`, para não recursar
3. Seis policies, todas `TO authenticated`: afiliado só a própria linha, admin
   todas. **Nenhuma policy de DELETE** — ninguém apaga usuário pelo portal
4. RLS ligado
5. Gatilho `users_guard_admin_columns` para proteger por coluna, já que RLS é por
   linha — sem ele o afiliado poderia se auto-aprovar ou virar admin

O SQL comentado está em `db/rls-policies.sql`.

## Um pré-requisito que quase passou batido

Ligar o RLS quebraria a gravação de perfil do afiliado. O portal fazia `upsert`
da tabela de usuários **inteira** a cada alteração — com RLS, o afiliado só tem
permissão sobre a própria linha, e o comando todo seria rejeitado. Em silêncio,
porque o erro era engolido.

A persistência foi reescrita antes para gravar só as linhas e colunas alteradas.
Efeito colateral positivo: o `sync_data` gravado pelo cron deixou de ser
sobrescrito pelo cache do navegador do admin.

## O aprendizado

**Chave pública não é o problema; policy ausente é.** A anon key aparecer no
código-fonte é o comportamento correto do Supabase.

**Sempre inspecione as policies existentes antes de ligar o RLS.** Uma policy
permissiva esquecida anula todas as outras, e o RLS ligado dá falsa sensação de
segurança.

**A ordem importa.** Ligar o RLS antes de ajustar a persistência deixaria a
edição de perfil quebrada em produção — foi o que aconteceu por alguns minutos,
até o deploy do código novo.

**`SECURITY INVOKER` vs `DEFINER` não é detalhe.** O gatilho precisa ser
`INVOKER`: como `DEFINER`, o `current_user` viraria o dono da função e a
verificação de "é o servidor chamando?" daria sempre verdadeiro, tornando a
trava decorativa.
