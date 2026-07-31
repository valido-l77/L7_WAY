'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('generic domain operations cannot create or access a plaintext vault', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-vault-domain-'));
  const mount = path.join(root, 'mounted-vault');
  fs.mkdirSync(mount);
  const previousL7Dir = process.env.L7_DIR;
  const previousMount = process.env.L7_VAULT_MOUNT;
  process.env.L7_DIR = root;
  process.env.L7_VAULT_MOUNT = mount;

  const domainsPath = require.resolve('../lib/domains');
  const steelPath = require.resolve('../lib/steel');
  delete require.cache[domainsPath];
  delete require.cache[steelPath];
  const domains = require('../lib/domains');

  t.after(() => {
    delete require.cache[domainsPath];
    delete require.cache[steelPath];
    if (previousL7Dir === undefined) delete process.env.L7_DIR;
    else process.env.L7_DIR = previousL7Dir;
    if (previousMount === undefined) delete process.env.L7_VAULT_MOUNT;
    else process.env.L7_VAULT_MOUNT = previousMount;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const denied = error => error.code === 'L7_VAULT_ACCESS_REQUIRED';
  assert.throws(() => domains.write('vault', 'secret.json', { secret: true }), denied);
  assert.throws(() => domains.read('vault', 'secret.json'), denied);
  assert.throws(() => domains.list('vault'), denied);
  assert.throws(() => domains.remove('vault', 'secret.json'), denied);
  assert.throws(() => domains.transition('work', 'vault', 'secret.json'), denied);
  assert.deepEqual(fs.readdirSync(mount), []);
  assert.equal(fs.existsSync(path.join(root, 'vault')), false);
});
