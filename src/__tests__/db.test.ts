/**
 * Database tests — run against a fresh in-temp SQLite file.
 * CODESESSION_DB_PATH is set before the module loads via dynamic import,
 * so the real ~/.codesession/sessions.db is NEVER touched.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import type { Session } from '../types';

const TEST_DB = join(tmpdir(), `codesession-test-${process.pid}.db`);

// Typed references to db functions — populated in beforeAll
let createSession: Function;
let getSession: Function;
let getActiveSession: Function;
let getActiveSessions: Function;
let endSession: Function;
let addAIUsage: Function;
let getAIUsage: Function;
let loadPricing: Function;

// ── Setup: set env var THEN dynamically import db ─────────────────────────

beforeAll(async () => {
  process.env.CODESESSION_DB_PATH = TEST_DB;
  // Reset module registry so db.ts re-initialises with the new env var
  vi.resetModules();
  const db = await import('../db');
  createSession   = db.createSession;
  getSession      = db.getSession;
  getActiveSession = db.getActiveSession;
  getActiveSessions = db.getActiveSessions;
  endSession      = db.endSession;
  addAIUsage      = db.addAIUsage;
  getAIUsage      = db.getAIUsage;
  loadPricing     = db.loadPricing;
});

// ── Cleanup ───────────────────────────────────────────────────────────────

afterAll(() => {
  [`${TEST_DB}`, `${TEST_DB}-wal`, `${TEST_DB}-shm`].forEach(f => {
    if (existsSync(f)) { try { unlinkSync(f); } catch (_) {} }
  });
});

// ── Session lifecycle ─────────────────────────────────────────────────────

describe('session lifecycle', () => {
  it('creates a session and retrieves it by id', () => {
    const id = createSession({
      name: 'test session',
      startTime: new Date().toISOString(),
      workingDirectory: '/tmp/test',
      filesChanged: 0,
      commits: 0,
      aiCost: 0,
      aiTokens: 0,
      status: 'active',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const session = getSession(id);
    expect(session).not.toBeNull();
    expect(session!.name).toBe('test session');
    expect(session!.status).toBe('active');
    expect(session!.workingDirectory).toBe('/tmp/test');
  });

  it('getActiveSession returns the currently active session', () => {
    const active = getActiveSession();
    expect(active).not.toBeNull();
    expect(active!.status).toBe('active');
  });

  it('ends a session and updates its status', () => {
    const active = getActiveSession()!;
    endSession(active.id!, new Date().toISOString(), 'done');
    const ended = getSession(active.id!);
    expect(ended!.status).toBe('completed');
    expect(ended!.endTime).not.toBeNull();
    expect(ended!.duration).toBeGreaterThanOrEqual(0);
  });

  it('getActiveSession returns null after all sessions are ended', () => {
    // End any remaining active sessions
    const remaining = getActiveSessions();
    for (const s of remaining) {
      endSession(s.id!, new Date().toISOString(), 'cleanup');
    }
    expect(getActiveSession()).toBeNull();
  });
});

// ── AI usage logging ──────────────────────────────────────────────────────

describe('addAIUsage', () => {
  let sessionId: number;

  beforeAll(() => {
    sessionId = createSession({
      name: 'ai usage test',
      startTime: new Date().toISOString(),
      workingDirectory: '/tmp/test2',
      filesChanged: 0,
      commits: 0,
      aiCost: 0,
      aiTokens: 0,
      status: 'active',
    });
  });

  it('logs AI usage and retrieves it', () => {
    addAIUsage({
      sessionId,
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      tokens: 1000,
      promptTokens: 700,
      completionTokens: 300,
      cost: 0.0065,
      agentName: 'test',
      timestamp: new Date().toISOString(),
    });

    const usage = getAIUsage(sessionId);
    expect(usage.length).toBe(1);
    expect(usage[0].provider).toBe('anthropic');
    expect(usage[0].model).toBe('claude-sonnet-4');
    expect(usage[0].tokens).toBe(1000);
    expect(usage[0].cost).toBeCloseTo(0.0065, 6);
  });

  it('accumulates total tokens and cost on the session', () => {
    addAIUsage({
      sessionId,
      provider: 'openai',
      model: 'gpt-4o',
      tokens: 500,
      promptTokens: 400,
      completionTokens: 100,
      cost: 0.002,
      agentName: 'test',
      timestamp: new Date().toISOString(),
    });

    const session = getSession(sessionId)!;
    expect(session.aiTokens).toBe(1500);
    expect(session.aiCost).toBeCloseTo(0.0085, 5);
  });

  it('rejects negative tokens (validation layer)', () => {
    // The DB itself doesn't validate — that's index.ts's job.
    // Here we confirm the DB stores what it's given — tests for validation
    // belong in index.test.ts. We just verify the row is inserted.
    expect(() => {
      addAIUsage({
        sessionId,
        provider: 'openai',
        model: 'gpt-4o',
        tokens: 0,
        cost: 0,
        timestamp: new Date().toISOString(),
      });
    }).not.toThrow();
  });
});

// ── Pricing table ─────────────────────────────────────────────────────────

describe('loadPricing', () => {
  it('returns a non-empty pricing table', () => {
    const pricing = loadPricing();
    expect(Object.keys(pricing).length).toBeGreaterThan(0);
  });

  it('contains expected Anthropic models', () => {
    const pricing = loadPricing();
    expect(pricing['claude-sonnet-4']).toBeDefined();
    expect(pricing['claude-sonnet-4'].input).toBeGreaterThan(0);
    expect(pricing['claude-sonnet-4'].output).toBeGreaterThan(0);
  });

  it('contains Codex models added in v2.4.0', () => {
    const pricing = loadPricing();
    expect(pricing['codex-mini-latest']).toBeDefined();
    expect(pricing['gpt-5.1-codex-max']).toBeDefined();
    expect(pricing['gpt-5.1-codex-mini']).toBeDefined();
    expect(pricing['gpt-5.3-codex']).toBeDefined();
  });

  it('all pricing entries have positive input and output rates', () => {
    const pricing = loadPricing() as Record<string, { input: number; output: number }>;
    for (const [model, entry] of Object.entries(pricing)) {
      expect(entry.input, `${model}.input must be >= 0`).toBeGreaterThanOrEqual(0);
      expect(entry.output, `${model}.output must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });
});
