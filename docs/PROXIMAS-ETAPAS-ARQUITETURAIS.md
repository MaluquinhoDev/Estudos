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
