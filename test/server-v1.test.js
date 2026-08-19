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
process.env.AVLI_MEDIA_EXECUTION = 'mock';
process.env.L7_LOCAL_TENANT_ID = 'tenant:test';
process.env.L7_CALLBACK_HMAC_SECRET = 'test-callback-secret';
delete process.env.AVLI_MODEL_WORKER_URL;
delete process.env.AVLI_MODEL_WORKER_SERVICE_TOKEN;

const toolsDir = path.join(FIXTURE_DIR, 'tools');
const flowsDir = path.join(FIXTURE_DIR, 'flows');
fs.mkdirSync(toolsDir, { recursive: true });
fs.mkdirSync(flowsDir, { recursive: true });
fs.writeFileSync(
  path.join(toolsDir, 'echo.tool'),
  'name: echo\ndoes: data\nserver: fixture\nversion: v1\nneeds:\n  value: string\ngives:\n  value: string\n',
);
for (const name of ['financial_ratios', 'dcf_valuation', 'rag_pipeline']) {
  fs.writeFileSync(
    path.join(toolsDir, `${name}.tool`),
    `name: ${name}\ndoes: analyze\nserver: skill-runtime\nversion: v1\nneeds:\n  query: string\ngives:\n  result: object\n`,
  );
}
fs.writeFileSync(
  path.join(flowsDir, 'echo-flow.flow'),
  'name: echo-flow\nsteps:\n  - do: echo\n    as: echoed\n    with:\n      value: $value\n',
);

const { CONTRACT_VERSIONS } = require('../lib/contracts');
const gateway = require('../lib/gateway');
const { server, jobCoordinator, mediaCoordinator } = require('../serve');
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

function request(method, pathname, body, headers = {}) {
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
        ...headers,
      } : { ...headers },
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

function requestBuffer(method, pathname, body, headers = {}) {
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
        ...headers,
      } : { ...headers },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'],
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
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
  mediaCoordinator.start();
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
  assert.match(response.body, /\/v1\/capabilities/);
  assert.match(response.body, /\/v1\/jobs/);
  assert.match(response.body, /\/v1\/workspace/);
  assert.match(response.body, /id="roleChip"/);
  assert.match(response.body, /id="assetLibrary"/);
  assert.doesNotMatch(response.body, /member-grid|live roster/i);
  assert.doesNotMatch(response.body, /Doctrine \/ Law XV/);
  assert.match(response.body, /No generation (?:is|was) started/);
  assert.match(response.body, /L7 Prism Design System/);
  assert.match(response.body, /--ds-canvas:/);
  assert.match(response.body, /prefers-reduced-motion/);
  assert.match(response.body, /Shared library/);
  assert.match(response.body, /Generate fast preview/);
  assert.match(response.body, /record\.preview/);
  assert.match(response.body, /Start a new run/);
  assert.match(response.body, /\/api\/media\/dream-cycle\/approve/);
  assert.match(response.body, /lowRiskAutoApprovalAvailable/);
  assert.match(response.body, /data-mode="image"/);
  assert.match(response.body, /data-mode="video"/);
  assert.match(response.body, /data-mode="copy"/);
  assert.match(response.body, /Preview run/);
  assert.doesNotMatch(response.body, /Preview plan/);
  assert.match(response.body, /Generate a still, a clip, or a line — it will land here/);
  assert.match(response.body, /Download pack/);
  assert.match(response.body, /Send to audience/);
  assert.match(response.body, /id="advancedDrawer"/);
  assert.doesNotMatch(response.body, /View API/);
  assert.doesNotMatch(response.body, /Generate via \/v1\/jobs/);
  assert.match(response.body, /submitV1Job\('text\.generate'/);
  assert.match(response.body, /plan === 'team'/);
});

