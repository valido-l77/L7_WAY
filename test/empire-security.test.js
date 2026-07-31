'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.EMPIRE_MAX_BODY_BYTES = '128';

const { server } = require('../empire/server');

let port;

function request(method, pathname, options = {}) {
  const body = options.body;
  const headers = { ...(options.headers || {}) };
  if (body !== undefined && headers['Content-Length'] === undefined) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('Empire API rejects untrusted browser origins', async () => {
  const response = await request('GET', '/api/flows', {
    headers: { Origin: 'https://evil.example' },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'Origin not allowed');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('Empire API never emits wildcard CORS for an approved local origin', async () => {
  const response = await request('GET', '/api/flows', {
    headers: { Origin: 'http://localhost:7377' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:7377');
  assert.notEqual(response.headers['access-control-allow-origin'], '*');
});

test('Empire rejects oversized JSON bodies before execution', async () => {
  const body = JSON.stringify({ tool: 'echo', params: { value: 'x'.repeat(200) } });
  const response = await request('POST', '/api/execute', {
    body,
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 413);
  assert.equal(response.body.code, 'PAYLOAD_TOO_LARGE');
});

test('Empire rejects flow path traversal', async () => {
  const response = await request('GET', '/api/flow?name=../../outside');

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VALIDATION_ERROR');
});
