import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { Session, FileChange, Commit, AIUsage, SessionStats } from './types';

const DB_DIR = join(homedir(), '.devsession');
const DB_PATH = join(DB_DIR, 'sessions.db');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

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
    cost REAL NOT NULL,
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
    INSERT INTO ai_usage (session_id, provider, model, tokens, cost, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(usage.sessionId, usage.provider, usage.model, usage.tokens, usage.cost, usage.timestamp);

  // Update session AI totals
  const sumStmt = db.prepare(`
    SELECT SUM(cost) as total_cost, SUM(tokens) as total_tokens 
    FROM ai_usage WHERE session_id = ?
  `);
  const result = sumStmt.get(usage.sessionId) as any;
  
  const updateStmt = db.prepare('UPDATE sessions SET ai_cost = ?, ai_tokens = ? WHERE id = ?');
  updateStmt.run(result.total_cost || 0, result.total_tokens || 0, usage.sessionId);
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
    cost: row.cost,
    timestamp: row.timestamp,
  }));
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
    aiCost: row.ai_cost,
    aiTokens: row.ai_tokens,
    notes: row.notes,
    status: row.status,
  };
}

export function closeDb(): void {
  db.close();
}
