const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'extract-logic.js')]);
const L = require('./.logic.cjs');

const fresh = (over) => { const st = L.newState(); Object.assign(st.s, over || {}); return st; };

test('données : tous les ingrédients des recettes existent, chaque recette a des étapes', () => {
  for (const r of L.R) {
    assert.ok(r.steps.length >= 2, r.id);
    for (const k in r.ing) assert.ok(L.ING[k], r.id + ' ' + k);
  }
  assert.ok(L.R.length >= 200);
});

// recette réellement proposée (la variante qui convient quand la fiche de base ne convient pas)
const eff = (r, s) => L.recOf(L.bestVar(r, s));
const okFor = (o) => { const s = fresh(o).s; return L.allowed(s).map(r => eff(r, s)); };

test('filtre allergènes, régime, temps et matériel', () => {
  const g = okFor({ allergens: ['gluten'] });
  assert.ok(g.length > 5 && g.every(r => !r.al.includes('gluten')));
  assert.ok(okFor({ allergens: ['lait'] }).every(r => !r.al.includes('lait')));
  assert.ok(okFor({ diet: 'veg' }).every(r => r.veg));
  assert.ok(okFor({ diet: 'nopork' }).every(r => !r.pork));
  assert.ok(okFor({ maxMin: 20 }).every(r => r.min <= 20));
  assert.ok(okFor({ four: false }).every(r => !r.four));
  assert.ok(okFor({ dislikes: ['champi'] }).every(r => !('champi' in r.ing)));
});

test('prix : correction utilisateur > communauté > estimation', () => {
  const st = fresh();
  const est = L.estPrice('pates', 'lidl');
  assert.equal(L.priceAt(st, 'pates', 'lidl'), est);
  L.setComm({ lidl: { pates: 0.99 } });
  assert.equal(L.priceAt(st, 'pates', 'lidl'), 0.99);
  st.ov.lidl = { pates: 1.5 };
  assert.equal(L.priceAt(st, 'pates', 'lidl'), 1.5);
  assert.equal(L.priceAt(st, 'pates', 'lidl', false), 0.99);
  L.setComm({});
});

test('liste : paquets entiers, basiques exclus, placard déduit', () => {
  const st = fresh({ adults: 2, kids: 0 });
  const L1 = L.buildLines(['carbo'], st);
  const pates = L1.find(l => l.id === 'pates');
  assert.equal(pates.need, 200);
  assert.equal(pates.packs, 1);
  assert.equal(pates.left, 300);
  assert.ok(!L1.some(l => l.id === 'huile'));
  const st2 = fresh(); st2.pantry.pates = { qty: 500 };
  const p2 = L.buildLines(['carbo'], st2).find(l => l.id === 'pates');
  assert.equal(p2.packs, 0); assert.equal(p2.cost, 0);
  const st3 = fresh({ staples: false });
  assert.ok(L.buildLines(['curry'], st3).some(l => l.id === 'huile'));
  // un enfant compte pour 0,6 portion
  assert.equal(L.portions({ adults: 2, kids: 2 }), 3.2);
});

test('menu : dans le budget, sans doublon, jours respectés, dîners gardés conservés', () => {
  for (const diet of ['tout', 'nopork', 'veg']) {
    const st = fresh({ diet, budget: 60, days: [0, 1, 2, 3, 4] });
    L.regen(st);
    const ids = L.planIds(st);
    assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5);
    assert.ok(L.sum(L.curLines(st)) <= 60, diet);
  }
  const st = fresh({ days: [0, 1, 2, 3, 4, 5, 6] });
  L.regen(st);
  st.plan.meals[2].locked = true; const kept = st.plan.meals[2].rid;
  L.regen(st);
  assert.equal(st.plan.meals[2].rid, kept);
  assert.equal(st.plan.meals.length, 7);
});

test('menu : petit pool, pas de crash', () => {
  const st = fresh({ diet: 'veg', allergens: ['gluten', 'lait', 'oeuf'], days: [0, 1, 2, 3, 4, 5, 6] });
  L.regen(st);
  assert.ok(st.plan.meals.length <= 7);
  assert.ok(st.plan.meals.every(m => m.rid));
});

