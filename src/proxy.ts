/**
 * codesession local API proxy
 *
 * Intercepts Anthropic + OpenAI API calls, transparently forwards them,
 * and auto-logs ONLY token metadata to the active session.
 *
 * Security design:
 *  - Binds ONLY to 127.0.0.1 — never reachable from the network
 *  - Upstream hosts are hardcoded — SSRF is impossible
 *  - Request/response BODIES are never stored or logged — only token counts
 *  - Authorization headers are forwarded to upstream only, never stored
 *  - Internal errors never leak stack traces to the client
 *  - Body size capped at 10 MB to prevent memory exhaustion
 *  - 30-second upstream timeout to prevent hanging connections
 *
 * Usage:
 *   cs proxy               # starts on port 3739
 *   cs proxy --port 8080   # custom port
 *
 * Then point your client at the proxy:
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:3739
 *   OPENAI_BASE_URL=http://127.0.0.1:3739/v1
 */

import https from 'https';
import http from 'http';
import net from 'net';
import express, { Request, Response, NextFunction } from 'express';
import { getActiveSession, addAIUsage, loadPricing } from './db';

// ── Hardcoded upstream hosts (SSRF prevention) ───────────────
// These are the ONLY hosts the proxy will ever connect to.
const UPSTREAM: Record<string, { host: string; port: number }> = {
  anthropic: { host: 'api.anthropic.com', port: 443 },
  openai:    { host: 'api.openai.com',    port: 443 },
};

// Maximum request body size the proxy will buffer (10 MB)
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// Upstream request timeout in milliseconds
const UPSTREAM_TIMEOUT_MS = 30_000;

// ── Hop-by-hop headers that must not be forwarded ────────────
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// ── Cost estimation (metadata only — no prompt text stored) ──

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider: string,
): number {
  const pricing = loadPricing();
  const namespacedKey = `${provider}/${model}`;
  const entry = pricing[namespacedKey] || pricing[model];
  if (!entry) return 0;
  return (promptTokens * entry.input + completionTokens * entry.output) / 1_000_000;
}

// ── Log ONLY metadata to active session ──────────────────────
// IMPORTANT: this function receives token counts only — never prompt text,
// completion text, or API keys. Those are never stored anywhere.

function logUsage(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): void {
  try {
    const session = getActiveSession();
    if (!session) return;

    const totalTokens = promptTokens + completionTokens;
    if (totalTokens === 0) return;

    // Sanitize model name — cap length to prevent DB abuse
    const safeModel = String(model).slice(0, 200);
    const safeProvider = String(provider).slice(0, 100);

    const cost = estimateCost(safeModel, promptTokens, completionTokens, safeProvider);

    addAIUsage({
      sessionId: session.id!,
      provider: safeProvider,
      model: safeModel,
      tokens: totalTokens,
      promptTokens,
      completionTokens,
      cost: Math.round(cost * 1e10) / 1e10,
      agentName: 'proxy',
      timestamp: new Date().toISOString(),
    });
  } catch (_) {
    // Never crash the proxy because of a logging failure
  }
}

// ── Build safe forwarding headers ────────────────────────────
// Strips hop-by-hop headers and overwrites host + content-length.
// Authorization is forwarded as-is (required by the API) but never stored.

function buildUpstreamHeaders(
  incoming: Record<string, string | string[] | undefined>,
  targetHost: string,
  bodyLength: number,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const lower = k.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (v === undefined) continue;
    out[lower] = v as string | string[];
  }
  out['host'] = targetHost;
  out['content-length'] = String(bodyLength);
  // Ensure connection is not accidentally kept alive on the upstream socket
  out['connection'] = 'close';
  return out;
}

// ── Forward request to hardcoded upstream ────────────────────

function forwardRequest(
  provider: keyof typeof UPSTREAM,
  path: string,
  method: string,
  headers: Record<string, string | string[]>,
  bodyBuffer: Buffer,
): Promise<http.IncomingMessage> {
  const { host, port } = UPSTREAM[provider];
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, port, path, method, headers, timeout: UPSTREAM_TIMEOUT_MS },
      resolve,
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('upstream request timed out'));
    });
    req.write(bodyBuffer);
    req.end();
  });
}

