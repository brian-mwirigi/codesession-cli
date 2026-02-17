#!/usr/bin/env node

/**
 * codesession MCP Server
 *
 * Exposes codesession-cli as an MCP server so Claude Code (and other MCP clients)
 * can start sessions, log AI usage, check budgets, and read stats — all in context.
 *
 * Usage:
 *   claude mcp add --transport stdio codesession -- npx codesession-cli mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createSession,
  getActiveSession,
  getActiveSessions,
  getActiveSessionForDir,
  endSession,
  getSession,
  getSessions,
  getStats,
  addAIUsage,
  getAIUsage,
  getFileChanges,
  getCommits,
  getNotes,
  addNote,
  loadPricing,
  recoverStaleSessions,
} from './db';
import { getGitRoot } from './git';

const pkg = require('../package.json');

// ── Helper: resolve session for a directory ───────────────────

async function resolveSession(directory?: string) {
  if (directory) {
    const gitRoot = await getGitRoot(directory);
    const scopeDir = gitRoot || directory;
    return getActiveSessionForDir(scopeDir) || getActiveSession();
  }
  return getActiveSession();
}

// ── Helper: estimate cost from built-in pricing ───────────────

function estimateCost(model: string, promptTokens: number, completionTokens: number, provider?: string): number | null {
  const pricing = loadPricing();
  const key = provider ? `${provider}/${model}` : model;
  const entry = pricing[key] || pricing[model];
  if (!entry) return null;
  return (promptTokens * entry.input + completionTokens * entry.output) / 1_000_000;
}

// ── Create MCP Server ─────────────────────────────────────────

const server = new McpServer({
  name: 'codesession',
  version: pkg.version,
});

// ── Tools ─────────────────────────────────────────────────────

server.tool(
  'session_status',
  'Get the active codesession status including cost, tokens, duration, and budget info',
  { directory: z.string().optional().describe('Working directory to resolve session for (defaults to most recent)') },
  async ({ directory }) => {
    const session = await resolveSession(directory);
    if (!session) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active session. Start one with: cs start <name>' }) }] };
    }

    const now = new Date();
    const start = new Date(session.startTime);
    const liveDuration = Math.floor((now.getTime() - start.getTime()) / 1000);
    const aiUsage = getAIUsage(session.id!);
    const notes = getNotes(session.id!);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: session.id,
          name: session.name,
          status: session.status,
          directory: session.workingDirectory,
          gitRoot: session.gitRoot || null,
          duration: liveDuration,
          durationMinutes: Math.round(liveDuration / 60),
          filesChanged: session.filesChanged,
          commits: session.commits,
          aiCost: session.aiCost,
          aiTokens: session.aiTokens,
          aiCalls: aiUsage.length,
          notes: notes.map(n => ({ message: n.message, timestamp: n.timestamp })),
        }),
      }],
    };
  },
);

server.tool(
  'start_session',
  'Start a new codesession to track AI costs, files, and commits',
  {
    name: z.string().describe('Session name (e.g. "fix auth bug", "refactor db layer")'),
    directory: z.string().optional().describe('Working directory (defaults to cwd)'),
  },
  async ({ name, directory }) => {
    const cwd = directory || process.cwd();
    const gitRoot = await getGitRoot(cwd);
    const scopeDir = gitRoot || cwd;

    // Check for existing session in this directory
    const existing = getActiveSessionForDir(scopeDir);
    if (existing) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Session "${existing.name}" already active for this directory`,
            id: existing.id,
            hint: 'Use end_session first, or use session_status to check it',
          }),
        }],
      };
    }

    const sessionId = createSession({
      name,
      startTime: new Date().toISOString(),
      workingDirectory: scopeDir,
      gitRoot: gitRoot || undefined,
      filesChanged: 0,
      commits: 0,
      aiCost: 0,
      aiTokens: 0,
      status: 'active',
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ id: sessionId, name, directory: scopeDir, gitRoot: gitRoot || null, started: true }),
      }],
    };
  },
);

server.tool(
  'end_session',
  'End the active codesession and get a full summary',
  {
    notes: z.string().optional().describe('End-of-session notes'),
    directory: z.string().optional().describe('Working directory to resolve session for'),
    sessionId: z.number().optional().describe('Specific session ID to end'),
  },
  async ({ notes, directory, sessionId }) => {
    let session;
    if (sessionId) {
      session = getSession(sessionId);
      if (!session || session.status !== 'active') {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `No active session with id ${sessionId}` }) }] };
      }
    } else {
      session = await resolveSession(directory);
    }

    if (!session) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active session to end' }) }] };
    }

    endSession(session.id!, new Date().toISOString(), notes);

    const updated = getSession(session.id!)!;
    const files = getFileChanges(session.id!);
    const commits = getCommits(session.id!);
    const aiUsage = getAIUsage(session.id!);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: updated.id,
          name: updated.name,
          status: 'completed',
          duration: updated.duration,
          durationMinutes: Math.round((updated.duration || 0) / 60),
          filesChanged: updated.filesChanged,
          commits: updated.commits,
          aiCost: updated.aiCost,
          aiTokens: updated.aiTokens,
          aiCalls: aiUsage.length,
          files: files.map(f => ({ path: f.filePath, type: f.changeType })),
          commitList: commits.map(c => ({ hash: c.hash, message: c.message })),
          aiBreakdown: aiUsage.map(a => ({ provider: a.provider, model: a.model, tokens: a.tokens, cost: a.cost })),
        }),
      }],
    };
  },
);

server.tool(
  'log_ai_usage',
  'Log AI token usage and cost to the active session. Call this after each API call to track spending.',
  {
    provider: z.string().describe('AI provider (anthropic, openai, google)'),
    model: z.string().describe('Model name (claude-sonnet-4, gpt-4o, etc.)'),
    promptTokens: z.number().describe('Number of input/prompt tokens'),
    completionTokens: z.number().describe('Number of output/completion tokens'),
    cost: z.number().optional().describe('Cost in dollars (auto-calculated from built-in pricing if omitted)'),
    agentName: z.string().optional().describe('Agent name for attribution'),
    directory: z.string().optional().describe('Working directory to resolve session for'),
  },
  async ({ provider, model, promptTokens, completionTokens, cost, agentName, directory }) => {
    const session = await resolveSession(directory);
    if (!session) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active session. Start one first.' }) }] };
    }

    const totalTokens = promptTokens + completionTokens;

    // Auto-calculate cost if not provided
    let finalCost = cost;
    if (finalCost === undefined || finalCost === null) {
      const estimated = estimateCost(model, promptTokens, completionTokens, provider);
      if (estimated !== null) {
        finalCost = Math.round(estimated * 1e10) / 1e10;
      } else {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Unknown model "${model}" — provide cost parameter or use a known model` }),
          }],
        };
      }
    }

    addAIUsage({
      sessionId: session.id!,
      provider,
      model,
      tokens: totalTokens,
      promptTokens,
      completionTokens,
      cost: finalCost,
      agentName: agentName || 'Claude Code',
      timestamp: new Date().toISOString(),
    });

    const updated = getSession(session.id!)!;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          logged: { provider, model, tokens: totalTokens, promptTokens, completionTokens, cost: finalCost, agentName: agentName || 'Claude Code' },
          session: { id: session.id, totalCost: updated.aiCost, totalTokens: updated.aiTokens },
        }),
      }],
    };
  },
);

server.tool(
  'add_note',
  'Add a timestamped note/annotation to the active session',
  {
    message: z.string().describe('Note message'),
    directory: z.string().optional().describe('Working directory to resolve session for'),
  },
  async ({ message, directory }) => {
    const session = await resolveSession(directory);
    if (!session) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active session' }) }] };
    }

    const note = addNote(session.id!, message);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ added: true, sessionId: session.id, note }),
      }],
    };
  },
);

server.tool(
  'get_stats',
  'Get overall codesession statistics across all sessions',
  {},
  async () => {
    const stats = getStats();
    const active = getActiveSessions();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalSessions: stats.totalSessions,
          activeSessions: active.length,
          totalTimeMinutes: Math.round(stats.totalTime / 60),
          totalFiles: stats.totalFiles,
          totalCommits: stats.totalCommits,
          totalAICost: stats.totalAICost,
          avgSessionMinutes: Math.round(stats.avgSessionTime / 60),
        }),
      }],
    };
  },
);

server.tool(
  'list_sessions',
  'List recent codesessions',
  { limit: z.number().optional().describe('Number of sessions to return (default 10)') },
  async ({ limit }) => {
    const sessions = getSessions(limit || 10);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(sessions.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          directory: s.workingDirectory,
          aiCost: s.aiCost,
          aiTokens: s.aiTokens,
          duration: s.duration,
          startTime: s.startTime,
        }))),
      }],
    };
  },
);

server.tool(
  'check_budget',
  'Check how much has been spent in the active session — useful before making expensive API calls',
  {
    directory: z.string().optional().describe('Working directory to resolve session for'),
  },
  async ({ directory }) => {
    const session = await resolveSession(directory);
    if (!session) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active session' }) }] };
    }

    const aiUsage = getAIUsage(session.id!);
    const byModel: Record<string, { tokens: number; cost: number; calls: number }> = {};
    for (const u of aiUsage) {
      const key = `${u.provider}/${u.model}`;
      if (!byModel[key]) byModel[key] = { tokens: 0, cost: 0, calls: 0 };
      byModel[key].tokens += u.tokens;
      byModel[key].cost += u.cost;
      byModel[key].calls += 1;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          sessionId: session.id,
          sessionName: session.name,
          totalCost: session.aiCost,
          totalTokens: session.aiTokens,
          totalCalls: aiUsage.length,
          byModel,
        }),
      }],
    };
  },
);

// ── Resources ─────────────────────────────────────────────────

server.resource(
  'pricing',
  'codesession://pricing',
  { description: 'Current model pricing table (per 1M tokens)', mimeType: 'application/json' },
  async () => {
    const pricing = loadPricing();
    return {
      contents: [{
        uri: 'codesession://pricing',
        mimeType: 'application/json',
        text: JSON.stringify(pricing, null, 2),
      }],
    };
  },
);

// ── Start ─────────────────────────────────────────────────────

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run directly when executed as a script
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`codesession MCP server error: ${err.message}\n`);
    process.exit(1);
  });
}
