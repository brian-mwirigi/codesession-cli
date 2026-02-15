# Claude Code + codesession-cli

Track what your Claude Code sessions actually cost — automatically or manually.

## Install

```bash
npm install -g codesession-cli
cs --version   # Should print 2.0.0
```

## Option A: Automatic Tracking with Hooks

Claude Code hooks can start and end sessions automatically. Add this to your project's `.claude/settings.json` (or `~/.claude/settings.json` for global):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "cs start \"Claude Code session\" --json --close-stale 2>/dev/null || true",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cs end --json 2>/dev/null || true",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

This starts a codesession when Claude Code launches and ends it when Claude finishes responding. The `|| true` ensures tracking failures never block your actual work.

> **Windows users:** Replace `2>/dev/null` with `2>NUL` or wrap in a PowerShell call.

### What gets tracked automatically

- **Git commits** — every commit Claude makes during the session
- **Files changed** — all file modifications between start and end
- **Duration** — how long the session lasted
- **Working directory** — which project the session was in

### What you still need to log manually

AI token usage and cost require explicit logging because Claude Code doesn't expose token counts to hooks. Add this to your `CLAUDE.md`:

```markdown
## Cost Tracking

After completing a task, log your AI usage:
cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens <tokens> --completion-tokens <tokens> --json
```

Or if you don't have exact token counts, log with a manual cost estimate:

```markdown
cs log-ai -p anthropic -m claude-opus-4-6 -t 50000 -c 0.75 --json
```

## Option B: CLAUDE.md Instructions (No Hooks)

If you prefer not to use hooks, add tracking instructions directly to your project's `CLAUDE.md`:

```markdown
## Session Tracking

At the start of every task:
cs start "<task description>" --json --close-stale

After completing the task:
cs end -n "<what you did>" --json

Add notes during long tasks:
cs note "<what you're doing now>" --json
```

Claude Code will follow these instructions and run the commands as part of its workflow.

## Option C: Manual (Just Use the CLI)

Run commands yourself alongside Claude Code:

```bash
# Before starting work
cs start "Refactor auth module" --close-stale

# Claude Code does its thing...

# When done
cs end -n "Refactored auth, added tests"

# Check the dashboard
cs dashboard
```

## Viewing Your Data

```bash
# Open the web dashboard
cs dashboard

# Quick terminal summary
cs status --json

# Export for spreadsheets
cs export --format csv
```

The dashboard runs at `http://localhost:3737` and shows:
- Cost trends and spend projections
- Per-session breakdowns with file diffs and commit history
- Model usage and cost-per-model analytics
- File hotspots and activity heatmaps
- Budget alerts with alarm mode

## Multi-Agent Tracking

If you use Claude Code alongside other agents (OpenClaw, custom scripts), use the `--agent` flag to differentiate:

```bash
cs log-ai -p anthropic -m claude-opus-4-6 -t 50000 -c 0.75 --agent "Claude Code" --json
```

The dashboard will show cost breakdowns per agent, so you can compare what each one costs.

## Budget Alerts

Set spend limits in the dashboard's Alerts page:

```bash
cs dashboard   # Navigate to Alerts tab
```

- **Daily limit** — cap total spend per day
- **Per-session limit** — cap individual session costs
- **Total limit** — cap cumulative all-time spend
- **Alarm mode** — browser notification + sound when exceeded

## Troubleshooting

**"session_active" error on start:**
Use `--close-stale` to automatically close orphaned sessions from crashes.

**Hook not firing:**
Check `claude --debug` for hook execution logs. Make sure `cs` is in your PATH.

**Dashboard won't open:**
Try `cs dashboard --port 4000` if port 3737 is busy, or `cs dashboard --no-open` and navigate manually.

**Windows path issues:**
Use full paths in hooks: `"command": "C:\\Users\\you\\AppData\\Roaming\\npm\\cs.cmd start ..."`.
