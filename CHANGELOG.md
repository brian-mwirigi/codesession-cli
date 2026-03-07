# Changelog

All notable changes to codesession-cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.0] - 2026-03-07

### Added
- **Dashboard Changelog tab** — view the full release history directly in the web dashboard, with collapsible version entries and color-coded badges
- **`CHANGELOG.md` included in npm package** — ensures the Changelog tab works for globally installed users

### Changed
- **Version bump to v2.6.0** — reflects semver-minor scope: `cs today`, dashboard tabs, architecture refactor, programmatic agent API
- **README restructured** — "What's New" section moved above Install for better first-impression visibility

### Fixed
- **`catch (err: any)` in SessionDetail.tsx** — two remaining `any` casts replaced with `catch (err: unknown)` + `instanceof Error` check
- **`JSX.Element` type in Changelog.tsx** — replaced with `ReactElement` for React 19 compatibility

## [2.5.1] - 2026-03-07

### Added
- **Dashboard Help tab** — full CLI command reference and MCP tools at a glance, accessible from the sidebar
- **Dashboard Pricing tab** — view and manage model pricing directly from the web UI
- **Dashboard Donate tab** — support links for GitHub Sponsors and Buy Me a Coffee
- **`cs today` command** — pick up where you left off: git state, TODOs, PRs, session history across all projects
  - `cs today init` / `cs today add` / `cs today remove` / `cs today projects` for multi-project management
  - `--ai` flag for AI-generated summary, `--share` for shareable markdown, `--json` for data export
- **Programmatic agent API** — `runAgentSession`, `AgentSession`, `BudgetExceededError` for building custom agent tracking
- **Typed DB layer** — 16 row interfaces replace ~30 `as any` casts across sessions and analytics modules
- **`formatRelativeTime`** — lightweight relative time formatter (no date-fns dependency) shared across CLI and today command
- **53 Vitest tests** across 5 suites (db, formatters, agents, today, proxy)

### Changed
- **Architecture** — split monolithic `index.ts` (1216→~50 lines) into `src/commands/` modules; split `db.ts` (903 lines) into `src/db/` with 5 focused modules
- **Shared pricing module** — `src/db/pricing.ts` used by CLI, proxy, MCP server, and dashboard (eliminates duplication)
- **TypeScript target** — ES2020 → ES2022 (matches Node 18+ engine requirement)
- **`package.json`** — added `"type": "commonjs"` for explicit module format
- **Dashboard /help route** — SPA fallback registered so direct navigation and refresh work
- **`collectPullRequests`** — converted from `execSync` (15s main-thread block) to async `execFile`
- **`cleanupWatcher` / `stopWatcher`** — now properly async; callers use `void` or `.catch()` to handle the Promise

### Fixed
- **Reset button always returned 400** — `postApi('/api/reset')` was missing required `?confirm=true` query parameter
- **Negative `limit` bypassed query cap** — `LIMIT -1` in SQLite returns all rows; now clamped with `Math.max(1, ...)`
- **`promptTokens: 0` silently dropped** — `0 || undefined` evaluates to `undefined`; changed to `?? undefined`
- **`duration: 0` treated as falsy** — `s.duration || null` drops legitimate 0-second durations; changed to `??`
- **Token estimation bug** — `promptTk ?? totalTokens * 0.7` used `??` which doesn't trigger for `0`; replaced with explicit `!= null` check
- **File change double-counting** — added deduplication via `Set` in both `session.ts` and `run.ts`
- **`annotations` → `notes`** — fixed JSON output field naming inconsistency in `sessionToJSON`
- **`rmdirSync` deprecation** — replaced with `rmSync` (DEP0147)
- **`formatDuration` for sub-minute** — now shows `30s` instead of `0m`; added NaN/negative guard
- **`formatCost` for small amounts** — shows `$0.0010` instead of `$0.00` for costs under $0.01
- **Dashboard catch blocks** — all 21 `catch (e: any)` → `catch (e: unknown)` with typed `errorMessage()` helper
- **Dashboard `err: any`** — server error handlers now use `NodeJS.ErrnoException` for `.code` access
- **Dashboard query param clamping** — `limit` capped at 1000, `days` capped at 365, `offset` floored at 0
- **Dashboard build guard** — graceful error message if dashboard build is missing instead of crash
- **Shell-safe browser launch** — uses `execFile` instead of `exec` to prevent command injection
- **Dead `require('fs')` / `require('path')`** — removed from `connection.ts` and dashboard DELETE handler
- **Dead imports** — removed unused `Command` from helpers.ts, `jsonWrap` from run.ts, `recoverStaleSessions` from mcp-server.ts
- **Watcher cleanup** — `watcher.close()` now properly awaited; `BudgetExceededError` handler ends session
- **Git error logging** — unexpected git errors now logged instead of silently swallowed
- **`scanTodos` memory safety** — skips files larger than 1MB
- **Icons.tsx comment** — corrected "20x20 viewBox" to "24x24 viewBox"

