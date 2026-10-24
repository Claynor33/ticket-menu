'use strict';
// Prix communautaires : médiane des relevés récents, avec garde-fous contre les valeurs aberrantes.
const fs = require('node:fs');
const path = require('node:path');

const MAX_AGE_MS = 120 * 24 * 3600 * 1000;
const MIN_USERS = 2; // un prix n'est publié que si au moins 2 personnes différentes le confirment

function loadRef(file) {
  return JSON.parse(fs.readFileSync(file || path.join(__dirname, '..', 'data', 'ref.json'), 'utf8'));
}
function estimate(ref, store, ing) {
  const s = ref.stores.find((x) => x.id === store), g = ref.ingredients[ing];
  if (!s || !g) return null;
  return g.price * s.i * s.a[g.a];
}
function plausible(ref, store, ing, price) {
  const est = estimate(ref, store, ing);
  return est !== null && Number.isFinite(price) && price >= est * 0.3 && price <= est * 3;
}
function median(a) {
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function createPrices(db, ref) {
  const q = {
    upsert: db.prepare(`INSERT INTO price_reports (store, ingredient, reporter, source, price, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(store, ingredient, reporter) DO UPDATE SET price = excluded.price, created_at = excluded.created_at, source = excluded.source`),
    recent: db.prepare('SELECT store, ingredient, reporter, source, price, created_at FROM price_reports WHERE created_at > ?')
  };
  return {
    report(store, ing, price, reporter, source) {
      price = Math.round(Number(price) * 100) / 100;
      if (!plausible(ref, store, ing, price)) return false;
      q.upsert.run(store, ing, reporter, source || 'user', price, Date.now());
      return true;
    },
    aggregate() {
      const rows = q.recent.all(Date.now() - MAX_AGE_MS), by = {};
      for (const r of rows) {
        const k = r.store + '|' + r.ingredient;
        (by[k] = by[k] || []).push(r);
      }
      const prices = {}, counts = {};
      for (const k in by) {
        const [store, ing] = k.split('|'), list = by[k];
        const imp = list.filter((r) => r.source === 'import').sort((a, b) => b.created_at - a.created_at)[0];
        let p = null, n = 0;
        if (imp) { p = imp.price; n = 1; }
        else {
          const users = list.filter((r) => r.source === 'user');
          if (users.length >= MIN_USERS) { p = Math.round(median(users.map((r) => r.price)) * 100) / 100; n = users.length; }
        }
        if (p !== null) { (prices[store] = prices[store] || {})[ing] = p; (counts[store] = counts[store] || {})[ing] = n; }
      }
      return { prices, counts };
    }
  };
}
module.exports = { createPrices, loadRef, plausible, estimate };
