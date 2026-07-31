'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertSafeName,
  resolveContainedFile,
  resolveNamedFile,
  atomicWriteFileSync,
} = require('../lib/safe-path');

test('safe path accepts flat L7 names and rejects traversal', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-safe-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(assertSafeName('above-mirror_42'), 'above-mirror_42');
  assert.equal(resolveNamedFile(root, 'above-mirror_42', '.flow'), path.join(root, 'above-mirror_42.flow'));
  for (const name of ['../escape', 'nested/file', 'nested\\file', '/absolute', '..', ' bad']) {
    assert.throws(() => assertSafeName(name), error => error.code === 'L7_UNSAFE_PATH');
  }
});

test('safe path rejects a symlink at the resolved artifact location', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-safe-link-'));
  const outside = path.join(root, '..', `${path.basename(root)}-outside`);
  fs.writeFileSync(outside, 'secret');
  fs.symlinkSync(outside, path.join(root, 'linked.tool'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  });

  assert.throws(
    () => resolveContainedFile(root, 'linked.tool'),
    error => error.code === 'L7_UNSAFE_PATH',
  );
});

test('atomic writes leave no partial temporary file', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-atomic-write-'));
  const target = path.join(root, 'state.json');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  atomicWriteFileSync(target, '{"complete":true}');
  assert.equal(fs.readFileSync(target, 'utf8'), '{"complete":true}');
  assert.deepEqual(fs.readdirSync(root), ['state.json']);
});
