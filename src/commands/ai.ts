/**
 * AI usage commands: log-ai, auto-log
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getSession,
  addAIUsage,
} from '../db';
import { formatCost } from '../formatters';
import { lookupPricing, estimateCost } from '../pricing';
import { jsonError, jsonWrap, resolveActiveSession } from './helpers';

export function register(program: Command): void {

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
    .option('--agent <name>', 'Agent name (optional)')
    .option('-s, --session <id>', 'Target a specific session by ID', parseInt)
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
          jsonError('no_active_session', 'No active session. Start one with: cs start <name>');
        } else {
          console.log(chalk.yellow('\nNo active session. Start one with: cs start <name>\n'));
        }
        return;
      }

      // ── Input validation ──────────────────────────────────────
      if (options.provider.length > 100) {
        const msg = 'Provider name too long (max 100 characters)';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }
      if (options.model.length > 200) {
        const msg = 'Model name too long (max 200 characters)';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }
      if (options.cost !== undefined && (options.cost < 0 || !Number.isFinite(options.cost))) {
        const msg = 'Cost must be a non-negative number';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }
      if (options.tokens !== undefined && (!Number.isInteger(options.tokens) || options.tokens < 0)) {
        const msg = 'Tokens must be a non-negative integer';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }
      if (options.promptTokens !== undefined && (!Number.isInteger(options.promptTokens) || options.promptTokens < 0)) {
        const msg = 'Prompt tokens must be a non-negative integer';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }
      if (options.completionTokens !== undefined && (!Number.isInteger(options.completionTokens) || options.completionTokens < 0)) {
        const msg = 'Completion tokens must be a non-negative integer';
        if (options.json) jsonError('invalid_input', msg);
        else { console.log(chalk.red(`\n${msg}\n`)); return; }
      }

      const promptTk = options.promptTokens || 0;
      const completionTk = options.completionTokens || 0;
      const totalTokens = options.tokens || (promptTk + completionTk);

      if (totalTokens === 0) {
        const msg = 'Must provide --tokens or --prompt-tokens/--completion-tokens';
        if (options.json) {
          jsonError('missing_tokens', msg);
        } else {
          console.log(chalk.red(`\n${msg}\n`));
        }
        return;
      }

      let cost = options.cost;
      let pricingInfo: { source: 'built-in' | 'custom' | 'manual'; modelKnown: boolean; inputPer1M: number; outputPer1M: number } | undefined;

      if (cost === undefined || cost === null) {
        // Auto-calculate from pricing table (try provider/model -> model)
        // Use original options to decide split: if user only provided --tokens (no --prompt-tokens/--completion-tokens),
        // apply heuristic 70/30 split. ?? would fail here because promptTk is 0 (falsy but not null).
        const effectivePrompt = options.promptTokens != null ? promptTk : totalTokens * 0.7;
        const effectiveCompletion = options.completionTokens != null ? completionTk : totalTokens * 0.3;
        const auto = estimateCost(options.model, effectivePrompt, effectiveCompletion, options.provider);
        if (auto !== null) {
          cost = Math.round(auto.cost * 1e10) / 1e10;
          pricingInfo = auto.pricingInfo;
        } else {
          const msg = `Unknown model "${options.model}" — provide -c <cost> or use --prompt-tokens/--completion-tokens with a known model`;
          if (options.json) {
            jsonError('unknown_model', msg, { model: options.model, provider: options.provider });
          } else {
            console.log(chalk.red(`\n${msg}\n`));
          }
          return;
        }
      } else {
        // Manual cost provided — check if model is known anyway for info
        const lookup = lookupPricing(options.model, options.provider);
        pricingInfo = {
          source: 'manual',
          modelKnown: lookup !== null,
          inputPer1M: lookup?.entry.input || 0,
          outputPer1M: lookup?.entry.output || 0,
        };
      }

      addAIUsage({
        sessionId: session.id!,
        provider: options.provider,
        model: options.model,
        tokens: totalTokens,
        promptTokens: promptTk ?? undefined,
        completionTokens: completionTk ?? undefined,
        cost,
        agentName: options.agent || process.env.CODESESSION_AGENT_NAME || undefined,
        timestamp: new Date().toISOString(),
      });

      // Re-read the updated session
      const updated = getSession(session.id!);
      const resolvedAgent = options.agent || process.env.CODESESSION_AGENT_NAME || undefined;
      if (options.json) {
        console.log(JSON.stringify(jsonWrap({
          logged: { provider: options.provider, model: options.model, tokens: totalTokens, promptTokens: promptTk || undefined, completionTokens: completionTk || undefined, cost, agentName: resolvedAgent },
          pricing: pricingInfo,
          session: { id: session.id, aiCost: updated?.aiCost || 0, aiTokens: updated?.aiTokens || 0 },
        })));
      } else {
        const agentStr = resolvedAgent ? ` (${resolvedAgent})` : '';
        console.log(chalk.green(`\nLogged: ${totalTokens.toLocaleString()} tokens, ${formatCost(cost)}${agentStr}`));
        console.log(chalk.gray(`  Session total: ${(updated?.aiTokens || 0).toLocaleString()} tokens, ${formatCost(updated?.aiCost || 0)}\n`));
      }
    });

  // ─── Auto-Log (Claude Code Hook) ─────────────────────────────

  program
    .command('auto-log')
    .description('Auto-log AI usage from a Claude Code hook (reads transcript from stdin)')
    .option('--provider <provider>', 'AI provider', 'anthropic')
    .option('--model <model>', 'Model name', 'claude-sonnet-4')
    .option('--agent <name>', 'Agent name', 'Claude Code')
    .action(async (options) => {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tty = require('tty');

      // Bail if stdin is a TTY (user ran `cs auto-log` manually without piping)
      try {
        if (tty.isatty(0)) {
          console.error('auto-log expects piped JSON from a Claude Code hook. See: cs auto-log --help');
          process.exit(1);
        }
      } catch {
        // isatty can throw in some environments — proceed to read stdin anyway
      }

      // Read hook input from stdin
      let raw = '';
      try {
        raw = fs.readFileSync(process.stdin.fd, 'utf8');
      } catch {
        process.exit(0);
      }

      if (!raw.trim()) process.exit(0);

      let hookInput: any;
      try {
        hookInput = JSON.parse(raw);
      } catch {
        process.exit(0);
      }

      const transcriptPath = hookInput.transcript_path;
      const sessionId = hookInput.session_id;

      if (!transcriptPath || !sessionId) process.exit(0);
      if (!fs.existsSync(transcriptPath)) process.exit(0);

      // Must have an active codesession — if not, exit WITHOUT saving position
      // so tokens aren't lost (they'll be picked up on the next call after cs start)
      const session = await resolveActiveSession();
      if (!session) process.exit(0);

      // Track position so we don't double-count across multiple Stop events
      const posDir = path.join(os.tmpdir(), 'codesession-autolog');
      try { fs.mkdirSync(posDir, { recursive: true }); } catch {}
      const posFile = path.join(posDir, `${sessionId}.pos`);
      let lastPos = 0;
      if (fs.existsSync(posFile)) {
        const stored = parseInt(fs.readFileSync(posFile, 'utf8'), 10);
        if (!isNaN(stored) && stored >= 0) lastPos = stored;
      }

      let transcript = fs.readFileSync(transcriptPath, 'utf8');
      // Strip BOM if present
      if (transcript.charCodeAt(0) === 0xFEFF) transcript = transcript.slice(1);
      const lines = transcript.split('\n').filter((l: string) => l.trim());

      // If transcript was truncated/reset and is now shorter than our position, reset
      if (lastPos > lines.length) lastPos = 0;

      if (lines.length <= lastPos) process.exit(0);

      const newLines = lines.slice(lastPos);
      let promptChars = 0;
      let completionChars = 0;

      for (const line of newLines) {
        try {
          const msg = JSON.parse(line);
          const content = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content || msg.message || '');

          if (msg.role === 'assistant') {
            completionChars += content.length;
          } else {
            promptChars += content.length;
          }
        } catch {
          // Skip unparseable lines
        }
      }

      // Estimate tokens (roughly 1 token per 4 characters)
      const promptTokens = Math.ceil(promptChars / 4);
      const completionTokens = Math.ceil(completionChars / 4);
      const totalTokens = promptTokens + completionTokens;

      // Skip if negligible (fewer than 10 estimated tokens)
      if (totalTokens < 10) {
        // Still save position — these lines were trivial (e.g., empty system messages)
        fs.writeFileSync(posFile, String(lines.length));
        process.exit(0);
      }

      // Calculate cost
      const auto = estimateCost(options.model, promptTokens, completionTokens, options.provider);
      const cost = auto ? Math.round(auto.cost * 1e10) / 1e10 : 0;

      addAIUsage({
        sessionId: session.id!,
        provider: options.provider,
        model: options.model,
        tokens: totalTokens,
        promptTokens: promptTokens ?? undefined,
        completionTokens: completionTokens ?? undefined,
        cost,
        agentName: options.agent || process.env.CODESESSION_AGENT_NAME || 'Claude Code',
        timestamp: new Date().toISOString(),
      });

      // Only save position AFTER successful log — prevents token loss
      fs.writeFileSync(posFile, String(lines.length));

      // Output JSON for the hook
      const updated = getSession(session.id!);
      console.log(JSON.stringify(jsonWrap({
        autoLogged: true,
        tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        cost,
        session: { id: session.id, aiCost: updated?.aiCost || 0, aiTokens: updated?.aiTokens || 0 },
      })));
    });
}
