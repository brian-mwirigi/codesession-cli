import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { Session, FileChange, Commit, AIUsage, SessionStats, SessionNote } from './types';
import { cleanupGit } from './git';
import { cleanupWatcher } from './watcher';

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
      try { require('fs').unlinkSync(newDb); } catch (_) {}
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

export function createSession(session: Omit<Session, 'id'>): number {
  const stmt = db.prepare(`
    INSERT INTO sessions (name, start_time, working_directory, git_root, start_git_head, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(session.name, session.startTime, session.workingDirectory, session.gitRoot || null, session.startGitHead || null, 'active');
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
  // Check both working_directory and git_root for matches
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? AND (working_directory = ? OR git_root = ?) ORDER BY id DESC LIMIT 1');
  const row = stmt.get('active', dir, dir) as any;
  if (!row) return null;
  return mapSession(row);
}

export function endSession(sessionId: number, endTime: string, notes?: string): void {
  const session = getSession(sessionId);
  if (!session) return;

  let duration = Math.floor((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);
  // Sanity check: cap at 1 year (unlikely but prevents overflow/corruption from clock skew)
  if (duration < 0 || duration > 31536000) {
    duration = Math.max(0, Math.min(duration, 31536000));
  }

  const stmt = db.prepare(`
    UPDATE sessions
    SET end_time = ?, duration = ?, status = ?, notes = ?
    WHERE id = ?
  `);
  stmt.run(endTime, duration, 'completed', notes || null, sessionId);

  // Clean up session-scoped tracking
  cleanupGit(sessionId);
  cleanupWatcher(sessionId);
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
  // Use transaction for atomic insert + count update
  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(change.sessionId, change.filePath, change.changeType, change.timestamp);

    // Update session files count atomically
    const updateStmt = db.prepare(`
      UPDATE sessions
      SET files_changed = (
        SELECT COUNT(DISTINCT file_path) FROM file_changes WHERE session_id = ?
      )
      WHERE id = ?
    `);
    updateStmt.run(change.sessionId, change.sessionId);
  });

  transaction();
}

export function addCommit(commit: Omit<Commit, 'id'>): void {
  // Use transaction for atomic insert + count update
  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO commits (session_id, hash, message, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(commit.sessionId, commit.hash, commit.message, commit.timestamp);

    // Update session commits count atomically
    const updateStmt = db.prepare(`
      UPDATE sessions
      SET commits = (
        SELECT COUNT(*) FROM commits WHERE session_id = ?
      )
      WHERE id = ?
    `);
    updateStmt.run(commit.sessionId, commit.sessionId);
  });

  transaction();
}

export function addAIUsage(usage: Omit<AIUsage, 'id'>): void {
  // Use transaction for atomic insert + sum update
  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO ai_usage (session_id, provider, model, tokens, prompt_tokens, completion_tokens, cost, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(usage.sessionId, usage.provider, usage.model, usage.tokens, usage.promptTokens || null, usage.completionTokens || null, usage.cost, usage.timestamp);

    // Update session AI totals atomically
    const updateStmt = db.prepare(`
      UPDATE sessions
      SET ai_cost = ROUND((SELECT SUM(cost) FROM ai_usage WHERE session_id = ?) * 10000000000) / 10000000000,
          ai_tokens = (SELECT SUM(tokens) FROM ai_usage WHERE session_id = ?)
      WHERE id = ?
    `);
    updateStmt.run(usage.sessionId, usage.sessionId, usage.sessionId);
  });

  transaction();
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
  const rows = sessions.map((s) => {
    // Escape CSV special characters: quotes and newlines
    const escapeCsv = (str: string) => str.replace(/"/g, '""').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    return [
      s.id, `"${escapeCsv(s.name || '')}"`, s.status, s.startTime, s.endTime || '',
      s.duration || '', s.filesChanged, s.commits, s.aiTokens,
      s.aiCost, `"${escapeCsv(s.notes || '')}"`
    ].join(',');
  });
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
    gitRoot: row.git_root || undefined,
    startGitHead: row.start_git_head || undefined,
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

// ─── Dashboard Queries ────────────────────────────────────────

export function getSessionsPaginated(options: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}): { sessions: Session[]; total: number } {
  const { limit = 50, offset = 0, status = 'all', search = '' } = options;

  const conditions: string[] = [];
  const params: any[] = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM sessions ${where}`);
  const countResult = countStmt.get(...params) as any;

  const dataStmt = db.prepare(`SELECT * FROM sessions ${where} ORDER BY start_time DESC LIMIT ? OFFSET ?`);
  const rows = dataStmt.all(...params, limit, offset) as any[];

  return {
    sessions: rows.map(mapSession),
    total: countResult.total,
  };
}