## [2.5.0] - 2026-03-02

### Added
- **`cs run <command>`** — One-command zero-friction tracking: starts session, starts proxy, runs command, ends session, prints cost summary
  - `cs run python agent.py` — no extra terminals or env var exports needed
  - `--name` option for custom session name (defaults to command string)
  - `--port` option for custom proxy port
  - `--no-proxy` to wrap session only without the proxy
  - Prints duration, files, commits, AI cost, and top model on exit
- **`cs proxy --session <name>`** (`-s`) — auto-start a session when starting the proxy, eliminating the need for a separate `cs start`
- **Smarter proxy startup message** — shows live active session name, auto-detects Windows vs Unix for correct env var syntax (`$env:` vs `export`), warns when no session is active
- **Local API Proxy (`cs proxy`)** — Zero-config auto-tracking via a local HTTP proxy
  - `cs proxy` starts a proxy on `http://127.0.0.1:3739` (configurable with `--port`)
  - Set `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` to proxy endpoint; all API calls are automatically tracked to the active session
  - Intercepts `POST /v1/messages` (Anthropic) and `POST /v1/chat/completions` (OpenAI); full SSE streaming support
  - `GET /health` returns proxy status and active-session metadata
  - **Security hardened**: binds `127.0.0.1` only, upstream hosts hardcoded (SSRF-proof), request bodies never stored or logged, `Authorization` headers forwarded-only, 10 MB body cap, 30 s upstream timeout, 403 for non-loopback connections, generic 502 on upstream failure (no stack leakage)
- **Vitest test suite** — 26 tests across 3 suites
  - `formatters.test.ts` — unit tests for `formatDuration` and `formatCost`
  - `proxy.test.ts` — HTTP endpoint tests (400 validation, 502 safety, localhost guard, health, 404, privacy contract)
  - `db.test.ts` — real SQLite tests using `CODESESSION_DB_PATH` env-var isolation (session lifecycle, AI usage accumulation, pricing table)
  - `npm test`, `npm run test:watch`, `npm run test:coverage` scripts
- **`CODESESSION_DB_PATH` env var** — Override database path for test isolation or custom deployments
- **0 audit vulnerabilities** — resolved critical `basic-ftp`, high `rollup`, and low `hono`/`qs` advisories via `npm audit fix`

## [2.4.0] - 2026-03-01

### Added
- **Extended Codex Pricing** — Added 4 real OpenAI Codex models to the built-in pricing table
  - `gpt-5.1-codex-max` ($1.25 / $10.00 per 1M tokens)
  - `gpt-5.1-codex-mini` ($0.25 / $2.00 per 1M tokens)
  - `gpt-5.3-codex` ($1.75 / $14.00 per 1M tokens)
  - `codex-mini-latest` ($1.50 / $6.00 per 1M tokens)
  - Auto-pricing now works for all Codex models without manual `--cost` flag
