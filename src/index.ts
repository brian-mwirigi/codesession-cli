#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { 
  createSession, 
  getActiveSession,
  getActiveSessions,
  getActiveSessionForDir,
  endSession, 
  getSession, 
  getSessions, 
  getStats,
  getFileChanges,
  getCommits,
  addAIUsage,
  getAIUsage,
  exportSessions,
  loadPricing,
  setPricing,
  resetPricing,
  getPricingPath,
  addNote,
  getNotes,
  recoverStaleSessions,
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
  .version('1.4.0');

// ─── Helpers ───────────────────────────────────────────────────

function sessionToJSON(session: any, extras?: { files?: any[]; commits?: any[]; aiUsage?: any[]; notes?: any[] }) {
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
  if (extras?.notes) obj.annotations = extras.notes;
  return obj;
}

// ─── Pricing ────────────────────────────────────────────────────

function estimateCost(model: string, promptTokens: number, completionTokens: number): number | null {
  const pricing = loadPricing();
  const entry = pricing[model];
  if (!entry) return null;
  return (promptTokens * entry.input + completionTokens * entry.output) / 1_000_000;
}

// ─── Start ─────────────────────────────────────────────────────

program
  .command('start')
  .description('Start a new coding session')
  .argument('<name>', 'Session name')
  .option('--json', 'Output JSON (for agents)')
  .option('--resume', 'Resume existing active session for this directory instead of failing')
  .option('--close-stale', 'Auto-close any existing active sessions before starting')
  .action(async (name: string, options: any) => {
    const cwd = process.cwd();

    // Check for existing active sessions
    const allActive = getActiveSessions();

    if (allActive.length > 0) {
      // --resume: reuse the active session for this directory
      if (options.resume) {
        const forDir = getActiveSessionForDir(cwd);
        if (forDir) {
          if (options.json) {
            const gitInfo = await getGitInfo();
            console.log(JSON.stringify({ id: forDir.id, name: forDir.name, directory: cwd, branch: gitInfo?.branch || null, resumed: true }));
            process.exit(0);
          } else {
            console.log(chalk.green(`\n✓ Resumed session: ${forDir.name} (id: ${forDir.id})`));
            console.log(chalk.gray(`  Started: ${forDir.startTime}\n`));
          }
          return;
        }
        // No active session for this dir — fall through and create new one
      }

      // --close-stale: end all existing active sessions
      if (options.closeStale) {
        for (const s of allActive) {
          endSession(s.id!, new Date().toISOString(), `Auto-closed by new session "${name}"`);
        }
        if (!options.json) {
          console.log(chalk.gray(`  Closed ${allActive.length} stale session(s)`));
        }
      } else if (!options.resume) {
        // Default: warn about active session
        const active = allActive[0];
        if (options.json) {
          console.log(JSON.stringify({
            error: 'session_active',
            activeSession: active.name,
            id: active.id,
            hint: 'Use --resume to reattach or --close-stale to auto-close',
          }));
        } else {
          console.log(chalk.yellow(`\nSession "${active.name}" is already active (id: ${active.id}).`));
          console.log(chalk.gray('  Options:'));
          console.log(chalk.gray('    cs end              — end it manually'));
          console.log(chalk.gray('    cs start --resume   — reuse session for this directory'));
          console.log(chalk.gray('    cs start --close-stale — auto-close stale sessions\n'));
        }
        return;
      }
    }

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
  .option('-s, --session <id>', 'End a specific session by ID', parseInt)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    let session;
    if (options.session) {
      session = getSession(options.session);
      if (!session || session.status !== 'active') {
        if (options.json) {
          console.log(JSON.stringify({ error: 'session_not_found', id: options.session }));
        } else {
          console.log(chalk.yellow(`\nNo active session with id ${options.session}.\n`));
        }
        return;
      }
    } else {
      session = getActiveSession();
    }

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
        const notes = getNotes(updated.id!);
        console.log(JSON.stringify(sessionToJSON(updated, { files, commits, aiUsage, notes })));
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
      extras.notes = getNotes(session.id!);
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
  .option('-t, --tokens <tokens>', 'Total tokens', parseInt)
  .option('-c, --cost <cost>', 'Cost in dollars (auto-calculated if omitted)', parseFloat)
  .option('--prompt-tokens <n>', 'Prompt/input tokens', parseInt)
  .option('--completion-tokens <n>', 'Completion/output tokens', parseInt)
  .option('-s, --session <id>', 'Target a specific session by ID', parseInt)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    let session;
    if (options.session) {
      session = getSession(options.session);
      if (!session || session.status !== 'active') {
        if (options.json) {
          console.log(JSON.stringify({ error: 'session_not_found', id: options.session }));
        } else {
          console.log(chalk.yellow(`\nNo active session with id ${options.session}.\n`));
        }
        return;
      }
    } else {
      session = getActiveSession();
    }
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_active_session' }));
      } else {
        console.log(chalk.yellow('\nNo active session. Start one with: cs start <name>\n'));
      }
      return;
    }

    const promptTk = options.promptTokens || 0;
    const completionTk = options.completionTokens || 0;
    const totalTokens = options.tokens || (promptTk + completionTk);

    if (totalTokens === 0) {
      const msg = 'Must provide --tokens or --prompt-tokens/--completion-tokens';
      if (options.json) {
        console.log(JSON.stringify({ error: 'missing_tokens', message: msg }));
      } else {
        console.log(chalk.red(`\n✗ ${msg}\n`));
      }
      return;
    }

    let cost = options.cost;
    if (cost === undefined || cost === null) {
      // Auto-calculate from pricing table
      const auto = estimateCost(options.model, promptTk || totalTokens * 0.7, completionTk || totalTokens * 0.3);
      if (auto !== null) {
        cost = Math.round(auto * 1e10) / 1e10;
      } else {
        const msg = `Unknown model "${options.model}" — provide -c <cost> or use --prompt-tokens/--completion-tokens with a known model`;
        if (options.json) {
          console.log(JSON.stringify({ error: 'unknown_model', message: msg }));
        } else {
          console.log(chalk.red(`\n✗ ${msg}\n`));
        }
        return;
      }
    }

    addAIUsage({
      sessionId: session.id!,
      provider: options.provider,
      model: options.model,
      tokens: totalTokens,
      promptTokens: promptTk || undefined,
      completionTokens: completionTk || undefined,
      cost,
      timestamp: new Date().toISOString(),
    });

    // Re-read the updated session
    const updated = getSession(session.id!);
    if (options.json) {
      console.log(JSON.stringify({
        logged: { provider: options.provider, model: options.model, tokens: totalTokens, promptTokens: promptTk || undefined, completionTokens: completionTk || undefined, cost },
        session: { id: session.id, aiCost: updated?.aiCost || 0, aiTokens: updated?.aiTokens || 0 },
      }));
    } else {
      console.log(chalk.green(`\n✓ Logged: ${totalTokens.toLocaleString()} tokens, ${formatCost(cost)}`));
      console.log(chalk.gray(`  Session total: ${(updated?.aiTokens || 0).toLocaleString()} tokens, ${formatCost(updated?.aiCost || 0)}\n`));
    }
  });

