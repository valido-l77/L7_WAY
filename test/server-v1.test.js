'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const Ajv = require('ajv');

const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-server-v1-test-'));
process.env.L7_DIR = FIXTURE_DIR;
process.env.L7_MODE = 'mock';
process.env.L7_LOCAL_TENANT_ID = 'tenant:test';

const toolsDir = path.join(FIXTURE_DIR, 'tools');
const flowsDir = path.join(FIXTURE_DIR, 'flows');
fs.mkdirSync(toolsDir, { recursive: true });
fs.mkdirSync(flowsDir, { recursive: true });
fs.writeFileSync(
  path.join(toolsDir, 'echo.tool'),
  'name: echo\ndoes: data\nserver: fixture\nversion: v1\nneeds:\n  value: string\ngives:\n  value: string\n',
);
fs.writeFileSync(
  path.join(flowsDir, 'echo-flow.flow'),
  'name: echo-flow\nsteps:\n  - do: echo\n    as: echoed\n    with:\n      value: $value\n',
);

const { CONTRACT_VERSIONS } = require('../lib/contracts');
const gateway = require('../lib/gateway');
const { server, jobCoordinator } = require('../serve');
const workerDefinitions = require('../schema/v1/worker-definitions.schema.json');
const workerAjv = new Ajv({ strict: true, validateFormats: false });
const validateCapabilities = workerAjv.compile({
  ...workerDefinitions,
  $ref: '#/definitions/capabilities',
});
const validateWorkerJob = new Ajv({ strict: true, validateFormats: false }).compile({
  ...workerDefinitions,
  $ref: '#/definitions/job',
});

let port;

function request(method, pathname, body) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: JSON.parse(text) });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestText(method, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'],
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function assertCanonical(body, success = true) {
  assert.equal(body.success, success);
  assert.equal(body.ok, success);
  assert.equal(body.meta.contract_version, CONTRACT_VERSIONS.result);
  assert.doesNotThrow(() => new Date(body.meta.timestamp).toISOString());
}

test.before(async () => {
  jobCoordinator.start();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

test('studio route serves the morphic media workspace', async () => {
  const response = await requestText('GET', '/studio');
  assert.equal(response.status, 200);
  assert.match(response.type, /^text\/html/);
  assert.match(response.body, /AVLI Cloud Studio/);
  assert.match(response.body, /ABOVE/);
  assert.match(response.body, /MIRROR/);
  assert.match(response.body, /BELOW/);
  assert.match(response.body, /video\.controls = true/);
  assert.match(response.body, /video artifacts/);
  assert.match(response.body, /AVLI Cloud · LTX-2/);
  assert.match(response.body, /SSD-1B readiness/);
  assert.match(response.body, /\/api\/media\/readiness\/ssd-1b/);
  assert.match(response.body, /No generation (?:is|was) started/);
  assert.match(response.body, /L7 Prism Design System/);
  assert.match(response.body, /--ds-canvas:/);
  assert.match(response.body, /prefers-reduced-motion/);
  assert.match(response.body, /Content addressed/);
  assert.match(response.body, /Generate fast preview/);
  assert.match(response.body, /record\.preview/);
  assert.match(response.body, /Approve new cycle/);
  assert.match(response.body, /\/api\/media\/dream-cycle\/approve/);
});

test('dream-cycle API requires explicit approval before unlocking generation', async () => {
  const domains = require('../lib/domains');
  const initial = await request('GET', '/api/media/dream-cycle');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.approval_required, false);

  const rejected = await request('POST', '/api/media/dream-cycle/approve', {});
  assert.equal(rejected.status, 400);

  domains.write('morph', 'server-above.json', { layer: 1 });
  domains.write('morph', 'server-mirror.json', { layer: 2 });
  domains.write('morph', 'server-below.json', { layer: 3 });
  const locked = await request('GET', '/api/media/dream-cycle');
  assert.equal(locked.body.approval_required, true);

  const approved = await request('POST', '/api/media/dream-cycle/approve', { approved: true });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approved, true);
  assert.equal(approved.body.approval_required, false);
});

test('SSD-1B readiness endpoint is non-generative and reports the full preflight contract', async () => {
  const response = await request('GET', '/api/media/readiness/ssd-1b');
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.ready, 'boolean');
  assert.equal(response.body.probe_only, true);
  assert.equal(response.body.generation_started, false);
  assert.equal(typeof response.body.runtime.ready, 'boolean');
  assert.equal(typeof response.body.model_cache.ready, 'boolean');
  assert.equal(typeof response.body.device.type, 'string');
  assert.equal(typeof response.body.device.precision, 'string');
  assert.deepEqual(response.body.supported_ratios.map(item => item.ratio), ['16:9', '1:1', '9:16', '4:5']);
  assert.ok(Array.isArray(response.body.missing));
});

