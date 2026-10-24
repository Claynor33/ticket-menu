'use strict';
// SQLite embarqué (module node:sqlite, Node 22.5 ou plus). Aucune dépendance à installer.
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_reports (
      store TEXT NOT NULL,
      ingredient TEXT NOT NULL,
      reporter TEXT NOT NULL,           -- 'u<id>' pour un utilisateur, 'import' pour un import contrôlé
      source TEXT NOT NULL,             -- 'user' | 'import'
      price REAL NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (store, ingredient, reporter)
    );
  `);
  return db;
}
module.exports = { openDb };
