# Teacher Session Prep — codesession-cli

Read this tonight. It covers TypeScript basics through YOUR actual code so you can explain it confidently.

---

## 1. What is TypeScript?

TypeScript = JavaScript + types.

Normal JavaScript:
```js
let name = "Nesh";     // no type, anything can go in
name = 42;             // JS allows this, causes bugs
```

TypeScript:
```typescript
let name: string = "Nesh";  // declared as string
name = 42;                   // ERROR — TypeScript catches this before it runs
```

**The key rule:** TypeScript checks your code *before* it runs. It finds bugs at compile time, not at runtime.

**In your project:** You write `.ts` files, run `tsc` (TypeScript compiler), and it produces `.js` files in the `dist/` folder. That's the `npm run build:cli` command.

---

## 2. The 3 most important TypeScript concepts in your code

### A. Interfaces — defining the shape of data

In `src/types.ts`:
```typescript
export interface Session {
  id?: number;
  name: string;
  startTime: string;
  aiCost: number;
  status: 'active' | 'completed';
}
```

Think of an interface as a **contract** or a **form**. It says: "every session object MUST have these fields."

- `name: string` — required, must be text
- `id?: number` — the `?` means optional (might not exist yet)
- `status: 'active' | 'completed'` — can ONLY be one of these two values

**Why it matters:** When you call `createSession()` and pass the wrong data, TypeScript screams at you immediately instead of letting the bug silently corrupt the database.

### B. Functions with types

In `src/index.ts`:
```typescript
function jsonError(code: string, message: string): never {
  console.log(JSON.stringify({ error: { code, message } }));
  process.exit(1);
}
```

- `code: string` — the parameter `code` must be a string
- `message: string` — same
- `: never` — the return type. `never` means "this function never returns" (it always exits the process)

**In plain English:** "This function takes two strings, prints an error as JSON, and kills the process."

### C. Async/Await — handling things that take time

In `src/index.ts`:
```typescript
async function resolveActiveSession() {
  const cwd = process.cwd();
  const gitRoot = await getGitRoot(cwd);   // waits for git to respond
  return getActiveSessionForDir(gitRoot || cwd);
}
```

`async` = "this function does things that take time (file reads, git commands)"
`await` = "wait here until this is done before continuing"

**Why:** Checking git takes a moment. You can't run `git rev-parse` and immediately use the result — you have to wait. `await` is how you wait.

**Without await (broken):**
```typescript
const gitRoot = getGitRoot(cwd);   // returns a Promise, not the actual value
// gitRoot is "[object Promise]" not "/home/nesh/project"
```

**With await (correct):**
```typescript
const gitRoot = await getGitRoot(cwd);  // waits, then gives you the real path
```

---

## 3. How your project is structured

```
codesession-cli/
├── src/                    ← TypeScript source (you edit these)
│   ├── types.ts            ← Data shapes (Session, AIUsage, etc.)
│   ├── db.ts               ← Database logic (SQLite, read/write sessions)
│   ├── git.ts              ← Git detection (commits, file changes)
│   ├── watcher.ts          ← File system watcher (watches for file saves)
│   ├── index.ts            ← CLI commands (cs start, cs end, cs status...)
│   ├── agents.ts           ← Programmatic API (for other tools to use)
│   ├── mcp-server.ts       ← Claude Code MCP plugin (8 tools)
│   └── dashboard-server.ts ← Web dashboard backend (Express server)
├── dist/                   ← Compiled JS (auto-generated, don't edit)
├── dashboard/              ← React frontend (the browser UI)
└── package.json            ← Project config, dependencies, scripts
```

**Flow when a user runs `cs start "fix bug"`:**
1. Terminal → `src/index.ts` receives the command
2. `index.ts` calls `createSession()` from `src/db.ts`
3. `db.ts` writes a new row to SQLite database at `~/.codesession/sessions.db`
4. `index.ts` calls `initGit()` from `src/git.ts` to record the current git commit
5. If `--json` flag: prints JSON and exits. If not: starts file watcher from `src/watcher.ts`

---

## 4. The database (SQLite)

Your data lives at: `~/.codesession/sessions.db`

SQLite = a file that acts like a database. No server needed.

Tables in your database:
- `sessions` — one row per session (id, name, cost, tokens, etc.)
- `ai_usage` — every `cs log-ai` call logged here
- `file_changes` — every file save detected
- `commits` — every git commit detected
- `notes` — every `cs note "..."` saved here

