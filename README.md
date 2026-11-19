# AION_Docs

Portale unico della documentazione AION, pubblicato su **docs.aion-asa.com**.

La documentazione di ogni prodotto vive nella repo del prodotto (cartella Docusaurus).
Questa repo, a ogni build, scarica quelle cartelle, le compila e le pubblica come un unico sito:

| Percorso | Repo |
|---|---|
| `/` | pagina di ingresso (`landing/`) |
| `/agents/` | AION_Agent |

## File

- `products.json` — elenco dei prodotti (unico file da modificare di solito)
- `build.mjs` — script di build (scarica, compila, unisce)
- `vercel.json` — configurazione Vercel e redirect dei vecchi link
- `landing/index.html` — pagina di ingresso (le card vengono generate da `products.json`)
- `preview.mjs` — anteprima locale di `dist/` che si comporta come Vercel
- `.github/workflows/trigger-docs.yml` — workflow riusabile chiamato dalle repo dei prodotti

## Variabili d'ambiente su Vercel

- `GH_TOKEN` — token GitHub fine-grained, permesso **Contents: Read-only** sulle repo dei prodotti

## Aggiungere un prodotto

1. Nella repo del prodotto, il `docusaurus.config` deve leggere `baseUrl` da
   `process.env.DOCUSAURUS_BASE_URL` e `url` da `process.env.DOCUSAURUS_URL`.
2. Aggiungere il prodotto in `products.json` (`path` = percorso sul portale).
3. Dare al token GitHub l'accesso alla nuova repo.
4. Creare `.github/workflows/docs-deploy.yml` nella repo del prodotto con il contenuto
   qui sotto (cambiare solo `paths`).
5. Spuntare la repo nel segreto di organizzazione `DOCS_DEPLOY_HOOK`.

```yaml
name: Docs Deploy

on:
  push:
    branches: [main]
    paths:
      - "docs/**"      # cartella con i file .md
      - "website/**"   # cartella del sito Docusaurus (= siteDir in products.json)
  workflow_dispatch:   # avvio manuale dalla tab Actions

permissions: {}

jobs:
  trigger:
    uses: AION-by-ASA-Computer/AION_Docs/.github/workflows/trigger-docs.yml@main
    secrets: inherit
```

## Aggiornamento automatico

- Un solo Deploy Hook Vercel, salvato nel segreto di organizzazione `DOCS_DEPLOY_HOOK`
  (accesso "Selected repositories").
- La logica è nel workflow riusabile `.github/workflows/trigger-docs.yml` di questa repo;
  le repo dei prodotti lo richiamano con il file qui sopra.
- Questa repo deve permetterlo: Settings → Actions → General → Access →
  "Accessible from repositories in the organization".

## Build in locale

```bash
GH_TOKEN=xxxx node build.mjs
node preview.mjs   # come Vercel: cleanUrls + redirect di vercel.json
```

Per provare le repo clonate accanto a questa (anche con modifiche non committate),
senza scaricarle da GitHub: `LOCAL_REPOS_DIR=..` compila ogni `<LOCAL_REPOS_DIR>/<repo>`
sul posto (l'output finisce nella sua `build/`, poi copiato in `dist/`).

```powershell
$env:LOCAL_REPOS_DIR = '..'; node build.mjs; node preview.mjs
```
