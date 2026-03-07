/**
 * Database connection, migration, and schema setup.
 * All other db modules import the shared `db` instance from here.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';

// Data directory: prefer ~/.codesession, migrate from legacy ~/.devsession
const NEW_DB_DIR = join(homedir(), '.codesession');
const LEGACY_DB_DIR = join(homedir(), '.devsession');

// Auto-migrate: if legacy dir exists but new doesn't, copy DB over (atomic-ish: copy -> verify -> use)
if (existsSync(LEGACY_DB_DIR) && !existsSync(NEW_DB_DIR)) {
  mkdirSync(NEW_DB_DIR, { recursive: true });
  const legacyDb = join(LEGACY_DB_DIR, 'sessions.db');
  const newDb = join(NEW_DB_DIR, 'sessions.db');
  if (existsSync(legacyDb)) {
    copyFileSync(legacyDb, newDb);
    // Verify the copied DB opens correctly
    try {
      const testDb = new Database(newDb);
      testDb.pragma('integrity_check');
      testDb.close();
    } catch (_) {
      // Corrupted copy — remove and start fresh
      try { unlinkSync(newDb); } catch (_) {}
    }
    // Also copy pricing.json if present
    const legacyPricing = join(LEGACY_DB_DIR, 'pricing.json');
    if (existsSync(legacyPricing)) {
      copyFileSync(legacyPricing, join(NEW_DB_DIR, 'pricing.json'));
    }
    // Inform user (stderr so it doesn't break --json stdout)
    process.stderr.write(`[codesession] Migrated data from ${LEGACY_DB_DIR} -> ${NEW_DB_DIR} (old files preserved -- delete manually if desired)\n`);
  }
}

export const DB_DIR = NEW_DB_DIR;
const DB_PATH = process.env.CODESESSION_DB_PATH ?? join(DB_DIR, 'sessions.db');

// Ensure the directory for the chosen DB path exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db: InstanceType<typeof Database> = new Database(DB_PATH);

// Enable WAL mode + busy timeout for concurrent access safety
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// ── Schema ──────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration INTEGER,
    working_directory TEXT NOT NULL,
    git_root TEXT,
    start_git_head TEXT,
    files_changed INTEGER DEFAULT 0,
    commits INTEGER DEFAULT 0,
    ai_cost REAL DEFAULT 0,
    ai_tokens INTEGER DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'active'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    hash TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost REAL NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

// Migration: add granular token columns if missing
try {
  db.exec('ALTER TABLE ai_usage ADD COLUMN prompt_tokens INTEGER');
} catch (_) { /* column already exists */ }
try {
  db.exec('ALTER TABLE ai_usage ADD COLUMN completion_tokens INTEGER');
} catch (_) { /* column already exists */ }
try {
  db.exec('ALTER TABLE ai_usage ADD COLUMN agent_name TEXT');
} catch (_) { /* column already exists */ }

// Migration: add git_root and start_git_head columns if missing
try {
  db.exec('ALTER TABLE sessions ADD COLUMN git_root TEXT');
} catch (_) { /* column already exists */ }
try {
  db.exec('ALTER TABLE sessions ADD COLUMN start_git_head TEXT');
} catch (_) { /* column already exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS session_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS today_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT,
    added_at TEXT NOT NULL
  )
`);

export { db };
