# Estudos — próximas etapas arquiteturais do AVA

**Base da análise:** branch main, commit 851db867d02fe7a0c727ef22b467d1aa12b9c551.  
**Estratégia:** evolução incremental, sem reescrita total e sem perda de dados.

## 1. Diagnóstico do código atual

### O que já está implementado
- PWA estático com HTML, CSS e JavaScript nativo.
- Cursos, módulos, conteúdos, cartões de revisão, biblioteca, progresso e backup JSON.
- Supabase Auth com cadastro, login, logout e recuperação de sessão.
- PostgreSQL com profiles, courses, modules, lessons, review_cards e resources.
- RLS e políticas por proprietário.
- PowerSync Web SDK, SQLite persistente por usuário, Sync Streams e CRUD queue do SDK.
- Conector de upload com allowlist de tabelas e user_id derivado da sessão.
- Conversão e conciliação de snapshots.
- Testes unitários do conector e do snapshot.

### O que o código realmente faz hoje
O fluxo principal ainda é:

```text
Interface → app.js → localStorage → evento data-saved
          → snapshot completo → SQLite/PowerSync → Supabase
```

O app.js carrega o estado principal de localStorage e grava nele. O evento estudos:data-saved espelha o snapshot para o SQLite. Portanto, o SQLite/PowerSync ainda não é a fonte primária de leitura e escrita da interface.

### Gargalos identificados
1. **Acoplamento:** app.js concentra estado, renderização, eventos, regras e persistência.
2. **Persistência duplicada:** localStorage e SQLite mantêm representações do mesmo estado.
3. **Sincronização por snapshot:** cada salvamento converte e reconcilia o conjunto inteiro, em vez de registrar a intenção de cada operação.
4. **Exclusão implícita:** writeSnapshotToPowerSync remove do SQLite registros ausentes no snapshot. Um snapshot antigo ou incompleto pode transformar ausência em exclusão.
5. **Concorrência:** a fila de snapshots serializa o processamento, mas não define versões semânticas por entidade nem impede por si só que um snapshot antigo seja aplicado depois de uma atualização remota.
6. **Conflitos:** mergeSnapshots rejeita diferenças concorrentes, mas não oferece resolução por campo ou por tipo de dado.
7. **Troca de conta:** a checagem de proprietário interrompe a sincronização, mas o estado do app permanece no localStorage compartilhado do navegador. Logout e troca de usuário precisam isolar também a visualização local.
8. **Testes:** os testes existentes usam mocks; não comprovam RLS real, integração com PowerSync Cloud ou sincronização entre dispositivos.
9. **Deploy do banco:** supabase-deploy.yml valida arquivos e declara que não altera o banco remoto. Validação de migration não é deploy.
10. **Modelo pedagógico:** estados learned/mastered são manuais. Tentativas, respostas e evidências estruturadas ainda não existem.

## 2. Decisões arquiteturais

- Preservar IDs textuais existentes e as chaves compostas (id, user_id) no PostgreSQL.
- Preservar profiles.id = auth.users.id.
- Manter RLS como fronteira de autorização por linha.
- Usar a CRUD queue nativa do PowerSync como outbox. Não criar uma segunda fila sync_operations no cliente sem necessidade demonstrada.
- Nunca incluir service_role, senha do banco ou PAT no bundle público.
- Fazer migrações aditivas e compatíveis; não remover localStorage antes de comprovar migração e restauração.
- Não implementar xAPI, LTI, H5P ou motor adaptativo antes de estabilizar persistência, identidade e sincronização.

## 3. Arquitetura de destino

```text
Interface PWA
    ↓
Serviços de aplicação / casos de uso
    ↓
Repositórios de domínio
    ↓
SQLite / PowerSync — fonte local operacional
    ↕
CRUD queue + Sync Streams
    ↕
Supabase PostgreSQL + RLS

Service Worker: shell e recursos estáticos offline
Backup JSON: portabilidade e recuperação
```

Após a migração, a interface deve consultar e alterar os repositórios locais. O PowerSync sincroniza mutações com o servidor. A interface não deve manter localStorage como segunda fonte primária.

## 4. Etapas priorizadas

### Etapa 0 — segurança de conta e correção da sincronização
**Prioridade crítica.**

