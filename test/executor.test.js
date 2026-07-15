const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

// executor.js (and its dep state.js) read L7_DIR at module-load time, and
// executor top-level-requires ./gateway — which pulls in the entire "empire"
// of esoteric modules (heart, dodecahedron, ephemeris, ...) and talks to real
// MCP servers. To keep these true unit tests — hermetic and deterministic — we
// (1) point L7_DIR at a throwaway fixture dir and (2) inject a lightweight fake
// gateway into the module cache, both *before* requiring the executor.
const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-executor-test-'));
process.env.L7_DIR = FIXTURE_DIR;

// --- Fake gateway -----------------------------------------------------------
// Records every execute() call and lets each test define the tool behavior.
const fakeGateway = {
  calls: [],
  _impl: async (_toolName, params) => ({ ok: true, data: params }),
  async execute(toolName, params) {
    fakeGateway.calls.push({ toolName, params });
    return fakeGateway._impl(toolName, params);
  },
  reset(impl) {
    fakeGateway.calls = [];
    fakeGateway._impl = impl || (async (_t, params) => ({ ok: true, data: params }));
  },
};

// Prime require.cache so executor's `require('./gateway')` returns the fake and
// the real gateway module is never loaded/executed.
const gatewayPath = require.resolve('../lib/gateway');
require.cache[gatewayPath] = {
  id: gatewayPath,
  filename: gatewayPath,
  loaded: true,
  exports: fakeGateway,
};

const executor = require('../lib/executor');

// Silence the executor's step-by-step narration so the TAP stream stays clean.
const origLog = console.log;
console.log = () => {};

// --- Helpers ----------------------------------------------------------------
function writeFlow(name, flow) {
  const dir = path.join(FIXTURE_DIR, 'flows');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.flow`), yaml.dump({ name, ...flow }));
}

function writeTool(name, tool) {
  const dir = path.join(FIXTURE_DIR, 'tools');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.tool`), yaml.dump(tool));
}

// --- loadFlow / loadTool ----------------------------------------------------
test('loadFlow throws when the flow file is missing', () => {
  assert.throws(() => executor.loadFlow('does-not-exist'), /Flow not found/);
});

test('loadFlow parses a .flow file from L7_DIR/flows', () => {
  writeFlow('greet', { steps: [{ do: 'notify', as: 'r' }] });
  const flow = executor.loadFlow('greet');
  assert.equal(flow.name, 'greet');
  assert.equal(flow.steps.length, 1);
  assert.equal(flow.steps[0].do, 'notify');
});

test('loadTool returns null for a missing tool and parses an existing one', () => {
  assert.equal(executor.loadTool('nope'), null);
  writeTool('emailer', { name: 'emailer', does: 'send', server: 's' });
  const tool = executor.loadTool('emailer');
  assert.equal(tool.name, 'emailer');
  assert.equal(tool.does, 'send');
});

// --- Single do step ---------------------------------------------------------
test('executeFlow runs a single do step through the gateway and stores its result', async () => {
  fakeGateway.reset();
  writeFlow('single', { steps: [{ do: 'notify', with: { msg: 'hello' }, as: 'sent' }] });

  const st = await executor.executeFlow('single');

  assert.equal(st.status, 'completed');
  assert.equal(fakeGateway.calls.length, 1);
  assert.equal(fakeGateway.calls[0].toolName, 'notify');
  assert.deepEqual(fakeGateway.calls[0].params, { msg: 'hello' });
  assert.ok(st.results.sent, 'result stored under the step `as` name');
});

test('executeFlow interpolates $vars and {{ }} from inputs into step params', async () => {
  fakeGateway.reset();
  writeFlow('interp', { steps: [{ do: 'greet', with: { text: 'Hi $name from {{ county }}' } }] });

  await executor.executeFlow('interp', { name: 'Sofia', county: 'Wake' });

  assert.equal(fakeGateway.calls[0].params.text, 'Hi Sofia from Wake');
});

test('executeFlow honors a do step `if` condition (skip when false, run when true)', async () => {
  writeFlow('cond', { steps: [{ do: 'publish', if: '$enabled', with: { x: '1' } }] });

  fakeGateway.reset();
  const skipped = await executor.executeFlow('cond', { enabled: false });
  assert.equal(fakeGateway.calls.length, 0, 'step skipped when condition is false');
  assert.equal(skipped.status, 'completed');

  fakeGateway.reset();
  await executor.executeFlow('cond', { enabled: true });
  assert.equal(fakeGateway.calls.length, 1, 'step runs when condition is true');
});

// --- each loops -------------------------------------------------------------
test('executeFlow iterates a do step over an `each` array', async () => {
  fakeGateway.reset();
  writeFlow('loop', { steps: [{ do: 'email', each: 'people', with: { to: '$item' }, as: 'sent' }] });

  const st = await executor.executeFlow('loop', { people: ['a@x', 'b@x', 'c@x'] });

  assert.equal(fakeGateway.calls.length, 3);
  assert.deepEqual(fakeGateway.calls.map(c => c.params.to), ['a@x', 'b@x', 'c@x']);
  assert.equal(st.results.sent.total, 3);
  assert.equal(st.results.sent.ok_count, 3);
  assert.equal(st.results.sent.fail_count, 0);
});

