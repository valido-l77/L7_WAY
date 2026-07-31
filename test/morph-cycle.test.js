'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MorphCycle } = require('../lib/morph-cycle');

test('MorphCycle advances through exactly three layers and locks on crystallization', () => {
  const persisted = [];
  const cycle = new MorphCycle({ persist: (depth, locked) => persisted.push({ depth, locked }) });

  assert.deepEqual(cycle.advance(), { depth: 1, layer: 'ABOVE', shouldCrystallize: false });
  assert.deepEqual(cycle.advance(), { depth: 2, layer: 'MIRROR', shouldCrystallize: false });
  assert.deepEqual(cycle.advance(), { depth: 3, layer: 'BELOW', shouldCrystallize: true });
  assert.equal(cycle.crystallize().state, 'crystallized');
  assert.throws(() => cycle.advance(), /MORPH LOCKED/);

  assert.deepEqual(persisted, [
    { depth: 1, locked: false },
    { depth: 2, locked: false },
    { depth: 3, locked: false },
    { depth: 0, locked: true },
  ]);
});

test('MorphCycle restores durable state and requires explicit approval', () => {
  const cycle = new MorphCycle({ initialState: { morphDepth: 0, morphLocked: true } });
  assert.equal(cycle.snapshot().nextLayer, null);
  assert.equal(cycle.approve().state, 'ready');
  assert.equal(cycle.advance().layer, 'ABOVE');
  assert.throws(
    () => new MorphCycle({ initialState: { morphDepth: 2, morphLocked: true } }),
    /locked morph cycle must have depth 0/,
  );
});

test('MorphCycle can preview a layer without committing state', () => {
  const cycle = new MorphCycle();
  assert.deepEqual(cycle.next(), { depth: 1, layer: 'ABOVE', shouldCrystallize: false });
  assert.equal(cycle.snapshot().state, 'ready');
  assert.equal(cycle.advance().layer, 'ABOVE');
  assert.equal(cycle.snapshot().state, 'dreaming');
});

test('MorphCycle does not expose a crystallized state when persistence fails', () => {
  let rejectPersistence = false;
  const cycle = new MorphCycle({
    persist: () => {
      if (rejectPersistence) throw new Error('disk unavailable');
    },
  });
  cycle.advance();
  cycle.advance();
  cycle.advance();

  rejectPersistence = true;
  assert.throws(() => cycle.crystallize(), /disk unavailable/);
  assert.equal(cycle.depth, 3);
  assert.equal(cycle.locked, false);
  assert.equal(cycle.canCrystallize(), true);
});

test('premature domain crystallization leaves morph and salt untouched', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-domains-preflight-'));
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

  domains.write('morph', 'above.json', { layer: 1 });
  assert.throws(() => domains.crystallizeDreams(), /before 3 dream layers/);
  assert.equal(fs.existsSync(path.join(root, 'morph', 'above.json')), true);
  assert.deepEqual(domains.list('salt'), []);
  assert.equal(domains.morphDepth, 1);
  assert.equal(domains.morphLocked, false);
});

test('failed SALT publication rolls back crystals and preserves all morph layers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-domains-rollback-'));
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

  domains.write('morph', 'above.json', { layer: 1 });
  domains.write('morph', 'mirror.json', { layer: 2 });

  const originalLink = fs.linkSync;
  let publications = 0;
  fs.linkSync = (...args) => {
    publications += 1;
    if (publications === 2) throw new Error('simulated publication failure');
    return originalLink(...args);
  };
  try {
    assert.throws(
      () => domains.write('morph', 'below.json', { layer: 3 }),
      /simulated publication failure/,
    );
  } finally {
    fs.linkSync = originalLink;
  }

  assert.equal(domains.morphDepth, 3);
  assert.equal(domains.morphLocked, false);
  assert.deepEqual(domains.list('morph').map(item => item.name).sort(), [
    'above.json',
    'below.json',
    'mirror.json',
  ]);
  assert.deepEqual(domains.list('salt'), []);
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'salt')).filter(name => name.endsWith('.tmp')),
    [],
  );

  assert.equal(domains.crystallizeDreams().length, 3);
  assert.equal(domains.morphLocked, true);
});

test('domain writes crystallize automatically after BELOW and restore the lock', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-domains-test-'));
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

  assert.throws(
    () => domains.write('work', '../escaped.json', { forbidden: true }),
    /escapes \.work/,
  );
  assert.equal(fs.existsSync(path.join(root, 'escaped.json')), false);

  domains.write('morph', 'above.json', { layer: 1, cycle: 1 });
  domains.write('morph', 'mirror.json', { layer: 2 });
  const below = domains.write('morph', 'below.json', { layer: 3 });

  assert.deepEqual(below.crystallized.sort(), ['above.json', 'below.json', 'mirror.json']);
  assert.equal(domains.morphLocked, true);
  assert.equal(domains.morphDepth, 0);
  assert.deepEqual(domains.list('morph'), []);
  assert.equal(domains.list('salt').length, 3);
  assert.equal(domains.read('salt', 'below.json')._verified, true);
  assert.equal(fs.statSync(path.join(root, 'salt', 'below.json')).mode & 0o777, 0o444);

  delete require.cache[domainsPath];
  const restored = require('../lib/domains');
  assert.equal(restored.morphLocked, true);
  assert.throws(() => restored.write('morph', 'blocked.json', {}), /MORPH LOCKED/);
  assert.equal(restored.approveDreamCycle(), true);
  assert.equal(restored.write('morph', 'above.json', { layer: 1, cycle: 2 }).metadata._morphName, 'ABOVE');
  restored.write('morph', 'mirror-2.json', { layer: 2, cycle: 2 });
  const secondBelow = restored.write('morph', 'below-2.json', { layer: 3, cycle: 2 });
  const versionedAbove = secondBelow.crystallized.find(name => name.startsWith('above.') && name.endsWith('.json'));
  assert.ok(versionedAbove, 'a colliding SALT name is content-addressed instead of discarded');
  assert.deepEqual(restored.read('salt', 'above.json').content, { layer: 1, cycle: 1 });
  assert.deepEqual(restored.read('salt', versionedAbove).content, { layer: 1, cycle: 2 });
  assert.deepEqual(restored.list('morph'), []);
});

test('crystallization preserves legacy root-level morph records', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-domains-legacy-'));
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

  const legacy = { layer: 1, domain: '.morph', status: 'SEALED' };
  fs.writeFileSync(path.join(root, 'morph', 'session.json'), JSON.stringify(legacy));
  domains.write('morph', 'above.json', { layer: 1 });
  domains.write('morph', 'mirror.json', { layer: 2 });
  const below = domains.write('morph', 'below.json', { layer: 3 });

  assert.equal(below.crystallized.length, 4);
  assert.deepEqual(domains.read('salt', 'session.json').content, legacy);
  assert.equal(domains.morphLocked, true);
});
