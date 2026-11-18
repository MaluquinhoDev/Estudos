# Pesquisa e especificação — frontend e ferramentas pedagógicas do Estudos

**Data:** 17/11/2026  
**Escopo:** referências, auditoria do frontend e especificação evolutiva para construção e avaliação do conhecimento.  
**Natureza:** documento de pesquisa e arquitetura. Os novos tipos de atividade aqui descritos ainda não estão implementados na interface.

## 1. Síntese executiva

O Estudos já possui uma base visual própria em HTML, CSS e JavaScript nativos, com cursos, módulos, conteúdos, cartões de revisão, biblioteca, progresso e PWA. A interface é relativamente leve e responsiva, mas o motor pedagógico ainda é estreito: o registro de aprendizagem depende principalmente de estados manuais e cartões pergunta/resposta.

A evolução mais importante não é adicionar efeitos visuais ou jogos decorativos. É ligar cada objetivo de aprendizagem a uma atividade adequada, registrar tentativas e feedback e distinguir progresso declarado de evidência observável de domínio.

**Direção recomendada**
- Preservar a implementação nativa e o orçamento de desempenho.
- Criar uma camada de atividades com formatos variados.
- Registrar tentativas e respostas como histórico, sem sobrescrever evidências anteriores.
- Usar feedback explicativo e revisão espaçada.
- Apresentar indicadores com origem e limites explícitos.
- Adotar H5P como referência de formatos e possível interoperabilidade futura, não como dependência obrigatória do núcleo.

## 2. Auditoria do frontend atual

### Pontos fortes
- HTML, CSS e JavaScript nativos: não há necessidade demonstrada de migrar para React ou outro framework.
- Navegação por áreas compreensíveis: visão geral, cursos, revisões, biblioteca e progresso.
- Componentes visuais reutilizáveis por classes, como panel, course-card, module, lesson e review-card.
- Layout adaptável para desktop e telas menores.
- Formulários com validação de campos obrigatórios.
- Estados de foco, regiões aria-live e suporte a prefers-reduced-motion.
- Feedback breve por toast.
- Cartões já implementam recuperação ativa e agendamento simples de revisão.

### Limitações pedagógicas e de produto
1. Conteúdo não equivale a objetivo. A descrição da aula não é ainda uma entidade formal para resultados verificáveis.
2. Estado manual não prova domínio. learned e mastered são declarações do estudante, não resultados derivados de tentativas.
3. Pouca variedade de evidências. Cartões cobrem perguntas curtas, mas não explicações, aplicação, comparação, ordenação, diagnóstico de erro ou resolução de problemas.
4. Sem histórico formal de tentativas. O modelo não preserva uma trilha estruturada de resposta, pontuação, feedback, tempo e versão da atividade.
5. Progresso agregado é simplificado. Percentual de conteúdos marcados como aprendidos não mede retenção, transferência ou qualidade da compreensão.
6. Criação e prática ainda não formam um ciclo ligado por identificadores explícitos entre objetivo, atividade, tentativa e evidência.

## 3. Princípios de frontend criativo e eficiente

### Criatividade funcional
A criatividade deve tornar a estrutura do conhecimento visível:
- Trilhas e mapas de módulos para mostrar sequência e dependências.
- Cartões de conceito com relações, exemplos e contraexemplos.
- Visualizações de progresso por objetivo, não apenas por quantidade de aulas.
- Cenários com decisões e consequências.
- Feedback visual que explique o que foi acertado, o que faltou e por quê.

Evitar pontos, medalhas e animações sem relação com aprendizagem. Recompensas só fazem sentido quando representam esforço, consistência ou domínio demonstrado por critérios transparentes.

### Hierarquia e navegação
- Uma ação principal por contexto: estudar, praticar, criar ou revisar.
- Separar claramente conteúdo, atividade e avaliação.
- Mostrar primeiro o resumo útil; deixar configurações e detalhes avançados em painéis secundários.
- Manter navegação e terminologia estáveis.
- Estados vazios devem explicar o contexto e apresentar ação contextual, sem painéis redundantes.
- Em telas pequenas, priorizar uma coluna e controles com áreas de toque confortáveis.

### Acessibilidade
- HTML semântico e rótulos associados aos controles.
- Operação completa por teclado e foco visível.
- Não depender apenas de cor para comunicar acerto, erro ou estado.
- Feedback anunciado por tecnologia assistiva sem roubar foco.
- Contraste adequado, zoom e reflow.
- Respeitar prefers-reduced-motion.
- Oferecer alternativa textual a diagramas, áudio, imagens e interações de arrastar.

