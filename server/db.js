const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// DB file lives in <project root>/data/labour.db
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'labour.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS labours (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    phone        TEXT    DEFAULT '',
    role         TEXT    DEFAULT '',
    join_date    TEXT    NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    wage_full    REAL    NOT NULL DEFAULT 0,
    wage_half    REAL    NOT NULL DEFAULT 0,
    wage_quarter REAL    NOT NULL DEFAULT 0,
    notes        TEXT    DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    labour_id   INTEGER NOT NULL REFERENCES labours(id) ON DELETE CASCADE,
    date        TEXT    NOT NULL,
    base        REAL    NOT NULL DEFAULT 0,
    extra       REAL    NOT NULL DEFAULT 0,
    days_worked REAL    NOT NULL DEFAULT 0,
    amount      REAL    NOT NULL DEFAULT 0,
    note        TEXT    DEFAULT '',
    UNIQUE(labour_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date  ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_labour ON attendance(labour_id);
`);

module.exports = db;
