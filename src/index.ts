#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { 
  createSession, 
  getActiveSession, 
  endSession, 
  getSession, 
  getSessions, 
  getStats,
  getFileChanges,
  getCommits,
  addAIUsage,
  getAIUsage,
} from './db';
import { initGit, checkForNewCommits, getGitInfo } from './git';
import { startWatcher, stopWatcher } from './watcher';
import { 
  displaySession, 
  displaySessions, 
  displayStats,
  displayFileChanges,
  displayCommits
} from './formatters';
import { formatDuration, formatCost } from './formatters';

const program = new Command();

program
  .name('codesession')
  .description('Track AI coding sessions & agent runs — time, files, commits, costs')
  .version('1.2.0');

// ─── Helpers ───────────────────────────────────────────────────

function sessionToJSON(session: any, extras?: { files?: any[]; commits?: any[]; aiUsage?: any[] }) {
  const obj: any = {
    id: session.id,
    name: session.name,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime || null,
    duration: session.duration || null,
    durationFormatted: session.duration ? formatDuration(session.duration) : null,
    workingDirectory: session.workingDirectory,
    filesChanged: session.filesChanged,
    commits: session.commits,
    aiTokens: session.aiTokens,
    aiCost: session.aiCost,
    notes: session.notes || null,
  };
  if (extras?.files) obj.files = extras.files;
  if (extras?.commits) obj.commits = extras.commits;
  if (extras?.aiUsage) obj.aiUsage = extras.aiUsage;
  return obj;
}

// ─── Start ─────────────────────────────────────────────────────

program
  .command('start')
  .description('Start a new coding session')
  .argument('<name>', 'Session name')
  .option('--json', 'Output JSON (for agents)')
  .action(async (name: string, options: any) => {
    const active = getActiveSession();
    if (active) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'session_active', activeSession: active.name, id: active.id }));
      } else {
        console.log(chalk.yellow(`\nSession "${active.name}" is already active.`));
        console.log(chalk.gray('End it with: cs end\n'));
      }
      return;
    }

    const cwd = process.cwd();
    const sessionId = createSession({
      name,
      startTime: new Date().toISOString(),
      workingDirectory: cwd,
      filesChanged: 0,
      commits: 0,
      aiCost: 0,
      aiTokens: 0,
      status: 'active',
    });

    // Initialize git tracking
    initGit(cwd);
    
    // Start file watcher (only for long-running mode, not --json agent calls)
    if (!options.json) {
      startWatcher(sessionId, cwd);

      // Check for commits every 10 seconds
      const gitInterval = setInterval(async () => {
        await checkForNewCommits(sessionId);
      }, 10000);

      // Store interval ID
      (global as any).gitInterval = gitInterval;
    }

    if (options.json) {
      const gitInfo = await getGitInfo();
      console.log(JSON.stringify({ id: sessionId, name, directory: cwd, branch: gitInfo?.branch || null }));
      process.exit(0);
    } else {
      const gitInfo = await getGitInfo();
      console.log(chalk.green(`\n✓ Session started: ${name}`));
      if (gitInfo) {
        console.log(chalk.gray(`  Branch: ${gitInfo.branch}`));
      }
      console.log(chalk.gray(`  Directory: ${cwd}`));
      console.log(chalk.gray('\n  Tracking: files, commits, AI usage'));
      console.log(chalk.gray('  End with: cs end\n'));
    }
  });

// ─── End ───────────────────────────────────────────────────────

program
  .command('end')
  .description('End the active session')
  .option('-n, --notes <notes>', 'Session notes')
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const session = getActiveSession();
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_active_session' }));
      } else {
        console.log(chalk.yellow('\nNo active session.\n'));
      }
      return;
    }

    // Stop tracking
    stopWatcher();
    if ((global as any).gitInterval) {
      clearInterval((global as any).gitInterval);
    }

    endSession(session.id!, new Date().toISOString(), options.notes);

    const updated = getSession(session.id!);
    if (updated) {
      if (options.json) {
        const files = getFileChanges(updated.id!);
        const commits = getCommits(updated.id!);
        const aiUsage = getAIUsage(updated.id!);
        console.log(JSON.stringify(sessionToJSON(updated, { files, commits, aiUsage })));
      } else {
        console.log(chalk.green('\n✓ Session ended\n'));
        displaySession(updated);
      }
    }
  });

// ─── Show ──────────────────────────────────────────────────────

