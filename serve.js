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
const { createHttpSecurity } = require('./lib/http-security');
const { createMorphicPlan } = require('./lib/morphic-media');
const { MediaRunner } = require('./lib/media-runner');
const { MediaRunCoordinator } = require('./lib/media-run-coordinator');
const { JobCoordinator, publicJob } = require('./lib/job-coordinator');
const { ssd1bReadiness } = require('./lib/ssd-image-adapter');
const {
  HttpRequestError,
  configuredBodyLimit,
  parseJsonBody,
  publicHttpError,
} = require('./lib/http-body');
const { resolveContainedFile } = require('./lib/safe-path');
const { CONTRACT_VERSIONS, ERROR_CODES, normalizeExecutionResult } = require('./lib/contracts');

const PORT = parseInt(process.env.L7_PORT || '18789', 10);
const BIND = process.env.L7_BIND || '127.0.0.1';
const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
const TOOLS_DIR = path.join(L7_DIR, 'tools');
const FLOWS_DIR = path.join(L7_DIR, 'flows');
const STUDIO_PATH = path.join(__dirname, 'src', 'avli-cloud-studio.html');
const MAX_BODY_BYTES = configuredBodyLimit(process.env.L7_MAX_BODY_BYTES);
const httpSecurity = createHttpSecurity({ port: PORT });
const mediaRunner = new MediaRunner();
const mediaCoordinator = new MediaRunCoordinator({
  runner: mediaRunner,
  concurrency: Number(process.env.AVLI_MEDIA_RUN_CONCURRENCY) || 1,
  autoStart: false,
});

function capabilityIdForTool(name) {
  return `tool.${String(name).toLowerCase().replace(/[^a-z0-9.-]+/g, '-')}`;
}

function toolForCapability(capability) {
  const match = gateway.listPublicTools().find(tool => capabilityIdForTool(tool.tool) === capability);
  return match?.tool || null;
}

function mediaArtifacts(result) {
  const artifacts = (result?.layers || []).flatMap(layer => layer.artifacts || []);
  return artifacts
    .filter(artifact => /^[a-f0-9]{64}$/.test(artifact.content_hash || ''))
    .map(artifact => ({
      sha256: artifact.content_hash,
      bytes: artifact.bytes || 0,
      media_type: artifact.media_type || 'application/octet-stream',
      producer: String(artifact.model_receipt?.provider || 'l7-gateway').replace(/[^A-Za-z0-9._:-]/g, '-'),
      model: artifact.model_receipt?.model || artifact.adapter || 'unknown',
      model_version: artifact.model_receipt?.model_version || null,
      license_id: artifact.model_receipt?.license_id || 'NOASSERTION',
      prompt_hash: artifact.model_receipt?.prompt_hash || null,
      created_at: artifact.created_at || new Date().toISOString(),
      delivery_url: `/v1/artifacts/${artifact.content_hash}`,
    }));
}

async function executeJob(request, context) {
  const toolName = toolForCapability(request.capability);
  if (toolName) {
    return gateway.execute(toolName, request.input, {
      signal: context.signal,
      timeout: Math.min(context.timeout, gateway.config?.timeout || context.timeout),
      who: `tenant:${request.tenant_id}`,
    });
  }

  if (['image.generate', 'video.generate'].includes(request.capability)) {
    const mode = request.capability.startsWith('video.') ? 'video' : 'image';
    const plan = createMorphicPlan({ ...request.input, mode });
    const result = await mediaRunner.run(plan, {
      signal: context.signal,
      onProgress: progress => {
        const completed = Number(progress?.completed_jobs) || 0;
        const total = Number(progress?.total_jobs) || 1;
        context.onProgress(completed / total);
      },
    });
    return { result, artifacts: mediaArtifacts(result) };
  }

  const error = new Error(`Unknown capability: ${request.capability}`);
  error.code = 'L7_NOT_FOUND';
  throw error;
}

const jobCoordinator = new JobCoordinator({
  execute: executeJob,
  concurrency: Number(process.env.L7_JOB_CONCURRENCY) || 2,
  autoStart: false,
});