### Desempenho e manutenção
Considerando a PWA e hardware modesto como referência:
- Preservar JavaScript nativo e CSS; não adicionar framework ou biblioteca de gráficos sem necessidade mensurável.
- Carregar editores e atividades complexas somente ao abrir a funcionalidade.
- Evitar imagens grandes, fontes externas obrigatórias e animações contínuas.
- Paginar ou filtrar listas extensas.
- Manter renderização localizada para não reconstruir a aplicação inteira a cada resposta.
- Medir tamanho do bundle, tempo de carregamento e responsividade em dispositivo real.
- Manter atividades locais funcionais offline.

## 4. Ferramentas para construir conhecimento

A ferramenta deve ser escolhida pelo tipo de pensamento que pretende provocar.

| Ferramenta | Construção do conhecimento | Produto registrado |
|---|---|---|
| Editor de objetivo | Define ação observável: explicar, comparar, implementar, justificar | Objetivo e critério de sucesso |
| Notas guiadas | Organiza explicação, exemplos, dúvidas e síntese | Nota estruturada |
| Exemplo resolvido | Expõe etapas e decisões de uma solução | Sequência comentada |
| Editor de flashcards | Converte conceitos em perguntas recuperáveis | Cartões e respostas |
| Mapa conceitual | Explicita relações, hierarquias e dependências | Nós, arestas e rótulos |
| Comparador de conceitos | Contrasta semelhanças, diferenças e limites | Matriz comparativa |
| Laboratório de problemas | Propõe problema, tentativa, hipótese e depuração | Solução e justificativa |
| Cenário ramificado | Apresenta decisão, consequência e reflexão | Caminho escolhido e justificativa |
| Linha do tempo/ordenação | Organiza processos, eventos e algoritmos | Sequência e explicação |
| Glossário contextual | Liga termos a definições, exemplos e conteúdos | Termos e relações |

O editor não deve obrigar o estudante a preencher todos os formatos. Cada formato é apropriado a objetivos diferentes.

## 5. Ferramentas para avaliar conhecimento

A avaliação deve combinar formatos, pois cada um observa uma dimensão diferente.

| Formato | Evidência principal | Limite |
|---|---|---|
| Múltipla escolha | Reconhecimento e discriminação | Acerto pode ocorrer por eliminação ou chute |
| Verdadeiro/falso com justificativa | Identificação e argumentação | Sem justificativa mede pouco além do reconhecimento |
| Resposta curta | Recordação e precisão conceitual | Correção automática exige critérios claros |
| Resposta aberta | Explicação e elaboração | Geralmente requer rubrica ou revisão humana |
| Preenchimento de lacunas | Recuperação de termos e relações | Pode supervalorizar vocabulário literal |
| Associação | Relação entre pares | Pode ser resolvida por pistas |
| Ordenação | Sequência e dependência | Nem todo processo possui ordem única |
| Arrastar e soltar | Classificação espacial ou associação | Deve ter alternativa acessível por teclado |
| Depuração de código | Diagnóstico, aplicação e raciocínio | Requer testes e critérios por caso |
| Problema prático | Transferência e aplicação | Avaliação é mais cara e contextual |
| Mapa conceitual | Organização e relações | Rubrica precisa avaliar relações, não só nós |
| Autoavaliação de confiança | Metacognição | Não substitui evidência de desempenho |

### Feedback recomendado
O retorno não deve se limitar a certo ou errado. Deve indicar resultado, critério avaliado, explicação da resposta, natureza do erro, referência ao conteúdo relacionado e possibilidade de nova tentativa quando apropriado.

A confiança declarada pode ser registrada separadamente do resultado para identificar acertos por chute e excesso de confiança. Não deve alterar automaticamente a nota.

## 6. Referências de ferramentas existentes

### H5P
Referência de formatos interativos: flashcards, question sets, preenchimento de lacunas, associação, arrastar e soltar, vídeos interativos, apresentações e cenários ramificados. A documentação apresenta integração com Moodle, Canvas e outros LMS, além de opções de incorporação e LTI.

**Análise:** é uma boa referência para diversidade e interoperabilidade. Não é necessário incorporar H5P imediatamente: hospedagem, versão do conteúdo, acessibilidade, persistência de tentativas, integração e custo operacional precisam ser avaliados. Conteúdo incorporado não deve ser tratado automaticamente como evidência confiável sem contrato de dados.

