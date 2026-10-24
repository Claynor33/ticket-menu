const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createApp } = require('../src/server');
const { createPrices, loadRef, plausible } = require('../src/prices');

let app, base;
before(async () => {
  app = createApp({ dbPath: ':memory:', authLimit: 1000 });
  await new Promise(r => app.server.listen(0, r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
after(() => app.close());

async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, headers: r.headers };
}
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
async function signup(email) {
  const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1' });
  assert.equal(r.status, 200); return cookieOf(r);
}
const state = (updatedAt, extra) => Object.assign({ v: 2, onboarded: true, updatedAt, s: { budget: 50 }, plan: { meals: [] }, pantry: {}, ov: {}, hist: [], recent: [] }, extra || {});

test('santé et page servie avec le marqueur serveur', async () => {
  assert.deepEqual((await call('GET', '/api/health')).json, { ok: true });
  const page = await call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /name="tm-server"/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await call('GET', '/manifest.webmanifest')).status, 200);
  assert.equal((await call('GET', '/sw.js')).status, 200);
});

test('fichiers hors du dossier public refusés', async () => {
  assert.equal((await call('GET', '/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await call('GET', '/%2e%2e/src/server.js')).status, 404);
});

test('inscription, connexion, session, déconnexion', async () => {
  const bad = await call('POST', '/api/auth/register', { email: 'pas-un-mail', password: 'motdepasse1' });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/auth/register', { email: 'a@b.fr', password: 'court' })).status, 400);
  const reg = await call('POST', '/api/auth/register', { email: 'Alice@Exemple.fr', password: 'motdepasse1' });
  assert.equal(reg.status, 200);
  assert.equal(reg.json.user.email, 'alice@exemple.fr');
  assert.match(reg.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const ck = cookieOf(reg);
  assert.equal((await call('GET', '/api/me', undefined, ck)).json.user.email, 'alice@exemple.fr');
  assert.equal((await call('GET', '/api/me')).status, 401);
  assert.equal((await call('POST', '/api/auth/register', { email: 'alice@exemple.fr', password: 'motdepasse1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { email: 'alice@exemple.fr', password: 'mauvais-mdp' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'inconnu@exemple.fr', password: 'motdepasse1' })).status, 401);
  const login = await call('POST', '/api/auth/login', { email: 'alice@exemple.fr', password: 'motdepasse1' });
  assert.equal(login.status, 200);
  const ck2 = cookieOf(login);
  await call('POST', '/api/auth/logout', {}, ck2);
  assert.equal((await call('GET', '/api/me', undefined, ck2)).status, 401);
  assert.equal((await call('GET', '/api/me', undefined, ck)).status, 200); // l'autre session reste valide
});

test('le mot de passe n’est jamais stocké en clair', () => {
  const rows = app.db.prepare('SELECT * FROM users').all();
  assert.ok(rows.length > 0);
  for (const u of rows) { assert.ok(!JSON.stringify(u).includes('motdepasse1')); assert.equal(u.hash.length, 128); }
});

test('synchro de l’état : écriture, lecture, isolement entre comptes, conflit', async () => {
  const a = await signup('sync-a@exemple.fr'), b = await signup('sync-b@exemple.fr');
  assert.deepEqual((await call('GET', '/api/state', undefined, a)).json, { state: null, updatedAt: 0 });
  assert.equal((await call('PUT', '/api/state', { state: state(1000, { s: { budget: 77 } }) }, a)).status, 200);
  const got = await call('GET', '/api/state', undefined, a);
  assert.equal(got.json.state.s.budget, 77);
  assert.equal((await call('GET', '/api/state', undefined, b)).json.state, null);
  const old = await call('PUT', '/api/state', { state: state(500) }, a);
  assert.equal(old.status, 409);
  assert.equal(old.json.state.s.budget, 77);
  assert.equal((await call('PUT', '/api/state', { state: state(2000) }, a)).status, 200);
  assert.equal((await call('PUT', '/api/state', { state: { v: 1 } }, a)).status, 400);
  assert.equal((await call('GET', '/api/state')).status, 401);
  assert.equal((await call('PUT', '/api/state', { state: state(3000) })).status, 401);
});

test('limites de taille', async () => {
  const a = await signup('gros@exemple.fr');
  const big = state(1, { pantry: { x: 'y'.repeat(800 * 1024) } });
  assert.equal((await call('PUT', '/api/state', { state: big }, a)).status, 413);
  const huge = await call('PUT', '/api/state', { state: state(1, { pantry: { x: 'y'.repeat(1200 * 1024) } }) }, a);
  assert.equal(huge.status, 413);
});

test('prix communautaires : 2 personnes minimum, médiane, valeurs absurdes refusées', async () => {
  const a = await signup('p1@exemple.fr'), b = await signup('p2@exemple.fr'), c = await signup('p3@exemple.fr');
  const rep = (ck, price) => call('POST', '/api/prices/report', { store: 'lidl', ingredient: 'pates', price }, ck);
  assert.equal((await rep(a, 1.1)).status, 200);
  assert.equal((await call('GET', '/api/prices')).json.prices.lidl?.pates, undefined);
  assert.equal((await rep(b, 1.3)).status, 200);
  assert.equal((await call('GET', '/api/prices')).json.prices.lidl.pates, 1.2);
  assert.equal((await rep(c, 1.5)).status, 200);
  assert.equal((await call('GET', '/api/prices')).json.prices.lidl.pates, 1.3);
  assert.equal((await rep(a, 1.5)).status, 200); // un utilisateur remplace son relevé, il ne compte qu'une fois
  assert.equal((await call('GET', '/api/prices')).json.counts.lidl.pates, 3);
  assert.equal((await rep(a, 99)).status, 400);
  assert.equal((await rep(a, 0.01)).status, 400);
  assert.equal((await call('POST', '/api/prices/report', { store: 'inconnue', ingredient: 'pates', price: 1 }, a)).status, 400);
  assert.equal((await call('POST', '/api/prices/report', { store: 'lidl', ingredient: 'nimporte', price: 1 }, a)).status, 400);
  assert.equal((await call('POST', '/api/prices/report', { store: 'lidl', ingredient: 'pates', price: 1 })).status, 401);
});

test('import contrôlé : prioritaire sur les relevés d’utilisateurs', async () => {
  const p = createPrices(app.db, loadRef());
  assert.equal(p.report('aldi', 'riz', 1.89, 'import', 'import'), true);
  assert.equal((await call('GET', '/api/prices')).json.prices.aldi.riz, 1.89);
  assert.equal(p.report('aldi', 'riz', 50, 'import', 'import'), false);
});

test('vraisemblance : bornes autour de l’estimation', () => {
  const ref = loadRef();
  assert.equal(plausible(ref, 'lidl', 'pates', 1.1), true);
  assert.equal(plausible(ref, 'lidl', 'pates', 10), false);
  assert.equal(plausible(ref, 'lidl', 'pates', NaN), false);
  assert.equal(plausible(ref, 'xx', 'pates', 1), false);
});

test('limitation du débit des connexions', async () => {
  const lim = createApp({ dbPath: ':memory:', authLimit: 3 });
  await new Promise(r => lim.server.listen(0, r));
  const u = 'http://127.0.0.1:' + lim.server.address().port + '/api/auth/login';
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.fr', password: 'abcdefgh' }) })).status);
  lim.close();
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});

test('JSON invalide et routes inconnues', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{pas du json' });
  assert.equal(r.status, 400);
  assert.equal((await call('GET', '/api/inconnue', undefined, await signup('z@exemple.fr'))).status, 404);
});

test('persistance sur disque : les comptes survivent à un redémarrage', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-')), 'test.db');
  const a1 = createApp({ dbPath: f });
  a1.auth.register('persist@exemple.fr', 'motdepasse1');
  a1.close();
  const a2 = createApp({ dbPath: f });
  assert.equal(a2.auth.login('persist@exemple.fr', 'motdepasse1').user.email, 'persist@exemple.fr');
  a2.close();
});