test('local content-addressed media assets are displayable over HTTP', async () => {
  const bytes = Buffer.from('displayable-media');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const directory = path.join(FIXTURE_DIR, 'media', 'objects', hash.slice(0, 2));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${hash}.txt`), bytes);
  fs.writeFileSync(path.join(directory, `${hash}.metadata.json`), JSON.stringify({
    sha256: hash,
    bytes: bytes.length,
    media_type: 'text/plain',
    extension: 'txt',
  }));

  const response = await requestText('GET', `/api/media/assets/${hash}`);
  assert.equal(response.status, 200);
  assert.equal(response.type, 'text/plain');
  assert.equal(response.body, 'displayable-media');

  const versioned = await requestText('GET', `/v1/artifacts/${hash}`);
  assert.equal(versioned.status, 200);
  assert.equal(versioned.type, 'text/plain');
  assert.equal(versioned.body, 'displayable-media');

  const ranged = await requestText('GET', `/v1/artifacts/${hash}`, { range: 'bytes=4-10' });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.body, 'layable');
  assert.equal(ranged.headers['content-range'], `bytes 4-10/${bytes.length}`);
});

test('versioned discovery separates tools and flows under canonical envelopes', async () => {
  const tools = await request('GET', '/v1/tools');
  assert.equal(tools.status, 200);
  assertCanonical(tools.body);
  const tool = tools.body.result.tools[0];
  assert.equal(tool.tool, 'echo');
  assert.equal(tool.contract_version, 'l7.tool/1.0');
  assert.equal(tool.entity_id, 'tool:echo');
  assert.equal(tool.l7.capability, 'data');
  assert.equal(tool.internal_projection.version, 'l7.projection.12d/1.0');
  assert.equal(tool.coordinate, undefined);

  const flows = await request('GET', '/v1/flows');
  assert.equal(flows.status, 200);
  assertCanonical(flows.body);
  assert.equal(flows.body.result.flows[0].name, 'echo-flow');
});

test('versioned capability discovery publishes tool and media operations', async () => {
  const response = await request('GET', '/v1/capabilities');
  assert.equal(response.status, 200);
  assertCanonical(response.body);
  assert.equal(response.body.result.contract_version, CONTRACT_VERSIONS.workerCapabilities);
  assert.equal(response.body.result.worker_id, 'l7-gateway');
  assert.ok(response.body.result.capabilities.some(item => item.id === 'tool.echo'));
  assert.ok(response.body.result.capabilities.some(item => item.id === 'image.generate'));
  assert.equal(validateCapabilities(response.body.result), true, JSON.stringify(validateCapabilities.errors));
});

test('versioned jobs execute durably and duplicate request IDs are idempotent', async () => {
  const deadline = new Date(Date.now() + 60_000).toISOString();
  const jobRequest = {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: 'request:echo-idempotent',
    tenant_id: 'tenant:test',
    capability: 'tool.echo',
    input: { value: 'job-value' },
    privacy_class: 'internal',
    deadline,
  };
  const submitted = await request('POST', '/v1/jobs', jobRequest);
  assert.equal(submitted.status, 202);
  assertCanonical(submitted.body);
  const jobId = submitted.body.result.job.job_id;

  const duplicate = await request('POST', '/v1/jobs', jobRequest);
  assert.equal(duplicate.status, 202);
  assert.equal(duplicate.body.result.job.job_id, jobId);

  let current;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    current = await request('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
    if (current.body.result.job.state === 'succeeded') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(current.status, 200);
  assert.equal(current.body.result.job.state, 'succeeded');
  assert.equal(validateWorkerJob(current.body.result.job), true, JSON.stringify(validateWorkerJob.errors));
  assert.deepEqual(current.body.result.job.result, {
    mock: true,
    tool: 'echo',
    params: { value: 'job-value' },
  });

  const conflict = await request('POST', '/v1/jobs', {
    ...jobRequest,
    input: { value: 'different' },
  });
  assert.equal(conflict.status, 409);
  assertCanonical(conflict.body, false);
  assert.equal(conflict.body.meta.error_code, 'CONFLICT');
});

test('versioned jobs propagate cancellation to active tool execution', async () => {
  const originalExecute = gateway.execute;
  gateway.execute = (_name, _args, options) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ success: true, result: 'too late' }), 10_000);
    options.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      const error = new Error('cancelled by test');
      error.code = 'L7_CANCELLED';
      reject(error);
    }, { once: true });
  });
  try {
    const submitted = await request('POST', '/v1/jobs', {
      contract_version: CONTRACT_VERSIONS.workerJobRequest,
      request_id: 'request:echo-cancel',
      tenant_id: 'tenant:test',
      capability: 'tool.echo',
      input: {},
      privacy_class: 'internal',
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
    const jobId = submitted.body.result.job.job_id;
    await new Promise(resolve => setTimeout(resolve, 5));
    const cancelled = await request('POST', `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {});
    assert.equal(cancelled.status, 200);

    let current;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      current = await request('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
      if (current.body.result.job.state === 'cancelled') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(current.body.result.job.state, 'cancelled');
  } finally {
    gateway.execute = originalExecute;
  }
});

