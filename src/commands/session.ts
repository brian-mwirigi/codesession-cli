/**
 * Session lifecycle commands: start, end, show, list, stats, status, recover
 */

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
  addFileChange,
  addCommit,
  getAIUsage,
  getNotes,
  recoverStaleSessions,
} from '../db';
import { initGit, startGitPolling, stopGitPolling, getGitInfo, getGitRoot, getGitHead, getGitDiffFiles, getGitLogCommits } from '../git';
import { startWatcher, stopWatcher } from '../watcher';
import { displaySession, displaySessions, displayStats, displayFileChanges, displayCommits } from '../formatters';
import { formatDuration } from '../formatters';
import { jsonError, jsonWrap, resolveActiveSession, sessionToJSON } from './helpers';

export function register(program: Command): void {

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

      // Resolve to git root when inside a repo (avoids subdirectory fragmentation)
      const gitRoot = await getGitRoot(cwd);
      const scopeDir = gitRoot || cwd;

      // Check for existing active sessions
      const allActive = getActiveSessions();

      if (allActive.length > 0) {
        // --resume: reuse the active session for this directory/git root
        if (options.resume) {
          const forDir = getActiveSessionForDir(scopeDir);
          if (forDir) {
            // Initialize git for the resumed session to get git info
            initGit(forDir.id!, scopeDir);
            if (options.json) {
              const gitInfo = await getGitInfo(forDir.id!);
              console.log(JSON.stringify(jsonWrap({ id: forDir.id, name: forDir.name, directory: scopeDir, branch: gitInfo?.branch || null, resumed: true })));
              process.exit(0);
            } else {
              console.log(chalk.green(`\nResumed session: ${forDir.name} (id: ${forDir.id})`));
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
          // Only block if there's already an active session for THIS directory
          // Different directories/git roots can run parallel sessions
          const sameDir = getActiveSessionForDir(scopeDir);
          if (sameDir) {
            if (options.json) {
              jsonError('session_active', `Session "${sameDir.name}" is already active for this directory`, {
                activeSession: sameDir.name,
                id: sameDir.id,
                hint: 'Use --resume to reattach or --close-stale to auto-close',
              });
            } else {
              console.log(chalk.yellow(`\nSession "${sameDir.name}" is already active for this directory (id: ${sameDir.id}).`));
              console.log(chalk.gray('  Options:'));
              console.log(chalk.gray('    cs end              — end it manually'));
              console.log(chalk.gray('    cs start --resume   — reuse session for this directory'));
              console.log(chalk.gray('    cs start --close-stale — auto-close stale sessions\n'));
            }
            return;
          }
          // Different directory — allow parallel session
        }
      }

      // Capture git HEAD at session start for later diff-based file/commit scan
      const startHead = await getGitHead(scopeDir);

      const sessionId = createSession({
        name,
        startTime: new Date().toISOString(),
        workingDirectory: scopeDir,
        gitRoot: gitRoot || undefined,
        startGitHead: startHead || undefined,
        filesChanged: 0,
        commits: 0,
        aiCost: 0,
        aiTokens: 0,
        status: 'active',
      });

      // Initialize git tracking
      initGit(sessionId, scopeDir);

      // Start file watcher (only for long-running mode, not --json agent calls)
      if (!options.json) {
        startWatcher(sessionId, scopeDir);

        // Start git commit polling (checks every 10 seconds)
        startGitPolling(sessionId, 10000);
      }

      if (options.json) {
        const gitInfo = await getGitInfo(sessionId);
        console.log(JSON.stringify(jsonWrap({ id: sessionId, name, directory: scopeDir, gitRoot: gitRoot || null, branch: gitInfo?.branch || null })));
        process.exit(0);
      } else {
        const gitInfo = await getGitInfo(sessionId);
        console.log(chalk.green(`\nSession started: ${name}`));
        if (gitInfo) {
          console.log(chalk.gray(`  Branch: ${gitInfo.branch}`));
        }
        console.log(chalk.gray(`  Directory: ${scopeDir}`));
        if (gitRoot && gitRoot !== cwd) {
          console.log(chalk.gray(`  Git root: ${gitRoot} (scoped from ${cwd})`));
        }
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
    .action(async (options) => {
      let session;
      if (options.session) {
        session = getSession(options.session);
        if (!session || session.status !== 'active') {
          if (options.json) {
            jsonError('session_not_found', `No active session with id ${options.session}`, { id: options.session });
          } else {
            console.log(chalk.yellow(`\nNo active session with id ${options.session}.\n`));
          }
          return;
        }
      } else {
        session = await resolveActiveSession();
      }

      if (!session) {
        if (options.json) {
          jsonError('no_active_session', 'No active session to end');
        } else {
          console.log(chalk.yellow('\nNo active session.\n'));
        }
        return;
      }

      // Stop tracking
      void stopWatcher(session.id!);
      stopGitPolling(session.id!);

      // Git-based scan: if we stored a start HEAD, diff against current HEAD for accurate file/commit counts
      if (session.startGitHead) {
        const dir = session.gitRoot || session.workingDirectory;
        const diffFiles = await getGitDiffFiles(dir, session.startGitHead);
        const diffCommits = await getGitLogCommits(dir, session.startGitHead);

        // Record git-discovered file changes that weren't already tracked by watcher
        const existingFiles = new Set(getFileChanges(session.id!).map((f) => f.filePath));
        for (const f of diffFiles) {
          if (!existingFiles.has(f.filePath)) {
            addFileChange({
              sessionId: session.id!,
              filePath: f.filePath,
              changeType: f.changeType,
              timestamp: new Date().toISOString(),
            });
          }
        }
        // Record git-discovered commits not already tracked by poller
        const existing = getCommits(session.id!);
        const existingHashes = new Set(existing.map((c) => c.hash));
        for (const c of diffCommits) {
          if (!existingHashes.has(c.hash)) {
            addCommit({
              sessionId: session.id!,
              hash: c.hash,
              message: c.message,
              timestamp: c.timestamp,
            });
          }
        }
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
          console.log(chalk.green('\nSession ended\n'));
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
          jsonError('session_not_found', id ? `Session ${id} not found` : 'No sessions found');
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
        console.log(JSON.stringify(jsonWrap({
          totalSessions: stats.totalSessions,
          totalTime: stats.totalTime,
          totalTimeFormatted: formatDuration(stats.totalTime),
          totalFiles: stats.totalFiles,
          totalCommits: stats.totalCommits,
          totalAICost: stats.totalAICost,
          avgSessionTime: stats.avgSessionTime,
          avgSessionFormatted: formatDuration(stats.avgSessionTime),
        })));
      } else {
        displayStats(stats);
        console.log(chalk.dim('\n  Star on GitHub: https://github.com/brian-mwirigi/codesession-cli'));
      }
    });

  // ─── Status ────────────────────────────────────────────────────

  program
    .command('status')
    .description('Show active session status')
    .option('-s, --session <id>', 'Show a specific session by ID', parseInt)
    .option('--json', 'Output JSON (for agents)')
    .action(async (options) => {
      let session;
      if (options.session) {
        session = getSession(options.session);
      } else {
        session = await resolveActiveSession();
      }
      if (!session) {
        if (options.json) {
          jsonError('no_active_session', 'No active session');
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

  // ─── Recover ──────────────────────────────────────────────────

  program
    .command('recover')
    .description('Auto-end stale active sessions older than N hours')
    .option('--max-age <hours>', 'Max age in hours before a session is considered stale', parseFloat, 24)
    .option('--json', 'Output JSON (for agents)')
    .action((options) => {
      const recovered = recoverStaleSessions(options.maxAge);
      if (options.json) {
        console.log(JSON.stringify(jsonWrap({ recovered: recovered.length, sessions: recovered.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime })) })));
      } else {
        if (recovered.length === 0) {
          console.log(chalk.gray(`\nNo stale sessions found (older than ${options.maxAge}h).\n`));
        } else {
          console.log(chalk.green(`\nRecovered ${recovered.length} stale session(s):`));
          for (const s of recovered) {
            console.log(chalk.gray(`  #${s.id} "${s.name}" (started ${s.startTime})`));
          }
          console.log();
        }
      }
    });
}
