# Guia operacional — Supabase, GitHub e PowerSync

**Projeto Supabase:** `bkhrxosiumviprnhlbim`  
**Repositório:** [MaluquinhoDev/Estudos](https://github.com/MaluquinhoDev/Estudos)  
**Branch de produção:** `main`

Este guia separa o que o repositório já prepara do que depende de autorização e configuração manual. O PWA atual ainda usa `localStorage`; a integração GitHub não conecta automaticamente o frontend ao Supabase, e PowerSync ainda não está instalado.

## 1. Estado implementado no repositório

- `supabase/config.toml`: identifica o projeto Supabase.
- `supabase/migrations/`: mantém o histórico SQL versionado.
- `.github/workflows/supabase-deploy.yml`: valida estrutura e nomes dos arquivos SQL; **não conecta ao banco nem aplica migrations**.
- `docs/AVA-ARQUITETURA-ALVO.md`: registra a arquitetura de evolução.
- O workflow de Pages continua responsável pela publicação do PWA.

A validação do GitHub Actions não substitui a validação SQL em um banco isolado. A integração Supabase é responsável pelo deploy remoto depois de configurada.

## 2. O que precisa ser feito por você — integração Supabase/GitHub

### Etapa A — autorizar a integração

1. Entre no [Dashboard do Supabase](https://supabase.com/dashboard/project/bkhrxosiumviprnhlbim).
2. Abra **Project Settings → Integrations**.
3. Localize **GitHub Integration** e selecione **Authorize GitHub**.
4. Na página do GitHub, autorize o aplicativo Supabase.
5. Retorne ao Supabase e selecione o repositório **MaluquinhoDev/Estudos**.
6. Em **Working directory**, informe `.`, pois a pasta `supabase/` está na raiz.
7. Configure a branch de produção como `main`.

Documentação oficial: [Supabase GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration).

### Etapa B — não habilitar o deploy de produção ainda

Conecte e autorize o repositório, mas mantenha **Deploy to production desabilitado** até conferir o histórico remoto e o esquema atual.

Motivo: o projeto já possui migrations versionadas, mas a execução anterior do workflow não passou da autenticação do PostgreSQL. Isso não comprova que o esquema remoto está vazio nem que a migration inicial pode ser aplicada sem conflito.

Antes de liberar o deploy:
- confira no painel Supabase se existem tabelas, dados ou alterações manuais;
- confira o histórico de migrations aplicado no banco;
- faça backup verificável;
- reconcilie qualquer diferença entre o esquema remoto e os arquivos em `supabase/migrations/`.

Não execute `db reset --remote` em produção. Não aplique a migration inicial às cegas.

### Etapa C — habilitar deploy automático

Depois da reconciliação e revisão do plano de migrations:

1. Volte a **Project Settings → Integrations → GitHub Integration**.
2. Ative **Deploy to production** para a branch `main`.
3. Salve a configuração.
4. Acompanhe a primeira implantação no painel Supabase, na área de deployments/branch status.
5. Confirme que cada migration esperada foi aplicada e que não houve falha.

A integração oficial pode implantar migrations pendentes da pasta `supabase/migrations` quando alterações chegam à branch de produção. Também pode implantar Edge Functions e buckets declarados em `config.toml`. A integração e o deploy pela branch principal funcionam nos planos gratuitos; ambientes de preview por branching exigem plano Pro conforme a documentação vigente.

## 3. O que muda nos GitHub Actions

O workflow `.github/workflows/supabase-deploy.yml` foi convertido em validação de arquivos. Ele:
- confere o `project_id`;
- verifica se existem migrations SQL;
- verifica padrão de nome, timestamp único e arquivo não vazio;
- não usa senha do banco;
- não executa `supabase db push`;
- não modifica o banco remoto.

O deploy remoto passa a ser responsabilidade da integração oficial Supabase/GitHub, evitando dois deploys concorrentes.

Os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` não são usados por esse workflow de validação. Não é necessário criar novos secrets para autorizar a integração: a autorização é feita pelo fluxo OAuth do Supabase/GitHub. Não exponha tokens ou senhas em mensagens, arquivos ou commits.

## 4. PowerSync — etapa posterior, ainda não ativada

**Decisão:** PowerSync será a camada offline-first; Supabase continua como backend e PostgreSQL como fonte remota de verdade.

O PowerSync mantém SQLite local no cliente, sincroniza dados autorizados por Sync Rules e enfileira escritas offline. O envio ao backend é implementado pelo aplicativo através de `uploadData()` e de uma API de escrita controlada.

O que ainda precisa ser construído:
1. Validar o PowerSync Web SDK em um protótipo compatível com o PWA e os navegadores-alvo.
2. Criar/configurar o projeto PowerSync e a conexão com o PostgreSQL Supabase.
3. Definir Sync Rules por usuário e tabelas autorizadas.
4. Criar API de upload autenticada que valide propriedade, relações, tipos e idempotência.
5. Testar conflito, reenvio, perda de conexão, retomada e isolamento entre duas contas.
6. Migrar dados de `localStorage` somente após backup, importação testada e comparação de integridade.

Não colocar `service_role`, senha do banco ou credenciais administrativas no JavaScript do navegador. A sincronização não está ativa apenas por adicionar documentação ou conectar o repositório.

Referências:
- [PowerSync + Supabase](https://supabase.com/partners/catalog/powersync)
- [PowerSync documentation](https://docs.powersync.com/)
- [Supabase deployment](https://supabase.com/docs/guides/deployment)

## 5. Segurança e credenciais

- Chave publishable pode ser usada no frontend somente com RLS e políticas corretas.
- Chave secret/service_role, PAT e senha do banco nunca podem estar no navegador.
- Credenciais que já tenham sido expostas devem ser revogadas ou substituídas.
- Não compartilhe senhas ou tokens em Issues, commits, logs ou conversas.
- Teste RLS com duas contas diferentes, incluindo tentativas de leitura e escrita cruzadas.

## 6. Limites atuais

- O PWA ainda salva dados em `localStorage`.
- Não há login Supabase integrado ao frontend.
- Não há SQLite/PowerSync, Sync Rules ou fila de sincronização implementados.
- Não há importação automática dos dados locais para o PostgreSQL.
- A conexão GitHub/Supabase depende da autorização feita no painel pelo proprietário.
- O deploy de produção permanece bloqueado até a reconciliação do esquema e do histórico remoto.

## 7. Referências oficiais

- [Supabase GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Supabase deployment](https://supabase.com/docs/guides/deployment)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [PowerSync + Supabase](https://supabase.com/partners/catalog/powersync)
- [PowerSync documentation](https://docs.powersync.com/)
