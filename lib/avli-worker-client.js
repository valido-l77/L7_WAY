'use strict';

const http = require('http');
const https = require('https');
const { CONTRACT_VERSIONS } = require('./contracts');
const { signCallback } = require('./callback-hmac');

function workerConfig(options = {}) {
  return {
    baseUrl: String(options.baseUrl || process.env.AVLI_WORKER_URL || '').replace(/\/$/, ''),
    token: options.token || process.env.AVLI_WORKER_SERVICE_TOKEN || '',
    callbackUrl: options.callbackUrl || process.env.L7_CALLBACK_URL || '',
    callbackSecret: options.callbackSecret || process.env.L7_CALLBACK_HMAC_SECRET || '',
    callbackKeyId: options.callbackKeyId || process.env.L7_CALLBACK_KEY_ID || 'callback:primary',
    pollMs: Number(options.pollMs) || 50,
  };
}

function workerConfigured(options = {}) {
  const config = workerConfig(options);
  return Boolean(config.baseUrl && config.token);
}

function requestJson(config, method, pathname, body, extraHeaders = {}, timeoutMs = 2000) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const url = new URL(`${config.baseUrl}${pathname}`);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      timeout: timeoutMs,
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...extraHeaders,
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (error) {
          error.status = res.statusCode;
          reject(error);
          return;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      const error = new Error('AVLI worker request timed out');
      error.code = 'L7_TIMEOUT';
      reject(error);
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function trustedHeaders(request) {
  return {
    'x-l7-request-id': request.request_id,
    'x-l7-tenant-id': request.tenant_id,
    'x-l7-contract-version': CONTRACT_VERSIONS.workerJobRequest,
  };
}

async function workerHealth(options = {}) {
  const config = workerConfig(options);
  if (!workerConfigured(config)) return { available: false, capabilities: [] };
  try {
    const [health, capabilities] = await Promise.all([
      requestJson(config, 'GET', '/internal/v1/health', undefined, {
        'x-l7-request-id': 'request:health',
        'x-l7-tenant-id': 'tenant:gateway',
        'x-l7-contract-version': CONTRACT_VERSIONS.workerJobRequest,
      }),
      requestJson(config, 'GET', '/internal/v1/capabilities', undefined, {
        'x-l7-request-id': 'request:capabilities',
        'x-l7-tenant-id': 'tenant:gateway',
        'x-l7-contract-version': CONTRACT_VERSIONS.workerJobRequest,
      }),
    ]);
    return {
      available: health.status === 200,
      capabilities: capabilities.body?.capabilities || [],
    };
  } catch {
    return { available: false, capabilities: [] };
  }
}

async function executeOnWorker(request, context = {}, options = {}) {
  const config = workerConfig(options);
  if (!workerConfigured(config)) {
    const error = new Error('AVLI worker is not configured');
    error.code = 'L7_NOT_FOUND';
    throw error;
  }

  const jobRequest = {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: request.request_id,
    tenant_id: request.tenant_id,
    capability: request.capability,
    input: request.input || {},
    privacy_class: request.privacy_class || 'internal',
    deadline: request.deadline,
  };
  if (config.callbackUrl && config.callbackSecret) {
    jobRequest.callback = {
      url: config.callbackUrl,
      key_id: config.callbackKeyId,
    };
    jobRequest.metadata = {
      callback_signature: signCallback(jobRequest, config.callbackSecret),
    };
  }

  const submitted = await requestJson(
    config,
    'POST',
    '/internal/v1/jobs',
    jobRequest,
    trustedHeaders(request),
  );
  if (submitted.status === 401) {
    const error = new Error('AVLI worker rejected the service token');
    error.code = 'AUTHENTICATION_REQUIRED';
    throw error;
  }
  if (submitted.status >= 400) {
    const error = new Error(submitted.body?.error?.message || 'AVLI worker job failed');
    error.code = submitted.status === 409 ? 'L7_CONFLICT' : 'L7_VALIDATION_ERROR';
    throw error;
  }

  const jobId = submitted.body.job_id;
  if (!/^job:[a-f0-9]{24}$/.test(String(jobId || ''))) {
    const error = new Error('AVLI worker did not return a canonical job id');
    error.code = 'PROVIDER_FAILURE';
    throw error;
  }
  // Worker routes match `job:` literally. Encoding the colon as %3A 404s the status poll.
  const jobPath = `/internal/v1/jobs/${jobId}`;
  const started = Date.now();
  while (Date.now() - started < (context.timeout || 30_000)) {
    if (context.signal?.aborted) {
      await requestJson(config, 'POST', `${jobPath}/cancel`, {}, trustedHeaders(request));
      const error = new Error('Job cancelled');
      error.code = 'L7_CANCELLED';
      throw error;
    }
    const current = await requestJson(
      config,
      'GET',
      jobPath,
      undefined,
      trustedHeaders(request),
    );
    const job = current.body;
    if (job?.state === 'succeeded') {
      return { result: job.result, artifacts: job.artifacts || [] };
    }
    if (job?.state === 'failed' || job?.state === 'cancelled') {
      const error = new Error(job.error?.message || `AVLI worker job ${job.state}`);
      error.code = job.state === 'cancelled' ? 'L7_CANCELLED' : 'PROVIDER_FAILURE';
      throw error;
    }
    if (typeof context.onProgress === 'function') context.onProgress(Number(job?.progress) || 0);
    await new Promise(resolve => setTimeout(resolve, config.pollMs));
  }
  const error = new Error('AVLI worker job timed out');
  error.code = 'L7_TIMEOUT';
  throw error;
}

module.exports = {
  executeOnWorker,
  workerConfigured,
  workerConfig,
  workerHealth,
};