### Moodle e Canvas
São referências de organização de cursos, atividades, notas e integração institucional. O valor para o Estudos está nos padrões de organização e interoperabilidade, não em copiar toda a complexidade de um LMS institucional.

### Ferramentas nativas do Estudos
O núcleo pode começar com atividades próprias: flashcards, quiz de escolha única/múltipla, verdadeiro/falso com justificativa, resposta curta, ordenação e associação, resposta aberta com rubrica e exercício de programação com casos de teste. Mapas conceituais podem entrar em etapa posterior.

A implementação nativa mantém controle sobre dados, offline, acessibilidade e desempenho. Formatos complexos podem ser integrados depois por padrão interoperável, sem acoplar o domínio pedagógico ao fornecedor.

## 7. Fundamento de aprendizagem e limites da evidência

A literatura consultada sustenta especialmente:
- Prática de recuperação: produzir a resposta da memória, em vez de apenas reler.
- Prática distribuída: distribuir sessões no tempo.
- Intercalação: alternar problemas relacionados quando isso exige discriminar estratégias.
- Feedback: corrigir e explicar depois da tentativa.
- Metacognição: comparar confiança percebida com desempenho observado.

Uma meta-análise publicada em 29/10/2026, com 53 estudos e 7.303 participantes em contextos escolares, encontrou efeitos médios positivos para prática de recuperação (g=0,37), prática distribuída (g=0,20) e intercalação (g=0,40), mas também identificou moderadores e heterogeneidade. Isso não significa que qualquer quiz, agenda ou mistura de questões produzirá automaticamente os mesmos resultados. Formato da prática, tipo de conhecimento, feedback e correspondência com a avaliação importam.

A revisão da Nature Reviews Psychology sobre espaçamento e recuperação destaca a utilidade dessas estratégias e o papel da metacognição. A revisão sistemática de pesquisa aplicada em escolas também aponta benefícios frequentes, mas registra limites de generalização geográfica.

**Consequência de projeto:** medir o que foi realmente tentado e aprendido; não converter frequência de uso, quantidade de cliques ou autodeclaração em domínio cognitivo.

## 8. Modelo de domínio proposto

Entidades pedagógicas futuras, separadas do conteúdo estático:
- learning_objectives: objetivo, descrição, nível e critérios de sucesso;
- activities: formato, instruções, conteúdo versionado, objetivo relacionado e configuração;
- activity_items: questões, etapas, alternativas e rubricas;
- attempts: estudante, atividade, início, conclusão, estado e versão da atividade;
- answers: resposta, correção, feedback, confiança e dados específicos do item;
- competencies: competência e critérios observáveis;
- learning_events: eventos relevantes de estudo, tentativa e revisão;
- mastery_records: síntese calculada com referência às evidências que a sustentam.

Regras:
- Tentativa concluída não é apagada por uma tentativa nova.
- Atividade versionada preserva a versão usada em cada tentativa.
- Correção automática e avaliação humana são identificadas separadamente.
- Pontuação não equivale automaticamente a domínio.
- Estado manual do conteúdo permanece distinto de evidência de competência.
- Exclusões, sincronização e RLS seguem o isolamento por usuário já estabelecido na arquitetura.

## 9. Ordem de implementação sugerida pela dependência técnica

Esta ordem é uma especificação de trabalho, não uma declaração de entrega:
1. Estabilizar identidade, persistência local e sincronização.
2. Formalizar objetivos de aprendizagem ligados a curso, módulo e conteúdo.
3. Criar atividades nativas e versionadas.
4. Registrar tentativas e respostas sem sobrescrever histórico.
5. Adicionar feedback explicativo e rubricas.
6. Construir relatórios por objetivo com evidências rastreáveis.
7. Adicionar agenda de revisão espaçada e intercalação contextual.
8. Avaliar integração H5P/LTI/xAPI após o núcleo de tentativas estar estável.

Não antecipar o motor pedagógico completo antes da integridade de identidade e sincronização. A Fase 0B e a migração para repositórios SQLite continuam sendo dependências importantes.

## 10. Critérios de qualidade do AVA

### Qualidade pedagógica
- Toda atividade declara o objetivo que avalia.
- Cada tipo de questão possui critério de correção explícito.
- Feedback explica a resposta.
- Histórico preserva tentativas e versões.
- Relatórios distinguem autodeclaração, desempenho e retenção.