test('plusieurs enseignes : le meilleur prix par article ne coûte jamais plus cher', () => {
  const st = fresh({ stores: ['lidl', 'leclerc', 'grandfrais'], store: 'lidl', days: [0, 1, 2, 3, 4] });
  L.regen(st);
  const single = L.sum(L.buildLines(L.planIds(st), st, { split: false }));
  const split = L.sum(L.buildLines(L.planIds(st), st, { split: true }));
  assert.ok(split <= single + 1e-9);
});

test('ajuster le nombre de jours', () => {
  const st = fresh({ days: [0, 1, 2, 3, 4] }); L.regen(st);
  st.s.days = [0, 2, 4]; L.fitMeals(st); assert.equal(st.plan.meals.length, 3);
  st.s.days = [0, 1, 2, 3, 4, 5]; L.fitMeals(st); assert.equal(st.plan.meals.length, 6);
  assert.equal(new Set(L.planIds(st)).size, 6);
});

test('remplacement : options triées, sans les dîners déjà prévus', () => {
  const st = fresh(); L.regen(st);
  const o = L.swapOptions(st, 1);
  assert.ok(o.length > 10);
  const cur = L.planIds(st);
  assert.ok(o.every(x => !cur.includes(x.rid)));
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].delta <= o[i].delta);
  assert.ok(cur.length === 5 && L.swapOne(st, 0));
});

test('bilan et nouvelle semaine : restes au placard, historique', () => {
  const st = fresh({ budget: 80 }); L.regen(st);
  const lines = L.curLines(st), total = L.sum(lines);
  const e = L.validateWeek(st);
  assert.equal(e.total, total); assert.ok(e.max >= e.total);
  assert.equal(st.hist.length, 1); assert.equal(st.plan.shopped.total, total);
  const first = lines.find(l => l.packs > 0 && l.left > 1);
  const expect = first.stock + first.packs * L.ING[first.id].p - first.need;
  const old = L.planIds(st);
  L.startNewWeek(st);
  assert.equal(Math.round(st.pantry[first.id].qty), Math.round(expect));
  assert.equal(st.plan.shopped, null);
  assert.ok(st.recent.length >= 5 && old.every(id => st.recent.includes(id)));
  assert.equal(st.plan.meals.length, 5);
});

test('texte de la liste', () => {
  const st = fresh(); L.regen(st);
  const t = L.listText(st);
  assert.match(t, /^Courses · Lidl/);
  assert.match(t, /Fruits & légumes|Épicerie/);
});

test('formats', () => {
  assert.equal(L.fq(1500, 'pdt'), '1,5 kg');
  assert.equal(L.fq(250, 'pdt'), '250 g');
  assert.match(L.fq(3, 'oeufs'), /3 œuf/);
});

test('bibliothèque : une centaine de recettes variées, tous types de repas', () => {
  const ids = L.R.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  const g = {}; L.R.forEach(r => { g[r.g] = (g[r.g] || 0) + 1; });
  ['poulet', 'boeuf', 'porc', 'poisson', 'veg'].forEach(k => assert.ok(g[k] >= 10, k));
  assert.ok(L.R.filter(r => r.veg).length >= 30);
  assert.ok(L.R.filter(r => !r.pork).length >= 70);
  for (const k in L.ING) assert.ok(L.ING[k].price > 0 && L.ING[k].p > 0, k);
  // les crevettes portent l'allergène crustacés
  assert.ok(L.recOf('crevettespates~patescrev').al.includes('crustaces'));
});

test('import : lecture d’une ligne d’ingrédient (quantités, unités, fractions)', () => {
  const p = (s) => L.parseIngLine(s);
  assert.deepEqual([p('200 g de farine').id, p('200 g de farine').amt], ['farine', 200]);
  assert.equal(p('2 c. à soupe d’huile d’olive').amt, 30);
  assert.equal(p('1 cuillère à café de curry').amt, 2.5);
  assert.equal(p('1,5 kg de pommes de terre').amt, 1500);
  assert.equal(p('3 gousses d’ail').amt, 3);
  assert.equal(p('1/2 oignon').amt, 55);
  assert.equal(p('1 ½ oignon').amt, 165);
  assert.equal(p('2 à 3 courgettes').amt, 625);
  assert.equal(p('4 tranches de jambon').amt, 180);
  assert.equal(p('1 boîte de tomates concassées').id, 'tomconc');
  assert.equal(p('1 boîte (400 g) de lentilles').amt, 400);
  assert.equal(p('50 cl de crème fraîche').id, 'creme');
  assert.equal(p('1 verre de lait').amt, 200);
  assert.equal(p('6 œufs').amt, 6);
  assert.equal(p('1 noix de beurre').amt, 12);
  assert.equal(p('une demi-gousse d’ail').amt, 0.5);
  assert.equal(p('Sel, poivre').id, 'ign');
  assert.equal(p('1 pincée de sel').id, 'ign');
  assert.equal(p('cuisses de poulet').id, 'cuisse');
  assert.equal(p('filets de poulet').id, 'poulet');
  assert.equal(p('pâte feuilletée').id, 'feuillet');
  assert.equal(p('lait de coco').id, 'laitcoco');
  assert.equal(p('concentré de tomate').id, 'concentre');
  assert.equal(p('Ingrédients :'), null);
  const inconnu = p('250 g de burrata');
  assert.equal(inconnu.id, null);
  assert.equal(inconnu.name, 'Burrata');
  assert.equal(L.parseIngLine('Persil').amt, 0.25);
});

