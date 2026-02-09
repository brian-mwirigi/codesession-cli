import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { Session, FileChange, Commit, AIUsage, SessionStats, SessionNote } from './types';

// Data directory: prefer ~/.codesession, migrate from legacy ~/.devsession
const NEW_DB_DIR = join(homedir(), '.codesession');
const LEGACY_DB_DIR = join(homedir(), '.devsession');

// Auto-migrate: if legacy dir exists but new doesn't, copy DB over
if (existsSync(LEGACY_DB_DIR) && !existsSync(NEW_DB_DIR)) {
  mkdirSync(NEW_DB_DIR, { recursive: true });
  const legacyDb = join(LEGACY_DB_DIR, 'sessions.db');
  if (existsSync(legacyDb)) {
    copyFileSync(legacyDb, join(NEW_DB_DIR, 'sessions.db'));
    // Also copy pricing.json if present
    const legacyPricing = join(LEGACY_DB_DIR, 'pricing.json');
    if (existsSync(legacyPricing)) {
      copyFileSync(legacyPricing, join(NEW_DB_DIR, 'pricing.json'));
    }
  }
}

const DB_DIR = NEW_DB_DIR;
const DB_PATH = join(DB_DIR, 'sessions.db');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode + busy timeout for concurrent access safety
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration INTEGER,
    working_directory TEXT NOT NULL,
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

db.exec(`
  CREATE TABLE IF NOT EXISTS session_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

export function createSession(session: Omit<Session, 'id'>): number {
  const stmt = db.prepare(`
    INSERT INTO sessions (name, start_time, working_directory, status)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(session.name, session.startTime, session.workingDirectory, 'active');
  return result.lastInsertRowid as number;
}

export function getActiveSession(): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY id DESC LIMIT 1');
  const row = stmt.get('active') as any;
  if (!row) return null;
  return mapSession(row);
}

export function getActiveSessions(): Session[] {
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY id DESC');
  const rows = stmt.all('active') as any[];
  return rows.map(mapSession);
}

export function getActiveSessionForDir(dir: string): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? AND working_directory = ? ORDER BY id DESC LIMIT 1');
  const row = stmt.get('active', dir) as any;
  if (!row) return null;
  return mapSession(row);
}

export function endSession(sessionId: number, endTime: string, notes?: string): void {
  const session = getSession(sessionId);
  if (!session) return;

  const duration = Math.floor((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);

  const stmt = db.prepare(`
    UPDATE sessions 
    SET end_time = ?, duration = ?, status = ?, notes = ?
    WHERE id = ?
  `);
  stmt.run(endTime, duration, 'completed', notes || null, sessionId);
}

export function getSession(sessionId: number): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(sessionId) as any;
  return row ? mapSession(row) : null;
}

export function getSessions(limit = 10): Session[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?');
  const rows = stmt.all(limit) as any[];
  return rows.map(mapSession);
}

