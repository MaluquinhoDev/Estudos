# Guia operacional do Supabase — AVA Estudos

**Projeto Supabase:** `bkhrxosiumviprnhlbim`  
**Repositório:** [MaluquinhoDev/Estudos](https://github.com/MaluquinhoDev/Estudos)  
**CLI fixada no CI:** 3.0.0

Este guia descreve o estado inicial da integração e o procedimento seguro para administrar o banco. A aplicação PWA ainda utiliza localStorage; publicar o esquema não sincroniza automaticamente os dados locais nem conecta o frontend ao Supabase.

## 1. Arquivos versionados

- `supabase/config.toml`: configuração do projeto CLI.
- `supabase/migrations/`: histórico SQL versionado.
- `.github/workflows/supabase-deploy.yml`: implantação manual e controlada.
- `docs/AVA-ARQUITETURA-ALVO.md`: arquitetura maior do AVA.

A migração inicial cria as tabelas `profiles`, `courses`, `modules`, `lessons`, `review_cards` e `resources`. Os IDs dos cursos, módulos, conteúdos, cartões e recursos são TEXT para manter compatibilidade com os identificadores gerados atualmente pelo PWA. Todas as tabelas privadas têm RLS e políticas de propriedade por `auth.uid()`.

## 2. Secrets necessários no GitHub

Em **Settings → Secrets and variables → Actions**, cadastre:

| Nome | Conteúdo |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token do Supabase |
| `SUPABASE_PROJECT_ID` | `bkhrxosiumviprnhlbim` |
| `SUPABASE_DB_PASSWORD` | Senha do banco do projeto |

Não coloque tokens, senhas ou chaves secret em arquivos, commits, Issues, logs ou no frontend. Credenciais que já tenham sido publicadas em conversas devem ser revogadas e substituídas.

## 3. Preparação no computador

Instale Node.js e use a CLI fixada pelo projeto:

```bash
npx supabase@3.0.0 --version
npx supabase@3.0.0 login
npx supabase@3.0.0 link --project-ref bkhrxosiumviprnhlbim
```

Não é necessário iniciar Docker ou o banco local para executar a CLI contra o projeto hospedado.

## 4. Inspecionar o banco remoto antes da primeira migração

A primeira migração só deve ser aplicada depois de verificar que o esquema remoto não possui tabelas preexistentes que colidam com o modelo AVA.

```bash
npx supabase@3.0.0 migration list --remote
npx supabase@3.0.0 db dump --remote
```

A saída do dump deve ser guardada localmente, fora do repositório, como registro/backup. Revise o esquema e faça backup pelo painel antes de qualquer alteração de produção.

Se o projeto já tiver tabelas ou histórico de migrações, não execute a migração inicial sem reconciliar o esquema remoto com o histórico versionado. Não use `db reset --remote` em produção.

## 5. Revisar e aplicar migrações

Pré-visualize:

```bash
npx supabase@3.0.0 db push --dry-run --remote
```

Aplique somente depois de revisar o plano:

```bash
npx supabase@3.0.0 db push --yes --remote
```

A CLI v3 usa o banco local como padrão para comandos de banco. O sinalizador `--remote` é obrigatório para deixar explícito que o destino é o projeto hospedado. Em automação não interativa, `--yes` confirma a alteração remota.

## 6. GitHub Actions

O workflow `.github/workflows/supabase-deploy.yml` está configurado para execução manual por segurança durante a implantação inicial. Ele:

1. valida a presença dos três secrets;
2. verifica a configuração e os arquivos SQL;
3. instala Supabase CLI 3.0.0;
4. vincula o projeto;
5. executa `db push --dry-run --remote`;
6. aplica as migrações com `db push --yes --remote`.

Acesse **Actions → Supabase - Validate and deploy database migrations → Run workflow**. O workflow não consegue verificar os valores dos secrets, apenas detectar se estão vazios. Uma execução bem-sucedida é a evidência de que autenticação, vínculo e migração funcionaram.

## 7. Modelo de segurança

- RLS está habilitado nas tabelas privadas.
- Cada registro de conteúdo inclui `user_id`.
- As políticas limitam as operações ao usuário autenticado proprietário.
- A criação de perfil é feita por trigger após o cadastro em Auth.
- A chave publishable pode ficar no frontend, mas somente com RLS e políticas corretas.
- Chaves secret/service_role, PAT e senha do banco nunca podem ficar no navegador.

Depois de aplicar o esquema, teste duas contas diferentes para confirmar que uma não consegue consultar ou alterar os registros da outra.

## 8. Estado atual e limites

- O esquema SQL está versionado, mas ainda não foi aplicado ao projeto remoto.
- O workflow está preparado, mas ainda não foi executado.
- O PWA continua salvando dados em localStorage.
- Não existe ainda sincronização local/remota, importação automática do backup JSON, login integrado ou configuração da URL/chave publishable no frontend.
- A migração inicial não importa dados já armazenados no navegador.
- A migração cria apenas a estrutura de dados inicial; tentativas, respostas, eventos de aprendizagem e domínio adaptativo permanecem etapas futuras.

## 9. Referências oficiais

- [Supabase CLI v3](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