test('offers Team CTA is Talk to us or Studio, not View API', async () => {
  const response = await requestText('GET', '/offers');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /View API/);
  assert.match(response.body, /Start in Studio/);
  assert.match(response.body, /Talk to us/);
  assert.match(response.body, /mailto:hello@avli\.cloud/);
  const teamBlock = response.body.split('<h3>Team</h3>')[1]?.split('<h3>Organization</h3>')[0] || '';
  assert.match(teamBlock, /Talk to us|Start in Studio/);
  assert.doesNotMatch(teamBlock, /\/v1\/capabilities/);
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

test('low-risk local images auto-approve while motion remains gated', async () => {
  const domains = require('../lib/domains');
  domains.write('morph', 'auto-above.json', { layer: 1 });
  domains.write('morph', 'auto-mirror.json', { layer: 2 });
  domains.write('morph', 'auto-below.json', { layer: 3 });
  assert.equal(domains.morphLocked, true);

  const { createMorphicPlan } = require('../lib/morphic-media');
  const imagePlan = createMorphicPlan({ brief: 'automatic local preview', mode: 'image', candidates: 1 });
  const submitted = await request('POST', '/api/media/runs', { plan: imagePlan });
  assert.equal(submitted.status, 202);
  assert.equal(submitted.body.policy.risk, 'low');
  assert.equal(submitted.body.policy.decision, 'automatic');
  const completed = await mediaCoordinator.wait(submitted.body.id);
  assert.equal(completed.state, 'crystallized');
  assert.equal(domains.morphLocked, true);

  const videoPlan = createMorphicPlan({ brief: 'gated motion preview', mode: 'video', candidates: 1 });
  const gated = await request('POST', '/api/media/runs', { plan: videoPlan });
  assert.equal(gated.status, 409);
  assert.match(gated.body.error, /Explicit approval/);

  const reset = await request('POST', '/api/media/dream-cycle/approve', { approved: true });
  assert.equal(reset.body.approval_required, false);
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
  const tool = tools.body.result.tools.find(item => item.tool === 'echo');
  assert.ok(tool, 'expected tool:echo in /v1/tools');
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
  const ids = response.body.result.capabilities.map(item => item.id);
  assert.ok(ids.includes('tool.echo'));
  assert.ok(ids.includes('image.generate'));
  assert.ok(ids.includes('tool.financial-ratios'));
  assert.ok(ids.includes('tool.dcf-valuation'));
  assert.ok(ids.includes('tool.rag-pipeline'));
  assert.ok(ids.includes('text.echo'));
  assert.ok(ids.includes('text.generate'));
  const generate = response.body.result.capabilities.find(item => item.id === 'text.generate');
  assert.equal(generate.available, false);
  assert.equal(generate.modality, 'text');
  assert.equal(validateCapabilities(response.body.result), true, JSON.stringify(validateCapabilities.errors));
});

test('duplicate X-L7-Request-Id does not double-run ratios', async () => {
  let executions = 0;
  const originalExecute = gateway.execute;
  gateway.execute = async (name, args) => {
    executions += 1;
    return { success: true, result: { tool: name, args, ratios: { profitability: { roe: 0.2 } } } };
  };
  try {
    const jobRequest = {
      contract_version: CONTRACT_VERSIONS.workerJobRequest,
      request_id: 'request:ratios-once',
      tenant_id: 'tenant:test',
      capability: 'tool.financial-ratios',
      input: { period: 'Q4_2024' },
      privacy_class: 'internal',
      deadline: new Date(Date.now() + 60_000).toISOString(),
    };
    const first = await request('POST', '/v1/jobs', jobRequest, { 'X-L7-Request-Id': 'request:ratios-once' });
    const second = await request('POST', '/v1/jobs', jobRequest, { 'X-L7-Request-Id': 'request:ratios-once' });
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);
    assert.equal(first.body.result.job.job_id, second.body.result.job.job_id);
    let current;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      current = await request('GET', `/v1/jobs/${encodeURIComponent(first.body.result.job.job_id)}`);
      if (current.body.result.job.state === 'succeeded') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(current.body.result.job.state, 'succeeded');
    assert.equal(executions, 1);
  } finally {
    gateway.execute = originalExecute;
  }
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

test('unsigned worker callbacks are rejected and signed callbacks are accepted', async () => {
  const { signCallback } = require('../lib/callback-hmac');
  const submitted = await request('POST', '/v1/jobs', {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: 'request:callback-hmac',
    capability: 'tool.echo',
    input: { value: 'callback' },
    privacy_class: 'internal',
    deadline: new Date(Date.now() + 60_000).toISOString(),
  });
  const jobId = submitted.body.result.job.job_id;
  const payload = { job_id: jobId, state: 'succeeded' };
  const denied = await request('POST', '/v1/callbacks/jobs', payload);
  assert.equal(denied.status, 401);

  const accepted = await request('POST', '/v1/callbacks/jobs', payload, {
    'X-L7-Callback-Signature': signCallback(payload, process.env.L7_CALLBACK_HMAC_SECRET),
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.result.accepted, true);
  assert.equal(accepted.body.result.job.job_id, jobId);
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
  const echo = tools.body.tools.find(item => item.name === 'echo');
  assert.ok(echo, 'expected echo in legacy /api/tools');

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

test('campaign workspace has one operator and no public member list endpoint', async () => {
  const response = await request('GET', '/v1/workspace');
  assert.equal(response.status, 200);
  assertCanonical(response.body);
  const view = response.body.result;
  assert.equal(view.plan, 'campaign');
  assert.equal(view.role, 'admin');
  assert.equal('members' in view, false);
});

function echoJobRequest(requestId, tenantId) {
  return {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: requestId,
    tenant_id: tenantId,
    capability: 'tool.echo',
    input: { value: 'workspace' },
    privacy_class: 'internal',
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
}

test('team operator cannot read another workspace job', async () => {
  const previousAccounts = process.env.L7_ACCOUNT_TOKENS;
  const { createWorkspaceStore } = require('../lib/workspace-store');
  const store = createWorkspaceStore({ root: path.join(FIXTURE_DIR, 'state', 'workspaces') });
  store.save({
    workspace_id: 'workspace:alpha',
    plan: 'team',
    tenant_id: 'tenant:alpha-team',
    members: [
      { account_id: 'account:admin-a', role: 'admin', token_id: 'admin-a' },
      { account_id: 'account:op-a', role: 'operator', token_id: 'op-a' },
    ],
    artifact_sha256: [],
  });
  store.save({
    workspace_id: 'workspace:beta',
    plan: 'team',
    tenant_id: 'tenant:beta-team',
    members: [
      { account_id: 'account:admin-b', role: 'admin', token_id: 'admin-b' },
      { account_id: 'account:op-b', role: 'operator', token_id: 'op-b' },
    ],
    artifact_sha256: [],
  });
  process.env.L7_ACCOUNT_TOKENS = JSON.stringify({
    'admin-a': 'token-admin-a',
    'op-b': 'token-op-b',
  });
  try {
    const submitted = await request(
      'POST',
      '/v1/jobs',
      echoJobRequest('request:workspace-alpha', 'tenant:alpha-team'),
      { authorization: 'Bearer token-admin-a' },
    );
    assert.equal(submitted.status, 202);
    const jobId = submitted.body.result.job.job_id;
    const peek = await request(
      'GET',
      `/v1/jobs/${encodeURIComponent(jobId)}`,
      undefined,
      { authorization: 'Bearer token-op-b' },
    );
    assert.equal(peek.status, 404);
  } finally {
    restoreEnv('L7_ACCOUNT_TOKENS', previousAccounts);
  }
});

test('team admin can attach an artifact hash to the shared library; operator can read it', async () => {
  const previousAccounts = process.env.L7_ACCOUNT_TOKENS;
  const { createWorkspaceStore } = require('../lib/workspace-store');
  const store = createWorkspaceStore({ root: path.join(FIXTURE_DIR, 'state', 'workspaces') });
  store.save({
    workspace_id: 'workspace:shared-lib',
    plan: 'team',
    tenant_id: 'tenant:shared',
    members: [
      { account_id: 'account:lib-admin', role: 'admin', token_id: 'lib-admin' },
      { account_id: 'account:lib-op', role: 'operator', token_id: 'lib-op' },
    ],
    artifact_sha256: [],
  });
  process.env.L7_ACCOUNT_TOKENS = JSON.stringify({
    'lib-admin': 'token-lib-admin',
    'lib-op': 'token-lib-op',
  });
  const sha = 'b'.repeat(64);
  try {
    const shared = await request(
      'POST',
      '/v1/workspace/artifacts',
      { sha256: sha },
      { authorization: 'Bearer token-lib-admin' },
    );
    assert.equal(shared.status, 200);
    const denied = await request(
      'POST',
      '/v1/workspace/artifacts',
      { sha256: 'c'.repeat(64) },
      { authorization: 'Bearer token-lib-op' },
    );
    assert.equal(denied.status, 403);
    const lib = await request(
      'GET',
      '/v1/workspace/artifacts',
      undefined,
      { authorization: 'Bearer token-lib-op' },
    );
    assert.equal(lib.status, 200);
    assert.ok(lib.body.result.artifacts.some(item => item.sha256 === sha));
    assert.equal('members' in lib.body.result, false);
  } finally {
    restoreEnv('L7_ACCOUNT_TOKENS', previousAccounts);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function startMockModelWorker() {
  const token = 'model-gateway-token';
  const jobs = new Map();
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(payload);
    };
    if (req.headers.authorization !== `Bearer ${token}`) {
      send(401, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'authentication required' } });
      return;
    }
    if (req.method === 'GET' && req.url === '/internal/v1/health') {
      send(200, { status: 'ok', worker_id: 'avli-ollama', worker_version: '0.1.0', active_jobs: 0 });
      return;
    }
    if (req.method === 'GET' && req.url === '/internal/v1/capabilities') {
      send(200, {
        contract_version: CONTRACT_VERSIONS.workerCapabilities,
        capabilities: [{ id: 'text.generate', modality: 'text', models: ['mock:latest'] }],
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/internal/v1/jobs') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const jobId = `job:${crypto.createHash('sha256').update(`${body.tenant_id}\0${body.request_id}`).digest('hex').slice(0, 24)}`;
        jobs.set(jobId, {
          job_id: jobId,
          state: 'succeeded',
          progress: 1,
          result: { text: `pong:${body.input.prompt}`, model: 'mock:latest' },
          artifacts: [],
        });
        send(202, { job_id: jobId, state: 'queued' });
      });
      return;
    }
    const match = /^\/internal\/v1\/jobs\/(job:[a-f0-9]{24})$/.exec(req.url);
    if (req.method === 'GET' && match && jobs.has(match[1])) {
      send(200, jobs.get(match[1]));
      return;
    }
    send(404, { error: { code: 'NOT_FOUND', message: 'route not found' } });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, token, port: server.address().port });
    });
  });
}

