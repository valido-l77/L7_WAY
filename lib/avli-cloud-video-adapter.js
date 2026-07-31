'use strict';

const crypto = require('crypto');
const { renderFluxVideo } = require('./flux-video-adapter');
const { renderFluxFinish } = require('./flux-video-adapter');
const { renderAvliClusterFinish } = require('./avli-cluster-video-adapter');

const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';
const CLOUD_DURATIONS = Object.freeze([6, 8, 10, 12, 14, 16, 18, 20]);

function cancellationError() {
  const error = new Error('media run cancelled');
  error.code = 'L7_CANCELLED';
  return error;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancellationError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(cancellationError());
    }, { once: true });
  });
}

function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const outerSignal = options.signal;
  const abort = () => controller.abort();
  outerSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abort);
  });
}

function findVideoDescriptor(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.filename === 'string' && /\.mp4$/i.test(value.filename)) return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const match = findVideoDescriptor(item);
        if (match) return match;
      }
    } else {
      const match = findVideoDescriptor(child);
      if (match) return match;
    }
  }
  return null;
}

class AvliCloudVideoClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.AVLI_COMFY_URL || DEFAULT_COMFY_URL).replace(/\/$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    this.pollMs = Number(options.pollMs) || 1000;
    this.timeoutMs = Number(options.timeoutMs || process.env.AVLI_VIDEO_CLOUD_TIMEOUT_MS) || 20 * 60 * 1000;
    if (typeof this.fetch !== 'function') throw new Error('AVLI Cloud video requires fetch');
  }

  async resources() {
    try {
      const [statsResponse, ltxResponse, modelsResponse] = await Promise.all([
        fetchWithTimeout(this.fetch, `${this.baseUrl}/system_stats`),
        fetchWithTimeout(this.fetch, `${this.baseUrl}/object_info/LtxvApiImageToVideo`),
        fetchWithTimeout(this.fetch, `${this.baseUrl}/models/diffusion_models`),
      ]);
      if (!statsResponse.ok || !ltxResponse.ok || !modelsResponse.ok) throw new Error('resource probe failed');
      const stats = await statsResponse.json();
      const ltx = await ltxResponse.json();
      const models = await modelsResponse.json();
      const device = stats.devices?.[0] || {};
      return {
        state: 'connected',
        endpoint: this.baseUrl,
        engine: 'ComfyUI',
        version: stats.system?.comfyui_version || null,
        device: device.name || device.type || null,
        unified_memory_bytes: device.vram_total || stats.system?.ram_total || null,
        ltx_cloud_available: Boolean(ltx.LtxvApiImageToVideo),
        local_video_models: Array.isArray(models) ? models : [],
        cloud_execution_enabled: process.env.AVLI_VIDEO_ENGINE === 'comfy-cloud',
      };
    } catch (error) {
      return {
        state: 'offline',
        endpoint: this.baseUrl,
        error: error.message,
        ltx_cloud_available: false,
        local_video_models: [],
        cloud_execution_enabled: false,
      };
    }
  }

  async uploadImage(bytes, extension, signal) {
    const name = `avli-below-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension || 'png'}`;
    const form = new FormData();
    form.append('image', new Blob([bytes]), name);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const response = await fetchWithTimeout(this.fetch, `${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: form,
      signal,
    }, 60_000);
    if (!response.ok) throw new Error(`AVLI Cloud rejected BELOW upload: HTTP ${response.status}`);
    const uploaded = await response.json();
    return uploaded.name || name;
  }

  workflow(imageName, job) {
    const duration = Number(job.input.duration_seconds);
    if (!CLOUD_DURATIONS.includes(duration)) {
      throw new Error(`LTX-2 Pro supports durations: ${CLOUD_DURATIONS.join(', ')}`);
    }
    return {
      1: {
        class_type: 'LoadImage',
        inputs: { image: imageName },
      },
      2: {
        class_type: 'LtxvApiImageToVideo',
        inputs: {
          image: ['1', 0],
          model: 'LTX-2 (Pro)',
          prompt: job.input.prompt,
          duration,
          resolution: '1920x1080',
          fps: 25,
          generate_audio: false,
        },
      },
      3: {
        class_type: 'SaveVideo',
        inputs: {
          video: ['2', 0],
          filename_prefix: `avli/${job.id.replace(/[^a-z0-9._-]/gi, '-')}`,
          format: 'mp4',
          codec: 'h264',
        },
      },
    };
  }

  async generate(image, job, signal) {
    const imageName = await this.uploadImage(image.bytes, image.metadata?.extension, signal);
    const clientId = `avli-${crypto.randomUUID()}`;
    const response = await fetchWithTimeout(this.fetch, `${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: this.workflow(imageName, job), client_id: clientId }),
      signal,
    }, 60_000);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AVLI Cloud LTX submission failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }
    const queued = await response.json();
    if (!queued.prompt_id) throw new Error('AVLI Cloud did not return a prompt id');

    const deadline = Date.now() + this.timeoutMs;
    let descriptor = null;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw cancellationError();
      const historyResponse = await fetchWithTimeout(
        this.fetch,
        `${this.baseUrl}/history/${encodeURIComponent(queued.prompt_id)}`,
        { signal },
      );
      if (!historyResponse.ok) throw new Error(`AVLI Cloud history failed: HTTP ${historyResponse.status}`);
      const history = await historyResponse.json();
      const record = history[queued.prompt_id];
      if (record?.status?.status_str === 'error' || record?.status?.completed === false && record?.status?.messages?.some(item => item[0] === 'execution_error')) {
        throw new Error(`AVLI Cloud LTX execution failed for ${queued.prompt_id}`);
      }
      descriptor = findVideoDescriptor(record?.outputs);
      if (descriptor) break;
      await delay(this.pollMs, signal);
    }
    if (!descriptor) throw new Error(`AVLI Cloud LTX timed out after ${this.timeoutMs}ms`);

    const query = new URLSearchParams({
      filename: descriptor.filename,
      subfolder: descriptor.subfolder || '',
      type: descriptor.type || 'output',
    });
    const videoResponse = await fetchWithTimeout(
      this.fetch,
      `${this.baseUrl}/view?${query}`,
      { signal },
      120_000,
    );
    if (!videoResponse.ok) throw new Error(`AVLI Cloud video download failed: HTTP ${videoResponse.status}`);
    return {
      bytes: Buffer.from(await videoResponse.arrayBuffer()),
      promptId: queued.prompt_id,
      descriptor,
    };
  }
}

