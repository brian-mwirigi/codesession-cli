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
  addAIUsage
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

const program = new Command();

program
  .name('devsession')
  .description('Track your AI coding sessions: time, files, commits, AI costs')
  .version('1.0.0');

// Start command
program
  .command('start')
  .description('Start a new coding session')
  .argument('<name>', 'Session name')
  .action(async (name: string) => {
    const active = getActiveSession();
    if (active) {
      console.log(chalk.yellow(`\nSession "${active.name}" is already active.`));
      console.log(chalk.gray('End it with: ds end\n'));
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
    
    // Start file watcher
    startWatcher(sessionId, cwd);

    // Check for commits every 10 seconds
    const gitInterval = setInterval(async () => {
      await checkForNewCommits(sessionId);
    }, 10000);

    // Store interval ID
    (global as any).gitInterval = gitInterval;

    const gitInfo = await getGitInfo();
    
    console.log(chalk.green(`\n✓ Session started: ${name}`));
    if (gitInfo) {
      console.log(chalk.gray(`  Branch: ${gitInfo.branch}`));
    }
    console.log(chalk.gray(`  Directory: ${cwd}`));
    console.log(chalk.gray('\n  Tracking: files, commits, AI usage'));
    console.log(chalk.gray('  End with: ds end\n'));
  });

// End command
program
  .command('end')
  .description('End the active session')
  .option('-n, --notes <notes>', 'Session notes')
  .action((options) => {
    const session = getActiveSession();
    if (!session) {
      console.log(chalk.yellow('\nNo active session.\n'));
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
      console.log(chalk.green('\n✓ Session ended\n'));
      displaySession(updated);
    }
  });

// Show command
program
  .command('show')
  .description('Show session details')
  .argument('[id]', 'Session ID (defaults to last session)')
  .option('--files', 'Show file changes')
  .option('--commits', 'Show commits')
  .action((id: string | undefined, options) => {
    let session;
    
    if (id) {
      session = getSession(parseInt(id));
    } else {
      const sessions = getSessions(1);
      session = sessions[0];
    }

    if (!session) {
      console.log(chalk.yellow('\nSession not found.\n'));
      return;
    }

    displaySession(session);

    if (options.files) {
      const files = getFileChanges(session.id!);
      displayFileChanges(files);
    }

    if (options.commits) {
      const commits = getCommits(session.id!);
      displayCommits(commits);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List recent sessions')
  .option('-l, --limit <number>', 'Number of sessions to show', parseInt, 10)
  .action((options) => {
    const sessions = getSessions(options.limit);
    displaySessions(sessions);
  });

// Stats command
program
  .command('stats')
  .description('Show overall statistics')
  .action(() => {
    const stats = getStats();
    displayStats(stats);
  });

// Log AI usage command
program
  .command('log-ai')
  .description('Log AI usage for active session')
  .requiredOption('-p, --provider <provider>', 'AI provider')
  .requiredOption('-m, --model <model>', 'Model name')
  .requiredOption('-t, --tokens <tokens>', 'Total tokens', parseInt)
  .requiredOption('-c, --cost <cost>', 'Cost in dollars', parseFloat)
  .action((options) => {
    const session = getActiveSession();
    if (!session) {
      console.log(chalk.yellow('\nNo active session. Start one with: ds start <name>\n'));
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

    console.log(chalk.green(`\n✓ Logged AI usage: ${options.tokens.toLocaleString()} tokens, $${options.cost.toFixed(2)}\n`));
  });

// Status command
program
  .command('status')
  .description('Show active session status')
  .action(() => {
    const session = getActiveSession();
    if (!session) {
      console.log(chalk.yellow('\nNo active session.\n'));
      return;
    }

    displaySession(session);
  });

program.parse();
