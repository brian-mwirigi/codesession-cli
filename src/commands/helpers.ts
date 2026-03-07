/**
 * Shared helpers used across CLI command modules.
 */

import { formatDuration } from '../formatters';

const pkg = require('../../package.json');
export const VERSION: string = pkg.version;
export const SCHEMA_VERSION = 1;

/** Emit a structured JSON error and exit 1. */
export function jsonError(code: string, message: string, extra?: Record<string, any>): never {
  console.log(JSON.stringify({ schemaVersion: SCHEMA_VERSION, codesessionVersion: VERSION, error: { code, message, ...extra } }));
  process.exit(1);
  return undefined as never; // unreachable, helps TS
}

/** Wrap a JSON success payload with schema metadata. */
export function jsonWrap(data: Record<string, any>): Record<string, any> {
  return { schemaVersion: SCHEMA_VERSION, codesessionVersion: VERSION, ...data };
}

/** Resolve the active session for the current directory (supports parallel sessions). */
export async function resolveActiveSession() {
  const { getActiveSessionForDir, getActiveSession } = require('../db');
  const { getGitRoot } = require('../git');
  const cwd = process.cwd();
  const gitRoot = await getGitRoot(cwd);
  const scopeDir = gitRoot || cwd;
  return getActiveSessionForDir(scopeDir) || getActiveSession();
}

export function sessionToJSON(session: any, extras?: { files?: any[]; commits?: any[]; aiUsage?: any[]; notes?: any[] }) {
  const obj: any = {
    schemaVersion: SCHEMA_VERSION,
    codesessionVersion: VERSION,
    id: session.id,
    name: session.name,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime || null,
    duration: session.duration || null,
    durationFormatted: session.duration ? formatDuration(session.duration) : null,
    workingDirectory: session.workingDirectory,
    gitRoot: session.gitRoot || null,
    filesChanged: session.filesChanged,
    commits: session.commits,
    aiTokens: session.aiTokens,
    aiCost: session.aiCost,
    notes: session.notes || null,
  };
  if (extras?.files) obj.files = extras.files;
  if (extras?.commits) obj.commits = extras.commits;
  if (extras?.aiUsage) obj.aiUsage = extras.aiUsage;
  if (extras?.notes) obj.notes = extras.notes;
  return obj;
}
