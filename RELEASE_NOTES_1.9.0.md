# v1.9.0 - Major Stability & Concurrent Session Support

## 🎯 Overview

This is a **major stability release** fixing 13 critical bugs that prevented reliable concurrent session usage. If you've experienced data corruption, race conditions, or unexpected behavior when running multiple sessions, **upgrade immediately**.

## 🔥 Critical Fixes

### Concurrent Session Support (4 race conditions eliminated)

**Before v1.9.0:** Running multiple sessions simultaneously would cause data corruption, cross-session interference, and unpredictable behavior.

**After v1.9.0:** Multiple agents/repos can run concurrently with zero conflicts.

1. **Git Tracking Race Condition** - Each session now has isolated git state
2. **File Watcher Singleton** - Session-scoped watchers prevent collisions
3. **Git Interval Memory Leak** - Proper cleanup eliminates orphaned timers
4. **Budget Check Race** - Budget validation before DB write prevents over-spend

### Data Integrity (5 high-severity fixes)

5. **Non-Atomic DB Updates** - All operations wrapped in transactions
6. **Token Estimation Bug** - Fixed `||` vs `??` causing zero tokens to be ignored
7. **CSV Export Corruption** - Proper escaping for newlines in exports
8. **PID File Race** - Verification before killing processes prevents disasters
9. **Division by Zero** - Defensive checks for edge cases

### Resource Management (4 medium-severity fixes)

10. **Timeout Leaks** - All setTimeout calls now tracked and cleared
11. **Port Binding Race** - Dashboard verifies port is truly free before binding
12. **Silent Failures** - Git polling properly managed per session
13. **Integer Overflow** - Duration capping handles clock skew gracefully

## 🌐 Dashboard Improvements

- **Fixed:** HTTPS mixed content errors when accessing via Tailscale/reverse proxy
- **Enhanced:** Error messages now provide diagnostic context
- **Confirmed:** Auto-refresh (30s polling) and GitHub PR-style diff viewer working perfectly

## 📊 Impact

| Before 1.9.0 | After 1.9.0 |
|--------------|-------------|
| ❌ Concurrent sessions corrupt data | ✅ Unlimited concurrent sessions |
| ❌ Budget enforcement unreliable | ✅ Budget checked before DB write |
| ❌ Memory leaks from orphaned timers | ✅ All resources properly cleaned up |
| ❌ CSV exports break on newlines | ✅ Proper escaping for all edge cases |
| ❌ Dashboard fails via HTTPS proxy | ✅ Relative URLs work everywhere |

## 🔧 Technical Details

### Session-Scoped Architecture

All global state migrated to session-scoped Maps:
- `Map<sessionId, GitSession>` - git instance + commit hash + interval
- `Map<sessionId, WatcherSession>` - file watcher + changed files + timeouts

### Atomic Transactions

Database operations now use `db.transaction()`:
- `addFileChange()` - Insert + count update atomic
- `addCommit()` - Insert + count update atomic
- `addAIUsage()` - Insert + sum update atomic

### Resource Cleanup

Automatic cleanup on session end:
- `cleanupGit(sessionId)` - Stops polling + removes state
- `cleanupWatcher(sessionId)` - Closes watcher + clears timeouts + removes state

## 🚀 Upgrade

```bash
npm install -g codesession-cli@latest
```

**Zero breaking changes.** All existing data preserved.

## 📦 Links

- [npm](https://www.npmjs.com/package/codesession-cli)
- [Full Changelog](https://github.com/brian-mwirigi/codesession-cli/blob/main/CHANGELOG.md)
- [OpenClaw Skill](https://clawhub.ai/skills/codesession) *(coming soon)*

## 🙏 Acknowledgments

Special thanks to [@billrole](https://github.com/billrole) for extensive testing and feedback that identified many of these critical issues.

---

**This release makes codesession-cli production-ready for concurrent multi-agent workflows.**
