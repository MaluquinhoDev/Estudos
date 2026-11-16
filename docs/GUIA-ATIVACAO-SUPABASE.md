# Guia de ativação da infraestrutura Supabase

**Objetivo:** preparar o projeto Supabase e os segredos do GitHub para habilitar posteriormente a implantação automatizada de migrações.

> Este guia não pede que credenciais sejam enviadas por chat, commitadas ou colocadas no código. Segredos devem ser inseridos diretamente nos painéis oficiais.

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com/dashboard
2. Entre na sua conta ou crie uma.
3. Clique em **New project**.
4. Escolha a organização.
5. Defina um nome para o projeto, por exemplo `ava-estudos`.
6. Crie uma senha forte para o banco e guarde-a em um gerenciador de senhas.
7. Escolha a região mais próxima dos usuários.
8. Aguarde a criação do projeto.

O identificador do projeto (Project Reference / Project ID) aparece na URL do painel:

`https://supabase.com/dashboard/project/SEU_PROJECT_REF`

Não confunda o Project Ref com a URL completa.

## 2. Obter URL e chave pública

1. Abra o projeto.
2. Acesse **Connect** ou **Settings → API Keys**, conforme a interface atual.
3. Copie a **Project URL**.
4. Copie a chave **Publishable**, normalmente iniciada por `sb_publishable_`.

Esses dois valores são destinados à configuração do cliente. A chave publishable não substitui autenticação nem políticas RLS.

Não use uma chave `sb_secret_` no PWA. Não use a senha do banco no navegador.

## 3. Criar token para o GitHub Actions

1. Abra https://supabase.com/dashboard/account/tokens
2. Crie um Personal Access Token com nome identificável, por exemplo `github-ava-deploy`.
3. Restrinja as permissões ao mínimo necessário para o projeto.
4. Para o comando `supabase link`, a documentação exige leitura de Project Settings, API Keys e API Key Secrets.
5. Copie o token uma única vez e mantenha-o privado.

A permissão do token deve ser revisada na documentação vigente do Supabase. Não publique o token em Issues, Pull Requests, arquivos ou logs.

## 4. Cadastrar segredos no GitHub

1. Abra https://github.com/MaluquinhoDev/Estudos
2. Entre em **Settings**.
3. Na barra lateral, abra **Secrets and variables → Actions**.
4. Selecione **New repository secret**.
5. Cadastre os nomes abaixo, um por vez.

| Nome do secret | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token criado no Supabase |
| `SUPABASE_PROJECT_ID` | Project Ref do projeto |
| `SUPABASE_DB_PASSWORD` | Senha do banco definida na criação do projeto |

A URL e a chave publishable não são segredos privilegiados. Elas serão configuradas na aplicação quando a integração de frontend for implementada. Não adicionar `SUPABASE_SECRET_KEY` ao frontend.

## 5. Criar a primeira migração com segurança

A estrutura de migrações deve ser versionada no repositório em `supabase/migrations/`.

No computador de desenvolvimento, com Supabase CLI instalado:

```bash
supabase --version
supabase init
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

Antes de criar tabelas em um projeto que já tenha estrutura no painel, inspecione e sincronize o esquema existente conforme a documentação:

```bash
supabase db pull --remote
```

Crie novas alterações com migrações versionadas:

```bash
supabase migration new nome_da_alteracao
```

Teste localmente antes de publicar. Não execute migrações destrutivas em produção sem backup e revisão.

## 6. Ativar a implantação automatizada

O workflow do repositório usa os seguintes secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

Depois que esses segredos existirem e houver migrações revisadas em `supabase/migrations/`, o workflow poderá vincular o projeto e executar `supabase db push --yes --remote`.

A CLI v3 exige confirmação explícita em operações remotas; em automação não interativa, use `--yes`. A flag `--remote` é importante para deixar explícito que a operação se destina ao banco remoto.

## 7. Segurança obrigatória antes de conectar o PWA

- Habilitar RLS em todas as tabelas acessíveis pela API.
- Criar políticas que limitem cada registro ao usuário proprietário.
- Testar acesso com duas contas diferentes.
- Não confiar em filtros da interface como controle de segurança.
- Não expor chave secret, senha do banco ou token pessoal.
- Não armazenar dados sensíveis desnecessários.
- Configurar backups e testar restauração.
- Revisar o Security Advisor do Supabase.

## 8. O que ainda não deve ser feito

Não criar tabelas definitivas antes de recuperar e examinar o modelo de dados e o código atual do AVA. A migração precisa preservar cursos, módulos, conteúdos, cartões, recursos e progresso já armazenados.

Não conectar o PWA a uma tabela sem RLS e políticas verificadas.

Não executar o primeiro deploy de banco até revisar as migrações e confirmar que o projeto remoto não contém dados que seriam sobrescritos.

## 9. Documentação oficial atual

- Criar e gerenciar projetos: https://supabase.com/dashboard
- Implantação e branching: https://supabase.com/docs/guides/deployment
- Gerenciamento de ambientes e GitHub Actions: https://supabase.com/docs/guides/deployment/managing-environments
- Migrações de banco: https://supabase.com/docs/guides/deployment/database-migrations
- Chaves de API: https://supabase.com/docs/guides/getting-started/api-keys
- Tokens pessoais: https://supabase.com/docs/guides/platform/personal-access-tokens
- Conexão com PostgreSQL: https://supabase.com/docs/guides/database/connecting-to-postgres
- Secrets do GitHub Actions: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
