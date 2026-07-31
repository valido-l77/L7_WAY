'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-state-security-'));
process.env.L7_DIR = ROOT;
const state = require('../lib/state');

test('state filenames cannot escape through flow names or execution IDs', () => {
  assert.throws(() => state.create('../escaped', {}), /Flow name must not contain path separators/);
  assert.throws(() => state.load('flow', '../escaped'), /Execution ID must not contain path separators/);
  assert.throws(() => state.remove('../flow', 'abc'), /Flow name must not contain path separators/);
  assert.equal(fs.existsSync(path.join(ROOT, 'escaped.state')), false);
});

test('state saves publish complete JSON through atomic replacement', () => {
  const created = state.create('safe-flow', { value: 1 });
  created.results.answer = 42;
  state.save(created);

  const loaded = state.load('safe-flow', created.id);
  assert.equal(loaded.results.answer, 42);
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'state')).filter(name => name.endsWith('.tmp')),
    [],
  );
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
