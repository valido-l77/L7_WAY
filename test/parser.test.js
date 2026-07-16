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

// ─── Hardening: parse errors and unknown types ──────────────────────────────
test('parseFile throws a clear "File not found" error for a missing file', () => {
  assert.throws(
    () => parser.parseFile(path.join(FIXTURE_DIR, 'nonexistent.tool')),
    /File not found/,
  );
});

test('parseFile throws a descriptive "Invalid YAML" error for malformed content', () => {
  const badPath = path.join(FIXTURE_DIR, 'malformed.tool');
  fs.writeFileSync(badPath, 'name: broken\ndoes: [unterminated\n');
  assert.throws(() => parser.parseFile(badPath), /Invalid YAML/);
});

test('validate rejects an undetectable type instead of defaulting to the tool validator', () => {
  // A well-formed tool object must NOT validate true when the type is unknown —
  // otherwise detectType() returning null silently tool-validates anything.
  const wellFormedTool = { name: 'x', does: 'analyze', server: 's' };
  const result = parser.validate(wellFormedTool, null);
  assert.equal(result.valid, false);
  assert.match(result.errors[0].message, /unknown L7 type/i);
});

test('CLI validate reports a clean error (no stack trace) for malformed YAML', () => {
  const { execFileSync } = require('node:child_process');
  const badPath = path.join(FIXTURE_DIR, 'cli-malformed.tool');
  fs.writeFileSync(badPath, 'name: broken\ndoes: [unterminated\n');
  const cli = path.join(__dirname, '..', 'lib', 'parser.js');

  let code = 0;
  let output = '';
  try {
    execFileSync('node', [cli, 'validate', badPath], { encoding: 'utf8' });
  } catch (err) {
    code = err.status;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }

  assert.equal(code, 1, 'exits non-zero');
  assert.match(output, /Invalid YAML/, 'reports a friendly parse error');
  assert.doesNotMatch(output, /\n\s+at .+\(.*:\d+:\d+\)/, 'no JS stack trace leaks');
});

test.after(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
