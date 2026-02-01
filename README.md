# DevSession

Track your AI coding sessions: time, files, commits, and AI costs.

## Features

- **Session Tracking** - Start/stop coding sessions with one command
- **File Monitoring** - Automatically track file changes
- **Git Integration** - Log commits during sessions
- **AI Cost Tracking** - Record AI API usage per session
- **Statistics** - View productivity metrics
- **Local Storage** - All data stored locally in SQLite

## Quick Start

```bash
# Install
npm install -g devsession

# Start a session
ds start "Build user auth"

# Code away... (files, commits tracked automatically)

# End session
ds end -n "Completed basic auth flow"

# View session
ds show
```

## Installation

```bash
npm install -g devsession
```

## Usage

### Start a Session

```bash
# Start tracking
ds start "Feature name"

# Automatically tracks:
# - File changes in real-time
# - Git commits
# - Time spent
```

### End a Session

```bash
# End with notes
ds end -n "Completed feature X"

# View summary automatically
```

### View Sessions

```bash
# Show last session
ds show

# Show specific session
ds show 5

# Show with details
ds show --files --commits

# List recent sessions
ds list

# List more
ds list -l 20
```

### Statistics

```bash
# Overall stats
ds stats
```

### Log AI Usage

```bash
# Manually log AI usage (or integrate with APIs)
ds log-ai -p anthropic -m claude-3.5-sonnet -t 15000 -c 0.105
```

### Check Status

```bash
# See active session
ds status
```

## Example Output

```bash
$ ds show

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
tc list --json | jq -r '.[] | "ds log-ai -p \(.provider) -m \(.model) -t \(.totalTokens) -c \(.cost)"'
```

### With Git Hooks

Create `.git/hooks/post-commit`:

```bash
#!/bin/sh
# Auto-log commits to active session
ds status > /dev/null 2>&1
```

## Data Storage

All data stored locally in `~/.devsession/sessions.db` (SQLite).

No data sent anywhere. 100% privacy.

## Development

```bash
# Clone
git clone https://github.com/brian-mwirigi/devsession.git
cd devsession

# Install
npm install

# Dev mode
npm run dev -- start "Test session"

# Build
npm run build

# Test
npm link
ds start "My session"
```

## License

MIT

## Author

Built by [Brian Mwirigi](https://github.com/brian-mwirigi)

---

**Track your velocity. Ship faster.**
