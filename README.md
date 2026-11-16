# Estudos

Aplicação web progressiva (PWA) para estudos, publicada automaticamente pelo GitHub Actions no GitHub Pages.

Cada alteração enviada à branch `main` executa validações e, quando aprovada, publica a nova versão. O navegador recebe atualizações pelo Service Worker, sem reinstalação no Linux.

## Desenvolvimento local

Abra `index.html` em um servidor HTTP local. Service Workers exigem HTTPS ou `localhost`.

## Publicação

O workflow `.github/workflows/deploy.yml` publica automaticamente no GitHub Pages após cada push em `main`. A primeira publicação também exige que a fonte do GitHub Pages esteja configurada como **GitHub Actions** nas configurações do repositório.

## Dados

O projeto inicial é estático e não envia dados para um servidor. Dados que vierem a ser adicionados no navegador devem ficar separados do cache de arquivos da aplicação.
