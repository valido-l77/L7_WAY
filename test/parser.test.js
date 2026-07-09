const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// lib/parser.js reads L7_DIR at module-load time, so point it at a throwaway
// fixture directory *before* requiring the module — never touch the real ~/.l7.
const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-parser-test-'));
process.env.L7_DIR = FIXTURE_DIR;

const parser = require('../lib/parser');

test('parseFile parses a .tool YAML file', () => {
  const toolPath = path.join(FIXTURE_DIR, 'sample.tool');
  fs.writeFileSync(toolPath, [
    'name: sample_tool',
    'does: analyze',
    'server: test-server',
  ].join('\n'));

  const obj = parser.parseFile(toolPath);
  assert.equal(obj.name, 'sample_tool');
  assert.equal(obj.does, 'analyze');
  assert.equal(obj.server, 'test-server');
});

test('validate accepts a well-formed tool', () => {
  const result = parser.validate(
    { name: 'sample_tool', does: 'analyze', server: 'test-server' },
    'tool'
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validate rejects a tool missing required fields', () => {
  const result = parser.validate({ name: 'sample_tool' }, 'tool');
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validate accepts a well-formed flow', () => {
  const result = parser.validate(
    { name: 'sample-flow', steps: [{ do: 'sample_tool', as: 'result' }] },
    'flow'
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('detectType infers type from extension', () => {
  assert.equal(parser.detectType('x.flow', {}), 'flow');
  assert.equal(parser.detectType('x.tool', {}), 'tool');
  assert.equal(parser.detectType('x.l7', { steps: [] }), 'flow');
  assert.equal(parser.detectType('x.l7', { does: 'analyze' }), 'tool');
  assert.equal(parser.detectType('x.txt', {}), null);
});

test('parseLegacyL7 parses key/value, sections, booleans, and lists', () => {
  const content = [
    'name: legacy_tool',
    'active: yes',
    'disabled: no',
    'retries: 3',
    'tags: alpha, beta, gamma',
    'meta:',
    'owner: philosopher',
  ].join('\n');

  const obj = parser.parseLegacyL7(content);
  assert.equal(obj.name, 'legacy_tool');
  assert.equal(obj.active, true);
  assert.equal(obj.disabled, false);
  assert.equal(obj.retries, 3);
  assert.deepEqual(obj.tags, ['alpha', 'beta', 'gamma']);
  assert.equal(obj.meta.owner, 'philosopher');
});

test('listFiles finds .tool files under L7_DIR/tools', () => {
  const toolsDir = path.join(FIXTURE_DIR, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'a.tool'), 'name: a\ndoes: analyze\nserver: s\n');
  fs.writeFileSync(path.join(toolsDir, 'b.tool'), 'name: b\ndoes: analyze\nserver: s\n');

  const files = parser.listFiles('tool');
  const names = files.map(f => f.name).sort();
  assert.deepEqual(names, ['a', 'b']);
});

test.after(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
