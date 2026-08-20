#!/usr/bin/env node
/**
 * L7 Gateway Server — The Unified Self, listening.
 * Boots the gateway, then starts the HTTP API on port 18793.
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
const { classifyMediaRisk } = require('./lib/media-risk-policy');
const { MediaRunCoordinator } = require('./lib/media-run-coordinator');
const { JobCoordinator, publicJob } = require('./lib/job-coordinator');
const { createWorkspaceStore, publicView, syntheticCampaign } = require('./lib/workspace-store');
const { buildStoreZip, packFilename, workspaceShortId } = require('./lib/workspace-pack');
const { ssd1bReadiness } = require('./lib/ssd-image-adapter');
const {
  HttpRequestError,
  configuredBodyLimit,
  parseJsonBody,
  publicHttpError,
} = require('./lib/http-body');
const { resolveContainedFile } = require('./lib/safe-path');
const { CONTRACT_VERSIONS, ERROR_CODES, normalizeExecutionResult } = require('./lib/contracts');
const { forgeCapabilityDocuments, readForgeHealth } = require('./lib/forge-health');
const { executeOnWorker, workerConfigured, workerHealth } = require('./lib/avli-worker-client');

function modelWorkerOptions() {
  return {
    baseUrl: process.env.AVLI_MODEL_WORKER_URL || '',
    token: process.env.AVLI_MODEL_WORKER_SERVICE_TOKEN || process.env.AVLI_WORKER_SERVICE_TOKEN || '',
  };
}

function modelWorkerConfigured() {
  return workerConfigured(modelWorkerOptions());
}
const { SIGNATURE_HEADER, verifyCallback } = require('./lib/callback-hmac');

const PORT = parseInt(process.env.L7_PORT || '18793', 10);
const BIND = process.env.L7_BIND || '127.0.0.1';
const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
const TOOLS_DIR = path.join(L7_DIR, 'tools');
const FLOWS_DIR = path.join(L7_DIR, 'flows');
const STUDIO_PATH = path.join(__dirname, 'src', 'avli-cloud-studio.html');
const LANDING_PATH = path.join(__dirname, 'src', 'l7-way-landing.html');
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

  if (request.capability === 'text.echo') {
    return executeOnWorker(request, context);
  }

  if (request.capability === 'text.generate') {
    const output = await executeOnWorker(request, context, modelWorkerOptions());
    const artifacts = Array.isArray(output?.artifacts) ? [...output.artifacts] : [];
    const text = output?.result?.text;
    if (typeof text === 'string' && text && artifacts.length === 0 && typeof mediaRunner.store?.put === 'function') {
      const stored = await mediaRunner.store.put(Buffer.from(text, 'utf8'), {
        extension: 'txt',
        mediaType: 'text/plain',
      });
      artifacts.push({
        sha256: stored.content_hash,
        bytes: stored.bytes,
        media_type: stored.media_type,
        created_at: new Date().toISOString(),
        delivery_url: `/v1/artifacts/${stored.content_hash}`,
      });
    }
    return { result: output?.result ?? output, artifacts };
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

async function capabilityDocument() {
  const timeoutSeconds = Math.max(1, Math.floor((gateway.config?.timeout || 30000) / 1000));
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
      timeout_seconds: timeoutSeconds,
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
  const [forge, worker, model] = await Promise.all([
    readForgeHealth(),
    workerHealth(),
    workerHealth(modelWorkerOptions()),
  ]);
  const seen = new Set(tools.map(item => item.id));
  const forgeCaps = forgeCapabilityDocuments(forge, {
    maxInputBytes: MAX_BODY_BYTES,
    timeoutSeconds,
  }).filter(item => {
    if (seen.has(item.id)) {
      const existing = tools.find(tool => tool.id === item.id);
      if (existing) existing.available = existing.available && item.available;
      if (existing && item.available) existing.models = ['skill-runtime-forge'];
      return false;
    }
    seen.add(item.id);
    return true;
  });
  const echo = {
    id: 'text.echo',
    modality: 'text',
    operations: ['execute', 'cancel'],
    privacy_classes: ['public', 'internal', 'restricted'],
    available: Boolean(worker.available && workerConfigured()),
    models: ['reference/echo'],
    limits: {
      max_concurrency: 2,
      max_input_bytes: MAX_BODY_BYTES,
      timeout_seconds: 30,
    },
  };
  const generateModels = (model.capabilities || [])
    .find(item => item.id === 'text.generate')?.models || ['local/ollama'];
  const generate = {
    id: 'text.generate',
    modality: 'text',
    operations: ['execute', 'cancel'],
    privacy_classes: ['public', 'internal', 'restricted'],
    available: Boolean(model.available && modelWorkerConfigured()),
    models: generateModels,
    limits: {
      max_concurrency: 1,
      max_input_bytes: MAX_BODY_BYTES,
      timeout_seconds: Number(process.env.OLLAMA_TIMEOUT_SECONDS) || 120,
    },
  };
  return {
    contract_version: CONTRACT_VERSIONS.workerCapabilities,
    worker_id: 'l7-gateway',
    worker_version: '0.1.0',
    generated_at: new Date().toISOString(),
    capabilities: [...tools, ...forgeCaps, ...media, echo, generate],
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

function jobVisibleTo(job, principal) {
  if (!job || !principal) return false;
  if (job.workspace_id && principal.workspaceId) {
    return job.workspace_id === principal.workspaceId;
  }
  return job.tenant_id === principal.tenantId;
}

function visibleJob(req, jobId) {
  const job = jobCoordinator.get(jobId);
  return jobVisibleTo(job, req.l7Principal) ? job : null;
}

function requireWorkspace(req) {
  const principal = req.l7Principal;
  if (!principal?.workspaceId) {
    throw new HttpRequestError(
      403,
      'AUTHORIZATION_DENIED',
      'This identity is not assigned to a workspace',
    );
  }
  const store = createWorkspaceStore();
  const record = store.load(principal.workspaceId) || syntheticCampaign(principal.kind, principal.tenantId);
  return { principal, store, record };
}

function readMediaArtifact(sha256) {
  if (typeof mediaRunner.store?.get !== 'function') return null;
  try {
    return mediaRunner.store.get(sha256);
  } catch {
    return null;
  }
}

function describeArtifact(item) {
  const sha256 = item.sha256 || item.content_hash;
  const loaded = /^[a-f0-9]{64}$/.test(sha256 || '') ? readMediaArtifact(sha256) : null;
  return {
    sha256,
    media_type: item.media_type || loaded?.metadata?.media_type || 'application/octet-stream',
    created_at: item.created_at || loaded?.metadata?.created_at || null,
  };
}

function requestedHashes(query, fallback) {
  const raw = query.hashes || query.sha256;
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const hashes = list
    .map(item => String(item).trim().toLowerCase())
    .filter(item => /^[a-f0-9]{64}$/.test(item));
  return hashes.length ? hashes : fallback;
}

function sendZip(res, bytes, filename) {
  const name = String(filename || 'campaign-pack.zip').replace(/[^\w.-]+/g, '-');
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': bytes.length,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });
  res.end(bytes);
}

function postPublishWebhook(targetUrl, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (error) {
      reject(error);
      return;
    }
    const body = JSON.stringify(payload);
    const transport = parsed.protocol === 'https:' ? require('https') : http;
    const req = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('n8n did not accept this send'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function visibleArtifactHashes(store, record, principal) {
  const attached = store.listArtifacts(record.workspace_id, sha256 => describeArtifact({ sha256 }));
  const fromJobs = jobCoordinator.list()
    .filter(job => jobVisibleTo(job, principal))
    .flatMap(job => job.artifacts || [])
    .filter(artifact => /^[a-f0-9]{64}$/.test(artifact.sha256 || ''))
    .map(artifact => describeArtifact(artifact));
  const seen = new Set();
  return [...attached, ...fromJobs].filter(item => {
    if (seen.has(item.sha256)) return false;
    seen.add(item.sha256);
    return true;
  });
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

    if ((parsed.pathname === '/offers' || parsed.pathname === '/offers/') && req.method === 'GET') {
      sendHtml(res, LANDING_PATH);
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
      sendJson(res, 200, normalizeExecutionResult(await capabilityDocument()));
      return;
    }

    if (parsed.pathname === '/v1/workspace' && req.method === 'GET') {
      const { principal, record } = requireWorkspace(req);
      sendJson(res, 200, normalizeExecutionResult(publicView(record, principal)));
      return;
    }

    if (parsed.pathname === '/v1/workspace/artifacts' && req.method === 'GET') {
      const { principal, store, record } = requireWorkspace(req);
      sendJson(res, 200, normalizeExecutionResult({
        artifacts: visibleArtifactHashes(store, record, principal),
      }));
      return;
    }

    if (parsed.pathname === '/v1/workspace/artifacts' && req.method === 'POST') {
      const { principal, store, record } = requireWorkspace(req);
      if (principal.role !== 'admin') {
        throw new HttpRequestError(
          403,
          'AUTHORIZATION_DENIED',
          'Only workspace admins can attach shared assets',
        );
      }
      const body = requireRecord(await parseBody(req), 'request body');
      if (!store.load(record.workspace_id)) {
        store.save(record);
      }
      store.attachArtifact(record.workspace_id, body.sha256);
      sendJson(res, 200, normalizeExecutionResult({
        artifacts: store.listArtifacts(record.workspace_id, sha256 => describeArtifact({ sha256 })),
      }));
      return;
    }

    if (parsed.pathname === '/v1/workspace/pack' && req.method === 'GET') {
      const { principal, store, record } = requireWorkspace(req);
      if (!store.load(record.workspace_id)) {
        store.save(record);
      }
      const visible = visibleArtifactHashes(store, record, principal);
      const allowed = new Set(visible.map(item => item.sha256));
      const selected = requestedHashes(parsed.query, [...allowed]).filter(hash => allowed.has(hash));
      if (selected.length === 0) {
        throw new HttpRequestError(
          409,
          'CONFLICT',
          visible.length === 0
            ? 'This workspace has no library assets to download'
            : 'No selected library assets are available to download',
        );
      }
      const files = [];
      const listed = [];
      selected.forEach((sha256, index) => {
        const loaded = readMediaArtifact(sha256);
        const extension = loaded?.metadata?.extension || 'bin';
        const name = packFilename(record.workspace_id, index + 1, extension);
        if (loaded?.bytes) {
          files.push({ name, bytes: loaded.bytes });
        }
        listed.push(`${name}  ${sha256}${loaded?.bytes ? '' : '  (missing)'}`);
      });
      if (files.length === 0) {
        throw new HttpRequestError(
          409,
          'CONFLICT',
          'The selected assets are listed in the library, but all artifact bytes are missing',
        );
      }
      const brief = typeof parsed.query.brief === 'string' ? parsed.query.brief.trim() : '';
      const campaignTxt = [
        'AVLI Cloud campaign pack',
        `workspace_id: ${record.workspace_id}`,
        `plan: ${record.plan}`,
        `created_at: ${new Date().toISOString()}`,
        brief ? `brief: ${brief}` : '',
        '',
        'artifacts:',
        listed.length ? listed.join('\n') : '(none selected)',
        '',
      ].filter(line => line !== '').join('\n');
      files.unshift({ name: 'campaign.txt', bytes: Buffer.from(`${campaignTxt}\n`, 'utf8') });
      sendZip(res, buildStoreZip(files), `campaign-${workspaceShortId(record.workspace_id)}-pack.zip`);
      return;
    }

    if (parsed.pathname === '/v1/workspace/publish' && req.method === 'POST') {
      const { principal, store, record } = requireWorkspace(req);
      if (record.plan === 'campaign') {
        throw new HttpRequestError(
          403,
          'AUTHORIZATION_DENIED',
          'Campaign workspaces download a pack instead of sending to an audience',
        );
      }
      if (principal.role !== 'admin') {
        throw new HttpRequestError(
          403,
          'AUTHORIZATION_DENIED',
          'Only workspace admins can send to an audience',
        );
      }
      const body = requireRecord(await parseBody(req), 'request body');
      const hashes = requestedHashes(body, store.listArtifacts(record.workspace_id).map(item => item.sha256));
      const requestId = `request:publish-${crypto.randomUUID()}`;
      const artifacts = hashes.map(sha256 => ({
        sha256,
        delivery_url: `/v1/artifacts/${sha256}`,
      }));
      const payload = {
        request_id: requestId,
        workspace_id: record.workspace_id,
        plan: record.plan,
        artifacts,
        brief: typeof body.brief === 'string' ? body.brief : undefined,
      };
      const webhook = process.env.AVLI_PUBLISH_WEBHOOK_URL || '';
      let delivered = false;
      let executionId = null;
      if (webhook) {
        try {
          const posted = await postPublishWebhook(webhook, payload);
          delivered = posted.status >= 200 && posted.status < 300;
          try {
            const parsedBody = JSON.parse(posted.body);
            executionId = parsedBody.execution_id || parsedBody.id || null;
          } catch {
            executionId = null;
          }
        } catch {
          delivered = false;
        }
      }
      sendJson(res, 202, normalizeExecutionResult({
        accepted: true,
        delivered,
        request_id: requestId,
        execution_id: executionId,
        artifacts,
      }, { meta: { request_id: requestId } }));
      return;
    }

    if (parsed.pathname === '/v1/jobs' && req.method === 'GET') {
      const principal = req.l7Principal;
      tenantPrincipal(req);
      sendJson(res, 200, normalizeExecutionResult({
        jobs: jobCoordinator.list()
          .filter(job => jobVisibleTo(job, principal))
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
      const headerRequestId = req.headers['x-l7-request-id'];
      if (headerRequestId) {
        if (request.request_id && request.request_id !== headerRequestId) {
          throw new HttpRequestError(409, 'CONFLICT', 'X-L7-Request-Id does not match request_id');
        }
        request.request_id = headerRequestId;
      }
      const job = jobCoordinator.submit({ ...request, tenant_id: tenantId }, {
        workspaceId: req.l7Principal.workspaceId,
      });
      sendJson(res, 202, normalizeExecutionResult({ job: publicJob(job) }, {
        meta: { job_id: job.job_id },
      }));
      return;
    }

    if (parsed.pathname === '/v1/callbacks/jobs' && req.method === 'POST') {
      const raw = await parseBody(req);
      const signature = req.headers[SIGNATURE_HEADER];
      let verified = false;
      try {
        verified = verifyCallback(raw, signature);
      } catch (error) {
        throw new HttpRequestError(401, 'AUTHENTICATION_REQUIRED', error.message);
      }
      if (!verified) {
        throw new HttpRequestError(401, 'AUTHENTICATION_REQUIRED', 'Invalid callback HMAC');
      }
      const jobId = raw.job_id;
      const existing = jobId ? jobCoordinator.get(jobId) : null;
      if (!existing) {
        throw new HttpRequestError(404, 'NOT_FOUND', 'Callback job not found');
      }
      sendJson(res, 200, normalizeExecutionResult({
        job: publicJob(existing),
        accepted: true,
      }, { meta: { job_id: existing.job_id } }));
      return;
    }

    const jobRoute = parsed.pathname.match(/^\/v1\/jobs\/([^/]+)(?:\/(cancel))?$/);
    if (jobRoute) {
      const jobId = decodeURIComponent(jobRoute[1]);
      const action = jobRoute[2];
      if (!action && req.method === 'GET') {
        const job = visibleJob(req, jobId);
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
        const visible = visibleJob(req, jobId);
        const job = visible ? jobCoordinator.cancel(jobId) : null;
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

    if (parsed.pathname === '/api/media/dream-cycle' && req.method === 'GET') {
      const domains = require('./lib/domains');
      sendJson(res, 200, {
        ...domains.morphState,
        approval_required: Boolean(domains.morphLocked),
      });
      return;
    }

    if (parsed.pathname === '/api/media/dream-cycle/approve' && req.method === 'POST') {
      const body = requireRecord(await parseBody(req), 'request body');
      if (body.approved !== true) {
        throw new HttpRequestError(400, 'APPROVAL_REQUIRED', 'Explicit dream-cycle approval is required');
      }
      const domains = require('./lib/domains');
      const approved = domains.morphLocked ? domains.approveDreamCycle() : false;
      sendJson(res, 200, {
        approved,
        ...domains.morphState,
        approval_required: Boolean(domains.morphLocked),
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
      const plan = body.plan || createMorphicPlan(body.request || body);
      const risk = classifyMediaRisk(plan, mediaRunner.executionMode);
      const runId = `run-${plan.id.slice(6)}`;
      const existing = mediaCoordinator.get(runId);
      if (existing && ['crystallized', 'staged', 'released'].includes(existing.state)) {
        sendJson(res, 202, existing);
        return;
      }
      if (risk.risk === 'unknown') {
        throw new HttpRequestError(400, 'INVALID_MEDIA_PLAN', risk.reason);
      }
      const domains = require('./lib/domains');
      let automaticallyApproved = false;
      if (
        domains.morphLocked
        && risk.automatic_cycle_approval
        && existing?.state !== 'crystallized'
      ) {
        domains.approveDreamCycle();
        automaticallyApproved = true;
      }
      if (domains.morphLocked && !risk.automatic_cycle_approval) {
        throw new HttpRequestError(409, 'APPROVAL_REQUIRED', 'Explicit approval is required for this media operation');
      }
      const policy = {
        ...risk,
        decision: automaticallyApproved ? 'automatic' : domains.morphLocked ? 'explicit-required' : 'not-required',
        decided_at: new Date().toISOString(),
      };
      let run = mediaCoordinator.submit(plan, { policy });
      if (
        automaticallyApproved
        && run.state === 'failed'
        && /MORPH LOCKED/.test(run.error?.message || '')
      ) {
        run = mediaCoordinator.resume(run.id, { policy });
      }
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

module.exports = { requestHandler, server, start, jobCoordinator, mediaCoordinator };

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: serve.js | Body-Hash: SHA-256:ae5a29c4e93b2520e1fecd54b33c1fdaa45a67f5a1626c8edbfdc4b503e1438a
// Chain-Hash: SHA-256:a782b44e1ffd235b3bb293f6cc4426914a78ec5dd1b668f8c93b5a44b3200035 | Signed: 2026-03-01T15:09:50.006072+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 5 works. Verify: python3 provenance.py verify serve.js
// L7:PROVENANCE
