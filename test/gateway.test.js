const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// gateway.js reads L7_DIR and L7_MODE at module-load time, so set them *before*
// requiring it. Unlike the executor tests (which stub the gateway), these load
// the REAL gateway — that is safe because requiring the module never calls
// boot(), so no heartbeat/pulse timer is started and the process exits cleanly.
// L7_MODE=mock keeps execute() off real MCP transport.
const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-gateway-test-'));
process.env.L7_DIR = FIXTURE_DIR;
process.env.L7_MODE = 'mock';

const TOOLS_DIR = path.join(FIXTURE_DIR, 'tools');
fs.mkdirSync(TOOLS_DIR, { recursive: true });

const gateway = require('../lib/gateway');

// Silence any narration so the TAP stream stays clean.
const origLog = console.log;
console.log = () => {};

function writeTool(name, body) {
  fs.writeFileSync(path.join(TOOLS_DIR, `${name}.tool`), body);
}

// ─── normalizeResult — the {ok, ...} normalization contract ──────────────────
test('normalizeResult treats null/undefined as an empty success', () => {
  assert.deepEqual(gateway.normalizeResult(null), { ok: true });
  assert.deepEqual(gateway.normalizeResult(undefined), { ok: true });
});

test('normalizeResult wraps primitives under `result`', () => {
  assert.deepEqual(gateway.normalizeResult('hi'), { ok: true, result: 'hi' });
  assert.deepEqual(gateway.normalizeResult(42), { ok: true, result: 42 });
});

test('normalizeResult parses JSON out of an MCP text content block', () => {
  const mcp = { content: [{ type: 'text', text: '{"greeting":"hello","n":3}' }] };
  assert.deepEqual(gateway.normalizeResult(mcp), { ok: true, greeting: 'hello', n: 3 });
});

test('normalizeResult falls back to raw text when the content block is not JSON', () => {
  const mcp = { content: [{ type: 'text', text: 'not json' }] };
  assert.deepEqual(gateway.normalizeResult(mcp), { ok: true, result: 'not json' });
});

test('normalizeResult passes through a content array with no text block', () => {
  const mcp = { content: [{ type: 'image', data: 'xyz' }] };
  assert.deepEqual(gateway.normalizeResult(mcp), {
    ok: true,
    content: [{ type: 'image', data: 'xyz' }],
  });
});

test('normalizeResult preserves a result that already declares ok (does not clobber failures)', () => {
  const failure = { ok: false, error: 'boom' };
  const out = gateway.normalizeResult(failure);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'boom');
});

test('normalizeResult marks an ok-less object as success', () => {
  assert.deepEqual(gateway.normalizeResult({ foo: 'bar' }), { ok: true, foo: 'bar' });
});

// ─── executeViaMock ──────────────────────────────────────────────────────────
test('executeViaMock echoes the tool name and params in a success envelope', () => {
  assert.deepEqual(gateway.executeViaMock('emailer', { to: 'a@x' }), {
    ok: true,
    mock: true,
    tool: 'emailer',
    params: { to: 'a@x' },
  });
});

// ─── loadTool ────────────────────────────────────────────────────────────────
test('loadTool returns null for a missing tool file', () => {
  assert.equal(gateway.loadTool('does-not-exist'), null);
});

test('loadTool parses a .tool file from L7_DIR/tools', () => {
  writeTool('greeter', 'name: greeter\ndoes: greet\nserver: test-server\n');
  const tool = gateway.loadTool('greeter');
  assert.equal(tool.name, 'greeter');
  assert.equal(tool.does, 'greet');
  assert.equal(tool.server, 'test-server');
});

test('loadTool caches by name — a loaded tool survives deletion of its file', () => {
  writeTool('cached', 'name: cached\ndoes: x\nserver: s\n');
  const first = gateway.loadTool('cached');
  assert.equal(first.name, 'cached');

  fs.unlinkSync(path.join(TOOLS_DIR, 'cached.tool'));
  const second = gateway.loadTool('cached');
  assert.ok(second, 'cached tool is still returned after the file is gone');
  assert.equal(second.name, 'cached');
});

// ─── execute — the primary entry point (mock mode) ───────────────────────────
test('execute returns a mock envelope for an unknown tool in mock mode', async () => {
  const out = await gateway.execute('ghost', { p: 1 }, { mode: 'mock' });
  assert.deepEqual(out, { ok: true, mock: true, tool: 'ghost', params: { p: 1 } });
});

test('execute throws for an unknown tool when not in mock mode', async () => {
  await assert.rejects(
    () => gateway.execute('ghost', {}, { mode: 'mcp' }),
    /Unknown tool: ghost/,
  );
});

test('execute runs the full mock pipeline for a known tool', async () => {
  writeTool('notifier', 'name: notifier\ndoes: notify\nserver: test-server\n');
  const out = await gateway.execute('notifier', { msg: 'hi' }, { mode: 'mock' });
  assert.equal(out.ok, true);
  assert.equal(out.mock, true);
  assert.equal(out.tool, 'notifier');
});

test('execute writes a tool_execution audit entry for a known tool', async () => {
  writeTool('audited', 'name: audited\ndoes: act\nserver: test-server\n');
  await gateway.execute('audited', { x: 1 }, { mode: 'mock' });

  const auditLog = fs.readFileSync(path.join(FIXTURE_DIR, 'audit.log'), 'utf8');
  const entries = auditLog.trim().split('\n').map((l) => JSON.parse(l));
  const mine = entries.find((e) => e.type === 'tool_execution' && e.tool === 'audited');
  assert.ok(mine, 'an audit entry for the executed tool was recorded');
  assert.equal(mine.ok, true);
});

test('execute with tool.audit === false suppresses the tool_execution entry only', async () => {
  writeTool('silent', 'name: silent\ndoes: act\nserver: test-server\naudit: false\n');
  await gateway.execute('silent', { x: 1 }, { mode: 'mock' });

  const entries = fs
    .readFileSync(path.join(FIXTURE_DIR, 'audit.log'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .filter((e) => e.tool === 'silent');

  // The action-trail entry (self.recordAction) is always written; only the
  // gated tool_execution audit entry is suppressed by audit: false.
  assert.ok(
    entries.some((e) => e.type === 'action'),
    'the action-trail entry is still recorded',
  );
  assert.ok(
    !entries.some((e) => e.type === 'tool_execution'),
    'the gated tool_execution audit entry is suppressed',
  );
});

test.after(() => {
  console.log = origLog;
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});
