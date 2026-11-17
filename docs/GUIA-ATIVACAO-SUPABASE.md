# Guia operacional — Supabase + PowerSync

**Projeto Supabase:** `bkhrxosiumviprnhlbim`  
**Repositório:** [MaluquinhoDev/Estudos](https://github.com/MaluquinhoDev/Estudos)  
**Branch de produção:** `main`  
**PWA:** [Estudos no GitHub Pages](https://maluquinhodev.github.io/Estudos/)

Este documento separa código já enviado ao repositório de serviços externos que ainda dependem da configuração do proprietário.

## 1. O que já foi implementado no código

- Login e criação de conta por e-mail/senha com Supabase Auth.
- Cliente PowerSync Web SDK 2.7.0 e banco SQLite persistente via IndexedDB.
- Banco local separado por usuário autenticado.
- Sync Streams por usuário em `powersync/sync-config.yaml`.
- Conector de upload que usa a sessão Supabase e operações permitidas em lista explícita.
- RLS permanece como barreira de autorização no PostgreSQL.
- Espelhamento do modelo atual do PWA para as tabelas locais PowerSync.
- Importação inicial: envia dados locais quando o banco remoto está vazio; baixa dados remotos quando o navegador está vazio.
- Conciliação de registros locais e remotos com IDs distintos.
- Conflito com mesmo ID e conteúdo diferente interrompe a sincronização sem sobrescrever automaticamente os dados.
- Atualizações recebidas pelo PowerSync atualizam a interface em execução.
- O PWA continua funcionando localmente mesmo sem variáveis de configuração.
- GitHub Actions instala dependências, testa o adaptador, gera o bundle e publica o PWA.

**Limite importante:** a aplicação ainda mantém `localStorage` como camada de compatibilidade para a interface. As alterações são espelhadas no SQLite/PowerSync. A troca integral da camada de leitura para SQLite não foi feita.

## 2. Etapa obrigatória — reconciliar o banco Supabase existente

O projeto Supabase já possui schemas e objetos de banco. **Este repositório não deve presumir que o banco remoto esteja vazio nem recriar sua estrutura inicial.** A migration de bootstrap `20261117000050_create_ava_schema.sql` foi removida porque sua criação de tabelas não foi fundamentada em uma inspeção do esquema real.

A migration `20261117000100_grant_authenticated_data_api.sql` permanece separada: ela concede privilégios ao papel `authenticated`, mas pressupõe que as seis tabelas usadas pelo AVA já existam e tenham colunas compatíveis com o conector e com `powersync/sync-config.yaml`.

Antes de qualquer deploy de migrations:
1. Faça um backup verificável do projeto Supabase.
2. Execute o SQL somente de leitura em `supabase/diagnostics/ava_schema_preflight.sql` no SQL Editor. Cada tabela precisa apresentar `PASS` para existência, colunas, chave primária `id` e RLS. A verificação de políticas também precisa apresentar `PASS`.
3. Compare o resultado com `src/powersync/schema.js`, `src/powersync/snapshot.js` e `powersync/sync-config.yaml`. O diagnóstico verifica nomes e presença de colunas; tipos, nulabilidade, FKs e semântica das políticas ainda exigem revisão.
4. Confira o histórico com `supabase migration list --remote` e guarde a saída.
5. Como `supabase/migrations` já contém uma migration incremental de grants, **não rode `supabase db pull` diretamente nessa pasta**. Faça o baseline em um clone/worktree temporário limpo do mesmo repositório, com `supabase/config.toml` e diretório `supabase/migrations` vazio. Com o projeto linkado, execute `supabase db pull --schema public` nesse diretório temporário. Revise o SQL gerado e confirme que ele representa o estado remoto existente; não aceite nem marque baseline aplicado se houver diferenças inexplicadas.
6. Depois de obter o baseline, incorpore-o ao repositório principal com timestamp anterior à migration incremental de grants. Se o timestamp gerado for posterior a `20261117000100`, renomeie a migration de grants para um timestamp posterior ao baseline, mantendo o nome descritivo. Preserve os arquivos originais até a revisão terminar.
7. Rode novamente `supabase migration list --remote`: baseline deve constar como aplicado e a migration de grants deve aparecer como pendente até ser deliberadamente implantada.
8. Só então habilite deploy automático. Não execute `db reset --remote`, não use `migration repair` para mascarar divergências e não aplique migrations de criação de tabelas às cegas.

`supabase migration repair` altera apenas o histórico, não executa o SQL. `supabase db pull` precisa de Docker para gerar o diff local. O baseline não é uma migration para recriar o banco de produção; ele registra no repositório o estado já existente.

A documentação do Supabase alerta que alterações feitas diretamente no Dashboard/SQL Editor podem não estar registradas no histórico de migrations. O baseline precisa refletir o estado real do banco; `CREATE TABLE IF NOT EXISTS` não verifica se uma tabela existente possui as colunas, constraints e políticas esperadas.

## 3. Conectar Supabase ao GitHub

1. No Supabase, abra **Project Settings → Integrations → GitHub Integration**.
2. Autorize o aplicativo Supabase no GitHub.
3. Selecione `MaluquinhoDev/Estudos`.
4. Configure **Working directory** como `.`.
5. Configure a branch `main`.
6. Mantenha **Deploy to production** desativado até concluir a reconciliação da etapa 2.

Depois da revisão do esquema, da criação/reconciliação do baseline e do histórico:
1. Ative **Deploy to production** para `main`.
2. Salve a configuração.
3. Acompanhe a primeira implantação no painel Supabase.
4. Confirme que as migrations esperadas foram aplicadas.

O workflow `.github/workflows/supabase-deploy.yml` só valida os arquivos. A integração oficial Supabase/GitHub fica responsável pelo deploy remoto.

## 4. Configurar PowerSync Cloud

### 4.1 Criar a instância

1. Entre no [PowerSync Dashboard](https://dashboard.powersync.com/).
2. Crie uma instância PowerSync Cloud.
3. Use a opção de configuração guiada **Set Up with Supabase** para conectar o projeto `bkhrxosiumviprnhlbim`.
4. Autorize a conexão e conclua a configuração guiada do usuário de replicação e da publicação PostgreSQL.
5. Não coloque senha de replicação ou credencial administrativa no GitHub, no frontend ou em arquivos do repositório.

A configuração guiada cria os elementos de replicação necessários. Não crie outro usuário/publication manualmente em paralelo.

### 4.2 Publicar Sync Streams

1. No PowerSync Dashboard, abra a instância e entre em **Sync Streams**.
2. Copie o conteúdo de `powersync/sync-config.yaml`.
3. Cole no editor de configuração.
4. Clique em **Validate**.
5. Confirme que todas as seis tabelas são aceitas e que as consultas usam `auth.user_id()`.
6. Clique em **Deploy**.
7. Copie a URL da instância PowerSync.

As regras filtram os dados pelo usuário autenticado. Não remova os filtros por usuário.

## 5. Configurar autenticação Supabase

1. No Supabase, abra **Authentication → Providers**.
2. Confirme que **Email** está habilitado.
3. Em **Authentication → URL Configuration**, defina a Site URL como:

   `https://maluquinhodev.github.io/Estudos/`

4. Inclua essa mesma URL na lista de Redirect URLs permitidas.
5. Mantenha a confirmação de e-mail ativada ou desativada conforme a política escolhida no projeto. Com confirmação ativada, a criação da conta exige confirmar o endereço antes do primeiro login.

O frontend implementado usa e-mail e senha. Não foi adicionado login social.

## 6. Configurar variáveis do GitHub Pages

No GitHub:
1. Abra [Settings → Secrets and variables → Actions](https://github.com/MaluquinhoDev/Estudos/settings/secrets/actions).
2. Entre na aba **Variables** — não em Secrets.
3. Crie estas três variáveis:

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase, por exemplo `https://bkhrxosiumviprnhlbim.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key do projeto Supabase |
| `VITE_POWERSYNC_URL` | URL da instância PowerSync Cloud |

Esses três valores são públicos por definição porque serão incorporados ao JavaScript entregue ao navegador. A segurança depende de RLS e das regras de sincronização.

**Nunca** use `service_role`, secret key, senha do PostgreSQL, token de acesso Supabase ou senha de replicação nessas variáveis.

Depois de criar as variáveis, execute o workflow **Deploy PWA to GitHub Pages** em Actions → Run workflow, branch `main`. Um novo push também dispara o deploy.

## 7. Como o primeiro login trata os dados

- Navegador com dados locais e banco remoto vazio: os dados locais são enviados ao PowerSync.
- Navegador vazio e banco remoto com dados: os dados remotos são carregados na aplicação.
- Ambos com registros distintos: os registros são conciliados por ID.
- Mesmo ID com conteúdo divergente: a sincronização é interrompida para evitar sobrescrita automática.
- Dados locais associados a outra conta: o login não transfere esses dados para o novo usuário.

O banco SQLite local usa um arquivo separado por ID de usuário. A exportação JSON continua disponível.

## 8. Testes e implantação

O CI agora verifica:
- sintaxe JavaScript;
- estrutura do AVA;
- isolamento do upload por usuário;
- alvo de upsert compatível com a chave primária `id`;
- presença do diagnóstico SQL de schema remoto (a consulta precisa ser executada manualmente no Supabase);
- filtros de Sync Streams;
- migração SQL de privilégios;
- testes unitários de conversão e conflito;
- geração do bundle PowerSync.

O workflow de Pages publica os arquivos estáticos e o bundle produzido pelo Vite. Sem as três variáveis de configuração, a aplicação continua em modo local e não mostra login.

## 9. Estado que ainda depende de configuração externa

- Integração GitHub autorizada no Supabase.
- Histórico remoto de migrations reconciliado.
- Migration de grants aplicada.
- Instância PowerSync Cloud criada e conectada ao PostgreSQL.
- Sync Streams validados e publicados.
- Variáveis do GitHub Pages preenchidas.
- Primeiro login e teste real entre dois dispositivos.

Até essas etapas serem concluídas, o código de sincronização estará no repositório, mas não haverá sincronização remota ativa em produção.

## 10. Documentação oficial

- [Supabase GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [PowerSync + Supabase](https://docs.powersync.com/integrations/supabase/guide)
- [PowerSync Web SDK](https://docs.powersync.com/client-sdks/reference/javascript-web)
- [PowerSync Sync Streams](https://docs.powersync.com/sync/streams)
