# Estudos — Arquitetura do Ambiente Virtual de Aprendizagem

Versão 2.0 · MVP funcional · GitHub Pages · PWA estático.

## Objetivo

AVA pessoal centrado no estudante. O sistema conecta cursos, módulos, conteúdos, objetivos, materiais, prática, revisão e evidências de aprendizagem. Não confunde assistir a uma aula ou concluir uma tarefa com dominar o conhecimento.

## Pesquisa aplicada

- **Moodle:** conclusão de atividades por critérios explícitos, progresso do curso e competências associadas a atividades.
- **Canvas:** Mastery Paths encaminha estudantes a reforço ou aprofundamento conforme resultados de atividades.
- **H5P:** criação de recursos interativos como questionários, vídeo interativo e cenários ramificados.
- **1EdTech LTI 1.3:** padrão para conectar ferramentas educacionais externas com autenticação e troca segura de dados.
- **xAPI:** formato interoperável para registrar experiências de aprendizagem dentro e fora de um LMS.
- **Ciência cognitiva:** recuperação ativa, prática espaçada, intercalação, elaboração, exemplos concretos, codificação dual e feedback.

As referências orientam decisões de arquitetura; as ferramentas externas não estão instaladas nesta versão.

## Organização pedagógica

Instituição/plano pessoal → Curso → Módulo → Conteúdo/Lição → Atividade → Tentativa → Evidência.

Uma competência pode atravessar vários conteúdos. Um recurso pode apoiar várias lições. Um cartão de revisão pode estar ligado a uma lição e acumular tentativas.

### Estados de aprendizagem

- planned: não iniciado.
- studying: em aprendizagem.
- practicing: em prática.
- learned: aprendeu em contexto conhecido.
- mastered: demonstrou retenção e aplicação em situações variadas.
- review: precisa de recuperação/reforço.

Na versão atual, esses estados são definidos pelo estudante. Futuramente, domínio deverá ser sustentado por evidências como explicação própria, exercícios, projetos, avaliações e revisão posterior. Revisão é um estado operacional, não uma nota.

### Técnicas incorporadas

1. Recuperação ativa: tentar lembrar antes de revelar resposta.
2. Prática espaçada: reagendar cartões conforme a dificuldade percebida.
3. Intercalação: alternar problemas e conceitos relacionados.
4. Elaboração: explicar por que algo funciona, relacionar ideias e criar exemplos.
5. Feedback: apontar o conceito ou etapa que gerou o erro.
6. Caminhos de domínio: desempenho baixo encaminha a pré-requisitos e exemplos; desempenho alto encaminha a aplicação e transferência.

## Módulos do produto

| Módulo | Função |
|---|---|
| Visão geral | Cursos, indicadores e revisões pendentes |
| Cursos | Disciplinas e trilhas pessoais |
| Módulos e conteúdos | Sequência de unidades, objetivos e anotações |
| Atividades | Exercícios, projetos, questionários e entregas (fase futura) |
| Revisões | Cartões, recuperação ativa e intervalos |
| Biblioteca | Links, livros, vídeos e documentos |
| Progresso | Estados e evolução por curso |
| Backup | Exportação e restauração JSON |

## Modelo de dados lógico

- Course(id, title, category, description, createdAt)
- Module(id, courseId, title, position)
- Lesson(id, moduleId, title, objective, notes, status, prerequisites[])
- Activity(id, lessonId, type, instructions, rubric, dueAt)
- Attempt(id, activityId, answer, score, feedback, attemptedAt)
- Evidence(id, lessonId, competencyId, type, reference, reflection, createdAt)
- Competency(id, title, description, level)
- ReviewCard(id, lessonId, front, back, dueAt, interval, repetitions)
- ReviewAttempt(id, cardId, rating, reviewedAt, nextDueAt)
- Resource(id, courseId, lessonId, title, type, url, description)
- StudySession(id, startedAt, endedAt, focus, notes)

Atualmente cursos, módulos, conteúdos, cartões e recursos são armazenados em JSON local. Atividades avaliativas, competências independentes, evidências estruturadas, tentativas e sessões ainda não foram implementadas.

## Arquitetura técnica atual

- HTML semântico, CSS responsivo e JavaScript nativo.
- Sem framework, CDN, dependência externa ou etapa de build.
- GitHub Pages hospeda os arquivos estáticos.
- Service Worker mantém o shell disponível offline.
- localStorage persiste os dados no navegador atual.
- JSON permite backup e restauração manual.
- GitHub Actions valida a estrutura e publica o site.

### Limites

GitHub Pages não fornece banco de dados, autenticação, API privada ou sincronização entre dispositivos. localStorage não é backup confiável: limpar os dados do site/navegador pode apagá-los. Esta versão é de usuário único e navegador único. Não armazenar informações sensíveis ou dados de terceiros.

## Evolução planejada

### Fase 1 — núcleo do AVA (implementada)
Painel, cursos, módulos, conteúdos, objetivos, anotações, estados, cartões de revisão, biblioteca, progresso, backup JSON e PWA.

### Fase 2 — atividades e evidências
Exercícios com feedback, questionários, tentativas, projetos, rubricas, evidências de domínio, pré-requisitos e mapa de conhecimento.

### Fase 3 — personalização pedagógica
Caminhos de domínio, sessões intercaladas, diagnóstico de lacunas, revisão adaptativa baseada no histórico e relatórios de retenção e transferência.

### Fase 4 — plataforma robusta
Backend/API, banco de dados, login, sincronização, perfis e permissões, trilha auditável, recuperação de dados e integrações LTI 1.3, H5P e xAPI/LRS quando justificadas.

## Critérios de qualidade

- Interface responsiva e acessível por teclado.
- Shell offline e sem dependência de CDN.
- Dados exportáveis e importáveis.
- Respeitar prefers-reduced-motion.
- Indicadores explicam o que medem.
- Progresso não afirma domínio sem evidência.
- Dados pessoais ficam no navegador até existir backend e política de privacidade.

## Fontes

- Moodle — Activity completion: https://docs.moodle.org/405/en/Activity_completion
- Moodle — Competencies: https://docs.moodle.org/500/en/Competencies
- Moodle — Course completion: https://docs.moodle.org/502/en/Course_completion
- Canvas — Mastery Paths: https://community.instructure.com/en/en/kb/articles/662760-what-are-mastery-paths
- H5P — Documentation: https://h5p.org/documentation
- 1EdTech — LTI: https://www.1edtech.org/standards/lti
- ADL — xAPI overview: https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-About.md
- Carpenter, Pan & Butler (2022): https://www.nature.com/articles/s44159-022-00089-1
- Ruitenburg et al. (2026): https://link.springer.com/article/10.1007/s10648-026-10225-5
- STEMing evidence-based study strategies (2026): https://link.springer.com/article/10.1186/s40594-026-00632-z
