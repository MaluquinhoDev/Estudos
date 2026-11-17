# AVA — plano de execução da Fase 0

**Estado:** Fase 0A parcialmente implementada; primeira entrega técnica da Fase 0B publicada, ainda sem conclusão integral ou validação real em PowerSync Cloud.  
**Base:** auditoria estática de app.js, src/powersync-ui.js, src/powersync/snapshot.js, src/powersync/connector.js e testes atuais.  
**Ordem:** 0A (identidade e privacidade) antes de 0B (integridade de sincronização).

## Objetivo

Eliminar dois riscos antes de migrar a interface para SQLite/PowerSync:

1. dados de uma conta serem carregados ou exibidos durante outra sessão;
2. snapshots antigos/incompletos provocarem exclusões ou sobrescritas indevidas.

Não alterar o desenho visual, não adicionar tabelas pedagógicas e não trocar o PowerSync por uma implementação própria nesta fase.

## Diagnóstico de origem

| Arquivo | Comportamento observado | Risco |
|---|---|---|
| app.js | load() lê imediatamente a chave global estudos-ava-v2 | dados carregados antes da identidade estar validada |
| src/powersync-ui.js | startSync() valida estudos-ava-owner depois da inicialização e do primeiro sync | validação tardia para proteger a renderização inicial |
| src/powersync-ui.js | logout interrompe sync e troca painel, mas não limpa explicitamente o estado em memória do app | dados da sessão anterior podem permanecer visíveis |
| src/powersync-ui.js | callbacks assíncronos e eventos de autenticação compartilham variáveis globais | callbacks antigos podem competir com uma nova sessão |
| src/powersync-ui.js | syncQueue serializa snapshots completos | ordem de execução não garante que o snapshot seja o mais recente |
| src/powersync/snapshot.js | writeSnapshotToPowerSync() apaga registros ausentes no snapshot | ausência pode ser interpretada como exclusão |
| src/powersync/snapshot.js | consulta registros existentes antes de abrir writeTransaction() | comparação pode ficar obsoleta antes da escrita |
| testes | cobrem conversão, merge e chamadas simuladas do conector | não provam isolamento, corrida, transação real ou RLS |

## Fase 0A — identidade e privacidade

### 0A.1 Bootstrap seguro

- Separar a criação da interface da leitura dos dados privados.
- A interface começa em estado neutro/carregando, sem renderizar dados locais ainda não associados à identidade.
- Resolver a sessão Supabase antes de escolher o namespace de dados.
- Para uso sem login, definir explicitamente um namespace de visitante; ele não pode ser confundido com o namespace de uma conta.
- Não permitir que o primeiro usuário autenticado reivindique silenciosamente dados legados sem proprietário.

**Aceite:** com duas contas no mesmo navegador, nenhum frame da interface mostra dados da conta anterior durante a troca ou carregamento.

### 0A.2 Armazenamento particionado

- Substituir a chave global por namespace versionado que inclua o ID autenticado, por exemplo estudos-ava-v3:<user-id>.
- Não usar e-mail como identificador de partição.
- Manter dados locais de cada usuário separados, sem apagá-los no logout.
- Criar migração explícita do formato legado: backup antes da migração, validação de estrutura, decisão explícita sobre proprietário e registro de conclusão.
- Dados legados ambíguos permanecem isolados até uma decisão explícita; não copiar para a conta recém-autenticada.

**Aceite:** dados A continuam disponíveis apenas no namespace A; B inicia com o namespace B; recarregar a página preserva a separação.

### 0A.3 Ciclo de vida da sessão

- Criar um identificador monotônico de geração de sessão.
- Incrementar a geração em login, logout, troca de usuário e sessão invalidada.
- Cada operação assíncrona captura a geração e verifica se continua atual antes de alterar estado, renderizar ou gravar.
- Ao sair: parar listeners, desconectar a instância ativa, invalidar callbacks, substituir o estado da interface por estado vazio/neutro e só então concluir a atualização visual.
- Ao trocar A por B: invalidar A antes de iniciar qualquer leitura/renderização de B.
- Tratar falha no getSession, waitForFirstSync e connect sem deixar dados de outra identidade visíveis.

