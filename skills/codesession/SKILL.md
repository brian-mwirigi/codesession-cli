---
name: codesession
description: Track agent session costs, file changes, and git commits with codesession-cli. Enforces budget limits and provides detailed session analytics.
metadata: {"openclaw": {"emoji": "📊", "homepage": "https://github.com/brian-mwirigi/codesession-cli", "requires": {"bins": ["cs"]}, "install": [{"id": "npm", "kind": "node", "package": "codesession-cli", "bins": ["cs"], "label": "Install codesession-cli (npm)"}]}}
---

# Session Cost Tracking (codesession-cli)

You have access to `cs` (codesession-cli) for tracking session costs, file changes, and git activity.

## When to use

- **Always** start a tracked session at the beginning of a multi-step task
- **Always** log AI usage after each API call you make
- **Always** end the session when the task is complete
- Check budget before expensive operations

## Commands

### Start tracking
```bash
# Normal start
cs start "task description"

# Resume if a session was left open (e.g. after a crash)
cs start "task description" --resume

# Auto-close stale sessions before starting
cs start "task description" --close-stale
```

### Log AI usage (after each API call)
```bash
# With granular tokens (cost auto-calculated from built-in pricing):
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000

# With manual cost:
cs log-ai -p anthropic -m claude-opus-4-6 -t 15000 -c 0.30

# With all fields:
cs log-ai -p openai -m gpt-4o --prompt-tokens 5000 --completion-tokens 1500 -c 0.04
```
Providers: `anthropic`, `openai`, `google`, `mistral`, `deepseek`
Cost is auto-calculated from a configurable pricing table (17+ built-in models). Use `cs pricing list --json` to see known models. If a model is unknown, provide `-c <cost>` manually.

### Check current status
```bash
cs status --json
```
Returns JSON with current session cost, tokens, files changed, duration.

### End session and get summary
```bash
cs end -n "completion notes"
```

### View session details with full breakdown
```bash
cs show --json --files --commits
```

### View historical stats
```bash
cs stats --json
```

### Export sessions
```bash
cs export --format json --limit 10
cs export --format csv
```

### Add a note / annotation
```bash
cs note "Starting refactor phase"
cs note "Tests passing, moving to cleanup"
```
Timestamped annotations appear in `cs show --json` under `annotations`.

### Recover stale sessions
```bash
cs recover --max-age 12
```
Auto-ends any active sessions older than 12 hours.

## Workflow

1. At task start: `cs start "Fix authentication bug" --close-stale`
2. Add context notes: `cs note "analyzing auth flow"`
3. After each AI call: `cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000`
4. Check spend: `cs status --json` → read `aiCost` field
5. At task end: `cs end -n "Fixed the auth bug, added tests"`

## Pricing

Pricing is configurable. Run `cs pricing list` to see all known model prices. The user can override or add models via `cs pricing set <model> <input> <output>` (per 1M tokens).

If the model isn't in the pricing table, you must provide `-c <cost>` when logging.

## Budget awareness

If the user has set a budget or you detect high spending:
- Check `cs status --json` before expensive operations
- Warn the user if `aiCost` exceeds $5.00 in a single session
- Suggest cheaper models if costs are escalating

## Important

- Use `--close-stale` on `cs start` to avoid "session_active" errors from prior crashes
- If `cs` is not installed, skip session tracking — don't block the user's task
- Prefer `--json` for all commands so you can parse the response

## JSON output

All commands support `--json` for machine-readable output. Use this when you need to parse session data programmatically.