- **Community Health Files** — Added full GitHub community standards
  - `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
  - `CONTRIBUTING.md` with development setup, coding guidelines, and commit conventions
  - `SECURITY.md` with vulnerability disclosure policy
  - Issue templates: Bug Report, Feature Request, Question
  - Pull Request template

### Fixed
- **Watcher crash on filesystem errors** — Added `.on('error')` handler to chokidar watcher; errors like `ENOSPC` or `EACCES` now log to stderr instead of crashing the process ([`src/watcher.ts`](src/watcher.ts))
- **Git polling race condition** — Added `isChecking` guard flag to `checkForNewCommits` to prevent concurrent polling calls from writing duplicate commits ([`src/git.ts`](src/git.ts))
- **Git operation timeout** — All `simpleGit()` instances now have a 15s block timeout to prevent hangs on slow or network file systems
- **Shell injection risk** — Replaced `execSync('taskkill /PID ...')` with `execFileSync('taskkill', [...])` to eliminate shell evaluation in dashboard server ([`src/dashboard-server.ts`](src/dashboard-server.ts))
- **Unguarded `/api/reset` endpoint** — `POST /api/reset` now requires `?confirm=true` query param to prevent accidental data wipes
- **No input validation on `log-ai`** — Added validation for provider/model name length, non-negative tokens, and finite cost values

### Changed
- `package.json` now includes `repository`, `bugs`, and `homepage` fields for npm registry display

## [2.3.0] - 2026-02-23

### Added
- **Pricing Tab** — Full pricing management UI in the web dashboard
  - View all default model prices grouped by provider (Anthropic, OpenAI, Google, DeepSeek)
  - Inline edit: click Edit → change input/output $/M token rates → Save
  - Add custom models with provider, model name, input and output rates
  - Reset individual models back to defaults with one click
  - Changes persist in `~/.codesession/pricing.json`
  - `GET /api/v1/pricing`, `POST /api/v1/pricing`, `DELETE /api/v1/pricing/:model` endpoints
- **Claude Code Plugin** — Install codesession as a Claude Code plugin via one command
  - `/codesession:status`, `/codesession:budget`, `/codesession:dashboard` slash commands
  - Auto-invoked skill for session tracking during coding sessions
  - `.mcp.json` for automatic MCP server setup with `npx codesession-cli mcp`
- **Marketplace Listing** — Listed on [claudemarketplaces.com](https://claudemarketplaces.com)
  - `.claude-plugin/marketplace.json` at repo root for auto-discovery
- **Extended Model Pricing** — Added GPT-5, GPT-5 mini, GPT-5-codex, GPT-5.1-codex, GPT-5.2-codex to default pricing table
- **SEO** — Enriched keywords in package.json (43 keywords), README, and plugin manifests with name variations and agent platform names

## [2.2.0] - 2026-02-19

### Added
- **MCP Server** — `cs mcp` starts a Model Context Protocol server for Claude Code integration
  - 8 tools: `session_status`, `start_session`, `end_session`, `log_ai_usage`, `add_note`, `get_stats`, `list_sessions`, `check_budget`
  - Install as MCP server: `npx codesession-cli mcp` via Claude Code settings
  - Available as `codesession-mcp` binary
- **Donate Page** — `/donate` route in dashboard with GitHub Sponsors and Buy Me a Coffee links
- **npm Downloads Badge** — Downloads/month badge in README header

## [2.1.0] - 2026-02-17

### Added
- **Parallel Session Support** — Multiple simultaneous sessions in different git repositories
  - `cs start` now scopes sessions by git root rather than globally blocking
  - `resolveActiveSession()` helper picks the right session for the current directory
  - Multiple AI agents in different repos can track sessions independently

## [2.0.1] - 2026-02-15

### Fixed
- Removed M-Pesa from Donate page

## [2.0.0] - 2026-02-14

### Added
- **Alerts Dashboard** — Dedicated Alerts page in the web dashboard with spend threshold monitoring
  - Set daily, total, and per-session cost limits with visual progress bars
  - ON/OFF toggle per rule with status dots (green/red/gray)
  - Alarm mode: browser notifications + Web Audio sound when budgets are exceeded
  - Sessions over limit table
  - Status badges showing active rules, alarm count, and triggered alerts
- **Start Fresh** — Reset all session data from the dashboard with one click
  - "Start Fresh" button in sidebar with confirmation modal
  - Clears all sessions, AI usage, file changes, commits, and alert thresholds
  - Properly cleans up active session watchers and git pollers before clearing
  - `POST /api/reset` endpoint for programmatic reset
- **Insights Dashboard** — New analytics page with file hotspots, activity heatmap, project breakdown, and pricing table

### Fixed
- **AudioContext Autoplay Policy** — Added `ctx.resume()` for suspended state to fix silent alarms on first interaction
- **Web Audio Scheduling** — Added `setValueAtTime` before `exponentialRampToValueAtTime` for reliable alarm sound
- **Alarm on Page Load** — Alarms no longer fire when navigating to the Alerts page with existing exceeded thresholds (only NEW breaches trigger alarms)
- **Null Reference in Alerts** — Fixed `firedRef.current.delete()` crash when threshold is changed before initial data load
- **Active Session Cleanup on Reset** — `clearAllData()` now properly stops file watchers and git pollers for active sessions before deleting records

### Changed
- Dashboard sidebar now includes Alerts and Insights navigation items
- Alerts configuration migrated from inline Overview controls to dedicated page
- Threshold storage format upgraded from plain numbers to objects with alarm flag (backward-compatible migration included)

## [1.9.4] - 2026-02-12

### Fixed
- **CSV Export Missing Agent Data** - Added `agents` column to CSV export with unique agent names per session
- **CODESESSION_AGENT_NAME Env Var** - Environment variable fallback was documented but not implemented; now properly falls back to `process.env.CODESESSION_AGENT_NAME` when `--agent` is not provided
- **Session ID Validation** - Added missing `isNaN` check on the `/api/v1/sessions/:id/diff-stats` endpoint to return 400 for invalid IDs

## [1.9.1] - 2026-02-11

### Added
- **Agent Name Tracking** - Added optional `--agent` parameter to `cs log-ai` command for tracking which agent performed the work
  - CLI: `cs log-ai -p anthropic -m claude-sonnet-4 --agent "Code Review Bot" --json`
  - API: `session.logAI('anthropic', 'claude-sonnet-4', tokens, cost, { agentName: 'Research Agent' })`
  - Dashboard: New "Agent" column in AI usage table showing agent names
  - Database: Added `agent_name` column to `ai_usage` table with automatic migration
  - Timeline: Agent names displayed inline with AI usage entries (e.g., `[Agent Name]`)

### Technical Details
- Optional parameter - fully backward compatible with existing usage
- Supports environment variable fallback: `CODESESSION_AGENT_NAME`
- Enables differentiation between multiple agents in concurrent workflows
- Particularly useful for multi-agent systems, A/B testing, and cost attribution

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

**Full Changelog**: https://github.com/brian-mwirigi/codesession-cli/compare/v1.9.4...v2.0.0
