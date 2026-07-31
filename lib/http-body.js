'use strict';

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

class HttpRequestError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'HttpRequestError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = true;
  }
}

function configuredBodyLimit(value, fallback = DEFAULT_MAX_BODY_BYTES) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isJsonContentType(value) {
  if (!value) return true; // Compatibility for existing local CLI clients.
  const mediaType = String(value).split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType);
}

function parseJsonBody(req, options = {}) {
  const maxBytes = configuredBodyLimit(options.maxBytes, DEFAULT_MAX_BODY_BYTES);
  const headers = req.headers || {};
  const contentType = headers['content-type'];
  const contentEncoding = String(headers['content-encoding'] || 'identity').toLowerCase();
  const declaredLength = headers['content-length'];

  if (!isJsonContentType(contentType)) {
    req.resume?.();
    return Promise.reject(new HttpRequestError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json',
    ));
  }
  if (contentEncoding !== 'identity') {
    req.resume?.();
    return Promise.reject(new HttpRequestError(
      415,
      'UNSUPPORTED_CONTENT_ENCODING',
      'Compressed request bodies are not supported',
    ));
  }
  if (declaredLength !== undefined) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      req.resume?.();
      return Promise.reject(new HttpRequestError(400, 'INVALID_CONTENT_LENGTH', 'Invalid Content-Length'));
    }
    if (length > maxBytes) {
      req.resume?.();
      return Promise.reject(new HttpRequestError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Request body exceeds ${maxBytes} bytes`,
      ));
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Keep draining the socket without retaining more attacker-controlled data.
      req.on('data', () => {});
      req.resume?.();
      reject(error);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > maxBytes) {
        fail(new HttpRequestError(
          413,
          'PAYLOAD_TOO_LARGE',
          `Request body exceeds ${maxBytes} bytes`,
        ));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const body = Buffer.concat(chunks, received).toString('utf8');
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpRequestError(400, 'INVALID_JSON', 'Invalid JSON body'));
      }
    };
    const onError = (error) => fail(error);
    const onAborted = () => fail(new HttpRequestError(400, 'REQUEST_ABORTED', 'Request body was aborted'));

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
}

function publicHttpError(error) {
  if (error instanceof HttpRequestError) {
    return { status: error.statusCode, body: { error: error.message, code: error.code } };
  }
  if (error?.code === 'L7_UNSAFE_PATH') {
    return { status: 400, body: { error: error.message, code: 'VALIDATION_ERROR' } };
  }
  if (error?.code === 'L7_VAULT_ACCESS_REQUIRED') {
    return { status: 403, body: { error: error.message, code: 'AUTHORIZATION_DENIED' } };
  }
  if (error?.code === 'L7_TIMEOUT') {
    return { status: 504, body: { error: error.message, code: 'TIMEOUT' } };
  }
  if (error?.code === 'L7_CANCELLED') {
    return { status: 409, body: { error: error.message, code: 'CANCELLED' } };
  }
  if (error?.code === 'L7_CONFLICT') {
    return { status: 409, body: { error: error.message, code: 'CONFLICT' } };
  }
  if (error?.code === 'L7_VALIDATION_ERROR') {
    return { status: 400, body: { error: error.message, code: 'VALIDATION_ERROR' } };
  }
  if (error?.code === 'L7_NOT_FOUND') {
    return { status: 404, body: { error: error.message, code: 'NOT_FOUND' } };
  }
  if (error?.code === 'L7_INTEGRITY_VIOLATION') {
    return { status: 500, body: { error: 'Registry integrity violation', code: 'INTEGRITY_VIOLATION' } };
  }
  return {
    status: 500,
    body: { error: 'Internal server error', code: 'INTERNAL_ERROR' },
  };
}

module.exports = {
  DEFAULT_MAX_BODY_BYTES,
  HttpRequestError,
  configuredBodyLimit,
  isJsonContentType,
  parseJsonBody,
  publicHttpError,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/http-body.js | Body-Hash: SHA-256:40efbbb377e4f97e87072dc42a122da3b7d153a6c94184e3ccf5223c7943cac1
// Chain-Hash: SHA-256:669cbf1fdc48c8b98a947bd41198935b7d27e62b6ac41613cfe9ca0cdfb72f39 | Signed: 2026-07-28T15:51:22.796846+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 71 works. Verify: python3 provenance.py verify lib/http-body.js