- Isolar o estado local por identidade autenticada.
- Definir logout, troca de usuário, sessão expirada e falha de rede.
- Impedir que a conta B visualize dados locais da conta A no mesmo navegador.
- Impedir aplicação de snapshots antigos após atualizações mais recentes.
- Tornar exclusões operações explícitas; ausência em snapshot não deve significar exclusão automática.
- Encerrar conexões e listeners ao trocar de usuário.
- Exibir estados separados: salvo localmente, pendente, sincronizado e erro.

**Aceite:** teste A → logout → B no mesmo navegador; nenhuma informação de A aparece para B; gravações pendentes não apagam alterações remotas; falhas de rede não apagam dados.

### Etapa 1 — serviços de aplicação e repositórios
**Prioridade alta.**

Extrair responsabilidades de app.js sem mudar a experiência visual.

Separar:
- domínio: cursos, módulos, conteúdos, cartões e recursos;
- serviços: casos de uso de criação, edição e exclusão;
- repositórios: leitura e escrita;
- UI: renderização e interação.

Casos de uso mínimos: CRUD de cursos, módulos, conteúdos e recursos; criação e revisão de cartões; exportação e importação.

**Aceite:** interface deixa de gravar diretamente em localStorage; regras testáveis sem DOM; testes de regressão preservam os fluxos atuais.

### Etapa 2 — SQLite como persistência operacional
**Prioridade alta.**

- Implementar repositórios concretos usando PowerSync.
- Migrar leitura e escrita da interface para esses repositórios.
- Fazer cada caso de uso executar transação local.
- Preservar relações, ordenação e IDs.
- Criar migração versionada e idempotente do snapshot legado.
- Validar dados e registrar contagens antes/depois da migração.
- Manter JSON como backup e testar restauração.

**Aceite:** interface lê do SQLite; reiniciar o PWA preserva dados; migração não duplica nem descarta registros; backup restaura em instalação limpa.

### Etapa 3 — sincronização incremental e conflitos
**Prioridade alta.**

- Substituir snapshots completos em cada evento por mutações de repositório.
- Usar CRUD queue do PowerSync para PUT/PATCH/DELETE.
- Derivar user_id da sessão autenticada em todas as gravações.
- Garantir idempotência de reenvios.
- Definir conflitos por domínio:
  - notas e descrições: detectar edição concorrente e preservar versões;
  - metadados: política documentada;
  - tentativas e eventos futuros: append-only;
  - exclusões: explícitas e testadas.
- Não usar updated_at isoladamente como relógio global de concorrência.
- Registrar erros sem expor conteúdo privado nos logs.

**Aceite:** CRUD offline sincroniza após reconexão; reenvios não duplicam; edições simultâneas geram conflito detectável; alterações em um registro não substituem registros não relacionados.

### Etapa 4 — integração, segurança e recuperação
**Prioridade alta.**

- Testar em Supabase local/temporário ou ambiente isolado.
- Testar RLS com duas identidades.
- Testar CRUD, constraints compostas, cascatas e sessão expirada.
- Testar troca de conta e reconexão.
- Testar migrations em banco vazio e em banco existente.
- Criar testes de navegador para fluxos essenciais.
- Testar restauração de backup.

**Aceite:** usuário A não lê nem modifica dados de B; migrations são reproduzíveis; nenhuma credencial privilegiada vai ao frontend.

### Etapa 5 — modelo pedagógico baseado em evidências
**Prioridade média; depende da etapa 4.**

Adicionar gradualmente:
1. learning_objectives;
2. activities;
3. attempts;
4. answers;
5. competencies;
6. learning_events e/ou mastery_records.

Regras:
- Estado manual learned/mastered não é prova automática de domínio.
- Tentativas devem manter histórico imutável.
- Separar progresso declarado de evidência de competência.
- Relatórios devem indicar quais evidências sustentam cada indicador.
- Cada nova tabela deve nascer com RLS, grants, constraints e índices.

### Etapa 6 — CI/CD e operação de banco
**Prioridade média.**

O workflow atual supabase-deploy.yml valida os arquivos; não aplica migrations remotas.

