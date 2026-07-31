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
  process.env.L7_TENANT_TOKENS = JSON.stringify({ 'tenant:alpha': 'alpha-token' });
  try {
    const security = createHttpSecurity({ port: 7377 });
    const req = makeReq({
      remoteAddress: '192.0.2.10',
      authorization: 'Bearer alpha-token',
    });
    assert.equal(security.authorize(req, makeRes()), true);
    assert.deepEqual(req.l7Principal, { kind: 'tenant-service', tenantId: 'tenant:alpha' });
  } finally {
    restoreEnv('L7_TENANT_TOKENS', previous);
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
