/**
 * Today command: pick up where you left off — git state, TODOs, PRs, and last session
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getTodayProjects,
  addTodayProject,
  removeTodayProject,
} from '../db';
import { getGitRoot } from '../git';

export function register(program: Command): void {

  const todayCmd = program
    .command('today')
    .description('Pick up where you left off — git state, TODOs, PRs, and last session across all your projects')
    .option('--ai', 'Output as markdown optimized for pasting into AI (Claude, ChatGPT, Cursor)')
    .option('--share', 'Output as a standup/status message for Slack or Discord')
    .option('--json', 'Output raw JSON snapshot')
    .action(async (options: any) => {
      const { buildSnapshot, formatHuman, formatAI, formatShare, formatJSON } = require('../today');

      const projects = getTodayProjects();
      if (projects.length === 0) {
        // Auto-register current directory if no projects registered
        const cwd = process.cwd();
        const gitRoot = await getGitRoot(cwd);
        const dir = gitRoot || cwd;
        addTodayProject(dir);
        if (!options.json && !options.ai && !options.share) {
          console.log(chalk.gray(`  Auto-registered ${dir}`));
          console.log(chalk.gray(`  Tip: use ${chalk.cyan('cs today add <path>')} to track more projects\n`));
        }
      }

      const snapshot = await buildSnapshot();

      if (options.json) {
        console.log(formatJSON(snapshot));
      } else if (options.ai) {
        console.log(formatAI(snapshot));
      } else if (options.share) {
        console.log(formatShare(snapshot));
      } else {
        console.log(formatHuman(snapshot));
      }
    });

  todayCmd
    .command('init')
    .description('Register the current directory as a tracked project')
    .option('-n, --name <name>', 'Custom project name')
    .action(async (options: any) => {
      const cwd = process.cwd();
      const gitRoot = await getGitRoot(cwd);
      const dir = gitRoot || cwd;
      const result = addTodayProject(dir, options.name);
      console.log(chalk.green(`\n  ✓ Registered: ${result.name}`));
      console.log(chalk.gray(`    ${result.path}`));
      console.log(chalk.gray(`\n  Run ${chalk.cyan('cs today')} to see your context.\n`));
    });

  todayCmd
    .command('add')
    .description('Add a project directory to today tracking')
    .argument('<path>', 'Path to the project directory')
    .option('-n, --name <name>', 'Custom project name')
    .action(async (projectPath: string, options: any) => {
      const { resolve } = require('path');
      const resolvedPath = resolve(projectPath);

      if (!require('fs').existsSync(resolvedPath)) {
        console.error(chalk.red(`\n  Directory not found: ${resolvedPath}\n`));
        process.exit(1);
      }

      const gitRoot = await getGitRoot(resolvedPath);
      const dir = gitRoot || resolvedPath;
      const result = addTodayProject(dir, options.name);
      console.log(chalk.green(`\n  ✓ Added: ${result.name}`));
      console.log(chalk.gray(`    ${result.path}\n`));
    });

  todayCmd
    .command('remove')
    .description('Remove a project from today tracking')
    .argument('<path>', 'Path to the project directory')
    .action(async (projectPath: string) => {
      const { resolve } = require('path');
      const resolvedPath = resolve(projectPath);
      const gitRoot = await getGitRoot(resolvedPath).catch(() => null);
      // Try both the raw path and the git root
      const removed = removeTodayProject(resolvedPath) || (gitRoot ? removeTodayProject(gitRoot) : false);
      if (removed) {
        console.log(chalk.green(`\n  ✓ Removed from tracking.\n`));
      } else {
        console.error(chalk.yellow(`\n  Not found in tracked projects: ${resolvedPath}\n`));
      }
    });

  todayCmd
    .command('projects')
    .alias('ls')
    .description('List all tracked projects')
    .option('--json', 'Output as JSON')
    .action((options: any) => {
      const projects = getTodayProjects();
      if (options.json) {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }
      if (projects.length === 0) {
        console.log(chalk.yellow(`\n  No projects tracked yet.`));
        console.log(chalk.gray(`  Run ${chalk.cyan('cs today init')} in a project directory to get started.\n`));
        return;
      }
      console.log(chalk.bold.cyan(`\n  Tracked Projects (${projects.length})\n`));
      for (const p of projects) {
        console.log(`  ${chalk.white(p.name)}`);
        console.log(chalk.gray(`    ${p.path}`));
      }
      console.log('');
    });
}
