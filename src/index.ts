#!/usr/bin/env node

import { Command } from 'commander';
import {
  registerSessionCommands,
  registerAICommands,
  registerRunCommand,
  registerServerCommands,
  registerPricingCommands,
  registerDataCommands,
  registerTodayCommands,
} from './commands';

const program = new Command();
const pkg = require('../package.json');

program
  .name('codesession')
  .description('Track AI coding sessions & agent runs — time, files, commits, costs')
  .version(pkg.version)
  .enablePositionalOptions();

// Register all command modules
registerSessionCommands(program);
registerAICommands(program);
registerRunCommand(program);
registerServerCommands(program);
registerPricingCommands(program);
registerDataCommands(program);
registerTodayCommands(program);

// Only parse CLI args when run directly (not when imported as a library)
if (require.main === module) {
  program.parse();
}

// Programmatic API exports
export { createSession, getActiveSession, getActiveSessions, getActiveSessionForDir, endSession, getSession, getSessions, getStats, addFileChange, addCommit, addAIUsage, getFileChanges, getCommits, getAIUsage, exportSessions, loadPricing, setPricing, resetPricing, getPricingPath, addNote, getNotes, recoverStaleSessions, getSessionsPaginated, getSessionDetail, getDailyCosts, getModelBreakdown, getTopSessions, getProviderBreakdown, getFileHotspots, getActivityHeatmap, getDailyTokens, getCostVelocity, getProjectBreakdown, getTokenRatios, getTodayProjects, addTodayProject, removeTodayProject, clearTodayProjects } from './db';
export { initGit, startGitPolling, stopGitPolling, checkForNewCommits, getGitInfo, cleanupGit, getGitRoot, getGitHead, getGitDiffFiles, getGitLogCommits } from './git';
export { startWatcher, stopWatcher, cleanupWatcher } from './watcher';
export { Session, FileChange, Commit, AIUsage, SessionStats, SessionNote } from './types';
export { AgentSession, AgentSessionConfig, AgentSessionSummary, BudgetExceededError, runAgentSession } from './agents';
export { lookupPricing, isCustomPricing, estimateCost, estimateCostSimple, estimateCostOrNull, CostEstimate, PricingLookupResult, PricingEntry } from './pricing';
export { buildSnapshot, formatHuman, formatAI, formatShare, formatJSON, TodaySnapshot, ProjectSnapshot, GitState, TodoItem, PullRequest } from './today';