function capabilityDocument() {
  const tools = gateway.listPublicTools().map(tool => ({
    id: capabilityIdForTool(tool.tool),
    modality: tool.l7.capability === 'render' ? 'image' : 'automation',
    operations: ['execute', 'cancel'],
    privacy_classes: tool.l7.policyIntent.compliance === 'restricted'
      ? ['restricted']
      : ['public', 'internal'],
    available: tool.l7.timeVersioning.lifecycle !== 'sunset',
    models: [],
    limits: {
      max_concurrency: 2,
      max_input_bytes: MAX_BODY_BYTES,
      timeout_seconds: Math.max(1, Math.floor((gateway.config?.timeout || 30000) / 1000)),
    },
  }));
  const media = ['image.generate', 'video.generate'].map(id => {
    const modality = id.split('.')[0];
    const adapters = mediaRunner.capabilities()
      .filter(adapter => adapter.capabilities.includes(id));
    return {
      id,
      modality,
      operations: ['generate', 'cancel'],
      privacy_classes: ['public', 'internal', 'restricted'],
      available: adapters.some(adapter => !['offline', 'declared'].includes(adapter.health)),
      models: adapters.map(adapter => `${adapter.provider}/${adapter.name}@${adapter.version}`),
      limits: {
        max_concurrency: 1,
        max_input_bytes: MAX_BODY_BYTES,
        timeout_seconds: 600,
      },
    };
  });
  return {
    contract_version: CONTRACT_VERSIONS.workerCapabilities,
    worker_id: 'l7-gateway',
    worker_version: '0.1.0',
    generated_at: new Date().toISOString(),
    capabilities: [...tools, ...media],
  };
}

// ═══════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════