**Aceite:** testes determinísticos A→logout→B, A→B sem recarregar, expiração de sessão e falha de rede não exibem nem gravam dados cruzados.

## Fase 0B — integridade da persistência e sincronização

### 0B.1 Remover exclusão por ausência

- Retirar a regra que deleta registros locais simplesmente porque não aparecem no snapshot recebido.
- Implementar exclusão explícita por ID e entidade, preservando a CRUD queue nativa do PowerSync.
- Garantir que exclusão local intencional seja enviada e que exclusão remota seja refletida sem gerar uma nova mutação de usuário.
- Não adicionar uma segunda fila customizada.

**Aceite:** snapshot parcial/incompleto não apaga registros; exclusão intencional remove exatamente o registro indicado e sincroniza uma vez.

### 0B.2 Eliminar snapshots obsoletos como fonte de escrita

- Parar de tratar o snapshot integral do app como unidade de mutação.
- Introduzir operações de repositório por entidade: criar, atualizar e excluir.
- Até a migração completa, snapshots de compatibilidade precisam carregar versão/geração e não podem substituir estado mais novo.
- A fila de compatibilidade deve descartar evento antigo antes da escrita, não apenas executar eventos em sequência.
- A reconciliação inicial deve separar importação legada, leitura remota e mutações novas.

**Aceite:** uma gravação antiga atrasada não reverte edição recente; atualizar um curso não altera módulos, cartões ou recursos não relacionados.

### 0B.3 Coerência transacional

- Consultar e alterar os registros relevantes dentro da mesma transação local.
- Evitar leitura global de todas as tabelas para cada salvamento.
- Não reemitir alterações recebidas do PowerSync como se fossem alterações locais do usuário.
- Preservar relações e ordem de gravação/exclusão entre cursos, módulos, aulas, cartões e recursos.

**Aceite:** testes exercitam rollback, falha no meio da operação e atualização remota concorrente sem estado parcial.

## Plano de testes obrigatório

### Testes de identidade

1. Sem sessão, carregar somente dados do visitante.
2. Login A, criar dados A, logout e verificar que a interface não exibe A.
3. Login B no mesmo navegador e confirmar que B não lê A.
4. Recarregar com B e confirmar isolamento persistente.
5. Voltar a A e confirmar que seus dados locais continuam no namespace A.
6. Simular callback de A concluindo depois que B já entrou; callback deve ser ignorado.
7. Simular sessão expirada e falha de rede durante o primeiro sync.

### Testes de sincronização

1. Snapshot incompleto não executa exclusões.
2. Exclusão explícita gera somente o DELETE pretendido.
3. Evento antigo não substitui estado mais recente.
4. Duas alterações em registros diferentes não se sobrescrevem.
5. Falha de rede mantém a mutação local e a fila pendente.
6. Reenvio da mesma operação é idempotente.
7. Alteração remota atualiza a UI sem criar loop de upload.

### Níveis de teste

- Unitário: lógica de identidade, namespace, versões e decisões de merge.
- Integração: SQLite/PowerSync real e CRUD queue.
- Banco: PostgreSQL/Supabase local com duas identidades e pgTAP para RLS.
- Navegador: troca de conta, reload, offline/online e visibilidade da UI.

Mocks continuam úteis, mas não substituem os níveis de integração e banco.

## Sequência de implementação em commits pequenos

1. Testes que reproduzem vazamento visual A→B e callbacks antigos.
2. Bootstrap neutro e contexto de identidade explícito.
3. Namespace local por identidade e migração legada protegida.
4. Logout/troca de sessão com invalidação de geração.
5. Testes de navegador da fronteira de privacidade.
6. Testes que reproduzem exclusão por snapshot incompleto e evento obsoleto.
7. Remoção de exclusão implícita e introdução de mutações explícitas.
8. Repositórios incrementais e testes de concorrência.
9. Integração real com SQLite/PowerSync.
10. Só após todos os aceites, iniciar a extração ampla dos serviços e repositórios da Etapa 1.

