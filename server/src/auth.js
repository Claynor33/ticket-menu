'use strict';
const crypto = require('node:crypto');

const SESSION_MS = 30 * 24 * 3600 * 1000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validEmail = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

function createAuth(db) {
  const q = {
    insertUser: db.prepare('INSERT INTO users (email, salt, hash, created_at) VALUES (?, ?, ?, ?)'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  };
  function newSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    q.purge.run(Date.now());
    q.insertSession.run(sha256(token), userId, Date.now() + SESSION_MS);
    return token;
  }
  return {
    register(email, password) {
      email = String(email || '').trim().toLowerCase();
      if (!validEmail(email)) throw httpError(400, 'Adresse e-mail invalide.');
      if (!validPassword(password)) throw httpError(400, 'Mot de passe : 8 caractères minimum.');
      if (q.userByEmail.get(email)) throw httpError(409, 'Un compte existe déjà avec cette adresse.');
      const { salt, hash } = hashPassword(password);
      const r = q.insertUser.run(email, salt, hash, Date.now());
      const id = Number(r.lastInsertRowid);
      return { user: { id, email }, token: newSession(id) };
    },
    login(email, password) {
      email = String(email || '').trim().toLowerCase();
      const u = q.userByEmail.get(email);
      // Même durée de calcul que l'utilisateur existe ou non, même message d'erreur.
      const ok = u ? verifyPassword(String(password || ''), u.salt, u.hash) : (hashPassword('x', '00'.repeat(16)), false);
      if (!ok) throw httpError(401, 'E-mail ou mot de passe incorrect.');
      return { user: { id: u.id, email: u.email }, token: newSession(u.id) };
    },
    userFromToken(token) {
      if (!token) return null;
      return q.sessionUser.get(sha256(token), Date.now()) || null;
    },
    logout(token) { if (token) q.deleteSession.run(sha256(token)); }
  };
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
module.exports = { createAuth, httpError, SESSION_MS };
