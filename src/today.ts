/**
 * cs today — Pick up exactly where you left off. Every time.
 *
 * Reads git state, TODO comments, open PRs, and codesession history
 * across all registered projects to build a comprehensive context snapshot.
 */

import { simpleGit } from 'simple-git';
import { execSync, execFile } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename, relative } from 'path';
import chalk from 'chalk';
import {
  getTodayProjects,
  addTodayProject,
  removeTodayProject,
  getSessions,
  getAIUsage,
  getFileChanges,
  getCommits,
  getNotes,
} from './db';

import { Session } from './types';
import { formatRelativeTime, formatDuration } from './formatters';

// ── Types ─────────────────────────────────────────────────────

export interface GitState {
  branch: string;
  uncommittedFiles: { path: string; status: string }[];
  stagedFiles: { path: string; status: string }[];
  stashes: { index: number; message: string }[];
  recentCommits: { hash: string; message: string; date: string; relative: string }[];
  hasUnpushed: boolean;
  unpushedCount: number;
}

export interface TodoItem {
  file: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  text: string;
  modifiedAt?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  reviewComments: number;
  ciStatus: string;
  isDraft: boolean;
}

export interface AICallDetail {
  provider: string;
  model: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  agentName: string | null;
  timestamp: string;
}

export interface LastSession {
  id: number;
  name: string;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  aiCost: number;
  aiTokens: number;
  filesChanged: number;
  commits: number;
  status: string;
  notes: string | null;
  aiCalls: AICallDetail[];
  fileChanges: { path: string; type: string }[];
  sessionNotes: string[];
}

export interface ProjectSnapshot {
  path: string;
  name: string;
  isGitRepo: boolean;
  git: GitState | null;
  todos: TodoItem[];
  pullRequests: PullRequest[];
  lastSession: LastSession | null;
}

export interface TodaySnapshot {
  timestamp: string;
  projects: ProjectSnapshot[];
  lastSessionGlobal: LastSession | null;
}

// ── Git State ─────────────────────────────────────────────────

async function collectGitState(projectPath: string): Promise<GitState | null> {
  try {
    const g = simpleGit(projectPath, { timeout: { block: 10000 } });

    // Verify it's a git repo
    const isRepo = await g.checkIsRepo();
    if (!isRepo) return null;

    // Branch
    const branch = (await g.revparse(['--abbrev-ref', 'HEAD'])).trim();

    // Status (uncommitted + staged)
    const status = await g.status();
    const uncommittedFiles = [
      ...status.modified.map(p => ({ path: p, status: 'modified' })),
      ...status.not_added.map(p => ({ path: p, status: 'untracked' })),
      ...status.deleted.map(p => ({ path: p, status: 'deleted' })),
    ];
    const stagedFiles = [
      ...status.staged.map(p => ({ path: p, status: 'staged' })),
      ...status.created.map(p => ({ path: p, status: 'new file' })),
    ];

    // Stash list
    const stashes: { index: number; message: string }[] = [];
    try {
      const stashResult = await g.stashList();
      stashResult.all.forEach((entry, i) => {
        stashes.push({ index: i, message: entry.message });
      });
    } catch (_) { /* no stashes */ }

    // Recent commits (last 5)
    const recentCommits: GitState['recentCommits'] = [];
    try {
      const log = await g.log({ maxCount: 5 });
      for (const entry of log.all) {
        const commitDate = new Date(entry.date);
        recentCommits.push({
          hash: entry.hash.substring(0, 7),
          message: entry.message.split('\n')[0], // first line only
          date: entry.date,
          relative: formatRelativeTime(commitDate),
        });
      }
    } catch (_) { /* empty repo */ }

    // Unpushed commits
    let hasUnpushed = false;
    let unpushedCount = 0;
    try {
      const tracking = await g.raw(['rev-list', '--count', '@{u}..HEAD']);
      unpushedCount = parseInt(tracking.trim()) || 0;
      hasUnpushed = unpushedCount > 0;
    } catch (_) { /* no upstream */ }

    return {
      branch,
      uncommittedFiles,
      stagedFiles,
      stashes,
      recentCommits,
      hasUnpushed,
      unpushedCount,
    };
  } catch (_) {
    return null;
  }
}