- Adicionar lockfile e usar npm ci.
- Testar migrations em banco local/temporário na CI.
- Separar validação, preview e deploy.
- Proteger ambiente de produção e restringir secrets ao job de deploy.
- Fazer backup antes de mudanças sensíveis.
- Executar smoke tests após deploy.
- Manter deploy do PWA independente do deploy do banco.
- Documentar rollback e restauração.

**Aceite:** instalações reprodutíveis; migrations testadas antes de produção; workflow de validação não é confundido com deploy.

### Etapa 7 — extensões futuras
**Prioridade futura.**

Storage, Edge Functions, H5P, LTI e xAPI/LRS entram somente quando o núcleo estiver estável e houver necessidade concreta.

## 5. Backlog em ordem de dependência

| Ordem | Entrega | Prioridade |
|---:|---|---|
| 1 | Isolamento local por conta e logout seguro | Crítica |
| 2 | Proteção contra snapshots obsoletos e exclusões implícitas | Crítica |
| 3 | Testes de troca de conta e concorrência | Crítica |
| 4 | Repositórios e serviços de aplicação | Alta |
| 5 | SQLite como fonte operacional da interface | Alta |
| 6 | Migração idempotente do localStorage | Alta |
| 7 | Escritas incrementais e conflitos por domínio | Alta |
| 8 | Testes reais de RLS, PowerSync e dispositivos | Alta |
| 9 | Atividades, tentativas e evidências | Média |
| 10 | CI/CD de banco e restauração | Média |
| 11 | Storage e interoperabilidade | Futura |

## 6. Fora do escopo imediato

- Reescrever a interface em React ou outro framework.
- Microserviços.
- Uma segunda fila paralela à CRUD queue do PowerSync.
- Motor adaptativo sem histórico de tentativas.
- xAPI, LTI e H5P antes da estabilização do núcleo.
- Remover localStorage antes de migração e restauração comprovadas.
- Deploy remoto automático sem ambiente protegido e teste de migrations.

## 7. Critério global de conclusão

O AVA estará pronto para ampliar o motor pedagógico quando a interface usar repositórios; SQLite/PowerSync for a persistência local operacional; troca de conta não expuser dados; sincronização incremental não apagar dados por snapshots antigos; conflitos forem detectados; RLS for testada com duas contas; migração e backup tiverem restauração comprovada; e CI validar código, migrations e integração.

**Status:** planejamento derivado da inspeção do código e dos documentos existentes. As etapas são backlog, não funcionalidades já implementadas.


---

## 8. Revisão técnica e pesquisa complementar — 17/11/2026

Esta revisão confronta o roadmap com os arquivos atuais e com a documentação oficial de Supabase e PowerSync. Ela atualiza a ordem de execução; não representa funcionalidades já implementadas.

### 8.1 Achados adicionais confirmados no código

1. **A proteção de conta acontece tarde demais para proteger a primeira renderização.** `app.js` executa `load()` imediatamente e lê a chave global `estudos-ava-v2`. A validação de `estudos-ava-owner` acontece depois, em `startSync()`. Portanto, a checagem pode interromper a sincronização, mas não impede que a interface já tenha carregado o estado compartilhado.
2. **Logout não limpa o estado em memória da interface.** `renderSignedOut()` altera o painel de sincronização, mas não substitui o estado carregado pelo `app.js`. A separação do banco SQLite por nome de arquivo não resolve, sozinha, a separação do estado da interface.
3. **A fila de snapshots preserva ordem de execução, não atualidade semântica.** `syncQueue` encadeia gravações, mas cada evento carrega uma cópia integral do estado. Um evento antigo que já esteja na fila pode ser aplicado depois de uma alteração mais recente.
4. **A leitura usada para calcular o snapshot de escrita ocorre antes da transação.** Em `writeSnapshotToPowerSync()`, as consultas de registros existentes acontecem antes de `writeTransaction()`. Uma alteração recebida entre a leitura e a aplicação pode tornar o conjunto de comparação obsoleto.
5. **Ausência é tratada como exclusão.** O método apaga do SQLite qualquer registro existente que não esteja no snapshot recebido. Isso é perigoso enquanto snapshots completos forem o mecanismo de escrita.
6. **Os testes atuais não cobrem o risco principal.** Os testes verificam conversão/merge e o conector HTTP simulado, mas não simulam troca de conta, logout, fila fora de ordem, exclusões concorrentes, transações SQLite reais nem políticas RLS executadas no PostgreSQL.
7. **A CI não garante instalação reproduzível.** O workflow usa `npm install`, e o manifesto apresentado não contém script de testes de banco. A adoção de `npm ci` depende da inclusão e manutenção de um lockfile.
8. **O workflow Supabase é apenas validador estrutural.** Seu próprio conteúdo declara que não executa migrations no banco remoto. O fluxo de migrações ainda precisa de testes em banco local/temporário.