async function renderAvliCloudVideo(job, context, options = {}) {
  const selectedId = context.selection?.selected_candidate_ids?.[0];
  const selected = selectedId && context.dependencies?.[selectedId];
  if (!selected) throw new Error(`${job.id} requires a selected BELOW candidate`);
  if (typeof context.loadAsset !== 'function') throw new Error('AVLI Cloud video requires local asset access');
  const grounded = await context.loadAsset(selected.content_hash);
  if (!grounded?.bytes?.length) throw new Error('AVLI Cloud could not load selected BELOW asset');
  const client = options.client || new AvliCloudVideoClient(options);
  const generated = await client.generate(grounded, job, context.signal);
  return {
    bytes: generated.bytes,
    mediaType: 'video/mp4',
    extension: 'mp4',
    provider: 'avli-cloud',
    model: 'LTX-2 Pro',
    modelVersion: 'comfy-api',
    providerRequestId: generated.promptId,
    confirmedSeed: null,
    cost: { currency: 'USD', estimated: Number((0.06 * job.input.duration_seconds).toFixed(2)) },
    output: {
      keyframe_receipts: [{
        candidate_id: selected.job_id,
        asset_uri: selected.asset_uri,
        content_hash: selected.content_hash,
        model_receipt: selected.model_receipt,
      }],
      synthesis: {
        pipeline: 'avli-cloud-ltx2-pro',
        resolution: '1920x1080',
        fps: 25,
        duration_seconds: job.input.duration_seconds,
        conditioned_on: selected.content_hash,
        cloud_artifact: generated.descriptor,
      },
    },
  };
}

async function renderBestAvailableVideo(job, context, options = {}) {
  const engine = options.engine || process.env.AVLI_VIDEO_ENGINE || 'auto';
  if (engine === 'comfy-cloud') return renderAvliCloudVideo(job, context, options);
  if (engine === 'auto' || engine === 'native' || engine === 'cluster') {
    return renderFluxVideo(job, context, options);
  }
  throw new Error(`unsupported AVLI video engine: ${engine}`);
}

async function renderBestAvailableFinish(job, context, options = {}) {
  const engine = options.engine || process.env.AVLI_VIDEO_ENGINE || 'auto';
  if (engine === 'cluster') return renderAvliClusterFinish(job, context, options);
  if (engine === 'auto' || engine === 'native' || engine === 'comfy-cloud') {
    return renderFluxFinish(job, context, options);
  }
  throw new Error(`unsupported AVLI video engine: ${engine}`);
}

module.exports = {
  DEFAULT_COMFY_URL,
  CLOUD_DURATIONS,
  findVideoDescriptor,
  AvliCloudVideoClient,
  renderAvliCloudVideo,
  renderBestAvailableVideo,
  renderBestAvailableFinish,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/avli-cloud-video-adapter.js | Body-Hash: SHA-256:6c7a78e4527cf2bdb3ad21a405addab93ce8ff7ed23746b122a0ba43ae6be788
// Chain-Hash: SHA-256:905d02d97a73013e9fb4cd8d77a8075f3a5702e06cc6ecbe8644ba9d79318905 | Signed: 2026-07-28T15:51:22.619924+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 66 works. Verify: python3 provenance.py verify lib/avli-cloud-video-adapter.js