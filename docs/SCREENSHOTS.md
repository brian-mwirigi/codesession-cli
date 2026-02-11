# Screenshot Guide for README

This document describes the screenshots needed for the README.md file.

## Required Screenshots

### 1. Dashboard Overview (`dashboard-overview.png`)
**Path**: `docs/screenshots/dashboard-overview.png`
**Size**: 1600x1000px (or similar 16:10 ratio)
**What to capture**:
- Navigate to `http://localhost:3737`
- Overview page showing:
  - KPI cards (Total Cost, Total Tokens, Sessions, Avg Session Time)
  - Daily cost trend chart
  - Daily token trend chart
  - Recent sessions table (showing multiple sessions)
- **Make sure**: Have at least 3-4 sessions with varying costs ($0.01 - $5.00 range)

**Setup**:
```bash
# Create some sample sessions first
cs start "Sample Session 1" --json --close-stale
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 5000 --completion-tokens 1500 --agent "Code Review Bot" --json
cs end -n "Completed" --json

cs start "Sample Session 2" --json --close-stale
cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 12000 --completion-tokens 3000 --agent "Research Agent" --json
cs end -n "Completed" --json

# Then open dashboard
cs dashboard
```

---

### 2. Session Detail View (`session-detail.png`)
**Path**: `docs/screenshots/session-detail.png`
**Size**: 1600x1200px
**What to capture**:
- Click on a session from the Sessions page
- Show session detail page with:
  - Session header (name, duration, cost, tokens)
  - Timeline view showing mix of:
    - File changes
    - Git commits
    - AI usage entries (with agent names visible)
    - Notes/annotations
  - Files Changed table
  - Commits table
  - AI Usage table (with Agent column)

**Setup**:
```bash
cs start "Feature: User Authentication" --json --close-stale
cs note "Starting authentication implementation" --json
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000 --agent "Code Review Bot" --json
cs note "Auth service complete, adding tests" --json
cs log-ai -p openai -m gpt-4o --prompt-tokens 5000 --completion-tokens 1500 --agent "Test Writer" --json
cs end -n "Authentication feature complete with tests" --json
```

---

### 3. AI Usage with Agent Tracking (`agent-tracking.png`)
**Path**: `docs/screenshots/agent-tracking.png`
**Size**: 1400x800px
**What to capture**:
- Session detail page
- **Focus on the AI Usage table**
- Zoom to show the table clearly with:
  - Provider column
  - Model column
  - **Agent column** (showing different agent names)
  - Prompt/Completion tokens
  - Cost
  - Time

**Setup**:
```bash
cs start "Multi-Agent Demo" --json --close-stale
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 5000 --completion-tokens 1500 --agent "Code Review Bot" --json
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 3000 --completion-tokens 800 --agent "Bug Fixer" --json
cs log-ai -p openai -m gpt-4o --prompt-tokens 4000 --completion-tokens 1200 --agent "Test Writer" --json
cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 10000 --completion-tokens 2500 --agent "Research Agent" --json
cs end -n "Multi-agent workflow demo" --json
```

---

### 4. Cost Charts & Analytics (`cost-charts.png`)
**Path**: `docs/screenshots/cost-charts.png`
**Size**: 1600x1000px
**What to capture**:
- Navigate to "Models" page in dashboard
- Show:
  - Model breakdown chart (pie/bar chart)
  - Cost per model
  - Token distribution
  - Provider comparison

---

## Screenshot Tips

1. **Use clean data**: Create sample sessions with realistic names and costs
2. **Light mode**: Take screenshots in light mode for better visibility
3. **Hide sensitive data**: No personal info, real project names, or API keys
4. **High resolution**: Use browser zoom at 100% or 110%
5. **Consistent styling**: Same browser, same theme for all screenshots
6. **Crop wisely**: Remove browser chrome (address bar) if needed

## Tools

- **Windows**: Win + Shift + S (Snipping Tool)
- **macOS**: Cmd + Shift + 4
- **Linux**: GNOME Screenshot, Flameshot
- **Browser Extensions**: Full Page Screenshot, Awesome Screenshot

## After Capturing

1. Save screenshots to `docs/screenshots/` with exact names above
2. Optimize images (compress to < 500KB each):
   ```bash
   # Using ImageMagick
   magick convert dashboard-overview.png -quality 85 dashboard-overview.png
   ```
3. Commit and push:
   ```bash
   git add docs/screenshots/
   git commit -m "Add README screenshots"
   git push origin main
   ```
4. Verify images show correctly in README on GitHub

## Placeholder Removal

After adding real screenshots, the README will automatically display them. No code changes needed - just add the PNG files with the correct names to `docs/screenshots/`.