// ── TODO Scanner ──────────────────────────────────────────────

// Match TODO/FIXME/HACK/XXX only in actual code comments (// or # or * or --)
const TODO_REGEX = /(?:\/\/|#|\/?\*+|--)\s*\b(TODO|FIXME|HACK|XXX)\b[:\s]+(.*)/i;
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.sh', '.bash', '.zsh', '.ps1',
  '.yaml', '.yml', '.toml',
  '.md', '.mdx',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'target', 'out',
  'coverage', '.turbo', '.cache', '.parcel-cache',
  'vendor', 'bower_components',
]);

function scanTodos(projectPath: string, maxDepth = 4): TodoItem[] {
  const todos: TodoItem[] = [];
  const maxTodos = 20; // cap to avoid noise

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || todos.length >= maxTodos) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (_) { return; }

    for (const entry of entries) {
      if (todos.length >= maxTodos) break;
      if (entry.startsWith('.') && entry !== '.') continue;
      if (IGNORED_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch (_) { continue; }

      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        const ext = '.' + entry.split('.').pop()?.toLowerCase();
        if (!SCAN_EXTENSIONS.has(ext)) continue;

        // Only scan files modified in the last 48 hours
        const mtime = stat.mtimeMs;
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        if (mtime < cutoff) continue;

        // Skip files larger than 1 MB to avoid memory spikes on binary/large files
        if (stat.size > 1_048_576) continue;

        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(TODO_REGEX);
            if (match) {
              const relPath = relative(projectPath, fullPath).replace(/\\/g, '/');
              todos.push({
                file: relPath,
                line: i + 1,
                type: match[1].toUpperCase() as TodoItem['type'],
                text: match[2].trim(),
                modifiedAt: new Date(mtime).toISOString(),
              });
              if (todos.length >= maxTodos) break;
            }
          }
        } catch (_) { /* skip unreadable files */ }
      }
    }
  }

  walk(projectPath, 0);
  return todos;
}

// ── GitHub PRs (via `gh` CLI) ─────────────────────────────────

/** Shape of a single PR object returned by `gh pr list --json ...` */
interface GhPrResult {
  number: number;
  title: string;
  state: string;
  url: string;
  reviewDecision: string | null;
  isDraft: boolean;
  statusCheckRollup: Array<{ status: string; conclusion: string }> | null;
}

/** Run a command asynchronously with a timeout. Returns stdout or null on error. */
function execAsync(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      resolve(stdout);
    });
  });
}

async function collectPullRequests(projectPath: string): Promise<PullRequest[]> {
  try {
    // Check if `gh` CLI is available
    const versionCheck = await execAsync('gh', ['--version'], projectPath, 5000);
    if (versionCheck === null) return [];

    // Get open PRs authored by current user
    const result = await execAsync(
      'gh',
      ['pr', 'list', '--author', '@me', '--state', 'open', '--json', 'number,title,state,url,reviewDecision,isDraft,statusCheckRollup', '--limit', '10'],
      projectPath,
      15000
    );
    if (result === null) return [];

    const prs: GhPrResult[] = JSON.parse(result);
    return prs.map((pr) => {
      let ciStatus = 'unknown';
      if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
        const failed = pr.statusCheckRollup.some((c) => c.conclusion === 'FAILURE');
        const pending = pr.statusCheckRollup.some((c) => c.status === 'IN_PROGRESS' || c.status === 'QUEUED');
        ciStatus = failed ? 'failing' : pending ? 'pending' : 'passing';
      }

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.url,
        reviewComments: 0, // gh pr list doesn't give comment count directly
        ciStatus,
        isDraft: pr.isDraft || false,
      };
    });
  } catch (_) {
    // gh CLI not installed or not authenticated — silently skip
    return [];
  }
}

// ── Last Session (from codesession DB) ────────────────────────

