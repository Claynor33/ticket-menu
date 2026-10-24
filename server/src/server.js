'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');
const { createAuth, httpError, SESSION_MS } = require('./auth');
const { createPrices, loadRef } = require('./prices');

const MAX_BODY = 1024 * 1024;
const MAX_STATE = 768 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function createApp(opts) {
  opts = opts || {};
  const db = openDb(opts.dbPath || ':memory:');
  const auth = createAuth(db);
  const ref = opts.ref || loadRef();
  const prices = createPrices(db, ref);
  const publicDir = opts.publicDir || path.join(__dirname, '..', 'public');
  const secureCookie = !!opts.secureCookie;
  const stateQ = {
    get: db.prepare('SELECT json, updated_at FROM states WHERE user_id = ?'),
    put: db.prepare('INSERT INTO states (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
  };
  const hits = new Map(); // limitation simple du débit par adresse
  function limited(ip, key, max, windowMs) {
    const now = Date.now(), k = key + '|' + ip, e = hits.get(k);
    if (!e || now - e.t > windowMs) { hits.set(k, { t: now, n: 1 }); return false; }
    e.n++; return e.n > max;
  }
  setInterval(() => { const now = Date.now(); for (const [k, e] of hits) if (now - e.t > 3600e3) hits.delete(k); }, 600e3).unref();

  const send = (res, status, body, headers) => {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({
      'content-type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    }, headers || {}));
    res.end(data);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0, over = false; const chunks = [];
    req.on('data', (c) => {
      if (over) return; // on vide le flux sans le garder pour pouvoir répondre proprement
      size += c.length;
      if (size > MAX_BODY) { over = true; chunks.length = 0; reject(httpError(413, 'Requête trop volumineuse.')); } else chunks.push(c);
    });
    req.on('end', () => {
      if (over) return;
      if (!chunks.length) return resolve({});
      try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' ? j : {}); }
      catch (e) { reject(httpError(400, 'JSON invalide.')); }
    });
    req.on('error', reject);
  });
  const cookieToken = (req) => { const m = /(?:^|;\s*)tm_session=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m ? m[1] : null; };
  const setCookie = (token, maxAgeS) => 'tm_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAgeS + (secureCookie ? '; Secure' : '');
  const ipOf = (req) => (opts.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';

  async function api(req, res, url) {
    const ip = ipOf(req), p = url.pathname, m = req.method;
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/prices' && m === 'GET') return send(res, 200, prices.aggregate(), { 'cache-control': 'public, max-age=300' });
    const token = cookieToken(req), user = auth.userFromToken(token);
    if (p === '/api/auth/register' || p === '/api/auth/login') {
      if (m !== 'POST') throw httpError(405, 'Méthode non autorisée.');
      if (limited(ip, 'auth', opts.authLimit || 10, 60e3)) throw httpError(429, 'Trop de tentatives, réessaie dans une minute.');
      const b = await readBody(req);
      const r = p.endsWith('register') ? auth.register(b.email, b.password) : auth.login(b.email, b.password);
      return send(res, 200, { user: r.user }, { 'set-cookie': setCookie(r.token, SESSION_MS / 1000) });
    }
    if (p === '/api/auth/logout' && m === 'POST') { auth.logout(token); return send(res, 200, { ok: true }, { 'set-cookie': setCookie('', 0) }); }
    if (p === '/api/me' && m === 'GET') { if (!user) throw httpError(401, 'Non connecté.'); return send(res, 200, { user }); }
    if (!user) throw httpError(401, 'Non connecté.');
    if (p === '/api/state') {
      if (m === 'GET') {
        const row = stateQ.get.get(user.id);
        return send(res, 200, row ? { state: JSON.parse(row.json), updatedAt: row.updated_at } : { state: null, updatedAt: 0 }, { 'cache-control': 'no-store' });
      }
      if (m === 'PUT') {
        if (limited(ip, 'state', opts.stateLimit || 120, 60e3)) throw httpError(429, 'Trop de requêtes.');
        const b = await readBody(req), s = b.state;
        if (!s || typeof s !== 'object' || s.v !== 2 || !Number.isFinite(s.updatedAt)) throw httpError(400, 'État invalide.');
        const json = JSON.stringify(s);
        if (Buffer.byteLength(json) > MAX_STATE) throw httpError(413, 'État trop volumineux.');
        const row = stateQ.get.get(user.id);
        if (row && row.updated_at > s.updatedAt) { const e = httpError(409, 'Une version plus récente existe.'); e.extra = { state: JSON.parse(row.json), updatedAt: row.updated_at }; throw e; }
        stateQ.put.run(user.id, json, s.updatedAt);
        return send(res, 200, { ok: true, updatedAt: s.updatedAt });
      }
    }
    if (p === '/api/prices/report' && m === 'POST') {
      if (limited(ip, 'report', opts.reportLimit || 60, 60e3)) throw httpError(429, 'Trop de requêtes.');
      const b = await readBody(req);
      if (!prices.report(String(b.store), String(b.ingredient), b.price, 'u' + user.id, 'user')) throw httpError(400, 'Prix refusé : valeur ou article invalide.');
      return send(res, 200, { ok: true });
    }
    throw httpError(404, 'Introuvable.');
  }
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée.');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep) && file !== publicDir) return send(res, 404, 'Introuvable.');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Introuvable.');
      const ext = path.extname(file);
      const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=86400';
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache,
        'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, Object.assign({ error: status === 500 ? 'Erreur interne.' : e.message }, e.extra || {}), status === 413 ? { connection: 'close' } : undefined);
    }
  });
  return { server, db, auth, prices, close() { server.close(); db.close(); } };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ticketmenu.db');
  const app = createApp({ dbPath, secureCookie: process.env.COOKIE_SECURE === '1', trustProxy: process.env.TRUST_PROXY === '1' });
  app.server.listen(port, () => console.log('Ticket Menu : http://localhost:' + port + ' (base : ' + dbPath + ')'));
  const stop = () => { app.close(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = { createApp };
