'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LocalContentStore, VpsContentStore, createMediaStore, sha256 } = require('../lib/media-storage');

test('local storage is content addressed and idempotent', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-media-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new LocalContentStore({ root });
  const first = await store.put(Buffer.from('same bytes'), { extension: 'txt', mediaType: 'text/plain' });
  const second = await store.put(Buffer.from('same bytes'), { extension: 'txt', mediaType: 'text/plain' });
  assert.equal(first.content_hash, sha256(Buffer.from('same bytes')));
  assert.equal(first.asset_uri, second.asset_uri);
  assert.equal(fs.readFileSync(first.object_path, 'utf8'), 'same bytes');
  assert.equal(fs.statSync(first.object_path).mode & 0o777, 0o444);
  const loaded = store.get(first.content_hash);
  assert.equal(loaded.bytes.toString('utf8'), 'same bytes');
  assert.equal(loaded.metadata.media_type, 'text/plain');
  assert.equal(store.get('f'.repeat(64)), null);
  assert.throws(() => store.get('../escape'), /invalid media asset hash/);
  const streamed = await store.open(first.content_hash, { start: 5, end: 9 });
  const chunks = [];
  for await (const chunk of streamed.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'bytes');
});

test('local storage preserves distinct append-only receipts for identical bytes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-media-receipts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new LocalContentStore({ root });
  const first = await store.put(Buffer.from('same bytes'), {
    extension: 'txt',
    mediaType: 'text/plain',
    receipt: { plan_id: 'plan-a', job_id: 'above' },
  });
  const second = await store.put(Buffer.from('same bytes'), {
    extension: 'txt',
    mediaType: 'text/plain',
    receipt: { plan_id: 'plan-b', job_id: 'mirror' },
  });

  assert.equal(first.content_hash, second.content_hash);
  assert.notEqual(first.receipt_id, second.receipt_id);
  const receiptDirectory = path.join(root, 'receipts', first.content_hash.slice(0, 2), first.content_hash);
  assert.equal(fs.readdirSync(receiptDirectory).length, 2);
});

test('VPS storage requires HTTPS outside loopback', () => {
  assert.throws(() => new VpsContentStore({ baseUrl: 'http://example.com', token: 'x', fetch: async () => {} }), /HTTPS/);
});

test('a VPS URL alone cannot activate remote storage', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avli-local-default-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousUrl = process.env.AVLI_MEDIA_STORAGE_URL;
  const previousBackend = process.env.AVLI_MEDIA_STORAGE;
  process.env.AVLI_MEDIA_STORAGE_URL = 'https://media.example.test';
  delete process.env.AVLI_MEDIA_STORAGE;
  try {
    assert.ok(createMediaStore({ root }) instanceof LocalContentStore);
  } finally {
    if (previousUrl === undefined) delete process.env.AVLI_MEDIA_STORAGE_URL;
    else process.env.AVLI_MEDIA_STORAGE_URL = previousUrl;
    if (previousBackend === undefined) delete process.env.AVLI_MEDIA_STORAGE;
    else process.env.AVLI_MEDIA_STORAGE = previousBackend;
  }
});

test('VPS storage sends a hash-addressed authenticated PUT', async () => {
  let request;
  const store = new VpsContentStore({
    baseUrl: 'https://media.avli.test',
    token: 'secret',
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ asset_uri: 'avli-vps://object' }) };
    },
  });
  const result = await store.put(Buffer.from('asset'), { extension: 'png', mediaType: 'image/png' });
  assert.match(request.url, new RegExp(`/objects/${sha256(Buffer.from('asset'))}$`));
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.headers.authorization, 'Bearer secret');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(result.asset_uri, 'avli-vps://object');
});

test('VPS storage verifies a returned content hash', async () => {
  const store = new VpsContentStore({
    baseUrl: 'https://media.avli.test',
    token: 'secret',
    fetch: async () => ({
      ok: true,
      json: async () => ({ content_hash: 'not-the-requested-hash' }),
    }),
  });
  await assert.rejects(() => store.put(Buffer.from('asset')), /mismatched content hash/);
});