test('text.generate is a first-class job like image.generate', async () => {
  const caps = await request('GET', '/v1/capabilities');
  assert.equal(caps.status, 200);
  assert.ok(caps.body.result.capabilities.some(item => item.id === 'text.generate'));
  assert.ok(caps.body.result.capabilities.some(item => item.id === 'image.generate'));
});

test('campaign workspace pack is a zip and campaign cannot publish', async () => {
  const bytes = Buffer.from('campaign-pack-asset');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const directory = path.join(FIXTURE_DIR, 'media', 'objects', hash.slice(0, 2));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${hash}.txt`), bytes);
  fs.writeFileSync(path.join(directory, `${hash}.metadata.json`), JSON.stringify({
    sha256: hash,
    bytes: bytes.length,
    media_type: 'text/plain',
    extension: 'txt',
    created_at: '2026-08-17T00:00:00.000Z',
  }));

  const attached = await request('POST', '/v1/workspace/artifacts', { sha256: hash });
  assert.equal(attached.status, 200);
  const library = await request('GET', '/v1/workspace/artifacts');
  assert.equal(library.status, 200);
  const row = library.body.result.artifacts.find(item => item.sha256 === hash);
  assert.ok(row);
  assert.equal(row.media_type, 'text/plain');
  assert.ok(row.created_at);
  assert.equal('members' in library.body.result, false);

  const pack = await requestBuffer('GET', '/v1/workspace/pack');
  assert.equal(pack.status, 200);
  assert.match(String(pack.type || ''), /zip|octet-stream/);
  assert.equal(pack.body.subarray(0, 4).toString('hex'), '504b0304');
  assert.match(pack.body.toString('binary'), /campaign\.txt/);
  assert.match(pack.body.toString('utf8'), /campaign-pack-asset/);

  const published = await request('POST', '/v1/workspace/publish', { sha256: [hash] });
  assert.equal(published.status, 403);
  assertCanonical(published.body, false);
  assert.equal(published.body.meta.error_code, 'AUTHORIZATION_DENIED');
});

test('team can publish to audience; operator and campaign cannot', async () => {
  const previousAccounts = process.env.L7_ACCOUNT_TOKENS;
  const { createWorkspaceStore } = require('../lib/workspace-store');
  const store = createWorkspaceStore({ root: path.join(FIXTURE_DIR, 'state', 'workspaces') });
  store.save({
    workspace_id: 'workspace:publish-team',
    plan: 'team',
    tenant_id: 'tenant:publish',
    members: [
      { account_id: 'account:pub-admin', role: 'admin', token_id: 'pub-admin' },
      { account_id: 'account:pub-op', role: 'operator', token_id: 'pub-op' },
    ],
    artifact_sha256: ['d'.repeat(64)],
  });
  process.env.L7_ACCOUNT_TOKENS = JSON.stringify({
    'pub-admin': 'token-pub-admin',
    'pub-op': 'token-pub-op',
  });
  try {
    const accepted = await request(
      'POST',
      '/v1/workspace/publish',
      { sha256: ['d'.repeat(64)] },
      { authorization: 'Bearer token-pub-admin' },
    );
    assert.equal(accepted.status, 202);
    assertCanonical(accepted.body);
    assert.equal(accepted.body.result.accepted, true);
    assert.match(String(accepted.body.result.request_id || ''), /^request:/);
    const denied = await request(
      'POST',
      '/v1/workspace/publish',
      { sha256: ['d'.repeat(64)] },
      { authorization: 'Bearer token-pub-op' },
    );
    assert.equal(denied.status, 403);
  } finally {
    restoreEnv('L7_ACCOUNT_TOKENS', previousAccounts);
  }
});

test('POST /v1/jobs text.generate routes to the private model worker', async () => {
  const worker = await startMockModelWorker();
  const previousUrl = process.env.AVLI_MODEL_WORKER_URL;
  const previousToken = process.env.AVLI_WORKER_SERVICE_TOKEN;
  process.env.AVLI_MODEL_WORKER_URL = `http://127.0.0.1:${worker.port}`;
  process.env.AVLI_WORKER_SERVICE_TOKEN = worker.token;
  try {
    const submitted = await request('POST', '/v1/jobs', {
      contract_version: CONTRACT_VERSIONS.workerJobRequest,
      request_id: 'request:text-generate-gateway',
      tenant_id: 'tenant:test',
      capability: 'text.generate',
      input: { prompt: 'ping' },
      privacy_class: 'internal',
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(submitted.status, 202);
    const jobId = submitted.body.result.job.job_id;
    let current;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      current = await request('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
      if (current.body.result.job.state === 'succeeded') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(current.body.result.job.state, 'succeeded');
    assert.equal(current.body.result.job.result.text, 'pong:ping');
    const capabilities = await request('GET', '/v1/capabilities');
    const generate = capabilities.body.result.capabilities.find(item => item.id === 'text.generate');
    assert.equal(generate.available, true);
  } finally {
    restoreEnv('AVLI_MODEL_WORKER_URL', previousUrl);
    restoreEnv('AVLI_WORKER_SERVICE_TOKEN', previousToken);
    await new Promise(resolve => worker.server.close(resolve));
  }
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
