'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { executeOnWorker, workerHealth } = require('../lib/avli-worker-client');
const { CONTRACT_VERSIONS } = require('../lib/contracts');

const SDK_SRC = path.join(os.homedir(), 'avli_cloud', 'packages', 'avli-worker-sdk', 'src');
const WORKER = path.join(os.homedir(), 'avli_cloud', 'packages', 'avli-worker-sdk', 'examples', 'ollama_worker.py');
const TOKEN = 'test-model-service-token';

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function waitPort(port, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, res => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('model worker did not start'));
        else setTimeout(attempt, 50);
      });
      req.end();
    };
    attempt();
  });
}

function startMockOllama(handler) {
  const server = http.createServer(handler);
  return listen(server).then(port => ({ server, port, url: `http://127.0.0.1:${port}` }));
}

async function startModelWorker(t, env) {
  if (!fs.existsSync(WORKER)) {
    t.skip('ollama worker is not present on this machine');
    return null;
  }
  const port = 19000 + Math.floor(Math.random() * 1000);
  const child = spawn('python3', [WORKER], {
    env: {
      ...process.env,
      PYTHONPATH: SDK_SRC,
      AVLI_WORKER_SERVICE_TOKEN: TOKEN,
      AVLI_WORKER_BIND: '127.0.0.1',
      AVLI_WORKER_PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(() => {
    child.kill('SIGTERM');
  });
  try {
    await waitPort(port, 25000);
  } catch (error) {
    t.skip(`model worker did not start: ${stderr || error.message}`);
    return null;
  }
  return { port, stderr };
}

test('model worker requires a service token and executes text.generate through L7', async t => {
  const ollama = await startMockOllama((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'mock:latest' }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/generate') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert.equal(body.stream, false);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          model: body.model,
          response: `pong:${body.prompt}`,
          done: true,
        }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => ollama.server.close());

  const worker = await startModelWorker(t, { OLLAMA_HOST: ollama.url, OLLAMA_MODEL: 'mock:latest' });
  if (!worker) return;

  const unauthenticated = await new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1',
      port: worker.port,
      path: '/internal/v1/health',
      method: 'GET',
    }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
  assert.equal(unauthenticated, 401);

  const options = {
    baseUrl: `http://127.0.0.1:${worker.port}`,
    token: TOKEN,
  };
  const health = await workerHealth(options);
  assert.equal(health.available, true);
  const output = await executeOnWorker({
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: 'request:text-generate-through-l7',
    tenant_id: 'tenant:test',
    capability: 'text.generate',
    input: { prompt: 'ping' },
    privacy_class: 'internal',
    deadline: new Date(Date.now() + 30_000).toISOString(),
  }, { timeout: 10_000 }, options);
  assert.equal(output.result.text, 'pong:ping');
  assert.equal(output.result.model, 'mock:latest');
});

test('model worker marks health unavailable when Ollama is down', async t => {
  const worker = await startModelWorker(t, {
    OLLAMA_HOST: 'http://127.0.0.1:9',
    OLLAMA_MODEL: 'missing:latest',
  });
  if (!worker) return;

  const health = await workerHealth({
    baseUrl: `http://127.0.0.1:${worker.port}`,
    token: TOKEN,
  });
  assert.equal(health.available, false);
});
