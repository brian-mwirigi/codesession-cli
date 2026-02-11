# Changelog

All notable changes to codesession-cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2025-02-11

### Fixed - Critical Bug Fixes

#### **Concurrent Session Support** (4 critical race conditions fixed)
- **Race Condition in Git Commit Tracking** - Fixed global git state shared across sessions. Each session now has isolated git tracking preventing cross-session interference.
- **Global File Watcher Singleton** - Replaced singleton watcher with session-scoped watchers. Multiple sessions can now track files independently without collision.
- **Global Git Interval Leak** - Moved interval management into session-scoped storage. Eliminates memory leaks and cross-session interval conflicts.
- **Budget Check Race Condition** - Budget validation now happens BEFORE writing to database, preventing over-budget transactions from being recorded.

#### **Data Integrity** (5 high-severity fixes)
- **Non-Atomic DB Updates** - Wrapped all insert + count operations in transactions. Eliminates race conditions in file/commit/AI usage tracking.
- **Token Estimation Bug** - Fixed `||` to `??` operator causing zero token counts to be treated as falsy values.
- **CSV Export Newline Bug** - Added proper escaping for newlines (`\n` → `\\n`) and carriage returns in CSV exports.
- **PID File Race Condition** - Added process verification before killing stale dashboard processes. Prevents killing unrelated processes with recycled PIDs.
- **Division by Zero** - Added defensive check for `costPerHour` calculation when duration is zero.

#### **Resource Management** (4 medium-severity fixes)
- **Timeout Leak in File Watcher** - Track and clear all pending setTimeout calls when stopping watcher. Prevents memory leaks.
- **Port Race in Dashboard** - Re-check port availability after killing stale process before attempting to bind.
- **Silent Failure Handling** - Git interval now properly managed per session, eliminating silent failures.
- **Integer Overflow Protection** - Added duration sanity check capping sessions at 1 year, handles clock skew gracefully.

### Fixed - Dashboard Issues
- **Mixed Content Error** - Fixed HTTPS→HTTP fetch failures when dashboard is accessed via Tailscale or reverse proxy. Changed to relative URLs.
- **Improved Error Messages** - Better error context for diff endpoint failures with specific diagnostic information.
- **Session ID Validation** - Added validation for session IDs in diff endpoints to prevent cryptic errors.

### Enhanced
- **Auto-Refresh** - Dashboard now polls for updates every 30 seconds (already implemented, confirmed working).
- **GitHub PR-Style File Diff Viewer** - Enhanced file viewer with:
  - Summary bar showing total additions/deletions
  - File path split (directory + filename)
  - Visual diff bars (GitHub-style)
  - Per-file stats with expandable diffs
  - Change type badges

### Technical Improvements
- Session-scoped state management for git tracking, file watching, and interval timers
- Atomic database transactions for all multi-step operations
- Proper resource cleanup on session end
- Better error handling and user-facing error messages

## [1.8.7] - 2025-02-09

Previous release. See git history for details.

---

## Migration Notes

### Upgrading from 1.8.x
No breaking changes. Database schema is unchanged. Simply upgrade:

```bash
npm install -g codesession-cli@latest
```

All existing sessions and data are preserved.

### Concurrent Session Users
If you previously experienced issues running multiple sessions concurrently, version 1.9.0 fully resolves:
- Cross-session data corruption
- Git tracking conflicts
- File watcher collisions
- Budget enforcement races
- Memory leaks from orphaned timers

Multiple sessions across different repos now work flawlessly.

---

**Full Changelog**: https://github.com/brian-mwirigi/codesession-cli/compare/v1.8.7...v1.9.0
