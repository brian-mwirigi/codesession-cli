/**
 * Server commands: proxy, dashboard, mcp
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createSession,
  getActiveSession,
  getActiveSessions,
  endSession,
} from '../db';
import { initGit, startGitPolling, stopGitPolling, getGitRoot, getGitHead } from '../git';
import { stopWatcher } from '../watcher';

export function register(program: Command): void {

  // ─── Dashboard ──────────────────────────────────────────────

  program
    .command('dashboard')
    .description('Open the web dashboard')
    .option('-p, --port <port>', 'Port to run on', '3737')
    .option('--host <host>', 'Host to bind to (default: 127.0.0.1)')
    .option('--no-open', 'Do not auto-open browser')
    .option('--json', 'Output JSON (machine-readable startup info: url, port, pid)')
    .action(async (options) => {
      const { startDashboard } = await import('../dashboard-server');
      startDashboard({ port: parseInt(options.port), open: options.open, host: options.host, json: options.json });
    });

  // ─── MCP Server ──────────────────────────────────────────────

  program
    .command('mcp')
    .description('Start the codesession MCP server (for Claude Code integration)')
    .action(async () => {
      const { main } = await import('../mcp-server');
      await main();
    });

  // ─── Proxy ────────────────────────────────────────────────────

  program
    .command('proxy')
    .description('Start a local API proxy that auto-logs token usage to the active session')
    .option('-p, --port <port>', 'Port to listen on (default: 3739)', parseInt, 3739)
    .option('-s, --session <name>', 'Auto-start a session with this name (skips needing cs start)')
    .action(async (options) => {
      const port: number = options.port;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        console.error(chalk.red(`\nInvalid port: ${port}. Use a value between 1024 and 65535.\n`));
        process.exit(1);
      }

      // ── Optional: auto-start a session ───────────────────────
      if (options.session) {
        const cwd = process.cwd();
        const gitRoot = await getGitRoot(cwd);
        const scopeDir = gitRoot || cwd;
        const allActive = getActiveSessions();
        for (const s of allActive) {
          void stopWatcher(s.id!);
          stopGitPolling(s.id!);
          endSession(s.id!, new Date().toISOString(), 'Auto-closed by cs proxy --session');
        }
        const startHead = await getGitHead(scopeDir);
        const sessionId = createSession({
          name: options.session,
          startTime: new Date().toISOString(),
          workingDirectory: scopeDir,
          gitRoot: gitRoot || undefined,
          startGitHead: startHead || undefined,
          filesChanged: 0, commits: 0, aiCost: 0, aiTokens: 0, status: 'active',
        });
        initGit(sessionId, scopeDir);
        startGitPolling(sessionId, 10000);
        console.log(chalk.green(`\n  Session started: ${options.session}  (id: ${sessionId})`));
      }

      const { startProxy } = require('../proxy');

      console.log(chalk.bold(`\n  codesession proxy`));
      console.log(chalk.gray(`  Starting on http://127.0.0.1:${port} ...\n`));

      let server: any;
      try {
        server = await startProxy(port);
      } catch (err: any) {
        console.error(chalk.red(`\nFailed to start proxy: ${err.message}\n`));
        process.exit(1);
      }

      const isWin = process.platform === 'win32';
      const setCmd = isWin
        ? `$env:ANTHROPIC_BASE_URL="http://127.0.0.1:${port}"\n  $env:OPENAI_BASE_URL="http://127.0.0.1:${port}/v1"`
        : `export ANTHROPIC_BASE_URL=http://127.0.0.1:${port}\n  export OPENAI_BASE_URL=http://127.0.0.1:${port}/v1`;

      const activeSession = getActiveSession();

      console.log(chalk.green(`  ✓ Proxy running on http://127.0.0.1:${port}`));
      if (activeSession) {
        console.log(chalk.gray(`  ✓ Active session: ${activeSession.name}  (id: ${activeSession.id})`));
      } else {
        console.log(chalk.yellow(`  ⚠ No active session — run 'cs start "name"' or use 'cs proxy --session "name"'`));
      }
      console.log(chalk.bold(`\n  Set these env vars in your agent's shell:\n`));
      console.log(chalk.cyan(`  ${setCmd}`));
      console.log(chalk.gray(`\n  Intercepting:`));
      console.log(chalk.gray(`    POST /v1/messages          → api.anthropic.com`));
      console.log(chalk.gray(`    POST /v1/chat/completions  → api.openai.com`));
      if (!activeSession && !options.session) {
        console.log(chalk.gray(`\n  Tip: use 'cs proxy --session "task name"' to skip the separate cs start step`));
      }
      console.log(chalk.gray(`\n  Press Ctrl+C to stop.\n`));

      const shutdown = () => {
        console.log(chalk.gray('\n  Proxy stopped.\n'));
        server.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
