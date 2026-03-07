/**
 * Data commands: export, note
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getSession,
  exportSessions,
  addNote,
} from '../db';
import { jsonError, jsonWrap, resolveActiveSession } from './helpers';

export function register(program: Command): void {

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

  // ─── Note ─────────────────────────────────────────────────────

  program
    .command('note')
    .description('Add a timestamped annotation to the active session')
    .argument('<message>', 'Note message')
    .option('-s, --session <id>', 'Target a specific session by ID', parseInt)
    .option('--json', 'Output JSON (for agents)')
    .action(async (message: string, options) => {
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
          jsonError('no_active_session', 'No active session');
        } else {
          console.log(chalk.yellow('\nNo active session.\n'));
        }
        return;
      }

      const note = addNote(session.id!, message);
      if (options.json) {
        console.log(JSON.stringify(jsonWrap(note)));
      } else {
        console.log(chalk.green(`\nNote added to session ${session.id}: "${message}"\n`));
      }
    });
}