test('versioned jobs reject malformed worker requests', async () => {
  const response = await request('POST', '/v1/jobs', {
    request_id: 'missing-contract-and-fields',
  });
  assert.equal(response.status, 400);
  assertCanonical(response.body, false);
  assert.equal(response.body.meta.error_code, 'VALIDATION_ERROR');
});

test('versioned jobs derive tenant identity and prevent cross-tenant access', async () => {
  const submitted = await request('POST', '/v1/jobs', {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: 'request:tenant-isolation',
    capability: 'tool.echo',
    input: { value: 'private' },
    privacy_class: 'internal',
    deadline: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(submitted.status, 202);
  assert.equal(submitted.body.result.job.tenant_id, 'tenant:test');
  const jobId = submitted.body.result.job.job_id;

  process.env.L7_LOCAL_TENANT_ID = 'tenant:other';
  try {
    const hidden = await request('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
    assert.equal(hidden.status, 404);
    const listed = await request('GET', '/v1/jobs');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.result.jobs.some(job => job.job_id === jobId), false);
    const forged = await request('POST', '/v1/jobs', {
      contract_version: CONTRACT_VERSIONS.workerJobRequest,
      request_id: 'request:tenant-forgery',
      tenant_id: 'tenant:test',
      capability: 'tool.echo',
      input: {},
      privacy_class: 'internal',
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(forged.status, 403);
  } finally {
    process.env.L7_LOCAL_TENANT_ID = 'tenant:test';
  }
});

test('versioned tool execution has an unambiguous resource route', async () => {
  const response = await request('POST', '/v1/tools/echo/executions', {
    arguments: { value: 42 },
  });

  assert.equal(response.status, 200);
  assertCanonical(response.body);
  assert.deepEqual(response.body.result, {
    mock: true,
    tool: 'echo',
    params: { value: 42 },
  });
});

test('versioned flow execution cannot be confused with tool execution', async () => {
  const response = await request('POST', '/v1/flows/echo-flow/executions', {
    inputs: { value: 'hello' },
    dryRun: true,
  });

  assert.equal(response.status, 200);
  assertCanonical(response.body);
  assert.equal(response.body.result.flow, 'echo-flow');
  assert.equal(response.body.result.status, 'completed');
});

test('legacy routes remain available during the v1 migration', async () => {
  const tools = await request('GET', '/api/tools');
  assert.equal(tools.status, 200);
  assert.equal(tools.body.tools[0].name, 'echo');

  const call = await request('POST', '/api/call', {
    tool: 'echo',
    arguments: { legacy: true },
  });
  assert.equal(call.status, 200);
  assert.equal(call.body.ok, true);
});

test('versioned errors use the canonical failure envelope', async () => {
  const response = await request('GET', '/v1/not-a-resource');
  assert.equal(response.status, 404);
  assertCanonical(response.body, false);
  assert.equal(response.body.meta.error_code, 'NOT_FOUND');
});

test('versioned execution rejects encoded tool traversal canonically', async () => {
  const response = await request('POST', '/v1/tools/..%2Fsecret/executions', {
    arguments: {},
  });
  assert.equal(response.status, 400);
  assertCanonical(response.body, false);
  assert.equal(response.body.meta.error_code, 'VALIDATION_ERROR');
});

test('public execution options cannot override trusted gateway policy', async () => {
  const response = await request('POST', '/v1/tools/echo/executions', {
    arguments: {},
    options: { mode: 'mock', who: 'forged-actor', timeout: 0 },
  });
  assert.equal(response.status, 400);
  assertCanonical(response.body, false);
  assert.equal(response.body.meta.error_code, 'VALIDATION_ERROR');
});

test('versioned authorization failures keep the canonical envelope', async () => {
  process.env.L7_API_TOKEN = 'required-test-token';
  try {
    const response = await request('GET', '/v1/tools');
    assert.equal(response.status, 401);
    assertCanonical(response.body, false);
    assert.equal(response.body.meta.error_code, 'AUTHENTICATION_REQUIRED');
  } finally {
    delete process.env.L7_API_TOKEN;
  }
});

test('versioned tool timeouts return HTTP 504 and a TIMEOUT envelope', async () => {
  const originalExecute = gateway.execute;
  gateway.execute = async () => {
    const error = new Error('tool exceeded its deadline');
    error.code = 'L7_TIMEOUT';
    throw error;
  };
  try {
    const response = await request('POST', '/v1/tools/echo/executions', { arguments: {} });
    assert.equal(response.status, 504);
    assertCanonical(response.body, false);
    assert.equal(response.body.meta.error_code, 'TIMEOUT');
  } finally {
    gateway.execute = originalExecute;
  }
});

test('versioned execution requires object arguments', async () => {
  const response = await request('POST', '/v1/tools/echo/executions', {
    arguments: 'not-an-object',
  });
  assert.equal(response.status, 400);
  assertCanonical(response.body, false);
  assert.equal(response.body.meta.error_code, 'VALIDATION_ERROR');
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