### Qualidade de interface
- Tarefas principais funcionam por teclado e toque.
- Nenhuma informação é transmitida apenas por cor.
- Layout funciona a 320 px sem rolagem horizontal global.
- Movimentos respeitam preferência de redução.
- Formulários têm rótulos, erros associados e foco previsível.

### Qualidade técnica
- Atividades principais funcionam offline.
- Nenhum segredo privilegiado é incluído no bundle.
- Dependências adicionais são justificadas por benefício mensurável.
- Testes cobrem correção, persistência, importação/exportação e acessibilidade estrutural.
- CI executa testes e build.
- Desempenho é medido no dispositivo de referência, não apenas em desktop potente.

## 11. Fontes consultadas

1. H5P — exemplos e tipos de conteúdo: https://h5p.org/content-types-and-applications
2. H5P — produto e integrações: https://h5p.com/
3. H5P — Quiz / Question Set: https://h5p.com/content-types/quiz-%28question-set%29
4. H5P — Flashcards: https://h5p.com/content-types/flashcards
5. University of British Columbia — Why use H5P?: https://h5p.open.ubc.ca/getting-started-with-h5p/why-use-h5p/
6. University of Melbourne — H5P: https://lms.unimelb.edu.au/learning-technologies/h5p
7. W3C WAI — Designer Modules: https://www.w3.org/WAI/curricula/designer-modules/
8. Moodle UX principles: https://support.myblog.arts.ac.uk/files/2025/11/How_To_Moodle_Background_and_Scope.pdf
9. Carpenter, Pan & Butler (2022), The science of effective learning with spacing and retrieval practice: https://www.nature.com/articles/s44159-022-00089-1
10. Donoghue & Hattie (2021), A Meta-Analysis of Ten Learning Techniques: https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full
11. Agarwal, Nunes & Blunt (2021), Retrieval Practice Consistently Benefits Student Learning: https://doi.org/10.1007/s10648-021-09595-9
12. Ruitenburg et al. (2026), A Meta-Analysis of the Effectiveness and Boundary Conditions of Retrieval Practice, Distributed Practice, and Interleaved Practice in Authentic School Classrooms: https://link.springer.com/article/10.1007/s10648-026-10225-5

---
**Status:** pesquisa e especificação documentadas. Nenhum novo editor, quiz, mapa conceitual ou sistema de tentativas é declarado como funcional nesta entrega.


## 7. Materiais de estudo importados e atividades fundamentadas

### Objetivo
Permitir que uma pesquisa preparada fora do aplicativo se torne uma fonte de referência vinculada ao percurso de aprendizagem e às atividades, sem exigir inferência semântica pesada no navegador.

### Fluxo
1. Importar arquivo textual (TXT, Markdown, LaTeX, HTML, CSV, JSON de pesquisa, BibTeX ou RIS) ou colar texto.
2. Normalizar o texto localmente, preservando o conteúdo original.
3. Dividir o texto por títulos e parágrafos em trechos de até aproximadamente 4.500 caracteres.
4. Associar o material a um curso.
5. Vincular objetivos de aprendizagem ao mesmo curso.
6. Criar uma atividade aberta a partir de um trecho: o enunciado é um rascunho, o trecho integral fica como resposta de referência e a atividade mantém a proveniência.
7. Revisar e editar enunciado, resposta de referência e critério antes de salvar.

### Decisões de desempenho e confiabilidade
- Não incorporar um LLM ou banco vetorial ao frontend.
- Não gerar gabaritos de múltipla escolha por heurística: isso elevaria o risco de alternativas e respostas incorretas.
- A primeira versão gera somente rascunhos de resposta aberta ancorados em trechos do material; a autoavaliação continua explícita e não é apresentada como correção automática.
- A divisão em trechos reduz o volume de texto exibido e permite selecionar partes relevantes, mas não equivale a compreensão semântica ou RAG.
- Arquivos ficam limitados a 1 MB, cada material a 180 mil caracteres e o conjunto a 500 mil caracteres para proteger o armazenamento local.
- Conteúdo original e texto normalizado entram no backup JSON.
- Materiais permanecem locais ao espaço de trabalho neste dispositivo e não entram nas tabelas/streams atuais do PowerSync. Sincronização entre dispositivos exige esquema, RLS, streams, migração e testes específicos.
- PDF, DOCX, OCR, embeddings e geração automática por IA ficam fora desta etapa para preservar o bundle e a responsividade.