## Restrições de segurança

- Nunca enviar service_role, senha do banco ou token administrativo ao bundle PWA.
- Não associar automaticamente dados legados a um usuário autenticado.
- Não apagar bancos locais no logout.
- Não executar migrations ou resets destrutivos no projeto Supabase de produção como parte dos testes.
- Não declarar a sincronização validada com base apenas em mocks ou CI de sintaxe.

## Referências técnicas

- PowerSync Supabase: SQLite local, CRUD queue e Sync Streams — https://docs.powersync.com/integration-guides/supabase
- Supabase Testing Overview: pgTAP, testes de aplicação e CI — https://supabase.com/docs/guides/local-development/testing/overview
- Supabase RLS — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Managing Environments — https://supabase.com/docs/guides/deployment/managing-environments

**Definição de concluído:** todos os testes de identidade e sincronização acima passam nos níveis adequados; nenhuma conclusão depende apenas de inspeção estática.


---

## 9. Registro de execução — primeira entrega da Fase 0A

**Implementação publicada:** 17/11/2026.  
**Escopo concluído nesta entrega:** isolamento do workspace local durante o bootstrap e a troca de identidade.  
**Escopo ainda aberto:** validação ponta a ponta em navegador com duas contas reais e sincronização PowerSync Cloud.

### Alterações implementadas

- A interface inicia oculta até o app registrar sua ponte de estado e a resolução de identidade terminar. A ordem entre o script clássico e o módulo PowerSync não é presumida: o módulo aguarda explicitamente o evento de prontidão do app.
- O estado de cada usuário é preservado em uma chave local separada, baseada no ID autenticado; e-mail não é usado como identificador.
- Dados locais sem proprietário são preservados como workspace de visitante e não são associados automaticamente à primeira conta autenticada.
- Ao trocar de conta ou sair, o snapshot da identidade ativa é preservado antes de limpar o workspace ativo, inclusive a chave global legada.
- Ao entrar, o app recupera o snapshot do namespace daquela conta; o workspace de visitante não é mesclado automaticamente.
- A inicialização e os callbacks PowerSync recebem uma geração de sessão. Respostas de sessões anteriores não podem atualizar a interface após a troca de identidade.
- A supressão de eventos locais durante atualizações remotas é vinculada ao ID da conta, evitando que o callback antigo de uma conta desative a proteção da nova sessão.
- A saída da conta oculta e limpa a interface antes de aguardar a conclusão do logout remoto.
- A CI valida a presença dos mecanismos de isolamento e executa testes unitários dedicados.

### Arquivos alterados ou adicionados

- `index.html`: bloqueio visual até a resolução de identidade.
- `styles.css`: regra de ocultação durante o bootstrap.
- `app.js`: ponte para limpar o workspace ativo sem emitir uma gravação de usuário; sinal de prontidão do app.
- `src/powersync-ui.js`: bootstrap de identidade, troca de conta, isolamento por sessão e proteção de callbacks.
- `src/powersync/identity.js`: funções puras para namespace, preservação e recuperação de snapshots.
- `tests/powersync-identity.test.js`: testes de separação de contas, dados sem proprietário, snapshots inválidos e preservação de backup.
- `.github/workflows/ci.yml`: validação estrutural da fronteira de identidade.

### Limites e riscos ainda não encerrados

