/**
 * Dashboard analytics queries — only used by dashboard-server.ts.
 */

import { db } from './connection';
import { Session, AIUsage, FileChange, Commit, SessionNote } from '../types';
import { mapSession, SessionRow, getSession, getAIUsage, getFileChanges, getCommits, getNotes } from './sessions';

// ── Row interfaces for analytics queries ────────────────────

interface CountRow { total: number }

interface DailyCostRow {
  day: string;
  cost: number | null;
  sessions: number;
  tokens: number | null;
}

interface ModelBreakdownRow {
  provider: string;
  model: string;
  calls: number;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_cost: number | null;
}

interface ProviderBreakdownRow extends ModelBreakdownRow {
  models: number;
}

interface FileHotspotRow {
  file_path: string;
  change_count: number;
  session_count: number;
  last_changed: string;
  creates: number;
  modifies: number;
  deletes: number;
}

interface HeatmapRow {
  day_of_week: number;
  hour: number;
  sessions: number;
  cost: number | null;
}

interface DailyTokenRow {
  day: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

interface CostVelocityRow {
  id: number;
  name: string;
  start_time: string;
  duration: number;
  ai_cost: number | null;
}

interface ProjectBreakdownRow {
  project: string;
  sessions: number;
  total_cost: number | null;
  total_time: number | null;
  total_files: number | null;
  total_commits: number | null;
  total_tokens: number | null;
  last_active: string;
}

interface TokenRatioRow {
  provider: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  calls: number;
}

// ── Queries ─────────────────────────────────────────────────

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
  const countResult = countStmt.get(...params) as CountRow;

  const dataStmt = db.prepare(`SELECT * FROM sessions ${where} ORDER BY start_time DESC LIMIT ? OFFSET ?`);
  const rows = dataStmt.all(...params, limit, offset) as SessionRow[];

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
  const rows = stmt.all(days) as DailyCostRow[];
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
  const rows = stmt.all() as ModelBreakdownRow[];
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
  const rows = stmt.all(limit) as SessionRow[];
  return rows.map(mapSession);
}

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
  const rows = stmt.all() as ProviderBreakdownRow[];
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
  const rows = stmt.all(limit) as FileHotspotRow[];
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
  const rows = stmt.all() as HeatmapRow[];
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
  const rows = stmt.all(days) as DailyTokenRow[];
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
  const rows = stmt.all(limit) as CostVelocityRow[];
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
  const rows = stmt.all() as ProjectBreakdownRow[];
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
  const rows = stmt.all() as TokenRatioRow[];
  return rows.map(r => ({
    provider: r.provider,
    model: r.model,
    promptTokens: r.prompt_tokens || 0,
    completionTokens: r.completion_tokens || 0,
    ratio: (r.completion_tokens ?? 0) > 0 ? Math.round(((r.prompt_tokens ?? 0) / r.completion_tokens!) * 100) / 100 : 0,
    calls: r.calls,
  }));
}
