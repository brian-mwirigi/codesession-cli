import express from 'express';
import { join } from 'path';
import { exec, execSync } from 'child_process';
import { createServer } from 'net';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import {
  getStats, getActiveSessions,
  getSessionsPaginated, getSessionDetail,
  getDailyCosts, getModelBreakdown, getTopSessions,
  exportSessions, loadPricing,
  getProviderBreakdown, getFileHotspots, getActivityHeatmap,
  getDailyTokens, getCostVelocity, getProjectBreakdown, getTokenRatios,
} from './db';

interface DashboardOptions {
  port?: number;
  open?: boolean;
  host?: string;
  json?: boolean;
}

// ── PID file management ────────────────────────────────────

const PID_DIR = join(homedir(), '.codesession');
const pidFilePath = (port: number) => join(PID_DIR, `dashboard-${port}.pid`);

/** Write our own PID to a file so we can identify stale instances later. */
function writePidFile(port: number): void {
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(pidFilePath(port), `${process.pid}\n`, 'utf-8');
}

/** Remove PID file on shutdown. */
function removePidFile(port: number): void {
  try { unlinkSync(pidFilePath(port)); } catch (_) { /* already gone */ }
}

/**
 * Read PID from our pid file for the given port.
 * Returns the PID if the file exists and the process is still running, else null.
 */
function readOwnPid(port: number): number | null {
  const file = pidFilePath(port);
  if (!existsSync(file)) return null;
  try {
    const pid = parseInt(readFileSync(file, 'utf-8').trim(), 10);
    if (isNaN(pid) || pid <= 0) return null;
    // Signal 0 = existence check, throws if process is gone
    process.kill(pid, 0);
    return pid;
  } catch (_) {
    // Process is gone -- clean up stale pid file
    try { unlinkSync(file); } catch (_) {}
    return null;
  }
}

/**
 * Kill a previous dashboard instance that WE started, identified by PID file.
 * Only kills processes we own -- never blindly kills whatever is on the port.
 * Returns true if a process was found and killed.
 */
function killOwnStaleProcess(port: number): boolean {
  const pid = readOwnPid(port);
  if (pid === null) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`  Killed previous dashboard (PID ${pid}) on port ${port}`);
    removePidFile(port);
    return true;
  } catch (_) {
    // Process already gone
    removePidFile(port);
    return false;
  }
}

// ── Port check ─────────────────────────────────────────────

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') resolve(true);
        else resolve(false);
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port, '127.0.0.1');
  });
}

// ── Main ───────────────────────────────────────────────────

export function startDashboard(options: DashboardOptions = {}): void {
  const port = options.port || 3737;
  const host = options.host || '127.0.0.1';
  const shouldOpen = options.open !== false;
  const jsonMode = options.json === true;

  // Warn loudly if binding to all interfaces
  if (host === '0.0.0.0') {
    const msg = 'WARNING: Binding to 0.0.0.0 exposes session data (costs, repo activity, file paths) to your entire network. Use only on trusted networks.';
    if (jsonMode) {
      process.stderr.write(JSON.stringify({ warning: msg }) + '\n');
    } else {
      console.warn(`\n  ${msg}\n`);
    }
  }

  const app = express();
  const staticDir = join(__dirname, 'dashboard-ui');
  app.use(express.static(staticDir));

  // ── API routes ───────────────────────────────────────────

  app.get('/api/stats', (_req, res) => {
    try {
      const stats = getStats();
      const active = getActiveSessions();
      res.json({ ...stats, activeSessions: active.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/sessions', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = (req.query.status as string) || 'all';
      const search = (req.query.search as string) || '';
      res.json(getSessionsPaginated({ limit, offset, status, search }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/sessions/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const detail = getSessionDetail(id);
      if (!detail) return res.status(404).json({ error: 'Session not found' });
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/daily-costs', (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      res.json(getDailyCosts(days));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/model-breakdown', (_req, res) => {
    try {
      res.json(getModelBreakdown());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/top-sessions', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      res.json(getTopSessions(limit));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/provider-breakdown', (_req, res) => {
    try {
      res.json(getProviderBreakdown());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/file-hotspots', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(getFileHotspots(limit));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/activity-heatmap', (_req, res) => {
    try {
      res.json(getActivityHeatmap());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/daily-tokens', (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      res.json(getDailyTokens(days));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/cost-velocity', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(getCostVelocity(limit));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/projects', (_req, res) => {
    try {
      res.json(getProjectBreakdown());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/token-ratios', (_req, res) => {
    try {
      res.json(getTokenRatios());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/pricing', (_req, res) => {
    try {
      res.json(loadPricing());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/export', (req, res) => {
    try {
      const format = (req.query.format as string) === 'csv' ? 'csv' : 'json';
      const limit = parseInt(req.query.limit as string) || undefined;
      const data = exportSessions(format, limit);
      const mime = format === 'csv' ? 'text/csv' : 'application/json';
      const ext = format === 'csv' ? 'csv' : 'json';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="codesession-export.${ext}"`);
      res.send(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/version', (_req, res) => {
    try {
      const pkg = require('../package.json');
      res.json({ version: pkg.version });
    } catch {
      res.json({ version: 'unknown' });
    }
  });

  // SPA fallback (express 5 requires named param instead of bare *)
  app.use((_req, res) => {
    res.sendFile(join(staticDir, 'index.html'));
  });

  // ── Port conflict handling & startup ──────────────────────

  const startServer = () => {
    const server = app.listen(port, host, () => {
      const url = `http://localhost:${port}`;

      // Write PID file so future instances can identify us
      writePidFile(port);

      // Clean up PID file on exit
      const cleanup = () => { removePidFile(port); process.exit(); };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      if (jsonMode) {
        // Machine-readable startup output on stdout
        console.log(JSON.stringify({ url, port, pid: process.pid, host }));
      } else {
        console.log(`\n  codesession dashboard -> ${url}`);
        console.log('  Press Ctrl+C to stop\n');
      }

      if (shouldOpen && !jsonMode) {
        const cmd =
          process.platform === 'win32' ? 'start' :
          process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${cmd} ${url}`);
      }
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        if (jsonMode) {
          console.log(JSON.stringify({ error: 'EADDRINUSE', message: `Port ${port} is in use and could not be freed`, port }));
        } else {
          console.error(`\n  Port ${port} is in use and could not be freed.`);
          console.error(`  Try: cs dashboard --port ${port + 1}\n`);
        }
        process.exit(1);
      }
      throw err;
    });
  };

  // Check port; only kill a stale process if it's one WE started (via PID file)
  isPortInUse(port).then((inUse) => {
    if (inUse) {
      if (!jsonMode) {
        console.log(`\n  Port ${port} is already in use -- checking for stale dashboard...`);
      }
      const killed = killOwnStaleProcess(port);
      if (killed) {
        // Give the OS a moment to release the port
        setTimeout(startServer, 500);
      } else {
        if (jsonMode) {
          console.log(JSON.stringify({ error: 'EADDRINUSE', message: `Port ${port} is in use by another process (not a codesession dashboard)`, port }));
        } else {
          console.error(`  Port ${port} is in use by another process (not a codesession dashboard).`);
          console.error(`  Try: cs dashboard --port ${port + 1}\n`);
        }
        process.exit(1);
      }
    } else {
      startServer();
    }
  });
}
