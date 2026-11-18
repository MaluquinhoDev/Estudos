# Backup local — Estudos

**Estado:** implementado no frontend; exportação local e restauração por arquivo JSON.  
**Escopo:** dados de aprendizagem do espaço atualmente aberto no navegador.

## O que é incluído

- Cursos, categorias, descrições e datas mantidas nos registros.
- Módulos e conteúdos, incluindo objetivos, anotações e estado de aprendizagem.
- Cartões de revisão, respostas, intervalos e datas de revisão.
- Recursos da Biblioteca, URLs, descrições e vínculos com cursos.
- Identificadores e campos de dados existentes nos registros.

O arquivo é JSON, não depende de uma conta externa e pode ser guardado em Downloads, armazenamento externo ou outro dispositivo.

## O que não é incluído

- Senha, sessão ou credenciais do Supabase.
- Configurações do projeto Supabase, schema SQL, políticas RLS ou migrations.
- Configurações e credenciais do PowerSync.
- Código do aplicativo, cache PWA ou arquivos do navegador.
- Arquivos binários externos. Atualmente os recursos da Biblioteca são referências e URLs, não cópias dos documentos remotos.
- Dados de outros perfis/contas que não estejam no espaço ativo.

## Como baixar

1. Abra o Estudos no navegador ou PWA.
2. Use **Baixar backup** no menu lateral.
3. O navegador gera `estudos-backup-<data>.json` e inicia o download.
4. Confirme a presença do arquivo na pasta Downloads antes de considerar a cópia preservada.

A exportação utiliza Blob e URL de objeto do próprio navegador. A URL temporária é revogada após um intervalo para não interromper o início do download em navegadores móveis.

## Como restaurar

1. Abra o menu lateral e selecione **Restaurar backup**.
2. Escolha um arquivo JSON exportado pelo Estudos.
3. O aplicativo valida o formato, a estrutura aninhada e identificadores duplicados.
4. A tela de confirmação informa a quantidade de cursos, módulos, conteúdos, cartões e recursos.
5. A restauração substitui os dados do espaço ativo. Não é uma mesclagem.

Arquivos do formato anterior, que armazenavam `schemaVersion: 2` diretamente na raiz, continuam aceitos. O formato atual usa um envelope com `format`, `backupVersion`, `appVersion`, `exportedAt`, contagens e `data`.

Se a gravação no armazenamento local falhar, a restauração reverte para o estado que estava carregado em memória e informa a falha.

## Limites arquiteturais importantes

Neste momento, a interface do Estudos usa `localStorage` como estado operacional primário. O PowerSync recebe um espelhamento incremental, mas SQLite ainda não é a fonte primária de leitura da interface. Portanto, este backup representa o estado de aprendizagem carregado no navegador ativo, e não um dump completo do PostgreSQL/Supabase ou do banco SQLite interno do PowerSync.

O download é uma cópia manual controlada pelo usuário; não é backup automático nem sincronização em nuvem. Em navegadores com armazenamento por perfil, limpar dados do site pode apagar o estado local, sem apagar um arquivo JSON que já tenha sido baixado para fora do armazenamento do site.

Quando SQLite/PowerSync se tornar a fonte operacional da interface, a exportação deverá passar a ler uma transação consistente das tabelas locais sincronizadas, preservando a mesma estrutura portátil e mantendo a distinção entre backup de dados pessoais e backup administrativo do backend.

## Base técnica

- MDN — Blob URLs: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob
- Chrome for Developers — salvar arquivos com Blob, URL de objeto e atributo download: https://developer.chrome.com/docs/capabilities/browser-fs-access
- Supabase — backups de banco, exportação lógica e limites dos backups gerenciados: https://supabase.com/docs/guides/platform/backups