// ── Parse SSE stream, forward bytes to client, extract usage ─
// We only parse the "usage" fields from SSE events.
// We forward raw bytes directly — never reassemble prompt/completion text.

function proxyStream(
  upRes: http.IncomingMessage,
  res: Response,
  onUsage: (inputTokens: number, outputTokens: number) => void,
  provider: 'anthropic' | 'openai',
): void {
  // Forward upstream status + headers as-is (minus hop-by-hop)
  const safeHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(upRes.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
      safeHeaders[k] = v as string | string[];
    }
  }
  res.writeHead(upRes.statusCode ?? 200, safeHeaders);

  let inputTokens = 0;
  let outputTokens = 0;
  let sseBuffer = '';

  upRes.on('data', (chunk: Buffer) => {
    // Forward raw bytes immediately — don't hold in memory
    res.write(chunk);

    // Parse only for usage metadata
    sseBuffer += chunk.toString('utf8');
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (provider === 'anthropic') {
          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }
        } else {
          // OpenAI: usage appears in final chunk when stream_options.include_usage=true
          if (event.usage) {
            inputTokens  = event.usage.prompt_tokens     ?? 0;
            outputTokens = event.usage.completion_tokens ?? 0;
          }
        }
      } catch (_) {
        // Malformed SSE data — skip, never crash
      }
    }
  });

  upRes.on('end', () => {
    res.end();
    // Log token metadata AFTER response is fully forwarded
    onUsage(inputTokens, outputTokens);
    // Release SSE buffer immediately — no prompt text ever stored
    sseBuffer = '';
  });

  upRes.on('error', () => {
    try { res.end(); } catch (_) { /* ignore */ }
  });
}

// ── Non-streaming proxy ──────────────────────────────────────

function proxyNonStream(
  upRes: http.IncomingMessage,
  res: Response,
  onUsage: (inputTokens: number, outputTokens: number) => void,
  provider: 'anthropic' | 'openai',
): void {
  const safeHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(upRes.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
      safeHeaders[k] = v as string | string[];
    }
  }
  res.writeHead(upRes.statusCode ?? 200, safeHeaders);

  const chunks: Buffer[] = [];

  upRes.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    res.write(chunk);
  });

  upRes.on('end', () => {
    res.end();
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (provider === 'anthropic' && body.usage) {
        onUsage(body.usage.input_tokens ?? 0, body.usage.output_tokens ?? 0);
      } else if (provider === 'openai' && body.usage) {
        onUsage(body.usage.prompt_tokens ?? 0, body.usage.completion_tokens ?? 0);
      }
    } catch (_) {
      // Not JSON or no usage field — skip logging
    }
  });

  upRes.on('error', () => {
    try { res.end(); } catch (_) { /* ignore */ }
  });
}

// ── Express app ──────────────────────────────────────────────

