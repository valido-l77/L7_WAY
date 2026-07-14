#!/usr/bin/env node
/**
 * L7 Gateway Server — The Unified Self, listening.
 * Boots the gateway, then starts the HTTP API on port 18789.
 * Law I — All flows through the Gateway. No exceptions.
 *
 * Created by: Alberto Valido Delgado / Claude (AI-generated)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Import L7 modules
const { parseFile } = require('./lib/parser');
const { executeFlow, approve, reject } = require('./lib/executor');
const gateway = require('./lib/gateway');
const stateManager = require('./lib/state');

const PORT = parseInt(process.env.L7_PORT || '18789', 10);
const BIND = process.env.L7_BIND || '127.0.0.1';
const L7_DIR = path.join(process.env.HOME || '', '.l7');
const TOOLS_DIR = path.join(L7_DIR, 'tools');
const FLOWS_DIR = path.join(L7_DIR, 'flows');

// ═══════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  setCorsHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════
// REQUEST HANDLER
// ═══════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ── Health & Status ──
    if (parsed.pathname === '/' || parsed.pathname === '/health') {
      const health = await gateway.checkHealth();
      const heartStatus = gateway.heart.status();
      const fieldReport = gateway.fieldReport();
      sendJson(res, 200, {
        alive: true,
        port: PORT,
        heart: {
          id: heartStatus.id,
          incarnation: heartStatus.incarnation,
          totalBeats: heartStatus.totalBeats,
          age: heartStatus.age_human,
          alive: heartStatus.alive
        },
        field: {
          nodes: fieldReport.nodes,
          epoch: fieldReport.epoch,
          entropy: fieldReport.entropy,
          energy: fieldReport.energy
        },
        tools: health.tools,
        citizens: health.citizens,
        polarities: health.polarities,
        founder: gateway.FOUNDER.legal_name
      });
      return;
    }

    // ── Heart ──
    if (parsed.pathname === '/api/heart') {
      sendJson(res, 200, gateway.heart.status());
      return;
    }

    if (parsed.pathname === '/api/heart/awareness') {
      sendJson(res, 200, gateway.heart.awareness());
      return;
    }

    if (parsed.pathname === '/api/heart/trend') {
      sendJson(res, 200, gateway.heart.trend());
      return;
    }

    // ── Field ──
    if (parsed.pathname === '/api/field') {
      sendJson(res, 200, gateway.fieldReport());
      return;
    }

    if (parsed.pathname === '/api/field/vitals') {
      sendJson(res, 200, gateway.fieldVitals());
      return;
    }

    // ── Tools ──
    if (parsed.pathname === '/api/tools') {
      sendJson(res, 200, { tools: gateway.listTools() });
      return;
    }

    // ── Citizens ──
    if (parsed.pathname === '/api/citizens') {
      sendJson(res, 200, { citizens: gateway.listCitizens() });
      return;
    }

    // ── Execute tool (POST) ──
    if (parsed.pathname === '/api/call' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.tool) {
        sendJson(res, 400, { error: 'Tool name required' });
        return;
      }
      const result = await gateway.execute(body.tool, body.arguments || {}, body.options || {});
      sendJson(res, 200, result);
      return;
    }

    // ── Transmute (POST) ──
    if (parsed.pathname === '/api/transmute' && req.method === 'POST') {
      const body = await parseBody(req);
      const citizen = gateway.transmute(body.input || body, body.options || {});
      sendJson(res, 200, citizen);
      return;
    }

    // ── Council (POST) ──
    if (parsed.pathname === '/api/council' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.question) {
        sendJson(res, 400, { error: 'Question required' });
        return;
      }
      const report = await gateway.invokeCouncil(body.question, body.context || {});
      sendJson(res, 200, report);
      return;
    }

    // ── Domains ──
    if (parsed.pathname === '/api/domain/write' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = gateway.writeToDomain(body.domain, body.name, body.content, body.metadata);
      sendJson(res, 200, result);
      return;
    }

    if (parsed.pathname === '/api/domain/read') {
      const result = gateway.readFromDomain(parsed.query.domain, parsed.query.name);
      sendJson(res, 200, result);
      return;
    }

    if (parsed.pathname === '/api/domain/transition' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = gateway.transitionDomain(body.from, body.to, body.name, body.options);
      sendJson(res, 200, result);
      return;
    }

    // ── Flows ──
    if (parsed.pathname === '/api/flows') {
      if (!fs.existsSync(FLOWS_DIR)) { sendJson(res, 200, { flows: [] }); return; }
      const flows = fs.readdirSync(FLOWS_DIR)
        .filter(f => f.endsWith('.flow'))
        .map(f => {
          try { return { name: path.basename(f, '.flow'), ...parseFile(path.join(FLOWS_DIR, f)) }; }
          catch { return { name: path.basename(f, '.flow'), error: 'parse error' }; }
        });
      sendJson(res, 200, { flows });
      return;
    }

    if (parsed.pathname === '/api/execute' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.flow) { sendJson(res, 400, { error: 'Flow name required' }); return; }
      const execState = await executeFlow(body.flow, body.inputs || {}, { dryRun: body.dryRun || false });
      sendJson(res, 200, { id: execState.id, flow: execState.flow, status: execState.status, step: execState.step, results: execState.results });
      return;
    }

    // ── Sigils ──
    if (parsed.pathname === '/api/sigil' && req.method === 'POST') {
      const body = await parseBody(req);
      const sigil = gateway.compileSigil(body.name || 'unnamed', body.steps || []);
      sendJson(res, 200, sigil);
      return;
    }

    // ── Self ──
    if (parsed.pathname === '/api/self') {
      sendJson(res, 200, gateway.self.report());
      return;
    }

    // ── 404 ──
    sendJson(res, 404, { error: 'Not found', path: parsed.pathname });

  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════

(async () => {
  try {
    const report = await gateway.boot();

    server.listen(PORT, BIND, () => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  L7 Gateway — ONLINE`);
      console.log(`  http://${BIND}:${PORT}`);
      console.log(`  Tools: ${report.tools_count} | Citizens: ${report.citizens_count} | Flows: ${report.flows_count}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => { await gateway.shutdown(); server.close(); process.exit(0); });
    process.on('SIGINT', async () => { await gateway.shutdown(); server.close(); process.exit(0); });

  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: serve.js | Body-Hash: SHA-256:ae5a29c4e93b2520e1fecd54b33c1fdaa45a67f5a1626c8edbfdc4b503e1438a
// Chain-Hash: SHA-256:a782b44e1ffd235b3bb293f6cc4426914a78ec5dd1b668f8c93b5a44b3200035 | Signed: 2026-03-01T15:09:50.006072+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 5 works. Verify: python3 provenance.py verify serve.js
// L7:PROVENANCE