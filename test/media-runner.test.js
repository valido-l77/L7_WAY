'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LocalContentStore } = require('../lib/media-storage');
const { MediaRunner } = require('../lib/media-runner');
const { MorphCycle } = require('../lib/morph-cycle');
const { DomainMediaLifecycle } = require('../lib/media-lifecycle');

function lifecycleHarness() {
  const cycle = new MorphCycle();
  const writes = [];
  const domains = {
    get morphState() { return cycle.snapshot(); },
    write(domain, name, content, metadata) {
      assert.equal(domain, 'morph');
      const step = cycle.advance();
      const artifact = {
        _checksum: `checksum-${step.depth}`,
        metadata: { ...metadata, _morphName: step.layer },
      };
      writes.push({ name, content, metadata, step });
      if (step.shouldCrystallize) {
        cycle.crystallize();
        artifact.crystallized = writes.map(item => item.name);
      }
      return artifact;
    },
  };
  return { cycle, writes, lifecycle: new DomainMediaLifecycle({ domains }) };
}

test('local runner defaults to SSD-1B image synthesis with complete media capabilities', () => {
  const runner = new MediaRunner({ lifecycle: false });
  assert.equal(runner.executionMode, 'ssd1b');
  assert.deepEqual(
    runner.capabilities().flatMap(adapter => adapter.capabilities).sort(),
    ['image.generate', 'video.finish', 'video.generate'],
  );
});

test('mock hybrid run executes dependencies and commits a locked SALT lifecycle', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const harness = lifecycleHarness();
  const runner = new MediaRunner({
    store: new LocalContentStore({ root }),
    executionMode: 'mock',
    lifecycle: harness.lifecycle,
  });
  const run = await runner.run({ brief: 'copper city over the ocean', mode: 'video', duration: 6, seed: 42 });
  assert.equal(run.state, 'crystallized');
  assert.deepEqual(run.layers.map(layer => layer.name), ['ABOVE', 'MIRROR', 'BELOW']);
  assert.deepEqual(run.layers.map(layer => layer.artifacts.length), [3, 3, 5]);
  assert.equal(run.layers[0].artifacts[0].media_type, 'image/svg+xml');
  assert.equal(run.layers[0].artifacts[0].object_path, undefined);
  assert.match(run.manifest.asset_uri, /^avli:\/\/sha256\//);
  assert.equal(run.crystallization.locks_cycle, true);
  assert.equal(run.lifecycle.cycle_locked, true);
  assert.equal(run.lifecycle.salt_artifacts.length, 3);
  assert.equal(harness.cycle.locked, true);
  assert.deepEqual(harness.writes.map(item => item.step.layer), ['ABOVE', 'MIRROR', 'BELOW']);
  assert.ok(run.layers[2].artifacts.find(item => item.job_id === 'below.motion').keyframe_receipts);
  assert.ok(run.layers[2].artifacts.find(item => item.job_id === 'below.finish').edit_decision_list);
  assert.deepEqual(run.layers.map(layer => layer.scorecards.length), [3, 3, 3]);
  assert.ok(run.layers.every(layer => layer.selection.authority === 'horizon'));
  assert.ok(run.layers.every(layer => layer.selection.selected_candidate_ids.length === 1));
});

test('runner refuses a plan that was modified after planning', async () => {
  const records = [];
  const runner = new MediaRunner({
    store: { constructor: { name: 'MemoryStore' }, put: async bytes => ({ asset_uri: `memory:${records.push(bytes)}`, content_hash: 'x' }) },
  });
  const plan = require('../lib/morphic-media').createMorphicPlan({ brief: 'test', mode: 'image' });
  plan.layers[0].jobs[0].dependencies = ['missing'];
  await assert.rejects(() => runner.run(plan), /does not match its canonical request/);
});