In `src/db.ts`, the tables are created with:
```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    aiCost REAL DEFAULT 0,
    ...
  )
`);
```

`IF NOT EXISTS` = only create the table if it doesn't already exist (safe to run on every startup).

---

## 5. The CLI (Commander.js)

In `src/index.ts`, your commands are defined like this:

```typescript
program
  .command('start <name>')             // <name> = required argument
  .description('Start a new session')
  .option('--json', 'output JSON')
  .option('--close-stale', 'end stale sessions')
  .action(async (name, options) => {
    // this runs when user types: cs start "fix bug" --json
    const session = createSession({ name, ... });
    if (options.json) {
      console.log(JSON.stringify(session));
    }
  });
```

`commander` is the library that parses `cs start "fix bug" --json --close-stale` into structured data your code can use.

---

## 6. The MCP Server (what Bill got excited about)

`src/mcp-server.ts` turns codesession into a Claude Code plugin.

MCP = Model Context Protocol. It's how Claude Code talks to external tools.

```typescript
server.tool('session_status', 'Get current session status', {}, async () => {
  const session = await resolveActiveSession();
  return { content: [{ type: 'text', text: JSON.stringify(session) }] };
});
```

This registers a tool called `session_status`. When Claude Code wants to know the current session, it calls this tool, and your code returns the data.

**Install with one command:**
```bash
claude mcp add --transport stdio codesession -- npx codesession-cli mcp
```

**Or as a plugin:**
```
/plugin marketplace add brian-mwirigi/codesession-cli
/plugin install codesession@codesession-marketplace
```

---

## 7. Questions your teacher will likely ask

**Q: What does TypeScript compile to?**
A: JavaScript. The `tsc` command reads `src/*.ts` and outputs `dist/*.js`. Node.js then runs the JS files.

**Q: Why use TypeScript instead of JavaScript?**
A: Catches bugs early. When you have 8 files calling each other, types make sure you're passing the right data between them. Without types, you'd get silent runtime errors deep in the database layer.

**Q: What is `export` and `import`?**
A: `export` makes a function/interface available to other files. `import` brings it in.
```typescript
// db.ts
export function createSession(data: Session) { ... }

// index.ts
import { createSession } from './db';  // brings it in
```

**Q: What is `async/await`?**
A: A way to write code that waits for slow operations (file reads, git, database) without blocking everything else. `async` marks a function as "it does waiting". `await` pauses at that line until the result is ready.

**Q: What is `interface` vs `type`?**
A: Both define shapes. `interface` is for objects (your Session, AIUsage shapes). `type` is for anything else. Your project uses `interface` for data models.

**Q: What is `?.` (optional chaining)?**
A: Safe way to access nested properties that might not exist.
```typescript
session?.gitRoot   // if session is null/undefined, returns undefined instead of crashing
session.gitRoot    // if session is null, this CRASHES with "cannot read property of null"
```

**Q: What is the `?` after a field name in an interface?**
A: Makes it optional. `id?: number` means the field can be `undefined` — it doesn't have to be there.

**Q: What is `Record<string, any>`?**
A: TypeScript's way of saying "an object with string keys and any values."
```typescript
{ name: "Nesh", cost: 2.5, tokens: 1000 }  // this is a Record<string, any>
```

**Q: What is `never` as a return type?**
A: A function that never returns (it always throws an error or exits the process).

**Q: What is SQLite and why?**
A: A file-based database. No server to run, no setup. The whole database is one `.db` file at `~/.codesession/sessions.db`. Perfect for a local CLI tool.

**Q: What is Express?**
A: A Node.js web framework. In `dashboard-server.ts`, Express serves the dashboard on `http://localhost:3737`. It handles HTTP routes like `/api/sessions`, `/api/stats`, etc.

---

## 8. Things to say confidently

- "The project is a CLI tool written in TypeScript that compiles to Node.js"
- "It uses SQLite for local storage — no external database needed"
- "It has 3 ways to integrate: CLI commands, a programmatic API, and an MCP server for Claude Code"
- "The dashboard is a React app served by an Express backend"
- "Parallel session support works by scoping sessions to git root, so multiple agents can run in different repos simultaneously"

---

## 9. One-liner explanations for each file

| File | What it does |
|------|-------------|
| `types.ts` | Defines the shapes of all data (Session, AIUsage, etc.) |
| `db.ts` | Reads and writes to the SQLite database |
| `git.ts` | Detects git commits and changed files |
| `watcher.ts` | Watches the filesystem for file saves |
| `index.ts` | The CLI — handles `cs start`, `cs end`, `cs status`, etc. |
| `agents.ts` | Programmatic API — other tools can `import` and use codesession |
| `mcp-server.ts` | Claude Code plugin — 8 tools Claude can call |
| `dashboard-server.ts` | Express web server for the dashboard UI |

---

Good luck tomorrow. You built something real. Own it.
