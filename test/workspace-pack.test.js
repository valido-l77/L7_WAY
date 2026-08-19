'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStoreZip } = require('../lib/workspace-pack');

test('store-only zip includes campaign.txt and asset bytes without compression deps', () => {
  const zip = buildStoreZip([
    { name: 'campaign.txt', bytes: Buffer.from('Make the campaign.\n') },
    { name: 'campaign-local-draft-01.txt', bytes: Buffer.from('a line of copy') },
  ]);
  assert.ok(Buffer.isBuffer(zip));
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304');
  const asString = zip.toString('binary');
  assert.match(asString, /campaign\.txt/);
  assert.match(asString, /campaign-local-draft-01\.txt/);
  assert.match(zip.toString('utf8'), /Make the campaign/);
  assert.match(zip.toString('utf8'), /a line of copy/);
});
