'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { CONTRACT_VERSIONS, normalizeExecutionResult } = require('./contracts');
const { atomicWriteFileSync, resolveNamedFile } = require('./safe-path');
const { stableStringify } = require('./media-storage');

const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled']);
const workerDefinitions = require('../schema/v1/worker-definitions.schema.json');
const validateJobRequest = new Ajv({
  allErrors: true,
  strict: true,
  validateFormats: false,
}).compile({
  ...workerDefinitions,
  $ref: '#/definitions/jobRequest',
});

function timestamp() {
  return new Date().toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function publicError(error) {
  return {
    code: error?.code || 'INTERNAL_ERROR',
    message: error?.message || 'Job execution failed',
  };
}

function cancellationError() {
  const error = new Error('Job cancelled');
  error.code = 'L7_CANCELLED';
  return error;
}

const IN_FLIGHT_STATES = new Set(['queued', 'running', 'cancelling']);
const DEFAULT_JOURNAL_RETENTION_MS = 7 * 24 * 3600 * 1000;

class JobJournal {
  constructor(options = {}) {
    const l7Dir = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
    this.root = path.resolve(options.root || path.join(l7Dir, 'jobs'));
    this.writeFile = options.writeFile || atomicWriteFileSync;
    fs.mkdirSync(this.root, { recursive: true });
  }

  pathFor(id) {
    return resolveNamedFile(this.root, id, '.json', { label: 'Job ID', maxLength: 100 });
  }

  write(record) {
    try {
      this.writeFile(this.pathFor(record.job_id), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      return record;
    } catch (error) {
      if (error.code === 'ENOSPC') {
        error.code = 'L7_STORAGE_FULL';
        if (!/no space|ENOSPC/i.test(error.message || '')) {
          error.message = `no space left on device: ${error.message || 'ENOSPC'}`;
        }
      }
      throw error;
    }
  }

  read(id) {
    try {
      return JSON.parse(fs.readFileSync(this.pathFor(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  list() {
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => this.read(entry.name.slice(0, -5)))
      .filter(Boolean)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  prune(options = {}) {
    const maxAgeMs = Number(options.maxAgeMs) > 0 ? Number(options.maxAgeMs) : DEFAULT_JOURNAL_RETENTION_MS;
    const keepInFlight = options.keepInFlight !== false;
    const cutoff = Date.now() - maxAgeMs;
    let inFlight = 0;
    let removed = 0;
    let kept = 0;
    for (const record of this.list()) {
      if (IN_FLIGHT_STATES.has(record.state)) {
        inFlight += 1;
        kept += 1;
        if (keepInFlight) continue;
      }
      if (!TERMINAL_STATES.has(record.state)) {
        kept += 1;
        continue;
      }
      const stamp = Date.parse(record.updated_at || record.created_at) || 0;
      if (stamp > cutoff) {
        kept += 1;
        continue;
      }
      try {
        fs.unlinkSync(this.pathFor(record.job_id));
        removed += 1;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return { inFlight, removed, kept };
  }
}

class JobCoordinator {
  constructor(options = {}) {
    if (typeof options.execute !== 'function') {
      throw new TypeError('job coordinator requires an execute function');
    }
    this.execute = options.execute;
    this.cancelExecution = options.cancelExecution || null;
    this.journal = options.journal || new JobJournal(options.journalOptions);
    this.concurrency = Math.max(1, Math.min(Number(options.concurrency) || 2, 16));
    this.queue = [];
    this.queued = new Set();
    this.active = new Map();
    this.started = options.autoStart !== false;
    this.recover();
  }

  recover() {
    if (typeof this.journal.prune === 'function') {
      this.journal.prune({ maxAgeMs: DEFAULT_JOURNAL_RETENTION_MS, keepInFlight: true });
    }
    for (const record of this.journal.list()) {
      if (record.state === 'cancelling') {
        record.state = 'cancelled';
        record.updated_at = timestamp();
        this.journal.write(record);
        continue;
      }
      if (record.state !== 'queued' && record.state !== 'running') continue;
      record.state = 'queued';
      record.progress = 0;
      record.updated_at = timestamp();
      this.journal.write(record);
      this.enqueue(record.job_id);
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    queueMicrotask(() => this.drain());
  }

  submit(request, context = {}) {
    if (!validateJobRequest(request)) {
      const error = new Error(`Invalid job request: ${validateJobRequest.errors.map(item => item.message).join('; ')}`);
      error.code = 'L7_VALIDATION_ERROR';
      throw error;
    }
    if (Date.parse(request.deadline) <= Date.now()) {
      const error = new Error('Job deadline must be in the future');
      error.code = 'L7_VALIDATION_ERROR';
      throw error;
    }

    const requestHash = digest(request);
    const jobId = `job:${digest({
      request_id: request.request_id,
      tenant_id: request.tenant_id,
    }).slice(0, 24)}`;
    const existing = this.journal.read(jobId);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        const error = new Error(`Request ID ${request.request_id} was already used with different input`);
        error.code = 'L7_CONFLICT';
        throw error;
      }
      return existing;
    }

    const now = timestamp();
    const record = {
      contract_version: CONTRACT_VERSIONS.workerJob,
      job_id: jobId,
      request_id: request.request_id,
      tenant_id: request.tenant_id,
      workspace_id: context.workspaceId || null,
      capability: request.capability,
      state: 'queued',
      created_at: now,
      updated_at: now,
      progress: 0,
      result: null,
      artifacts: [],
      error: null,
      request,
      request_hash: requestHash,
    };
    this.journal.write(record);
    this.enqueue(jobId);
    return record;
  }

  get(id) {
    return this.journal.read(id);
  }

  list() {
    return this.journal.list();
  }

  enqueue(id) {
    if (this.queued.has(id) || this.active.has(id)) return;
    this.queue.push(id);
    this.queued.add(id);
    if (this.started) queueMicrotask(() => this.drain());
  }

  async drain() {
    if (!this.started) return;
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const id = this.queue.shift();
      this.queued.delete(id);
      const record = this.journal.read(id);
      if (!record || record.state !== 'queued') continue;
      const controller = new AbortController();
      const promise = this.run(record, controller).finally(() => {
        this.active.delete(id);
        this.drain();
      });
      this.active.set(id, { controller, promise });
    }
  }

  async run(record, controller) {
    record.state = 'running';
    record.progress = 0.01;
    record.updated_at = timestamp();
    this.journal.write(record);
    let deadlineTimer;
    let abortListener;
    try {
      const deadlineMs = Date.parse(record.request.deadline) - Date.now();
      if (deadlineMs <= 0) {
        const error = new Error('Job deadline elapsed before execution');
        error.code = 'L7_TIMEOUT';
        throw error;
      }
      const timeoutError = new Error('Job deadline elapsed during execution');
      timeoutError.code = 'L7_TIMEOUT';
      deadlineTimer = setTimeout(() => controller.abort(timeoutError), deadlineMs);
      deadlineTimer.unref?.();
      const execution = Promise.resolve().then(() => this.execute(record.request, {
        signal: controller.signal,
        timeout: deadlineMs,
        onProgress: value => {
          const current = this.journal.read(record.job_id);
          if (!current || current.state !== 'running') return;
          current.progress = Math.max(current.progress, Math.min(Number(value) || 0, 0.99));
          current.updated_at = timestamp();
          this.journal.write(current);
        },
      }));
      const aborted = new Promise((_resolve, reject) => {
        abortListener = () => reject(controller.signal.reason || cancellationError());
        if (controller.signal.aborted) abortListener();
        else controller.signal.addEventListener('abort', abortListener, { once: true });
      });
      const output = await Promise.race([execution, aborted]);
      const current = this.journal.read(record.job_id) || record;
      if (current.state === 'cancelled') return current;
      if (controller.signal.aborted) throw controller.signal.reason || cancellationError();
      current.state = 'succeeded';
      current.progress = 1;
      current.result = output?.result ?? output ?? null;
      current.artifacts = Array.isArray(output?.artifacts) ? output.artifacts : [];
      current.error = null;
      current.updated_at = timestamp();
      this.journal.write(current);
      return current;
    } catch (error) {
      const current = this.journal.read(record.job_id) || record;
      const abortReason = controller.signal.aborted ? controller.signal.reason : null;
      const effectiveError = abortReason instanceof Error ? abortReason : error;
      const cancelled = effectiveError?.code === 'L7_CANCELLED';
      current.state = cancelled ? 'cancelled' : 'failed';
      current.progress = cancelled ? current.progress : 1;
      current.error = cancelled ? null : publicError(effectiveError);
      current.updated_at = timestamp();
      this.journal.write(current);
      return current;
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
    }
  }

  cancel(id) {
    const record = this.journal.read(id);
    if (!record || TERMINAL_STATES.has(record.state)) return record;
    const active = this.active.get(id);
    record.state = 'cancelled';
    record.updated_at = timestamp();
    this.journal.write(record);
    this.queued.delete(id);
    this.queue = this.queue.filter(queuedId => queuedId !== id);
    if (active) {
      active.controller.abort(cancellationError());
      this.cancelExecution?.(record);
    }
    return this.journal.read(id);
  }

  wait(id) {
    const record = this.journal.read(id);
    if (!record) return Promise.reject(new Error(`Job not found: ${id}`));
    const active = this.active.get(id);
    if (active) return active.promise.then(() => this.journal.read(id));
    if (TERMINAL_STATES.has(record.state)) return Promise.resolve(record);
    return new Promise(resolve => {
      const poll = () => {
        const current = this.journal.read(id);
        if (current && TERMINAL_STATES.has(current.state)) resolve(current);
        else setTimeout(poll, 5);
      };
      poll();
    });
  }
}

function publicJob(record) {
  if (!record) return null;
  const {
    request: _request,
    request_hash: _requestHash,
    workspace_id: _workspaceId,
    ...visible
  } = record;
  return visible;
}

function jobEnvelope(record) {
  return normalizeExecutionResult(publicJob(record), {
    meta: { job_id: record.job_id },
  });
}

module.exports = {
  TERMINAL_STATES,
  IN_FLIGHT_STATES,
  DEFAULT_JOURNAL_RETENTION_MS,
  JobJournal,
  JobCoordinator,
  publicJob,
  jobEnvelope,
  cancellationError,
  validateJobRequest,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/job-coordinator.js | Body-Hash: SHA-256:dfe8980f6574b6a4df03a5754a75b3c2ac0c937718835219ee16dc65ace2be0c
// Chain-Hash: SHA-256:86ab18f3fa04aebe38278527d6a4883193d1badb33ea3aa36128db3d957c68cd | Signed: 2026-07-29T07:52:25.487661+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 66 works. Verify: python3 provenance.py verify lib/job-coordinator.js