// ─── Status ────────────────────────────────────────────────────

program
  .command('status')
  .description('Show active session status')
  .option('-s, --session <id>', 'Show a specific session by ID', parseInt)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    let session;
    if (options.session) {
      session = getSession(options.session);
    } else {
      session = getActiveSession();
    }
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
      const notes = getNotes(session.id!);
      console.log(JSON.stringify({
        ...sessionToJSON(session, { notes }),
        liveDuration,
        liveDurationFormatted: formatDuration(liveDuration),
        aiUsage,
      }));
    } else {
      displaySession(session);
    }
  });

// ─── Export ─────────────────────────────────────────────────

program
  .command('export')
  .description('Export sessions as JSON or CSV')
  .option('-f, --format <format>', 'Output format: json or csv', 'json')
  .option('-l, --limit <n>', 'Number of sessions to export', parseInt)
  .action((options) => {
    const format = options.format === 'csv' ? 'csv' : 'json';
    const output = exportSessions(format, options.limit);
    console.log(output);
  });

// ─── Pricing ────────────────────────────────────────────────

const pricingCmd = program
  .command('pricing')
  .description('Manage the model pricing table used for cost auto-calculation');

pricingCmd
  .command('list')
  .description('Show all known model prices')
  .option('--json', 'Output JSON')
  .action((options) => {
    const pricing = loadPricing();
    if (options.json) {
      console.log(JSON.stringify(pricing, null, 2));
    } else {
      console.log(chalk.bold('\nModel Pricing (per 1M tokens)\n'));
      const sorted = Object.entries(pricing).sort(([a], [b]) => a.localeCompare(b));
      for (const [model, p] of sorted) {
        console.log(`  ${chalk.cyan(model.padEnd(24))} input: $${p.input.toFixed(2).padStart(6)}   output: $${p.output.toFixed(2).padStart(6)}`);
      }
      console.log(chalk.gray(`\n  Config: ${getPricingPath()}\n`));
    }
  });

