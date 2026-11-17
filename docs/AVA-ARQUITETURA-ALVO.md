# Arquitetura-alvo do Ambiente Virtual de Aprendizagem

**Status:** arquitetura aprovada para implementação incremental  
**Estratégia:** preservar a interface PWA leve e evoluir infraestrutura, dados e motor pedagógico em etapas.

## 1. Objetivo

Evoluir o AVA de uma aplicação PWA local para uma plataforma pessoal de aprendizagem persistente, sincronizada, modular, extensível e com implantação automatizada.

A arquitetura não pressupõe reescrever a interface de uma só vez. Cada etapa deve preservar os dados existentes e manter a aplicação utilizável.

## 2. Visão de arquitetura

```text
PWA / Interface
  |-- Painel, cursos, módulos, lições, atividades, biblioteca
  |
Camada de aplicação
  |-- Serviços de domínio
  |-- Permissões
  |-- Eventos
  |-- Registro de módulos/plugins
  |
Persistência local                 Persistência remota
  |-- IndexedDB                       |-- Supabase Auth
  |-- Cache PWA                       |-- PostgreSQL
  |-- Fila offline                    |-- Storage
  |-- Outbox de operações             |-- Edge Functions
  |                                   |-- Row Level Security
  +---------- Sincronização ----------+
  |
Motor pedagógico
  |-- Recuperação ativa
  |-- Repetição espaçada
  |-- Diagnóstico de lacunas
  |-- Competências e domínio
  |-- Feedback e adaptação
  |
Automação
  |-- GitHub Actions
  |-- CI e testes
  |-- Migrações versionadas
  |-- Deploy
  |-- Backup e monitoramento
```

## 3. Tecnologias e responsabilidades

| Tecnologia | Responsabilidade |
|---|---|
| PWA + JavaScript modular | Interface leve e instalação |
| SQLite local via PowerSync Web SDK | Persistência local estruturada e consultas reativas offline |
| Service Worker | Cache e shell offline |
| Supabase Auth | Identidade e sessões |
| Supabase PostgreSQL | Fonte remota persistente e fonte de verdade |
| Supabase Storage | Anexos e arquivos |
| Supabase Edge Functions | Operações que exigem execução no servidor |
| Supabase GitHub Integration | Implantação de migrations e recursos Supabase declarados |\n| GitHub Actions | CI, validação estática e testes automatizados |\n| PowerSync | Sincronização local-first entre SQLite e PostgreSQL |
| JSON versionado | Importação, exportação e recuperação |

A chave publishable do Supabase pode ser usada no cliente, desde que as tabelas tenham RLS e políticas corretas. Chaves secretas nunca devem ser incluídas no frontend, no repositório ou em artefatos públicos.

## 4. Modelo de dados de destino

Entidades previstas:

- `profiles`: perfil e preferências.
- `courses`: cursos.
- `modules`: módulos vinculados a cursos.
- `lessons`: lições e conteúdos.
- `learning_objectives`: objetivos de aprendizagem.
- `competencies`: competências.
- `resources`: materiais e referências.
- `activities`: atividades e avaliações.
- `questions`: questões.
- `attempts`: tentativas.
- `answers`: respostas.
- `learning_events`: eventos imutáveis de aprendizagem.
- `mastery_records`: evidências e estado de domínio.
- `review_cards`: cartões de recuperação ativa.
- `review_schedules`: agenda de revisão.
- `sync_operations`: operações locais pendentes de sincronização.

Todo dado privado deve estar associado ao usuário proprietário. As políticas RLS devem restringir leitura, criação, alteração e exclusão ao proprietário autorizado. Tabelas expostas pela API não devem depender apenas de ocultação na interface.

## 5. Estratégia offline-first

1. A interface grava alterações locais no IndexedDB.
2. Cada alteração gera uma operação identificável na fila de sincronização (outbox).
3. A sincronização envia operações pendentes quando há conectividade.
4. O servidor valida identidade, propriedade, integridade e versão.
5. A operação recebe confirmação e é marcada como sincronizada.
6. Conflitos são resolvidos por regras específicas do domínio.

Regras:
- Eventos de aprendizagem, tentativas e respostas devem manter histórico; não podem ser apagados por uma atualização concorrente mais recente.
- Anotações editáveis podem usar controle de versão e detecção de conflito.
- Operações devem ser idempotentes para evitar duplicação após reenvio.
- A aplicação deve continuar utilizável offline.
- Background Sync é melhoria progressiva; sincronização ao abrir/retomar o app é o caminho compatível de reserva.

## 6. Motor pedagógico

Módulos independentes:
- Recuperação ativa.
- Repetição espaçada.
- Prática intercalada.
- Avaliação diagnóstica.
- Análise de erros.
- Domínio por competência.
- Feedback contextual.
- Priorização de lacunas.

