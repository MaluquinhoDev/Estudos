# Guia de ativação do Supabase no AVA — responsabilidades e execução

**Projeto:** `bkhrxosiumviprnhlbim`  
**Repositório:** [MaluquinhoDev/Estudos](https://github.com/MaluquinhoDev/Estudos)  
**Estado deste guia:** atualizado em 16/11/2026

Este documento separa as operações que dependem do proprietário do projeto Supabase das alterações que podem ser preparadas no repositório. A existência dos arquivos no GitHub não significa que o banco remoto já foi alterado nem que o PWA já esteja sincronizado.

## 1. Estado técnico já publicado

O repositório contém:

- `supabase/config.toml`: configuração da Supabase CLI.
- `supabase/migrations/20261116000100_initial_ava_schema.sql`: esquema inicial para perfis, cursos, módulos, conteúdos, cartões e recursos, com RLS.
- `.github/workflows/supabase-deploy.yml`: workflow manual que verifica secrets, vincula o projeto, faz dry-run e aplica migrações.
- `docs/AVA-ARQUITETURA-ALVO.md`: arquitetura de destino.
- `docs/GUIA-ATIVACAO-SUPABASE.md`: comandos operacionais.

A aplicação atual continua usando armazenamento local do navegador. A migração SQL cria a estrutura remota, mas não transfere dados do localStorage, não adiciona login ao PWA e não ativa sincronização.

## 2. O que o proprietário precisa fazer no painel Supabase

### Etapa A — proteger as credenciais

1. Abra o [Supabase Dashboard](https://supabase.com/dashboard).
2. Entre no projeto correspondente ao Project Ref informado neste guia.
3. Como credenciais de acesso foram compartilhadas em conversa anteriormente, revogue o Personal Access Token antigo e gere outro.
4. Redefina a senha do banco caso ainda seja a mesma que foi compartilhada.
5. Não cole tokens ou senhas em Issues, commits, arquivos do repositório ou mensagens públicas.

O PAT é usado pela CLI para autenticar na plataforma. A senha do banco é uma credencial diferente.

### Etapa B — conferir o banco remoto antes da primeira migração

1. Abra **SQL Editor** e **Table Editor**.
2. Verifique se já existem tabelas ou objetos criados manualmente.
3. Confira se há dados importantes.
4. Faça backup antes de qualquer mudança de esquema.
5. Não aplique a migração inicial sem reconciliar tabelas já existentes com o modelo versionado.

A migração inicial foi escrita para criar o esquema AVA. Ela não é uma rotina de importação nem uma migração de dados. Se já houver tabelas com os mesmos nomes, a estrutura existente pode não corresponder às colunas e restrições esperadas pelo AVA.

### Etapa C — cadastrar secrets no GitHub

Abra [Settings → Secrets and variables → Actions](https://github.com/MaluquinhoDev/Estudos/settings/secrets/actions) no repositório e crie estes três **Repository secrets**:

| Nome exato | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | PAT novo do Supabase |
| `SUPABASE_PROJECT_ID` | `bkhrxosiumviprnhlbim` |
| `SUPABASE_DB_PASSWORD` | Nova senha do banco |

Atenção:
- Não crie estes valores como variáveis públicas.
- O GitHub oculta o conteúdo dos secrets após salvar; nem o proprietário consegue ler o valor integral novamente pela interface.
- O workflow só verifica se os secrets estão presentes. A execução real valida se são aceitos.
- Não envie os valores dos secrets para o chat.

### Etapa D — executar a implantação manual

1. Abra [GitHub Actions](https://github.com/MaluquinhoDev/Estudos/actions).
2. Selecione **Supabase - Validate and deploy database migrations**.
3. Clique em **Run workflow** na branch `main`.
4. Abra a execução criada e confira cada etapa.
5. A execução só é considerada bem-sucedida quando o vínculo, o dry-run e a aplicação das migrações terminarem sem erro.
6. Depois, abra o Table Editor no Supabase e confirme as tabelas e políticas criadas.

O workflow aplica alterações no banco remoto. A prévia é executada antes, mas a aplicação continua sendo uma alteração real de produção. Não execute antes de revisar o esquema remoto e confirmar o backup.

## 3. O que ainda precisa ser configurado no Supabase Auth

Depois da criação do esquema:

1. Abra **Authentication → URL Configuration**.
2. Configure o Site URL com o endereço real em que o PWA será publicado.
3. Adicione os Redirect URLs necessários para produção e desenvolvimento.
4. Revise as opções de confirmação de e-mail e o provedor SMTP antes de habilitar cadastro público.
5. Faça testes com duas contas distintas.

A política RLS deve impedir que uma conta leia ou altere os registros pertencentes à outra. A autenticação identifica o usuário; RLS aplica a autorização linha a linha.

Não habilite login público sem revisar confirmação de e-mail, URLs de redirecionamento, recuperação de senha e políticas de acesso.

## 4. O que eu consigo executar no repositório

Com acesso aos arquivos do GitHub, consigo:

- inspecionar o código atual e mapear como o localStorage representa cursos, módulos, conteúdos, cartões e recursos;
- criar e revisar migrações SQL, índices, chaves estrangeiras, triggers e políticas RLS;
- alterar o workflow GitHub Actions e documentar a implantação;
- implementar o cliente JavaScript do Supabase usando URL e publishable key;
- implementar cadastro, login, logout, recuperação de sessão e proteção das operações;
- desenvolver uma camada de repositório para substituir o acesso direto ao localStorage sem reescrever toda a interface de uma vez;
- implementar sincronização local/remota, fila de operações offline, resolução de conflitos e estados de erro;
- criar migração dos dados existentes no navegador para a conta autenticada, com prévia, validação, deduplicação e backup;
- escrever testes automatizados e validar a estrutura do código;
- publicar as alterações de código e documentação no GitHub.

Essas tarefas são implementações no código. Cada etapa precisa ser verificada antes de ser tratada como concluída.

## 5. O que depende de você ou de acesso que não está disponível aqui

| Ação | Responsável |
|---|---|
| Revogar PAT antigo e redefinir senha do banco | Proprietário no painel Supabase |
| Conferir dados/tabelas já existentes no projeto | Proprietário no painel Supabase |
| Cadastrar os três GitHub Actions secrets | Proprietário nas configurações do GitHub |
| Clicar em Run workflow e autorizar a execução | Proprietário no GitHub Actions |
| Configurar domínio, URL de redirecionamento e SMTP | Proprietário no Supabase |
| Fornecer a URL do PWA publicado e confirmar o comportamento desejado de login | Proprietário |
| Verificar no painel o resultado real do banco | Proprietário, com evidências da execução |

O conector GitHub disponível para esta tarefa permite ler e publicar arquivos, mas não permite ler os valores dos secrets nem iniciar manualmente um workflow_dispatch. Portanto, não devo afirmar que executei a Action ou que o banco remoto foi alterado sem evidência de uma execução concluída.

A publishable key é projetada para uso no cliente, mas deve ser usada junto com RLS corretamente configurado. Uma secret key ou service_role nunca pode ser incluída no JavaScript entregue ao navegador.

## 6. Implementação no PWA: ordem segura

Após a migração do banco ser confirmada:

1. **Cliente Supabase:** adicionar dependência e configuração com Project URL e publishable key.
2. **Autenticação:** construir telas de cadastro/login/logout e recuperação de sessão.
3. **Modelo de dados:** mapear os objetos atuais do PWA para as tabelas remotas.
4. **Camada de persistência:** centralizar leitura e gravação para que a interface não dependa diretamente de localStorage.
5. **Importação inicial:** transferir os dados locais para o usuário autenticado sem sobrescrever silenciosamente registros existentes.
6. **Offline-first:** manter IndexedDB como armazenamento local mais robusto e criar fila de sincronização.
7. **Conflitos:** definir regras explícitas para edição simultânea em mais de um dispositivo.
8. **Testes:** validar isolamento entre contas, recarga de sessão, operação offline, reconexão e restauração de backup.

Não se deve remover o armazenamento local antes de confirmar a sincronização e a recuperação dos dados. O Service Worker continua responsável pelo cache dos recursos da aplicação; ele não substitui o banco local nem a fila de sincronização.

## 7. Critérios de conclusão

A integração só deve ser declarada funcional quando todos estes testes passarem:

- [ ] Workflow de migração concluído com sucesso.
- [ ] Tabelas e políticas verificadas no projeto Supabase.
- [ ] Cadastro e login funcionam.
- [ ] Usuário A não consegue consultar nem alterar dados do usuário B.
- [ ] Cursos, módulos, conteúdos, cartões e recursos são persistidos remotamente.
- [ ] Dados locais existentes podem ser importados sem perda.
- [ ] O PWA continua utilizável offline.
- [ ] Alterações offline são sincronizadas após reconexão.
- [ ] Conflitos são detectados e tratados sem perda silenciosa.
- [ ] Exportação e restauração de backup foram testadas.

## 8. Documentação oficial consultada

- [Supabase CLI v3 — mudanças e comandos remotos](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
- [Supabase — Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase — Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Auth](https://supabase.com/docs/guides/auth)
- [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [GitHub — Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

## 9. Estado resumido

**Publicado no GitHub:** configuração da CLI, migração inicial, workflow manual e guias.

**Ainda não comprovado:** execução da migração no banco remoto, configuração final do Auth e teste das políticas no ambiente real.

**Ainda não implementado no PWA:** integração JavaScript com Auth, persistência remota, importação de dados locais e sincronização offline/online.