function enrichSession(s: Session): LastSession {
  const aiUsage = getAIUsage(s.id!);
  const files = getFileChanges(s.id!);
  const notes = getNotes(s.id!);
  return {
    id: s.id!,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime || null,
    duration: s.duration ?? null,
    aiCost: s.aiCost,
    aiTokens: s.aiTokens,
    filesChanged: s.filesChanged,
    commits: s.commits,
    status: s.status,
    notes: s.notes || null,
    aiCalls: aiUsage.map(u => ({
      provider: u.provider,
      model: u.model,
      tokens: u.tokens,
      promptTokens: u.promptTokens || 0,
      completionTokens: u.completionTokens || 0,
      cost: u.cost,
      agentName: u.agentName || null,
      timestamp: u.timestamp,
    })),
    fileChanges: files.map(f => ({ path: f.filePath, type: f.changeType })),
    sessionNotes: notes.map(n => n.message),
  };
}

function getLastSessionForProject(projectPath: string): LastSession | null {
  const sessions = getSessions(50);
  for (const s of sessions) {
    const dir = s.gitRoot || s.workingDirectory;
    const normDir = dir.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    const normProject = projectPath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    if (normDir === normProject || normProject.startsWith(normDir + '/') || normDir.startsWith(normProject + '/')) {
      return enrichSession(s);
    }
  }
  return null;
}

function getLastSessionGlobal(): LastSession | null {
  const sessions = getSessions(1);
  if (sessions.length === 0) return null;
  return enrichSession(sessions[0]);
}

// ── Snapshot Builder ──────────────────────────────────────────

export async function buildSnapshot(): Promise<TodaySnapshot> {
  const projects = getTodayProjects();
  const snapshots: ProjectSnapshot[] = [];

  for (const project of projects) {
    const projectPath = project.path;
    if (!existsSync(projectPath)) continue;

    const [git, todos, prs] = await Promise.all([
      collectGitState(projectPath),
      Promise.resolve(scanTodos(projectPath)),
      collectPullRequests(projectPath),
    ]);

    snapshots.push({
      path: projectPath,
      name: project.name || basename(projectPath),
      isGitRepo: git !== null,
      git,
      todos,
      pullRequests: prs,
      lastSession: getLastSessionForProject(projectPath),
    });
  }

  return {
    timestamp: new Date().toISOString(),
    projects: snapshots,
    lastSessionGlobal: getLastSessionGlobal(),
  };
}

// ── Formatters ────────────────────────────────────────────────

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Human-Readable Output ─────────────────────────────────────

/** Pad content to exactly W visible chars, ignoring ANSI escape codes */
function padLine(content: string, width: number): string {
  const visible = stripAnsi(content).length;
  if (visible >= width) return content;
  return content + ' '.repeat(width - visible);
}

/** Build a box line: │ <content padded to W> │ */
function boxLine(content: string, W: number): string {
  return chalk.cyan('  │') + padLine(content, W) + chalk.cyan('│');
}

