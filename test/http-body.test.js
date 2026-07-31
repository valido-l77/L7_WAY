'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  parseJsonBody,
  publicHttpError,
} = require('../lib/http-body');

function request(headers = {}) {
  const stream = new PassThrough();
  stream.headers = headers;
  return stream;
}

test('JSON body parser preserves structured values within its byte budget', async () => {
  const req = request({ 'content-type': 'application/json; charset=utf-8' });
  const parsed = parseJsonBody(req, { maxBytes: 128 });
  req.end('{"count":3,"enabled":true}');
  assert.deepEqual(await parsed, { count: 3, enabled: true });
});

test('JSON body parser rejects an oversized declared body before buffering', async () => {
  const req = request({
    'content-type': 'application/json',
    'content-length': '1000',
  });
  await assert.rejects(
    parseJsonBody(req, { maxBytes: 64 }),
    error => error.statusCode === 413 && error.code === 'PAYLOAD_TOO_LARGE',
  );
});

test('JSON body parser stops retaining an undeclared body after its limit', async () => {
  const req = request({ 'content-type': 'application/json' });
  const parsed = parseJsonBody(req, { maxBytes: 8 });
  req.end('{"too":"large"}');
  await assert.rejects(
    parsed,
    error => error.statusCode === 413 && error.code === 'PAYLOAD_TOO_LARGE',
  );
});

test('JSON body parser returns typed client errors for malformed JSON and media types', async () => {
  const malformed = request({ 'content-type': 'application/json' });
  const malformedResult = parseJsonBody(malformed);
  malformed.end('{broken');
  await assert.rejects(malformedResult, error => error.statusCode === 400 && error.code === 'INVALID_JSON');

  const text = request({ 'content-type': 'text/plain' });
  await assert.rejects(
    parseJsonBody(text),
    error => error.statusCode === 415 && error.code === 'UNSUPPORTED_MEDIA_TYPE',
  );
});

test('unexpected server errors are not disclosed to API clients', () => {
  assert.deepEqual(publicHttpError(new Error('database path and secret')), {
    status: 500,
    body: { error: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
});

test('vault broker requirements map to an explicit authorization response', () => {
  const error = new Error('Vault read requires biometric intent');
  error.code = 'L7_VAULT_ACCESS_REQUIRED';
  assert.deepEqual(publicHttpError(error), {
    status: 403,
    body: { error: error.message, code: 'AUTHORIZATION_DENIED' },
  });
});

test('gateway timeouts and missing tools map to public HTTP status codes', () => {
  const timeout = Object.assign(new Error('tool timed out'), { code: 'L7_TIMEOUT' });
  const missing = Object.assign(new Error('unknown tool'), { code: 'L7_NOT_FOUND' });

  assert.deepEqual(publicHttpError(timeout), {
    status: 504,
    body: { error: 'tool timed out', code: 'TIMEOUT' },
  });
  assert.deepEqual(publicHttpError(missing), {
    status: 404,
    body: { error: 'unknown tool', code: 'NOT_FOUND' },
  });
});
