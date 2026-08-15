'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { executeOnWorker, workerHealth } = require('../lib/avli-worker-client');
const { CONTRACT_VERSIONS } = require('../lib/contracts');

const SDK_SRC = path.join(os.homedir(), 'avli_cloud', 'packages', 'avli-worker-sdk', 'src');
const ECHO = path.join(os.homedir(), 'avli_cloud', 'packages', 'avli-worker-sdk', 'examples', 'echo_worker.py');
const TOKEN = 'test-echo-service-token';

function waitPort(port, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, res => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('echo worker did not start'));
        else setTimeout(attempt, 50);
      });
      req.end();
    };
    attempt();
  });
}

test('AVLI echo worker is reachable only with a service token and executes through L7', async t => {
  if (!fs.existsSync(ECHO)) {
    t.skip('echo worker is not present on this machine');
    return;
  }
  const port = 18790 + Math.floor(Math.random() * 100);
  const child = spawn('python3', [ECHO], {
    env: {
      ...process.env,
      PYTHONPATH: SDK_SRC,
      AVLI_WORKER_SERVICE_TOKEN: TOKEN,
      AVLI_WORKER_BIND: '127.0.0.1',
      AVLI_WORKER_PORT: String(port),
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
    t.skip(`echo worker did not start: ${stderr || error.message}`);
    return;
  }

  const unauthenticated = await new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1',
      port,
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
    baseUrl: `http://127.0.0.1:${port}`,
    token: TOKEN,
  };
  const health = await workerHealth(options);
  assert.equal(health.available, true);
  const output = await executeOnWorker({
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: 'request:echo-through-l7',
    tenant_id: 'tenant:test',
    capability: 'text.echo',
    input: { hello: 'empire' },
    privacy_class: 'internal',
    deadline: new Date(Date.now() + 30_000).toISOString(),
  }, { timeout: 10_000 }, options);
  assert.deepEqual(output.result, { echo: { hello: 'empire' } });
});