test('import : texte libre avec en-têtes, durées et nombre de personnes', () => {
  const raw = L.parseRecipeInput(`Gratin dauphinois facile
Préparation : 20 min  Cuisson : 1 h 10
Pour 6 personnes
Ingrédients
1,2 kg de pommes de terre
50 cl de crème liquide
2 gousses d'ail
Sel, poivre
Préparation
1. Éplucher les pommes de terre et les couper en rondelles.
2. Verser la crème, enfourner 1 h à 160 °C.`)[0];
  assert.equal(raw.name, 'Gratin dauphinois facile');
  assert.equal(raw.serves, 6);
  assert.equal(raw.min, 90);
  assert.equal(raw.lines.length, 4);
  assert.equal(raw.steps.length, 2);
  assert.ok(!/^1\./.test(raw.steps[0]));
});

test('import : texte sans en-têtes', () => {
  const raw = L.parseRecipeInput(`Poulet au curry
400 g de blanc de poulet
1 boîte de lait de coco
2 oignons
Couper le poulet en morceaux et le faire dorer avec les oignons émincés.
Ajouter le lait de coco et laisser mijoter 20 minutes.`)[0];
  assert.equal(raw.lines.length, 3);
  assert.equal(raw.steps.length, 2);
  assert.equal(raw.name, 'Poulet au curry');
});

test('import : fiche de site (JSON-LD), marque-page et lot JSON', () => {
  const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': ['Recipe'], name: 'Tarte &amp; courgettes', image: ['https://x.test/a.jpg'], recipeYield: ['4', '4 personnes'], totalTime: 'PT1H15M',
    recipeIngredient: ['1 pâte brisée', '3 courgettes', '200 g de ricotta'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Préchauffer le four.' }, { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Étaler la pâte.' }] }] }] };
  const page = '<html><script type="application/ld+json">' + JSON.stringify(ld) + '</script></html>';
  let r = L.parseRecipeInput(page)[0];
  assert.deepEqual([r.name, r.serves, r.min, r.img, r.steps.length, r.lines.length], ['Tarte & courgettes', 4, 75, 'https://x.test/a.jpg', 2, 3]);
  r = L.parseRecipeInput('TMRECIPE:' + JSON.stringify({ u: 'https://site.test/r', t: 'x', ld: [JSON.stringify(ld)] }))[0];
  assert.equal(r.src, 'https://site.test/r');
  const lot = L.parseRecipeInput(JSON.stringify({ recipes: [{ n: 'A', ing: ['200 g de pâtes'], steps: ['Cuire'] }, { n: 'B', ing: ['4 œufs'], steps: ['Battre'] }, { n: 'sans ingrédients' }] }));
  assert.equal(lot.length, 2);
  assert.deepEqual(L.parseRecipeInput('texte sans recette'), []);
  assert.deepEqual(L.parseRecipeInput('TMRECIPE:pas du json'), []);
});

