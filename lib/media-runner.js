'use strict';

const crypto = require('crypto');
const { createMorphicPlan, PLAN_VERSION, stableStringify } = require('./morphic-media');
const { createMediaStore } = require('./media-storage');
const { renderMorphicFieldImage } = require('./morphic-field-renderer');
const { renderSsdImage } = require('./ssd-image-adapter');
const { renderBestAvailableVideo, renderBestAvailableFinish } = require('./avli-cloud-video-adapter');
const { createDomainMediaLifecycle } = require('./media-lifecycle');
const { CONTRACT_VERSIONS } = require('./contracts');
const { registryFromHandlers } = require('./media-adapter-registry');

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function mockImage(job, context) {
  const hue = parseInt(context.plan.provenance.plan_hash.slice(0, 6), 16) % 360;
  const label = escapeXml(job.id);
  const prompt = escapeXml(job.input.prompt.slice(0, 180));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 62% 12%)"/><stop offset="1" stop-color="hsl(${(hue + 92) % 360} 58% 28%)"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="640" cy="340" r="190" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="3"/><text x="64" y="88" fill="white" font-family="system-ui" font-size="34">${label}</text><foreignObject x="64" y="520" width="1120" height="140"><div xmlns="http://www.w3.org/1999/xhtml" style="font:24px system-ui;color:rgba(255,255,255,.76)">${prompt}</div></foreignObject></svg>`;
  return { bytes: Buffer.from(svg), mediaType: 'image/svg+xml', extension: 'svg' };
}

