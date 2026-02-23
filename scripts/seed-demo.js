#!/usr/bin/env node
/**
 * Seed the codesession database with realistic demo data.
 * Run: node scripts/seed-demo.js
 */

const Database = require('better-sqlite3');
const { join } = require('path');
const { homedir } = require('os');
const { existsSync, mkdirSync } = require('fs');

const DB_DIR = join(homedir(), '.codesession');
const DB_PATH = join(DB_DIR, 'sessions.db');

if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Make sure tables exist
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
  );
  CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    hash TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost REAL NOT NULL,
    agent_name TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`);

try { db.exec('ALTER TABLE ai_usage ADD COLUMN prompt_tokens INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE ai_usage ADD COLUMN completion_tokens INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE ai_usage ADD COLUMN agent_name TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN git_root TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN start_git_head TEXT'); } catch (_) {}

// ── Helpers ──────────────────────────────────────────────────────
function daysAgo(n, offsetMinutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return d.toISOString();
}

function randomHash() {
  return Math.random().toString(16).slice(2, 9);
}

function insertSession(s) {
  return db.prepare(`
    INSERT INTO sessions (name, start_time, end_time, duration, working_directory, git_root,
      start_git_head, files_changed, commits, ai_cost, ai_tokens, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.name, s.startTime, s.endTime || null, s.duration || null,
    s.workingDirectory, s.gitRoot || null, s.startGitHead || null,
    s.filesChanged || 0, s.commits || 0, s.aiCost || 0, s.aiTokens || 0,
    s.notes || null, s.status || 'completed'
  ).lastInsertRowid;
}

function insertFileChange(sessionId, filePath, changeType, timestamp) {
  db.prepare(`INSERT INTO file_changes (session_id, file_path, change_type, timestamp) VALUES (?, ?, ?, ?)`)
    .run(sessionId, filePath, changeType, timestamp);
}

function insertCommit(sessionId, hash, message, timestamp) {
  db.prepare(`INSERT INTO commits (session_id, hash, message, timestamp) VALUES (?, ?, ?, ?)`)
    .run(sessionId, hash, message, timestamp);
}