test('runner rejects an extreme aspect ratio injected into a submitted plan', async () => {
  const runner = new MediaRunner({
    store: { constructor: { name: 'MemoryStore' }, put: async () => ({ asset_uri: 'memory:x', content_hash: 'x' }) },
    executionMode: 'field',
  });
  const plan = require('../lib/morphic-media').createMorphicPlan({ brief: 'test', mode: 'image' });
  plan.layers[0].jobs[0].input.aspect_ratio = '1:100000';
  await assert.rejects(() => runner.run(plan), /does not match its canonical request/);
});

test('runner verifies every declared adapter output before lifecycle commit', async () => {
  let committed = false;
  const runner = new MediaRunner({
    store: {
      constructor: { name: 'IncompleteStore' },
      put: async () => ({ asset_uri: 'memory:x' }),
    },
    executionMode: 'field',
    adapters: {
      'image.generate': async () => ({
        bytes: Buffer.from('image'),
        mediaType: 'image/png',
        extension: 'png',
      }),
    },
    lifecycle: { commit: async () => { committed = true; } },
  });

  await assert.rejects(
    () => runner.run({ brief: 'missing hash', mode: 'image' }),
    /did not produce required output: content_hash/,
  );
  assert.equal(committed, false);
});

test('runner can explicitly stage without committing for offline inspection', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-run-staged-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runner = new MediaRunner({
    store: new LocalContentStore({ root }),
    executionMode: 'mock',
    lifecycle: false,
  });

  const run = await runner.run({ brief: 'inspect before domain commit', mode: 'image' });
  assert.equal(run.state, 'ready_to_crystallize');
  assert.equal(run.lifecycle.cycle_locked, false);
});

test('video generation receives the selected grounded candidate', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-run-selection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let receivedSelection = null;
  const generated = job => ({
    bytes: Buffer.from(job.id),
    mediaType: job.capability === 'image.generate' ? 'image/png' : 'application/json',
    extension: job.capability === 'image.generate' ? 'png' : 'json',
    output: job.capability === 'video.generate'
      ? { keyframe_receipts: [] }
      : job.capability === 'video.finish'
        ? { edit_decision_list: [] }
        : {},
  });
  const runner = new MediaRunner({
    store: new LocalContentStore({ root }),
    executionMode: 'provider-test',
    adapters: {
      'image.generate': async job => generated(job),
      'video.generate': async (job, context) => {
        receivedSelection = context.selection;
        return generated(job);
      },
      'video.finish': async job => generated(job),
    },
    lifecycle: false,
  });

  const run = await runner.run({ brief: 'grounded selection', mode: 'video', candidates: 2 });
  assert.deepEqual(receivedSelection, run.layers[2].selection);
  assert.match(receivedSelection.selected_candidate_ids[0], /^below\.canonical\.c0[12]$/);
});

test('runner exposes content-addressed dependency bytes only through adapter context', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-run-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let loaded = null;
  const store = new LocalContentStore({ root });
  const runner = new MediaRunner({
    store,
    executionMode: 'provider-test',
    adapters: {
      'image.generate': async job => ({
        bytes: Buffer.from(`image:${job.id}`),
        mediaType: 'image/png',
        extension: 'png',
      }),
      'video.generate': async (job, context) => {
        const selectedId = context.selection.selected_candidate_ids[0];
        loaded = await context.loadAsset(context.dependencies[selectedId].content_hash);
        return {
          bytes: Buffer.from('motion'),
          mediaType: 'video/mp4',
          extension: 'mp4',
          output: { keyframe_receipts: [context.dependencies[selectedId]] },
        };
      },
      'video.finish': async () => ({
        bytes: Buffer.from('finish'),
        mediaType: 'video/mp4',
        extension: 'mp4',
        output: { edit_decision_list: [] },
      }),
    },
    lifecycle: false,
  });

  await runner.run({ brief: 'asset loader', mode: 'video', candidates: 1 });
  assert.match(loaded.bytes.toString(), /^image:below\.canonical\.c01$/);
});
