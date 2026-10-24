// Calcule des prix de paquets à partir des relevés Open Prices (Open Food Facts, licence ODbL).
// Utilisé par scripts/update-prices.js (GitHub Actions) ; la logique est pure : elle reçoit une fonction getJson.
const BRAND = [
  ['lidl', /lidl/i], ['aldi', /aldi/i], ['leclerc', /leclerc/i], ['inter', /intermarch/i],
  ['u', /(super u|hyper u|u express|march[ée] u|\bu\b)/i], ['auchan', /auchan/i], ['carrefour', /carrefour/i],
  ['casino', /(casino|g[ée]ant|vival|spar\b)/i], ['grandfrais', /grand frais/i]
];
const brandOf = loc => { const n = (loc && (loc.osm_brand || loc.osm_name)) || ''; for (const [id, re] of BRAND) if (re.test(n)) return id; return null; };

function parseQty(p) { // -> { kg } | { l } | { n } | null
  if (!p) return null;
  const pq = Number(p.product_quantity), pu = (p.product_quantity_unit || '').toLowerCase();
  if (pq > 0) {
    if (pu === 'g') return { kg: pq / 1000 }; if (pu === 'kg') return { kg: pq };
    if (pu === 'ml') return { l: pq / 1000 }; if (pu === 'cl') return { l: pq / 100 }; if (pu === 'l') return { l: pq };
  }
  const s = String(p.quantity || '').toLowerCase().replace(',', '.');
  let m = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const mul = m ? +m[1] : 1;
  if (!m) m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/), m && m.splice(1, 0, '1');
  if (!m) return null;
  const v = +m[2] * mul, u = m[3];
  return u === 'g' ? { kg: v / 1000 } : u === 'kg' ? { kg: v } : u === 'ml' ? { l: v / 1000 } : u === 'cl' ? { l: v / 100 } : { l: v };
}

// Un relevé -> prix au kg, au litre ou à la pièce (selon `per`), ou null.
function unitPrice(it, per) {
  const price = Number(it.price); if (!(price > 0)) return null;
  if (it.type === 'CATEGORY') {
    const pp = (it.price_per || '').toUpperCase();
    if (pp === 'KILOGRAM') return per === 'kg' ? price : null;
    if (pp === 'UNIT') return per === 'unit' ? price : null;
    return null;
  }
  const q = parseQty(it.product); if (!q) return null;
  if (per === 'kg') return q.kg ? price / q.kg : null;
  if (per === 'l') return q.l ? price / q.l : null;
  return null;
}
// Les relevés mélangent marques premium, bio et marques de distributeur : un quantile bas se rapproche du prix qu'on paie en choisissant le premier prix.
const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// map : { ingId: { cats:[...tags], per:'kg'|'l'|'unit', kgPerPack?: number } }
async function buildPrices({ getJson, ING, STORES, MAP, since, pages = 6, minObs = 8, q = 0.25, lo = 0.6, hi = 1.7, log = () => {} }) {
  const prices = {}, meta = {};
  const avgIdx = STORES.reduce((s, x) => s + x.i, 0) / STORES.length;
  for (const id of Object.keys(MAP)) {
    const g = ING[id], spec = MAP[id]; if (!g) continue;
    const obs = [];
    for (const tag of spec.cats) {
      for (const field of ['product__categories_tags__contains', 'category_tag']) {
        for (let p = 1; p <= pages; p++) {
          let j; try { j = await getJson('/api/v1/prices?' + field + '=' + encodeURIComponent(tag) + '&currency=EUR&date__gte=' + since + '&size=100&page=' + p + '&order_by=-date'); } catch (e) { break; }
          for (const it of (j.items || [])) {
            const loc = it.location; if (!loc || loc.osm_address_country_code !== 'FR') continue;
            const v = unitPrice(it, spec.per); if (v == null) continue;
            obs.push({ v, b: brandOf(loc) });
          }
          if (!j.items || j.items.length < 100 || p >= (j.pages || 1)) break;
        }
      }
    }
    // pack price from a unit price
    const pack = v => spec.per === 'unit' ? v * (spec.perPack || 1)
      : g.u === 'g' ? v * g.p / 1000 : g.u === 'ml' ? v * g.p / 1000 : v * (spec.kgPerPack || 1);
    if (obs.length < minObs) { meta[id] = { n: obs.length }; continue; }
    // écarte les valeurs aberrantes (hors de 0,4× à 2,5× de la médiane)
    const m0 = median(obs.map(o => o.v)), ok = obs.filter(o => o.v >= m0 * 0.4 && o.v <= m0 * 2.5);
    const nat = pack(quantile(ok.map(o => o.v), q)), base = nat / avgIdx;
    const est = g.price;
    if (base < est * lo || base > est * hi) { meta[id] = { n: ok.length, rejected: Math.round(base * 100) / 100, est }; continue; }
    meta[id] = { n: ok.length, base: Math.round(base * 100) / 100, est };
    for (const st of STORES) {
      const own = ok.filter(o => o.b === st.id);
      let val;
      if (own.length >= minObs) { val = pack(quantile(own.map(o => o.v), 0.4)); meta[id][st.id] = own.length; }
      else val = base * st.i * st.a[g.a];
      (prices[st.id] = prices[st.id] || {})[id] = Math.round(val * 100) / 100;
    }
  }
  return { prices, meta };
}
module.exports = { buildPrices, brandOf, parseQty, unitPrice, quantile };