test('executeFlow skips each-items that fail a `require` rule', async () => {
  fakeGateway.reset();
  writeFlow('consented', {
    steps: [{ do: 'email', each: 'people', with: { to: '$item.email' } }],
    rules: [{ require: 'consent' }],
  });

  await executor.executeFlow('consented', {
    people: [
      { email: 'a@x', consent: true },
      { email: 'b@x', consent: false },
      { email: 'c@x', consent: true },
    ],
  });

  assert.equal(fakeGateway.calls.length, 2, 'the un-consented item is skipped');
  assert.deepEqual(fakeGateway.calls.map(c => c.params.to), ['a@x', 'c@x']);
});

test('executeFlow skips each-items that match a `skip` rule', async () => {
  fakeGateway.reset();
  writeFlow('unsub', {
    steps: [{ do: 'email', each: 'people', with: { to: '$item.email' } }],
    rules: [{ skip: 'unsubscribed' }],
  });

  await executor.executeFlow('unsub', {
    people: [
      { email: 'a@x', unsubscribed: true },
      { email: 'b@x' },
    ],
  });

  assert.equal(fakeGateway.calls.length, 1, 'the unsubscribed item is skipped');
  assert.equal(fakeGateway.calls[0].params.to, 'b@x');
});

test('executeFlow skips an each step whose source is not an array', async () => {
  fakeGateway.reset();
  writeFlow('badloop', { steps: [{ do: 'x', each: 'notarray', with: {} }] });

  const st = await executor.executeFlow('badloop', { notarray: 'hello' });

  assert.equal(fakeGateway.calls.length, 0);
  assert.equal(st.status, 'completed');
});

// --- wait / checkpoint / approve / reject / resume --------------------------
test('executeFlow pauses at a wait step and resumes after approval', async () => {
  fakeGateway.reset();
  writeFlow('checkpointed', {
    steps: [
      { do: 'prep', with: { x: '1' } },
      { wait: 'Approve to send' },
      { do: 'send', with: { y: '2' } },
    ],
  });

  const paused = await executor.executeFlow('checkpointed');
  assert.equal(paused.status, 'waiting', 'flow pauses at the checkpoint');
  assert.equal(fakeGateway.calls.length, 1, 'only the pre-checkpoint step ran');

  const approved = executor.approve('checkpointed', paused.id);
  assert.equal(approved.status, 'running');
  assert.equal(approved.checkpoints[0].decision, 'approve');

  const done = await executor.executeFlow('checkpointed', {}, { resume: paused.id });
  assert.equal(done.status, 'completed');
  assert.equal(fakeGateway.calls.length, 2, 'the post-checkpoint step ran after resume');
  assert.equal(fakeGateway.calls[1].toolName, 'send');
});

test('reject marks a waiting flow as rejected', async () => {
  fakeGateway.reset();
  writeFlow('rejectable', { steps: [{ wait: 'Hold here' }, { do: 'go' }] });

  const paused = await executor.executeFlow('rejectable');
  assert.equal(paused.status, 'waiting');

  const rejected = executor.reject('rejectable', paused.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.checkpoints[0].decision, 'reject');
});

test('resuming a still-waiting flow (no approval) throws', async () => {
  fakeGateway.reset();
  writeFlow('stillwaiting', { steps: [{ wait: 'Hold' }, { do: 'go' }] });

  const paused = await executor.executeFlow('stillwaiting');
  await assert.rejects(
    () => executor.executeFlow('stillwaiting', {}, { resume: paused.id }),
    /waiting for checkpoint/,
  );
});

// --- failure handling -------------------------------------------------------
test('executeFlow fails the run and records the error when a step throws with on_fail: halt', async () => {
  writeFlow('boom', { steps: [{ do: 'explode', on_fail: 'halt' }] });
  fakeGateway.reset(async () => { throw new Error('kaboom'); });

  const st = await executor.executeFlow('boom');

  assert.equal(st.status, 'failed');
  assert.equal(st.errors.length, 1);
  assert.match(st.errors[0].error, /kaboom/);
});

test('executeFlow continues past a failing step when on_fail: continue', async () => {
  writeFlow('resilient', {
    steps: [
      { do: 'flaky', on_fail: 'continue' },
      { do: 'reliable', as: 'r' },
    ],
  });
  fakeGateway.reset(async (tool) => {
    if (tool === 'flaky') throw new Error('nope');
    return { ok: true, data: {} };
  });

  const st = await executor.executeFlow('resilient');

  assert.equal(st.status, 'completed');
  assert.equal(st.errors.length, 1, 'the failure is recorded');
  assert.equal(fakeGateway.calls.length, 2, 'the later step still runs');
});

// --- dry run ----------------------------------------------------------------
test('executeFlow in dry-run mode records no gateway calls but completes', async () => {
  fakeGateway.reset();
  writeFlow('dry', { steps: [{ do: 'send', with: { x: '1' }, as: 'r' }] });

  const st = await executor.executeFlow('dry', {}, { dryRun: true });

  assert.equal(st.status, 'completed');
  assert.equal(fakeGateway.calls.length, 0, 'no tools are actually executed');
  assert.ok(st.results.r, 'dry-run still records a placeholder result');
});

// --- status reporting reads persisted state ---------------------------------
test('showStatus and listExecutions read persisted state without throwing', async () => {
  fakeGateway.reset();
  writeFlow('tracked', { steps: [{ do: 'ping', as: 'r' }] });

  const st = await executor.executeFlow('tracked');
  const shown = executor.showStatus('tracked', st.id);
  assert.equal(shown.id, st.id);
  assert.equal(shown.status, 'completed');
  assert.doesNotThrow(() => executor.listExecutions('tracked'));
});

test.after(() => {
  console.log = origLog;
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
