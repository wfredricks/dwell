/**
 * Dwell Runtime — boots the constellation and exposes HTTP + SSE endpoints.
 *
 * @adopt:dwell-runtime-port [resolved: 3000]
 */

import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { RealNatsClient } from './nats-client.js';
import { Neo4jBlackboard } from './neo4j-blackboard.js';
import { mountDwell } from '../mount.js';
import type { Zipper, GraphReader, DwellHandle } from '../types.js';
import type { DwellBBTool } from '../bbtools/contract.js';

// @adopt:dwell-runtime-port [resolved: 3000]
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

// ── Stub Zipper ──────────────────────────────────────────────────────────────
class StubZipper implements Zipper {
  private tools = new Map<string, (input: unknown) => Promise<unknown>>();
  registerTool(id: string, handler: (input: unknown) => Promise<unknown>): void {
    this.tools.set(id, handler);
  }
  unregisterTool(id: string): void {
    this.tools.delete(id);
  }
}

// ── Stub GraphReader ─────────────────────────────────────────────────────────
class StubGraphReader implements GraphReader {
  async query(_cypher: string, _params?: Record<string, unknown>): Promise<unknown[]> {
    return [];
  }
}

// ── SSE clients ──────────────────────────────────────────────────────────────
const sseClients: ServerResponse[] = [];

function broadcastEvent(subject: string, data: unknown): void {
  const payload = `data: ${JSON.stringify({ subject, data })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { /* ignore disconnected client */ }
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const nats = new RealNatsClient();
  await nats.connect();

  const bb = new Neo4jBlackboard(nats);
  await bb.verifyConnectivity();

  const zipper = new StubZipper();
  const graph = new StubGraphReader();

  const dwell: DwellHandle = await mountDwell({ bb, zipper: zipper as Zipper, nats, graph });

  // Tap all NATS traffic for SSE streaming (bb.> and dwell.>)
  nats.subscribe('bb.>', (data) => broadcastEvent('bb.>', data));
  nats.subscribe('dwell.>', (data) => broadcastEvent('dwell.>', data));

  // Listen for Domain Twin announcements
  nats.subscribe('dwell.twin.announce', (data: unknown) => {
    const announce = data as { twinId?: string };
    console.log('[Runtime] Twin announced:', announce);
    // Domain Twin registers itself via dwell.broadcast.discovery → handled by ZipperIntertwin
    // Here we just log; actual registration happens through DwellBBTool pattern
  });

  // ── HTTP Server ─────────────────────────────────────────────────────────────
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS headers for the simple UI
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /health
    if (method === 'GET' && url === '/health') {
      const agents = dwell.registry.listRegistered().map((id) => id.twinId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agents }));
      return;
    }

    // GET /bb — dump all BBEntry nodes
    if (method === 'GET' && url === '/bb') {
      bb.readAll().then((entries) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entries));
      }).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      });
      return;
    }

    // GET /events — SSE
    if (method === 'GET' && url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"subject":"connected","data":{}}\n\n');
      sseClients.push(res);
      req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      return;
    }

    // POST /intent — declare a learning intent
    if (method === 'POST' && url === '/intent') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { intent?: string };
          const intent = parsed.intent ?? '';
          bb.write('bb.intent.declared', { intent, declaredAt: new Date().toISOString() });
          nats.publish('bb.intent.declared', { intent, declaredAt: new Date().toISOString() });
          broadcastEvent('bb.intent.declared', { intent });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, intent }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  server.listen(PORT, () => {
    console.log(`[Runtime] Dwell runtime listening on port ${PORT}`); // @adopt:dwell-runtime-port [resolved: 3000]
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Runtime] SIGTERM — shutting down');
    await dwell.dispose();
    await nats.drain();
    await bb.close();
    server.close();
    process.exit(0);
  });
}

boot().catch((err) => {
  console.error('[Runtime] boot failed:', err);
  process.exit(1);
});
