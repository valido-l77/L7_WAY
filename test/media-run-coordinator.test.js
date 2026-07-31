'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMorphicPlan } = require('../lib/morphic-media');
const { MediaRunJournal, MediaRunCoordinator } = require('../lib/media-run-coordinator');

function harness(t, runner) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-media-runs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new MediaRunJournal({ root });
  return { root, journal, coordinator: new MediaRunCoordinator({ runner, journal }) };
}

test('queued coordinator persists progress and completes idempotently', async t => {
  let calls = 0;
  let incremental;
  const runner = {
    async run(plan, options) {
      calls += 1;
      await options.onProgress({
        phase: 'job_completed',
        layer: 'ABOVE',
        artifact: { job_id: 'above.image.1', media_type: 'image/png' },
        completed_jobs: 1,
        total_jobs: 1,
      });
      return { id: `run-${plan.id}`, state: 'ready_to_crystallize', canonical_state: 'staged' };
    },
  };
  const { coordinator, journal } = harness(t, runner);
  coordinator.on('update', record => {
    if (record.preview?.layers?.[0]?.artifacts?.length) incremental = structuredClone(record);
  });
  const policy = { risk: 'low', decision: 'automatic' };
  const first = coordinator.submit({ brief: 'durable queue', mode: 'image' }, { policy });
  const duplicate = coordinator.submit({ brief: 'durable queue', mode: 'image' });
  assert.equal(first.id, duplicate.id);

  const completed = await coordinator.wait(first.id);
  assert.equal(completed.state, 'staged');
  assert.equal(completed.result.canonical_state, 'staged');
  assert.equal(journal.read(first.id).state, 'staged');
  assert.equal(calls, 1);
  assert.deepEqual(completed.policy, policy);
  assert.equal(incremental.preview.layers[0].artifacts[0].job_id, 'above.image.1');
});

test('running coordinator propagates cancellation through AbortSignal', async t => {
  let observedSignal;
  const runner = {
    run(_plan, options) {
      observedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.code = 'L7_CANCELLED';
          reject(error);
        }, { once: true });
      });
    },
  };
  const { coordinator } = harness(t, runner);
  const submitted = coordinator.submit({ brief: 'cancel me' });
  await new Promise(resolve => coordinator.once('update', record => {
    if (record.id === submitted.id && record.state === 'running') resolve();
    else resolve();
  }));
  const cancelled = coordinator.cancel(submitted.id);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(observedSignal.aborted, true);
  assert.equal((await coordinator.wait(submitted.id)).state, 'cancelled');
});

test('coordinator recovers a run journaled as running after restart', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-media-recover-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new MediaRunJournal({ root });
  const plan = createMorphicPlan({ brief: 'recover me' });
  const id = `run-${plan.id.slice(6)}`;
  journal.write({
    id,
    plan_id: plan.id,
    state: 'running',
    plan,
    progress: { phase: 'job_started' },
    result: null,
    error: null,
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:01.000Z',
  });
  let calls = 0;
  const coordinator = new MediaRunCoordinator({
    journal,
    runner: {
      async run() {
        calls += 1;
        return { state: 'ready_to_crystallize', canonical_state: 'staged' };
      },
    },
  });
  const completed = await coordinator.wait(id);
  assert.equal(completed.state, 'staged');
  assert.equal(calls, 1);
});

test('recovered work can remain dormant until gateway boot completes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-media-dormant-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new MediaRunJournal({ root });
  let calls = 0;
  const coordinator = new MediaRunCoordinator({
    journal,
    autoStart: false,
    runner: { async run() { calls += 1; return { canonical_state: 'staged' }; } },
  });
  const submitted = coordinator.submit({ brief: 'wait for boot' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  assert.equal(coordinator.get(submitted.id).state, 'queued');
  coordinator.start();
  assert.equal((await coordinator.wait(submitted.id)).state, 'staged');
  assert.equal(calls, 1);
});

test('failed and cancelled records can resume only after active work stops', async t => {
  let calls = 0;
  const { coordinator } = harness(t, {
    async run() {
      calls += 1;
      if (calls === 1) throw new Error('transient provider failure');
      return { state: 'ready_to_crystallize', canonical_state: 'staged' };
    },
  });
  const submitted = coordinator.submit({ brief: 'retry me' });
  const failed = await coordinator.wait(submitted.id);
  assert.equal(failed.state, 'failed');
  assert.match(failed.error.message, /transient provider failure/);

  const resumed = coordinator.resume(submitted.id);
  assert.equal(resumed.state, 'queued');
  const completed = await coordinator.wait(submitted.id);
  assert.equal(completed.state, 'staged');
  assert.equal(calls, 2);
});