pricingCmd
  .command('set <model> <input> <output>')
  .description('Set pricing for a model (per 1M tokens)')
  .action((model: string, input: string, output: string) => {
    const inp = parseFloat(input);
    const out = parseFloat(output);
    if (isNaN(inp) || isNaN(out)) {
      console.log(chalk.red('\n✗ Input and output must be numbers (dollars per 1M tokens)\n'));
      return;
    }
    setPricing(model, inp, out);
    console.log(chalk.green(`\n✓ ${model}: input=$${inp}/1M, output=$${out}/1M`));
    console.log(chalk.gray(`  Saved to ${getPricingPath()}\n`));
  });

pricingCmd
  .command('reset')
  .description('Remove all custom pricing overrides (revert to defaults)')
  .action(() => {
    resetPricing();
    console.log(chalk.green('\n✓ Pricing reset to defaults\n'));
  });

// ─── Note ─────────────────────────────────────────────────────

program
  .command('note')
  .description('Add a timestamped annotation to the active session')
  .argument('<message>', 'Note message')
  .option('-s, --session <id>', 'Target a specific session by ID', parseInt)
  .option('--json', 'Output JSON (for agents)')
  .action((message: string, options) => {
    let session;
    if (options.session) {
      session = getSession(options.session);
      if (!session || session.status !== 'active') {
        if (options.json) {
          console.log(JSON.stringify({ error: 'session_not_found', id: options.session }));
        } else {
          console.log(chalk.yellow(`\nNo active session with id ${options.session}.\n`));
        }
        return;
      }
    } else {
      session = getActiveSession();
    }
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_active_session' }));
      } else {
        console.log(chalk.yellow('\nNo active session.\n'));
      }
      return;
    }

    const note = addNote(session.id!, message);
    if (options.json) {
      console.log(JSON.stringify(note));
    } else {
      console.log(chalk.green(`\n✓ Note added to session ${session.id}: "${message}"\n`));
    }
  });

// ─── Recover ──────────────────────────────────────────────────

program
  .command('recover')
  .description('Auto-end stale active sessions older than N hours')
  .option('--max-age <hours>', 'Max age in hours before a session is considered stale', parseFloat, 24)
  .option('--json', 'Output JSON (for agents)')
  .action((options) => {
    const recovered = recoverStaleSessions(options.maxAge);
    if (options.json) {
      console.log(JSON.stringify({ recovered: recovered.length, sessions: recovered.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime })) }));
    } else {
      if (recovered.length === 0) {
        console.log(chalk.gray(`\nNo stale sessions found (older than ${options.maxAge}h).\n`));
      } else {
        console.log(chalk.green(`\n✓ Recovered ${recovered.length} stale session(s):`));
        for (const s of recovered) {
          console.log(chalk.gray(`  #${s.id} "${s.name}" (started ${s.startTime})`));
        }
        console.log();
      }
    }
  });

// Only parse CLI args when run directly (not when imported as a library)
if (require.main === module) {
  program.parse();
}

// Programmatic API exports
export { createSession, getActiveSession, getActiveSessions, getActiveSessionForDir, endSession, getSession, getSessions, getStats, addFileChange, addCommit, addAIUsage, getFileChanges, getCommits, getAIUsage, exportSessions, loadPricing, setPricing, resetPricing, getPricingPath, addNote, getNotes, recoverStaleSessions } from './db';
export { initGit, checkForNewCommits, getGitInfo } from './git';
export { startWatcher, stopWatcher } from './watcher';
export { Session, FileChange, Commit, AIUsage, SessionStats, SessionNote } from './types';
export { AgentSession, AgentSessionConfig, AgentSessionSummary, BudgetExceededError, runAgentSession } from './agents';
