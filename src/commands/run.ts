/**
 * Run command: start session → proxy → run → end → cost summary
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createSession,
  getActiveSessions,
  endSession,
  getSession,
  getFileChanges,
  getCommits,
  addFileChange,
  addCommit,
  getAIUsage,
} from '../db';
import { initGit, startGitPolling, stopGitPolling, getGitRoot, getGitHead, getGitDiffFiles, getGitLogCommits } from '../git';
import { stopWatcher } from '../watcher';
import { formatDuration, formatCost } from '../formatters';

export function register(program: Command): void {

  program
    .command('run')
    .description('Run a command with full auto-tracking: session + proxy + cost summary')
    .argument('<args...>', 'Command to run, e.g.: cs run python agent.py')
    .option('-n, --name <name>', 'Session name (defaults to the command string)')
    .option('-p, --port <port>', 'Proxy port (default: 3739)', parseInt, 3739)
    .option('--no-proxy', 'Skip the proxy (session is still tracked)')
    .passThroughOptions()
    .action(async (args: string[], options: any) => {
      const { spawn } = require('child_process');
      const { startProxy } = require('../proxy');

      const sessionName = (options.name || args.join(' ')).slice(0, 120);
      const port: number = options.port ?? 3739;
      const useProxy: boolean = options.proxy !== false;

      const cwd = process.cwd();
      const gitRoot = await getGitRoot(cwd);
      const scopeDir = gitRoot || cwd;

      // ── Auto-close any stale sessions ─────────────────────────
      const allActive = getActiveSessions();
      for (const s of allActive) {
        void stopWatcher(s.id!);
        stopGitPolling(s.id!);
        endSession(s.id!, new Date().toISOString(), `Auto-closed by cs run`);
      }

      const startHead = await getGitHead(scopeDir);
      const sessionId = createSession({
        name: sessionName,
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
      initGit(sessionId, scopeDir);

      // ── Start proxy ───────────────────────────────────────────
      let proxyServer: any = null;
      const extraEnv: Record<string, string> = {};

      if (useProxy) {
        try {
          proxyServer = await startProxy(port);
          extraEnv['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${port}`;
          extraEnv['OPENAI_BASE_URL']    = `http://127.0.0.1:${port}/v1`;
        } catch (err: any) {
          console.log(chalk.yellow(`\n  Warning: proxy failed to start (${err.message}). API calls won't be auto-tracked.`));
          console.log(chalk.gray(`  Tip: run 'cs log-ai' manually, or use --port to pick a different port.\n`));
        }
      }

      // ── Print header ─────────────────────────────────────────
      console.log(chalk.bold(`\n  ● codesession  ${chalk.white(sessionName)}`));
      if (proxyServer) {
        console.log(chalk.gray(`  ↳ proxy active  http://127.0.0.1:${port}  (API calls auto-tracked)`));
      }
      console.log(chalk.gray(`  ↳ tracking files, commits, AI usage`));
      console.log(chalk.gray(`  ↳ ctrl+c stops your command and shows the cost summary\n`));

      // ── Start git polling ──────────────────────────────────────
      startGitPolling(sessionId, 10000);

      // ── Spawn child process ───────────────────────────────────
      const [command, ...cmdArgs] = args;
      const child = spawn(command, cmdArgs, {
        shell: true,
        stdio: 'inherit',
        env: { ...process.env, ...extraEnv },
        cwd,
      });

      let childExitCode = 0;

      await new Promise<void>((resolve) => {
        child.on('close', (code: number | null) => {
          childExitCode = code ?? 0;
          resolve();
        });
        child.on('error', (err: Error) => {
          console.error(chalk.red(`\n  Failed to start command: ${err.message}\n`));
          resolve();
        });
        // Forward signals so Ctrl+C kills the child cleanly
        process.on('SIGINT', () => {
          child.kill('SIGINT');
        });
        process.on('SIGTERM', () => {
          child.kill('SIGTERM');
        });
      });

      // ── Cleanup ───────────────────────────────────────────────
      if (proxyServer) proxyServer.close();
      stopGitPolling(sessionId);

      // ── Git-based file + commit scan (same as cs end) ─────────
      if (startHead) {
        const dir = gitRoot || scopeDir;
        const diffFiles = await getGitDiffFiles(dir, startHead);
        const diffCommits = await getGitLogCommits(dir, startHead);
        const existingFiles = new Set(getFileChanges(sessionId).map((f: any) => f.filePath));
        for (const f of diffFiles) {
          if (!existingFiles.has(f.filePath)) {
            addFileChange({ sessionId, filePath: f.filePath, changeType: f.changeType, timestamp: new Date().toISOString() });
          }
        }
        const existing = getCommits(sessionId);
        const existingHashes = new Set(existing.map((c) => c.hash));
        for (const c of diffCommits) {
          if (!existingHashes.has(c.hash)) {
            addCommit({ sessionId, hash: c.hash, message: c.message, timestamp: c.timestamp });
          }
        }
      }

      endSession(sessionId, new Date().toISOString(), `cs run: ${args.join(' ')}`);

      // ── Cost summary ──────────────────────────────────────────
      const ended = getSession(sessionId);
      if (ended) {
        const dur   = ended.duration ? formatDuration(ended.duration) : '0s';
        const cost  = ended.aiCost   ? chalk.green(formatCost(ended.aiCost)) : chalk.gray('$0.00');
        const files = ended.filesChanged;
        const cmts  = ended.commits;
        console.log(chalk.bold(`\n  ✓ Done  ${chalk.white(sessionName)}`));
        console.log(chalk.gray(`    ${dur}  •  ${files} file${files !== 1 ? 's' : ''}  •  ${cmts} commit${cmts !== 1 ? 's' : ''}  •  ${cost} AI cost`));
        if (ended.aiCost > 0) {
          const usage = getAIUsage(sessionId);
          const topModel = usage.reduce((a: any, b: any) => (b.cost > (a?.cost ?? 0) ? b : a), null as any);
          if (topModel) console.log(chalk.gray(`    top model: ${topModel.model}  (${topModel.tokens.toLocaleString()} tokens)`));
        }
        console.log(chalk.gray(`\n    cs show    full breakdown`));
        console.log(chalk.gray(`    cs dashboard\n`));
      }

      process.exit(childExitCode);
    });
}