export function createProxyApp(): express.Application {
  const app = express();

  // Buffer raw body so we can forward it and inspect model/stream fields.
  // 10 MB cap prevents memory exhaustion attacks (local-only but still good practice).
  app.use(express.raw({ type: '*/*', limit: MAX_BODY_BYTES }));

  // ── Security: reject non-localhost connections ─────────────
  // Belt-and-suspenders: even though we bind to 127.0.0.1, reject at
  // application level too in case of misconfigured reverse proxy.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const remoteIp = req.socket.remoteAddress ?? '';
    const isLocal =
      remoteIp === '127.0.0.1' ||
      remoteIp === '::1' ||
      remoteIp === '::ffff:127.0.0.1';
    if (!isLocal) {
      res.status(403).json({ error: 'proxy only accepts local connections' });
      return;
    }
    next();
  });

  // ── Anthropic: POST /v1/messages ──────────────────────────

  app.post('/v1/messages', async (req: Request, res: Response) => {
    const rawBuf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    let model = 'unknown';
    let isStream = false;
    let bodyBuffer = rawBuf;

    try {
      const parsed = JSON.parse(rawBuf.toString('utf8'));
      model    = typeof parsed.model === 'string' ? parsed.model : 'unknown';
      isStream = !!parsed.stream;
    } catch (_) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }

    const headers = buildUpstreamHeaders(
      req.headers as Record<string, string | string[] | undefined>,
      UPSTREAM.anthropic.host,
      bodyBuffer.length,
    );

    let upRes: http.IncomingMessage;
    try {
      upRes = await forwardRequest('anthropic', '/v1/messages', 'POST', headers, bodyBuffer);
    } catch (_) {
      // Never leak internal error details (may contain network info)
      res.status(502).json({ error: 'upstream connection failed' });
      return;
    }

    if (isStream) {
      proxyStream(upRes, res, (i, o) => logUsage('anthropic', model, i, o), 'anthropic');
    } else {
      proxyNonStream(upRes, res, (i, o) => logUsage('anthropic', model, i, o), 'anthropic');
    }
  });

  // ── OpenAI: POST /v1/chat/completions ────────────────────

  app.post('/v1/chat/completions', async (req: Request, res: Response) => {
    const rawBuf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    let model = 'unknown';
    let isStream = false;
    let bodyBuffer = rawBuf;

    try {
      const parsed = JSON.parse(rawBuf.toString('utf8'));
      model    = typeof parsed.model === 'string' ? parsed.model : 'unknown';
      isStream = !!parsed.stream;

      // Inject stream_options.include_usage so OpenAI sends usage in final SSE chunk.
      // We reconstruct the body — only metadata fields are changed, all other fields
      // pass through untouched.
      if (isStream && !parsed.stream_options?.include_usage) {
        const safe = { ...parsed, stream_options: { ...(parsed.stream_options ?? {}), include_usage: true } };
        bodyBuffer = Buffer.from(JSON.stringify(safe), 'utf8');
      }
    } catch (_) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }

    const headers = buildUpstreamHeaders(
      req.headers as Record<string, string | string[] | undefined>,
      UPSTREAM.openai.host,
      bodyBuffer.length,
    );

    let upRes: http.IncomingMessage;
    try {
      upRes = await forwardRequest('openai', '/v1/chat/completions', 'POST', headers, bodyBuffer);
    } catch (_) {
      res.status(502).json({ error: 'upstream connection failed' });
      return;
    }

    if (isStream) {
      proxyStream(upRes, res, (i, o) => logUsage('openai', model, i, o), 'openai');
    } else {
      proxyNonStream(upRes, res, (i, o) => logUsage('openai', model, i, o), 'openai');
    }
  });

  // ── Health check ─────────────────────────────────────────
  // Returns minimal info — no session content, no API key info

  app.get('/health', (_req: Request, res: Response) => {
    const session = getActiveSession();
    res.json({
      status: 'running',
      intercepting: ['/v1/messages', '/v1/chat/completions'],
      activeSession: session
        ? { id: session.id, name: session.name, cost: session.aiCost, tokens: session.aiTokens }
        : null,
    });
  });

  // ── Catch-all: forward unknown paths as 404 ──────────────
  // Do NOT act as a general-purpose proxy for arbitrary endpoints.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'endpoint not intercepted by codesession proxy' });
  });

  return app;
}

// ── Start proxy — binds ONLY to 127.0.0.1 ───────────────────

export function startProxy(port: number): Promise<http.Server> {
  // Validate port range
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return Promise.reject(new Error(`Invalid port: ${port}. Use a value between 1024 and 65535.`));
  }

  const app = createProxyApp();

  return new Promise((resolve, reject) => {
    // Explicitly check port availability before binding
    const tester = net.createServer();
    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try a different port with --port.`));
      } else {
        reject(err);
      }
    });
    tester.once('listening', () => {
      tester.close(() => {
        // Bind exclusively to loopback — never expose to the network
        const server = app.listen(port, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
      });
    });
    tester.listen(port, '127.0.0.1');
  });
}

