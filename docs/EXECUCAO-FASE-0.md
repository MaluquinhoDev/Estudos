# AVA — plano de execução da Fase 0

**Estado:** plano técnico; nenhuma alteração funcional da Fase 0 está declarada como concluída.  
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
