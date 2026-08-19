const test = require('node:test');
const assert = require('node:assert/strict');

const { createHttpSecurity, tokensEqual } = require('../lib/http-security');

function makeReq({ origin, remoteAddress = '127.0.0.1', authorization, token } = {}) {
  return {
    headers: {
      ...(origin ? { origin } : {}),
      ...(authorization ? { authorization } : {}),
      ...(token ? { 'x-l7-token': token } : {}),
    },
    socket: { remoteAddress },
  };
}

function makeRes() {
  return {
    headers: {},
    status: null,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('CORS echoes approved local origins instead of using a wildcard', () => {
  const security = createHttpSecurity({ port: 7377 });
  const res = makeRes();

  security.setCorsHeaders(makeReq({ origin: 'http://localhost:7377' }), res);

  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:7377');
  assert.notEqual(res.headers['access-control-allow-origin'], '*');
});

test('CORS rejects unrelated origins by omitting access-control-allow-origin', () => {
  const security = createHttpSecurity({ port: 7377 });
  const res = makeRes();

  security.setCorsHeaders(makeReq({ origin: 'https://example.com' }), res);

  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('disallowed browser origins cannot use loopback authorization', () => {
  const previousL7 = process.env.L7_API_TOKEN;
  const previousEmpire = process.env.EMPIRE_API_TOKEN;
  delete process.env.L7_API_TOKEN;
  delete process.env.EMPIRE_API_TOKEN;

  const security = createHttpSecurity({ port: 7377 });
  const res = makeRes();

  assert.equal(security.authorize(makeReq({ origin: 'https://evil.example' }), res), false);
  assert.equal(res.status, 403);
  assert.match(res.body, /Origin not allowed/);
  assert.equal(security.authorize(makeReq({ origin: 'http://localhost:7377' }), makeRes()), true);

  restoreEnv('L7_API_TOKEN', previousL7);
  restoreEnv('EMPIRE_API_TOKEN', previousEmpire);
});

test('remote API requests require a configured bearer token', () => {
  const previousL7 = process.env.L7_API_TOKEN;
  const previousEmpire = process.env.EMPIRE_API_TOKEN;
  delete process.env.L7_API_TOKEN;
  delete process.env.EMPIRE_API_TOKEN;

  const security = createHttpSecurity({ port: 7377 });
  const res = makeRes();

  assert.equal(security.authorize(makeReq({ remoteAddress: '192.0.2.10' }), res), false);
  assert.equal(res.status, 403);

  restoreEnv('L7_API_TOKEN', previousL7);
  restoreEnv('EMPIRE_API_TOKEN', previousEmpire);
});

test('configured bearer token authorizes remote API requests', () => {
  const previousL7 = process.env.L7_API_TOKEN;
  const previousEmpire = process.env.EMPIRE_API_TOKEN;
  process.env.L7_API_TOKEN = 'test-token';
  delete process.env.EMPIRE_API_TOKEN;

  const security = createHttpSecurity({ port: 7377 });
  const res = makeRes();
  const req = makeReq({
    remoteAddress: '192.0.2.10',
    authorization: 'Bearer test-token',
  });

  assert.equal(security.authorize(req, res), true);

  restoreEnv('L7_API_TOKEN', previousL7);
  restoreEnv('EMPIRE_API_TOKEN', previousEmpire);
});

test('tenant token maps authentication to a server-controlled tenant identity', () => {
  const previous = process.env.L7_TENANT_TOKENS;
  const previousDir = process.env.L7_DIR;
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-http-tenant-'));
  process.env.L7_DIR = root;
  process.env.L7_TENANT_TOKENS = JSON.stringify({ 'tenant:alpha': 'alpha-token' });
  try {
    const security = createHttpSecurity({ port: 7377 });
    const req = makeReq({
      remoteAddress: '192.0.2.10',
      authorization: 'Bearer alpha-token',
    });
    assert.equal(security.authorize(req, makeRes()), true);
    assert.equal(req.l7Principal.kind, 'tenant-service');
    assert.equal(req.l7Principal.tenantId, 'tenant:alpha');
    assert.equal(req.l7Principal.accountId, 'account:tenant:alpha');
    assert.equal(req.l7Principal.role, 'admin');
    assert.equal(req.l7Principal.workspaceId, 'workspace:tenant:alpha');
  } finally {
    restoreEnv('L7_TENANT_TOKENS', previous);
    restoreEnv('L7_DIR', previousDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loopback principal is the campaign admin for this workspace', () => {
  const previousL7 = process.env.L7_API_TOKEN;
  const previousEmpire = process.env.EMPIRE_API_TOKEN;
  const previousTenant = process.env.L7_LOCAL_TENANT_ID;
  const previousDir = process.env.L7_DIR;
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-http-local-'));
  delete process.env.L7_API_TOKEN;
  delete process.env.EMPIRE_API_TOKEN;
  process.env.L7_LOCAL_TENANT_ID = 'tenant:local';
  process.env.L7_DIR = root;
  try {
    const security = createHttpSecurity({ port: 7377 });
    const req = makeReq({ remoteAddress: '127.0.0.1' });
    assert.equal(security.authorize(req, makeRes()), true);
    assert.equal(req.l7Principal.kind, 'local');
    assert.equal(req.l7Principal.tenantId, 'tenant:local');
    assert.equal(req.l7Principal.accountId, 'account:local');
    assert.equal(req.l7Principal.role, 'admin');
    assert.equal(req.l7Principal.workspaceId, 'workspace:tenant:local');
  } finally {
    restoreEnv('L7_API_TOKEN', previousL7);
    restoreEnv('EMPIRE_API_TOKEN', previousEmpire);
    restoreEnv('L7_LOCAL_TENANT_ID', previousTenant);
    restoreEnv('L7_DIR', previousDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('account token maps to a named operator or admin inside a workspace', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createWorkspaceStore } = require('../lib/workspace-store');
  const previousAccounts = process.env.L7_ACCOUNT_TOKENS;
  const previousDir = process.env.L7_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-http-workspace-'));
  process.env.L7_DIR = root;
  process.env.L7_ACCOUNT_TOKENS = JSON.stringify({
    founder: 'founder-secret',
    editor: 'editor-secret',
  });
  try {
    createWorkspaceStore({ root: path.join(root, 'state', 'workspaces') }).save({
      workspace_id: 'workspace:avli-team',
      plan: 'team',
      tenant_id: 'tenant:team',
      members: [
        { account_id: 'account:founder', role: 'admin', token_id: 'founder' },
        { account_id: 'account:editor', role: 'operator', token_id: 'editor' },
      ],
      artifact_sha256: [],
    });
    const security = createHttpSecurity({ port: 7377 });
    const adminReq = makeReq({
      remoteAddress: '192.0.2.10',
      authorization: 'Bearer founder-secret',
    });
    assert.equal(security.authorize(adminReq, makeRes()), true);
    assert.equal(adminReq.l7Principal.kind, 'account');
    assert.equal(adminReq.l7Principal.accountId, 'account:founder');
    assert.equal(adminReq.l7Principal.role, 'admin');
    assert.equal(adminReq.l7Principal.workspaceId, 'workspace:avli-team');
    assert.equal(adminReq.l7Principal.tenantId, 'tenant:team');

    const operatorReq = makeReq({
      remoteAddress: '192.0.2.11',
      authorization: 'Bearer editor-secret',
    });
    assert.equal(security.authorize(operatorReq, makeRes()), true);
    assert.equal(operatorReq.l7Principal.accountId, 'account:editor');
    assert.equal(operatorReq.l7Principal.role, 'operator');
    assert.equal(operatorReq.l7Principal.workspaceId, 'workspace:avli-team');
  } finally {
    restoreEnv('L7_ACCOUNT_TOKENS', previousAccounts);
    restoreEnv('L7_DIR', previousDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid tenant-token configuration fails closed', () => {
  const previous = process.env.L7_TENANT_TOKENS;
  process.env.L7_TENANT_TOKENS = '{not-json';
  try {
    const security = createHttpSecurity({ port: 7377 });
    const res = makeRes();
    assert.equal(security.authorize(makeReq(), res), false);
    assert.equal(res.status, 500);
    assert.match(res.body, /configuration invalid/i);
  } finally {
    restoreEnv('L7_TENANT_TOKENS', previous);
  }
});

test('token comparison is exact and rejects missing or near-match values', () => {
  assert.equal(tokensEqual('test-token', 'test-token'), true);
  assert.equal(tokensEqual('test-token-x', 'test-token'), false);
  assert.equal(tokensEqual('', 'test-token'), false);
  assert.equal(tokensEqual(undefined, 'test-token'), false);
});

test('remote binds refuse to start without a token', () => {
  const previousL7 = process.env.L7_API_TOKEN;
  const previousEmpire = process.env.EMPIRE_API_TOKEN;
  delete process.env.L7_API_TOKEN;
  delete process.env.EMPIRE_API_TOKEN;
  const security = createHttpSecurity({ port: 7377 });

  assert.throws(
    () => security.assertSafeBind('0.0.0.0', 'test server'),
    /refuses remote bind/,
  );
  assert.doesNotThrow(() => security.assertSafeBind('127.0.0.1', 'test server'));

  restoreEnv('L7_API_TOKEN', previousL7);
  restoreEnv('EMPIRE_API_TOKEN', previousEmpire);
});
