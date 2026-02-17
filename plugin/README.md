# codesession — Claude Code Plugin

Track AI session costs, tokens, file changes, and commits directly inside Claude Code.

## Install

### From marketplace (recommended)
```
/plugin marketplace add brian-mwirigi/codesession-cli
/plugin install codesession@codesession-marketplace
```

### Manual MCP setup
```bash
claude mcp add --transport stdio codesession -- npx codesession-cli mcp
```

### Local testing
```bash
claude --plugin-dir ./plugin
```

## What you get

### MCP Tools (8)
| Tool | Description |
|------|-------------|
| `session_status` | Get active session status |
| `start_session` | Start a new tracking session |
| `end_session` | End session with summary |
| `log_ai_usage` | Log tokens with auto-pricing |
| `add_note` | Add timestamped notes |
| `get_stats` | Overall statistics |
| `list_sessions` | List recent sessions |
| `check_budget` | Spending breakdown by model |

### Slash Commands (3)
| Command | Description |
|---------|-------------|
| `/codesession:status` | Quick session status |
| `/codesession:budget` | Budget and spending breakdown |
| `/codesession:dashboard` | Open web dashboard |

### Auto Skill
Claude automatically tracks sessions when working on multi-step tasks.

## Requirements

- Node.js 16+
- `codesession-cli` is installed automatically via npx
