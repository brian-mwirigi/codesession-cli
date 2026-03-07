/**
 * Tests for cs today — project registry + snapshot building.
 * Uses a fresh temp DB so ~/.codesession is never touched.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

const TEST_DB = join(tmpdir(), `codesession-today-test-${process.pid}.db`);
const TEST_DIR = join(tmpdir(), `codesession-today-testdir-${process.pid}`);

// Typed references
let addTodayProject: Function;
let getTodayProjects: Function;
let removeTodayProject: Function;
let clearTodayProjects: Function;
let createSession: Function;

// ── Setup ─────────────────────────────────────────────────────

beforeAll(async () => {
  process.env.CODESESSION_DB_PATH = TEST_DB;
  vi.resetModules();
  const db = await import('../db');
  addTodayProject = db.addTodayProject;
  getTodayProjects = db.getTodayProjects;
  removeTodayProject = db.removeTodayProject;
  clearTodayProjects = db.clearTodayProjects;
  createSession = db.createSession;

  // Create a test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  [`${TEST_DB}`, `${TEST_DB}-wal`, `${TEST_DB}-shm`].forEach(f => {
    if (existsSync(f)) { try { unlinkSync(f); } catch (_) {} }
  });
  if (existsSync(TEST_DIR)) {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch (_) {}
  }
});

// ── Project Registry ──────────────────────────────────────────

describe('today: project registry', () => {
  it('starts with no projects', () => {
    const projects = getTodayProjects();
    expect(projects).toHaveLength(0);
  });

  it('adds a project', () => {
    const result = addTodayProject(TEST_DIR, 'test-project');
    expect(result.name).toBe('test-project');
    expect(result.path).toContain('codesession-today-testdir');
    expect(result.id).toBeGreaterThan(0);
  });

  it('lists added projects', () => {
    const projects = getTodayProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('test-project');
  });

  it('does not duplicate on re-add', () => {
    addTodayProject(TEST_DIR, 'test-project');
    const projects = getTodayProjects();
    expect(projects).toHaveLength(1);
  });

  it('updates name on re-add with new name', () => {
    addTodayProject(TEST_DIR, 'renamed-project');
    const projects = getTodayProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('renamed-project');
  });

  it('adds multiple projects', () => {
    const dir2 = TEST_DIR + '-2';
    if (!existsSync(dir2)) mkdirSync(dir2, { recursive: true });
    addTodayProject(dir2, 'second-project');
    const projects = getTodayProjects();
    expect(projects).toHaveLength(2);
    // Cleanup
    if (existsSync(dir2)) {
      try { rmSync(dir2, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it('removes a project', () => {
    const dir2 = TEST_DIR + '-2';
    removeTodayProject(dir2);
    const projects = getTodayProjects();
    expect(projects).toHaveLength(1);
  });

  it('returns false when removing nonexistent project', () => {
    const result = removeTodayProject('/nonexistent/path');
    expect(result).toBe(false);
  });

  it('clears all projects', () => {
    clearTodayProjects();
    const projects = getTodayProjects();
    expect(projects).toHaveLength(0);
  });
});

// ── Formatter outputs ─────────────────────────────────────────

describe('today: formatters', () => {
  it('formatAI produces markdown with header', async () => {
    vi.resetModules();
    const { formatAI } = await import('../today');
    const snapshot = {
      timestamp: new Date().toISOString(),
      projects: [],
      lastSessionGlobal: null,
    };
    const output = formatAI(snapshot);
    expect(output).toContain('# Developer Context');
    expect(output).toContain('codesession-cli');
  });

  it('formatShare produces standup format', async () => {
    vi.resetModules();
    const { formatShare } = await import('../today');
    const snapshot = {
      timestamp: new Date().toISOString(),
      projects: [],
      lastSessionGlobal: {
        id: 1,
        name: 'test task',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date().toISOString(),
        duration: 3600,
        aiCost: 0.50,
        aiTokens: 10000,
        filesChanged: 5,
        commits: 2,
        status: 'completed',
        notes: null,
        aiCalls: [],
        fileChanges: [],
        sessionNotes: [],
      },
    };
    const output = formatShare(snapshot);
    expect(output).toContain('**Standup');
    expect(output).toContain('test task');
    expect(output).toContain('Yesterday');
    expect(output).toContain('Today');
    expect(output).toContain('Blockers');
  });

  it('formatJSON produces valid JSON', async () => {
    vi.resetModules();
    const { formatJSON } = await import('../today');
    const snapshot = {
      timestamp: new Date().toISOString(),
      projects: [],
      lastSessionGlobal: null,
    };
    const output = formatJSON(snapshot);
    const parsed = JSON.parse(output);
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.projects).toEqual([]);
  });

  it('formatHuman handles empty state', async () => {
    vi.resetModules();
    const { formatHuman } = await import('../today');
    const snapshot = {
      timestamp: new Date().toISOString(),
      projects: [],
      lastSessionGlobal: null,
    };
    const output = formatHuman(snapshot);
    expect(output).toContain('No recent activity');
  });
});
