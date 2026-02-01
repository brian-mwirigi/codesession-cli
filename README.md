<div align="center">
  <h1>codesession-cli</h1>
  <p><strong>Know exactly how you spend your coding time</strong></p>
  
  <p>
    <a href="https://www.npmjs.com/package/codesession-cli"><img src="https://img.shields.io/npm/v/codesession-cli?color=brightgreen" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/codesession-cli"><img src="https://img.shields.io/npm/dm/codesession-cli" alt="npm downloads"></a>
    <a href="https://github.com/brian-mwirigi/codesession-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/codesession-cli" alt="license"></a>
  </p>

  <p><em>Track time • Monitor files • Log commits • Calculate AI costs</em></p>
</div>

---

## 🤔 The Problem

You coded for 4 hours today. But on what? Which features? How much did AI help?

**You have no data.**

## ✨ The Solution

Track everything. One command to start, one to end.

```bash
# Start tracking
cs start "Build user auth"

# Code... (automatic tracking)

# End and see stats
cs end
# Session: 2h 34m • 12 files • 3 commits • $2.45 AI cost
```

> **Demo:** _[Add GIF here showing session tracking]_

## Features

- **Session Tracking** - Start/stop coding sessions with one command
- **File Monitoring** - Automatically track file changes
- **Git Integration** - Log commits during sessions
- **AI Cost Tracking** - Record AI API usage per session
- **Statistics** - View productivity metrics
- **Local Storage** - All data stored locally in SQLite

## Installation

```bash
npm install -g codesession-cli
```

## 🚀 Usage

### Start a Session

```bash
# Start tracking
cs start "Feature name"

# Automatically tracks:
# - File changes in real-time
# - Git commits
# - Time spent
```

### End a Session

```bash
# End with notes
cs end -n "Completed feature X"

# View summary automatically
```

### View Sessions

```bash
# Show last session
cs show

# Show specific session
cs show 5

# Show with details
cs show --files --commits

# List recent sessions
cs list

# List more
cs list -l 20
```

### Statistics

```bash
# Overall stats
cs stats
```

### Log AI Usage

```bash
# Manually log AI usage (or integrate with APIs)
cs log-ai -p anthropic -m claude-3.5-sonnet -t 15000 -c 0.105
```

### Check Status

```bash
# See active session
cs status
```

## Example Output

```bash
$ cs show

Session: Build user auth

┌──────────────┬────────────────────────────┐
│ Metric       │ Value                      │
├──────────────┼────────────────────────────┤
│ Status       │ Completed                  │
│ Started      │ Feb 01, 2026 14:30         │
│ Ended        │ Feb 01, 2026 16:45         │
│ Duration     │ 2h 15m                     │
│ Files Changed│ 12                         │
│ Commits      │ 5                          │
│ AI Tokens    │ 45,000                     │
│ AI Cost      │ $2.34                      │
│ Notes        │ Completed basic auth flow  │
└──────────────┴────────────────────────────┘
```

## Use Cases

### Freelancers
Track exact time and costs per feature for client billing.

### Indie Hackers
Monitor build speed and AI spending per feature.

### Learning
See how long features take you to build.

### Content Creation
Auto-generate "I built X in Y hours" blog posts.

### Portfolio
Show concrete evidence of shipping speed.

## Integrations

### With TokenCost

```bash
# Track tokens with tokencost
tc list --json | jq -r '.[] | "cs log-ai -p \(.provider) -m \(.model) -t \(.totalTokens) -c \(.cost)"'
```

### With Git Hooks

Create `.git/hooks/post-commit`:

```bash
#!/bin/sh
# Auto-log commits to active session
cs status > /dev/null 2>&1
```

## Data Storage

All data stored locally in `~/.codesession/sessions.db` (SQLite).

No data sent anywhere. 100% privacy.

## Development

```bash
# Clone
git clone https://github.com/brian-mwirigi/codesession.git
cd codesession

# Install
npm install

# Dev mode
npm run dev -- start "Test session"

# Build
npm run build

# Test
npm link
cs start "My session"
```

## License

MIT

## Author

Built by [Brian Mwirigi](https://github.com/brian-mwirigi)

## Testing

This is a test modification to trigger file watcher.

---

**Track your velocity. Ship faster.**