program
  .command('show')
  .description('Show session details')
  .argument('[id]', 'Session ID (defaults to last session)')
  .option('--files', 'Show file changes')
  .option('--commits', 'Show commits')
  .option('--json', 'Output JSON (for agents)')
  .action((id: string | undefined, options) => {
    let session;
    
    if (id) {
      session = getSession(parseInt(id));
    } else {
      const sessions = getSessions(1);
      session = sessions[0];
    }

    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'session_not_found' }));
      } else {
        console.log(chalk.yellow('\nSession not found.\n'));
      }
      return;
    }

    if (options.json) {
      const extras: any = {};
      if (options.files) extras.files = getFileChanges(session.id!);
      if (options.commits) extras.commits = getCommits(session.id!);
      extras.aiUsage = getAIUsage(session.id!);
      console.log(JSON.stringify(sessionToJSON(session, extras)));
    } else {
      displaySession(session);
      if (options.files) {
        const files = getFileChanges(session.id!);
        displayFileChanges(files);
      }
      if (options.commits) {
        const commits = getCommits(session.id!);
        displayCommits(commits);
      }
    }
  });

// ─── List ──────────────────────────────────────────────────────

program
  .command('list')
  .alias('ls')
  .description('List recent sessions')
  .option('-l, --limit <number>', 'Number of sessions to show', parseInt, 10)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const sessions = getSessions(options.limit);
    if (options.json) {
      console.log(JSON.stringify(sessions.map((s) => sessionToJSON(s))));
    } else {
      displaySessions(sessions);
    }
  });

// ─── Stats ─────────────────────────────────────────────────────

program
  .command('stats')
  .description('Show overall statistics')
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const stats = getStats();
    if (options.json) {
      console.log(JSON.stringify({
        totalSessions: stats.totalSessions,
        totalTime: stats.totalTime,
        totalTimeFormatted: formatDuration(stats.totalTime),
        totalFiles: stats.totalFiles,
        totalCommits: stats.totalCommits,
        totalAICost: stats.totalAICost,
        avgSessionTime: stats.avgSessionTime,
        avgSessionFormatted: formatDuration(stats.avgSessionTime),
      }));
    } else {
      displayStats(stats);
    }
  });

// ─── Log AI ────────────────────────────────────────────────────

program
  .command('log-ai')
  .description('Log AI usage for active session')
  .requiredOption('-p, --provider <provider>', 'AI provider (anthropic, openai, google, etc.)')
  .requiredOption('-m, --model <model>', 'Model name')
  .requiredOption('-t, --tokens <tokens>', 'Total tokens', parseInt)
  .requiredOption('-c, --cost <cost>', 'Cost in dollars', parseFloat)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const session = getActiveSession();
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_active_session' }));
      } else {
        console.log(chalk.yellow('\nNo active session. Start one with: cs start <name>\n'));
      }
      return;
    }

    addAIUsage({
      sessionId: session.id!,
      provider: options.provider,
      model: options.model,
      tokens: options.tokens,
      cost: options.cost,
      timestamp: new Date().toISOString(),
    });

    // Re-read the updated session
    const updated = getSession(session.id!);
    if (options.json) {
      console.log(JSON.stringify({
        logged: { provider: options.provider, model: options.model, tokens: options.tokens, cost: options.cost },
        session: { id: session.id, aiCost: updated?.aiCost || 0, aiTokens: updated?.aiTokens || 0 },
      }));
    } else {
      console.log(chalk.green(`\n✓ Logged: ${options.tokens.toLocaleString()} tokens, ${formatCost(options.cost)}`));
      console.log(chalk.gray(`  Session total: ${(updated?.aiTokens || 0).toLocaleString()} tokens, ${formatCost(updated?.aiCost || 0)}\n`));
    }
  });

// ─── Status ────────────────────────────────────────────────────

program
  .command('status')
  .description('Show active session status')
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const session = getActiveSession();
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_active_session' }));
      } else {
        console.log(chalk.yellow('\nNo active session.\n'));
      }
      return;
    }

    if (options.json) {
      // Calculate live duration
      const now = new Date();
      const start = new Date(session.startTime);
      const liveDuration = Math.floor((now.getTime() - start.getTime()) / 1000);
      const aiUsage = getAIUsage(session.id!);
      console.log(JSON.stringify({
        ...sessionToJSON(session),
        liveDuration,
        liveDurationFormatted: formatDuration(liveDuration),
        aiUsage,
      }));
    } else {
      displaySession(session);
    }
  });

// Only parse CLI args when run directly (not when imported as a library)
if (require.main === module) {
  program.parse();
}

// Programmatic API exports
export { createSession, getActiveSession, endSession, getSession, getSessions, getStats, addFileChange, addCommit, addAIUsage, getFileChanges, getCommits, getAIUsage } from './db';
export { initGit, checkForNewCommits, getGitInfo } from './git';
export { startWatcher, stopWatcher } from './watcher';
export { Session, FileChange, Commit, AIUsage, SessionStats } from './types';
export { AgentSession, AgentSessionConfig, AgentSessionSummary, BudgetExceededError, runAgentSession } from './agents';