export function addFileChange(change: Omit<FileChange, 'id'>): void {
  const stmt = db.prepare(`
    INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(change.sessionId, change.filePath, change.changeType, change.timestamp);

  // Update session files count
  const countStmt = db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM file_changes WHERE session_id = ?');
  const result = countStmt.get(change.sessionId) as any;
  
  const updateStmt = db.prepare('UPDATE sessions SET files_changed = ? WHERE id = ?');
  updateStmt.run(result.count, change.sessionId);
}

export function addCommit(commit: Omit<Commit, 'id'>): void {
  const stmt = db.prepare(`
    INSERT INTO commits (session_id, hash, message, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(commit.sessionId, commit.hash, commit.message, commit.timestamp);

  // Update session commits count
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM commits WHERE session_id = ?');
  const result = countStmt.get(commit.sessionId) as any;
  
  const updateStmt = db.prepare('UPDATE sessions SET commits = ? WHERE id = ?');
  updateStmt.run(result.count, commit.sessionId);
}

export function addAIUsage(usage: Omit<AIUsage, 'id'>): void {
  const stmt = db.prepare(`
    INSERT INTO ai_usage (session_id, provider, model, tokens, prompt_tokens, completion_tokens, cost, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(usage.sessionId, usage.provider, usage.model, usage.tokens, usage.promptTokens || null, usage.completionTokens || null, usage.cost, usage.timestamp);

  // Update session AI totals
  const sumStmt = db.prepare(`
    SELECT SUM(cost) as total_cost, SUM(tokens) as total_tokens 
    FROM ai_usage WHERE session_id = ?
  `);
  const result = sumStmt.get(usage.sessionId) as any;
  
  const updateStmt = db.prepare('UPDATE sessions SET ai_cost = ?, ai_tokens = ? WHERE id = ?');
  // Round to 10 decimal places to prevent floating-point accumulation drift
  const roundedCost = Math.round((result.total_cost || 0) * 1e10) / 1e10;
  updateStmt.run(roundedCost, result.total_tokens || 0, usage.sessionId);
}

export function getFileChanges(sessionId: number): FileChange[] {
  const stmt = db.prepare('SELECT * FROM file_changes WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as any[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    changeType: row.change_type,
    timestamp: row.timestamp,
  }));
}

export function getCommits(sessionId: number): Commit[] {
  const stmt = db.prepare('SELECT * FROM commits WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as any[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    hash: row.hash,
    message: row.message,
    timestamp: row.timestamp,
  }));
}

export function getAIUsage(sessionId: number): AIUsage[] {
  const stmt = db.prepare('SELECT * FROM ai_usage WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as any[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    model: row.model,
    tokens: row.tokens,
    promptTokens: row.prompt_tokens || undefined,
    completionTokens: row.completion_tokens || undefined,
    cost: row.cost,
    timestamp: row.timestamp,
  }));
}

export function exportSessions(format: 'json' | 'csv', limit?: number): string {
  const sessions = getSessions(limit || 999999);

  if (format === 'json') {
    const full = sessions.map((s) => {
      const aiUsage = getAIUsage(s.id!);
      const files = getFileChanges(s.id!);
      const commits = getCommits(s.id!);
      return { ...s, aiUsage, files, commits };
    });
    return JSON.stringify(full, null, 2);
  }

  // CSV
  const header = 'id,name,status,startTime,endTime,duration,filesChanged,commits,aiTokens,aiCost,notes';
  const rows = sessions.map((s) =>
    [
      s.id, `"${(s.name || '').replace(/"/g, '""')}"`, s.status, s.startTime, s.endTime || '',
      s.duration || '', s.filesChanged, s.commits, s.aiTokens,
      s.aiCost, `"${(s.notes || '').replace(/"/g, '""')}"`
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export function getStats(): SessionStats {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(duration) as total_time,
      SUM(files_changed) as total_files,
      SUM(commits) as total_commits,
      SUM(ai_cost) as total_cost,
      AVG(duration) as avg_time
    FROM sessions WHERE status = 'completed'
  `);
  const result = stmt.get() as any;

  return {
    totalSessions: result.total || 0,
    totalTime: result.total_time || 0,
    totalFiles: result.total_files || 0,
    totalCommits: result.total_commits || 0,
    totalAICost: result.total_cost || 0,
    avgSessionTime: result.avg_time || 0,
  };
}

function mapSession(row: any): Session {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    workingDirectory: row.working_directory,
    filesChanged: row.files_changed,
    commits: row.commits,
    aiCost: Math.round((row.ai_cost || 0) * 1e10) / 1e10,
    aiTokens: row.ai_tokens,
    notes: row.notes,
    status: row.status,
  };
}

export function closeDb(): void {
  db.close();
}

// ─── Session Notes / Annotations ──────────────────────────────

export function addNote(sessionId: number, message: string): SessionNote {
  const timestamp = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO session_notes (session_id, message, timestamp) VALUES (?, ?, ?)');
  const result = stmt.run(sessionId, message, timestamp);
  return { id: result.lastInsertRowid as number, sessionId, message, timestamp };
}

export function getNotes(sessionId: number): SessionNote[] {
  const stmt = db.prepare('SELECT * FROM session_notes WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as any[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    message: row.message,
    timestamp: row.timestamp,
  }));
}

// ─── Crash Recovery ───────────────────────────────────────────

export function recoverStaleSessions(maxAgeHours: number = 24): Session[] {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? AND start_time < ?');
  const rows = stmt.all('active', cutoff) as any[];
  const stale = rows.map(mapSession);

  for (const s of stale) {
    const endStmt = db.prepare(`
      UPDATE sessions SET end_time = ?, status = ?, notes = COALESCE(notes, '') || ?
      WHERE id = ?
    `);
    endStmt.run(new Date().toISOString(), 'completed', ' [auto-recovered: stale session]', s.id);
    // Compute duration
    const dur = Math.floor((Date.now() - new Date(s.startTime).getTime()) / 1000);
    db.prepare('UPDATE sessions SET duration = ? WHERE id = ?').run(dur, s.id);
  }

  return stale;
}

// ─── Configurable Pricing ─────────────────────────────────────

const PRICING_PATH = join(DB_DIR, 'pricing.json');

const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic (per 1M tokens)
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-3.5': { input: 0.80, output: 4 },
  // OpenAI (per 1M tokens)
  'gpt-4o': { input: 2.50, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'o3': { input: 2, output: 8 },
  'o4-mini': { input: 1.10, output: 4.40 },
  // Google (per 1M tokens)
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  // DeepSeek
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'deepseek-v3': { input: 0.27, output: 1.10 },
};

export function loadPricing(): Record<string, { input: number; output: number }> {
  const merged = { ...DEFAULT_PRICING };
  if (existsSync(PRICING_PATH)) {
    try {
      const user = JSON.parse(readFileSync(PRICING_PATH, 'utf-8'));
      Object.assign(merged, user);
    } catch (_) { /* ignore bad JSON */ }
  }
  return merged;
}

export function setPricing(model: string, input: number, output: number): void {
  let user: Record<string, { input: number; output: number }> = {};
  if (existsSync(PRICING_PATH)) {
    try { user = JSON.parse(readFileSync(PRICING_PATH, 'utf-8')); } catch (_) { user = {}; }
  }
  user[model] = { input, output };
  writeFileSync(PRICING_PATH, JSON.stringify(user, null, 2));
}

export function resetPricing(): void {
  if (existsSync(PRICING_PATH)) {
    writeFileSync(PRICING_PATH, '{}');
  }
}

export function getPricingPath(): string {
  return PRICING_PATH;
}