test('recettes perso : enregistrement, prix, menus, modification, suppression', () => {
  const st = fresh();
  const draft = L.buildDraft(L.parseRecipeInput('Gratin test\nPour 4 personnes\nIngrédients\n800 g de pommes de terre\n250 g de burrata\n2 navets\nPréparation\nCuire tout ensemble pendant une heure.\nServir chaud.')[0]);
  assert.equal(draft.serves, 4);
  const rec = L.saveCustom(st, draft);
  assert.ok(rec && rec.id.startsWith('u_') && L.R.find(r => r.id === rec.id));
  assert.equal(rec.ing.pdt, 200);
  assert.equal(Object.keys(st.custom.ings).length, 2);
  const mascar = Object.values(st.custom.ings).find(i => i.n === 'Burrata');
  assert.ok(mascar.est && mascar.price > 0 && mascar.a === 3, 'rayon frais deviné');
  assert.ok(L.ING[mascar.id], 'ingrédient créé disponible pour les prix');
  assert.ok(L.buildLines([rec.id], st).some(l => l.id === mascar.id && l.cost > 0));
  // rechargement depuis l'état seul
  const st2 = JSON.parse(JSON.stringify(st)); L.applyCustom(L.newState()); assert.ok(!L.R.find(r => r.id === rec.id));
  L.applyCustom(st2); assert.ok(L.R.find(r => r.id === rec.id));
  // modification
  const d2 = L.draftFromRecipe(L.R.find(r => r.id === rec.id)); d2.name = 'Gratin renommé'; L.saveCustom(st2, d2);
  assert.equal(st2.custom.recipes.length, 1); assert.equal(L.R.find(r => r.id === rec.id).n, 'Gratin renommé');
  // elle entre dans les menus, puis suppression propre
  st2.plan.meals = [{ rid: rec.id, locked: true, done: false }];
  L.deleteCustom(st2, rec.id);
  assert.equal(L.R.length, L.BASE_R); assert.equal(Object.keys(st2.custom.ings).length, 0); assert.ok(st2.plan.meals.every(m => m.rid !== rec.id));
});

test('favoris : reviennent plus souvent dans les menus', () => {
  const st = fresh({ days: [0, 1, 2, 3, 4], budget: 300 });
  const target = 'kebab'; st.fav = [target];
  let hits = 0;
  for (let i = 0; i < 150; i++) { st.plan.meals = []; L.regen(st); if (st.plan.meals.some(m => m.rid === target)) hits++; }
  const base = fresh({ days: [0, 1, 2, 3, 4], budget: 300 }); let h0 = 0;
  for (let i = 0; i < 150; i++) { base.plan.meals = []; L.regen(base); if (base.plan.meals.some(m => m.rid === target)) h0++; }
  assert.ok(hits > h0, 'favori ' + hits + ' fois contre ' + h0);
});

