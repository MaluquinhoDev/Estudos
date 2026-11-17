# Guia detalhado — próximos passos do backend do Estudos

**Repositório:** [MaluquinhoDev/Estudos](https://github.com/MaluquinhoDev/Estudos)  
**Branch:** `main`  
**Projeto Supabase:** `bkhrxosiumviprnhlbim`  
**PWA:** https://maluquinhodev.github.io/Estudos/  
**Revisão documental:** 17/11/2026  
**Objetivo:** orientar a configuração manual dos serviços externos e estabelecer a sequência técnica para concluir a migração local-first sem arriscar os dados existentes.

> Este guia não afirma que as configurações externas já foram feitas. O estado do Dashboard Supabase, do PowerSync Cloud, das variáveis do GitHub e do histórico remoto de migrations não pode ser comprovado apenas pela leitura do repositório. Cada item externo tem uma verificação explícita.

---

## 1. Diagnóstico confirmado no repositório

### 1.1 Implementado no código

- PWA em HTML, CSS e JavaScript nativos.
- Supabase Auth com e-mail/senha.
- PowerSync Web SDK `2.7.0`.
- Schema SQLite para `profiles`, `courses`, `modules`, `lessons`, `review_cards` e `resources`.
- Arquivo local particionado por identidade autenticada.
- Sync Streams definidos em `powersync/sync-config.yaml`.
- Conector de upload com allowlist de tabelas e `user_id` derivado da sessão Supabase.
- RLS como barreira de autorização no PostgreSQL.
- Proteção contra snapshots incompletos, exclusões implícitas e eventos obsoletos na primeira entrega da Fase 0B.
- Testes unitários do conector, identidade e snapshots.
- Build e publicação do PWA por GitHub Actions.

### 1.2 Ainda não concluído

1. A interface ainda lê e grava o estado operacional em `localStorage`; SQLite/PowerSync recebe espelhamento e ainda não é a fonte primária da UI.
2. A Fase 0A ainda não tem comprovação por testes reais de navegador com duas contas.
3. A Fase 0B ainda não tem comprovação com SQLite/PowerSync real, CRUD queue e concorrência de duas sessões.
4. Não há comprovação de sincronização real com PowerSync Cloud.
5. Não há comprovação de RLS com duas identidades em PostgreSQL/Supabase de teste.
6. O workflow `.github/workflows/supabase-deploy.yml` valida arquivos SQL; não aplica migrations no banco remoto.
7. O repositório tem `package.json`, mas não foi encontrado `package-lock.json`. O CI usa `npm install`, não instalação reprodutível com `npm ci`.
8. O estado remoto do histórico de migrations e as configurações dos painéis externos permanecem desconhecidos.

**Consequência:** não ativar deploy de migrations em produção nem declarar a sincronização ponta a ponta concluída antes das verificações deste guia.

---

## 2. Ordem geral de execução

| Ordem | Etapa | Tipo | Bloqueia |
|---:|---|---|---|
| 1 | Inspecionar o estado remoto e fazer backup | Manual — Supabase | Qualquer alteração de banco |
| 2 | Reconciliar schema e histórico de migrations | Manual + revisão no Git | Deploy de migrations |
| 3 | Aplicar migrations pendentes em ambiente controlado | Manual ou integração Supabase/GitHub | Permissões finais |
| 4 | Configurar Auth e URLs | Manual — Supabase | Login real |
| 5 | Criar/conectar PowerSync Cloud | Manual — PowerSync | Sincronização remota |
| 6 | Publicar Sync Streams | Manual — PowerSync | Download segmentado por usuário |
| 7 | Configurar variáveis do GitHub Pages | Manual — GitHub | Frontend conectado |
| 8 | Testar duas contas, dois navegadores e modo offline | Manual + testes automatizados | Aprovação da integração |
| 9 | Migrar a UI para repositórios SQLite | Código + CI | Local-first integral |
| 10 | Testar RLS, migrations e integração na CI | Código + CI | Segurança verificável |
| 11 | Habilitar deploy protegido do banco | Manual — Supabase/GitHub | Operação de produção |

As etapas 1–8 são a configuração e validação da infraestrutura existente. As etapas 9–10 exigem evolução do código. Não são substituíveis por cliques no Dashboard.

---

## 3. Supabase — inspeção e proteção do banco existente

### 3.1 Antes de executar qualquer migration

1. Acesse o projeto correto: https://supabase.com/dashboard/project/bkhrxosiumviprnhlbim
2. Confirme o identificador do projeto na URL.
3. Abra **Database → Backups** e verifique a disponibilidade de backup.
4. Gere um backup/exportação verificável do schema e dos dados relevantes, de acordo com os recursos disponíveis no plano.
5. Registre a data, o projeto e o resultado da verificação do backup.
6. Não use comandos de reset remoto.

O projeto já possui objetos de banco. Não se deve presumir que ele esteja vazio nem recriar tabelas para fazê-las coincidir com o código.

### 3.2 Executar o diagnóstico somente de leitura

No Supabase, abra **SQL Editor → New query**.

Execute primeiro:

`supabase/diagnostics/ava_schema_preflight.sql`

Depois execute:

`supabase/diagnostics/ava_schema_audit.sql`

Os dois arquivos são consultas de inspeção. Não fazem alterações no schema.

**Critérios de leitura:**

- `PASS`: condição conferida.
- `FAIL`: divergência que bloqueia a etapa.
- `REVIEW`: exige inspeção humana, especialmente em políticas e FKs.

O preflight verifica as seis tabelas, colunas obrigatórias, chaves primárias e RLS. A auditoria detalhada também mostra tipos, nulabilidade, FKs, políticas e privilégios efetivos.

**Não basta** que as tabelas existam. O resultado esperado no projeto é:

- `profiles`: chave primária `id`.
- Tabelas de conteúdo: chave primária composta `(id, user_id)`.
- RLS habilitado nas seis tabelas.
- Relações entre registros de conteúdo preservando o mesmo proprietário.
- `anon` sem privilégios nas tabelas do AVA.
- `authenticated` com `SELECT, UPDATE` em `profiles` e CRUD nas tabelas de conteúdo, sob RLS.

A auditoria marca FKs e políticas como `REVIEW` de propósito: a saída deve ser examinada para confirmar que as expressões realmente restringem o acesso a `auth.uid()` e que as FKs incluem as colunas de proprietário esperadas.

### 3.3 Inspecionar o histórico de migrations

No computador com Supabase CLI instalado, dentro do repositório:

```bash
supabase login
supabase link --project-ref bkhrxosiumviprnhlbim
supabase migration list --remote
```

Guarde a saída completa. O comando compara os timestamps locais com o histórico remoto.

O repositório contém atualmente:

- `20261117000100_grant_authenticated_data_api.sql`
- `20261117000200_harden_ava_table_privileges_and_policies.sql`

Não presumir que ambas estejam aplicadas. A saída do comando é que determina o estado real.

**Interpretação:**

- Timestamp local e remoto alinhados: histórico correspondente.
- Migration local sem timestamp remoto: migration pendente.
- Timestamp remoto sem arquivo local: histórico/schema ainda não representado adequadamente no Git.
- Schema remoto diferente do esperado: interromper e investigar antes de qualquer deploy.

Não usar `supabase migration repair` para fazer os números parecerem alinhados. Esse comando altera o histórico; não executa o SQL da migration.

### 3.4 Reconciliar o schema remoto com o Git

O projeto já tem migrations incrementais, mas o schema remoto foi criado anteriormente. O baseline deve representar o estado real existente, não recriar tabelas.

Procedimento seguro:

1. Preserve o estado atual do repositório e a saída de `supabase migration list --remote`.
2. Não rode `supabase db pull` diretamente sobre a pasta principal de migrations sem antes reconciliar o histórico.
3. Crie um clone ou worktree temporário do repositório.
4. Nesse ambiente temporário, preserve `supabase/config.toml`, mas use uma pasta `supabase/migrations` vazia.
5. Faça login e vincule o mesmo projeto.
6. Capture o schema remoto com o fluxo de pull documentado pelo Supabase, por exemplo `supabase db pull --remote`, seguindo a confirmação apresentada pela CLI.
7. Revise integralmente o SQL gerado. Ele deve representar o schema que já existe; não pode conter uma recriação destrutiva ou diferenças inexplicadas.
8. Compare o baseline com os diagnósticos SQL e com `src/powersync/schema.js`, `src/powersync/snapshot.js`, `src/powersync/connector.js` e `powersync/sync-config.yaml`.
9. Compare também os timestamps do baseline com as migrations incrementais existentes.
10. Só depois da revisão, incorpore o baseline ao repositório principal, com histórico e timestamps coerentes.

Se o histórico remoto já tiver migrations aplicadas, obtenha e reconcilie esses arquivos antes de criar um baseline redundante. Não duplique a história do banco.

**Ponto de parada:** se a CLI sugerir marcar um baseline como aplicado, se houver migrations remotas sem conteúdo local ou se o schema gerado divergir do diagnóstico, não confirme automaticamente. Primeiro determine exatamente o que será registrado e o que será executado.

### 3.5 Testar as migrations antes da produção

O ambiente local do Supabase usa Docker. Em uma máquina que não consiga executar Docker adequadamente, a CI do GitHub Actions pode executar esse ambiente em um runner Linux.

Com o histórico reconciliado:

```bash
supabase start
supabase db reset
supabase test db
```

`db reset` aqui é para o banco local do Supabase, não para o projeto hospedado. Ele recria o banco local a partir das migrations e seed configurados.

Antes de liberar migrations para produção, validar:
- aplicação em banco local vazio;
- aplicação sobre uma cópia representativa da versão anterior;
- constraints e FKs;
- políticas RLS;
- privilégios de `anon` e `authenticated`;
- testes negativos entre dois usuários.

Não executar `supabase db reset --remote` em produção. Esse comando é destrutivo.

### 3.6 Aplicar as migrations pendentes

Somente depois de:
- backup verificado;
- diagnóstico sem falhas bloqueadoras;
- baseline/histórico reconciliado;
- migrations testadas em banco local;
- revisão do SQL pendente.

Faça uma prévia:

```bash
supabase db push --dry-run --remote
```

Confira o alvo e a lista de migrations que seriam aplicadas. Se a saída incluir alterações inesperadas, interrompa.

A aplicação real é uma ação de produção e exige confirmação explícita do responsável pelo projeto:

```bash
supabase db push --remote
```

Não use `--yes` para contornar a confirmação durante a primeira aplicação. Após a execução, rode novamente:

```bash
supabase migration list --remote
```

E execute novamente `ava_schema_preflight.sql` e `ava_schema_audit.sql` no SQL Editor.

---

## 4. Supabase — autenticação e URLs

No Dashboard do projeto:

### 4.1 Habilitar e-mail

1. Abra **Authentication → Sign In / Providers** (o nome da seção pode variar com a versão do Dashboard).
2. Abra o provedor **Email**.
3. Confirme que está habilitado.
4. Defina a política de confirmação de e-mail.
5. Salve.

O frontend atual implementa e-mail/senha; não há login social implementado.

### 4.2 Configurar URLs

Em **Authentication → URL Configuration**:

- Site URL:
  `https://maluquinhodev.github.io/Estudos/`
- Redirect URLs: incluir exatamente:
  `https://maluquinhodev.github.io/Estudos/`

Não cadastrar domínio genérico ou URL de outro projeto. A URL deve corresponder ao endereço publicado.

### 4.3 Testar autenticação

Após configurar as variáveis do frontend descritas na seção 7:

1. Criar uma conta de teste.
2. Confirmar o e-mail, caso a confirmação esteja habilitada.
3. Entrar e sair.
4. Recarregar a página e verificar a recuperação da sessão.
5. Testar recuperação de senha.
6. Confirmar que uma sessão expirada não mantém dados privados visíveis.

---

## 5. PowerSync Cloud — conexão com o Supabase

### 5.1 Criar a instância

1. Acesse https://dashboard.powersync.com/
2. Crie ou selecione a instância destinada ao Estudos.
3. Na área **Health** ou **Database Connection**, escolha **Set Up with Supabase**.
4. Autorize a conexão com o projeto Supabase `bkhrxosiumviprnhlbim`.
5. Conclua o assistente guiado.
6. Confirme que a conexão PostgreSQL ficou saudável.

A configuração guiada é preferível porque prepara o usuário de replicação e a publicação necessários. Não execute também um segundo conjunto de comandos SQL manuais para criar outro usuário/publication.

Não copie senha de replicação, senha PostgreSQL ou credenciais administrativas para o frontend, GitHub Pages ou arquivos versionados.

### 5.2 Conferir a conexão

No painel PowerSync, confirme:
- projeto Supabase correto;
- conexão PostgreSQL saudável;
- replicação ativa;
- publicação/tabelas necessárias disponíveis;
- ausência de erro de autenticação ou replicação.

A URL pública da instância PowerSync será usada como variável do frontend. Ela não é a senha de conexão PostgreSQL.

---

## 6. PowerSync — publicar Sync Streams

O arquivo versionado é:

`powersync/sync-config.yaml`

Ele define seis consultas. A tabela `profiles` usa `id = auth.user_id()`; as demais usam `user_id = auth.user_id()`.

No Dashboard PowerSync:

1. Abra a instância do Estudos.
2. Entre em **Sync Streams**.
3. Copie o conteúdo integral de `powersync/sync-config.yaml`.
4. Cole no editor do Dashboard, substituindo a configuração anterior da instância do Estudos.
5. Clique em **Validate**.
6. Corrija qualquer erro de tabela, coluna ou sintaxe antes de continuar.
7. Confirme que as seis tabelas são reconhecidas.
8. Confirme que todas as consultas são filtradas pelo usuário autenticado.
9. Clique em **Deploy**.
10. Registre a data e o resultado da implantação.

Não remover `auth.user_id()` nem transformar as consultas em downloads globais.

**Teste de isolamento:** uma sessão A não pode receber registros de B. O filtro do Sync Stream é uma fronteira de distribuição; RLS continua sendo a autorização no PostgreSQL.

---

## 7. GitHub — variáveis de configuração do PWA

No repositório:

https://github.com/MaluquinhoDev/Estudos/settings/secrets/actions

Abra **Settings → Secrets and variables → Actions → Variables**.

Crie as três variáveis abaixo:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL HTTPS do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key pública do projeto |
| `VITE_POWERSYNC_URL` | Endpoint da instância PowerSync |

Use a publishable key, não uma chave privilegiada.

Essas variáveis são incorporadas ao bundle do navegador. Portanto, não são segredos. A segurança deve vir de RLS, filtros de Sync Streams e validação da identidade.

**Nunca colocar nestas variáveis:**
- `service_role`;
- secret key privilegiada;
- senha PostgreSQL;
- senha do usuário de replicação;
- Personal Access Token do Supabase;
- token administrativo do PowerSync.

Depois de salvar as variáveis, execute **Actions → Deploy PWA to GitHub Pages → Run workflow**, selecionando `main`. Verifique o resultado do build e do deploy. A publicação do PWA não aplica migrations do banco.

---

## 8. Teste de integração obrigatório

Executar somente depois que Auth, PowerSync, Sync Streams e variáveis estiverem configurados.

### 8.1 Teste com duas identidades

Use dois navegadores/perfis isolados:

1. Entrar como usuário A.
2. Criar curso, módulo, conteúdo, cartão e recurso de teste.
3. Aguardar sincronização.
4. Conferir os registros no Supabase.
5. Sair de A.
6. Entrar como usuário B em outro perfil.
7. Confirmar que B não recebe nenhum registro de A.
8. Criar um registro de B e confirmar que A não o recebe.
9. Voltar a A e confirmar que os dados de A permanecem.
10. Repetir após recarregar os navegadores.

Não usar o mesmo perfil com duas abas como único teste de isolamento: cookies e sessão podem ser compartilhados.

### 8.2 Teste offline/online

Para cada identidade:

1. Abrir o PWA conectado e aguardar a primeira sincronização.
2. Desconectar a rede.
3. Criar e editar registros.
4. Recarregar o PWA ainda offline.
5. Confirmar persistência local.
6. Reconectar.
7. Aguardar o envio da CRUD queue.
8. Conferir os dados no Supabase e no segundo dispositivo.
9. Repetir uma operação após falha de rede para verificar idempotência.

### 8.3 Limite atual deste teste

Mesmo com o PowerSync configurado, a UI ainda utiliza `localStorage` como fonte operacional e espelha snapshots para o SQLite. Portanto, esse teste valida a ponte e a infraestrutura existente, mas não comprova a arquitetura local-first final. A validação final só ocorre depois da Etapa 2 deste roadmap, com a interface lendo e escrevendo por repositórios SQLite.

---

## 9. Próxima implementação no código

A ordem de implementação recomendada é:

### 9.1 Concluir Fase 0A com navegador real

- Bloquear a leitura de dados privados até a identidade estar resolvida.
- Garantir que logout limpe imediatamente o estado visível da sessão anterior.
- Manter o banco local da conta preservado, sem exibi-lo a outra identidade.
- Testar A → logout → B, B → logout → A, reload, sessão expirada e falha de rede.
- Testar callbacks antigos concluindo depois da troca de conta.

**Aceite:** nenhum frame mostra dados de outra identidade.

### 9.2 Concluir Fase 0B com PowerSync real

- Exercitar transações no SQLite/PowerSync real.
- Testar rollback e falha no meio da operação.
- Testar CRUD queue e reenvio após falha.
- Testar alteração remota concorrente.
- Testar eventos locais e remotos sem loop de upload.
- Testar exclusão explícita e snapshot incompleto.

**Aceite:** nenhuma operação parcial, antiga ou concorrente apaga dados sem intenção explícita.

### 9.3 Extrair serviços e repositórios

Separar `app.js` em camadas sem redesenhar a interface:

- domínio: cursos, módulos, aulas, cartões e recursos;
- repositórios: consultas e persistência;
- casos de uso: criar, editar, excluir, revisar, importar e exportar;
- UI: renderização, formulários e eventos.

Os repositórios devem expor operações por entidade. A UI não deve montar snapshots integrais para cada alteração.

### 9.4 Tornar SQLite a fonte operacional

- Implementar repositórios concretos com PowerSync.
- Migrar primeiro as leituras; depois as escritas, com testes de regressão.
- Usar transações locais por caso de uso.
- Criar migração idempotente do snapshot legado.
- Fazer backup e validar contagens antes/depois.
- Manter exportação JSON e testar restauração em instalação limpa.
- Só remover a dependência operacional do `localStorage` depois de comprovar migração e restauração.

### 9.5 Formalizar conflitos por domínio

- Conteúdo editável: detectar edição concorrente e preservar a versão anterior.
- Metadados: política explícita por campo.
- Tentativas e eventos pedagógicos futuros: histórico append-only.
- Exclusões: mutações explícitas, com comportamento de restauração definido.
- Não usar apenas `updated_at` como relógio global de concorrência.

---

## 10. CI — banco, migrations e dependências

### 10.1 Lockfile

O repositório tem `package.json`, mas não tem `package-lock.json`. Antes de trocar o CI para `npm ci`:

```bash
npm install --package-lock-only
npm ci
npm test
npm run build
```

Revise e versione o `package-lock.json`. Depois, altere o workflow para usar `npm ci`. Não trocar o comando antes de o lockfile existir.

### 10.2 Testes pgTAP

Criar testes em `supabase/tests/` cobrindo:
- existência das tabelas e constraints;
- RLS habilitado;
- usuário A lê e altera seus registros;
- usuário A não lê, altera ou exclui registros de B;
- papel anon não acessa dados privados;
- FKs compostas impedem relações entre proprietários diferentes;
- privilégios efetivos de cada papel.

Executar localmente:

```bash
supabase start
supabase test db
```

O teste deve usar dados artificiais e transações isoladas. Nunca usar dados reais de produção na CI.

### 10.3 GitHub Actions para banco

A documentação oficial do Supabase descreve o uso de `supabase/setup-cli@v1`, `supabase start` e `supabase test db` em GitHub Actions.

O workflow deve:
1. instalar uma versão controlada da Supabase CLI;
2. iniciar o stack local no runner;
3. aplicar migrations no banco local;
4. executar pgTAP;
5. falhar em qualquer teste negativo de isolamento;
6. encerrar o stack ao final.

Esse job não deve receber senha nem token de produção. O runner testa o banco local descartável.

### 10.4 Deploy de banco separado do PWA

Manter:
- CI de JavaScript e frontend;
- testes de banco local;
- deploy PWA;
- deploy de migrations de produção.

São responsabilidades diferentes. A integração Supabase/GitHub pode aplicar migrations em `main`; o workflow atual `supabase-deploy.yml` não faz isso.

---

## 11. Configuração manual final — checklist

### Supabase

- [ ] Backup/exportação verificável.
- [ ] Preflight executado.
- [ ] Auditoria detalhada executada.
- [ ] FKs e políticas revisadas.
- [ ] Histórico de migrations inspecionado.
- [ ] Baseline reconciliado, quando necessário.
- [ ] Migrations testadas em ambiente local.
- [ ] Prévia de deploy revisada.
- [ ] Migrations pendentes aplicadas deliberadamente.
- [ ] Preflight e auditoria executados novamente.
- [ ] Auth Email habilitado.
- [ ] Site URL e Redirect URLs configuradas.

### PowerSync

- [ ] Instância Cloud criada.
- [ ] Setup guiado Supabase concluído.
- [ ] Conexão PostgreSQL saudável.
- [ ] Sync Streams validados.
- [ ] Sync Streams publicados.
- [ ] URL da instância registrada.

### GitHub

- [ ] Três Actions Variables configuradas.
- [ ] Nenhuma credencial privilegiada no frontend.
- [ ] Deploy PWA executado.
- [ ] Build e publicação confirmados.
- [ ] Lockfile versionado antes de adotar `npm ci`.

### Validação

- [ ] Login real testado.
- [ ] Duas contas isoladas testadas.
- [ ] Dados A invisíveis para B.
- [ ] Dados B invisíveis para A.
- [ ] Operações offline preservadas.
- [ ] CRUD queue enviada após reconexão.
- [ ] Alterações remotas refletidas.
- [ ] Conflitos e exclusões explícitas testados.
- [ ] RLS validada em banco de teste.

---

## 12. Critério para considerar o backend estabilizado

O backend só deve ser considerado estabilizado quando:

1. A identidade for resolvida antes de carregar dados privados.
2. A troca de conta não expuser dados da sessão anterior.
3. A UI usar repositórios SQLite/PowerSync como fonte operacional.
4. A migração do legado for idempotente e restaurável.
5. A CRUD queue funcionar offline/online sem duplicação.
6. Sync Streams e RLS forem testados com duas identidades.
7. Conflitos e exclusões tiverem políticas explícitas.
8. Migrations forem reproduzíveis em banco local e testadas na CI.
9. Backup e restauração forem comprovados.
10. Deploy de banco e deploy do PWA tiverem controles separados.

Até esses critérios serem satisfeitos, o estado correto é **backend em implementação e integração parcial**, não backend concluído.

---

## 13. Referências oficiais utilizadas

### Supabase

- [Local development e migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows)
- [CLI v3 — mudanças de comandos e alvo remoto](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
- [CLI — migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [Testing your database](https://supabase.com/docs/guides/database/testing)
- [Automated testing using GitHub Actions](https://supabase.com/docs/guides/deployment/ci/testing)
- [Deployment & Branching](https://supabase.com/docs/guides/deployment)

### PowerSync

- [Integração Supabase](https://docs.powersync.com/integrations/supabase/guide)
- [PowerSync Web SDK](https://docs.powersync.com/client-sdks/reference/javascript-web)
- [Sync Streams](https://docs.powersync.com/sync/streams)
- [Transações do SDK](https://powersync-ja.github.io/powersync-js/common/interfaces/Transaction)

---

**Estado deste documento:** guia operacional e técnico. Ele não executa configurações no Dashboard, não aplica migrations remotas e não comprova o estado de serviços externos. As ações manuais devem ser registradas com seus resultados antes de liberar a próxima etapa.
