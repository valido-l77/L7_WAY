'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { signCallback, verifyCallback, callbackHeaders } = require('../lib/callback-hmac');

const SECRET = 'callback-secret-for-tests';

test('callback HMAC signs and verifies a canonical JSON body', () => {
  const body = { job_id: 'job:abc', state: 'succeeded' };
  const signature = signCallback(body, SECRET);
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(verifyCallback(body, signature, SECRET), true);
  assert.equal(verifyCallback(body, 'aa'.repeat(32), SECRET), false);
});

test('callback headers never use an empty signature', () => {
  const body = { accepted: true };
  const headers = callbackHeaders(body, { secret: SECRET, keyId: 'callback:primary' });
  assert.equal(headers['x-l7-callback-key-id'], 'callback:primary');
  assert.equal(verifyCallback(body, headers['x-l7-callback-signature'], SECRET), true);
});
