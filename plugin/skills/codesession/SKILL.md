---
name: codesession
description: Track AI agent session costs, tokens, file changes, and git commits. Use when starting tasks, logging AI usage, checking budgets, or ending sessions. The MCP server handles all operations automatically.
---

# codesession — Session Cost Tracking

You have access to codesession MCP tools for tracking AI session costs. Use them throughout your workflow.

## When to Use

- **Task start**: Call `start_session` with a descriptive name
- **After AI calls**: Call `log_ai_usage` with provider, model, and token counts
- **Budget checks**: Call `check_budget` before expensive operations
- **Add context**: Call `add_note` for milestones and progress
- **Task end**: Call `end_session` with completion notes

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| `session_status` | Get active session status (cost, tokens, duration) |
| `start_session` | Start a new tracking session |
| `end_session` | End session and get full summary |
| `log_ai_usage` | Log token usage (auto-prices 21+ models incl. Codex) |
| `add_note` | Add timestamped notes |
| `get_stats` | Overall statistics across all sessions |
| `list_sessions` | List recent sessions |
| `check_budget` | Check spending breakdown by model |

## Auto-Pricing

Cost is auto-calculated for known models. Supported providers: `anthropic`, `openai`, `google`, `mistral`, `deepseek`. Codex models supported: `codex-mini-latest`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.3-codex`. If a model is unknown, provide the `cost` parameter manually.

## Budget Awareness

- Check `check_budget` before expensive operations
- Warn the user if session cost exceeds $5.00
- Suggest cheaper models if costs are escalating

## Dashboard

Users can view all session data in a web dashboard:
```bash
npx codesession-cli dashboard
```
