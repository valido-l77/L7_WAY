const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Import L7 modules
const { parseFile, listFiles } = require('../lib/parser');
const { executeFlow, approve, reject, showStatus, listExecutions } = require('../lib/executor');
const gateway = require('../lib/gateway');
const stateManager = require('../lib/state');
const { configuredBodyLimit, parseJsonBody, publicHttpError } = require('../lib/http-body');
const { createHttpSecurity } = require('../lib/http-security');
const { resolveNamedFile } = require('../lib/safe-path');

const PORT = Number(process.env.EMPIRE_PORT || 7377);
const BIND = process.env.EMPIRE_BIND || '127.0.0.1';
const MAX_BODY_BYTES = configuredBodyLimit(process.env.EMPIRE_MAX_BODY_BYTES);
const httpSecurity = createHttpSecurity({ port: PORT });
const L7_DIR = path.join(process.env.HOME || '', '.l7');
const EMP_DIR = path.join(process.env.HOME || '', '.emp');
const TOOLS_DIR = path.join(L7_DIR, 'tools');
const FLOWS_DIR = path.join(L7_DIR, 'flows');
const PUBLIC_DIR = path.join(__dirname, 'public');
const AUDIT_LOG = process.env.AVLI_AUDIT_LOG || path.join(process.env.HOME || '', '.l7', 'audit.log');
const TRANSITION_LOG = process.env.AVLI_TRANSITION_LOG || path.join(process.env.HOME || '', '.l7', 'transitions.log');

// CORS headers for trusted dashboard origins only.
function setCorsHeaders(res) {
  httpSecurity.setCorsHeaders(res._l7Request, res);
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

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function isFileType(fileName, extension) {
  return fileName.endsWith(extension) && !fileName.includes('..') && !path.isAbsolute(fileName);
}

function listSidecarFiles(baseFilePath) {
  const sidecarDir = `${baseFilePath}.d`;
  try {
    const files = fs.readdirSync(sidecarDir);
    return files.filter((file) => !file.includes('..') && !path.isAbsolute(file));
  } catch {
    return [];
  }
}

function readSidecarFile(baseFilePath, fileName, res) {
  const sidecarDir = `${baseFilePath}.d`;
  const targetPath = path.join(sidecarDir, fileName);
  if (!targetPath.startsWith(sidecarDir)) {
    sendJson(res, 400, { error: 'Invalid file' });
    return;
  }
  fs.readFile(targetPath, 'utf8', (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    sendJson(res, 200, { file: fileName, content: data });
  });
}

function readLogFile(filePath, limit = 120) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const tail = lines.slice(-limit);
    return tail.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch {
    return [];
  }
}

/**
 * Parse JSON body from request
 */
function parseBody(req) {
  return parseJsonBody(req, { maxBytes: MAX_BODY_BYTES });
}

function sendRequestError(res, error) {
  const response = publicHttpError(error);
  sendJson(res, response.status, response.body);
}

/**
 * List .tool files with parsed content
 */
function listToolFiles() {
  if (!fs.existsSync(TOOLS_DIR)) return [];
  return fs.readdirSync(TOOLS_DIR)
    .filter(f => f.endsWith('.tool'))
    .map(f => {
      const name = path.basename(f, '.tool');
      const toolPath = path.join(TOOLS_DIR, f);
      try {
        const tool = parseFile(toolPath);
        return { name, ...tool };
      } catch {
        return { name, error: 'parse error' };
      }
    });
}

/**
 * List .flow files with parsed content
 */
function listFlowFiles() {
  if (!fs.existsSync(FLOWS_DIR)) return [];
  return fs.readdirSync(FLOWS_DIR)
    .filter(f => f.endsWith('.flow'))
    .map(f => {
      const name = path.basename(f, '.flow');
      const flowPath = path.join(FLOWS_DIR, f);
      try {
        const flow = parseFile(flowPath);
        return { name, ...flow };
      } catch {
        return { name, error: 'parse error' };
      }
    });
}

