# Social Media Posts — codesession-cli v2.0.0

Pick whichever feels right, tweak the voice to match yours.

---

## Reddit — r/ClaudeAI

**Title:** I got tired of not knowing what my Claude sessions cost, so I built something

Been using Claude Code heavily for the past few weeks and the costs were basically invisible. I'd check my Anthropic dashboard at the end of the month and just... wince.

So I built a small CLI that tracks it per session. You run `cs start "fix the auth bug"`, do your work, and when you're done `cs end` gives you a summary — time, files changed, commits, and total cost.

It comes with a local web dashboard too (localhost only, no telemetry) that shows cost trends, model breakdowns, file hotspots, and you can set budget alerts so it screams at you before you blow through your daily limit.

Works with Claude Code, OpenClaw, or really any agent setup. The pricing table has 17+ models built in so cost gets auto-calculated from token counts.

`npm install -g codesession-cli`

GitHub: [link]

Some things I'm still figuring out:
- Claude Code doesn't expose token counts to hooks, so automatic cost logging is tricky
- The native binary (better-sqlite3) means you need build tools installed, which trips some people up
- Trying to figure out if there's a way to read the API usage from Claude's side

Happy to answer questions if anyone's curious about the implementation.

---

## Reddit — r/LocalLLaMA

**Title:** Built a session cost tracker for AI coding agents — works with any provider

Quick context: I run multiple AI agents across different projects (Claude, GPT-4o, local models via OpenRouter) and I had zero visibility into what each session actually costs.

Built a CLI + local dashboard to fix this. It tracks per-session costs, files changed, git commits, and token usage across any provider.

The interesting bit: it has a built-in pricing table for 17+ models that auto-calculates cost from token counts. So you just log `cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000` and it figures out the cost. You can also add custom model pricing.

Dashboard is a local React app (no cloud, no accounts, SQLite on disk) with:
- cost/token trends over time
- per-model and per-provider breakdowns
- budget alerts with actual alarm sounds when you go over
- file hotspots showing which files get churned the most
- activity heatmap

`npm install -g codesession-cli && cs dashboard`

Source: [GitHub link]

Would love feedback from anyone tracking costs across multiple providers. Currently supports anthropic, openai, google, mistral, deepseek as provider tags but it's really just a label — works with anything.

---

## Hacker News — Show HN

**Title:** Show HN: codesession-cli – Track what your AI coding agents cost per session

I built this because I kept getting surprised by my monthly AI bills. Running Claude Code, OpenClaw agents, and custom scripts across multiple repos — I had no idea which tasks were expensive and which were cheap.

codesession-cli wraps around any AI coding workflow:

    cs start "fix payment retry logic"
    # ... agent does its thing ...
    cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 12000 --completion-tokens 4000
    cs end -n "done, added backoff + tests"

It tracks the session (files changed, git commits, duration, cost) and stores everything in a local SQLite database. There's a web dashboard that runs on localhost with cost trends, model analytics, file hotspots, and budget alerts.

Design decisions:
- All data local (SQLite + localStorage), no cloud, no accounts
- Built-in pricing table for 17+ models, auto-calculates cost from tokens
- --json on every command for agent automation
- Budget alerts with Web Audio alarm (actually makes noise, not just a toast)
- Git-root scoped sessions so subdirectories work correctly

Tech: TypeScript, better-sqlite3 (WAL mode), Express 5, React 19 + Vite for the dashboard, Recharts for charts. ~3k LOC total.

Trade-offs I'm living with:
- Native SQLite dependency means build tools are required (no pure-JS fallback yet)
- Token logging is manual — agents need to call `cs log-ai` after each API call since there's no universal way to intercept provider responses
- Dashboard is SPA with client-side routing, no SSR

npm: https://www.npmjs.com/package/codesession-cli
Source: [GitHub link]

---

## Twitter/X — Thread

**Tweet 1:**
I kept getting surprised by my AI coding bills every month.

No idea which tasks were expensive. No idea which models burned the most tokens. Just a number at the end of the month.

So I built a CLI to track it per session. Here's what it looks like:

[attach dashboard-overview.png screenshot]

**Tweet 2:**
How it works:

```
cs start "fix the auth bug"
# your agent works...
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2000
cs end
```

You get: time, cost, files changed, commits. All stored locally in SQLite. No cloud. No accounts.

**Tweet 3:**
The dashboard runs on localhost and shows:
- Daily cost trends
- Per-model breakdowns
- File hotspots (which files get changed most)
- Budget alerts that actually make noise when you go over

[attach insights.png or cost-charts.png screenshot]

**Tweet 4:**
v2.0.0 just shipped with:
- Alerts page — set daily/session/total spend limits
- Alarm mode — browser notifications + sound
- Insights — activity heatmaps, project breakdowns
- Start fresh — reset everything with one click

npm install -g codesession-cli

[GitHub link]

---

## Discord — General / AI / Dev Community

hey, been working on this thing for a couple weeks — it's a CLI that tracks what your AI coding sessions cost

basically you do `cs start "task name"`, work with whatever agent (claude code, openclaw, custom stuff), log your AI calls, then `cs end` and it gives you a full breakdown — cost, tokens, files, commits, duration

it stores everything locally in sqlite and comes with a web dashboard on localhost

just shipped v2.0.0 which adds budget alerts (it'll literally play an alarm sound in your browser when you go over your daily limit lol), an insights page with file hotspots and activity heatmaps, and a reset button

works with any provider — anthropic, openai, google, etc. has built-in pricing for 17+ models so you don't have to look up rates

`npm i -g codesession-cli && cs dashboard`

github: [link]

happy to answer questions, still actively building this

---

## Notes

- Always link to GitHub, not npm (GitHub has screenshots and the full README)
- Attach real screenshots — dashboard-overview.png is the money shot
- Don't edit posts after people start commenting (looks shady)
- Reply to every comment, especially critical ones — shows you're a real person
- Post on weekday mornings (US time) for best visibility on HN/Reddit
- For HN, don't ask for upvotes anywhere, ever
- For Reddit, check subreddit rules about self-promotion before posting