function setCorsHeaders(req, res) {
  httpSecurity.setCorsHeaders(req, res);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, filePath) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function requestedRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return false;
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendMediaAsset(req, res, asset) {
  const range = requestedRange(req.headers.range, asset.size);
  if (range === false) {
    asset.stream.destroy();
    res.writeHead(416, { 'Content-Range': `bytes */${asset.size}` });
    res.end();
    return;
  }
  const selected = range || { start: 0, end: asset.size - 1 };
  if (range && (asset.start !== range.start || asset.end !== range.end)) {
    asset.stream.destroy();
    throw new Error('media range stream does not match the requested range');
  }
  const headers = {
    'Content-Type': asset.metadata.media_type || 'application/octet-stream',
    'Content-Length': selected.end - selected.start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, immutable, max-age=31536000',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${asset.size}`;
  res.writeHead(range ? 206 : 200, headers);
  asset.stream.on('error', error => res.destroy(error));
  asset.stream.pipe(res);
}

function parseBody(req) {
  return parseJsonBody(req, { maxBytes: MAX_BODY_BYTES });
}

function listFlows() {
  if (!fs.existsSync(FLOWS_DIR)) return [];
  return fs.readdirSync(FLOWS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.flow'))
    .map(entry => {
      const flowPath = resolveContainedFile(FLOWS_DIR, entry.name, { label: 'Flow filename' });
      try { return { name: path.basename(entry.name, '.flow'), ...parseFile(flowPath) }; }
      catch { return { name: path.basename(entry.name, '.flow'), error: 'parse error' }; }
    });
}

function flowExecutionView(execState) {
  return {
    id: execState.id,
    flow: execState.flow,
    status: execState.status,
    step: execState.step,
    results: execState.results,
  };
}

function resultErrorCode(status) {
  if (status === 401) return 'AUTHENTICATION_REQUIRED';
  if (status === 403) return 'AUTHORIZATION_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 504) return 'TIMEOUT';
  if (status >= 400 && status < 500) return 'VALIDATION_ERROR';
  return 'INTERNAL_ERROR';
}

function canonicalFailure(res, status, error, code, meta = {}) {
  sendJson(res, status, normalizeExecutionResult({ success: false, error }, {
    errorCode: code || resultErrorCode(status),
    meta,
  }));
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpRequestError(400, 'INVALID_REQUEST', `${label} must be a JSON object`);
  }
  return value;
}

function tenantPrincipal(req) {
  const tenantId = req.l7Principal?.tenantId;
  if (!tenantId) {
    throw new HttpRequestError(
      403,
      'AUTHORIZATION_DENIED',
      'This service identity is not assigned to a tenant',
    );
  }
  return tenantId;
}

function tenantJob(req, jobId) {
  const job = jobCoordinator.get(jobId);
  if (!job || job.tenant_id !== tenantPrincipal(req)) return null;
  return job;
}

function publicExecutionOptions(value) {
  if (value === undefined) return {};
  const source = requireRecord(value, 'options');
  const unknown = Object.keys(source).filter(key => key !== 'timeout');
  if (unknown.length > 0) {
    throw new HttpRequestError(
      400,
      'INVALID_EXECUTION_OPTIONS',
      `Unsupported public execution option(s): ${unknown.join(', ')}`,
    );
  }
  if (source.timeout === undefined) return {};

  const maximum = Number.isFinite(gateway.config.timeout) && gateway.config.timeout > 0
    ? gateway.config.timeout
    : 30000;
  if (!Number.isSafeInteger(source.timeout) || source.timeout <= 0 || source.timeout > maximum) {
    throw new HttpRequestError(
      400,
      'INVALID_EXECUTION_TIMEOUT',
      `timeout must be an integer between 1 and ${maximum} milliseconds`,
    );
  }
  return { timeout: source.timeout };
}

// ═══════════════════════════════════════════════════════════
// REQUEST HANDLER
// ═══════════════════════════════════════════════════════════

async function requestHandler(req, res) {
  const parsed = url.parse(req.url, true);
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    httpSecurity.handleOptions(req, res, parsed.pathname.startsWith('/v1/') ? {
      onReject: (status, error) => canonicalFailure(res, status, error),
    } : {});
    return;
  }

  if (
    (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/v1/'))
    && !httpSecurity.authorize(req, res, parsed.pathname.startsWith('/v1/') ? {
      onReject: (status, error) => canonicalFailure(res, status, error),
    } : {})
  ) {
    return;
  }

  try {
    if ((parsed.pathname === '/studio' || parsed.pathname === '/studio/') && req.method === 'GET') {
      sendHtml(res, STUDIO_PATH);
      return;
    }

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

    if (parsed.pathname === '/v1/tools' && req.method === 'GET') {
      sendJson(res, 200, normalizeExecutionResult({ tools: gateway.listPublicTools() }));
      return;
    }

    if (parsed.pathname === '/v1/capabilities' && req.method === 'GET') {
      sendJson(res, 200, normalizeExecutionResult(capabilityDocument()));
      return;
    }

    if (parsed.pathname === '/v1/jobs' && req.method === 'GET') {
      const tenantId = tenantPrincipal(req);
      sendJson(res, 200, normalizeExecutionResult({
        jobs: jobCoordinator.list()
          .filter(job => job.tenant_id === tenantId)
          .map(publicJob),
      }));
      return;
    }

    if (parsed.pathname === '/v1/jobs' && req.method === 'POST') {
      const request = requireRecord(await parseBody(req), 'request body');
      const tenantId = tenantPrincipal(req);
      if (request.tenant_id !== undefined && request.tenant_id !== tenantId) {
        throw new HttpRequestError(403, 'AUTHORIZATION_DENIED', 'tenant_id does not match the authenticated service identity');
      }
      const job = jobCoordinator.submit({ ...request, tenant_id: tenantId });
      sendJson(res, 202, normalizeExecutionResult({ job: publicJob(job) }, {
        meta: { job_id: job.job_id },
      }));
      return;
    }

    const jobRoute = parsed.pathname.match(/^\/v1\/jobs\/([^/]+)(?:\/(cancel))?$/);
    if (jobRoute) {
      const jobId = decodeURIComponent(jobRoute[1]);
      const action = jobRoute[2];
      if (!action && req.method === 'GET') {
        const job = tenantJob(req, jobId);
        if (!job) {
          canonicalFailure(res, 404, 'Job not found', 'NOT_FOUND', { job_id: jobId });
          return;
        }
        sendJson(res, 200, normalizeExecutionResult({ job: publicJob(job) }, {
          meta: { job_id: job.job_id },
        }));
        return;
      }
      if (action === 'cancel' && req.method === 'POST') {
        const visibleJob = tenantJob(req, jobId);
        const job = visibleJob ? jobCoordinator.cancel(jobId) : null;
        if (!job) {
          canonicalFailure(res, 404, 'Job not found', 'NOT_FOUND', { job_id: jobId });
          return;
        }
        sendJson(res, 200, normalizeExecutionResult({ job: publicJob(job) }, {
          meta: { job_id: job.job_id },
        }));
        return;
      }
    }

    const toolExecutionRoute = parsed.pathname.match(/^\/v1\/tools\/([^/]+)\/executions$/);
    if (toolExecutionRoute && req.method === 'POST') {
      const body = requireRecord(await parseBody(req), 'request body');
      const toolName = decodeURIComponent(toolExecutionRoute[1]);
      const args = body.arguments === undefined ? {} : requireRecord(body.arguments, 'arguments');
      const result = await gateway.execute(toolName, args, publicExecutionOptions(body.options));
      sendJson(res, 200, result);
      return;
    }

    // ── Citizens ──
    if (parsed.pathname === '/api/citizens') {
      sendJson(res, 200, { citizens: gateway.listCitizens() });
      return;
    }

    // ── Execute tool (POST) ──
    if (parsed.pathname === '/api/call' && req.method === 'POST') {
      const body = requireRecord(await parseBody(req), 'request body');
      if (!body.tool) {
        sendJson(res, 400, { error: 'Tool name required' });
        return;
      }
      const args = body.arguments === undefined ? {} : requireRecord(body.arguments, 'arguments');
      const result = await gateway.execute(body.tool, args, publicExecutionOptions(body.options));
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

    // ── Morphic Media ──
    const v1ArtifactRoute = parsed.pathname.match(/^\/v1\/artifacts\/([a-f0-9]{64})$/);
    if (v1ArtifactRoute && req.method === 'GET') {
      if (typeof mediaRunner.store.open !== 'function') {
        throw new HttpRequestError(404, 'MEDIA_ASSET_UNAVAILABLE', 'Artifact is not available from this Gateway');
      }
      const initial = await mediaRunner.store.open(v1ArtifactRoute[1]);
      const range = initial && requestedRange(req.headers.range, initial.size);
      if (range === false) {
        initial.stream.destroy();
        res.writeHead(416, { 'Content-Range': `bytes */${initial.size}` });
        res.end();
        return;
      }
      if (range) initial.stream.destroy();
      const asset = range ? await mediaRunner.store.open(v1ArtifactRoute[1], range) : initial;
      if (!asset) throw new HttpRequestError(404, 'MEDIA_ASSET_NOT_FOUND', 'Artifact not found');
      sendMediaAsset(req, res, asset);
      return;
    }

    const mediaAssetRoute = parsed.pathname.match(/^\/api\/media\/assets\/([a-f0-9]{64})$/);
    if (mediaAssetRoute && req.method === 'GET') {
      if (typeof mediaRunner.store.open !== 'function') {
        throw new HttpRequestError(404, 'MEDIA_ASSET_UNAVAILABLE', 'Media asset is not available from this Gateway');
      }
      const initial = await mediaRunner.store.open(mediaAssetRoute[1]);
      const range = initial && requestedRange(req.headers.range, initial.size);
      if (range === false) {
        initial.stream.destroy();
        res.writeHead(416, { 'Content-Range': `bytes */${initial.size}` });
        res.end();
        return;
      }
      if (range) initial.stream.destroy();
      const asset = range ? await mediaRunner.store.open(mediaAssetRoute[1], range) : initial;
      if (!asset) throw new HttpRequestError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found');
      sendMediaAsset(req, res, asset);
      return;
    }

    if (parsed.pathname === '/api/media/capabilities' && req.method === 'GET') {
      sendJson(res, 200, {
        execution_mode: mediaRunner.executionMode,
        adapters: mediaRunner.capabilities(),
      });
      return;
    }

    if (parsed.pathname === '/api/media/readiness/ssd-1b' && req.method === 'GET') {
      sendJson(res, 200, ssd1bReadiness());
      return;
    }

    if (parsed.pathname === '/api/media/resources' && req.method === 'GET') {
      const { AvliCloudVideoClient } = require('./lib/avli-cloud-video-adapter');
      const { AvliClusterVideoClient } = require('./lib/avli-cluster-video-adapter');
      sendJson(res, 200, {
        local: {
          execution_mode: mediaRunner.executionMode,
          video_engine: process.env.AVLI_VIDEO_ENGINE || 'auto',
        },
        avli_cluster: await new AvliClusterVideoClient().resources(),
        avli_cloud: await new AvliCloudVideoClient().resources(),
      });
      return;
    }

    if (parsed.pathname === '/api/media/plan' && req.method === 'POST') {
      const body = await parseBody(req);
      sendJson(res, 200, createMorphicPlan(body.request || body));
      return;
    }

    if (parsed.pathname === '/api/media/runs' && req.method === 'GET') {
      sendJson(res, 200, { runs: mediaCoordinator.list() });
      return;
    }

    if (parsed.pathname === '/api/media/runs' && req.method === 'POST') {
      const body = await parseBody(req);
      const run = mediaCoordinator.submit(body.plan || body.request || body);
      sendJson(res, 202, run);
      return;
    }

    const mediaRunRoute = parsed.pathname.match(/^\/api\/media\/runs\/([^/]+)(?:\/(events|cancel|resume))?$/);
    if (mediaRunRoute) {
      const [, runId, action] = mediaRunRoute;
      if (!action && req.method === 'GET') {
        const run = mediaCoordinator.get(runId);
        sendJson(res, run ? 200 : 404, run || { error: 'Media run not found' });
        return;
      }
      if (action === 'events' && req.method === 'GET') {
        const run = mediaCoordinator.get(runId);
        if (!run) {
          sendJson(res, 404, { error: 'Media run not found' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const sendEvent = record => {
          if (record.id === runId) res.write(`event: update\ndata: ${JSON.stringify(record)}\n\n`);
        };
        sendEvent(run);
        mediaCoordinator.on('update', sendEvent);
        req.on('close', () => mediaCoordinator.off('update', sendEvent));
        return;
      }
      if (action === 'cancel' && req.method === 'POST') {
        const run = mediaCoordinator.cancel(runId);
        sendJson(res, run ? 200 : 404, run || { error: 'Media run not found' });
        return;
      }
      if (action === 'resume' && req.method === 'POST') {
        const run = mediaCoordinator.resume(runId);
        sendJson(res, run ? 202 : 404, run || { error: 'Media run not found' });
        return;
      }
    }

    if (parsed.pathname === '/api/media/run' && req.method === 'POST') {
      const body = await parseBody(req);
      const run = await mediaRunner.run(body.plan || body.request || body);
      sendJson(res, 200, run);
      return;
    }

    // ── Flows ──
    if (parsed.pathname === '/api/flows') {
      sendJson(res, 200, { flows: listFlows() });
      return;
    }

    if (parsed.pathname === '/v1/flows' && req.method === 'GET') {
      sendJson(res, 200, normalizeExecutionResult({ flows: listFlows() }));
      return;
    }

    if (parsed.pathname === '/api/execute' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.flow) { sendJson(res, 400, { error: 'Flow name required' }); return; }
      const execState = await executeFlow(body.flow, body.inputs || {}, { dryRun: body.dryRun || false });
      sendJson(res, 200, flowExecutionView(execState));
      return;
    }

    const flowExecutionRoute = parsed.pathname.match(/^\/v1\/flows\/([^/]+)\/executions$/);
    if (flowExecutionRoute && req.method === 'POST') {
      const body = await parseBody(req);
      const flowName = decodeURIComponent(flowExecutionRoute[1]);
      const execState = await executeFlow(flowName, body.inputs || {}, { dryRun: body.dryRun || false });
      sendJson(res, 200, normalizeExecutionResult(flowExecutionView(execState), {
        meta: { flow: flowName },
      }));
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
    if (parsed.pathname.startsWith('/v1/')) {
      sendJson(res, 404, normalizeExecutionResult({
        success: false,
        error: 'Not found',
      }, { errorCode: 'NOT_FOUND', meta: { path: parsed.pathname } }));
      return;
    }
    sendJson(res, 404, { error: 'Not found', path: parsed.pathname });

  } catch (err) {
    const response = publicHttpError(err);
    if (parsed.pathname.startsWith('/v1/')) {
      sendJson(res, response.status, normalizeExecutionResult({
        success: false,
        error: response.body.error,
      }, {
        errorCode: ERROR_CODES.includes(response.body.code)
          ? response.body.code
          : resultErrorCode(response.status),
        meta: { http_error_code: response.body.code },
      }));
      return;
    }
    sendJson(res, response.status, response.body);
  }
}

const server = http.createServer(requestHandler);

// ═══════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════

async function start() {
  try {
    httpSecurity.assertSafeBind(BIND, 'L7 Gateway server');
    const report = await gateway.boot();
    mediaCoordinator.start();
    jobCoordinator.start();

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
}

if (require.main === module) start();

module.exports = { requestHandler, server, start, jobCoordinator };

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: serve.js | Body-Hash: SHA-256:ae5a29c4e93b2520e1fecd54b33c1fdaa45a67f5a1626c8edbfdc4b503e1438a
// Chain-Hash: SHA-256:a782b44e1ffd235b3bb293f6cc4426914a78ec5dd1b668f8c93b5a44b3200035 | Signed: 2026-03-01T15:09:50.006072+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 5 works. Verify: python3 provenance.py verify serve.js
// L7:PROVENANCE