### 8.2 Ajuste de prioridade

A Etapa 0 deve ser dividida em duas entregas verificáveis, sem misturá-las:

- **0A — isolamento de identidade e interface:** impedir que dados de uma identidade sejam carregados ou renderizados em outra sessão; tratar inicialização, troca de usuário, logout, sessão expirada e falha de inicialização.
- **0B — integridade de escrita e sincronização:** remover exclusões implícitas, impedir snapshots obsoletos, testar mutações concorrentes e estados de sincronização.

A Etapa 0A vem primeiro porque é uma fronteira de privacidade. A Etapa 0B vem em seguida porque o mecanismo atual pode transformar uma visão antiga do estado em exclusões ou sobrescritas locais/remotas.

### 8.3 Plano de execução revisado

| Ordem | Entrega verificável | Evidência obrigatória |
|---:|---|---|
| 1 | Bloqueio de renderização até determinar o contexto de identidade | Teste de inicialização sem sessão, com sessão A e com sessão B |
| 2 | Estado e armazenamento local separados por usuário | Teste A → logout → B no mesmo navegador, inclusive após recarregar |
| 3 | Logout/troca de sessão invalidam callbacks, listeners e operações antigas | Testes de corrida A → B e sessão expirada |
| 4 | Escritas não apagam dados por ausência em snapshot | Teste de exclusão explícita versus snapshot incompleto |
| 5 | Eventos antigos não vencem gravações mais recentes | Teste determinístico com fila atrasada e versões de estado |
| 6 | Transações e consultas coerentes no repositório local | Testes com SQLite/PowerSync real, não somente mocks |
| 7 | Serviços e repositórios extraídos de `app.js` | Testes de domínio sem DOM e regressão da interface |
| 8 | Interface lê e grava pelo SQLite/PowerSync | Teste offline, reinicialização e restauração |
| 9 | Mutação incremental e resolução de conflitos | Testes de dois dispositivos e reconexão |
| 10 | RLS e migrations exercitadas em PostgreSQL de teste | pgTAP + testes pelo cliente Supabase |
| 11 | Pipeline de banco separado do deploy PWA | CI reproduzível, migrations testadas e ambiente protegido |

### 8.4 Regras de implementação da Etapa 0A

- O bootstrap da interface deve receber um contexto de identidade explícito antes de carregar dados privados.
- A chave de armazenamento local não pode ser global entre usuários. O namespace deve incluir o identificador autenticado e a versão do formato.
- Dados legados sem proprietário identificado não devem ser associados automaticamente à conta que entrar primeiro. A migração deve ser explícita, validada e reversível por backup.
- No logout, a interface deve parar de exibir os dados da sessão anterior imediatamente; isso não significa apagar o banco local daquela identidade.
- Cada inicialização/troca de sessão deve possuir um identificador de geração. Respostas assíncronas de uma geração anterior não podem atualizar a interface nem gravar no banco da nova sessão.
- A validação de proprietário deve ser uma defesa adicional, não o mecanismo primário de isolamento.

### 8.5 Regras de implementação da Etapa 0B

- Não executar `DELETE` por diferença entre snapshot recebido e banco local.
- Exclusões devem ser operações explícitas, identificadas por registro e encaminhadas pela CRUD queue nativa do PowerSync.
- Não introduzir uma segunda fila paralela sem necessidade demonstrada.
- Não confiar apenas na ordem da Promise chain como controle de versão. Cada mutação precisa de identidade estável e regra clara de precedência.
- A reconciliação inicial deve distinguir banco remoto vazio, banco local vazio, dados legados, dados de outro usuário e conflito real.
- A leitura e a escrita local devem ocorrer em transação coerente; operações recebidas de sincronização não podem ser reexportadas como novas alterações do usuário.
- Estados visuais devem distinguir: salvo localmente, aguardando envio, sincronizado e erro.