export function getSessionDetail(sessionId: number): {
  session: Session;
  aiUsage: AIUsage[];
  files: FileChange[];
  commits: Commit[];
  notes: SessionNote[];
} | null {
  const session = getSession(sessionId);
  if (!session) return null;

  return {
    session,
    aiUsage: getAIUsage(sessionId),
    files: getFileChanges(sessionId),
    commits: getCommits(sessionId),
    notes: getNotes(sessionId),
  };
}

export function getDailyCosts(days: number = 30): Array<{
  day: string;
  cost: number;
  sessions: number;
  tokens: number;
}> {
  const stmt = db.prepare(`
    SELECT date(start_time) as day,
           SUM(ai_cost) as cost,
           COUNT(*) as sessions,
           SUM(ai_tokens) as tokens
    FROM sessions
    WHERE start_time >= date('now', '-' || ? || ' days')
    GROUP BY date(start_time)
    ORDER BY day
  `);
  const rows = stmt.all(days) as any[];
  return rows.map(r => ({
    day: r.day,
    cost: Math.round((r.cost || 0) * 100) / 100,
    sessions: r.sessions,
    tokens: r.tokens || 0,
  }));
}

export function getModelBreakdown(): Array<{
  provider: string;
  model: string;
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}> {
  const stmt = db.prepare(`
    SELECT provider, model,
           COUNT(*) as calls,
           SUM(tokens) as total_tokens,
           SUM(COALESCE(prompt_tokens, 0)) as prompt_tokens,
           SUM(COALESCE(completion_tokens, 0)) as completion_tokens,
           SUM(cost) as total_cost
    FROM ai_usage
    GROUP BY provider, model
    ORDER BY total_cost DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    provider: r.provider,
    model: r.model,
    calls: r.calls,
    totalTokens: r.total_tokens || 0,
    promptTokens: r.prompt_tokens || 0,
    completionTokens: r.completion_tokens || 0,
    totalCost: Math.round((r.total_cost || 0) * 100) / 100,
  }));
}

export function getTopSessions(limit: number = 10): Session[] {
  const stmt = db.prepare(`
    SELECT * FROM sessions
    WHERE ai_cost > 0
    ORDER BY ai_cost DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.map(mapSession);
}

// ─── Additional Dashboard Queries ─────────────────────────────

/** Provider-level cost/token/call rollup */
export function getProviderBreakdown(): Array<{
  provider: string;
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  models: number;
}> {
  const stmt = db.prepare(`
    SELECT provider,
           COUNT(*) as calls,
           SUM(tokens) as total_tokens,
           SUM(COALESCE(prompt_tokens, 0)) as prompt_tokens,
           SUM(COALESCE(completion_tokens, 0)) as completion_tokens,
           SUM(cost) as total_cost,
           COUNT(DISTINCT model) as models
    FROM ai_usage
    GROUP BY provider
    ORDER BY total_cost DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    provider: r.provider,
    calls: r.calls,
    totalTokens: r.total_tokens || 0,
    promptTokens: r.prompt_tokens || 0,
    completionTokens: r.completion_tokens || 0,
    totalCost: Math.round((r.total_cost || 0) * 100) / 100,
    models: r.models,
  }));
}

/** Cross-session file hotspots — most frequently changed files */
export function getFileHotspots(limit: number = 50): Array<{
  filePath: string;
  changeCount: number;
  sessionCount: number;
  lastChanged: string;
  creates: number;
  modifies: number;
  deletes: number;
}> {
  const stmt = db.prepare(`
    SELECT file_path,
           COUNT(*) as change_count,
           COUNT(DISTINCT session_id) as session_count,
           MAX(timestamp) as last_changed,
           SUM(CASE WHEN change_type = 'created' THEN 1 ELSE 0 END) as creates,
           SUM(CASE WHEN change_type = 'modified' THEN 1 ELSE 0 END) as modifies,
           SUM(CASE WHEN change_type = 'deleted' THEN 1 ELSE 0 END) as deletes
    FROM file_changes
    GROUP BY file_path
    ORDER BY change_count DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.map(r => ({
    filePath: r.file_path,
    changeCount: r.change_count,
    sessionCount: r.session_count,
    lastChanged: r.last_changed,
    creates: r.creates,
    modifies: r.modifies,
    deletes: r.deletes,
  }));
}

/** Activity heatmap: session count + cost by hour-of-day and day-of-week */
export function getActivityHeatmap(): Array<{
  dayOfWeek: number;  // 0=Sun .. 6=Sat
  hour: number;       // 0–23
  sessions: number;
  cost: number;
}> {
  const stmt = db.prepare(`
    SELECT
      CAST(strftime('%w', start_time) AS INTEGER) as day_of_week,
      CAST(strftime('%H', start_time) AS INTEGER) as hour,
      COUNT(*) as sessions,
      SUM(ai_cost) as cost
    FROM sessions
    GROUP BY day_of_week, hour
    ORDER BY day_of_week, hour
  `);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    dayOfWeek: r.day_of_week,
    hour: r.hour,
    sessions: r.sessions,
    cost: Math.round((r.cost || 0) * 100) / 100,
  }));
}

