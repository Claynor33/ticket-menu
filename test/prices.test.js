const test = require('node:test'), assert = require('node:assert');
const { buildPrices, parseQty, brandOf, quantile } = require('../scripts/lib/open-prices.js');
const ING = { pates: { u: 'g', p: 500, price: 1.2, a: 1 }, haricotsr: { u: 'u', p: 1, price: 1.2, a: 1 } };
const STORES = [{ id: 'lidl', i: 0.93, a: [1, 1, 1, 1, 1] }, { id: 'leclerc', i: 1, a: [1, 1, 1, 1, 1] }];
const item = (price, qty, brand) => ({ type: 'PRODUCT', price, product: { quantity: qty }, location: { osm_address_country_code: 'FR', osm_brand: brand } });

test('quantités et enseignes', () => {
  assert.deepEqual(parseQty({ quantity: '6 x 125 g' }), { kg: 0.75 });
  assert.deepEqual(parseQty({ quantity: '1,5 L' }), { l: 1.5 });
  assert.equal(parseQty({ quantity: 'lot' }), null);
  assert.equal(brandOf({ osm_brand: 'Super U' }), 'u');
  assert.equal(brandOf({ osm_name: 'Lidl' }), 'lidl');
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test('prix du paquet à partir des relevés, avec garde-fous', async () => {
  const items = [];
  for (let k = 0; k < 12; k++) items.push(item(1.0 + k * 0.1, '500 g', 'Leclerc'));      // 2,0 à 3,1 €/kg
  items.push(item(90, '500 g', 'Leclerc'), { type: 'PRODUCT', price: 1, product: { quantity: '500 g' }, location: { osm_address_country_code: 'DE', osm_brand: 'Lidl' } });
  const getJson = async p => p.includes('category_tag=') ? { items: [], pages: 1 } : { items, pages: 1 };
  const r = await buildPrices({ getJson, ING, STORES, MAP: { pates: { cats: ['en:pastas'], per: 'kg' } }, since: '2026-01-01' });
  const lec = r.prices.leclerc.pates, lid = r.prices.lidl.pates;
  assert.ok(lec > 0.9 && lec < 1.5, 'paquet de pâtes plausible : ' + lec);
  assert.ok(lid < lec, 'Lidl moins cher que Leclerc');
  assert.ok(r.meta.pates.n <= 12, 'le relevé à 90 € et le relevé allemand sont écartés');
});

test('pas assez de relevés ou prix aberrant : l’estimation est gardée', async () => {
  const few = async () => ({ items: [item(2, '500 g', 'Lidl')], pages: 1 });
  let r = await buildPrices({ getJson: few, ING, STORES, MAP: { pates: { cats: ['x'], per: 'kg' } }, since: 'x' });
  assert.deepEqual(r.prices, {});
  const crazy = async () => ({ items: Array.from({ length: 20 }, () => item(25, '500 g', 'Lidl')), pages: 1 });
  r = await buildPrices({ getJson: crazy, ING, STORES, MAP: { pates: { cats: ['x'], per: 'kg' } }, since: 'x' });
  assert.deepEqual(r.prices, {});
  assert.ok(r.meta.pates.rejected);
});