### 8.6 Testes de banco e CI

A documentação oficial do Supabase recomenda testar RLS com pgTAP e também no nível da aplicação, incluindo casos negativos e diferentes papéis. O fluxo oficial de CI usa Supabase CLI, inicia uma instância local e executa `supabase test db`. Assim, a auditoria SQL manual permanece útil, mas não substitui testes automatizados de autorização.

Critérios mínimos:
- usuário A consegue operar seus próprios registros;
- usuário A não consegue ler, inserir, atualizar ou excluir registros de B;
- usuário anônimo não recebe acesso às tabelas privadas;
- constraints compostas impedem relações entre registros de proprietários diferentes;
- policies, grants e índices necessários são testados;
- migrations aplicam em banco vazio e em banco com a versão anterior;
- a CI não usa credenciais de produção para testes;
- deploy de produção exige ambiente protegido e aprovação explícita.

Não executar `supabase db reset --remote` em produção: a documentação oficial alerta que o comando destrói e recria o schema remoto. O fluxo de produção deve aplicar migrations pendentes de forma controlada, após validar o estado remoto e o backup.

### 8.7 Fontes oficiais consultadas

- PowerSync — integração Supabase e arquitetura local SQLite/CRUD queue/Sync Streams: https://docs.powersync.com/integration-guides/supabase
- Supabase — visão geral de testes, pgTAP, testes de aplicação e CI: https://supabase.com/docs/guides/local-development/testing/overview
- Supabase — testes de políticas RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — gestão de ambientes e CI/CD: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase — migrations locais e fluxo de deploy: https://supabase.com/docs/guides/local-development/database-migrations

### 8.8 Limite desta revisão

A revisão confirma riscos pela leitura estática dos arquivos disponíveis. Ela não comprova comportamento do PowerSync Cloud, configuração de Sync Streams implantada, estado atual do banco remoto, nem execução das migrations. Essas evidências exigem testes no ambiente correspondente.


## 9. Pesquisa de frontend e motor pedagógico

A auditoria do frontend e a pesquisa sobre ferramentas de construção e avaliação do conhecimento foram registradas em [PESQUISA-FRONTEND-E-MOTOR-PEDAGOGICO.md](./PESQUISA-FRONTEND-E-MOTOR-PEDAGOGICO.md). O documento especifica formatos de atividade, evidências de aprendizagem, acessibilidade, desempenho, modelo de tentativas e critérios de qualidade. É uma especificação, não uma declaração de que esses recursos já estejam implementados. A implementação pedagógica permanece condicionada à estabilização da identidade, persistência e sincronização.


## 10. Execução parcial da Fase 0B — 17/11/2026

A primeira implementação de integridade incremental foi publicada e detalhada em [EXECUCAO-FASE-0.md](./EXECUCAO-FASE-0.md), seção 10.

Entregas verificáveis no código:
- bootstrap aditivo sem exclusão por ausência em snapshot;
- plano de mutações baseado na diferença entre snapshot-base e snapshot novo;
- exclusões explícitas por ID e proprietário;
- leitura e escrita no mesmo contexto transacional PowerSync;
- detecção otimista de edição/exclusão concorrente;
- revisão monotônica dos eventos e descarte de eventos obsoletos;
- proteção para não aplicar leitura remota sobre edição local ocorrida durante a leitura;
- testes unitários e validação CI desses contratos.

**Não concluído:** a UI ainda usa localStorage operacional e a ponte ainda recebe snapshots completos; faltam repositórios por entidade, teste com SQLite/PowerSync real, teste de duas contas no navegador, Supabase local e sincronização Cloud. Esta entrega não conclui a Fase 0B nem altera o banco remoto.

## 11. Guia operacional detalhado do backend

As configurações manuais do Supabase, PowerSync Cloud, Sync Streams, GitHub Actions Variables, reconciliação de migrations e testes de integração estão organizadas em [GUIA-PROXIMAS-ETAPAS-BACKEND.md](./GUIA-PROXIMAS-ETAPAS-BACKEND.md). O guia distingue tarefas manuais, código já implementado e validações ainda pendentes; não autoriza alterações remotas sem backup e revisão.
