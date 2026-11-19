// Anteprima locale di dist/ che si comporta come Vercel:
// cleanUrls (pagina → pagina.html / pagina/index.html) e redirect presi da vercel.json.
// Uso:  node preview.mjs   poi apri http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const DIST = path.resolve(process.env.OUT_DIR || 'dist');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Converte la sintassi di vercel.json (":nome(regex)", ":nome*", ":nome") in una RegExp
function compile(source) {
  let re = source
    .replace(/\/:(\w+)\*/g, '(?:/(?<$1>.*))?')
    .replace(/:(\w+)\(([^)]+)\)/g, '(?<$1>$2)')
    .replace(/:(\w+)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${re}/?$`);
}
const redirects = (vercel.redirects || []).map((r) => ({ ...r, re: compile(r.source) }));

function findFile(urlPath) {
  const p = path.join(DIST, decodeURIComponent(urlPath));
  if (!p.startsWith(DIST)) return null;
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    for (const r of redirects) {
      const m = url.pathname.match(r.re);
      if (m) {
        const dest = r.destination.replace(/:(\w+)\*?/g, (_, k) => m.groups?.[k] ?? '').replace(/\/+$/, '') || '/';
        res.writeHead(r.permanent ? 308 : 307, { Location: dest + url.search });
        return res.end();
      }
    }
    const file = findFile(url.pathname);
    if (!file) {
      const nf = findFile(url.pathname.split('/').slice(0, 2).join('/') + '/404.html') || findFile('/404.html');
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(nf ? fs.readFileSync(nf) : 'Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Anteprima su http://localhost:${PORT}`));