/** Daily tokens trend (separate from cost) */
export function getDailyTokens(days: number = 30): Array<{
  day: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const stmt = db.prepare(`
    SELECT date(a.timestamp) as day,
           SUM(COALESCE(a.prompt_tokens, 0)) as prompt_tokens,
           SUM(COALESCE(a.completion_tokens, 0)) as completion_tokens,
           SUM(a.tokens) as total_tokens
    FROM ai_usage a
    WHERE a.timestamp >= date('now', '-' || ? || ' days')
    GROUP BY date(a.timestamp)
    ORDER BY day
  `);
  const rows = stmt.all(days) as any[];
  return rows.map(r => ({
    day: r.day,
    promptTokens: r.prompt_tokens || 0,
    completionTokens: r.completion_tokens || 0,
    totalTokens: r.total_tokens || 0,
  }));
}

/** Cost velocity: per-session cost/hour */
export function getCostVelocity(limit: number = 50): Array<{
  id: number;
  name: string;
  startTime: string;
  duration: number;
  aiCost: number;
  costPerHour: number;
}> {
  const stmt = db.prepare(`
    SELECT id, name, start_time, duration, ai_cost
    FROM sessions
    WHERE status = 'completed' AND duration > 0 AND ai_cost > 0
    ORDER BY start_time DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    startTime: r.start_time,
    duration: r.duration,
    aiCost: Math.round((r.ai_cost || 0) * 100) / 100,
    costPerHour: r.duration > 0 ? Math.round(((r.ai_cost || 0) / (r.duration / 3600)) * 100) / 100 : 0,
  }));
}

/** Per-project (working directory) rollup */
export function getProjectBreakdown(): Array<{
  project: string;
  sessions: number;
  totalCost: number;
  totalTime: number;
  totalFiles: number;
  totalCommits: number;
  totalTokens: number;
  lastActive: string;
}> {
  const stmt = db.prepare(`
    SELECT COALESCE(git_root, working_directory) as project,
           COUNT(*) as sessions,
           SUM(ai_cost) as total_cost,
           SUM(duration) as total_time,
           SUM(files_changed) as total_files,
           SUM(commits) as total_commits,
           SUM(ai_tokens) as total_tokens,
           MAX(start_time) as last_active
    FROM sessions
    GROUP BY project
    ORDER BY total_cost DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    project: r.project,
    sessions: r.sessions,
    totalCost: Math.round((r.total_cost || 0) * 100) / 100,
    totalTime: r.total_time || 0,
    totalFiles: r.total_files || 0,
    totalCommits: r.total_commits || 0,
    totalTokens: r.total_tokens || 0,
    lastActive: r.last_active,
  }));
}

/** Prompt:completion token ratio by model */
export function getTokenRatios(): Array<{
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ratio: number;
  calls: number;
}> {
  const stmt = db.prepare(`
    SELECT provider, model,
           SUM(COALESCE(prompt_tokens, 0)) as prompt_tokens,
           SUM(COALESCE(completion_tokens, 0)) as completion_tokens,
           COUNT(*) as calls
    FROM ai_usage
    WHERE prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL
    GROUP BY provider, model
    ORDER BY SUM(tokens) DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    provider: r.provider,
    model: r.model,
    promptTokens: r.prompt_tokens || 0,
    completionTokens: r.completion_tokens || 0,
    ratio: r.completion_tokens > 0 ? Math.round((r.prompt_tokens / r.completion_tokens) * 100) / 100 : 0,
    calls: r.calls,
  }));
}