function mockStructured(job, context) {
  const payload = {
    mock: true,
    capability: job.capability,
    job_id: job.id,
    plan_id: context.plan.id,
    dependencies: context.dependencies,
    selection: context.selection,
    input: job.input,
  };
  const output = job.capability === 'video.generate'
    ? { keyframe_receipts: context.dependencies }
    : job.capability === 'video.finish'
      ? { edit_decision_list: [{ source_job: job.input.source_job, temporal_echo: job.input.temporal_echo }] }
      : {};
  return {
    bytes: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`),
    mediaType: 'application/json',
    extension: 'json',
    output,
  };
}

function createMockAdapters() {
  return {
    'image.generate': mockImage,
    'video.generate': mockStructured,
    'video.finish': mockStructured,
  };
}

function createFieldAdapters() {
  return {
    'image.generate': renderMorphicFieldImage,
    'video.generate': renderBestAvailableVideo,
    'video.finish': renderBestAvailableFinish,
  };
}

function createSsdAdapters() {
  return {
    'image.generate': renderSsdImage,
    'video.generate': renderBestAvailableVideo,
    'video.finish': renderBestAvailableFinish,
  };
}

function validatePlan(plan) {
  if (!plan || plan.version !== PLAN_VERSION) throw new Error(`plan must use ${PLAN_VERSION}`);
  if (!plan.request) throw new Error('plan must contain a normalized request');

  const canonical = createMorphicPlan(plan.request);
  if (stableStringify(plan) !== stableStringify(canonical)) {
    throw new Error('plan does not match its canonical request, id, or provenance hash');
  }
  return plan;
}

function validateGenerated(job, generated) {
  if (!generated || (generated.bytes === undefined || generated.bytes === null)) {
    throw new Error(`${job.id} adapter did not return bytes`);
  }
  const bytes = Buffer.isBuffer(generated.bytes) ? generated.bytes : Buffer.from(generated.bytes);
  if (bytes.length === 0) throw new Error(`${job.id} adapter returned an empty artifact`);
  if (typeof generated.mediaType !== 'string' || !generated.mediaType.includes('/')) {
    throw new Error(`${job.id} adapter did not return a valid mediaType`);
  }
  return { ...generated, bytes };
}

function publicStoredRecord(stored) {
  const { object_path: _privateObjectPath, ...record } = stored;
  return record;
}

function assertRequiredOutput(job, record) {
  const missing = (job.output?.required || []).filter(key => record[key] === undefined || record[key] === null);
  if (missing.length) throw new Error(`${job.id} did not produce required output: ${missing.join(', ')}`);
}

function cancellationError() {
  const error = new Error('media run cancelled');
  error.code = 'L7_CANCELLED';
  return error;
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancellationError();
}

function scoreUnit(candidate, component) {
  const bytes = crypto.createHash('sha256')
    .update(`${candidate.content_hash}:${candidate.job_id}:${component}`)
    .digest();
  return Number((bytes.readUInt32BE(0) / 0xffffffff).toFixed(6));
}

function evaluateCandidate(plan, candidate, createdAt = new Date().toISOString()) {
  const weights = plan.horizon.score;
  const components = Object.fromEntries(
    Object.entries(weights)
      .filter(([, weight]) => weight > 0)
      .map(([component]) => [component, scoreUnit(candidate, component)]),
  );
  const weightedTotal = Object.entries(components).reduce(
    (total, [component, score]) => total + score * weights[component],
    0,
  );
  const eligible = Boolean(candidate.content_hash && candidate.asset_uri && candidate.model_receipt);
  return {
    contract_version: CONTRACT_VERSIONS.mediaScorecard,
    candidate_id: candidate.job_id,
    evaluator: { name: 'l7-horizon-baseline', version: '1.0.0' },
    components,
    weighted_total: Number(weightedTotal.toFixed(6)),
    eligible,
    evidence: {
      asset_hash: candidate.content_hash,
      method: 'deterministic content-addressed baseline',
    },
    created_at: createdAt,
  };
}

function selectCandidates(plan, layer, scorecards, createdAt = new Date().toISOString()) {
  const ranked = scorecards
    .filter(scorecard => scorecard.eligible)
    .sort((left, right) => right.weighted_total - left.weighted_total
      || left.candidate_id.localeCompare(right.candidate_id));
  if (ranked.length === 0) throw new Error(`${layer.name} has no eligible Horizon candidates`);
  return {
    contract_version: CONTRACT_VERSIONS.mediaSelection,
    plan_id: plan.id,
    layer: layer.name,
    selected_candidate_ids: [ranked[0].candidate_id],
    authority: 'horizon',
    reason: 'highest eligible weighted score',
    overrides_ranking: false,
    created_at: createdAt,
  };
}

class MediaRunner {
  constructor(options = {}) {
    this.store = options.store || createMediaStore(options.storage || {});
    this.executionMode = options.executionMode || process.env.AVLI_MEDIA_EXECUTION || 'ssd1b';
    const handlers = options.adapters || (
      this.executionMode === 'mock' ? createMockAdapters()
        : this.executionMode === 'field' ? createFieldAdapters()
          : this.executionMode === 'ssd1b' ? createSsdAdapters()
          : null
    );
    this.adapterRegistry = options.adapterRegistry || (handlers ? registryFromHandlers(handlers, {
      provider: this.executionMode === 'mock'
        ? 'avli-mock'
        : this.executionMode === 'field'
          ? 'l7-local'
          : this.executionMode === 'ssd1b'
            ? 'segmind-local'
            : 'avli-cloud',
      prefix: this.executionMode,
    }) : null);
    this.lifecycle = options.lifecycle === false
      ? null
      : options.lifecycle || createDomainMediaLifecycle(options.lifecycleOptions || {});
    if (!this.adapterRegistry) throw new Error(`media execution mode is not configured: ${this.executionMode}`);
  }

  capabilities() {
    return this.adapterRegistry.describe();
  }

  async run(input, options = {}) {
    const signal = options.signal;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const plan = input?.version ? input : createMorphicPlan(input);
    validatePlan(plan);
    throwIfCancelled(signal);
    await onProgress({ phase: 'running', plan_id: plan.id, completed_jobs: 0 });
    const results = new Map();
    const selections = new Map();
    const layers = [];
    const totalJobs = plan.layers.reduce((sum, layer) => sum + layer.jobs.length, 0);
    let completedJobs = 0;
    for (const layer of plan.layers) {
      throwIfCancelled(signal);
      await onProgress({ phase: 'layer_started', layer: layer.name, depth: layer.depth, completed_jobs: completedJobs, total_jobs: totalJobs });
      const layerResults = [];
      const candidateJobs = layer.jobs.filter(job => Number.isInteger(job.input?.candidate_index));
      const dependentJobs = layer.jobs.filter(job => !Number.isInteger(job.input?.candidate_index));
      const executeJob = async job => {
        throwIfCancelled(signal);
        const missing = (job.dependencies || []).filter(id => !results.has(id));
        if (missing.length) throw new Error(`${job.id} has unresolved dependencies: ${missing.join(', ')}`);
        const adapter = this.adapterRegistry.resolve(job.capability);
        const dependencyReceipts = Object.fromEntries((job.dependencies || []).map(id => [id, results.get(id)]));
        const referenceSelection = job.input?.reference_layer
          ? selections.get(job.input.reference_layer)
          : null;
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        await onProgress({ phase: 'job_started', layer: layer.name, job_id: job.id, completed_jobs: completedJobs, total_jobs: totalJobs });
        const generated = validateGenerated(
          job,
          await adapter.execute(job, {
            plan,
            dependencies: dependencyReceipts,
            selection: referenceSelection,
            loadAsset: typeof this.store.get === 'function'
              ? hash => this.store.get(hash)
              : null,
            signal,
          }),
        );
        throwIfCancelled(signal);
        const completedAt = new Date().toISOString();
        const receipt = {
          contract_version: CONTRACT_VERSIONS.mediaReceipt,
          provider: generated.provider || adapter.provider,
          adapter: adapter.name,
          adapter_version: adapter.version,
          model: this.executionMode === 'mock' ? 'deterministic-contract-v1' : generated.model || null,
          model_version: generated.modelVersion || null,
          provider_request_id: generated.providerRequestId || null,
          requested_seed: job.input?.seed ?? null,
          confirmed_seed: generated.confirmedSeed ?? null,
          normalized_parameters: job.input || {},
          attempt: 1,
          plan_id: plan.id,
          job_id: job.id,
          started_at: startedAt,
          completed_at: completedAt,
          latency_ms: Math.max(0, Date.now() - startedMs),
          cost: generated.cost || null,
          safety: generated.safety || null,
        };
        const stored = await this.store.put(generated.bytes, {
          mediaType: generated.mediaType,
          extension: generated.extension,
          receipt,
        });
        const record = {
          job_id: job.id,
          capability: job.capability,
          ...publicStoredRecord(stored),
          ...(generated.output || {}),
          model_receipt: receipt,
        };
        assertRequiredOutput(job, record);
        results.set(job.id, record);
        layerResults.push(record);
        completedJobs += 1;
        await onProgress({
          phase: 'job_completed',
          layer: layer.name,
          job_id: job.id,
          artifact: record,
          completed_jobs: completedJobs,
          total_jobs: totalJobs,
        });
      };

      for (const job of candidateJobs) {
        await executeJob(job);
      }

      const evaluatedAt = new Date().toISOString();
      const scorecards = layerResults.map(candidate => evaluateCandidate(plan, candidate, evaluatedAt));
      const selection = selectCandidates(plan, layer, scorecards, evaluatedAt);
      selections.set(layer.name, selection);
      await onProgress({
        phase: 'layer_selected',
        layer: layer.name,
        selected_candidate_ids: selection.selected_candidate_ids,
        scorecards,
        selection,
        completed_jobs: completedJobs,
        total_jobs: totalJobs,
      });

      for (const job of dependentJobs) {
        await executeJob(job);
      }
      layers.push({
        depth: layer.depth,
        name: layer.name,
        artifacts: layerResults,
        scorecards,
        selection,
      });
      await onProgress({ phase: 'layer_completed', layer: layer.name, depth: layer.depth, completed_jobs: completedJobs, total_jobs: totalJobs });
    }

    throwIfCancelled(signal);
    await onProgress({ phase: 'finalizing', completed_jobs: completedJobs, total_jobs: totalJobs });
    const lifecycle = this.lifecycle
      ? await this.lifecycle.commit(plan, layers)
      : {
        state: 'ready_to_crystallize',
        canonical_state: 'staged',
        target_domain: '.salt',
        cycle_locked: false,
      };
    const run = {
      id: `run-${plan.id.slice(6)}`,
      plan_id: plan.id,
      state: lifecycle.state,
      canonical_state: lifecycle.state === 'crystallized' ? 'crystallized' : lifecycle.canonical_state,
      execution_mode: this.executionMode,
      storage_backend: this.store.constructor.name,
      layers,
      crystallization: plan.crystallization,
      lifecycle,
      release: plan.release,
    };
    const manifest = await this.store.put(Buffer.from(`${JSON.stringify(run, null, 2)}\n`), {
      mediaType: 'application/json',
      extension: 'json',
      receipt: { kind: 'morphic-run-manifest', plan_id: plan.id },
    });
    await onProgress({ phase: 'completed', completed_jobs: completedJobs, total_jobs: totalJobs });
    return { ...run, manifest };
  }
}

module.exports = {
  MediaRunner,
  createMockAdapters,
  createFieldAdapters,
  createSsdAdapters,
  validatePlan,
  validateGenerated,
  assertRequiredOutput,
  cancellationError,
  throwIfCancelled,
  evaluateCandidate,
  selectCandidates,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-runner.js | Body-Hash: SHA-256:06f212e17c93f093ac4a549a67bc97643e879ebb36f52422dce58f76b7d98e3e
// Chain-Hash: SHA-256:4ddd1252c672033a0987cdae5dd1901f67dff3d8b3d7f55a03c5fc357f66cdc5 | Signed: 2026-07-20T00:35:47.684281+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 44 works. Verify: python3 provenance.py verify lib/media-runner.js
// L7:PROVENANCE
