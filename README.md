<div align="center">
  <h1>codesession-cli</h1>
  <p><strong>Track what your AI agents actually cost</strong></p>
  
  <p>
    <a href="https://www.npmjs.com/package/codesession-cli"><img src="https://img.shields.io/npm/v/codesession-cli?color=brightgreen" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/codesession-cli"><img src="https://img.shields.io/npm/dm/codesession-cli" alt="npm downloads"></a>
    <a href="https://github.com/brian-mwirigi/codesession-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/codesession-cli" alt="license"></a>
  </p>

  <p><em>Track agent runs • Monitor files • Log commits • Enforce budgets</em></p>
</div>

---

## The Problem

Your AI agent just ran for 45 minutes. It made 23 API calls, edited 15 files, and created 4 commits.

**You have no idea what it cost.**

OpenClaw, Claude Code, custom agents — they all burn tokens with zero visibility. You find out when the bill arrives.

## The Solution

One command to start tracking. Everything logged automatically.

```bash
# Start tracking an agent run
cs start "Fix authentication bug"

# Agent does its thing... (files, commits, AI calls tracked automatically)

# End and see the damage
cs end
# Session: 47m • 15 files • 4 commits • $8.47 AI cost
```

## Works With

- **[OpenClaw](https://openclaw.ai)** — Ships as an OpenClaw skill ([install from ClawHub](#openclaw-skill))
- **Claude Code** — Track autonomous coding sessions
- **Custom agents** — Programmatic API with budget enforcement
- **Manual sessions** — Track your own coding time and costs

## Installation

```bash
npm install -g codesession-cli
```

## Quick Start

### CLI Usage

```bash
# Start a session
cs start "Build user auth"

# Log AI usage — cost auto-calculated from built-in pricing
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000

# Or provide cost manually
cs log-ai -p anthropic -m claude-opus-4-6 -t 15000 -c 0.30

# Check current costs mid-session
cs status

# End session
cs end -n "Auth complete, all tests passing"

# View session history
cs list
cs show --files --commits
cs stats

# Export sessions
cs export --format csv
cs export --format json --limit 10
```

### JSON Output (for agents)

Every command supports `--json` for machine-readable output:

```bash
cs status --json
# {"id":42,"name":"Fix auth","status":"active","aiCost":3.47,"aiTokens":89000,...}

cs log-ai -p openai -m gpt-4o --prompt-tokens 3000 --completion-tokens 2000 --json
# {"logged":{"provider":"openai","model":"gpt-4o","tokens":5000,"promptTokens":3000,"completionTokens":2000,"cost":0.0275},"session":{"id":42,"aiCost":3.52,"aiTokens":94000}}
```

---

## OpenClaw Skill

codesession-cli ships as an [OpenClaw](https://openclaw.ai) skill. The agent automatically tracks its own session costs.

### Install the skill

Copy the skill to your OpenClaw workspace:

```bash
# Option 1: Copy from npm package
cp -r $(npm root -g)/codesession-cli/skills/codesession ~/.openclaw/skills/

# Option 2: Clone and copy
git clone https://github.com/brian-mwirigi/codesession-cli.git
cp -r codesession-cli/skills/codesession ~/.openclaw/skills/
```

### What it does

Once installed, the OpenClaw agent will:

1. Run `cs start "task name"` at the beginning of each task
2. Log API usage with `cs log-ai` after each AI call
3. Check costs with `cs status --json` during long tasks
4. Run `cs end` when the task completes

### Example: Agent run tracked by codesession

```
You: Fix the payment processing bug and add retry logic

Agent: Starting session tracking...
  $ cs start "Fix payment processing + retry"
  ✓ Session started

  [Agent works: reads files, edits code, runs tests...]
  $ cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 8000 --completion-tokens 4000
  $ cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 12000 --completion-tokens 6000
  $ cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 5000 --completion-tokens 3000

  $ cs end -n "Fixed payment bug, added exponential backoff retry"
  ✓ Session ended

  Session: 12m • 6 files • 2 commits • $0.76 AI cost
```

After 50 agent runs:

```bash
$ cs stats
┌──────────────┬────────────────┐
│ Total Sessions│ 50            │
│ Total Time   │ 8h 34m        │
│ Files Changed│ 312           │
│ Commits      │ 87            │
│ Total AI Cost│ $47.23        │
└──────────────┴────────────────┘
```

---

## Programmatic API (for agent frameworks)

Build codesession tracking directly into your agent:

```typescript
import { AgentSession, BudgetExceededError } from 'codesession-cli/agents';

const session = new AgentSession('Refactor auth module', {
  budget: 5.00,        // Hard cap: stop at $5
  directory: './src',   // Watch this directory
  git: true,           // Track commits
});

session.start();

// After each AI call — with granular tokens (cost auto-calculated)
session.logAI('anthropic', 'claude-opus-4-6', 15000, 0.30, {
  promptTokens: 10000,
  completionTokens: 5000,
});

// Pre-flight check
if (!session.canAfford(2.00)) {
  console.log('Switching to cheaper model...');
}

// Budget enforcement is automatic
try {
  session.logAI('openai', 'gpt-4o', 50000, 4.80);
} catch (e) {
  if (e instanceof BudgetExceededError) {
    console.log(`Stopped at $${e.spent} (limit: $${e.budget})`);
  }
}

const summary = session.end();
// { duration: 847, filesChanged: 12, aiCost: 4.80, commits: 3, ... }
```

### `runAgentSession` helper

Wraps start/end/error handling automatically:

```typescript
import { runAgentSession } from 'codesession-cli/agents';

const summary = await runAgentSession(
  'Fix all linting errors',
  { budget: 3.00, directory: './src' },
  async (session) => {
    // Your agent logic
    const response = await anthropic.messages.create({ ... });
    session.logAI('anthropic', 'claude-sonnet-4-5', tokens, cost);
  }
);

console.log(`Done: ${summary.filesChanged} files, $${summary.aiCost}`);
```

---

## All Commands

| Command | Description |
|---------|-------------|
| `cs start <name>` | Start tracking a session |
| `cs end [-n notes]` | End session, show summary |
| `cs status` | Show active session |
| `cs show [id] [--files] [--commits]` | Show session details |
| `cs list [-l limit]` | List recent sessions |
| `cs stats` | Overall statistics |
| `cs log-ai -p <provider> -m <model> [options]` | Log AI usage (cost auto-derived or manual) |
| `cs export [--format json\|csv] [--limit n]` | Export sessions as JSON or CSV |

All commands support `--json` for machine-readable output.

### log-ai options

| Flag | Description |
|------|-------------|
| `-p, --provider` | AI provider (required) |
| `-m, --model` | Model name (required) |
| `-t, --tokens` | Total tokens |
| `--prompt-tokens` | Prompt/input tokens |
| `--completion-tokens` | Completion/output tokens |
| `-c, --cost` | Cost in USD (auto-calculated if omitted for known models) |

## Data Storage

All data stored locally in `~/.devsession/sessions.db` (SQLite with WAL mode for concurrent access).

No telemetry. No cloud. 100% local.

## Example Output

```bash
$ cs show

Session: Build user auth

┌──────────────┬────────────────────────────┐
│ Metric       │ Value                      │
├──────────────┼────────────────────────────┤
│ Status       │ Completed                  │
│ Started      │ Feb 09, 2026 14:30         │
│ Ended        │ Feb 09, 2026 16:45         │
│ Duration     │ 2h 15m                     │
│ Files Changed│ 12                         │
│ Commits      │ 5                          │
│ AI Tokens    │ 45,000                     │
│ AI Cost      │ $2.34                      │
│ Notes        │ Completed basic auth flow  │
└──────────────┴────────────────────────────┘
```

## License

MIT

## Author

Built by [Brian Mwirigi](https://github.com/brian-mwirigi)

---

**Know what your agents cost. Ship with confidence.**