export function formatHuman(snapshot: TodaySnapshot): string {
  const lines: string[] = [];
  const W = 68; // inner width

  // Header — last session timing
  if (snapshot.lastSessionGlobal) {
    const s = snapshot.lastSessionGlobal;
    const start = formatSessionTime(s.startTime);
    const end = s.endTime ? formatSessionTime(s.endTime) : 'ongoing';
    const dur = s.duration ? ` (${formatDuration(s.duration)})` : '';
    lines.push('');
    lines.push(chalk.gray(`  Last session: ${start} → ${end}${dur}`));
    if (s.aiCost > 0) {
      lines.push(chalk.gray(`  Cost: $${s.aiCost.toFixed(2)} · ${s.aiTokens.toLocaleString()} tokens`));
    }
    lines.push('');
  }

  // Per-project sections
  const hasWork = snapshot.projects.some(p => {
    const g = p.git;
    return g && (g.uncommittedFiles.length > 0 || g.stagedFiles.length > 0 || g.stashes.length > 0);
  });
  const hasTodos = snapshot.projects.some(p => p.todos.length > 0);
  const hasPRs = snapshot.projects.some(p => p.pullRequests.length > 0);

  if (hasWork || snapshot.projects.some(p => p.git !== null)) {
    lines.push(chalk.cyan(`  ┌─ You were working on ${'─'.repeat(W - 24)}┐`));

    for (const p of snapshot.projects) {
      if (!p.git) continue;
      const g = p.git;
      const hasChanges = g.uncommittedFiles.length > 0 || g.stagedFiles.length > 0;
      const hasStash = g.stashes.length > 0;
      if (!hasChanges && !hasStash && g.recentCommits.length === 0) continue;

      lines.push(boxLine('', W));
      lines.push(boxLine(`  ${chalk.bold.white(g.branch)} ${chalk.gray(`(${p.name})`)}`, W));

      // File change summary
      if (hasChanges) {
        const total = g.uncommittedFiles.length + g.stagedFiles.length;
        const parts: string[] = [];
        const modified = g.uncommittedFiles.filter(f => f.status === 'modified').length + g.stagedFiles.length;
        const untracked = g.uncommittedFiles.filter(f => f.status === 'untracked').length;
        const deleted = g.uncommittedFiles.filter(f => f.status === 'deleted').length;
        if (modified > 0) parts.push(`${modified} modified`);
        if (untracked > 0) parts.push(`${untracked} untracked`);
        if (deleted > 0) parts.push(`${deleted} deleted`);
        const summary = `    ${total} file${total !== 1 ? 's' : ''} changed (${parts.join(', ')})`;
        lines.push(boxLine(chalk.yellow(summary), W));
      }

      // Unpushed commits
      if (g.hasUnpushed) {
        const msg = `    ${g.unpushedCount} unpushed commit${g.unpushedCount !== 1 ? 's' : ''}`;
        lines.push(boxLine(chalk.magenta(msg), W));
      }

      // Stash
      if (hasStash) {
        for (const stash of g.stashes.slice(0, 3)) {
          const msg = `    Stash: "${truncate(stash.message, W - 16)}"`;
          lines.push(boxLine(chalk.gray(msg), W));
        }
      }
    }

    lines.push(boxLine('', W));

    // PRs section
    if (hasPRs) {
      lines.push(chalk.cyan(`  ├─ Open PRs ${'─'.repeat(W - 12)}┤`));
      lines.push(boxLine('', W));

      for (const p of snapshot.projects) {
        for (const pr of p.pullRequests) {
          const draft = pr.isDraft ? ' [draft]' : '';
          const ci = pr.ciStatus === 'failing' ? chalk.red(' ✗ CI') :
                     pr.ciStatus === 'pending' ? chalk.yellow(' ◎ CI') :
                     pr.ciStatus === 'passing' ? chalk.green(' ✓ CI') : '';
          const plainTitle = `    #${pr.number} ${pr.title}${draft}`;
          const displayTitle = truncate(plainTitle, W - 8);
          lines.push(boxLine(`${chalk.white(displayTitle)}${ci}`, W));
        }
      }

      lines.push(boxLine('', W));
    }

    // TODOs section
    if (hasTodos) {
      lines.push(chalk.cyan(`  ├─ TODOs from recent files ${'─'.repeat(W - 27)}┤`));
      lines.push(boxLine('', W));

      let todoCount = 0;
      for (const p of snapshot.projects) {
        for (const todo of p.todos.slice(0, 8)) {
          if (todoCount >= 8) break;
          const loc = `${todo.file}:${todo.line}`;
          const typeColor = todo.type === 'FIXME' ? chalk.red : todo.type === 'HACK' ? chalk.magenta : chalk.yellow;
          const maxText = W - loc.length - todo.type.length - 14;
          const content = `    ${chalk.gray(loc)}  ${typeColor(todo.type)}: ${truncate(todo.text, maxText)}`;
          lines.push(boxLine(content, W));
          todoCount++;
        }
      }

      lines.push(boxLine('', W));
    }

    // Last session section
    if (snapshot.lastSessionGlobal && snapshot.lastSessionGlobal.status === 'completed') {
      const s = snapshot.lastSessionGlobal;
      lines.push(chalk.cyan(`  ├─ Last session ${'─'.repeat(W - 16)}┤`));
      lines.push(boxLine('', W));
      lines.push(boxLine(`    ${chalk.white(`"${truncate(s.name, W - 10)}"`)}`, W));
      const details: string[] = [];
      if (s.duration) details.push(formatDuration(s.duration));
      if (s.filesChanged > 0) details.push(`${s.filesChanged} files`);
      if (s.commits > 0) details.push(`${s.commits} commits`);
      if (s.aiCost > 0) details.push(`$${s.aiCost.toFixed(2)}`);
      if (details.length > 0) {
        lines.push(boxLine(chalk.gray(`    ${details.join(' · ')}`), W));
      }
      lines.push(boxLine('', W));
    }

    lines.push(chalk.cyan(`  └${'─'.repeat(W)}┘`));
  } else {
    lines.push('');
    lines.push(chalk.gray('  No recent activity across registered projects.'));
  }

  lines.push('');
  return lines.join('\n');
}