test('étapes détaillées : quantités du foyer, jetons valides, niveau de détail', () => {
  for (const r of L.R.slice(0, L.BASE_R)) {
    const t = r.steps.join(' ');
    assert.ok(r.steps.length >= 4, r.id + ' : au moins 4 étapes');
    assert.ok(t.length >= 280, r.id + ' : étapes trop courtes');
    for (const m of t.matchAll(/\{([a-z0-9]+)\}/g)) assert.ok(m[1] in r.ing, r.id + ' : jeton inconnu ' + m[1]);
    assert.ok(!/\{/.test(L.stepTxt(r, t, 3)), r.id + ' : jeton non remplacé');
  }
  const c = L.R.find(r => r.id === 'curry');
  assert.match(L.stepTxt(c, c.steps[0], 4), /520 g de poulet/);
  assert.match(L.stepTxt(c, '{oignon}', 2), /^100 g$/);
  assert.equal(L.qStep(0.5, 'oeufs'), '½'); assert.equal(L.qStep(1.5, 'oeufs'), '1½'); assert.equal(L.qStep(3, 'oeufs'), '3');
  assert.equal(L.stepMins('Cuire 12 min à feu doux'), 12); assert.equal(L.stepMins('Rien'), 0);
});

test('matériel : air fryer, micro-ondes, multicuiseur filtrent les recettes', () => {
  const eids = (s) => new Set(okFor(Object.assign({ maxMin: 120 }, s)).map(r => r.id));
  const base = eids({ four: true, airfryer: false, micro: true, multi: false });
  assert.ok(base.has('lasagnes') && base.has('colincitron'));
  assert.ok(![...base].some(id => /~(afcuisse|multichili|afboulettes)$/.test(id)), 'versions air fryer et multicuiseur non imposées sans appareil');
  const af = eids({ four: false, airfryer: true, micro: false, multi: true });
  assert.ok(af.has('cuisses') && af.has('naanjambon'), 'les recettes du four compatibles passent à l’air fryer');
  assert.ok(!af.has('lasagnes'), 'gratin sans four absent');
  const none = eids({ four: false, airfryer: false, micro: false, multi: false });
  assert.ok(![...none].some(id => { const r = L.recOf(id); return r.four || r.air || r.micro || r.multi; }));
  const all = Object.values(L.VMAP);
  assert.ok(all.filter(r => r.air).length >= 8 && all.filter(r => r.multi).length >= 4 && all.filter(r => r.micro).length >= 2);
  assert.ok(L.R.filter(r => r.af).length >= 25);
});

test('variantes : une fiche, plusieurs versions (accompagnement, appareil)', () => {
  const b = L.recOf('boulettes');
  assert.equal(b.vars.length, 2);
  assert.deepEqual(b.vars.map(v => v.id), ['boulettes~boeuftomate', 'boulettes~afboulettes']);
  const riz = L.recOf('boulettes~boeuftomate');
  assert.match(riz.n, /riz/); assert.ok('riz' in riz.ing && !('semoule' in riz.ing) && 'semoule' in b.ing);
  // chaque variante : ingrédients connus, étapes avec jetons valides, lien éventuel bien formé
  for (const r of Object.values(L.VMAP)) {
    for (const k in r.ing) assert.ok(L.ING[k], r.id + ' ' + k);
    assert.ok(r.steps.length >= 4, r.id);
    for (const m of r.steps.join(' ').matchAll(/\{([a-z0-9]+)\}/g)) assert.ok(m[1] in r.ing, r.id + ' jeton ' + m[1]);
    assert.ok(!/\{/.test(L.stepTxt(r, r.steps[2], 3)), r.id);
    assert.ok(L.recOf(r.base).vars.includes(r));
  }
  // la liste de courses suit la variante choisie
  const st = fresh();
  const semoule = L.buildLines(['boulettes'], st).map(l => l.id), rizL = L.buildLines(['boulettes~boeuftomate'], st).map(l => l.id);
  assert.ok(semoule.includes('semoule') && !semoule.includes('riz') && rizL.includes('riz') && !rizL.includes('semoule'));
});

test('anciens identifiants : menu, favoris et récents suivent la fusion des doublons', () => {
  const st = fresh({});
  st.plan.meals = [{ rid: 'boeuftomate', locked: true, done: false }, { rid: 'steakfrites', locked: false, done: false }, { rid: 'tartiflexp', locked: false, done: false }];
  st.fav = ['boeuftomate', 'boulettes', 'steakfrites']; st.recent = ['afcuisse', 'cuisses'];
  L.migrateIds(st);
  assert.deepEqual(st.plan.meals.map(m => m.rid), ['boulettes~boeuftomate', 'steak', 'tartiflette~tartiflexp']);
  assert.deepEqual(st.fav, ['boulettes', 'steak']); assert.deepEqual(st.recent, ['cuisses']);
  for (const [old, now] of Object.entries(L.ALIAS)) assert.ok(L.recOf(now), old + ' → ' + now);
});

test('menu équilibré : poisson et végé présents, pas plus de 2 poulet/bœuf/porc (7 dîners)', () => {
  for (let i = 0; i < 15; i++) {
    const st = fresh();
    const ids = L.pickMenu(st);
    const g = ids.map(id => L.recOf(id).g);
    if (g.length < 4) continue;
    assert.ok(g.includes('poisson'), g.join());
    assert.ok(g.includes('veg'), g.join());
    for (const f of ['poulet', 'boeuf', 'porc']) assert.ok(g.filter(x => x === f).length <= 2, f + ' ' + g.join());
  }
});

test('sources : chaque lien HelloFresh est bien formé et pointe vers une recette existante', () => {
  const src = require('../scripts/sources.json');
  const ids = new Set(L.R.map(r => r.id));
  for (const [id, s] of Object.entries(src)) {
    assert.ok(ids.has(id), id);
    assert.match(s.u, /^https:\/\/www\.hellofresh\.fr\/recipes\/[a-z0-9-]+$/);
    assert.ok(s.t.length > 3);
  }
  for (const r of Object.values(L.VMAP)) if (r.srcT) assert.match(r.src, /^https:\/\/www\.hellofresh\.fr\/recipes\/[a-z0-9-]+$/);
  assert.ok(L.R.filter(r => r.src).length === Object.keys(src).length);
});
