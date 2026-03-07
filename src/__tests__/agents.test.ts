/**
 * Agent session tests — lifecycle, budget enforcement, runAgentSession helper.
 * Uses a temp SQLite file (no interaction with real user data).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = join(tmpdir(), `codesession-agents-test-${process.pid}.db`);

let AgentSession: any;
let BudgetExceededError: any;
let runAgentSession: any;
let getSession: Function;

beforeAll(async () => {
  process.env.CODESESSION_DB_PATH = TEST_DB;
  vi.resetModules();
  const agents = await import('../agents');
  const db = await import('../db');
  AgentSession = agents.AgentSession;
  BudgetExceededError = agents.BudgetExceededError;
  runAgentSession = agents.runAgentSession;
  getSession = db.getSession;
});

afterAll(() => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
  try { if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal'); } catch {}
  try { if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm'); } catch {}
});

describe('AgentSession', () => {
  it('full lifecycle: start → logAI → end', () => {
    const session = new AgentSession('test-lifecycle', { directory: tmpdir(), git: false });
    const id = session.start();
    expect(id).toBeGreaterThan(0);
    expect(session.isActive).toBe(true);

    const remaining = session.logAI('openai', 'gpt-4o', 1000, 0.05);
    expect(remaining).toBeNull(); // no budget set
    expect(session.spent).toBe(0.05);
    expect(session.tokens).toBe(1000);

    const summary = session.end('test complete');
    expect(summary.sessionId).toBe(id);
    expect(summary.name).toBe('test-lifecycle');
    expect(summary.aiCost).toBeCloseTo(0.05, 6);
    expect(summary.aiTokens).toBe(1000);
    expect(summary.aiUsageBreakdown).toHaveLength(1);
    expect(summary.aiUsageBreakdown[0].provider).toBe('openai');
  });

  it('throws when starting twice', () => {
    const session = new AgentSession('double-start', { directory: tmpdir(), git: false });
    session.start();
    expect(() => session.start()).toThrow('already started');
    session.end();
  });

  it('throws when logging AI before start', () => {
    const session = new AgentSession('not-started', { directory: tmpdir(), git: false });
    expect(() => session.logAI('openai', 'gpt-4o', 100, 0.01)).toThrow('not been started');
  });

  it('throws when ending twice', () => {
    const session = new AgentSession('double-end', { directory: tmpdir(), git: false });
    session.start();
    session.end();
    expect(() => session.end()).toThrow('already ended');
  });

  it('enforces budget — throws BudgetExceededError', () => {
    const onBudgetExceeded = vi.fn();
    const session = new AgentSession('budget-test', {
      directory: tmpdir(),
      git: false,
      budget: 0.10,
      onBudgetExceeded,
    });
    session.start();

    // First call within budget
    const remaining = session.logAI('openai', 'gpt-4o', 500, 0.05);
    expect(remaining).toBeCloseTo(0.05, 6);

    // Second call exceeds budget
    expect(() => session.logAI('openai', 'gpt-4o', 1000, 0.08)).toThrow(BudgetExceededError);
    expect(onBudgetExceeded).toHaveBeenCalledWith(0.13, 0.10);

    // Session should still be active (budget check happens before write)
    expect(session.isActive).toBe(true);
    session.end();
  });

  it('auto-ends when budget exactly met', () => {
    const session = new AgentSession('budget-exact', {
      directory: tmpdir(),
      git: false,
      budget: 0.10,
    });
    session.start();
    session.logAI('openai', 'gpt-4o', 1000, 0.10);

    // Session auto-ended because budget was exactly met
    expect(session.isActive).toBe(false);
  });

  it('canAfford works correctly', () => {
    const session = new AgentSession('afford-check', {
      directory: tmpdir(),
      git: false,
      budget: 1.00,
    });
    session.start();
    session.logAI('openai', 'gpt-4o', 100, 0.50);

    expect(session.canAfford(0.40)).toBe(true);
    expect(session.canAfford(0.50)).toBe(true);
    expect(session.canAfford(0.51)).toBe(false);

    session.end();
  });

  it('tracks metadata', () => {
    const session = new AgentSession('metadata-test', {
      directory: tmpdir(),
      git: false,
      metadata: { task: 'refactor', priority: 'high' },
    });
    session.start();
    const summary = session.end();
    expect(summary.metadata).toEqual({ task: 'refactor', priority: 'high' });
  });

  it('calls onAIUsage callback', () => {
    const onAIUsage = vi.fn();
    const session = new AgentSession('callback-test', {
      directory: tmpdir(),
      git: false,
      onAIUsage,
    });
    session.start();
    session.logAI('anthropic', 'claude-sonnet-4', 2000, 0.03, { promptTokens: 1500, completionTokens: 500 });
    expect(onAIUsage).toHaveBeenCalledWith(0.03, 0.03, 'claude-sonnet-4');
    session.end();
  });
});

describe('runAgentSession', () => {
  it('handles successful agent run', async () => {
    const summary = await runAgentSession('run-success', {
      directory: tmpdir(),
      git: false,
    }, async (session: any) => {
      session.logAI('openai', 'gpt-4o', 500, 0.02);
    });

    expect(summary.name).toBe('run-success');
    expect(summary.aiCost).toBeCloseTo(0.02, 6);
  });

  it('handles budget exceeded in agentFn', async () => {
    const summary = await runAgentSession('run-budget', {
      directory: tmpdir(),
      git: false,
      budget: 0.05,
    }, async (session: any) => {
      session.logAI('openai', 'gpt-4o', 500, 0.03);
      session.logAI('openai', 'gpt-4o', 500, 0.03); // exceeds budget
    });

    // Should return summary with budgetRemaining = 0
    expect(summary.budgetRemaining).toBe(0);
  });

  it('re-throws non-budget errors', async () => {
    await expect(runAgentSession('run-error', {
      directory: tmpdir(),
      git: false,
    }, async () => {
      throw new Error('Agent crashed');
    })).rejects.toThrow('Agent crashed');
  });
});