// ── AI Output (markdown for pasting into Claude/ChatGPT) ──────

export function formatAI(snapshot: TodaySnapshot): string {
  const lines: string[] = [];

  lines.push('# Developer Context — ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  lines.push('');
  lines.push('Use this context to understand where I left off and help me continue.');
  lines.push('');

  // Last session
  if (snapshot.lastSessionGlobal) {
    const s = snapshot.lastSessionGlobal;
    lines.push('## Last Session');
    lines.push(`- **Task:** ${s.name}`);
    lines.push(`- **Time:** ${formatSessionTime(s.startTime)} → ${s.endTime ? formatSessionTime(s.endTime) : 'ongoing'}`);
    if (s.duration) lines.push(`- **Duration:** ${formatDuration(s.duration)}`);
    if (s.aiCost > 0) lines.push(`- **AI Cost:** $${s.aiCost.toFixed(2)} (${s.aiTokens.toLocaleString()} tokens)`);
    if (s.filesChanged > 0) lines.push(`- **Files Changed:** ${s.filesChanged}`);
    if (s.commits > 0) lines.push(`- **Commits:** ${s.commits}`);
    if (s.notes) lines.push(`- **Notes:** ${s.notes}`);

    // AI call breakdown
    if (s.aiCalls.length > 0) {
      lines.push('- **AI Calls:**');
      // Group by model for concise display
      const byModel = new Map<string, { calls: number; cost: number; tokens: number; agents: Set<string> }>();
      for (const call of s.aiCalls) {
        const key = `${call.provider}/${call.model}`;
        const existing = byModel.get(key) || { calls: 0, cost: 0, tokens: 0, agents: new Set<string>() };
        existing.calls++;
        existing.cost += call.cost;
        existing.tokens += call.tokens;
        if (call.agentName) existing.agents.add(call.agentName);
        byModel.set(key, existing);
      }
      for (const [model, data] of byModel) {
        const agentStr = data.agents.size > 0 ? ` (agent: ${[...data.agents].join(', ')})` : '';
        lines.push(`  - \`${model}\` — ${data.calls} call${data.calls !== 1 ? 's' : ''}, $${data.cost.toFixed(4)}, ${data.tokens.toLocaleString()} tokens${agentStr}`);
      }
      // Last AI call timestamp
      const lastCall = s.aiCalls[s.aiCalls.length - 1];
      const lastCallTime = formatRelativeTime(new Date(lastCall.timestamp));
      lines.push(`  - _Last AI call: ${lastCallTime} (${lastCall.provider}/${lastCall.model})_`);
    }

    // Files touched in the session
    if (s.fileChanges.length > 0) {
      lines.push('- **Files touched in session:**');
      for (const f of s.fileChanges.slice(0, 15)) {
        lines.push(`  - \`${f.path}\` (${f.type})`);
      }
      if (s.fileChanges.length > 15) {
        lines.push(`  - _...and ${s.fileChanges.length - 15} more_`);
      }
    }

    // Session notes/annotations
    if (s.sessionNotes.length > 0) {
      lines.push('- **Session notes:**');
      for (const note of s.sessionNotes) {
        lines.push(`  - ${note}`);
      }
    }

    lines.push('');
  }

  // Projects
  for (const p of snapshot.projects) {
    lines.push(`## Project: ${p.name}`);
    lines.push(`- **Path:** \`${p.path}\``);

    if (p.git) {
      lines.push(`- **Branch:** \`${p.git.branch}\``);

      if (p.git.uncommittedFiles.length > 0) {
        lines.push('- **Uncommitted changes:**');
        for (const f of p.git.uncommittedFiles.slice(0, 15)) {
          lines.push(`  - \`${f.path}\` (${f.status})`);
        }
        if (p.git.uncommittedFiles.length > 15) {
          lines.push(`  - _...and ${p.git.uncommittedFiles.length - 15} more_`);
        }
      }

      if (p.git.stagedFiles.length > 0) {
        lines.push('- **Staged for commit:**');
        for (const f of p.git.stagedFiles) {
          lines.push(`  - \`${f.path}\` (${f.status})`);
        }
      }

      if (p.git.stashes.length > 0) {
        lines.push('- **Stashes:**');
        for (const s of p.git.stashes) {
          lines.push(`  - stash@{${s.index}}: ${s.message}`);
        }
      }

      if (p.git.hasUnpushed) {
        lines.push(`- **Unpushed commits:** ${p.git.unpushedCount}`);
      }

      if (p.git.recentCommits.length > 0) {
        lines.push('- **Recent commits:**');
        for (const c of p.git.recentCommits) {
          lines.push(`  - \`${c.hash}\` ${c.message} (${c.relative})`);
        }
      }
    }

    // PRs
    if (p.pullRequests.length > 0) {
      lines.push('- **Open PRs:**');
      for (const pr of p.pullRequests) {
        const flags = [
          pr.isDraft ? 'draft' : null,
          pr.ciStatus !== 'unknown' ? `CI: ${pr.ciStatus}` : null,
        ].filter(Boolean).join(', ');
        lines.push(`  - #${pr.number}: ${pr.title}${flags ? ` (${flags})` : ''}`);
      }
    }

    // TODOs
    if (p.todos.length > 0) {
      lines.push('- **TODOs in recently modified files:**');
      for (const t of p.todos) {
        lines.push(`  - \`${t.file}:${t.line}\` — ${t.type}: ${t.text}`);
      }
    }

    // Last session for this project
    if (p.lastSession) {
      lines.push(`- **Last codesession:** "${p.lastSession.name}" — ${p.lastSession.status}`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated by `cs today --ai` — [codesession-cli](https://github.com/brian-mwirigi/codesession-cli)_');

  return lines.join('\n');
}

// ── Share Output (standup message) ────────────────────────────

export function formatShare(snapshot: TodaySnapshot): string {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  lines.push(`**Standup — ${today}**`);
  lines.push('');

  // Yesterday section
  if (snapshot.lastSessionGlobal) {
    const s = snapshot.lastSessionGlobal;
    lines.push('**Yesterday:**');
    lines.push(`• Worked on: ${s.name}`);
    if (s.duration) lines.push(`• Time: ${formatDuration(s.duration)}`);
    if (s.filesChanged > 0 || s.commits > 0) {
      const parts = [];
      if (s.filesChanged > 0) parts.push(`${s.filesChanged} files changed`);
      if (s.commits > 0) parts.push(`${s.commits} commits`);
      lines.push(`• Output: ${parts.join(', ')}`);
    }
    lines.push('');
  }

  // Today section — what's in progress
  lines.push('**Today:**');
  let hasItems = false;

  for (const p of snapshot.projects) {
    if (p.git) {
      const g = p.git;
      if (g.uncommittedFiles.length > 0 || g.stagedFiles.length > 0) {
        lines.push(`• Continue work on \`${g.branch}\` (${p.name}) — ${g.uncommittedFiles.length + g.stagedFiles.length} uncommitted files`);
        hasItems = true;
      }
      if (g.stashes.length > 0) {
        lines.push(`• Apply stash in ${p.name}: "${g.stashes[0].message}"`);
        hasItems = true;
      }
    }
    for (const pr of p.pullRequests) {
      if (pr.ciStatus === 'failing') {
        lines.push(`• Fix CI on PR #${pr.number}: ${pr.title}`);
        hasItems = true;
      }
    }
  }

  // TODOs
  const allTodos = snapshot.projects.flatMap(p => p.todos);
  if (allTodos.length > 0) {
    lines.push(`• ${allTodos.length} TODO${allTodos.length !== 1 ? 's' : ''} to address`);
    hasItems = true;
  }

  if (!hasItems) {
    lines.push('• (checking priorities)');
  }

  // Blockers
  lines.push('');
  lines.push('**Blockers:** None');

  return lines.join('\n');
}

// ── JSON Output ───────────────────────────────────────────────

export function formatJSON(snapshot: TodaySnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ── Helpers ───────────────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\u001B\[[\d;]*m/g, '');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}
