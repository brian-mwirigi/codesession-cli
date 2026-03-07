/**
 * Core session CRUD, file changes, commits, AI usage, notes, recovery, export, stats.
 */

import { db } from './connection';
import { Session, FileChange, Commit, AIUsage, SessionStats, SessionNote } from '../types';
import { cleanupGit } from '../git';
import { cleanupWatcher } from '../watcher';

// ── Row types (DB column names → snake_case) ────────────────

export interface SessionRow {
  id: number;
  name: string;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  working_directory: string;
  git_root: string | null;
  start_git_head: string | null;
  files_changed: number;
  commits: number;
  ai_cost: number;
  ai_tokens: number;
  notes: string | null;
  status: string;
}

interface FileChangeRow {
  id: number;
  session_id: number;
  file_path: string;
  change_type: string;
  timestamp: string;
}

interface CommitRow {
  id: number;
  session_id: number;
  hash: string;
  message: string;
  timestamp: string;
}

interface AIUsageRow {
  id: number;
  session_id: number;
  provider: string;
  model: string;
  tokens: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost: number;
  agent_name: string | null;
  timestamp: string;
}

interface NoteRow {
  id: number;
  session_id: number;
  message: string;
  timestamp: string;
}

interface StatsRow {
  total: number;
  total_time: number | null;
  total_files: number | null;
  total_commits: number | null;
  total_cost: number | null;
  avg_time: number | null;
}

// ── Row → Domain Mapper ─────────────────────────────────────

export function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time || undefined,
    duration: row.duration ?? undefined,
    workingDirectory: row.working_directory,
    gitRoot: row.git_root || undefined,
    startGitHead: row.start_git_head || undefined,
    filesChanged: row.files_changed,
    commits: row.commits,
    aiCost: Math.round((row.ai_cost || 0) * 1e10) / 1e10,
    aiTokens: row.ai_tokens,
    notes: row.notes || undefined,
    status: row.status as Session['status'],
  };
}

// ── Session CRUD ─────────────────────────────────────────────

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
  const row = stmt.get('active') as SessionRow | undefined;
  if (!row) return null;
  return mapSession(row);
}

export function getActiveSessions(): Session[] {
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY id DESC');
  const rows = stmt.all('active') as SessionRow[];
  return rows.map(mapSession);
}

export function getActiveSessionForDir(dir: string): Session | null {
  // Check both working_directory and git_root for matches
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? AND (working_directory = ? OR git_root = ?) ORDER BY id DESC LIMIT 1');
  const row = stmt.get('active', dir, dir) as SessionRow | undefined;
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
  cleanupWatcher(sessionId).catch(() => {});
}

export function getSession(sessionId: number): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(sessionId) as SessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function getSessions(limit = 10): Session[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?');
  const rows = stmt.all(limit) as SessionRow[];
  return rows.map(mapSession);
}

// ── File Changes ─────────────────────────────────────────────

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

export function getFileChanges(sessionId: number): FileChange[] {
  const stmt = db.prepare('SELECT * FROM file_changes WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as FileChangeRow[];
  return rows.map((row): FileChange => ({
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    changeType: row.change_type as FileChange['changeType'],
    timestamp: row.timestamp,
  }));
}

// ── Commits ──────────────────────────────────────────────────

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

export function getCommits(sessionId: number): Commit[] {
  const stmt = db.prepare('SELECT * FROM commits WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as CommitRow[];
  return rows.map((row): Commit => ({
    id: row.id,
    sessionId: row.session_id,
    hash: row.hash,
    message: row.message,
    timestamp: row.timestamp,
  }));
}

// ── AI Usage ─────────────────────────────────────────────────

export function addAIUsage(usage: Omit<AIUsage, 'id'>): void {
  // Use transaction for atomic insert + sum update
  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO ai_usage (session_id, provider, model, tokens, prompt_tokens, completion_tokens, cost, agent_name, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(usage.sessionId, usage.provider, usage.model, usage.tokens, usage.promptTokens || null, usage.completionTokens || null, usage.cost, usage.agentName || null, usage.timestamp);

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

export function getAIUsage(sessionId: number): AIUsage[] {
  const stmt = db.prepare('SELECT * FROM ai_usage WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as AIUsageRow[];
  return rows.map((row): AIUsage => ({
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    model: row.model,
    tokens: row.tokens,
    promptTokens: row.prompt_tokens || undefined,
    completionTokens: row.completion_tokens || undefined,
    cost: row.cost,
    agentName: row.agent_name || undefined,
    timestamp: row.timestamp,
  }));
}

// ── Export / Stats ───────────────────────────────────────────

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
  const header = 'id,name,status,startTime,endTime,duration,filesChanged,commits,aiTokens,aiCost,agents,notes';
  const rows = sessions.map((s) => {
    // Escape CSV special characters: quotes and newlines
    const escapeCsv = (str: string) => str.replace(/"/g, '""').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    const aiUsage = getAIUsage(s.id!);
    const agents = [...new Set(aiUsage.map(a => a.agentName).filter(Boolean))].join('; ');
    return [
      s.id, `"${escapeCsv(s.name || '')}"`, s.status, s.startTime, s.endTime || '',
      s.duration || '', s.filesChanged, s.commits, s.aiTokens,
      s.aiCost, `"${escapeCsv(agents)}"`, `"${escapeCsv(s.notes || '')}"`
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
  const result = stmt.get() as StatsRow;

  return {
    totalSessions: result.total || 0,
    totalTime: result.total_time || 0,
    totalFiles: result.total_files || 0,
    totalCommits: result.total_commits || 0,
    totalAICost: result.total_cost || 0,
    avgSessionTime: result.avg_time || 0,
  };
}

// ── Notes ────────────────────────────────────────────────────

export function addNote(sessionId: number, message: string): SessionNote {
  const timestamp = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO session_notes (session_id, message, timestamp) VALUES (?, ?, ?)');
  const result = stmt.run(sessionId, message, timestamp);
  return { id: result.lastInsertRowid as number, sessionId, message, timestamp };
}

export function getNotes(sessionId: number): SessionNote[] {
  const stmt = db.prepare('SELECT * FROM session_notes WHERE session_id = ? ORDER BY timestamp');
  const rows = stmt.all(sessionId) as NoteRow[];
  return rows.map((row): SessionNote => ({
    id: row.id,
    sessionId: row.session_id,
    message: row.message,
    timestamp: row.timestamp,
  }));
}

// ── Crash Recovery ──────────────────────────────────────────

export function recoverStaleSessions(maxAgeHours: number = 24): Session[] {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  const stmt = db.prepare('SELECT * FROM sessions WHERE status = ? AND start_time < ?');
  const rows = stmt.all('active', cutoff) as SessionRow[];
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

// ── Lifecycle ───────────────────────────────────────────────

export function clearAllData(): void {
  // Clean up watchers/pollers for any active sessions before deleting
  const active = getActiveSessions();
  for (const s of active) {
    cleanupGit(s.id!);
    cleanupWatcher(s.id!).catch(() => {});
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM session_notes').run();
    db.prepare('DELETE FROM ai_usage').run();
    db.prepare('DELETE FROM file_changes').run();
    db.prepare('DELETE FROM commits').run();
    db.prepare('DELETE FROM sessions').run();
  });
  transaction();
}

export function closeDb(): void {
  db.close();
}