Estados pedagógicos não devem ser confundidos com evidências. Um estado como "dominado" precisa derivar de critérios observáveis, como desempenho em diferentes tentativas, retenção ao longo do tempo e aplicação em problemas variados.

## 7. Arquitetura modular e extensões

Cada módulo deve declarar:
- identificador e versão;
- dependências;
- permissões;
- configurações;
- eventos emitidos e consumidos;
- migrações de dados;
- testes.

O núcleo fornece autenticação, persistência, navegação, eventos e permissões. Módulos de cursos, lições, avaliações, cartões, biblioteca e análise usam contratos estáveis. Extensões futuras não devem acessar diretamente o estado interno de outros módulos.

## 8. Automação e publicação

Pipeline pretendido:

1. CI: sintaxe, lint, testes unitários e integração.
2. Validação de banco: formato e ordenação das migrações.
3. Testes: validar migrações em banco temporário/local.
4. Deploy: aplicar migrações versionadas no projeto remoto.
5. Deploy da interface: publicar o PWA.
6. Verificação: smoke tests, logs e disponibilidade.
7. Recuperação: backup verificado e plano de restauração.

Mudanças destrutivas de banco exigem migração compatível em etapas (expand/contract), backup e validação. Não automatizar exclusões ou alterações irreversíveis sem proteção.

## 9. Estratégia de backup e portabilidade

- Exportação JSON com versão do formato.
- Validação integral antes de importar.
- Identificadores estáveis e preservação de relações.
- Detecção de duplicatas.
- Registro de data e versão de origem.
- Backup periódico do banco e dos arquivos.
- Testes de restauração, não apenas de criação de backup.

## 10. Interoperabilidade

Planejar compatibilidade futura com:
- xAPI para registro interoperável de experiências de aprendizagem.
- LTI para integração com ferramentas educacionais externas.
- H5P para conteúdo interativo.

Essas integrações só devem ser implementadas quando houver necessidade concreta; não são pré-requisitos para a primeira versão remota.

## 11. Fases de implementação

Confiabilidade, testes e recuperação são requisitos transversais: começam na fundação e evoluem junto com cada etapa, não ficam concentrados no encerramento.

| Fase | Entrega |
|---|---|
| 0 | Diagnóstico, inventário de dados, backup verificável, contratos e testes básicos |
| 1 | Modularizar a aplicação sem alterar comportamento, com testes de regressão |
| 2 | Adotar IndexedDB, versionamento, migração localStorage e recuperação local |
| 3 | Criar projeto Supabase, autenticação, esquema, RLS e testes de isolamento entre usuários |
| 4 | Implementar sincronização offline/online, outbox, idempotência e resolução de conflitos |
| 5 | Implementar tentativas, avaliações, respostas e eventos de aprendizagem |
| 6 | Implementar diagnóstico, domínio por competência e adaptação baseada em evidências |
| 7 | Adicionar extensões e interoperabilidade (xAPI, LTI e H5P) |
| 8 | Consolidar CI/CD, monitoramento, backup periódico e testes de restauração |

## 12. Critérios de aceite

- Nenhum dado existente é descartado durante migrações.
- Aplicação abre e permite estudar sem conexão.
- Sincronização não duplica operações.
- RLS impede acesso cruzado entre usuários.
- Migrações são versionadas e reproduzíveis.
- CI falha diante de regressões e valida migrações em ambiente isolado antes do deploy remoto.
- RLS é testada com pelo menos dois usuários distintos, incluindo tentativas de leitura e escrita cruzadas.
- Deploy não executa sem credenciais necessárias e mudanças destrutivas exigem proteção de ambiente/revisão.
- Backup pode ser restaurado em ambiente separado e a restauração é testada periodicamente.
- A interface continua leve em hardware modesto.

## 13. Limites e decisões de segurança

- GitHub Pages hospeda a interface, não executa backend privado.
- Segredos não podem ser enviados ao navegador.
- RLS é requisito, não melhoria opcional.
- O projeto Supabase e a autorização da integração GitHub precisam ser configurados pelo proprietário.\n- PowerSync é uma camada adicional; seu serviço, endpoint, credenciais públicas de conexão e API de upload precisam ser configurados antes de habilitar sincronização no cliente.\n- A ativação do deploy de produção deve aguardar a reconciliação do histórico remoto de migrations e a verificação do esquema existente.
- Ambientes preview Supabase por branching podem exigir plano pago; implantação pela branch principal e CLI está disponível em todos os planos conforme documentação vigente.
- A arquitetura não implica que funcionalidades futuras já estejam implementadas.
