'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DomainMediaLifecycle } = require('../lib/media-lifecycle');

function layers() {
  return ['ABOVE', 'MIRROR', 'BELOW'].map((name, index) => ({
    depth: index + 1,
    name,
    artifacts: [{ content_hash: `hash-${index + 1}`, model_receipt: { provider: 'test' } }],
  }));
}

function plan() {
  return {
    id: 'morph-test',
    request: { identity: 'one invariant' },
    provenance: { plan_hash: 'plan-hash' },
  };
}

test('domain media lifecycle refuses to merge with an incomplete dream cycle', async () => {
  const domains = {
    morphState: { morphDepth: 1, morphLocked: false },
    write() { throw new Error('must not write'); },
  };
  const lifecycle = new DomainMediaLifecycle({ domains });
  await assert.rejects(() => lifecycle.commit(plan(), layers()), /incomplete cycle at depth 1/);
});

test('domain media lifecycle refuses to restart a locked cycle automatically', async () => {
  const domains = {
    morphState: { morphDepth: 0, morphLocked: true },
    write() { throw new Error('must not write'); },
  };
  const lifecycle = new DomainMediaLifecycle({ domains });
  await assert.rejects(() => lifecycle.commit(plan(), layers()), /explicit approval/);
});

test('domain media lifecycle validates layer order before touching storage', async () => {
  let writes = 0;
  const domains = {
    morphState: { morphDepth: 0, morphLocked: false },
    write() { writes += 1; },
  };
  const lifecycle = new DomainMediaLifecycle({ domains });
  const reversed = layers().reverse();
  await assert.rejects(() => lifecycle.commit(plan(), reversed), /layer 1 must be ABOVE/);
  assert.equal(writes, 0);
});

test('domain media lifecycle commits three real domain layers into SALT and locks', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-media-lifecycle-'));
  const previousL7Dir = process.env.L7_DIR;
  process.env.L7_DIR = root;
  const domainsPath = require.resolve('../lib/domains');
  const steelPath = require.resolve('../lib/steel');
  delete require.cache[domainsPath];
  delete require.cache[steelPath];
  const domains = require('../lib/domains');

  t.after(() => {
    delete require.cache[domainsPath];
    delete require.cache[steelPath];
    if (previousL7Dir === undefined) delete process.env.L7_DIR;
    else process.env.L7_DIR = previousL7Dir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const receipt = await new DomainMediaLifecycle({ domains }).commit(plan(), layers());
  assert.equal(receipt.state, 'crystallized');
  assert.equal(receipt.cycle_locked, true);
  assert.equal(receipt.salt_artifacts.length, 3);
  assert.equal(domains.morphLocked, true);
  assert.deepEqual(domains.list('morph'), []);
  assert.equal(domains.list('salt').length, 3);

  const recovered = await new DomainMediaLifecycle({ domains }).commit(plan(), layers());
  assert.equal(recovered.state, 'crystallized');
  assert.deepEqual(recovered.salt_artifacts, receipt.salt_artifacts);
  assert.deepEqual(recovered.layer_receipts, receipt.layer_receipts);
});
