'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createMorphicPlan } = require('./morphic-media');
const { atomicWriteFileSync, resolveNamedFile } = require('./safe-path');

const TERMINAL_STATES = new Set(['crystallized', 'staged', 'released', 'rejected', 'failed', 'cancelled']);

function now() {
  return new Date().toISOString();
}

function publicError(error) {
  return {
    code: error?.code || 'MEDIA_RUN_FAILED',
    message: error?.message || 'Media run failed',
  };
}

function updatePreview(record, progress) {
  if (!progress?.layer) return;
  record.preview ||= { layers: [], revision: 0 };
  let layer = record.preview.layers.find(item => item.name === progress.layer);
  if (!layer) {
    const planned = record.plan.layers.find(item => item.name === progress.layer);
    layer = {
      depth: planned?.depth,
      name: progress.layer,
      artifacts: [],
      scorecards: [],
      selection: null,
    };
    record.preview.layers.push(layer);
  }
  if (progress.artifact) {
    const index = layer.artifacts.findIndex(item => item.job_id === progress.artifact.job_id);
    if (index >= 0) layer.artifacts[index] = progress.artifact;
    else layer.artifacts.push(progress.artifact);
  }
  if (Array.isArray(progress.scorecards)) layer.scorecards = progress.scorecards;
  if (progress.selection) layer.selection = progress.selection;
  record.preview.revision += 1;
}

class MediaRunJournal {
  constructor(options = {}) {
    const l7Dir = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
    this.root = path.resolve(options.root || path.join(l7Dir, 'media-runs'));
    fs.mkdirSync(this.root, { recursive: true });
  }

  pathFor(id) {
    return resolveNamedFile(this.root, id, '.json', { label: 'Media run ID', maxLength: 100 });
  }

  write(record) {
    atomicWriteFileSync(this.pathFor(record.id), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    return record;
  }

  read(id) {
    const file = this.pathFor(id);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  list() {
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => this.read(entry.name.slice(0, -5)))
      .filter(Boolean)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

class MediaRunCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.runner || typeof options.runner.run !== 'function') {
      throw new TypeError('media run coordinator requires a runner');
    }
    this.runner = options.runner;
    this.journal = options.journal || new MediaRunJournal(options.journalOptions || {});
    this.concurrency = Math.max(1, Math.min(Number(options.concurrency) || 1, 8));
    this.queue = [];
    this.queued = new Set();
    this.active = new Map();
    this.started = options.autoStart !== false;
    this.recover();
  }

  start() {
    if (this.started) return;
    this.started = true;
    queueMicrotask(() => this.drain());
  }

  recover() {
    for (const record of this.journal.list()) {
      if (record.state !== 'queued' && record.state !== 'running') continue;
      const previousState = record.state;
      record.state = 'queued';
      record.progress = { phase: 'recovered', previous_state: previousState };
      record.updated_at = now();
      this.journal.write(record);
      this.enqueue(record.id);
    }
  }

  submit(input) {
    const plan = input?.version ? input : createMorphicPlan(input);
    const id = `run-${plan.id.slice(6)}`;
    const existing = this.journal.read(id);
    if (existing) return existing;
    const timestamp = now();
    const record = {
      id,
      plan_id: plan.id,
      state: 'queued',
      plan,
      progress: { phase: 'queued', completed_jobs: 0 },
      result: null,
      error: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.journal.write(record);
    this.publish(record);
    this.enqueue(id);
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
    while (this.active.size < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      this.queued.delete(id);
      const record = this.journal.read(id);
      if (!record || record.state !== 'queued') continue;
      const controller = new AbortController();
      const promise = this.execute(record, controller)
        .finally(() => {
          this.active.delete(id);
          this.drain();
        });
      this.active.set(id, { controller, promise });
    }
  }

  async execute(record, controller) {
    record.state = 'running';
    record.started_at ||= now();
    record.updated_at = now();
    this.journal.write(record);
    this.publish(record);
    try {
      const result = await this.runner.run(record.plan, {
        signal: controller.signal,
        onProgress: progress => {
          const current = this.journal.read(record.id);
          if (!current || current.state === 'cancelled') return;
          current.progress = progress;
          updatePreview(current, progress);
          current.updated_at = now();
          this.journal.write(current);
          this.publish(current);
        },
      });
      const current = this.journal.read(record.id) || record;
      if (current.state === 'cancelled') return current;
      current.state = result.canonical_state || (result.state === 'crystallized' ? 'crystallized' : 'staged');
      current.result = result;
      delete current.preview;
      current.progress = { phase: 'completed' };
      current.error = null;
      current.completed_at = now();
      current.updated_at = current.completed_at;
      this.journal.write(current);
      this.publish(current);
      return current;
    } catch (error) {
      const current = this.journal.read(record.id) || record;
      current.state = error?.code === 'L7_CANCELLED' || controller.signal.aborted ? 'cancelled' : 'failed';
      current.error = current.state === 'cancelled' ? null : publicError(error);
      current.progress = { phase: current.state };
      current.completed_at = now();
      current.updated_at = current.completed_at;
      this.journal.write(current);
      this.publish(current);
      return current;
    }
  }

  cancel(id) {
    const record = this.journal.read(id);
    if (!record) return null;
    if (TERMINAL_STATES.has(record.state)) return record;
    record.state = 'cancelled';
    record.progress = { phase: 'cancelled' };
    record.error = null;
    record.completed_at = now();
    record.updated_at = record.completed_at;
    this.journal.write(record);
    this.queued.delete(id);
    this.queue = this.queue.filter(queuedId => queuedId !== id);
    this.active.get(id)?.controller.abort();
    this.publish(record);
    return record;
  }

  resume(id) {
    const record = this.journal.read(id);
    if (!record) return null;
    if (record.state !== 'failed' && record.state !== 'cancelled') {
      throw new Error(`media run ${id} cannot resume from ${record.state}`);
    }
    if (this.active.has(id)) throw new Error(`media run ${id} is still stopping`);
    record.state = 'queued';
    record.progress = { phase: 'queued', resumed: true };
    record.error = null;
    delete record.completed_at;
    record.updated_at = now();
    this.journal.write(record);
    this.publish(record);
    this.enqueue(id);
    return record;
  }

  wait(id) {
    const record = this.journal.read(id);
    if (!record) return Promise.reject(new Error(`media run not found: ${id}`));
    if (TERMINAL_STATES.has(record.state)) {
      const active = this.active.get(id);
      return active ? active.promise.then(() => this.journal.read(id)) : Promise.resolve(record);
    }
    return new Promise(resolve => {
      const listener = updated => {
        if (updated.id !== id || !TERMINAL_STATES.has(updated.state)) return;
        this.off('update', listener);
        const active = this.active.get(id);
        if (active) active.promise.then(() => resolve(this.journal.read(id)));
        else resolve(updated);
      };
      this.on('update', listener);
    });
  }

  publish(record) {
    this.emit('update', record);
  }
}

module.exports = {
  TERMINAL_STATES,
  MediaRunJournal,
  MediaRunCoordinator,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-run-coordinator.js | Body-Hash: SHA-256:eafe264b9e24d807e807ef056d3d37a1ff995071ae7a73249441e00964d0955a
// Chain-Hash: SHA-256:0fadd8de741a510ae249b2da765021deeb82a785ebef1fd2b92428ec6a6d7a7c | Signed: 2026-07-28T15:51:22.898285+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 74 works. Verify: python3 provenance.py verify lib/media-run-coordinator.js
