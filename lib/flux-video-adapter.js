'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { dimensionsForRatio } = require('./ssd-image-adapter');

const DEFAULT_SWIFT = process.env.AVLI_VIDEO_SWIFT || '/usr/bin/swift';
const VIDEO_SCRIPT = path.join(__dirname, '..', 'scripts', 'flux_video.swift');
const MP4_FTYP = Buffer.from('ftyp');

function assertMp4(bytes, label = 'Flux renderer') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || !bytes.subarray(0, 32).includes(MP4_FTYP)) {
    throw new Error(`${label} returned an invalid MP4`);
  }
}

function selectedDependency(job, context) {
  const selectedId = context.selection?.selected_candidate_ids?.[0];
  if (!selectedId) throw new Error(`${job.id} requires a selected BELOW candidate`);
  const receipt = context.dependencies?.[selectedId];
  if (!receipt) throw new Error(`${job.id} cannot resolve selected BELOW candidate ${selectedId}`);
  return receipt;
}

async function loadDependency(context, receipt, label) {
  if (typeof context.loadAsset !== 'function') {
    throw new Error(`${label} requires local content-addressed asset access`);
  }
  const asset = await context.loadAsset(receipt.content_hash);
  if (!asset?.bytes?.length) throw new Error(`${label} could not load ${receipt.content_hash}`);
  return asset;
}

function runNative(args, signal, options = {}) {
  const command = options.swift || DEFAULT_SWIFT;
  const script = options.script || VIDEO_SCRIPT;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [script, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    const errors = [];
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr.on('data', chunk => errors.push(chunk));
    child.once('error', reject);
    child.once('exit', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(Object.assign(new Error('media run cancelled'), { code: 'L7_CANCELLED' }));
      } else if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Flux video process stopped (${code})`));
      } else {
        resolve();
      }
    });
  });
}

async function withTempDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-flux-'));
  try {
    return await callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function renderFluxVideo(job, context, options = {}) {
  const selected = selectedDependency(job, context);
  const grounded = await loadDependency(context, selected, 'video.generate');
  const dimensions = dimensionsForRatio(job.input.aspect_ratio);
  const fps = Number(options.fps || process.env.AVLI_VIDEO_FPS) || 30;
  const profileNames = ['monumental-push', 'aerial-reveal', 'horizon-orbit'];
  const baseProfile = (job.input.seed >>> 0) % profileNames.length;
  const cameraProfiles = Array.from(
    { length: 3 },
    (_, index) => profileNames[(baseProfile + index) % profileNames.length],
  );
  const duration = job.input.duration_seconds;
  const bytes = await withTempDirectory(async directory => {
    const inputPath = path.join(directory, `grounded.${grounded.metadata?.extension || 'png'}`);
    const outputPath = path.join(directory, 'motion.mp4');
    fs.writeFileSync(inputPath, grounded.bytes);
    await (options.runNative || runNative)([
      'generate', inputPath, outputPath,
      String(dimensions.width), String(dimensions.height),
      String(job.input.duration_seconds), String(fps), String(job.input.seed >>> 0),
    ], context.signal, options);
    return fs.readFileSync(outputPath);
  });
  assertMp4(bytes);
  return {
    bytes,
    mediaType: 'video/mp4',
    extension: 'mp4',
    provider: 'avli-local',
    model: 'avli-flux-motion',
    modelVersion: '1.1.0',
    confirmedSeed: job.input.seed >>> 0,
    output: {
      keyframe_receipts: [{
        candidate_id: selected.job_id,
        asset_uri: selected.asset_uri,
        content_hash: selected.content_hash,
        model_receipt: selected.model_receipt,
      }],
      synthesis: {
        pipeline: 'flux_tempo',
        codec: 'h264',
        container: 'mp4',
        fps,
        width: dimensions.width,
        height: dimensions.height,
        duration_seconds: duration,
        anchors: job.input.anchors,
        camera: `chained:${cameraProfiles.join('>')}`,
        shot_chain: [
          { shot: 'establish', camera: cameraProfiles[0], in: 0, out: Number((duration / 3).toFixed(3)), transition: 'dissolve' },
          { shot: 'transform', camera: cameraProfiles[1], in: Number((duration / 3).toFixed(3)), out: Number((duration * 2 / 3).toFixed(3)), transition: 'dissolve' },
          { shot: 'resolve', camera: cameraProfiles[2], in: Number((duration * 2 / 3).toFixed(3)), out: duration, transition: 'hold' },
        ],
        parallax: 'architecture-water-multiplane',
        temporal_echo: 0.21,
        finish_grade: 'teal-copper-bloom-vignette',
      },
    },
  };
}

async function renderFluxFinish(job, context, options = {}) {
  const source = context.dependencies?.[job.input.source_job];
  if (!source) throw new Error(`${job.id} cannot resolve ${job.input.source_job}`);
  const motion = await loadDependency(context, source, 'video.finish');
  const bytes = await withTempDirectory(async directory => {
    const inputPath = path.join(directory, 'motion.mp4');
    const outputPath = path.join(directory, 'finished.mp4');
    fs.writeFileSync(inputPath, motion.bytes);
    await (options.runNative || runNative)(['finish', inputPath, outputPath], context.signal, options);
    return fs.readFileSync(outputPath);
  });
  assertMp4(bytes);
  return {
    bytes,
    mediaType: 'video/mp4',
    extension: 'mp4',
    provider: 'l7-local',
    model: 'l7-flux-finish',
    modelVersion: '1.1.0',
    output: {
      edit_decision_list: [
        { operation: 'flux_tempo', source_job: job.input.source_job, continuity_lock: job.input.continuity_lock },
        { operation: 'flux_render', temporal_echo: job.input.temporal_echo, deterministic_grade: 'copper-blue-breath' },
        { operation: 'flux_splice', in: 0, out: source.synthesis?.duration_seconds ?? null, container: 'mp4' },
      ],
    },
  };
}

module.exports = {
  DEFAULT_SWIFT,
  VIDEO_SCRIPT,
  assertMp4,
  selectedDependency,
  runNative,
  renderFluxVideo,
  renderFluxFinish,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/flux-video-adapter.js | Body-Hash: SHA-256:cecbd906e61f49c9dfc302271f32fee169708636e9b37ec9324d6fe5f79b8b85
// Chain-Hash: SHA-256:f1dc4ed8408f6da2daa144e4e777e887abfcc87caf410db545868dbbe0e70f50 | Signed: 2026-07-28T15:51:22.762397+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 70 works. Verify: python3 provenance.py verify lib/flux-video-adapter.js