const server = http.createServer((req, res) => {
  res._l7Request = req;
  const parsed = url.parse(req.url, true);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    httpSecurity.handleOptions(req, res);
    return;
  }

  const protectedRoute = parsed.pathname.startsWith('/api/')
    || parsed.pathname === '/execute'
    || parsed.pathname === '/call';
  if (protectedRoute && !httpSecurity.authorize(req, res)) {
    return;
  }

  if (parsed.pathname === '/api/citizens') {
    fs.readdir(L7_DIR, (err, files) => {
      if (err) {
        sendJson(res, 200, { citizens: [] });
        return;
      }
      const citizens = files
        .filter((file) => isFileType(file, '.l7'))
        .map((file) => ({
          id: path.basename(file, '.l7'),
          file,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      sendJson(res, 200, { citizens });
    });
    return;
  }

  if (parsed.pathname === '/api/citizen' || parsed.pathname === '/api/legion') {
    const file = parsed.query.file;
    const extension = parsed.pathname === '/api/legion' ? '.lg' : '.l7';
    if (!file || !isFileType(file, extension)) {
      sendJson(res, 400, { error: 'Invalid file' });
      return;
    }
    const filePath = path.join(L7_DIR, file);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      const sidecar = extension === '.l7' ? listSidecarFiles(filePath) : [];
      sendJson(res, 200, { file, content: data, sidecar });
    });
    return;
  }

  if (parsed.pathname === '/api/legions') {
    fs.readdir(L7_DIR, (err, files) => {
      if (err) {
        sendJson(res, 200, { legions: [] });
        return;
      }
      const legions = files
        .filter((file) => isFileType(file, '.lg'))
        .map((file) => ({
          id: path.basename(file, '.lg'),
          file,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      sendJson(res, 200, { legions });
    });
    return;
  }

  if (parsed.pathname === '/api/launchers') {
    fs.readdir(EMP_DIR, (err, files) => {
      if (err) {
        sendJson(res, 200, { launchers: [] });
        return;
      }
      const launchers = files
        .filter((file) => isFileType(file, '.emp'))
        .map((file) => ({
          id: path.basename(file, '.emp'),
          file,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      sendJson(res, 200, { launchers });
    });
    return;
  }

  if (parsed.pathname === '/api/launcher') {
    const file = parsed.query.file;
    if (!file || !isFileType(file, '.emp')) {
      sendJson(res, 400, { error: 'Invalid file' });
      return;
    }
    const filePath = path.join(EMP_DIR, file);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      sendJson(res, 200, { file, content: data });
    });
    return;
  }

  if (parsed.pathname === '/api/sidecar') {
    const file = parsed.query.file;
    const item = parsed.query.item;
    if (!file || !isFileType(file, '.l7') || !item) {
      sendJson(res, 400, { error: 'Invalid request' });
      return;
    }
    const filePath = path.join(L7_DIR, file);
    readSidecarFile(filePath, item, res);
    return;
  }

  if (parsed.pathname === '/api/audit') {
    const limit = Number.parseInt(parsed.query.limit || '120', 10) || 120;
    sendJson(res, 200, { entries: readLogFile(AUDIT_LOG, limit) });
    return;
  }

  if (parsed.pathname === '/api/transitions') {
    const limit = Number.parseInt(parsed.query.limit || '120', 10) || 120;
    sendJson(res, 200, { entries: readLogFile(TRANSITION_LOG, limit) });
    return;
  }

  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
    return;
  }

  if (parsed.pathname === '/styles.css') {
    sendFile(res, path.join(PUBLIC_DIR, 'styles.css'), 'text/css');
    return;
  }

  if (parsed.pathname === '/app.js') {
    sendFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript');
    return;
  }

  // ============================================
  // L7 Flow System API
  // ============================================

  // List all tools (.tool files)
  if (parsed.pathname === '/api/tools') {
    const tools = listToolFiles();
    sendJson(res, 200, { tools });
    return;
  }

  // List all flows (.flow files)
  if (parsed.pathname === '/api/flows') {
    const flows = listFlowFiles();
    sendJson(res, 200, { flows });
    return;
  }

  // Get a single flow by name
  if (parsed.pathname === '/api/flow') {
    const name = parsed.query.name;
    if (!name) {
      sendJson(res, 400, { error: 'Flow name required' });
      return;
    }
    let flowPath;
    try {
      flowPath = resolveNamedFile(FLOWS_DIR, name, '.flow', { label: 'Flow name' });
    } catch (error) {
      sendRequestError(res, error);
      return;
    }
    if (!fs.existsSync(flowPath)) {
      sendJson(res, 404, { error: 'Flow not found' });
      return;
    }
    try {
      const flow = parseFile(flowPath);
      sendJson(res, 200, { flow });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // Execute a flow OR a tool (POST) — L7 contract + flow runner
  // Tool form:  { "tool": "financial_ratios", "params": { ... } }
  // Flow form:  { "flow": "name", "inputs": { ... } }
  if ((parsed.pathname === '/api/execute' || parsed.pathname === '/execute') && req.method === 'POST') {
    parseBody(req).then(async (body) => {
      const toolName = body.tool || body.name;
      const toolParams = body.params || body.arguments || body.args || {};

      // M2: tool execution through gateway forge → skill-runtime
      if (toolName && !body.flow) {
        try {
          const result = await gateway.execute(toolName, toolParams, {
            who: body.who || req.headers['x-l7-who'] || 'empire-http',
          });
          const ok = result && result.ok !== false && result.success !== false;
          sendJson(res, ok ? 200 : 422, result);
        } catch (err) {
          sendJson(res, 500, { success: false, ok: false, error: err.message });
        }
        return;
      }

      const { flow, inputs = {}, dryRun = false } = body;

      if (!flow) {
        sendJson(res, 400, { error: 'Flow name required (or pass tool for skill-runtime execute)' });
        return;
      }

      try {
        const execState = await executeFlow(flow, inputs, { dryRun });
        sendJson(res, 200, {
          id: execState.id,
          flow: execState.flow,
          status: execState.status,
          step: execState.step,
          results: execState.results
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  // Execute a single tool (POST)
  if ((parsed.pathname === '/api/call' || parsed.pathname === '/call') && req.method === 'POST') {
    parseBody(req).then(async (body) => {
      const { tool, arguments: args = {}, params } = body;
      const toolParams = params || args || {};

      if (!tool) {
        sendJson(res, 400, { error: 'Tool name required' });
        return;
      }

      try {
        const result = await gateway.execute(tool, toolParams, {
          who: body.who || req.headers['x-l7-who'] || 'empire-http',
        });
        const ok = result && result.ok !== false && result.success !== false;
        sendJson(res, ok ? 200 : 422, result);
      } catch (err) {
        sendJson(res, 500, { success: false, ok: false, error: err.message });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  // Approve a checkpoint (POST)
  if (parsed.pathname === '/api/approve' && req.method === 'POST') {
    parseBody(req).then((body) => {
      const { flow, id } = body;

      if (!flow || !id) {
        sendJson(res, 400, { error: 'Flow name and id required' });
        return;
      }

      try {
        const execState = approve(flow, id);
        sendJson(res, 200, {
          id: execState.id,
          flow: execState.flow,
          status: execState.status,
          message: 'Checkpoint approved'
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  // Reject a checkpoint (POST)
  if (parsed.pathname === '/api/reject' && req.method === 'POST') {
    parseBody(req).then((body) => {
      const { flow, id } = body;

      if (!flow || !id) {
        sendJson(res, 400, { error: 'Flow name and id required' });
        return;
      }

      try {
        const execState = reject(flow, id);
        sendJson(res, 200, {
          id: execState.id,
          flow: execState.flow,
          status: execState.status,
          message: 'Checkpoint rejected'
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  // Resume execution after checkpoint approval (POST)
  if (parsed.pathname === '/api/resume' && req.method === 'POST') {
    parseBody(req).then(async (body) => {
      const { flow, id } = body;

      if (!flow || !id) {
        sendJson(res, 400, { error: 'Flow name and id required' });
        return;
      }

      try {
        const execState = await executeFlow(flow, {}, { resume: id });
        sendJson(res, 200, {
          id: execState.id,
          flow: execState.flow,
          status: execState.status,
          step: execState.step,
          results: execState.results
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  // Get execution status
  if (parsed.pathname === '/api/status') {
    const flow = parsed.query.flow;
    const id = parsed.query.id;

    if (!flow || !id) {
      sendJson(res, 400, { error: 'Flow name and id required' });
      return;
    }

    const execState = stateManager.load(flow, id);
    if (!execState) {
      sendJson(res, 404, { error: 'Execution not found' });
      return;
    }

    sendJson(res, 200, execState);
    return;
  }

  // List executions
  if (parsed.pathname === '/api/executions') {
    const flow = parsed.query.flow || null;
    const executions = stateManager.list(flow);
    sendJson(res, 200, { executions });
    return;
  }

  // Gateway health check
  if (parsed.pathname === '/api/gateway/health') {
    gateway.checkHealth().then((healthy) => {
      sendJson(res, 200, {
        gateway: healthy ? 'ok' : 'unavailable',
        mode: gateway.config.mode,
        url: gateway.config.gatewayUrl
      });
    });
    return;
  }

  // ─── Satellite: Signal endpoints ───
  // One endpoint. Any device anywhere can connect.
  // Know one person. Reach the world.
  const autopoiesis = require('../lib/autopoiesis-2');

  if (parsed.pathname === '/api/signal' && req.method === 'GET') {
    // Return the latest emitted signal
    const signal = autopoiesis.emit();
    sendJson(res, 200, signal);
    return;
  }

  if (parsed.pathname === '/api/signal' && req.method === 'POST') {
    // Receive a signal from another node
    parseBody(req).then((signal) => {
      try {
        const result = autopoiesis.receive(signal);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid signal' });
      }
    }).catch((err) => sendRequestError(res, err));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

function start() {
  httpSecurity.assertSafeBind(BIND, 'Empire server');
  return server.listen(PORT, BIND, async () => {
    console.log(`\n  \x1b[93mEmpire server running at http://${BIND}:${PORT}\x1b[0m\n`);
    // Boot the Forge — the Unified Self awakens
    try {
      await gateway.boot();
    } catch (err) {
      console.error(`\x1b[91m  Boot error: ${err.message}\x1b[0m`);
      console.error(err.stack);
    }
  });
}

if (require.main === module) start();

module.exports = {
  BIND,
  MAX_BODY_BYTES,
  PORT,
  parseBody,
  server,
  start,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: empire/server.js | Body-Hash: SHA-256:6c989d61b7e38e14d854401062b705bfe7eacbba47ea2defd3bedddd63b8eb29
// Chain-Hash: SHA-256:3cce44c28084fe233daa4954b27951d70e9dd26e5cbf0088d4cd81b48353811e | Signed: 2026-03-01T15:09:56.451346+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 34 works. Verify: python3 provenance.py verify empire/server.js
// L7:PROVENANCE
