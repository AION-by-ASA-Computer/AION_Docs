// Build del portale docs.aion-asa.com
// Per ogni prodotto in products.json: prende la repo, compila il sito Docusaurus
// con il baseUrl giusto e lo copia in dist/<path>/. Genera anche la pagina di
// ingresso, la sitemap e robots.txt.
//
// Variabili d'ambiente:
//   GH_TOKEN         token GitHub in sola lettura (su Vercel, per le repo private)
//   GH_OWNER         (facoltativo) sovrascrive "owner" di products.json
//   LOCAL_REPOS_DIR  (solo test in locale) cartella che contiene i cloni delle repo:
//                    se esiste <LOCAL_REPOS_DIR>/<repo> compila direttamente quella
//                    cartella (sul posto, senza copiarla) invece di scaricarla da GitHub
//   BUILD_TMP_DIR    (facoltativo) dove mettere i file temporanei (default: .tmp)
//   OUT_DIR          (facoltativo) cartella di output (default: dist)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TMP = path.resolve(process.env.BUILD_TMP_DIR || path.join(ROOT, '.tmp'));
const DIST = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'dist'));

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
const SITE_URL = (config.siteUrl || 'https://docs.aion-asa.com').replace(/\/$/, '');
const owner = process.env.GH_OWNER || config.owner;
const token = process.env.GH_TOKEN || '';
const localDir = process.env.LOCAL_REPOS_DIR || '';

const mask = (s) => (token ? s.split(token).join('***') : s);

function run(cmd, cwd = ROOT, env = {}) {
  console.log(`\n$ ${mask(cmd)}  (in ${cwd})`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  } catch {
    throw new Error(`Comando fallito: ${mask(cmd)}`);
  }
}

function installCommand(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'corepack enable && pnpm install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'corepack enable && yarn install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm ci';
  return 'npm install --no-audit --no-fund';
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ottiene il sorgente della repo e restituisce la cartella da compilare:
// - test in locale: la repo locale stessa, compilata sul posto (nessuna copia;
//   la build finisce in <siteDir>/build, che è già ignorata da git)
// - altrimenti: clone da GitHub dentro TMP
function fetchRepo(p) {
  const local = localDir && path.resolve(localDir, p.repo);
  if (local && fs.existsSync(path.join(local, '.git'))) {
    console.log(`\nUso la repo locale (build sul posto): ${local}`);
    return { dir: local, isLocal: true };
  }
  const repoDir = path.join(TMP, p.repo);
  const auth = token ? `x-access-token:${token}@` : '';
  const url = `https://${auth}github.com/${owner}/${p.repo}.git`;
  run(`git clone --depth 1 --branch ${p.branch || 'main'} ${url} "${repoDir}"`);
  return { dir: repoDir, isLocal: false };
}

// --- pulizia ---
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

const built = [];

for (const p of config.products) {
  console.log(`\n========== ${p.name} → /${p.path}/ ==========`);
  const { dir: repoDir, isLocal } = fetchRepo(p);

  const siteDir = path.join(repoDir, p.siteDir || 'website');
  if (!fs.existsSync(path.join(siteDir, 'package.json'))) {
    throw new Error(`${p.repo}: non trovo package.json in "${p.siteDir}". Controlla "siteDir" in products.json.`);
  }

  // baseUrl e url passati come variabili d'ambiente (il docusaurus.config deve leggerle)
  const env = {
    DOCUSAURUS_BASE_URL: `/${p.path}/`,
    DOCUSAURUS_URL: SITE_URL,
    ...(p.env || {}),
  };

  // In locale non reinstallo se le dipendenze ci sono già (npm ci cancellerebbe node_modules)
  if (isLocal && fs.existsSync(path.join(siteDir, 'node_modules'))) {
    console.log('\nnode_modules già presente: salto l\'installazione');
  } else {
    run(installCommand(siteDir), siteDir);
  }
  run('npm run build', siteDir, env);

  const out = path.join(siteDir, 'build');
  const index = path.join(out, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`${p.repo}: build completata ma manca build/index.html`);

  // Controllo che il sito sia stato compilato con il baseUrl giusto
  const html = fs.readFileSync(index, 'utf8');
  if (!html.includes(`/${p.path}/`)) {
    throw new Error(
      `${p.repo}: il sito non usa il baseUrl '/${p.path}/'. ` +
        `Nel docusaurus.config usa process.env.DOCUSAURUS_BASE_URL oppure imposta baseUrl: '/${p.path}/'.`
    );
  }

  fs.cpSync(out, path.join(DIST, p.path), { recursive: true });
  built.push({ ...p, hasSitemap: fs.existsSync(path.join(out, 'sitemap.xml')) });
}

// --- pagina di ingresso ---
fs.cpSync(path.join(ROOT, 'landing'), DIST, { recursive: true });
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const cards = built
  .map(
    (p) => `      <a class="card" href="/${p.path}/">
        <h2>${escapeHtml(p.name)}</h2>
        <p>${escapeHtml(p.description || '')}</p>
        <span class="go">Apri la documentazione →</span>
      </a>`
  )
  .join('\n');
fs.writeFileSync(
  path.join(DIST, 'index.html'),
  template.replace('{{CARDS}}', cards).replace('{{YEAR}}', String(new Date().getFullYear()))
);

// --- sitemap indice + robots ---
const sitemaps = built
  .filter((p) => p.hasSitemap)
  .map((p) => `  <sitemap><loc>${SITE_URL}/${p.path}/sitemap.xml</loc></sitemap>`)
  .join('\n');
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>\n`
);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nFatto: ${built.map((p) => '/' + p.path + '/').join(', ')}  →  ${DIST}`);
