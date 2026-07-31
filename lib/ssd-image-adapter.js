'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEFAULT_MODEL = 'segmind/SSD-1B';
const DEFAULT_VAE = 'madebyollin/sdxl-vae-fp16-fix';
const DEFAULT_PYTHON = path.join(os.homedir(), '.l7', 'runtime', 'ssd1b', 'bin', 'python3');
const DEFAULT_HF_HOME = path.join(os.homedir(), '.l7', 'models', 'huggingface');
const WORKER_SCRIPT = path.join(__dirname, '..', 'scripts', 'ssd_image_worker.py');
const SUPPORTED_RATIOS = Object.freeze({
  '16:9': Object.freeze({ width: 768, height: 432 }),
  '1:1': Object.freeze({ width: 768, height: 768 }),
  '9:16': Object.freeze({ width: 432, height: 768 }),
  '4:5': Object.freeze({ width: 608, height: 760 }),
});

function dimensionsForRatio(ratio) {
  const selected = SUPPORTED_RATIOS[String(ratio || '16:9')];
  if (!selected) throw new Error(`SSD-1B does not support aspect ratio: ${ratio}`);
  return { ...selected };
}

function cacheDirectoryForModel(hfHome, model) {
  return path.join(hfHome, 'hub', `models--${String(model).replace(/\//g, '--')}`, 'snapshots');
}

function containsFile(root, filename) {
  if (!fs.existsSync(root)) return false;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === filename) {
        try {
          if (fs.statSync(path.join(current, entry.name)).isFile()) return true;
        } catch {
          // Ignore broken snapshot links and continue inspecting the cache.
        }
      }
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
  return false;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function ssd1bReadiness(options = {}) {
  const python = options.python || process.env.AVLI_IMAGE_PYTHON || DEFAULT_PYTHON;
  const hfHome = options.hfHome || process.env.HF_HOME || DEFAULT_HF_HOME;
  const model = options.model || process.env.AVLI_IMAGE_MODEL || DEFAULT_MODEL;
  const vae = options.vae || process.env.AVLI_IMAGE_VAE || DEFAULT_VAE;
  const precision = options.precision || process.env.AVLI_IMAGE_PRECISION || 'float32';
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const modelPath = cacheDirectoryForModel(hfHome, model);
  const vaePath = cacheDirectoryForModel(hfHome, vae);
  const runtimeReady = isExecutable(python);
  const modelReady = containsFile(modelPath, 'model_index.json');
  const vaeReady = containsFile(vaePath, 'config.json');
  const missing = [];
  if (!runtimeReady) missing.push('runtime');
  if (!modelReady || !vaeReady) missing.push('model_cache');

  return {
    ready: missing.length === 0,
    probe_only: true,
    generation_started: false,
    model,
    runtime: { ready: runtimeReady, python },
    model_cache: {
      ready: modelReady && vaeReady,
      root: hfHome,
      model: { id: model, ready: modelReady, path: modelPath },
      vae: { id: vae, ready: vaeReady, path: vaePath },
    },
    device: {
      type: platform === 'darwin' && arch === 'arm64' ? 'mps' : 'cpu',
      precision,
    },
    supported_ratios: Object.entries(SUPPORTED_RATIOS).map(([ratio, dimensions]) => ({
      ratio,
      ...dimensions,
    })),
    missing,
  };
}

class SsdImageWorker {
  constructor(options = {}) {
    this.python = options.python || process.env.AVLI_IMAGE_PYTHON || DEFAULT_PYTHON;
    this.model = options.model || process.env.AVLI_IMAGE_MODEL || DEFAULT_MODEL;
    this.child = null;
    this.ready = null;
    this.pending = new Map();
    this.sequence = 0;
  }

