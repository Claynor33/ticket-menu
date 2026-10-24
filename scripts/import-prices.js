// Importe des prix contrôlés (tes propres relevés de tickets, par exemple) dans la base.
// Format CSV avec en-tête : store,ingredient,price   (séparateur , ou ;)
//   node scripts/import-prices.js releves.csv
// Les identifiants d'enseigne et d'ingrédient sont ceux de server/data/ref.json.
const fs = require('fs'), path = require('path');
const { openDb } = require('../server/src/db');
const { createPrices, loadRef } = require('../server/src/prices');
const file = process.argv[2];
if (!file) { console.error('Usage : node scripts/import-prices.js releves.csv'); process.exit(1); }
const db = openDb(process.env.DB_PATH || path.join(__dirname, '..', 'server', 'data', 'ticketmenu.db'));
const prices = createPrices(db, loadRef());
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
const head = lines.shift().split(/[;,]/).map(s => s.trim().toLowerCase());
const ix = n => head.indexOf(n);
if ([ix('store'), ix('ingredient'), ix('price')].some(i => i < 0)) { console.error('En-tête attendu : store,ingredient,price'); process.exit(1); }
let ok = 0, ko = 0;
for (const l of lines) {
  const c = l.split(/[;,]/).map(s => s.trim());
  if (prices.report(c[ix('store')], c[ix('ingredient')], String(c[ix('price')]).replace(',', '.'), 'import', 'import')) ok++; else { ko++; console.warn('Refusé :', l); }
}
console.log(ok + ' prix importés, ' + ko + ' refusés.');
db.close();
