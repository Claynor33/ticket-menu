// Met à jour docs/prices.json à partir d'Open Prices (https://prices.openfoodfacts.org, licence ODbL).
// Lancé chaque jour par .github/workflows/prices.yml ; peut aussi l'être à la main : npm run update-prices
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { buildPrices } = require('./lib/open-prices.js');
const root = path.join(__dirname, '..');
cp.execFileSync(process.execPath, [path.join(__dirname, 'extract-logic.js')]);
const L = require(path.join(root, 'test', '.logic.cjs'));
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'price-map.json'), 'utf8'));
const BASE = 'https://prices.openfoodfacts.org';
const days = +process.env.PRICE_DAYS || 90;
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(p) {
  await sleep(120); // on reste poli avec le serveur
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(BASE + p, { headers: { 'user-agent': 'ticket-menu-price-updater (github.com/Claynor33/ticket-menu)' } });
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 422) throw new Error('HTTP ' + r.status);
    } catch (e) { if (k === 2) throw e; }
    await new Promise(r => setTimeout(r, 1500 * (k + 1)));
  }
  throw new Error('échec ' + p);
}

(async () => {
  const out = path.join(root, 'docs', 'prices.json');
  const { prices, meta } = await buildPrices({
    getJson, ING: L.ING, STORES: L.STORES, MAP, since,
    log: m => console.log(m)
  });
  const n = Object.keys(meta).filter(k => meta[k].base).length;
  console.log(n + ' ingrédients mis à jour sur ' + Object.keys(MAP).length);
  // Garde-fou : si la source ne répond presque pas, on garde le fichier précédent.
  if (n < 10) { console.log('Trop peu de données : fichier précédent conservé.'); return; }
  const date = new Date().toISOString().slice(0, 10);
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  const next = { updated: date, source: 'Open Prices (Open Food Facts), licence ODbL', days, count: n, prices, meta };
  // Évite un commit quotidien inutile quand rien n'a changé hors la date.
  if (prev && JSON.stringify(prev.prices) === JSON.stringify(prices)) { console.log('Aucun changement de prix.'); return; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(next));
  console.log('docs/prices.json écrit (' + date + ')');
})().catch(e => { console.error(e); process.exit(1); });