function insertAIUsage(sessionId, provider, model, promptTokens, completionTokens, cost, agentName, timestamp) {
  const tokens = promptTokens + completionTokens;
  db.prepare(`INSERT INTO ai_usage (session_id, provider, model, tokens, prompt_tokens, completion_tokens, cost, agent_name, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, provider, model, tokens, promptTokens, completionTokens, cost, agentName || null, timestamp);
}

function insertNote(sessionId, message, timestamp) {
  db.prepare(`INSERT INTO session_notes (session_id, message, timestamp) VALUES (?, ?, ?)`)
    .run(sessionId, message, timestamp);
}

// ── Session 1: Fix auth bug (7 days ago) ─────────────────────────
const s1 = insertSession({
  name: 'Fix authentication bug',
  startTime: daysAgo(7),
  endTime: daysAgo(7, 94),
  duration: 5640,
  workingDirectory: '/home/nesh/projects/codesession-cli',
  gitRoot: '/home/nesh/projects/codesession-cli',
  startGitHead: randomHash(),
  filesChanged: 7,
  commits: 2,
  aiCost: 0.82,
  aiTokens: 54200,
  notes: 'Fixed JWT expiry bug. Added refresh token logic. Tests passing.',
  status: 'completed',
});

insertFileChange(s1, 'src/auth/jwt.ts', 'modified', daysAgo(7, 10));
insertFileChange(s1, 'src/auth/middleware.ts', 'modified', daysAgo(7, 22));
insertFileChange(s1, 'src/auth/refresh.ts', 'created', daysAgo(7, 35));
insertFileChange(s1, 'tests/auth.test.ts', 'modified', daysAgo(7, 48));
insertFileChange(s1, 'src/routes/login.ts', 'modified', daysAgo(7, 55));
insertFileChange(s1, 'src/types/user.ts', 'modified', daysAgo(7, 67));
insertFileChange(s1, 'README.md', 'modified', daysAgo(7, 80));
insertCommit(s1, randomHash(), 'fix: JWT token expiry not refreshing correctly', daysAgo(7, 50));
insertCommit(s1, randomHash(), 'test: add auth refresh token tests', daysAgo(7, 78));
insertAIUsage(s1, 'anthropic', 'claude-sonnet-4', 12000, 3200, 0.084, 'Code Fixer', daysAgo(7, 15));
insertAIUsage(s1, 'anthropic', 'claude-sonnet-4', 18000, 4500, 0.1215, 'Code Fixer', daysAgo(7, 40));
insertAIUsage(s1, 'anthropic', 'claude-opus-4-6', 8000, 2000, 0.27, 'Code Reviewer', daysAgo(7, 60));
insertAIUsage(s1, 'anthropic', 'claude-sonnet-4', 22000, 5500, 0.1485, 'Code Fixer', daysAgo(7, 75));
insertNote(s1, 'Found the bug: token expiry was in seconds not milliseconds', daysAgo(7, 20));
insertNote(s1, 'Refresh token endpoint working', daysAgo(7, 55));

// ── Session 2: Add dashboard alerts (5 days ago) ─────────────────
const s2 = insertSession({
  name: 'Add dashboard alerts feature',
  startTime: daysAgo(5),
  endTime: daysAgo(5, 210),
  duration: 12600,
  workingDirectory: '/home/nesh/projects/codesession-cli',
  gitRoot: '/home/nesh/projects/codesession-cli',
  startGitHead: randomHash(),
  filesChanged: 11,
  commits: 3,
  aiCost: 2.14,
  aiTokens: 142800,
  notes: 'Dashboard alerts tab complete. Sound + browser notifications. Budget thresholds working.',
  status: 'completed',
});

insertFileChange(s2, 'dashboard/src/components/Alerts.tsx', 'created', daysAgo(5, 20));
insertFileChange(s2, 'dashboard/src/components/AlertForm.tsx', 'created', daysAgo(5, 45));
insertFileChange(s2, 'dashboard/src/App.tsx', 'modified', daysAgo(5, 60));
insertFileChange(s2, 'dashboard/src/App.css', 'modified', daysAgo(5, 75));
insertFileChange(s2, 'dashboard/src/components/Sidebar.tsx', 'modified', daysAgo(5, 90));
insertFileChange(s2, 'src/dashboard-server.ts', 'modified', daysAgo(5, 110));
insertFileChange(s2, 'src/db.ts', 'modified', daysAgo(5, 130));
insertFileChange(s2, 'src/types.ts', 'modified', daysAgo(5, 145));
insertFileChange(s2, 'dashboard/src/components/Icons.tsx', 'modified', daysAgo(5, 160));
insertFileChange(s2, 'package.json', 'modified', daysAgo(5, 175));
insertFileChange(s2, 'CHANGELOG.md', 'modified', daysAgo(5, 190));
insertCommit(s2, randomHash(), 'feat: add alerts dashboard with budget thresholds', daysAgo(5, 120));
insertCommit(s2, randomHash(), 'feat: alarm mode with sound and browser notifications', daysAgo(5, 160));
insertCommit(s2, randomHash(), 'chore: bump version to 2.0.0', daysAgo(5, 195));
insertAIUsage(s2, 'anthropic', 'claude-sonnet-4', 25000, 6000, 0.165, 'UI Builder', daysAgo(5, 30));
insertAIUsage(s2, 'anthropic', 'claude-sonnet-4', 32000, 8000, 0.21, 'UI Builder', daysAgo(5, 70));
insertAIUsage(s2, 'anthropic', 'claude-opus-4-6', 15000, 4000, 0.525, 'Code Reviewer', daysAgo(5, 100));
insertAIUsage(s2, 'anthropic', 'claude-sonnet-4', 28000, 7000, 0.189, 'UI Builder', daysAgo(5, 140));
insertAIUsage(s2, 'anthropic', 'claude-opus-4-6', 12000, 3000, 0.405, 'Code Reviewer', daysAgo(5, 170));
insertAIUsage(s2, 'openai', 'gpt-4o', 18000, 5000, 0.095, 'Test Writer', daysAgo(5, 185));
insertNote(s2, 'Starting alerts component', daysAgo(5, 15));
insertNote(s2, 'Budget threshold logic done', daysAgo(5, 100));
insertNote(s2, 'Sound alerts need autoplay policy fix', daysAgo(5, 150));

// ── Session 3: MCP server (3 days ago) ───────────────────────────
const s3 = insertSession({
  name: 'Build Claude Code MCP server',
  startTime: daysAgo(3),
  endTime: daysAgo(3, 180),
  duration: 10800,
  workingDirectory: '/home/nesh/projects/codesession-cli',
  gitRoot: '/home/nesh/projects/codesession-cli',
  startGitHead: randomHash(),
  filesChanged: 8,
  commits: 3,
  aiCost: 1.76,
  aiTokens: 117200,
  notes: 'MCP server with 8 tools. Bundled as Claude Code plugin. Published to marketplace.',
  status: 'completed',
});

insertFileChange(s3, 'src/mcp-server.ts', 'created', daysAgo(3, 20));
insertFileChange(s3, 'src/index.ts', 'modified', daysAgo(3, 50));
insertFileChange(s3, 'package.json', 'modified', daysAgo(3, 65));
insertFileChange(s3, 'plugin/.claude-plugin/plugin.json', 'created', daysAgo(3, 90));
insertFileChange(s3, 'plugin/.mcp.json', 'created', daysAgo(3, 95));
insertFileChange(s3, 'plugin/skills/codesession/SKILL.md', 'created', daysAgo(3, 100));
insertFileChange(s3, '.claude-plugin/marketplace.json', 'created', daysAgo(3, 120));
insertFileChange(s3, 'README.md', 'modified', daysAgo(3, 160));
insertCommit(s3, randomHash(), 'feat: add MCP server with 8 session tracking tools', daysAgo(3, 80));
insertCommit(s3, randomHash(), 'feat: add Claude Code plugin with marketplace', daysAgo(3, 130));
insertCommit(s3, randomHash(), 'docs: update README with MCP installation guide', daysAgo(3, 165));
insertAIUsage(s3, 'anthropic', 'claude-opus-4-6', 20000, 5000, 0.675, 'Architect', daysAgo(3, 25));
insertAIUsage(s3, 'anthropic', 'claude-sonnet-4', 35000, 9000, 0.24, 'Code Builder', daysAgo(3, 60));
insertAIUsage(s3, 'anthropic', 'claude-sonnet-4', 28000, 7000, 0.189, 'Code Builder', daysAgo(3, 100));
insertAIUsage(s3, 'anthropic', 'claude-opus-4-6', 10000, 2500, 0.3375, 'Code Reviewer', daysAgo(3, 140));
insertAIUsage(s3, 'anthropic', 'claude-sonnet-4', 20000, 5000, 0.135, 'Docs Writer', daysAgo(3, 160));
insertNote(s3, 'MCP SDK installed, starting server', daysAgo(3, 15));
insertNote(s3, '8 tools registered and tested', daysAgo(3, 90));
insertNote(s3, 'Plugin structure validated', daysAgo(3, 125));

// ── Session 4: Parallel sessions fix (2 days ago) ────────────────
const s4 = insertSession({
  name: 'Fix parallel session support',
  startTime: daysAgo(2),
  endTime: daysAgo(2, 75),
  duration: 4500,
  workingDirectory: '/home/nesh/projects/codesession-cli',
  gitRoot: '/home/nesh/projects/codesession-cli',
  startGitHead: randomHash(),
  filesChanged: 3,
  commits: 2,
  aiCost: 0.54,
  aiTokens: 36000,
  notes: 'cs start now allows multiple sessions in different dirs. resolveActiveSession() helper added.',
  status: 'completed',
});

insertFileChange(s4, 'src/index.ts', 'modified', daysAgo(2, 20));
insertFileChange(s4, 'src/db.ts', 'modified', daysAgo(2, 35));
insertFileChange(s4, 'src/git.ts', 'modified', daysAgo(2, 50));
insertCommit(s4, randomHash(), 'fix: allow parallel sessions in different git repos', daysAgo(2, 55));
insertCommit(s4, randomHash(), 'feat: bump to v2.1.0', daysAgo(2, 70));
insertAIUsage(s4, 'anthropic', 'claude-sonnet-4', 18000, 4500, 0.1215, 'Bug Fixer', daysAgo(2, 25));
insertAIUsage(s4, 'anthropic', 'claude-sonnet-4', 15000, 3800, 0.102, 'Bug Fixer', daysAgo(2, 50));
insertNote(s4, 'Bill reported sessions blocking each other', daysAgo(2, 5));
insertNote(s4, 'Scoping by git root fixes the issue', daysAgo(2, 40));

// ── Session 5: SEO and marketplace (today, still active) ─────────
const s5 = insertSession({
  name: 'SEO improvements and marketplace listing',
  startTime: daysAgo(0, -60),
  endTime: null,
  duration: null,
  workingDirectory: '/home/nesh/projects/codesession-cli',
  gitRoot: '/home/nesh/projects/codesession-cli',
  startGitHead: randomHash(),
  filesChanged: 5,
  commits: 1,
  aiCost: 0.31,
  aiTokens: 20700,
  notes: null,
  status: 'active',
});

insertFileChange(s5, 'package.json', 'modified', daysAgo(0, -50));
insertFileChange(s5, 'README.md', 'modified', daysAgo(0, -45));
insertFileChange(s5, 'plugin/.claude-plugin/plugin.json', 'modified', daysAgo(0, -35));
insertFileChange(s5, '.claude-plugin/marketplace.json', 'modified', daysAgo(0, -25));
insertFileChange(s5, 'skills/codesession/SKILL.md', 'modified', daysAgo(0, -15));
insertCommit(s5, randomHash(), 'seo: add keyword variations and agent names everywhere', daysAgo(0, -20));
insertAIUsage(s5, 'anthropic', 'claude-sonnet-4', 10000, 2500, 0.0675, 'SEO Assistant', daysAgo(0, -55));
insertAIUsage(s5, 'anthropic', 'claude-opus-4-6', 7000, 1800, 0.24, 'Architect', daysAgo(0, -30));
insertNote(s5, 'Adding keywords to all metadata files', daysAgo(0, -50));

console.log('✓ Demo data seeded successfully!');
console.log('  Sessions: 5 (4 completed, 1 active)');
console.log('  File changes: 34');
console.log('  Commits: 11');
console.log('  AI usage entries: 21');
console.log('  Notes: 11');
console.log('\nRun: npx codesession-cli dashboard');
