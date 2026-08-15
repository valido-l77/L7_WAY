const net = require('net');
const crypto = require('crypto');

const DEFAULT_TOKEN_ENVS = ['L7_API_TOKEN', 'EMPIRE_API_TOKEN'];

function normalizeHost(host = '') {
  return String(host)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

function isLoopbackHost(host) {
  const h = normalizeHost(host);
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1' ||
    h.startsWith('127.')
  );
}

function isLoopbackAddress(address = '') {
  const addr = normalizeHost(address).replace(/^::ffff:/, '');
  if (isLoopbackHost(addr)) return true;
  return net.isIP(addr) === 4 && addr.startsWith('127.');
}

function parseOrigins(value = '') {
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function localOrigins(port) {
  return [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ];
}

function getToken(tokenEnv = DEFAULT_TOKEN_ENVS) {
  for (const name of tokenEnv) {
    if (process.env[name]) return process.env[name];
  }
  return '';
}

function requestToken(req) {
  const authorization = req?.headers?.authorization || '';
  const bearer = authorization.replace(/^Bearer\s+/i, '');
  return bearer || req?.headers?.['x-l7-token'] || '';
}

function tenantTokenEntries(value = process.env.L7_TENANT_TOKENS) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('L7_TENANT_TOKENS must be a JSON object mapping tenant IDs to tokens');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('L7_TENANT_TOKENS must be a JSON object mapping tenant IDs to tokens');
  }
  return Object.entries(parsed).filter(([tenantId, token]) => (
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(tenantId)
    && typeof token === 'string'
    && token.length > 0
  ));
}

function tokensEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) {
    return false;
  }
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function createHttpSecurity(options = {}) {
  const port = options.port;
  const tokenEnv = options.tokenEnv || DEFAULT_TOKEN_ENVS;
  const originEnv = options.originEnv || 'L7_CORS_ORIGINS';
  const configuredOrigins = parseOrigins(process.env[originEnv]);
  const allowedOrigins = new Set([
    ...localOrigins(port),
    ...configuredOrigins,
    ...(options.allowedOrigins || []),
  ]);

  function isOriginAllowed(origin) {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;

    try {
      const parsed = new URL(origin);
      return isLoopbackHost(parsed.hostname) && parsed.port === String(port);
    } catch {
      return false;
    }
  }

  function setCorsHeaders(req, res) {
    const origin = req?.headers?.origin;
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-L7-Token, X-L7-Request-Id, X-L7-Callback-Signature, X-L7-Callback-Key-Id');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  function handleOptions(req, res, options = {}) {
    setCorsHeaders(req, res);
    if (!isOriginAllowed(req.headers.origin)) {
      if (options.onReject) {
        options.onReject(403, 'Origin not allowed');
        return true;
      }
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }

  function isAuthorized(req) {
    const origin = req?.headers?.origin;
    if (origin && !isOriginAllowed(origin)) return false;

    const provided = requestToken(req);
    for (const [, tenantToken] of tenantTokenEntries()) {
      if (tokensEqual(provided, tenantToken)) return true;
    }

    const token = getToken(tokenEnv);
    if (!token) return isLoopbackAddress(req.socket?.remoteAddress);
    return tokensEqual(provided, token);
  }

  function principal(req) {
    if (!isAuthorized(req)) return null;
    const provided = requestToken(req);
    for (const [tenantId, tenantToken] of tenantTokenEntries()) {
      if (tokensEqual(provided, tenantToken)) {
        return { kind: 'tenant-service', tenantId };
      }
    }
    if (!provided && isLoopbackAddress(req.socket?.remoteAddress)) {
      return {
        kind: 'local',
        tenantId: process.env.L7_LOCAL_TENANT_ID || 'tenant:local',
      };
    }
    return {
      kind: 'service',
      tenantId: process.env.L7_API_TENANT_ID || null,
    };
  }

  function authorize(req, res, options = {}) {
    let authenticatedPrincipal;
    try {
      authenticatedPrincipal = principal(req);
    } catch {
      if (options.onReject) {
        options.onReject(500, 'Security configuration invalid');
        return false;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Security configuration invalid' }));
      return false;
    }
    if (authenticatedPrincipal) {
      req.l7Principal = authenticatedPrincipal;
      return true;
    }

    const origin = req?.headers?.origin;
    const token = getToken(tokenEnv);
    setCorsHeaders(req, res);
    const rejectedOrigin = Boolean(origin && !isOriginAllowed(origin));
    const status = rejectedOrigin ? 403 : token ? 401 : 403;
    const error = rejectedOrigin
      ? 'Origin not allowed'
      : token
      ? 'Unauthorized'
      : 'Remote API access requires L7_API_TOKEN or EMPIRE_API_TOKEN';
    if (options.onReject) {
      options.onReject(status, error);
      return false;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error }));
    return false;
  }

  function assertSafeBind(bind, serverName = 'L7 server') {
    if (isLoopbackHost(bind) || getToken(tokenEnv) || tenantTokenEntries().length > 0) return;
    throw new Error(`${serverName} refuses remote bind "${bind}" without L7_API_TOKEN or EMPIRE_API_TOKEN`);
  }

  return {
    authorize,
    assertSafeBind,
    handleOptions,
    isOriginAllowed,
    principal,
    setCorsHeaders,
  };
}

module.exports = {
  createHttpSecurity,
  isLoopbackAddress,
  isLoopbackHost,
  tokensEqual,
  tenantTokenEntries,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/http-security.js | Body-Hash: SHA-256:8daffb153a294115678e4cedb3c0ed3495a66fc4610316e98d0c4f17733a43ee
// Chain-Hash: SHA-256:4ad087d4dac3f30fae285965d2864771c95b0b79c63c335836e91dcf6a94d6e8 | Signed: 2026-07-20T00:35:47.291586+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 42 works. Verify: python3 provenance.py verify lib/http-security.js
// L7:PROVENANCE
