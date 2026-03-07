/**
 * Database module barrel — re-exports everything so `import { ... } from './db'` still works.
 */

// Core session operations
export {
  createSession,
  getActiveSession,
  getActiveSessions,
  getActiveSessionForDir,
  endSession,
  getSession,
  getSessions,
  addFileChange,
  addCommit,
  addAIUsage,
  getFileChanges,
  getCommits,
  getAIUsage,
  exportSessions,
  getStats,
  addNote,
  getNotes,
  recoverStaleSessions,
  clearAllData,
  closeDb,
} from './sessions';

// Dashboard analytics
export {
  getSessionsPaginated,
  getSessionDetail,
  getDailyCosts,
  getModelBreakdown,
  getTopSessions,
  getProviderBreakdown,
  getFileHotspots,
  getActivityHeatmap,
  getDailyTokens,
  getCostVelocity,
  getProjectBreakdown,
  getTokenRatios,
} from './analytics';

// Pricing store
export {
  loadPricing,
  setPricing,
  resetPricing,
  getPricingPath,
} from './pricing-store';

// Today project registry
export {
  getTodayProjects,
  addTodayProject,
  removeTodayProject,
  clearTodayProjects,
} from './today-store';