1. O estado operacional da interface ainda é mantido em memória e no armazenamento global legado durante a sessão ativa; o namespace por usuário funciona como cópia isolada de recuperação. A migração para repositórios SQLite ainda não foi feita.
2. O bootstrap autenticado ainda aguarda o primeiro sync antes de restaurar a interface. O uso offline independente do primeiro sync não está concluído.
3. Não há teste de navegador automatizado que alterne duas contas Supabase reais no mesmo perfil e observe a tela em cada frame.
4. Os testes adicionados validam as funções de armazenamento e a CI valida a estrutura do bootstrap; eles não simulam o ciclo completo do Supabase Auth nem o PowerSync Cloud.
5. A migração explícita de dados legados para uma conta ainda não foi construída. Dados sem proprietário permanecem no espaço de visitante.
6. A Fase 0B recebeu uma primeira implementação parcial; os limites e itens ainda pendentes estão registrados na seção 10.

**Status honesto:** primeira parte da Fase 0A implementada; Fase 0A ainda não pode ser considerada integralmente concluída. Nenhuma migration foi aplicada ao projeto Supabase remoto nesta entrega.


---

## 10. Registro de execução — primeira entrega da Fase 0B

**Implementação publicada:** 17/11/2026.  
**Escopo:** substituir a escrita destrutiva por snapshots por um cálculo incremental de mutações, com exclusões explícitas, verificação otimista de concorrência e transação local única.

### Problemas corrigidos nesta entrega

1. A escrita de bootstrap/importação deixou de excluir linhas ausentes do snapshot. Um snapshot vazio ou parcial não apaga registros locais.
2. Exclusões são calculadas apenas quando um registro existia na base conhecida e foi removido na nova versão.
3. A leitura das linhas atuais passou para dentro de `writeTransaction()`, usando o contexto transacional do PowerSync.
4. Atualizações locais são comparadas com a base anterior e com o conteúdo atual do SQLite. Uma edição remota concorrente gera conflito em vez de ser sobrescrita silenciosamente.
5. Exclusões verificam se o conteúdo armazenado ainda corresponde à base anterior; alteração remota concorrente bloqueia a exclusão.
6. Os DELETEs usam simultaneamente ID e user_id, e são executados em ordem inversa de dependência.
7. Eventos locais passaram a carregar revisão monotônica. Eventos já obsoletos antes da execução são descartados; a revisão é verificada também durante a transação.
8. Atualizações remotas não substituem a interface quando uma edição local ocorreu durante a leitura do snapshot remoto.

### Arquivos alterados

- `src/powersync/snapshot.js`: `planSnapshotChanges`, `applySnapshotChanges`, leitura transacional, escrita incremental e exclusões explícitas.
- `src/powersync-ui.js`: base aplicada, controle de revisão, fila com descarte de eventos obsoletos e proteção da edição local durante atualização remota.
- `app.js`: eventos `estudos:data-saved` agora carregam `snapshot` e `revision`.
- `tests/powersync-snapshot.test.js`: testes para snapshots parciais, exclusão explícita, conflito concorrente, transação e evento obsoleto.
- `.github/workflows/ci.yml`: validações estruturais e execução dos testes de sincronização.

### Limites ainda abertos

1. A interface continua usando `localStorage` como estado operacional; SQLite/PowerSync ainda não é a fonte primária de leitura da UI.
2. A ponte de compatibilidade ainda recebe snapshots completos do app e calcula deltas. A extração dos casos de uso e repositórios por entidade ainda não foi concluída.
3. Os testes atuais são unitários com um contexto transacional simulado. Não comprovam concorrência real no SQLite WASM/PowerSync, CRUD queue real ou sincronização PowerSync Cloud.
4. A política de conflito nesta entrega é conservadora: detecta e bloqueia conflito; ainda não oferece resolução por campo nem interface para o usuário escolher versões.
5. A exclusão remota é refletida pela leitura do banco; não há um protocolo de tombstones próprio, nem histórico auditável de exclusões.
6. Ainda faltam testes de integração com PostgreSQL/Supabase local, duas identidades, navegador, offline/online e restauração.
7. Nenhuma migration foi aplicada ao Supabase remoto.

**Status honesto:** primeira parte da Fase 0B implementada e coberta por testes unitários. Não declarar a Fase 0B concluída, nem a sincronização ponta a ponta validada.
