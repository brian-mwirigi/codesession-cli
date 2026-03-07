import { IconExternalLink } from './Icons';

interface CommandInfo {
  command: string;
  description: string;
  options?: string;
}

const SECTIONS: { title: string; commands: CommandInfo[] }[] = [
  {
    title: 'Session Lifecycle',
    commands: [
      { command: 'cs start <name>', description: 'Start a new coding session', options: '--json, --resume, --close-stale' },
      { command: 'cs end', description: 'End the active session', options: '-n <notes>, -s <id>, --json' },
      { command: 'cs status', description: 'Show active session status', options: '-s <id>, --json' },
      { command: 'cs show [id]', description: 'Show session details (defaults to last)', options: '--files, --commits, --json' },
      { command: 'cs list', description: 'List recent sessions', options: '-l <limit>, --json' },
      { command: 'cs stats', description: 'Show overall statistics', options: '--json' },
      { command: 'cs recover', description: 'Auto-end stale sessions', options: '--max-age <hours>' },
    ],
  },
  {
    title: 'AI Usage & Proxy',
    commands: [
      { command: 'cs log-ai -p <provider> -m <model>', description: 'Log AI usage to active session', options: '-t <tokens>, -c <cost>, --prompt-tokens, --completion-tokens' },
      { command: 'cs auto-log', description: 'Auto-log from Claude Code hook transcript', options: '--provider, --model, --agent' },
      { command: 'cs proxy', description: 'Start a local API proxy that auto-logs tokens', options: '-p <port>, -s <session>' },
    ],
  },
  {
    title: 'Run (All-in-One)',
    commands: [
      { command: 'cs run <args...>', description: 'Run a command with full auto-tracking: session + proxy + cost summary', options: '-n <name>, -p <port>, --no-proxy' },
    ],
  },
  {
    title: 'Dashboard & MCP',
    commands: [
      { command: 'cs dashboard', description: 'Open this web dashboard', options: '-p <port>, --host, --no-open, --json' },
      { command: 'cs mcp', description: 'Start the MCP server for AI agent integration' },
    ],
  },
  {
    title: 'Pricing',
    commands: [
      { command: 'cs pricing list', description: 'Show all known model prices', options: '--json' },
      { command: 'cs pricing set <model> <input> <output>', description: 'Set pricing per 1M tokens', options: '--provider' },
      { command: 'cs pricing reset', description: 'Remove all custom pricing overrides' },
    ],
  },
  {
    title: 'Data & Notes',
    commands: [
      { command: 'cs export', description: 'Export sessions as JSON or CSV', options: '-f <format>, -l <limit>' },
      { command: 'cs note <message>', description: 'Add a timestamped note to the active session', options: '-s <id>, --json' },
    ],
  },
  {
    title: 'Today (Multi-Project)',
    commands: [
      { command: 'cs today', description: 'Pick up where you left off — git state, TODOs, PRs, sessions', options: '--ai, --share, --json' },
      { command: 'cs today init', description: 'Register current directory as a tracked project', options: '-n <name>' },
      { command: 'cs today add <path>', description: 'Add a project directory', options: '-n <name>' },
      { command: 'cs today remove <path>', description: 'Remove a project from tracking' },
      { command: 'cs today projects', description: 'List all tracked projects', options: '--json' },
    ],
  },
];

const MCP_TOOLS: CommandInfo[] = [
  { command: 'session_status', description: 'Get active session status including cost, tokens, duration' },
  { command: 'start_session', description: 'Start a new codesession' },
  { command: 'end_session', description: 'End the active session and get a full summary' },
  { command: 'log_ai_usage', description: 'Log AI token usage and cost to the active session' },
  { command: 'add_note', description: 'Add a timestamped note to the active session' },
  { command: 'get_stats', description: 'Get overall statistics across all sessions' },
  { command: 'list_sessions', description: 'List recent sessions' },
  { command: 'check_budget', description: 'Check spending in the active session' },
];

export default function Help() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Command Reference</h1>
        <p className="page-subtitle">
          All codesession CLI commands and MCP tools at a glance
        </p>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title">{section.title}</h3>
          </div>
          <div className="card-body--flush">
            <table className="help-table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Description</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {section.commands.map((cmd) => (
                  <tr key={cmd.command}>
                    <td><code className="help-cmd">{cmd.command}</code></td>
                    <td>{cmd.description}</td>
                    <td className="help-opts">{cmd.options || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">MCP Server Tools</h3>
          <span className="card-meta">Available to AI agents via <code className="help-cmd">cs mcp</code></span>
        </div>
        <div className="card-body--flush">
          <table className="help-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {MCP_TOOLS.map((tool) => (
                <tr key={tool.command}>
                  <td><code className="help-cmd">{tool.command}</code></td>
                  <td>{tool.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            For full documentation, visit the project on GitHub.
          </p>
          <a
            href="https://github.com/brian-mwirigi/codesession-cli"
            target="_blank"
            rel="noreferrer"
            className="help-docs-link"
          >
            Documentation <IconExternalLink size={13} />
          </a>
        </div>
      </div>
    </>
  );
}
