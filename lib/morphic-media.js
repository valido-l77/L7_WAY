'use strict';

/**
 * L7 Morphic Media planner.
 *
 * Turns one creative intention into exactly three bounded generation layers:
 * ABOVE (propose), MIRROR (challenge), BELOW (ground). The result is a
 * provider-neutral job graph. Nothing is written to .morph or .salt here;
 * persistence remains the Gateway's responsibility.
 */

const crypto = require('crypto');
const { CONTRACT_VERSIONS } = require('./contracts');

const PLAN_VERSION = 'l7-morphic-media/1.0';
const MODES = new Set(['image', 'video']);
const RATIOS = new Set(['16:9', '1:1', '9:16', '4:5']);
const LAYERS = Object.freeze([
  { depth: 1, name: 'ABOVE', symbol: '△', color: 'gold', purpose: 'propose' },
  { depth: 2, name: 'MIRROR', symbol: '◇', color: 'silver', purpose: 'challenge' },
  { depth: 3, name: 'BELOW', symbol: '▽', color: 'copper', purpose: 'ground' },
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function hashUnit(text, index) {
  const bytes = crypto.createHash('sha256').update(`${index}:${text}`).digest();
  return bytes.readUInt32BE(0) / 0xffffffff;
}

function normalizeRequest(input) {
  assertPlainObject(input, 'request');
  const brief = String(input.brief || '').trim();
  if (!brief) throw new Error('brief is required');
  if (brief.length > 4000) throw new Error('brief must be 4000 characters or fewer');

  const mode = String(input.mode || 'image').toLowerCase();
  if (!MODES.has(mode)) throw new Error('mode must be image or video');
  const ratio = String(input.ratio || '16:9');
  if (!RATIOS.has(ratio)) throw new Error(`unsupported ratio: ${ratio}`);

  const duration = mode === 'video' ? clamp(Number(input.duration) || 10, 1, 120) : 0;
  const seed = (Number(input.seed) || 0) >>> 0;
  const astrocyte = clamp(Number.isFinite(Number(input.astrocyte)) ? Number(input.astrocyte) : 0.42, 0, 0.99);

  return {
    contract_version: CONTRACT_VERSIONS.mediaRequest,
    brief,
    mode,
    ratio,
    duration,
    seed,
    astrocyte,
    style: String(input.style || 'cinematic').trim() || 'cinematic',
    negative: String(input.negative || '').trim(),
    identity: String(input.identity || brief).trim(),
    candidates: clamp(Math.round(Number(input.candidates) || 3), 1, 8),
  };
}

/**
 * Doctrine-compatible complex creative coordinate. Ten real dimensions hold
 * what is specified; the nodal axis modulates the ten imaginary components
 * that represent allowed variation. This does not claim physical meaning.
 */
function deriveComplexCoordinate(request) {
  const source = stableStringify(request);
  const real = Array.from({ length: 10 }, (_, i) => Number((hashUnit(source, i) * 10).toFixed(4)));
  const caput = Number((hashUnit(source, 10) * 10).toFixed(4));
  const cauda = Number((10 - caput).toFixed(4));
  const gamma = Number((1 / Math.sqrt(1 - request.astrocyte ** 2)).toFixed(6));
  const imaginary = real.map((value, i) => {
    const nodalPhase = i % 2 === 0 ? caput : -cauda;
    return Number((nodalPhase * request.astrocyte * gamma * (0.5 + value / 20)).toFixed(4));
  });
  return { real, imaginary, nodal_axis: { caput, cauda }, astrocyte: request.astrocyte, gamma };
}

function imageJob(id, prompt, seed, request, dependencies = []) {
  return {
    contract_version: CONTRACT_VERSIONS.mediaJob,
    id,
    capability: 'image.generate',
    adapter: 'avli.image',
    dependencies,
    input: {
      prompt,
      negative_prompt: request.negative,
      aspect_ratio: request.ratio,
      seed: seed >>> 0,
      candidates: 1,
    },
    output: { media: 'image', required: ['asset_uri', 'content_hash', 'model_receipt'] },
  };
}

function candidateId(family, index) {
  return `${family}.c${String(index + 1).padStart(2, '0')}`;
}

function candidateSeed(seed, index) {
  return (seed + index * 42) >>> 0;
}

function imageCandidates(family, prompt, seed, request, dependencyFamilies = []) {
  return Array.from({ length: request.candidates }, (_, index) => {
    const job = imageJob(
      candidateId(family, index),
      prompt,
      candidateSeed(seed, index),
      request,
      dependencyFamilies.map(name => candidateId(name, index)),
    );
    job.input.candidate_index = index + 1;
    job.input.candidate_count = request.candidates;
    return job;
  });
}

function aboveLayer(request) {
  const prompt = `${request.brief}. Visual language: ${request.style}. Preserve this identity kernel: ${request.identity}.`;
  return {
    ...LAYERS[0],
    invariant: request.identity,
    question: 'What is the strongest direct manifestation of the intention?',
    jobs: imageCandidates('above.keyframes', prompt, request.seed, request),
  };
}

function mirrorLayer(request) {
  // XOR with 63 traverses the 42/21 alternating complement boundary.
  const mirrorSeed = (request.seed ^ 63) >>> 0;
  const prompt = `${request.brief}. Keep the subject identity invariant, but generate a counterfactual view: reverse viewpoint, light direction, figure/ground hierarchy, and emotional polarity. Avoid a literal negative image. Style: ${request.style}.`;
  return {
    ...LAYERS[1],
    invariant: request.identity,
    question: 'Which assumptions can change without destroying identity?',
    jobs: imageCandidates(
      'mirror.counterfactuals',
      prompt,
      mirrorSeed,
      request,
      ['above.keyframes'],
    ),
    complement: { source_seed: request.seed, mirror_seed: mirrorSeed, boundary: 63 },
  };
}

function videoAnchors(duration) {
  const residual = 5 / 360;
  return [0, 1 / 3, 2 / 3, 1].map((phase, index) => ({
    index,
    phase: Number(phase.toFixed(6)),
    second: Number((duration * phase).toFixed(3)),
    spiral_phase: Number(((phase + residual * index) % 1).toFixed(6)),
  }));
}

function belowLayer(request) {
  const groundingPrompt = `${request.brief}. Reconcile the strongest ABOVE proposal with the strongest MIRROR counterfactual. Preserve identity, geometry, palette logic, and material continuity. Remove accidental novelty. Style: ${request.style}.`;
  const jobs = imageCandidates(
    'below.canonical',
    groundingPrompt,
    request.seed ^ 42,
    request,
    ['above.keyframes', 'mirror.counterfactuals'],
  );
  const canonicalCandidates = jobs.map(job => job.id);

  if (request.mode === 'video') {
    jobs.push({
      contract_version: CONTRACT_VERSIONS.mediaJob,
      id: 'below.motion',
      capability: 'video.generate',
      adapter: 'avli.video',
      dependencies: canonicalCandidates,
      input: {
        prompt: `${groundingPrompt} Animate by changing state and camera intentionally; do not let the subject identity drift.`,
        reference_layer: 'BELOW',
        reference_candidates: canonicalCandidates,
        duration_seconds: request.duration,
        aspect_ratio: request.ratio,
        seed: (request.seed ^ 21) >>> 0,
        anchors: videoAnchors(request.duration),
      },
      output: { media: 'video', required: ['asset_uri', 'content_hash', 'model_receipt', 'keyframe_receipts'] },
    });
    jobs.push({
      contract_version: CONTRACT_VERSIONS.mediaJob,
      id: 'below.finish',
      capability: 'video.finish',
      adapter: 'l7.flux',
      tool_chain: ['flux_tempo', 'flux_render', 'flux_splice'],
      dependencies: ['below.motion'],
      input: { source_job: 'below.motion', temporal_echo: 0.21, continuity_lock: true },
      output: { media: 'video', required: ['asset_uri', 'edit_decision_list', 'content_hash'] },
    });
  }

  return {
    ...LAYERS[2],
    invariant: request.identity,
    question: 'What survives when the idea must obey continuity and consequence?',
    jobs,
  };
}

function createMorphicPlan(input) {
  const request = normalizeRequest(input);
  const coordinate = deriveComplexCoordinate(request);
  const layers = [aboveLayer(request), mirrorLayer(request), belowLayer(request)];
  const planCore = {
    contract_version: CONTRACT_VERSIONS.mediaPlan,
    version: PLAN_VERSION,
    request,
    coordinate,
    layers,
  };
  const planId = `morph-${digest(planCore).slice(0, 16)}`;

  return {
    id: planId,
    ...planCore,
    horizon: {
      state: 'awaiting_generation',
      candidate_limit: 42,
      collapse_rule: 'rank candidates by weighted score; the Philosopher selects the release',
      score: {
        identity_fidelity: 0.32,
        prompt_fidelity: 0.21,
        temporal_coherence: request.mode === 'video' ? 0.21 : 0,
        counterfactual_value: request.mode === 'video' ? 0.13 : 0.26,
        technical_quality: request.mode === 'video' ? 0.13 : 0.21,
      },
    },
    crystallization: {
      automatic_after_completed_layers: 3,
      target_domain: '.salt',
      scope: 'all layer artifacts and model receipts',
      requires: ['content_hashes', 'model_receipts'],
      locks_cycle: true,
    },
    release: {
      requires: ['selected_asset', 'human_approval'],
      unlocks_new_cycle: false,
    },
    provenance: {
      creator: 'Alberto Valido Delgado',
      system: 'L7 WAY / AVLI Cloud',
      plan_hash: digest(planCore),
    },
  };
}

module.exports = {
  PLAN_VERSION,
  LAYERS,
  normalizeRequest,
  deriveComplexCoordinate,
  videoAnchors,
  createMorphicPlan,
  stableStringify,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/morphic-media.js | Body-Hash: SHA-256:38a82160ac4ec0995171f0254473ae5b64bebf731354225abdba6bc548b44c34
// Chain-Hash: SHA-256:fdcd76027b22d408b9aec05f36531d21d2a34aecc71f2cbeb5794be908d43daf | Signed: 2026-07-20T00:35:48.038404+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 46 works. Verify: python3 provenance.py verify lib/morphic-media.js
// L7:PROVENANCE
