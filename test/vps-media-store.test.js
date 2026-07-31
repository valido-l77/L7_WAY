'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256 } = require('../lib/media-storage');
const { createMediaStoreServer } = require('../vps/avli-media-store');

test('VPS receiver authenticates, verifies, stores, and retrieves immutable objects', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-vps-'));
  const server = createMediaStoreServer({ root, token: 'test-secret', publicBase: 'https://media.test' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const bytes = Buffer.from('immutable media');
  const hash = sha256(bytes);
  const headers = {
    authorization: 'Bearer test-secret',
    'content-type': 'image/png',
    'x-avli-extension': 'png',
    'x-avli-sha256': hash,
  };

  const unauthorized = await fetch(`${base}/objects/${hash}`, { method: 'PUT', body: bytes, headers: { ...headers, authorization: '' } });
  assert.equal(unauthorized.status, 401);

  const stored = await fetch(`${base}/objects/${hash}`, { method: 'PUT', body: bytes, headers });
  assert.equal(stored.status, 201);
  assert.equal((await stored.json()).content_hash, hash);

  const retrieved = await fetch(`${base}/objects/${hash}`, { headers: { authorization: 'Bearer test-secret' } });
  assert.equal(retrieved.status, 200);
  assert.equal(Buffer.from(await retrieved.arrayBuffer()).toString(), 'immutable media');
  assert.equal(retrieved.headers.get('etag'), `"sha256-${hash}"`);
});

test('VPS receiver rejects bytes that do not match their address', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-vps-bad-'));
  const server = createMediaStoreServer({ root, token: 'test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const claimed = sha256(Buffer.from('claimed'));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/objects/${claimed}`, {
    method: 'PUT',
    body: Buffer.from('different'),
    headers: { authorization: 'Bearer test-secret', 'x-avli-sha256': claimed },
  });
  assert.equal(response.status, 422);
});
