# Claude Code + codesession-cli

Track what your Claude Code sessions actually cost — fully automatic.

## Install

```bash
npm install -g codesession-cli
cs --version   # Should print 2.0.0+
```

## Fully Automatic Setup (Recommended)

Add this to `.claude/settings.json` (project-level) or `~/.claude/settings.json` (global):

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
            "command": "cs auto-log --provider anthropic --model claude-sonnet-4 2>/dev/null || true",
            "timeout": 15
          }
        ]
      }
    ],
    "SessionEnd": [
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

That's it. Every Claude Code session now automatically:

1. **SessionStart** — creates a codesession tracking session
2. **Stop** (after each Claude response) — reads the conversation transcript, estimates tokens, and logs AI usage with cost
3. **SessionEnd** — closes the session, captures git commits and file changes

The `|| true` on every command means tracking failures never block your work.

> **Windows users:** Replace `2>/dev/null` with `2>NUL`, or use full paths like `C:\\Users\\you\\AppData\\Roaming\\npm\\cs.cmd`.

### How `cs auto-log` works

The `auto-log` command is designed specifically for Claude Code hooks:

1. Reads the hook input JSON from stdin (which includes `transcript_path`)
2. Parses the Claude Code conversation transcript (JSONL)
3. Tracks its position so it only counts new messages since the last call
4. Estimates token counts from the content (~1 token per 4 characters)
5. Auto-calculates cost from the built-in pricing table
6. Logs everything to the active codesession

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--provider <name>` | `anthropic` | AI provider |
| `--model <name>` | `claude-sonnet-4` | Model for pricing lookup |
| `--agent <name>` | `Claude Code` | Agent name in the dashboard |

Change `--model` to match what you're actually using:

```json
"command": "cs auto-log --provider anthropic --model claude-opus-4-6"
```

### What gets tracked

- **AI tokens & cost** — estimated from transcript, auto-priced per model
- **Git commits** — every commit Claude makes during the session
- **Files changed** — all file modifications between start and end
- **Duration** — how long the session lasted
- **Agent name** — shows "Claude Code" in the dashboard for filtering

## Alternative: CLAUDE.md Instructions (No Hooks)

If you prefer Claude to handle tracking as part of its workflow, add to your `CLAUDE.md`:

```markdown
## Session Tracking

At the start of every task:
cs start "<task description>" --json --close-stale

After each significant piece of work, log usage:
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens <tokens> --completion-tokens <tokens> --agent "Claude Code" --json

After completing the task:
cs end -n "<what you did>" --json
```

## Alternative: Manual CLI

Run alongside Claude Code yourself:

```bash
cs start "Refactor auth module" --close-stale
# Claude Code does its thing...
cs end -n "Refactored auth, added tests"
cs dashboard
```

## Viewing Your Data

```bash
cs dashboard          # Web UI at localhost:3737
cs status --json      # Quick terminal summary
cs export --format csv  # Spreadsheet export
```

The dashboard shows cost trends, per-session breakdowns, model analytics, file hotspots, activity heatmaps, and budget alerts.

## Multi-Agent Tracking

Using Claude Code alongside OpenClaw or other agents? The `--agent` flag on `auto-log` (default: "Claude Code") keeps everything separated in the dashboard. Each agent gets its own cost breakdown.

## Budget Alerts

Set spend limits in the dashboard's Alerts page:
- **Daily / per-session / total** cost thresholds
- **Alarm mode** — browser notification + actual sound when exceeded

## Troubleshooting

**"session_active" error on start:**
The `--close-stale` flag handles this automatically.

**Hook not firing:**
Run `claude --debug` to see hook execution logs. Make sure `cs` is in your PATH.

**Token estimates seem off:**
`auto-log` estimates ~1 token per 4 characters from the transcript. It's approximate but consistent. For exact tracking, use `cs log-ai` with real token counts from your API response.

**Dashboard won't open:**
Try `cs dashboard --port 4000` or `cs dashboard --no-open` and navigate manually.

**Windows path issues:**
Use full paths: `"command": "C:\\Users\\you\\AppData\\Roaming\\npm\\cs.cmd auto-log ..."`.
