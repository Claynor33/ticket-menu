// Génère server/public (page, manifest, service worker) et server/data/ref.json à partir de web/app.html.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
cp.execFileSync(process.execPath, [path.join(__dirname, 'extract-logic.js')]);
const L = require(path.join(root, 'test', '.logic.cjs'));
const PAGES = process.argv.includes('--pages');
let fbcfg = null;
if (PAGES) {
  const f = path.join(root, 'firebase.config.json');
  if (!fs.existsSync(f)) { console.error('firebase.config.json introuvable'); process.exit(1); }
  fbcfg = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const pub = PAGES ? path.join(root, 'docs') : path.join(root, 'server', 'public'), data = path.join(root, 'server', 'data');
fs.mkdirSync(pub, { recursive: true }); if (!PAGES) fs.mkdirSync(data, { recursive: true });

// Table de référence pour contrôler la vraisemblance des prix signalés.
const ref = { stores: L.STORES.map(s => ({ id: s.id, i: s.i, a: s.a })), ingredients: {} };
for (const id in L.ING) ref.ingredients[id] = { price: L.ING[id].price, a: L.ING[id].a };
if (!PAGES) fs.writeFileSync(path.join(data, 'ref.json'), JSON.stringify(ref));

// Page : la même que l'artefact, enveloppée dans un document complet.
const frag = fs.readFileSync(path.join(root, 'web', 'app.html'), 'utf8');
const cut = frag.indexOf('<div id="app">');
const headBits = frag.slice(0, cut).replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');
const body = frag.slice(cut);
const html = '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  (PAGES ? '<meta name="tm-firebase" content=\'' + JSON.stringify(fbcfg) + '\'>' : '<meta name="tm-server" content="1">') +
  '<meta name="theme-color" content="#C93D26">' +
  '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-title" content="Ticket Menu">' +
  '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml">' +
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}[hidden]{display:none!important}img{max-width:100%}</style>' +
  headBits + '</head><body>' + body + '</body></html>\n';
fs.writeFileSync(path.join(pub, 'index.html'), html);

fs.writeFileSync(path.join(pub, 'manifest.webmanifest'), JSON.stringify({
  name: 'Ticket Menu', short_name: 'Ticket Menu', lang: 'fr', start_url: './', scope: './', display: 'standalone',
  background_color: '#FBF3E6', theme_color: '#C93D26',
  description: 'Menus de la semaine et liste de courses chiffrée selon ton budget.',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
  ]
}, null, 2));

fs.writeFileSync(path.join(pub, 'sw.js'), `// Réseau d'abord, copie locale en secours : l'appli s'ouvre aussi sans connexion après une première visite.
const V = 'tm-v2';
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(['./', 'manifest.webmanifest', 'icon.svg'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});
`);
fs.writeFileSync(path.join(pub, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#C93D26"/><path d="M148 96h216v320l-27-20-27 20-27-20-27 20-27-20-27 20-27-20-27 20z" fill="#FFF4E4"/><g stroke="#C93D26" stroke-width="18" stroke-linecap="round"><path d="M196 168h120M196 224h120M196 280h72"/></g></svg>' + String.fromCharCode(10));
if (PAGES) {
  fs.writeFileSync(path.join(pub, '.nojekyll'), '');
  for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(root, 'server', 'public', f), path.join(pub, f));
  console.log('Build GitHub Pages terminé : docs/');
} else console.log('Build terminé : server/public et server/data/ref.json');
