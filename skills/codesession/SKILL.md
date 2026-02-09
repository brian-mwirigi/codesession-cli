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
cs start "task description"
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
Supported models for auto-pricing: claude-opus-4-6, claude-sonnet-4-5, claude-sonnet-4, claude-haiku-3.5, gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o4-mini, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, deepseek-r1, deepseek-v3

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

## Workflow

1. At task start: `cs start "Fix authentication bug"`
2. After each AI call: `cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000`
3. Check spend: `cs status --json` → read `aiCost` field
4. At task end: `cs end -n "Fixed the auth bug, added tests"`

## Cost estimation guide

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|----------------------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-sonnet-4-5 | $3.00 | $15.00 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4.1 | $2.00 | $8.00 |
| gemini-2.5-pro | $1.25 | $10.00 |

## Budget awareness

If the user has set a budget or you detect high spending:
- Check `cs status --json` before expensive operations
- Warn the user if `aiCost` exceeds $5.00 in a single session
- Suggest cheaper models if costs are escalating

## JSON output

All commands support `--json` for machine-readable output. Use this when you need to parse session data programmatically.