  start() {
    if (this.ready) return this.ready;
    if (!fs.existsSync(this.python)) {
      throw new Error(`SSD-1B runtime is not installed at ${this.python}. Run scripts/install_ssd1b_model.sh`);
    }
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(this.python, [WORKER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          AVLI_IMAGE_MODEL: this.model,
          HF_HOME: process.env.HF_HOME || DEFAULT_HF_HOME,
          PYTORCH_ENABLE_MPS_FALLBACK: '1',
          PYTHONUNBUFFERED: '1',
        },
      });
      this.child = child;
      let settled = false;
      const failStart = error => {
        if (!settled) {
          settled = true;
          this.ready = null;
          reject(error);
        }
      };
      readline.createInterface({ input: child.stdout }).on('line', line => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.type === 'ready') {
          if (!settled) {
            settled = true;
            resolve(message);
          }
          return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error));
        else pending.resolve(message);
      });
      readline.createInterface({ input: child.stderr }).on('line', line => {
        process.stderr.write(`[SSD-1B] ${line}\n`);
      });
      child.once('error', failStart);
      child.once('exit', (code, signal) => {
        const error = new Error(`SSD-1B worker stopped (${signal || code})`);
        failStart(error);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.child = null;
        this.ready = null;
      });
    });
    return this.ready;
  }

  async generate(payload, signal) {
    await this.start();
    if (signal?.aborted) throw Object.assign(new Error('media run cancelled'), { code: 'L7_CANCELLED' });
    const id = `ssd-${process.pid}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        this.child?.kill('SIGTERM');
        reject(Object.assign(new Error('media run cancelled'), { code: 'L7_CANCELLED' }));
      };
      if (signal) signal.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: value => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: error => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      this.child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  }
}

const defaultWorker = new SsdImageWorker();

async function renderSsdImage(job, context, options = {}) {
  const worker = options.worker || defaultWorker;
  const dimensions = dimensionsForRatio(job.input.aspect_ratio);
  const result = await worker.generate({
    prompt: `${job.input.prompt}, high quality, detailed, cinematic composition`,
    negative_prompt: [
      job.input.negative_prompt,
      'low quality, blurry, distorted, malformed architecture, watermark, signature',
    ].filter(Boolean).join(', '),
    seed: job.input.seed >>> 0,
    width: dimensions.width,
    height: dimensions.height,
    steps: Number(process.env.AVLI_IMAGE_STEPS) || 20,
    guidance_scale: Number(process.env.AVLI_IMAGE_GUIDANCE) || 9,
  }, context.signal);
  const bytes = Buffer.from(result.image_base64, 'base64');
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('SSD-1B worker returned an invalid PNG');
  }
  if (bytes.length < 10_000) {
    throw new Error('SSD-1B worker returned a degenerate image; refusing to crystallize it');
  }
  return {
    bytes,
    mediaType: 'image/png',
    extension: 'png',
    provider: 'segmind-local',
    model: result.model_id || worker.model || DEFAULT_MODEL,
    modelVersion: result.model_revision || 'fp16',
    confirmedSeed: result.seed,
    output: {
      synthesis: {
        device: result.device,
        precision: result.precision,
        width: result.width,
        height: result.height,
        steps: result.steps,
        guidance_scale: result.guidance_scale,
      },
    },
  };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_VAE,
  DEFAULT_PYTHON,
  DEFAULT_HF_HOME,
  SUPPORTED_RATIOS,
  dimensionsForRatio,
  ssd1bReadiness,
  SsdImageWorker,
  renderSsdImage,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/ssd-image-adapter.js | Body-Hash: SHA-256:c1557f3bb01235e372e6d2a1e3e537e3062b57e277156550ac7fa7f1cbbcc0ef
// Chain-Hash: SHA-256:58a2c0d6ba0cca10dee9dc86d3f394abe57d7811ce1a428ea87d4fb5adbf29ac | Signed: 2026-07-24T05:00:23.910800+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 51 works. Verify: python3 provenance.py verify lib/ssd-image-adapter.js
// L7:PROVENANCE
