import express from 'express';
import { join } from 'path';
import { exec, execSync } from 'child_process';
import { createServer } from 'net';
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
}

/**
 * Check if a port is in use.
 * Returns true if the port is already occupied.
 */
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

/**
 * Try to kill any process occupying the given port.
 * Returns true if a process was found and killed.
 */
function killProcessOnPort(port: number): boolean {
  try {
    if (process.platform === 'win32') {
      // Find PID using netstat
      const output = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const lines = output.split('\n');
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
          console.log(`  Killed stale process PID ${pid} on port ${port}`);
        } catch (_) { /* process may have already exited */ }
      }
      return pids.size > 0;
    } else {
      // Unix: use lsof
      const output = execSync(
        `lsof -ti :${port}`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (output) {
        const pids = output.split('\n').filter(Boolean);
        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`, { timeout: 5000 });
            console.log(`  Killed stale process PID ${pid} on port ${port}`);
          } catch (_) { /* process may have already exited */ }
        }
        return pids.length > 0;
      }
    }
  } catch (_) {
    /* No process found or command failed — that's fine */
  }
  return false;
}

export function startDashboard(options: DashboardOptions = {}): void {
  const port = options.port || 3737;
  const shouldOpen = options.open !== false;

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
    const server = app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\n  📊 codesession dashboard → ${url}`);
      console.log('  Press Ctrl+C to stop\n');

      if (shouldOpen) {
        const cmd =
          process.platform === 'win32' ? 'start' :
          process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${cmd} ${url}`);
      }
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n  ✖ Port ${port} is in use and could not be freed.`);
        console.error(`  Try: cs dashboard --port ${port + 1}\n`);
        process.exit(1);
      }
      throw err;
    });
  };

  // Check port, try to kill stale process if occupied
  isPortInUse(port).then((inUse) => {
    if (inUse) {
      console.log(`\n  ⚠ Port ${port} is already in use — attempting to free it…`);
      const killed = killProcessOnPort(port);
      if (killed) {
        // Give the OS a moment to release the port
        setTimeout(startServer, 500);
      } else {
        console.error(`  ✖ Could not identify the process on port ${port}.`);
        console.error(`  Try: cs dashboard --port ${port + 1}\n`);
        process.exit(1);
      }
    } else {
      startServer();
    }
  });
}
